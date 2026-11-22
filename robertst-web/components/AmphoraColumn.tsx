/**
 * The pedestal the vessel stands on: an Ionic capital over a fluted shaft,
 * seen from slightly below and fading out before it reaches the reader.
 *
 * Drawn rather than photographed so it can be lit to match the scene and
 * masked without a cutout, and drawn from the order's own geometry rather than
 * from an impression of it. Four things do most of the work:
 *
 *   Seen from below. Every horizontal circle on a column — the bead band, the
 *   top of the shaft, the underside of the abacus — projects to an ellipse
 *   whose near edge bows *downward*, and the undersides that a level view
 *   hides come into sight. BOW is that whole effect in one number. Without it
 *   a drawn column reads as an elevation drawing pasted onto a photograph.
 *
 *   The flutes are projected, not evenly spaced. A fluted shaft is a cylinder,
 *   so flutes at equal angles round it land at sin(theta) across the drawing —
 *   wide in the middle, crowding toward the silhouette. Spacing them evenly is
 *   the single thing that makes a drawn column read as a flat striped tube.
 *
 *   Each flute is shaded as the concave channel it is. A convex cylinder is
 *   bright on the side facing the light; a hollow in that cylinder is the
 *   opposite — its lit-facing wall is turned away from the light and goes
 *   dark, and the far wall catches it. That inversion is what the eye reads as
 *   "carved" rather than "painted on".
 *
 *   The shaft darkens downward. Marble this far below the capital is out of
 *   the light, and a shaft of even tone reads as a cardboard tube however well
 *   its flutes are modelled. The mask that fades it out is a separate thing
 *   and does not substitute for this.
 *
 * Everything here is pure geometry evaluated once at module load. Placement,
 * the fade and responsive sizing are CSS: see `.myth-column` in
 * `app/globals.css`.
 */

/* ── Stone ──────────────────────────────────────────────────────────────── */

const STONE = [122, 118, 112];

/**
 * A lit tone of the stone. Above 1 the highlight drifts toward white rather
 * than simply scaling, because scaling a grey only ever gets you a paler grey
 * and sunlit marble goes bleached.
 */
function tone(level: number): string {
  const over = Math.max(0, level - 1);
  const channels = STONE.map((value) => {
    const lit = value * Math.min(level, 1.1);
    return Math.round(Math.min(255, lit + (255 - lit) * over * 0.46));
  });
  return `rgb(${channels[0]},${channels[1]},${channels[2]})`;
}

/**
 * Lambert against the scene's key light, which comes from the upper left and
 * slightly in front — the same direction the vessel above is lit from.
 */
const LIGHT = { x: -0.4, y: 0.8 };
const PEAK = Math.hypot(LIGHT.x, LIGHT.y);

function lambert(theta: number): number {
  const facing = LIGHT.x * Math.sin(theta) + LIGHT.y * Math.cos(theta);
  return 0.44 + 0.9 * Math.max(0, facing / PEAK);
}

/* ── The low angle ──────────────────────────────────────────────────────── */

/**
 * How far a horizontal circle's near edge drops below its far edge, in viewBox
 * units.
 *
 * The column paints about 190px wide, so the viewBox is very nearly 1:1 with
 * screen pixels: a bow of 7 was 7px of sag on an edge 180px long, which is a
 * slope of two degrees and reads as nothing at all. A low angle has to be
 * drawn at a size the eye can find.
 */
const BOW = 13;

const CENTRE = 100;

/** The arc a horizontal edge of half-width `half` makes at height `y`. */
function bowed(half: number, y: number, depth = BOW): string {
  const left = CENTRE - half;
  const right = CENTRE + half;
  return `M${left} ${y} Q${CENTRE} ${y + depth * 2} ${right} ${y}`;
}

/** The same arc as a closed band between two heights. */
function bowedBand(half: number, top: number, bottom: number, depth = BOW): string {
  const left = CENTRE - half;
  const right = CENTRE + half;
  return (
    `M${left} ${top} Q${CENTRE} ${top + depth * 2} ${right} ${top} ` +
    `L${right} ${bottom} Q${CENTRE} ${bottom + depth * 2} ${left} ${bottom} Z`
  );
}

/* ── Shaft ──────────────────────────────────────────────────────────────── */

