import { MediSoupClient } from "./mediasoup-client";

export type ReconnectionStatus = "connected" | "reconnecting" | "disconnected";

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;
const MAX_ATTEMPTS = 10;

export class ReconnectionManager {
  private client: MediSoupClient;
  private attempts = 0;
  private status: ReconnectionStatus = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  onStatusChange?: (status: ReconnectionStatus) => void;

  constructor(client: MediSoupClient) {
    this.client = client;

    this.client.on("connected", () => {
      this.attempts = 0;
      this.setStatus("connected");
    });

    this.client.on("disconnected", () => {
      if (!this.stopped) {
        this.scheduleReconnect();
      } else {
        this.setStatus("disconnected");
      }
    });
  }

  private setStatus(status: ReconnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange?.(status);
  }

  private backoffDelay(): number {
    const delay = BASE_DELAY_MS * Math.pow(2, this.attempts);
    return Math.min(delay, MAX_DELAY_MS);
  }

  private scheduleReconnect(): void {
    if (this.attempts >= MAX_ATTEMPTS) {
      this.setStatus("disconnected");
      return;
    }

    this.setStatus("reconnecting");
    const delay = this.backoffDelay();
    this.attempts += 1;

    this.reconnectTimer = setTimeout(() => {
      if (this.stopped) return;
      this.client.connect().catch(() => {
        // connect() failure triggers 'disconnected' event → scheduleReconnect again
      });
    }, delay);
  }

  async requestIceRestart(): Promise<void> {
    try {
      await (
        this.client as unknown as {
          sendRequest: (type: string, data?: unknown) => Promise<unknown>;
        }
      ).sendRequest("restartIce");
    } catch {
      // If the signaling channel is down, fall through to full reconnect
      this.scheduleReconnect();
    }
  }

  getStatus(): ReconnectionStatus {
    return this.status;
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.client.disconnect();
    this.setStatus("disconnected");
  }
}
