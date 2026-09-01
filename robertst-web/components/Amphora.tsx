"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { preload } from "react-dom";

import { BASE_COLOUR_TEXTURE_PATH, MODEL_PATH } from "@/lib/amphoraAssets";
import { useAmphoraRotation } from "@/lib/useAmphoraRotation";
import type { RotationStop } from "@/lib/amphora";
import type { WeekView } from "@/lib/content/view";
import { weekStories } from "@/lib/content/view";
import AmphoraFrameViewer from "@/components/AmphoraFrameViewer";
import AmphoraHandles from "@/components/AmphoraHandles";

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

/**
 * How long the vessel's answer to a refused gesture stays up. Long enough to
 * read at a glance, short enough that it is gone before it becomes a notice.
 */
const REFUSAL_NOTE_MS = 2000;

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
 *
 * There is deliberately no instruction anywhere on the page. The handles taking
 * a grab cursor when nothing else on the vessel does, the warmth that gathers
 * under it on approach, and the way it steadies under a hand are the whole of
 * what tells you what to do with it.
 */
export default function Amphora({ week }: { week: WeekView }) {
  const stops = useMemo<RotationStop[]>(
    () => week.onVase.map((story) => ({ key: story.slug, angle: story.angle })),
    [week.onVase],
  );

  const {
    angle,
    angleRef,
    isHolding,
    isDragging,
    isSpinning,
    story,
    refusal,
    turn,
    ...handlers
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

  // A gesture that fell short says so, briefly. The hook raises the token and
  // drops it again the moment a new gesture begins; all that is left here is how
  // long the answer stays up, which is presentation rather than physics.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const refused = refusal !== null && refusal !== dismissed;

  useEffect(() => {
    if (!refused) {
      return;
    }

    const timer = setTimeout(() => setDismissed(refusal), REFUSAL_NOTE_MS);
    return () => clearTimeout(timer);
  }, [refused, refusal]);

  // The vessel has no button, so the arrow keys are how it is turned without a
  // pointer. Every myth is also a link in the index below, so this is a second
  // way in rather than the only one.
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        turn(1);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        turn(-1);
      }
    },
    [turn],
  );

  const isActive = isDragging || isSpinning;
  const found = story ? week.onVase.find((entry) => entry.slug === story) : null;
  // A sealed story is still a stop on the vessel — you can turn to it, you just
  // cannot read it. The painted panel is blurred and corded to match.
  const sealed = Boolean(found && !found.unlocked && found.access === "locked");
  const all = weekStories(week);

  return (
    <section className="flex flex-col items-center">
      <h2 data-amphora="title">This week&rsquo;s amphora</h2>

      <div
        data-amphora="stage"
        data-holding={isHolding ? "" : undefined}
        data-turning={isActive ? "" : undefined}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-busy={isSpinning}
        aria-label="The amphora. Turn it with the left and right arrow keys."
        aria-keyshortcuts="ArrowLeft ArrowRight"
        className="relative aspect-[7/10] w-full max-w-[20rem] select-none"
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

        <AmphoraHandles angle={angle} isHolding={isHolding} handlers={handlers} />
      </div>

      <div
        role="status"
        aria-live="polite"
        data-amphora="reveal"
        data-sealed={sealed ? "" : undefined}
        data-refused={refused ? "" : undefined}
        className="flex flex-col items-center justify-center text-center"
      >
        {found ? (
          // Keyed so a new story re-mounts and surfaces, rather than having its
          // text swapped in place with no sense of anything having arrived.
          <Fragment key={found.slug}>
            {sealed && <p data-amphora="state">Sealed this week</p>}

            <p data-amphora="name">{found.title}</p>

            <p data-amphora="teaser">{found.teaser}</p>

            {sealed ? (
              <Link href="/subscribe" data-amphora="open">
                Unlock to read
              </Link>
            ) : (
              <Link href={`/myths/${found.slug}`} data-amphora="open">
                {found.unlocked ? "Read the story" : "Begin reading"}
              </Link>
            )}
          </Fragment>
        ) : (
          <span data-amphora="rest" aria-hidden="true" />
        )}

        {refused && (
          <p data-amphora="refusal" style={{ animationDuration: `${REFUSAL_NOTE_MS}ms` }}>
            A little harder.
          </p>
        )}
      </div>

      <nav data-amphora="index" aria-label={`Stories in week ${week.week}`}>
        <p className="sr-only">This week&rsquo;s five</p>

        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {all.map((entry) => {
            const sealed = !entry.unlocked && entry.access === "locked";
            return (
              <li
                key={entry.slug}
                data-sealed={sealed ? "" : undefined}
                data-current={entry.slug === story ? "" : undefined}
              >
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