const SHAFT_TOP = 122;
const SHAFT_BOTTOM = 300;
const HALF_TOP = 60;
const HALF_BOTTOM = 67;
/** Entasis: the shaft's sides bow out a little rather than running straight. */
const ENTASIS = 2;

function halfWidth(y: number): number {
  const t = (y - SHAFT_TOP) / (SHAFT_BOTTOM - SHAFT_TOP);
  return HALF_TOP + (HALF_BOTTOM - HALF_TOP) * t + ENTASIS * Math.sin(Math.PI * t);
}

/** `share` is 0 at the left silhouette and 1 at the right. */
function at(share: number, y: number): number {
  return CENTRE + (share * 2 - 1) * halfWidth(y);
}

/**
 * Where a point at `share` across the drum sits vertically on the bowed top
 * edge: the near face of the drum hangs lowest in the middle.
 */
const brow = (share: number) => SHAFT_TOP + BOW * 2 * (1 - Math.abs(share * 2 - 1));

const RUNGS = [0, 0.16, 0.34, 0.52, 0.7, 0.86, 1].map(
  (t) => SHAFT_TOP + (SHAFT_BOTTOM - SHAFT_TOP) * t,
);

function side(share: number, downward: boolean): string {
  const rungs = downward ? RUNGS : [...RUNGS].reverse();
  return rungs
    .map((y, index) => {
      const at0 = at(share, Math.max(y, brow(share)));
      return `${at0.toFixed(1)} ${Math.max(y, index === 0 && downward ? brow(share) : y).toFixed(1)}`;
    })
    .join(" L");
}

/**
 * Twenty-four flutes round the shaft is the canonical Ionic count; twelve of
 * them face the viewer. Each is a channel with a flat fillet beside it — the
 * fillet is what separates Ionic fluting from Doric, where the channels meet
 * at a sharp arris.
 */
const FLUTE_COUNT = 24;
const FILLET_SHARE = 0.26;

const flutes = Array.from({ length: FLUTE_COUNT / 2 }, (_, index) => {
  const step = Math.PI / (FLUTE_COUNT / 2);
  const from = -Math.PI / 2 + index * step;
  const to = from + step;
  const inset = step * FILLET_SHARE * 0.5;

  // sin() is the orthographic projection of a point on the cylinder: this is
  // the whole of why the flutes crowd toward the edges.
  const project = (theta: number) => 0.5 + 0.5 * Math.sin(theta);
  const left = project(from + inset);
  const right = project(to - inset);
  const level = lambert((from + to) / 2);

  return { left, right, level, index };
}).filter((flute) => flute.right - flute.left > 0.004);

/* ── Volutes ────────────────────────────────────────────────────────────── */

/**
 * One scroll, as a band whose width tapers as it winds in. Built by walking a
 * logarithmic spiral and offsetting to either side of it, then closing the two
 * runs into a single filled path.
 */
function voluteBand(
  cx: number,
  cy: number,
  outer: number,
  eye: number,
  turns: number,
  startDeg: number,
  direction: 1 | -1,
): string {
  const total = turns * 2 * Math.PI;
  const decay = Math.log(outer / eye) / total;
  const step = (8 * Math.PI) / 180;

  const near: string[] = [];
  const far: string[] = [];

  for (let t = 0; t <= total + 1e-9; t += step) {
    const angle = (startDeg * Math.PI) / 180 + direction * t;
    const radius = outer * Math.exp(-decay * t);
    // The fillet narrows with the coil, but not as fast, or the last turn
    // disappears before it reaches the eye.
    const width = 3 + 6.5 * Math.pow(radius / outer, 0.7);

    const nx = cx + Math.cos(angle) * (radius + width / 2);
    const ny = cy + Math.sin(angle) * (radius + width / 2);
    const fx = cx + Math.cos(angle) * (radius - width / 2);
    const fy = cy + Math.sin(angle) * (radius - width / 2);

    near.push(`${nx.toFixed(1)} ${ny.toFixed(1)}`);
    far.unshift(`${fx.toFixed(1)} ${fy.toFixed(1)}`);
  }

  return `M${near.join(" L")} L${far.join(" L")} Z`;
}

const VOLUTE_LEFT = voluteBand(48, 62, 27, 4.4, 2.4, -96, 1);
const VOLUTE_RIGHT = voluteBand(152, 62, 27, 4.4, 2.4, -84, -1);

