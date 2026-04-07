import type {
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  DtlsParameters,
  RtpParameters,
  MediaKind,
} from "mediasoup/types";
import { buildConfig } from "./mediasoup-config.js";

const MAX_CAMERA_PRODUCERS = 2;

interface PeerTransport {
  transport: WebRtcTransport;
  peerId: string;
}

export class Room {
  readonly roomId: string;
  private readonly router: Router;
  private transports: Map<string, PeerTransport> = new Map();
  private producers: Map<string, Producer> = new Map();
  private consumers: Map<string, Consumer> = new Map();

  constructor(roomId: string, router: Router) {
    this.roomId = roomId;
    this.router = router;
  }

  async createWebRtcTransport(peerId: string): Promise<{
    id: string;
    iceParameters: WebRtcTransport["iceParameters"];
    iceCandidates: WebRtcTransport["iceCandidates"];
    dtlsParameters: WebRtcTransport["dtlsParameters"];
  }> {
    const config = buildConfig();
    const transport = await this.router.createWebRtcTransport(
      config.webRtcTransport
    );

    transport.on("dtlsstatechange", (dtlsState: string) => {
      if (dtlsState === "closed") {
        transport.close();
      }
    });

    transport.on("@close", () => {
      this.transports.delete(transport.id);
    });

    this.transports.set(transport.id, { transport, peerId });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(
    peerId: string,
    transportId: string,
    dtlsParameters: DtlsParameters
  ): Promise<void> {
    const entry = this.transports.get(transportId);
    if (!entry) {
      throw new Error(`Transport ${transportId} not found`);
    }
    if (entry.peerId !== peerId) {
      throw new Error(`Transport ${transportId} does not belong to peer ${peerId}`);
    }
    await entry.transport.connect({ dtlsParameters });
  }

  async produce(
    peerId: string,
    transportId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters
  ): Promise<{ id: string }> {
    const entry = this.transports.get(transportId);
    if (!entry) {
      throw new Error(`Transport ${transportId} not found`);
    }
    if (entry.peerId !== peerId) {
      throw new Error(`Transport ${transportId} does not belong to peer ${peerId}`);
    }

    if (kind === "video") {
      const videoProducers = Array.from(this.producers.values()).filter(
        (p) => p.kind === "video"
      );
      if (videoProducers.length >= MAX_CAMERA_PRODUCERS) {
        throw new Error(
          `Room ${this.roomId} already has ${MAX_CAMERA_PRODUCERS} video producers`
        );
      }
    }

    const producer = await entry.transport.produce({ kind, rtpParameters });

    producer.on("transportclose", () => {
      this.producers.delete(producer.id);
    });

    this.producers.set(producer.id, producer);
    return { id: producer.id };
  }

  async consume(
    peerId: string,
    transportId: string,
    producerId: string
  ): Promise<{
    id: string;
    producerId: string;
    kind: MediaKind;
    rtpParameters: RtpParameters;
  }> {
    const entry = this.transports.get(transportId);
    if (!entry) {
      throw new Error(`Transport ${transportId} not found`);
    }
    if (entry.peerId !== peerId) {
      throw new Error(`Transport ${transportId} does not belong to peer ${peerId}`);
    }

    const producer = this.producers.get(producerId);
    if (!producer) {
      throw new Error(`Producer ${producerId} not found`);
    }

    if (!this.router.canConsume({ producerId, rtpCapabilities: this.router.rtpCapabilities })) {
      throw new Error(`Router cannot consume producer ${producerId}`);
    }

    const consumer = await entry.transport.consume({
      producerId,
      rtpCapabilities: this.router.rtpCapabilities,
      paused: false,
    });

    consumer.on("transportclose", () => {
      this.consumers.delete(consumer.id);
    });

    consumer.on("producerclose", () => {
      this.consumers.delete(consumer.id);
    });

    this.consumers.set(consumer.id, consumer);

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  getProducerIds(): string[] {
    return Array.from(this.producers.keys());
  }

  getProducersByKind(kind: MediaKind): Producer[] {
    return Array.from(this.producers.values()).filter((p) => p.kind === kind);
  }

  getPeerCount(): number {
    const peers = new Set(Array.from(this.transports.values()).map((e) => e.peerId));
    return peers.size;
  }

  close(): void {
    for (const { transport } of this.transports.values()) {
      transport.close();
    }
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
  }
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private router: Router;

  constructor(router: Router) {
    this.router = router;
  }

  getOrCreate(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room(roomId, this.router);
      this.rooms.set(roomId, room);
      console.log(`Room created: ${roomId}`);
    }
    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  cleanup(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room && room.getPeerCount() === 0) {
      room.close();
      this.rooms.delete(roomId);
      console.log(`Room closed: ${roomId}`);
    }
  }

  closeAll(): void {
    for (const [id, room] of this.rooms) {
      room.close();
      this.rooms.delete(id);
    }
  }
}
