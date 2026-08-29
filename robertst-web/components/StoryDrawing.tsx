import Image from "next/image";

/**
 * A story's illustration, or the sealed device that stands in until one exists.
 *
 * Drawings live in `public/images/myths/` and are named in a version's
 * frontmatter. The fallback is deliberately ornamental rather than a broken-image
 * placeholder: a myth without art yet should still look like part of the vessel.
 */
export default function StoryDrawing({
  drawing,
  title,
  sealed = false,
}: {
  drawing: string | null;
  title: string;
  sealed?: boolean;
}) {
  if (drawing) {
    return (
      <div className="myth-drawing">
        <Image src={drawing} alt={`Illustration for ${title}`} fill sizes="(max-width: 40rem) 90vw, 28rem" />
      </div>
    );
  }

  return (
    <div className={`myth-drawing myth-drawing--device${sealed ? " myth-drawing--sealed" : ""}`} role="img" aria-label={`No illustration for ${title} yet`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
        <circle cx="60" cy="60" r="38" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={60 + Math.cos(a) * 38}
              y1={60 + Math.sin(a) * 38}
              x2={60 + Math.cos(a) * 46}
              y2={60 + Math.sin(a) * 46}
              stroke="currentColor"
              strokeWidth="0.8"
              opacity="0.4"
            />
          );
        })}
        {sealed && (
          <>
            {/* a wax seal, impressed with the rosette the vessel already wears */}
            <circle cx="60" cy="60" r="19" fill="currentColor" opacity="0.5" />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
              return (
                <circle
                  key={`petal-${i}`}
                  cx={60 + Math.cos(a) * 10}
                  cy={60 + Math.sin(a) * 10}
                  r="3.6"
                  fill="var(--myth-seal-ground, #06152f)"
                  opacity="0.85"
                />
              );
            })}
            <circle cx="60" cy="60" r="4" fill="var(--myth-seal-ground, #06152f)" opacity="0.85" />
            <circle cx="60" cy="60" r="1.6" fill="currentColor" opacity="0.8" />
          </>
        )}
      </svg>
    </div>
  );
}
