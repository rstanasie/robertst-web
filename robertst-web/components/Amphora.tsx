"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

import { myths, MythStory } from "@/data/myths";
import { angleToFrameIndex, frameSrc, FRAME_SOURCES } from "@/lib/amphora";
import { useAmphoraRotation } from "@/lib/useAmphoraRotation";

const storyKeys = Object.keys(myths) as MythStory[];

export default function Amphora() {
  const {
    angle,
    isDragging,
    isSpinning,
    story,
    spin,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  } = useAmphoraRotation();

  useEffect(() => {
    for (const src of FRAME_SOURCES) {
      const image = new window.Image();
      image.src = src;
    }
  }, []);

  const selectedMyth = story ? myths[story] : null;

  return (
    <section className="flex flex-col items-center gap-4">
      <h2>The Amphora</h2>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-busy={isSpinning}
        className={`relative aspect-[474/829] w-full max-w-[18rem] touch-none select-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <Image
          src={frameSrc(angleToFrameIndex(angle))}
          alt="A painted Greek amphora on a turntable. Drag it sideways to spin it."
          fill
          sizes="(max-width: 640px) 70vw, 18rem"
          unoptimized
          decoding="sync"
          draggable={false}
          className="pointer-events-none object-contain select-none"
        />
      </div>

      <button
        type="button"
        onClick={spin}
        disabled={isSpinning}
        className="rounded border px-4 py-2 disabled:opacity-50"
      >
        Spin the Amphora
      </button>

      <div
        role="status"
        aria-live="polite"
        className="flex min-h-28 flex-col items-center gap-2 text-center"
      >
        {selectedMyth && (
          <>
            <p>
              You discovered: <strong>{selectedMyth.name}</strong>
            </p>

            <p>{selectedMyth.description}</p>

            <Link href={`/myths/${story}`} className="underline">
              Read the story
            </Link>
          </>
        )}
      </div>

      <noscript>
        <p>Spinning the amphora needs JavaScript. Read a myth directly:</p>

        <ul>
          {storyKeys.map((key) => (
            <li key={key}>
              <Link href={`/myths/${key}`}>{myths[key].name}</Link>
            </li>
          ))}
        </ul>
      </noscript>
    </section>
  );
}
