type ConnectionStatus = "connected" | "disconnected";

type MediSoupEventMap = {
  connected: void;
  disconnected: void;
  track: MediaStreamTrack;
};

type MediSoupEventListener<K extends keyof MediSoupEventMap> = (
  payload: MediSoupEventMap[K]
) => void;

interface RtpCapabilities {
  codecs?: unknown[];
  headerExtensions?: unknown[];
}

interface TransportOptions {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: unknown;
}

interface ServerMessage {
  type: string;
  data?: unknown;
  id?: string;
}

export class MediSoupClient {
  private signalingUrl: string;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "disconnected";
  private pendingRequests = new Map<
    string,
    { resolve: (data: unknown) => void; reject: (err: Error) => void }
  >();
  private listeners: {
    [K in keyof MediSoupEventMap]?: Set<MediSoupEventListener<K>>;
  } = {};
  // Transports are stored as opaque objects since mediasoup-client is not installed
  private sendTransport: unknown = null;
  private recvTransport: unknown = null;
  private device: unknown = null;

  constructor(signalingUrl: string) {
    this.signalingUrl = signalingUrl;
  }

  on<K extends keyof MediSoupEventMap>(
    event: K,
    listener: MediSoupEventListener<K>
  ): void {
    if (!this.listeners[event]) {
      (this.listeners as Record<string, Set<unknown>>)[event] = new Set();
    }
    (this.listeners[event] as Set<MediSoupEventListener<K>>).add(listener);
  }

  off<K extends keyof MediSoupEventMap>(
    event: K,
    listener: MediSoupEventListener<K>
  ): void {
    (this.listeners[event] as Set<MediSoupEventListener<K>> | undefined)?.delete(
      listener
    );
  }

  private emit<K extends keyof MediSoupEventMap>(
    event: K,
    payload: MediSoupEventMap[K]
  ): void {
    (this.listeners[event] as Set<MediSoupEventListener<K>> | undefined)?.forEach(
      (l) => l(payload)
    );
  }

  private generateRequestId(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  private sendRequest(type: string, data?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }
      const id = this.generateRequestId();
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ type, id, data }));
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.signalingUrl);

      this.ws.onopen = async () => {
        try {
          const rtpCapabilities = (await this.sendRequest(
            "getRouterRtpCapabilities"
          )) as RtpCapabilities;

          // mediasoup-client Device.load would go here when the package is installed
          this.device = { rtpCapabilities };

          this.status = "connected";
          this.emit("connected", undefined as void);
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      this.ws.onmessage = (event: MessageEvent<string>) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }

        if (msg.id && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          pending.resolve(msg.data);
        }
      };

      this.ws.onerror = () => {
        reject(new Error("WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        this.status = "disconnected";
        this.emit("disconnected", undefined as void);
      };
    });
  }

  async produce(track: MediaStreamTrack): Promise<string> {
    const transportOptions = (await this.sendRequest("createTransport", {
      direction: "send",
    })) as TransportOptions;

    // Store transport options; actual mediasoup-client Transport would be created here
    this.sendTransport = transportOptions;

    await this.sendRequest("connectTransport", {
      transportId: transportOptions.id,
      dtlsParameters: transportOptions.dtlsParameters,
    });

    const result = (await this.sendRequest("produce", {
      transportId: transportOptions.id,
      kind: track.kind,
      rtpParameters: {},
    })) as { producerId: string };

    return result.producerId;
  }

  async consume(producerId: string): Promise<MediaStreamTrack> {
    const transportOptions = (await this.sendRequest("createTransport", {
      direction: "recv",
    })) as TransportOptions;

    this.recvTransport = transportOptions;

    await this.sendRequest("connectTransport", {
      transportId: transportOptions.id,
      dtlsParameters: transportOptions.dtlsParameters,
    });

    await this.sendRequest("consume", {
      transportId: transportOptions.id,
      producerId,
      rtpCapabilities: (this.device as { rtpCapabilities: RtpCapabilities } | null)
        ?.rtpCapabilities,
    });

    // Placeholder: real implementation returns track from RTCRtpReceiver
    // When mediasoup-client is installed, replace with device.createRecvTransport + transport.consume
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    this.emit("track", track);
    return track;
  }

  disconnect(): void {
    this.sendTransport = null;
    this.recvTransport = null;
    this.device = null;
    this.pendingRequests.clear();
    this.ws?.close();
    this.ws = null;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }
}
