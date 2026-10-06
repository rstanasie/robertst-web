"use client";

import { useEffect } from "react";
import Image from "next/image";

import { angleToFrameIndex, frameSrc, FRAME_SOURCES } from "@/lib/amphora";

export default function AmphoraFrameViewer({ angle }: { angle: number }) {
  useEffect(() => {
    for (const src of FRAME_SOURCES) {
      const image = new window.Image();
      image.src = src;
    }
  }, []);

  return (
    <Image
      src={frameSrc(angleToFrameIndex(angle))}
      alt="A painted Greek Amphora."
      fill
      sizes="(max-width: 640px) 70vw, 20rem"
      unoptimized
      decoding="sync"
      draggable={false}
      className="pointer-events-none object-contain select-none"
    />
  );
}