/* ── Bead and reel ──────────────────────────────────────────────────────── */

const BEAD_TOP = 94;
const BEAD_BOTTOM = 114;
const BEADS = 9;
const BEAD_Y = (BEAD_TOP + BEAD_BOTTOM) / 2;

const beads = Array.from({ length: BEADS }, (_, index) => {
  const share = (index + 0.5) / BEADS;
  // The band wraps the same cylinder the shaft does, so it takes the same
  // projection and the same light — and it sags with the same low angle.
  const theta = Math.asin(Math.min(1, Math.max(-1, share * 2 - 1)));
  return {
    x: 32 + share * 136,
    y: BEAD_Y + BOW * 1.1 * (1 - Math.abs(share * 2 - 1)),
    level: 0.6 + 0.4 * lambert(theta),
    index,
  };
});

/** Water stains, placed off the regular flute rhythm so they read as damage. */
const STAINS = [
  { share: 0.16, width: 0.035, opacity: 0.16 },
  { share: 0.37, width: 0.022, opacity: 0.12 },
  { share: 0.63, width: 0.03, opacity: 0.15 },
  { share: 0.82, width: 0.018, opacity: 0.1 },
];

export default function AmphoraColumn() {
  return (
    <div className="myth-column" aria-hidden="true">
      <svg viewBox="0 0 200 300" preserveAspectRatio="xMidYMin slice" focusable="false">
        <defs>
          {/* The shaft's own cylinder shading, under the flutes. */}
          <linearGradient id="myth-column-drum" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={tone(0.34)} />
            <stop offset="0.1" stopColor={tone(0.66)} />
            <stop offset="0.3" stopColor={tone(1.26)} />
            <stop offset="0.52" stopColor={tone(1.08)} />
            <stop offset="0.8" stopColor={tone(0.62)} />
            <stop offset="1" stopColor={tone(0.3)} />
          </linearGradient>

          {/* Out of the capital's light the further down it goes. */}
          <linearGradient id="myth-column-depth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000000" stopOpacity="0" />
            <stop offset="0.45" stopColor="#060d18" stopOpacity="0.22" />
            <stop offset="1" stopColor="#060d18" stopOpacity="0.72" />
          </linearGradient>

          {/* One per flute: dark on the wall turned away from the light,
              lighter on the wall that catches it — but never lighter than the
              fillet beside it. A channel that out-shines the flat strip next
              to it stops reading as a hollow and starts reading as a rod, and
              a row of rods is what a drawn column usually looks like. */}
          {flutes.map((flute) => (
            <linearGradient
              key={flute.index}
              id={`myth-flute-${flute.index}`}
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <stop offset="0" stopColor={tone(flute.level * 0.26)} />
              <stop offset="0.24" stopColor={tone(flute.level * 0.4)} />
              <stop offset="0.7" stopColor={tone(flute.level * 0.74)} />
              <stop offset="1" stopColor={tone(flute.level * 0.92)} />
            </linearGradient>
          ))}

          {/* The beads are turned out of the same cylinder, so each is lit
              from the upper left and shaded away from it. */}
          {beads.map((bead) => (
            <radialGradient
              key={bead.index}
              id={`myth-bead-${bead.index}`}
              cx="0.34"
              cy="0.28"
              r="0.84"
            >
              <stop offset="0" stopColor={tone(bead.level * 1.26)} />
              <stop offset="0.5" stopColor={tone(bead.level * 0.92)} />
              <stop offset="1" stopColor={tone(bead.level * 0.48)} />
            </radialGradient>
          ))}

          <linearGradient id="myth-column-slab" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={tone(1.55)} />
            <stop offset="0.5" stopColor={tone(1.18)} />
            <stop offset="1" stopColor={tone(0.8)} />
          </linearGradient>

          {/* The soffit takes no direct light at all, only what comes back up
              off the cloud — so it is dark, but it is still marble and it is
              brightest along its near edge, where the bounce reaches it. */}
          <linearGradient id="myth-column-soffit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={tone(0.3)} />
            <stop offset="0.62" stopColor={tone(0.46)} />
            <stop offset="1" stopColor={tone(0.72)} />
          </linearGradient>

          <linearGradient id="myth-column-cushion" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={tone(0.4)} />
            <stop offset="0.3" stopColor={tone(1.16)} />
            <stop offset="0.62" stopColor={tone(0.92)} />
            <stop offset="1" stopColor={tone(0.38)} />
          </linearGradient>
        </defs>

        {/* ── Shaft ───────────────────────────────────────────────────── */}
        <g>
          <path
            d={`M${side(0, true)} L${side(1, false)} Z`}
            fill="url(#myth-column-drum)"
          />

          {flutes.map((flute) => (
            <path
              key={flute.index}
              d={`M${side(flute.left, true)} L${side(flute.right, false)} Z`}
              fill={`url(#myth-flute-${flute.index})`}
            />
          ))}

          {/* Each channel ends in a rounded head below the bead band. It is a
              recess, so it reads as the shadow under the moulding — filled
              light it caps every flute like the end of a pipe. */}
          {flutes.map((flute) => {
            const mid = (flute.left + flute.right) / 2;
            return (
              <ellipse
                key={flute.index}
                cx={at(mid, SHAFT_TOP)}
                cy={brow(mid) + 2}
                rx={(at(flute.right, SHAFT_TOP) - at(flute.left, SHAFT_TOP)) / 2}
                ry="2.6"
                fill={tone(flute.level * 0.34)}
              />
            );
          })}

          {/* Weathering: a few long stains where water has run down the stone,
              following the flutes rather than crossing them. */}
          {STAINS.map((stain) => (
            <path
              key={stain.share}
              d={`M${side(stain.share, true)} L${side(stain.share + stain.width, false)} Z`}
              fill={tone(0.42)}
              opacity={stain.opacity}
            />
          ))}

          <path
            d={`M${side(0, true)} L${side(1, false)} Z`}
            fill="url(#myth-column-depth)"
          />
        </g>

        {/* ── Bead and reel, sagging with the low angle ────────────────── */}
        <path d={bowedBand(70, BEAD_TOP, BEAD_BOTTOM, BOW * 1.1)} fill={tone(0.44)} />
        {beads.map((bead) => (
          <circle
            key={bead.index}
            cx={bead.x}
            cy={bead.y}
            r="7.6"
            fill={`url(#myth-bead-${bead.index})`}
          />
        ))}
        {/* the reel's own shadow under the beads */}
        <path
          d={bowed(70, BEAD_BOTTOM - 1, BOW * 1.1)}
          fill="none"
          stroke={tone(0.3)}
          strokeWidth="3"
        />

        {/* ── Volutes, over the cushion that joins them ────────────────── */}
        <path d="M30 92 Q100 108 170 92 L170 36 Q100 30 30 36 Z" fill="url(#myth-column-cushion)" />
        {[0, 1, 2, 3, 4].map((band) => (
          <path
            key={band}
            d={`M${80 + band * 10} 34 Q${82 + band * 10} 64 ${80 + band * 10} 96`}
            stroke={tone(0.46)}
            strokeWidth="1.6"
            fill="none"
            opacity="0.75"
          />
        ))}

        <g>
          <path d={VOLUTE_LEFT} fill={tone(1.12)} />
          <path d={VOLUTE_RIGHT} fill={tone(0.86)} />
          <circle cx="48" cy="62" r="4.4" fill={tone(1.5)} stroke={tone(0.4)} strokeWidth="1.4" />
          <circle cx="152" cy="62" r="4.4" fill={tone(1.2)} stroke={tone(0.38)} strokeWidth="1.4" />
        </g>

        {/* ── Abacus ───────────────────────────────────────────────────
               Where the low angle is most of all. From below, a slab shows
               its *underside* and hides its top: the bright top face a level
               view would give you is simply not drawn, and in its place is a
               deep bowed soffit lit only by what bounces back up off the
               cloud. The vase above it sits on a surface the reader cannot
               see, which is exactly the cue that says they are beneath it. */}
        <path d={bowedBand(92, 15, 31, BOW)} fill="url(#myth-column-soffit)" />
        <path d={bowed(92, 29.5, BOW)} fill="none" stroke={tone(0.95)} strokeWidth="2.2" />
        <rect x="8" y="2" width="184" height="14" rx="1" fill="url(#myth-column-slab)" />
        {/* The front face's lower lip catches the light; its top edge does not,
            because from here the top edge is going away from the eye. */}
        <rect x="8" y="13" width="184" height="3" fill={tone(1.45)} />
      </svg>
    </div>
  );
}
