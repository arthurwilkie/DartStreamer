import * as mediasoup from "mediasoup";
import type {
  Worker,
  Router,
  WorkerSettings,
  RouterOptions,
  WebRtcTransportOptions,
} from "mediasoup/types";

export interface MediasoupConfig {
  worker: WorkerSettings;
  router: RouterOptions;
  webRtcTransport: WebRtcTransportOptions;
}

// ICE server config sent to WebRTC clients (not passed to mediasoup itself)
export interface IceServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

export function getIceServers(): IceServerConfig[] {
  const turnUrl = process.env.TURN_URL;
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    return [{ urls: turnUrl, username: turnUsername, credential: turnCredential }];
  }
  return [];
}

export function buildConfig(): MediasoupConfig {
  const listenIp = process.env.MEDIASOUP_LISTEN_IP ?? "0.0.0.0";
  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP ?? undefined;

  return {
    worker: {
      logLevel: "warn",
      logTags: ["rtp", "srtp", "rtcp"],
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    },
    router: {
      mediaCodecs: [
        {
          kind: "audio",
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: "video",
          mimeType: "video/VP8",
          clockRate: 90000,
          parameters: {
            "x-google-start-bitrate": 1000,
          },
        },
        {
          kind: "video",
          mimeType: "video/H264",
          clockRate: 90000,
          parameters: {
            "packetization-mode": 1,
            "profile-level-id": "42e01f",
            "level-asymmetry-allowed": 1,
          },
        },
      ],
    },
    webRtcTransport: {
      listenInfos: [
        {
          protocol: "udp",
          ip: listenIp,
          announcedAddress: announcedIp,
        },
        {
          protocol: "tcp",
          ip: listenIp,
          announcedAddress: announcedIp,
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    },
  };
}

let sharedWorker: Worker | null = null;
let sharedRouter: Router | null = null;

export async function createWorkerAndRouter(): Promise<{
  worker: Worker;
  router: Router;
}> {
  if (sharedWorker && sharedRouter) {
    return { worker: sharedWorker, router: sharedRouter };
  }

  const config = buildConfig();

  const worker = await mediasoup.createWorker(config.worker);

  worker.on("died", (error) => {
    console.error("mediasoup Worker died:", error);
    process.exit(1);
  });

  const router = await worker.createRouter(config.router);

  sharedWorker = worker;
  sharedRouter = router;

  console.log("mediasoup Worker and Router created");
  return { worker, router };
}
