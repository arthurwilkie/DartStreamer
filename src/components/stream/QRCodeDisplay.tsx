"use client";

import { QRCodeSVG } from "qrcode.react";

interface Props {
  code: string;
  baseUrl?: string;
}

export function QRCodeDisplay({
  code,
  baseUrl = "https://darts.vaderspace.com",
}: Props) {
  const fullUrl = `${baseUrl}/camera?code=${code}`;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-xl bg-white p-4">
        <QRCodeSVG value={fullUrl} size={200} level="M" />
      </div>
      <div className="text-center">
        <p className="text-xs text-zinc-500">Or enter this code manually</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-widest text-white">
          {code.slice(0, 3)} {code.slice(3)}
        </p>
      </div>
      <p className="text-center text-xs text-zinc-500">
        Open on your camera device:
        <br />
        <span className="text-zinc-400">{baseUrl}/camera</span>
      </p>
    </div>
  );
}
