/**
 * The pedestal the vessel stands on: an Ionic capital over a fluted shaft,
 * fading out before it reaches the reader.
 *
 * Drawn rather than photographed so it can be lit to match the scene and
 * masked without a cutout, and drawn from the order's own geometry rather than
 * from an impression of it. Three things do most of the work:
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
 *   The volutes are tapering bands, not strokes. A real scroll narrows as it
 *   winds in; a constant-width stroke reads as a coil of rope.
 *
 * Everything here is pure geometry evaluated once at module load. Placement,
 * the fade and responsive sizing are CSS: see `.myth-column` in
 * `app/globals.css`.
 */

/* ── Stone ──────────────────────────────────────────────────────────────── */

const STONE = [106, 103, 97];

/**
 * A lit tone of the stone. Above 1 the highlight drifts toward white rather
 * than simply scaling, because scaling a grey only ever gets you a paler grey
 * and sunlit limestone goes faintly bleached.
 */
function tone(level: number): string {
  const over = Math.max(0, level - 1);
  const channels = STONE.map((value) => {
    const lit = value * Math.min(level, 1.12);
    return Math.round(Math.min(255, lit + (255 - lit) * over * 0.42));
  });
  return `rgb(${channels[0]},${channels[1]},${channels[2]})`;
}

/**
 * Lambert against the scene's key light, which comes from the upper left and
 * slightly in front — the same direction the vessel above is lit from, and the
 * same side the temple burns on.
 */
const LIGHT = { x: -0.4, y: 0.8 };
const PEAK = Math.hypot(LIGHT.x, LIGHT.y);

function lambert(theta: number): number {
  const facing = LIGHT.x * Math.sin(theta) + LIGHT.y * Math.cos(theta);
  return 0.42 + 0.86 * Math.max(0, facing / PEAK);
}

/* ── Shaft ──────────────────────────────────────────────────────────────── */

const SHAFT_TOP = 92;
const SHAFT_BOTTOM = 300;
const HALF_TOP = 54;
const HALF_BOTTOM = 63;
/** Entasis: the shaft's sides bow out a little rather than running straight. */
const ENTASIS = 1.8;

const CENTRE = 100;

function halfWidth(y: number): number {
  const t = (y - SHAFT_TOP) / (SHAFT_BOTTOM - SHAFT_TOP);
  return HALF_TOP + (HALF_BOTTOM - HALF_TOP) * t + ENTASIS * Math.sin(Math.PI * t);
}

/** `share` is 0 at the left silhouette and 1 at the right. */
function at(share: number, y: number): number {
  return CENTRE + (share * 2 - 1) * halfWidth(y);
}

/** Vertical steps used to trace a side that is curved rather than straight. */
const RUNGS = [0, 0.18, 0.36, 0.54, 0.72, 0.86, 1].map(
  (t) => SHAFT_TOP + (SHAFT_BOTTOM - SHAFT_TOP) * t,
);

function side(share: number, downward: boolean): string {
  const rungs = downward ? RUNGS : [...RUNGS].reverse();
  return rungs.map((y) => `${at(share, y).toFixed(1)} ${y.toFixed(1)}`).join(" L");
}

/**
 * Twenty-four flutes round the shaft is the canonical Ionic count; twelve of
 * them face the viewer. Each is a channel with a flat fillet beside it — the
 * fillet is what separates Ionic fluting from Doric, where the channels meet
 * at a sharp arris.
 */
const FLUTE_COUNT = 24;
const FILLET_SHARE = 0.3;

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
    const width = 2.2 + 5.2 * Math.pow(radius / outer, 0.72);

    const nx = cx + Math.cos(angle) * (radius + width / 2);
    const ny = cy + Math.sin(angle) * (radius + width / 2);
    const fx = cx + Math.cos(angle) * (radius - width / 2);
    const fy = cy + Math.sin(angle) * (radius - width / 2);

    near.push(`${nx.toFixed(1)} ${ny.toFixed(1)}`);
    far.unshift(`${fx.toFixed(1)} ${fy.toFixed(1)}`);
  }

  return `M${near.join(" L")} L${far.join(" L")} Z`;
}

