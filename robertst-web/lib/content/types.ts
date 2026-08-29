/**
 * The content domain. Types only — safe to import from client components.
 *
 * The rules these types exist to enforce:
 *   - a published StoryVersion is immutable; revising a myth adds a version
 *   - full story text never reaches a reader who is not entitled to it, which
 *     is why ResolvedStory is a discriminated union: the "locked" case has no
 *     `parts` field to leak
 *   - exactly VASE_SLOTS entries of a week are carried on the amphora
 */

export type MythSlug = string;

export type Myth = {
  id: string;
  slug: MythSlug;
  title: string;
};

/** One editorial unit of a story. `previewUntil` names one of these by id. */
export type StoryPart = {
  id: string;
  heading: string;
  paragraphs: string[];
};

export type StoryVersion = {
  mythId: string;
  mythSlug: MythSlug;
  version: number;
  publishedAt: string;
  /** One or two sentences. Shown for locked stories and in the newsletter. */
  teaser: string;
  /** Path under /public, or null while a myth is still using the fallback device. */
  drawing: string | null;
  /** Id of the last part a free reader receives. */
  previewUntil: string;
  parts: StoryPart[];
};

/** What a version exposes when the reader is not entitled to the text. */
export type StoryCard = Pick<StoryVersion, "version" | "publishedAt" | "teaser" | "drawing">;

export type StoryAccess = "preview" | "locked";

export type WeekEntry = {
  mythSlug: MythSlug;
  version: number;
  access: StoryAccess;
  /**
   * Which panel of the amphora carries this story, or null if the week has more
   * stories than the vessel has slots. See VASE_SLOT_ANGLES.
   */
  vaseSlot: number | null;
};

export type WeeklyCollection = {
  /** ISO week, e.g. "2026-W34". Sorts lexicographically. */
  week: string;
  publishedAt: string;
  entries: WeekEntry[];
};

/** The outcome of applying access rules. Server-side only decision. */
export type ResolvedStory =
  | { kind: "full"; myth: Myth; story: StoryVersion }
  | {
      kind: "preview";
      myth: Myth;
      story: StoryVersion;
      /** Parts the reader gets. Always a prefix of story.parts. */
      parts: StoryPart[];
      withheld: number;
    }
  | { kind: "locked"; myth: Myth; card: StoryCard };
