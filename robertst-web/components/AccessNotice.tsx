import Link from "next/link";

/**
 * The two places a free reader meets the edge of the week: the editorial cutoff
 * partway through a preview story, and a sealed story they cannot open at all.
 *
 * Same component because they are the same offer worded differently — and because
 * one CTA is easier to point at a real checkout later than two.
 */
export default function AccessNotice({
  variant,
  withheld,
}: {
  variant: "cutoff" | "sealed";
  withheld?: number;
}) {
  const cutoff = variant === "cutoff";

  return (
    <aside className={`myth-notice myth-notice--${variant}`}>
      <p className="myth-notice__mark" aria-hidden="true">
        ✦
      </p>

      <h2>{cutoff ? "The story continues past this line" : "This myth is sealed"}</h2>

      <p>
        {cutoff
          ? withheld && withheld > 0
            ? `${withheld} more ${withheld === 1 ? "part" : "parts"} remain, and the ending is one of them.`
            : "The remainder of this telling is kept for subscribers."
          : "It belongs to this week's five, but it opens only for subscribers."}
      </p>

      <Link href="/subscribe" className="myth-notice__cta">
        Unlock the weekly Amphora
      </Link>

      <p className="myth-notice__fine">
        Five myths a week, entire. New tellings and revisions as they are painted.
      </p>
    </aside>
  );
}