const VOLUTE_LEFT = voluteBand(48, 46, 23, 4.2, 2.3, -96, 1);
const VOLUTE_RIGHT = voluteBand(152, 46, 23, 4.2, 2.3, -84, -1);

/* ── Egg and dart ───────────────────────────────────────────────────────── */

const ECHINUS_TOP = 64;
const ECHINUS_BOTTOM = 80;
const EGGS = 7;

const eggs = Array.from({ length: EGGS }, (_, index) => {
  const share = (index + 0.5) / EGGS;
  // The band wraps the same cylinder the shaft is, so it takes the same
  // projection and the same light.
  const theta = Math.asin(Math.min(1, Math.max(-1, share * 2 - 1)));
  // Half the cylinder's swing. The band is 16 units tall on screen, and at
  // that size the far end going to full shadow reads as a gap in the carving.
  return { x: 32 + share * 136, level: 0.58 + 0.42 * lambert(theta), index };
});

/** Water stains, placed off the regular flute rhythm so they read as damage. */
const STAINS = [
  { share: 0.16, width: 0.035, opacity: 0.2 },
  { share: 0.37, width: 0.022, opacity: 0.14 },
  { share: 0.63, width: 0.03, opacity: 0.18 },
  { share: 0.82, width: 0.018, opacity: 0.12 },
];

