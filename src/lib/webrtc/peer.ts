import type { SupabaseClient } from "@supabase/supabase-js";
import { getIceServers } from "./config";

type SignalMessage =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit };

const LOG_PREFIX_CAM = "[CameraPeer]";
const LOG_PREFIX_VIEW = "[ViewerPeer]";

/**
 * CameraPeer — the sender side (runs on /camera page).
 * Waits for an offer from a ViewerPeer, then answers with the local stream.
 */
export class CameraPeer {
  private pc: RTCPeerConnection | null = null;
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
    console.log(LOG_PREFIX_CAM, "ICE servers:", JSON.stringify(getIceServers()));
    this.init();
  }

  private init() {
    this.channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        if (this.destroyed) return;
        const msg = payload as SignalMessage;
        console.log(LOG_PREFIX_CAM, "received signal:", msg.type);
        void this.handleSignal(msg);
      })
      .subscribe((status) => {
        console.log(LOG_PREFIX_CAM, "channel status:", status);
      });
  }

  private async handleSignal(msg: SignalMessage) {
    if (msg.type === "offer") {
      console.log(LOG_PREFIX_CAM, "received offer, creating answer...");
      // New viewer connecting — create fresh peer connection
      this.closePc();
      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      this.pc = pc;

      pc.oniceconnectionstatechange = () => {
        console.log(LOG_PREFIX_CAM, "ICE connection state:", pc.iceConnectionState);
      };

      pc.onconnectionstatechange = () => {
        console.log(LOG_PREFIX_CAM, "connection state:", pc.connectionState);
      };

      pc.onicegatheringstatechange = () => {
        console.log(LOG_PREFIX_CAM, "ICE gathering state:", pc.iceGatheringState);
      };

      // Add local tracks
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
        console.log(LOG_PREFIX_CAM, "added track:", track.kind, track.readyState);
      });

      // Send ICE candidates as they're gathered
      let iceCandidateCount = 0;
      pc.onicecandidate = (e) => {
        if (e.candidate && !this.destroyed) {
          iceCandidateCount++;
          console.log(LOG_PREFIX_CAM, `sending ICE candidate #${iceCandidateCount}:`, e.candidate.type, e.candidate.protocol, e.candidate.address);
          void this.channel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "ice", candidate: e.candidate.toJSON() },
          });
        } else if (!e.candidate) {
          console.log(LOG_PREFIX_CAM, "ICE gathering complete, total candidates:", iceCandidateCount);
        }
      };

      // Set remote offer and create answer
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      console.log(LOG_PREFIX_CAM, "set remote description (offer)");

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log(LOG_PREFIX_CAM, "created and set local description (answer)");

      void this.channel.send({
        type: "broadcast",
        event: "signal",
        payload: { type: "answer", sdp: answer.sdp },
      });
      console.log(LOG_PREFIX_CAM, "sent answer");
    } else if (msg.type === "ice") {
      if (this.pc && this.pc.remoteDescription) {
        console.log(LOG_PREFIX_CAM, "adding remote ICE candidate");
        await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } else {
        console.log(LOG_PREFIX_CAM, "dropping ICE candidate — no PC or remote description");
      }
    }
    // Camera side ignores "answer" messages (those are for the viewer)
  }

  private closePc() {
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.onicegatheringstatechange = null;
      this.pc.close();
      this.pc = null;
    }
  }

  destroy() {
    console.log(LOG_PREFIX_CAM, "destroying");
    this.destroyed = true;
    this.closePc();
    void this.channel.unsubscribe();
  }
}

/**
 * ViewerPeer — the receiver side (runs on the game page).
 * Creates an offer and sends it to the CameraPeer, then plays the remote stream.
 */
export class ViewerPeer {
  private pc!: RTCPeerConnection;
  private channel: ReturnType<SupabaseClient["channel"]>;
  private destroyed = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private answerReceived = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private static MAX_RETRIES = 10;
  private static RETRY_INTERVAL_MS = 3000;

  onStream: ((stream: MediaStream) => void) | null = null;
  onConnectionState: ((state: RTCPeerConnectionState) => void) | null = null;

  constructor(
    private supabase: SupabaseClient,
    private pairingId: string
  ) {
    this.channel = supabase.channel(`webrtc-signal:${pairingId}`);
    console.log(LOG_PREFIX_VIEW, "created, pairingId:", pairingId);
    console.log(LOG_PREFIX_VIEW, "ICE servers:", JSON.stringify(getIceServers()));
    this.init();
  }

