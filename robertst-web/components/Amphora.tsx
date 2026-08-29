"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { preload } from "react-dom";

import { BASE_COLOUR_TEXTURE_PATH, MODEL_PATH } from "@/lib/amphoraAssets";
import { useAmphoraRotation } from "@/lib/useAmphoraRotation";
import type { RotationStop } from "@/lib/amphora";
import type { WeekView } from "@/lib/content/view";
import { weekStories } from "@/lib/content/view";
import AmphoraFrameViewer from "@/components/AmphoraFrameViewer";

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

/**
 * The week's discovery interface.
 *
 * Content arrives as props from the server, already reduced to titles, teasers
 * and access states — this component has no way to reach story text, which is
 * what keeps the paywall honest. Rotation, inertia and snapping are unchanged;
 * only the set of stops it settles on now comes from the active week.
 */
export default function Amphora({ week }: { week: WeekView }) {
  const stops = useMemo<RotationStop[]>(
    () => week.onVase.map((story) => ({ key: story.slug, angle: story.angle })),
    [week.onVase],
  );

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
  } = useAmphoraRotation(stops);

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
  const found = story ? week.onVase.find((entry) => entry.slug === story) : null;
  // A sealed story is still a stop on the vessel — you can turn to it, you just
  // cannot read it. The painted panel is blurred and corded to match.
  const sealed = Boolean(found && !found.unlocked && found.access === "locked");
  const all = weekStories(week);

  return (
    <section className="flex flex-col items-center gap-4">
      <h2 data-amphora="title">The Amphora</h2>

      <div
        data-amphora="stage"
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

      <p data-amphora="hint">Drag the amphora sideways to spin it.</p>

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
        data-sealed={sealed ? "" : undefined}
        className="flex flex-col items-center gap-2 text-center"
      >
        {found && (
          <>
            <p>
              {sealed ? "Sealed this week: " : "You turned up: "}
              <strong>{found.title}</strong>
            </p>

            <p>{found.teaser}</p>

            {sealed ? (
              <Link href="/subscribe" className="underline">
                Unlock to read
              </Link>
            ) : (
              <Link href={`/myths/${found.slug}`} className="underline">
                {found.unlocked ? "Read the story" : "Begin reading"}
              </Link>
            )}
          </>
        )}
      </div>

      <nav data-amphora="index" aria-label={`Stories in week ${week.week}`}>
        <p>This week&rsquo;s five</p>

        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {all.map((entry) => {
            const sealed = !entry.unlocked && entry.access === "locked";
            return (
              <li key={entry.slug} data-sealed={sealed ? "" : undefined}>
                <Link href={`/myths/${entry.slug}`}>
                  {sealed && (
                    <span aria-hidden="true" className="myth-seal">
                      ✦
                    </span>
                  )}
                  {entry.title}
                  {sealed && <span className="sr-only"> (sealed)</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </section>
  );
}
