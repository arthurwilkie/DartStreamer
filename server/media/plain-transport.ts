import type { Router, PlainTransport, Consumer, MediaKind } from "mediasoup/types";
import { Room } from "./room.js";

// Port assignments per camera and media kind
const PORT_MAP: Record<string, number> = {
  "video-0": 5004,
  "audio-0": 5005,
  "video-1": 5006,
  "audio-1": 5007,
};

interface BridgeEntry {
  transport: PlainTransport;
  consumer: Consumer;
}

export class PlainTransportBridge {
  private readonly router: Router;
  private bridges: BridgeEntry[] = [];

  constructor(router: Router) {
    this.router = router;
  }

  async bridgeProducer(
    producerId: string,
    kind: MediaKind,
    port: number
  ): Promise<void> {
    const transport = await this.router.createPlainTransport({
      listenInfo: {
        protocol: "udp",
        ip: "127.0.0.1",
      },
      rtcpMux: true,
      comedia: false,
    });

    await transport.connect({
      ip: "127.0.0.1",
      port,
    });

    if (!this.router.canConsume({
      producerId,
      rtpCapabilities: this.router.rtpCapabilities,
    })) {
      throw new Error(`Router cannot consume producer ${producerId}`);
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities: this.router.rtpCapabilities,
      paused: false,
    });

    consumer.on("transportclose", () => {
      this.bridges = this.bridges.filter((b) => b.consumer !== consumer);
    });

    consumer.on("producerclose", () => {
      consumer.close();
      this.bridges = this.bridges.filter((b) => b.consumer !== consumer);
    });

    this.bridges.push({ transport, consumer });
    console.log(
      `PlainTransport bridge: producer ${producerId} (${kind}) → 127.0.0.1:${port}`
    );
  }

  async bridgeRoom(room: Room): Promise<void> {
    const videoProducers = room.getProducersByKind("video");
    const audioProducers = room.getProducersByKind("audio");

    // Bridge video producers (up to 2 cameras)
    for (let i = 0; i < videoProducers.length && i < 2; i++) {
      const port = PORT_MAP[`video-${i}`];
      await this.bridgeProducer(videoProducers[i].id, "video", port);
    }

    // Bridge audio producers (up to 2 cameras)
    for (let i = 0; i < audioProducers.length && i < 2; i++) {
      const port = PORT_MAP[`audio-${i}`];
      await this.bridgeProducer(audioProducers[i].id, "audio", port);
    }
  }

  close(): void {
    for (const { transport, consumer } of this.bridges) {
      consumer.close();
      transport.close();
    }
    this.bridges = [];
    console.log("PlainTransportBridge: all bridges closed");
  }
}
