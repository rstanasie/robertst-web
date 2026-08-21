"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { preload } from "react-dom";

import { myths, MythStory } from "@/data/myths";
import { BASE_COLOUR_TEXTURE_PATH, MODEL_PATH } from "@/lib/amphoraAssets";
import { useAmphoraRotation } from "@/lib/useAmphoraRotation";
import AmphoraFrameViewer from "@/components/AmphoraFrameViewer";

const storyKeys = Object.keys(myths) as MythStory[];

function ViewerMessage({ children }: { children: ReactNode }) {
  return (
    <p className="absolute inset-0 grid place-items-center text-center text-sm opacity-70">
      {children}
    </p>
  );
}

const AmphoraModelViewer = dynamic(() => import("@/components/AmphoraModelViewer"), {
  ssr: false,
  loading: () => <ViewerMessage>Shaping the amphora…</ViewerMessage>,
});

type ViewerMode = "detecting" | "model" | "frames";

let webglSupport: boolean | null = null;

function supportsWebGL(): boolean {
  if (webglSupport !== null) {
    return webglSupport;
  }

  try {
    const canvas = document.createElement("canvas");
    webglSupport = Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") ?? canvas.getContext("webgl")),
    );
  } catch {
    webglSupport = false;
  }

  return webglSupport;
}

const subscribeToNothing = () => () => {};
const clientViewerMode = (): ViewerMode => (supportsWebGL() ? "model" : "frames");
const serverViewerMode = (): ViewerMode => "detecting";

export default function Amphora() {
  const {
    angle,
    angleRef,
    isDragging,
    isSpinning,
    story,
    spin,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  } = useAmphoraRotation();

  const detectedMode = useSyncExternalStore(
    subscribeToNothing,
    clientViewerMode,
    serverViewerMode,
  );
  const [modelFailed, setModelFailed] = useState(false);
  const mode: ViewerMode = modelFailed ? "frames" : detectedMode;

  useEffect(() => {
    if (mode !== "model") {
      return;
    }

    preload(MODEL_PATH, { as: "fetch" });
    preload(BASE_COLOUR_TEXTURE_PATH, { as: "image" });
  }, [mode]);

  const handleModelError = useCallback(() => setModelFailed(true), []);

  const isActive = isDragging || isSpinning;
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
        className={`relative aspect-[7/10] w-full max-w-[20rem] touch-none select-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {mode === "detecting" && <ViewerMessage>Shaping the amphora…</ViewerMessage>}

        {mode === "model" && (
          <AmphoraModelViewer
            angleRef={angleRef}
            isActive={isActive}
            onError={handleModelError}
          />
        )}

        {mode === "frames" && <AmphoraFrameViewer angle={angle} />}
      </div>

      <p className="text-sm opacity-70">Drag the amphora sideways to spin it.</p>

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

      <nav aria-label="All myths" className="text-center text-sm">
        <p>Or read a myth directly:</p>

        <ul className="flex flex-wrap justify-center gap-4">
          {storyKeys.map((key) => (
            <li key={key}>
              <Link href={`/myths/${key}`} className="underline">
                {myths[key].name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
