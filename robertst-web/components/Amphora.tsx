"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { preload } from "react-dom";

import { BASE_COLOUR_TEXTURE_PATH, MODEL_PATH } from "@/lib/amphoraAssets";
import { nearestStop } from "@/lib/amphora";
import { useAmphoraRotation } from "@/lib/useAmphoraRotation";
import type { ChooseStop } from "@/lib/useAmphoraRotation";
import type { RotationStop } from "@/lib/amphora";
import { chooseStory, rememberOpened, rememberSpin } from "@/lib/spin/rules";
import type { SpinCandidate, SpinMemory } from "@/lib/spin/rules";
import {
  serverSpinMemory,
  spinMemory,
  subscribeSpinMemory,
  writeSpinMemory,
} from "@/lib/spin/storage";
import type { WeekView } from "@/lib/content/view";
import { weekStories } from "@/lib/content/view";
import type { StoryChip } from "@/lib/content/view";
import AmphoraColumn from "@/components/AmphoraColumn";
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
  loading: () => <ViewerMessage>Shaping the Amphora…</ViewerMessage>,
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
 * How long one of the vessel's answers stays up. Long enough to read at a
 * glance, short enough that it is gone before it becomes a notice.
 */
const NOTE_MS = 2000;

/**
 * What the vessel says to a hand laid on its body. Nothing on the page says
 * the handles are the handles, which is deliberate — but a reader who presses
 * the painted clay and gets no response at all has been told nothing, and the
 * question points at the answer without giving it away.
 *
 * It is spoken where the hand landed rather than in the result panel: beside
 * the vessel, at the height of the press and on the side of it. An answer that
 * appears under the pot would be about the pot; this one is about where you
 * just put your hand.
 */
const BODY_NOTE = "How would you grab an Amphora?";

/** Where a hand came down, as a note needs to know it. */
type Spot = { y: number; side: "left" | "right" };

/** Before anything has been touched. Never seen: no note exists until it is. */
const NOWHERE: Spot = { y: 50, side: "right" };

/** Keeps a note off the very top and bottom of the stage box. */
const clampHeight = (percent: number) => Math.min(92, Math.max(8, percent));

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
/** A reader can read it if the page would actually serve them any of it. */
const isReadable = (story: StoryChip) => story.unlocked || story.access === "preview";