  private createPc() {
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });

    // Receive remote tracks
    pc.ontrack = (e) => {
      console.log(LOG_PREFIX_VIEW, "ontrack fired, streams:", e.streams.length, "track:", e.track.kind, e.track.readyState);
      if (e.streams[0] && this.onStream) {
        this.onStream(e.streams[0]);
      }
    };

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log(LOG_PREFIX_VIEW, "connection state:", pc.connectionState);
      if (this.onConnectionState) {
        this.onConnectionState(pc.connectionState);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(LOG_PREFIX_VIEW, "ICE connection state:", pc.iceConnectionState);
    };

    pc.onicegatheringstatechange = () => {
      console.log(LOG_PREFIX_VIEW, "ICE gathering state:", pc.iceGatheringState);
    };

    // Send ICE candidates
    let iceCandidateCount = 0;
    pc.onicecandidate = (e) => {
      if (e.candidate && !this.destroyed) {
        iceCandidateCount++;
        console.log(LOG_PREFIX_VIEW, `sending ICE candidate #${iceCandidateCount}:`, e.candidate.type, e.candidate.protocol, e.candidate.address);
        void this.channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "ice", candidate: e.candidate.toJSON() },
        });
      } else if (!e.candidate) {
        console.log(LOG_PREFIX_VIEW, "ICE gathering complete, total candidates:", iceCandidateCount);
      }
    };

    this.pc = pc;
  }

  private init() {
    this.createPc();

    // Listen for signals from camera
    this.channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        if (this.destroyed) return;
        const msg = payload as SignalMessage;
        console.log(LOG_PREFIX_VIEW, "received signal:", msg.type);
        void this.handleSignal(msg);
      })
      .subscribe(async (status) => {
        console.log(LOG_PREFIX_VIEW, "channel status:", status);
        if (status === "SUBSCRIBED") {
          await this.sendOffer();
        }
      });
  }

  private async sendOffer() {
    console.log(LOG_PREFIX_VIEW, `sending offer (attempt ${this.retryCount + 1}/${ViewerPeer.MAX_RETRIES + 1})`);

    // Reset PC for a fresh offer
    if (this.retryCount > 0) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onicegatheringstatechange = null;
      this.pc.close();
      this.pendingCandidates = [];
      this.createPc();
    }

    // Add transceiver to receive video only (audio not needed — players use Discord)
    this.pc.addTransceiver("video", { direction: "recvonly" });

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    void this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: { type: "offer", sdp: offer.sdp },
    });
    console.log(LOG_PREFIX_VIEW, "offer sent");

    // Schedule retry if no answer received
    this.scheduleRetry();
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);

    this.retryTimer = setTimeout(() => {
      if (this.destroyed || this.answerReceived) return;

      this.retryCount++;
      console.log(LOG_PREFIX_VIEW, `no answer after ${ViewerPeer.RETRY_INTERVAL_MS}ms, retry ${this.retryCount}/${ViewerPeer.MAX_RETRIES}`);
      if (this.retryCount <= ViewerPeer.MAX_RETRIES) {
        void this.sendOffer();
      } else {
        console.log(LOG_PREFIX_VIEW, "max retries reached, giving up");
      }
    }, ViewerPeer.RETRY_INTERVAL_MS);
  }

  private async handleSignal(msg: SignalMessage) {
    if (msg.type === "answer") {
      console.log(LOG_PREFIX_VIEW, "received answer");
      this.answerReceived = true;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }

      await this.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      console.log(LOG_PREFIX_VIEW, "set remote description (answer), flushing", this.pendingCandidates.length, "queued candidates");
      // Flush any ICE candidates that arrived before the answer
      for (const candidate of this.pendingCandidates) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates = [];
    } else if (msg.type === "ice") {
      if (this.pc.remoteDescription) {
        console.log(LOG_PREFIX_VIEW, "adding remote ICE candidate");
        await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } else {
        console.log(LOG_PREFIX_VIEW, "queueing ICE candidate (no remote description yet)");
        this.pendingCandidates.push(msg.candidate);
      }
    }
    // Viewer side ignores "offer" messages (those are from itself)
  }

  destroy() {
    console.log(LOG_PREFIX_VIEW, "destroying");
    this.destroyed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.pc.oniceconnectionstatechange = null;
    this.pc.onicegatheringstatechange = null;
    this.pc.close();
    void this.channel.unsubscribe();
  }
}
