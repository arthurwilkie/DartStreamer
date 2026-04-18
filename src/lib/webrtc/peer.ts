import type { SupabaseClient } from "@supabase/supabase-js";
import { getIceServers } from "./config";

type SignalMessage =
  | { type: "offer"; sdp: string; viewerId: string }
  | { type: "answer"; sdp: string; viewerId: string }
  | { type: "ice"; candidate: RTCIceCandidateInit; viewerId: string; from: "camera" | "viewer" };

const LOG_PREFIX_CAM = "[CameraPeer]";
const LOG_PREFIX_VIEW = "[ViewerPeer]";

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * CameraPeer — the sender side (runs on /camera page).
 * Can serve multiple concurrent viewers over the same pairing channel; each
 * viewer is identified by a `viewerId` included in every signaling message.
 */
export class CameraPeer {
  private pcs = new Map<string, RTCPeerConnection>();
  private channel: ReturnType<SupabaseClient["channel"]>;
  private localStream: MediaStream;
  private destroyed = false;

  constructor(
    supabase: SupabaseClient,
    private pairingId: string,
    localStream: MediaStream
  ) {
    this.localStream = localStream;
    this.channel = supabase.channel(`webrtc-signal:${pairingId}`);
    console.log(LOG_PREFIX_CAM, "created, pairingId:", pairingId);
    console.log(LOG_PREFIX_CAM, "local tracks:", localStream.getTracks().map(t => `${t.kind}:${t.readyState}`));
    this.init();
  }

  private init() {
    this.channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        if (this.destroyed) return;
        const msg = payload as SignalMessage;
        // Camera ignores its own ICE messages (from: "camera")
        if (msg.type === "ice" && msg.from === "camera") return;
        console.log(LOG_PREFIX_CAM, "received signal:", msg.type, "viewerId:", msg.viewerId);
        void this.handleSignal(msg);
      })
      .subscribe((status) => {
        console.log(LOG_PREFIX_CAM, "channel status:", status);
      });
  }

  private async handleSignal(msg: SignalMessage) {
    if (msg.type === "offer") {
      const { viewerId } = msg;
      // Replace any existing PC for this viewerId (re-offer on retry)
      this.closeViewer(viewerId);

      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      this.pcs.set(viewerId, pc);

      pc.oniceconnectionstatechange = () => {
        console.log(LOG_PREFIX_CAM, viewerId, "ICE state:", pc.iceConnectionState);
      };
      pc.onconnectionstatechange = () => {
        console.log(LOG_PREFIX_CAM, viewerId, "connection state:", pc.connectionState);
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed" ||
          pc.connectionState === "disconnected"
        ) {
          // Don't auto-remove on "disconnected" — ICE can recover. Only on failed/closed.
          if (pc.connectionState !== "disconnected") this.closeViewer(viewerId);
        }
      };

      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });

      pc.onicecandidate = (e) => {
        if (e.candidate && !this.destroyed) {
          void this.channel.send({
            type: "broadcast",
            event: "signal",
            payload: {
              type: "ice",
              candidate: e.candidate.toJSON(),
              viewerId,
              from: "camera",
            } satisfies SignalMessage,
          });
        }
      };

      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      void this.channel.send({
        type: "broadcast",
        event: "signal",
        payload: { type: "answer", sdp: answer.sdp ?? "", viewerId } satisfies SignalMessage,
      });
      console.log(LOG_PREFIX_CAM, "sent answer to", viewerId);
    } else if (msg.type === "ice") {
      const pc = this.pcs.get(msg.viewerId);
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
    }
    // answers are ignored on the camera side
  }

  private closeViewer(viewerId: string) {
    const pc = this.pcs.get(viewerId);
    if (!pc) return;
    pc.onicecandidate = null;
    pc.oniceconnectionstatechange = null;
    pc.onconnectionstatechange = null;
    pc.close();
    this.pcs.delete(viewerId);
  }

  destroy() {
    console.log(LOG_PREFIX_CAM, "destroying");
    this.destroyed = true;
    for (const viewerId of Array.from(this.pcs.keys())) {
      this.closeViewer(viewerId);
    }
    void this.channel.unsubscribe();
  }
}

/**
 * ViewerPeer — the receiver side. Creates an offer keyed by a unique
 * `viewerId` so the camera can distinguish it from other concurrent viewers.
 */
export class ViewerPeer {
  private pc!: RTCPeerConnection;
  private channel: ReturnType<SupabaseClient["channel"]>;
  private destroyed = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private answerReceived = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private viewerId = randomId();
  private static MAX_RETRIES = 10;
  private static RETRY_INTERVAL_MS = 3000;

  onStream: ((stream: MediaStream) => void) | null = null;
  onConnectionState: ((state: RTCPeerConnectionState) => void) | null = null;

  constructor(
    private supabase: SupabaseClient,
    private pairingId: string
  ) {
    this.channel = supabase.channel(`webrtc-signal:${pairingId}`);
    console.log(LOG_PREFIX_VIEW, "created, pairingId:", pairingId, "viewerId:", this.viewerId);
    this.init();
  }

  private createPc() {
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });

    pc.ontrack = (e) => {
      if (e.streams[0] && this.onStream) {
        this.onStream(e.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(LOG_PREFIX_VIEW, this.viewerId, "connection state:", pc.connectionState);
      if (this.onConnectionState) this.onConnectionState(pc.connectionState);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && !this.destroyed) {
        void this.channel.send({
          type: "broadcast",
          event: "signal",
          payload: {
            type: "ice",
            candidate: e.candidate.toJSON(),
            viewerId: this.viewerId,
            from: "viewer",
          } satisfies SignalMessage,
        });
      }
    };

    this.pc = pc;
  }

  private init() {
    this.createPc();

    this.channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        if (this.destroyed) return;
        const msg = payload as SignalMessage;
        // Only react to messages addressed to us
        if (msg.viewerId !== this.viewerId) return;
        // Ignore ICE candidates that we sent ourselves
        if (msg.type === "ice" && msg.from === "viewer") return;
        console.log(LOG_PREFIX_VIEW, this.viewerId, "received signal:", msg.type);
        void this.handleSignal(msg);
      })
      .subscribe(async (status) => {
        console.log(LOG_PREFIX_VIEW, this.viewerId, "channel status:", status);
        if (status === "SUBSCRIBED") await this.sendOffer();
      });
  }

  private async sendOffer() {
    console.log(LOG_PREFIX_VIEW, this.viewerId, `sending offer (attempt ${this.retryCount + 1})`);

    if (this.retryCount > 0) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pendingCandidates = [];
      this.createPc();
    }

    this.pc.addTransceiver("video", { direction: "recvonly" });
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    void this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: { type: "offer", sdp: offer.sdp ?? "", viewerId: this.viewerId } satisfies SignalMessage,
    });
    this.scheduleRetry();
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (this.destroyed || this.answerReceived) return;
      this.retryCount++;
      if (this.retryCount <= ViewerPeer.MAX_RETRIES) void this.sendOffer();
    }, ViewerPeer.RETRY_INTERVAL_MS);
  }

  private async handleSignal(msg: SignalMessage) {
    if (msg.type === "answer") {
      this.answerReceived = true;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      await this.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      for (const candidate of this.pendingCandidates) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates = [];
    } else if (msg.type === "ice") {
      if (this.pc.remoteDescription) {
        await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } else {
        this.pendingCandidates.push(msg.candidate);
      }
    }
  }

  destroy() {
    console.log(LOG_PREFIX_VIEW, this.viewerId, "destroying");
    this.destroyed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
    void this.channel.unsubscribe();
  }
}