export default function Amphora({ week }: { week: WeekView }) {
  const stops = useMemo<RotationStop[]>(
    () => week.onVase.map((story) => ({ key: story.slug, angle: story.angle })),
    [week.onVase],
  );

  const candidates = useMemo<SpinCandidate[]>(
    () => week.onVase.map((story) => ({ key: story.slug, readable: isReadable(story) })),
    [week.onVase],
  );

  const readableExists = candidates.some((candidate) => candidate.readable);

  /**
   * The spin history, restored from the tab it was made in. It lives outside
   * React — see lib/spin/storage.ts — which is both where it has to live to
   * survive a refresh and what lets the chooser read it as it is *now* rather
   * than through whatever closure the last render left behind.
   */
  const memory = useSyncExternalStore(subscribeSpinMemory, spinMemory, serverSpinMemory);

  const rememberThat = useCallback((next: (previous: SpinMemory) => SpinMemory) => {
    writeSpinMemory(next(spinMemory()));
  }, []);

  const candidatesRef = useRef(candidates);

  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);

  /**
   * Chosen before the vessel starts moving, so what it is turning toward is
   * settled from the first frame and nothing is re-rolled on the way. The
   * chooser is given the angle the throw would have reached on its own and is
   * free to ignore it, which this one does: where the hand happened to let go
   * is not a reason to hand someone a story they cannot read.
   */
  const chooseStop = useCallback<ChooseStop>((landing, available) => {
    const key = chooseStory(candidatesRef.current, spinMemory(), Math.random);
    const chosen = key ? available.find((stop) => stop.key === key) : undefined;
    // A key with no stop means the week changed under the spin. Falling back to
    // the physics is the graceful answer: the vessel still lands on a panel.
    return chosen ?? nearestStop(landing, available);
  }, []);

  /**
   * Counted when the vessel has come to rest, not when the story was chosen.
   * A spin whose animation a hand interrupts never arrives here, so it never
   * moves a counter — which is the rule about cancelled spins, enforced by
   * where this is called from rather than by a flag.
   */
  const handleSpinSettled = useCallback(
    (key: string) => {
      rememberThat((previous) => rememberSpin(previous, key, candidatesRef.current));
    },
    [rememberThat],
  );

  const handleOpened = useCallback(
    (key: string) => {
      rememberThat((previous) => rememberOpened(previous, key));
    },
    [rememberThat],
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
  } = useAmphoraRotation(stops, { chooseStop, onSpinSettled: handleSpinSettled });

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

    const timer = setTimeout(() => setDismissed(refusal), NOTE_MS);
    return () => clearTimeout(timer);
  }, [refused, refusal]);

  // And a hand on the body rather than on a handle gets its own answer. Same
  // shape as the refusal — a token rather than a flag, so pressing twice reads
  // as two presses and restarts the note.
  const [pressed, setPressed] = useState<number | null>(null);
  const [pressDismissed, setPressDismissed] = useState<number | null>(null);
  const misplaced = pressed !== null && pressed !== pressDismissed;

  // Where the last hand came down, whichever kind of hand it was. Both answers
  // are spoken there, so a refused spin is answered beside the handle that was
  // turned and not in some fixed corner of the page.
  const [spot, setSpot] = useState<Spot>(NOWHERE);

  useEffect(() => {
    if (!misplaced) {
      return;
    }

    const timer = setTimeout(() => setPressDismissed(pressed), NOTE_MS);
    return () => clearTimeout(timer);
  }, [misplaced, pressed]);

  // On the press, not on the release: the question is about the hand that is
  // on the clay right now, and an answer that waits for the button to come
  // back up arrives after the reader has already let go and concluded that
  // nothing happens.
  //
  // Handle presses reach here too, by bubbling. They are a gesture rather than
  // a question, so they take any standing note down instead of raising one —
  // and dismissal has to name the token on screen, because the note is up for
  // exactly as long as the two numbers differ.
  const handleStagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const box = event.currentTarget.getBoundingClientRect();

      setSpot({
        y: clampHeight(((event.clientY - box.top) / box.height) * 100),
        side: event.clientX < box.left + box.width / 2 ? "left" : "right",
      });

      if ((event.target as HTMLElement).closest('[data-amphora="handle"]')) {
        setPressDismissed(pressed);
        return;
      }

      setPressed(performance.now());
    },
    [pressed],
  );

  // One note, two things it can say. The refusal answers something the reader
  // did to the vessel, so it outranks the question about where they put their
  // hand — and it arrives later anyway, on the release.
  const note = refused
    ? { token: refusal, text: "A little harder." }
    : misplaced
      ? { token: pressed, text: BODY_NOTE }
      : null;

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
  const sealed = Boolean(found && !isReadable(found));
  const all = weekStories(week);

  /**
   * The last readable story the vessel offered, still here.
   *
   * Spinning past something you could have read and having to spin again to
   * get back to it is the kind of thing that turns a vessel into a machine
   * that wants more pulls. It stands in the panel's resting state, so it
   * occupies space already reserved and nothing on the page moves to make
   * room for it. The membership test is what handles a week that changed
   * under a restored session: a remembered slug that is no longer painted
   * simply does not appear.
   */
  const lastRead = memory.lastReadable
    ? (week.onVase.find((entry) => entry.slug === memory.lastReadable) ?? null)
    : null;

  return (
    <section className="flex flex-col items-center">
      <h2 data-amphora="title">This week&rsquo;s Amphora</h2>

      <div
        data-amphora="stage"
        data-holding={isHolding ? "" : undefined}
        data-turning={isActive ? "" : undefined}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handleStagePointerDown}
        aria-busy={isSpinning}
        aria-label="The Amphora. Turn it with the left and right arrow keys."
        aria-keyshortcuts="ArrowLeft ArrowRight"
        className="relative aspect-[7/10] w-full max-w-[20rem] select-none"
      >
        {/* Both decorative, both behind the clay, and both inside the stage
            box so they travel with the vessel as it drifts. */}
        <AmphoraColumn />

        <div data-amphora="aura" aria-hidden="true" />

        {mode === "detecting" && <ViewerMessage>Shaping the Amphora…</ViewerMessage>}

        {mode === "model" && (
          <AmphoraModelViewer
            angleRef={angleRef}
            isActive={isActive}
            onError={handleModelError}
          />
        )}

        {mode === "frames" && <AmphoraFrameViewer angle={angle} />}

        <AmphoraHandles angle={angle} isHolding={isHolding} handlers={handlers} />

        {note && (
          // Keyed on the token, not on the words. The fade is filled `both`, so
          // once it has run the element sits at opacity 0 for good: a second
          // answer has to re-mount the note to replay it.
          <p
            key={note.token}
            data-amphora="note"
            data-side={spot.side}
            style={{ top: `${spot.y}%`, animationDuration: `${NOTE_MS}ms` }}
          >
            {note.text}
          </p>
        )}
      </div>

      <div
        role="status"
        aria-live="polite"
        data-amphora="reveal"
        data-sealed={sealed ? "" : undefined}
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
              <Link
                href={`/myths/${found.slug}`}
                data-amphora="open"
                onClick={() => handleOpened(found.slug)}
              >
                {found.unlocked ? "Read the story" : "Begin reading"}
              </Link>
            )}
          </Fragment>
        ) : lastRead ? (
          <p data-amphora="again">
            <Link
              href={`/myths/${lastRead.slug}`}
              data-amphora="open"
              onClick={() => handleOpened(lastRead.slug)}
            >
              Read {lastRead.title}
            </Link>
          </p>
        ) : readableExists ? (
          <span data-amphora="rest" aria-hidden="true" />
        ) : (
          // Nothing on the vessel can be read at all, so the vessel is not the
          // answer and saying so once is kinder than letting the reader keep
          // turning it to find that out.
          <p data-amphora="none">
            Every story on the Amphora is sealed this week.{" "}
            <Link href="/subscribe" data-amphora="open">
              Unlock them
            </Link>
          </p>
        )}

      </div>

      <nav data-amphora="index" aria-label={week.week ? `Stories in ${week.week}` : "Stories in this collection"}>
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
                <Link
                  href={`/myths/${entry.slug}`}
                  onClick={() => handleOpened(entry.slug)}
                >
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
