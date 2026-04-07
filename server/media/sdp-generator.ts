import fs from "node:fs";
import path from "node:path";

type VideoCodec = "vp8" | "h264";
type AudioCodec = "opus";
type Codec = VideoCodec | AudioCodec;

const RTPMAP: Record<Codec, string> = {
  vp8: "VP8/90000",
  h264: "H264/90000",
  opus: "opus/48000/2",
};

export function generateSdp(
  port: number,
  codec: Codec,
  payloadType: number
): string {
  const isAudio = codec === "opus";
  const mediaType = isAudio ? "audio" : "video";
  const rtpmap = RTPMAP[codec];

  const lines = [
    "v=0",
    "o=- 0 0 IN IP4 127.0.0.1",
    "s=DartStreamer",
    "c=IN IP4 127.0.0.1",
    "t=0 0",
    `m=${mediaType} ${port} RTP/AVP ${payloadType}`,
    `a=rtpmap:${payloadType} ${rtpmap}`,
    "a=recvonly",
  ];

  return lines.join("\r\n") + "\r\n";
}

export interface SdpProducerInfo {
  port: number;
  codec: string;
  payloadType: number;
  kind: string;
}

export function writeSdpFiles(
  outputDir: string,
  producers: SdpProducerInfo[]
): string[] {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePaths: string[] = [];

  for (let i = 0; i < producers.length; i++) {
    const { port, codec, payloadType, kind } = producers[i];
    const sdpContent = generateSdp(port, codec as Codec, payloadType);
    const fileName = `${kind}-${i}.sdp`;
    const filePath = path.join(outputDir, fileName);
    fs.writeFileSync(filePath, sdpContent, "utf8");
    filePaths.push(filePath);
    console.log(`SDP written: ${filePath}`);
  }

  return filePaths;
}
