import type { SupabaseClient } from "@supabase/supabase-js";
import { getIceServers } from "./config";

type SignalMessage =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit };

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
    this.init();
  }

  private init() {
    this.channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        if (this.destroyed) return;
        const msg = payload as SignalMessage;
        void this.handleSignal(msg);
      })
      .subscribe();
  }

  private async handleSignal(msg: SignalMessage) {
    if (msg.type === "offer") {
      // New viewer connecting — create fresh peer connection
      this.closePc();
      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      this.pc = pc;

      // Add local tracks
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });

      // Send ICE candidates as they're gathered
      pc.onicecandidate = (e) => {
        if (e.candidate && !this.destroyed) {
          void this.channel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "ice", candidate: e.candidate.toJSON() },
          });
        }
      };

      // Set remote offer and create answer
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      void this.channel.send({
        type: "broadcast",
        event: "signal",
        payload: { type: "answer", sdp: answer.sdp },
      });
    } else if (msg.type === "ice") {
      if (this.pc && this.pc.remoteDescription) {
        await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
    }
    // Camera side ignores "answer" messages (those are for the viewer)
  }

  private closePc() {
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.close();
      this.pc = null;
    }
  }

  destroy() {
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
  private pc: RTCPeerConnection;
  private channel: ReturnType<SupabaseClient["channel"]>;
  private destroyed = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  onStream: ((stream: MediaStream) => void) | null = null;
  onConnectionState: ((state: RTCPeerConnectionState) => void) | null = null;

  constructor(
    supabase: SupabaseClient,
    private pairingId: string
  ) {
    this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.channel = supabase.channel(`webrtc-signal:${pairingId}`);
    this.init();
  }

  private init() {
    const pc = this.pc;

    // Receive remote tracks
    pc.ontrack = (e) => {
      if (e.streams[0] && this.onStream) {
        this.onStream(e.streams[0]);
      }
    };

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      if (this.onConnectionState) {
        this.onConnectionState(pc.connectionState);
      }
    };

    // Send ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate && !this.destroyed) {
        void this.channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "ice", candidate: e.candidate.toJSON() },
        });
      }
    };

    // Listen for signals from camera
    this.channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        if (this.destroyed) return;
        const msg = payload as SignalMessage;
        void this.handleSignal(msg);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await this.createOffer();
        }
      });
  }

  private async createOffer() {
    // Add transceiver to receive video (and audio if available)
    this.pc.addTransceiver("video", { direction: "recvonly" });
    this.pc.addTransceiver("audio", { direction: "recvonly" });

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    void this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: { type: "offer", sdp: offer.sdp },
    });
  }

  private async handleSignal(msg: SignalMessage) {
    if (msg.type === "answer") {
      await this.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      // Flush any ICE candidates that arrived before the answer
      for (const candidate of this.pendingCandidates) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates = [];
    } else if (msg.type === "ice") {
      if (this.pc.remoteDescription) {
        await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } else {
        // Queue candidates until remote description is set
        this.pendingCandidates.push(msg.candidate);
      }
    }
    // Viewer side ignores "offer" messages (those are from itself)
  }

  destroy() {
    this.destroyed = true;
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
    void this.channel.unsubscribe();
  }
}
