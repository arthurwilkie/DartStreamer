import { MediSoupClient } from "./mediasoup-client";

export class ConsumeManager {
  private client: MediSoupClient;
  onNewTrack?: (producerId: string, track: MediaStreamTrack) => void;

  constructor(client: MediSoupClient) {
    this.client = client;

    this.client.on("track", (track) => {
      // When the client emits a track from a new producer, surface it via callback
      if (this.onNewTrack) {
        this.onNewTrack("unknown", track);
      }
    });
  }

  async consumeAll(): Promise<Map<string, MediaStreamTrack>> {
    const tracks = new Map<string, MediaStreamTrack>();

    // Ask the server for all currently available producers
    // The server is expected to accept a "getProducers" message and return an array of ids
    // This relies on the WebSocket connection already being open via client.connect()
    let producerIds: string[] = [];
    try {
      // Access internal send via the public consume path: first get producer list
      // We use a small cast trick since getProducers is a server-defined message
      const result = await (
        this.client as unknown as {
          sendRequest: (type: string, data?: unknown) => Promise<unknown>;
        }
      ).sendRequest("getProducers");
      producerIds = result as string[];
    } catch {
      // Server may not support getProducers; return empty map
      return tracks;
    }

    await Promise.all(
      producerIds.map(async (producerId) => {
        try {
          const track = await this.client.consume(producerId);
          tracks.set(producerId, track);
          if (this.onNewTrack) {
            this.onNewTrack(producerId, track);
          }
        } catch {
          // Skip producers that fail to consume
        }
      })
    );

    return tracks;
  }
}