export default function AmphoraColumn() {
  return (
    <div className="myth-column" aria-hidden="true">
      <svg viewBox="0 0 200 300" preserveAspectRatio="xMidYMin slice" focusable="false">
        <defs>
          {/* The shaft's own cylinder shading, under the flutes. */}
          <linearGradient id="myth-column-drum" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={tone(0.36)} />
            <stop offset="0.12" stopColor={tone(0.62)} />
            <stop offset="0.3" stopColor={tone(1.02)} />
            <stop offset="0.52" stopColor={tone(0.94)} />
            <stop offset="0.78" stopColor={tone(0.64)} />
            <stop offset="1" stopColor={tone(0.34)} />
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
              <stop offset="0" stopColor={tone(flute.level * 0.34)} />
              <stop offset="0.22" stopColor={tone(flute.level * 0.44)} />
              <stop offset="0.68" stopColor={tone(flute.level * 0.74)} />
              <stop offset="1" stopColor={tone(flute.level * 0.88)} />
            </linearGradient>
          ))}

          {/* The eggs are carved out of the same cylinder, so each is lit from
              the upper left and shaded away from it. */}
          {eggs.map((egg) => (
            <radialGradient
              key={egg.index}
              id={`myth-egg-${egg.index}`}
              cx="0.36"
              cy="0.3"
              r="0.82"
            >
              <stop offset="0" stopColor={tone(egg.level * 1.22)} />
              <stop offset="0.55" stopColor={tone(egg.level * 0.96)} />
              <stop offset="1" stopColor={tone(egg.level * 0.6)} />
            </radialGradient>
          ))}

          <linearGradient id="myth-column-slab" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={tone(1.18)} />
            <stop offset="0.3" stopColor={tone(1.0)} />
            <stop offset="1" stopColor={tone(0.58)} />
          </linearGradient>

          <linearGradient id="myth-column-bolster" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={tone(0.42)} />
            <stop offset="0.28" stopColor={tone(0.98)} />
            <stop offset="0.6" stopColor={tone(0.82)} />
            <stop offset="1" stopColor={tone(0.4)} />
          </linearGradient>

          {/* A torus reads as a band lit along a line, not as a flat strip. */}
          <linearGradient id="myth-column-bead" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={tone(0.56)} />
            <stop offset="0.36" stopColor={tone(1.14)} />
            <stop offset="1" stopColor={tone(0.5)} />
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

          {/* Each channel ends in a rounded head below the astragal. It is a
              recess, so it reads as the shadow under the moulding — filled
              light it caps every flute like the end of a pipe. */}
          {flutes.map((flute) => (
            <ellipse
              key={flute.index}
              cx={(at(flute.left, SHAFT_TOP) + at(flute.right, SHAFT_TOP)) / 2}
              cy={SHAFT_TOP + 2}
              rx={(at(flute.right, SHAFT_TOP) - at(flute.left, SHAFT_TOP)) / 2}
              ry="3"
              fill={tone(flute.level * 0.3)}
            />
          ))}

          {/* Weathering: a few long stains where water has run down the
              stone, following the flutes rather than crossing them. A noise
              filter was the obvious answer and the wrong one — feTurbulence
              replaces the graphic alpha and all, which milks the whole shaft
              and swallows the flute shading that does the real work. */}
          {STAINS.map((stain) => (
            <path
              key={stain.share}
              d={`M${side(stain.share, true)} L${side(stain.share + stain.width, false)} Z`}
              fill={tone(0.5)}
              opacity={stain.opacity}
            />
          ))}
        </g>

        {/* ── Astragal: the bead between shaft and capital ─────────────── */}
        <rect x={CENTRE - HALF_TOP - 2} y="84" width={(HALF_TOP + 2) * 2} height="8" rx="3.2" fill="url(#myth-column-bead)" />
        <rect x={CENTRE - HALF_TOP - 4} y="80" width={(HALF_TOP + 4) * 2} height="4.5" fill={tone(0.74)} />

        {/* ── Echinus: egg and dart ────────────────────────────────────── */}
        <rect x="30" y={ECHINUS_TOP} width="140" height={ECHINUS_BOTTOM - ECHINUS_TOP} fill={tone(0.66)} />
        {eggs.map((egg) => (
          <g key={egg.index}>
            {/* the shell around the egg */}
            {/* The shell, then the egg sitting in it. */}
            <ellipse cx={egg.x} cy={(ECHINUS_TOP + ECHINUS_BOTTOM) / 2} rx="9" ry="7.6" fill={tone(egg.level * 0.44)} />
            <ellipse
              cx={egg.x - 0.5}
              cy={(ECHINUS_TOP + ECHINUS_BOTTOM) / 2 + 0.5}
              rx="6.2"
              ry="5.6"
              fill={`url(#myth-egg-${egg.index})`}
            />
            {/* The dart: a tongue between two eggs, read at this size as the
                light wedge in the gap rather than as carved detail. */}
            <path
              d={`M${egg.x + 9.7} ${ECHINUS_TOP + 1.4} L${egg.x + 12.6} ${ECHINUS_TOP + 1.4} L${egg.x + 11.1} ${ECHINUS_BOTTOM - 1.6} Z`}
              fill={tone(egg.level * 0.92)}
            />
          </g>
        ))}

        {/* ── Volutes, over the bolster that joins them ────────────────── */}
        <path d="M34 62 Q100 70 166 62 L166 32 Q100 26 34 32 Z" fill="url(#myth-column-bolster)" />
        {[0, 1, 2, 3].map((band) => (
          <path
            key={band}
            d={`M${86 + band * 9.5} 30 Q${88 + band * 9.5} 46 ${86 + band * 9.5} 64`}
            stroke={tone(0.54)}
            strokeWidth="1.1"
            fill="none"
            opacity="0.7"
          />
        ))}

        <g>
          <path d={VOLUTE_LEFT} fill={tone(0.92)} />
          <path d={VOLUTE_RIGHT} fill={tone(0.78)} />
          <circle cx="48" cy="46" r="3.6" fill={tone(1.12)} stroke={tone(0.44)} strokeWidth="1.1" />
          <circle cx="152" cy="46" r="3.6" fill={tone(0.96)} stroke={tone(0.42)} strokeWidth="1.1" />
        </g>

        {/* ── Abacus ───────────────────────────────────────────────────── */}
        <path d="M22 22 Q22 17 27 17 L173 17 Q178 17 178 22 L178 26 L22 26 Z" fill={tone(0.72)} />
        <rect x="18" y="6" width="164" height="12" rx="1.2" fill="url(#myth-column-slab)" />
        <rect x="18" y="6" width="164" height="2.2" fill={tone(1.22)} />
      </svg>
    </div>
  );
}
