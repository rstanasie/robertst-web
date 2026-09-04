"use strict";

// Black-figure scenes, authored in figure units (x right, y up). Each figure is
// auto-fitted to its panel, so the numbers here only need to be self-consistent.
//
// Palette keys: "glaze" (black slip), "clay" (the reserved ground, used for the
// incised lines that cut back through the glaze), "red" and "white" (added
// colour, painted over the fired glaze the way Attic painters did).

function limb(points, width, taper) {
  return { k: "stroke", pts: points, w: width, taper: taper === undefined ? 0.62 : taper, c: "glaze" };
}

// Archaic wing. A solid covert body along the bowed leading edge, then separate
// flight feathers fanning past it with gaps of reserved ground between them.
// Those gaps are the whole trick: without them the feathers merge and the wing
// reads as a curved plank.
function wing(root, tip, chord, bow, count) {
  const dx = tip[0] - root[0];
  const dy = tip[1] - root[1];
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const control = [root[0] + dx * 0.5 + px * bow * length, root[1] + dy * 0.5 + py * bow * length];
  const lead = (t) => {
    const m = 1 - t;
    return [
      m * m * root[0] + 2 * m * t * control[0] + t * t * tip[0],
      m * m * root[1] + 2 * m * t * control[1] + t * t * tip[1],
    ];
  };
  const chordAt = (t) => chord * (1 - 0.40 * t * t);
  const COVERT = 0.46;

  const steps = 20;
  const covert = [];
  for (let i = 0; i <= steps; i++) covert.push(lead(i / steps));
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const p = lead(t);
    const c = chordAt(t) * COVERT;
    covert.push([p[0] - px * c, p[1] - py * c]);
  }
  const ops = [{ k: "poly", pts: covert, c: "glaze" }];

  const t0 = 0.10;
  const t1 = 0.98;
  const span = (t1 - t0) / count;
  const half = span * length * 0.33;
  for (let i = 0; i < count; i++) {
    const t = t0 + span * (i + 0.5);
    const p = lead(t);
    const c = chordAt(t);
    const sweep = -0.34 * c;
    const inner = [p[0] - px * c * 0.34, p[1] - py * c * 0.34];
    const outer = [p[0] - px * c * 1.10 + ux * sweep, p[1] - py * c * 1.10 + uy * sweep];
    ops.push({ k: "poly", pts: [
      [inner[0] + ux * half, inner[1] + uy * half],
      [outer[0] + ux * half * 0.62, outer[1] + uy * half * 0.62],
      [outer[0] - ux * half * 0.62, outer[1] - uy * half * 0.62],
      [inner[0] - ux * half, inner[1] - uy * half],
    ], c: "glaze" });
  }

  // the single incised line where the coverts meet the flight feathers
  const seam = [];
  for (let i = 1; i <= steps - 1; i++) {
    const t = i / steps;
    const p = lead(t);
    const c = chordAt(t) * COVERT * 0.80;
    seam.push([p[0] - px * c, p[1] - py * c]);
  }
  ops.push({ k: "stroke", pts: seam, w: 0.012, taper: 0, c: "clay" });
  return ops;
}

// --- Prometheus: the fire-bringer striding out with a lit torch -------------
const prometheus = [
  // back leg
  limb([[-0.050, 0.415], [-0.132, 0.245], [-0.158, 0.072]], 0.070, 0.28),
  { k: "poly", pts: [[-0.186, 0.078], [-0.046, 0.040], [-0.040, 0.000], [-0.202, 0.006]], c: "glaze" },
  // trailing arm
  limb([[-0.120, 0.762], [-0.216, 0.652], [-0.180, 0.540]], 0.060, 0.30),
  { k: "ell", c: [-0.172, 0.512], r: [0.034, 0.032], col: "glaze" },
  // torso
  { k: "poly", pts: [
    [-0.146, 0.800], [0.136, 0.800], [0.158, 0.732], [0.122, 0.618],
    [0.100, 0.548], [-0.092, 0.548], [-0.118, 0.626], [-0.144, 0.734],
  ], c: "glaze" },
  // short chiton
  { k: "poly", pts: [
    [-0.112, 0.566], [0.112, 0.566], [0.164, 0.400], [0.120, 0.348],
    [-0.128, 0.348], [-0.168, 0.400],
  ], c: "glaze" },
  // front leg
  limb([[0.052, 0.400], [0.146, 0.244], [0.170, 0.078]], 0.074, 0.28),
  { k: "poly", pts: [[0.142, 0.082], [0.276, 0.050], [0.280, 0.008], [0.156, 0.012]], c: "glaze" },
  // raised arm and torch
  limb([[0.104, 0.780], [0.190, 0.842], [0.252, 0.908]], 0.062, 0.26),
  { k: "ell", c: [0.266, 0.926], r: [0.035, 0.033], col: "glaze" },
  { k: "stroke", pts: [[0.220, 0.884], [0.372, 0.976]], w: 0.030, taper: 0, c: "glaze" },
  { k: "poly", pts: [[0.348, 0.948], [0.416, 0.986], [0.398, 1.016], [0.330, 0.980]], c: "glaze" },
  // flame
  { k: "poly", pts: [
    [0.352, 0.976], [0.446, 0.958], [0.528, 1.012], [0.500, 1.062],
    [0.582, 1.090], [0.496, 1.146], [0.524, 1.196], [0.428, 1.170],
    [0.412, 1.222], [0.356, 1.148], [0.298, 1.170], [0.318, 1.086],
    [0.264, 1.048], [0.328, 1.018],
  ], c: "red" },
  { k: "stroke", pts: [[0.370, 1.008], [0.436, 1.076], [0.408, 1.152]], w: 0.020, taper: 0, c: "glaze" },
  { k: "stroke", pts: [[0.472, 1.036], [0.502, 1.098]], w: 0.015, taper: 0, c: "glaze" },
  // head, profile, facing the flame
  { k: "poly", pts: [
    [-0.038, 0.850], [-0.074, 0.874], [-0.088, 0.926], [-0.058, 0.986],
    [0.008, 1.016], [0.070, 0.998], [0.096, 0.958], [0.118, 0.920],
    [0.086, 0.910], [0.080, 0.876], [0.054, 0.854], [0.058, 0.830],
    [0.034, 0.784], [-0.008, 0.768], [-0.048, 0.788], [-0.066, 0.820],
  ], c: "glaze" },
  { k: "ell", c: [0.046, 0.952], r: [0.024, 0.016], col: "clay" },
  { k: "ell", c: [0.050, 0.952], r: [0.009, 0.009], col: "glaze" },
  { k: "stroke", pts: [[-0.058, 0.978], [0.002, 0.998], [0.056, 0.980]], w: 0.011, taper: 0, c: "red" },
  { k: "stroke", pts: [[0.012, 0.796], [0.046, 0.822]], w: 0.010, taper: 0, c: "clay" },
  // collarbone, belt, drapery
  { k: "stroke", pts: [[-0.124, 0.768], [0.000, 0.746], [0.122, 0.766]], w: 0.012, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.108, 0.572], [0.108, 0.572]], w: 0.016, taper: 0, c: "red" },
  { k: "stroke", pts: [[-0.070, 0.558], [-0.098, 0.364]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.008, 0.558], [-0.014, 0.356]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[0.056, 0.558], [0.074, 0.360]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.142, 0.496], [0.136, 0.490]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[0.116, 0.258], [0.164, 0.248]], w: 0.010, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.156, 0.250], [-0.110, 0.260]], w: 0.010, taper: 0, c: "clay" },
];

// --- Medusa: the winged gorgon, archaic running-kneeling pose ---------------
const medusa = [
  ...wing([-0.112, 0.744], [-0.376, 0.986], 0.230, 0.16, 6),
  ...wing([0.112, 0.744], [0.376, 0.986], 0.230, -0.16, 6),
  // trailing leg
  limb([[-0.070, 0.400], [-0.196, 0.312], [-0.264, 0.168]], 0.074, 0.26),
  { k: "poly", pts: [[-0.294, 0.176], [-0.386, 0.092], [-0.348, 0.052], [-0.244, 0.140]], c: "glaze" },
  // leading leg, knee down
  limb([[0.062, 0.400], [0.204, 0.300], [0.160, 0.140]], 0.076, 0.24),
  { k: "poly", pts: [[0.128, 0.148], [0.264, 0.108], [0.270, 0.060], [0.134, 0.074]], c: "glaze" },
  // torso
  { k: "poly", pts: [
    [-0.166, 0.784], [0.166, 0.784], [0.184, 0.700], [0.144, 0.556],
    [0.156, 0.462], [-0.156, 0.462], [-0.144, 0.556], [-0.184, 0.700],
  ], c: "glaze" },
  // belted skirt
  { k: "poly", pts: [
    [-0.160, 0.478], [0.160, 0.478], [0.204, 0.352], [0.156, 0.306],
    [-0.156, 0.306], [-0.204, 0.352],
  ], c: "glaze" },
  { k: "stroke", pts: [[-0.156, 0.486], [0.156, 0.486]], w: 0.018, taper: 0, c: "red" },
  { k: "stroke", pts: [[-0.078, 0.470], [-0.096, 0.316]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[0.000, 0.470], [0.000, 0.314]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[0.078, 0.470], [0.096, 0.316]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.150, 0.404], [0.150, 0.400]], w: 0.011, taper: 0, c: "clay" },
  // arms flung wide
  limb([[-0.164, 0.756], [-0.280, 0.664], [-0.262, 0.544]], 0.058, 0.30),
  { k: "ell", c: [-0.256, 0.514], r: [0.033, 0.031], col: "glaze" },
  limb([[0.164, 0.756], [0.280, 0.664], [0.262, 0.544]], 0.058, 0.30),
  { k: "ell", c: [0.256, 0.514], r: [0.033, 0.031], col: "glaze" },
  // snakes, curling out of the hair
  ...[-1.42, -1.10, -0.76, -0.40, 0.40, 0.76, 1.10, 1.42].map((a, i) => {
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const flip = i % 2 ? 1 : -1;
    const at = (d, off) => [sin * (0.128 + d) + flip * off * cos, 0.906 + cos * (0.128 + d) - flip * off * sin];
    return { k: "stroke", pts: [at(-0.010, 0), at(0.030, 0.038), at(0.066, -0.026), at(0.094, 0.026), at(0.112, 0.044)], w: 0.024, taper: 0.72, c: "glaze" };
  }),
  // gorgoneion
  { k: "ell", c: [0, 0.906], r: [0.146, 0.146], col: "glaze" },
  { k: "ell", c: [0, 0.906], r: [0.114, 0.118], col: "white" },
  { k: "ell", c: [-0.050, 0.944], r: [0.030, 0.022], col: "glaze" },
  { k: "ell", c: [0.050, 0.944], r: [0.030, 0.022], col: "glaze" },
  { k: "ell", c: [-0.050, 0.944], r: [0.012, 0.009], col: "white" },
  { k: "ell", c: [0.050, 0.944], r: [0.012, 0.009], col: "white" },
  { k: "stroke", pts: [[-0.090, 0.984], [-0.030, 0.996]], w: 0.014, taper: 0, c: "glaze" },
  { k: "stroke", pts: [[0.030, 0.996], [0.090, 0.984]], w: 0.014, taper: 0, c: "glaze" },
  { k: "stroke", pts: [[0.000, 0.964], [0.000, 0.900]], w: 0.011, taper: 0, c: "glaze" },
  { k: "poly", pts: [
    [-0.092, 0.876], [0.092, 0.876], [0.074, 0.834], [0.000, 0.814], [-0.074, 0.834],
  ], c: "glaze" },
  { k: "poly", pts: [[-0.072, 0.870], [-0.048, 0.870], [-0.058, 0.838]], c: "white" },
  { k: "poly", pts: [[0.048, 0.870], [0.072, 0.870], [0.058, 0.838]], c: "white" },
  { k: "poly", pts: [[-0.021, 0.834], [0.021, 0.834], [0.014, 0.760], [-0.014, 0.760]], c: "red" },
];

// --- Icarus: the fall, and the sun that undid the wax ----------------------
const icarus = [
  { k: "ell", c: [0.470, 0.882], r: [0.074, 0.074], col: "red" },
  { k: "ell", c: [0.470, 0.882], r: [0.074, 0.074], col: "glaze", ring: 0.016 },
  ...Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { k: "stroke", pts: [
      [0.470 + Math.cos(a) * 0.090, 0.882 + Math.sin(a) * 0.090],
      [0.470 + Math.cos(a) * 0.148, 0.882 + Math.sin(a) * 0.148],
    ], w: 0.019, taper: 0.85, c: "glaze" };
  }),
  // wings, one still beating up, one collapsing
  ...wing([-0.092, 0.704], [-0.430, 0.936], 0.232, 0.16, 6),
  ...wing([0.100, 0.712], [0.322, 0.918], 0.176, -0.30, 4),
  // feathers already lost, drifting out of reach
  { k: "poly", pts: [[-0.310, 1.044], [-0.246, 1.096], [-0.226, 1.068], [-0.290, 1.022]], c: "glaze" },
  { k: "poly", pts: [[-0.098, 1.062], [-0.038, 1.106], [-0.018, 1.078], [-0.082, 1.040]], c: "glaze" },
  { k: "poly", pts: [[-0.404, 1.128], [-0.348, 1.174], [-0.328, 1.148], [-0.388, 1.106]], c: "glaze" },
  { k: "poly", pts: [[0.148, 1.076], [0.202, 1.116], [0.220, 1.090], [0.166, 1.054]], c: "glaze" },
  // trailing legs
  limb([[-0.034, 0.352], [-0.096, 0.196], [-0.176, 0.068]], 0.068, 0.28),
  { k: "poly", pts: [[-0.206, 0.080], [-0.286, 0.026], [-0.258, -0.008], [-0.164, 0.044]], c: "glaze" },
  limb([[0.044, 0.354], [0.104, 0.204], [0.104, 0.054]], 0.068, 0.28),
  { k: "poly", pts: [[0.076, 0.058], [0.192, 0.024], [0.198, -0.010], [0.078, 0.000]], c: "glaze" },
  // torso, arched back
  { k: "poly", pts: [
    [-0.130, 0.748], [0.118, 0.722], [0.150, 0.644], [0.118, 0.510],
    [0.092, 0.394], [-0.088, 0.388], [-0.108, 0.498], [-0.142, 0.650],
  ], c: "glaze" },
  { k: "stroke", pts: [[-0.112, 0.708], [0.012, 0.680], [0.114, 0.696]], w: 0.012, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.098, 0.556], [0.110, 0.544]], w: 0.012, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.080, 0.462], [0.096, 0.454]], w: 0.011, taper: 0, c: "clay" },
  // arms thrown back
  limb([[-0.124, 0.720], [-0.216, 0.614], [-0.184, 0.492]], 0.056, 0.30),
  { k: "ell", c: [-0.178, 0.464], r: [0.031, 0.030], col: "glaze" },
  limb([[0.118, 0.704], [0.200, 0.610], [0.168, 0.490]], 0.056, 0.30),
  { k: "ell", c: [0.162, 0.462], r: [0.031, 0.030], col: "glaze" },
  // head, thrown back
  { k: "poly", pts: [
    [-0.108, 0.756], [-0.146, 0.788], [-0.148, 0.852], [-0.112, 0.900],
    [-0.046, 0.916], [0.010, 0.892], [0.026, 0.852], [0.022, 0.814],
    [-0.010, 0.808], [-0.026, 0.778], [-0.062, 0.760],
  ], c: "glaze" },
  { k: "ell", c: [-0.042, 0.856], r: [0.022, 0.015], col: "clay" },
  { k: "ell", c: [-0.038, 0.856], r: [0.009, 0.009], col: "glaze" },
  { k: "stroke", pts: [[-0.130, 0.882], [-0.068, 0.906]], w: 0.011, taper: 0, c: "red" },
];

// --- Veiled: what a sealed slot carries ------------------------------------
// A shrouded standing form. Used where a myth in the week has no scene painted
// for it yet, so the frieze still reads as five figures rather than as a gap.
// Deliberately unreadable: it is a covered thing, not a censored one.
const veiled = [
  { k: "poly", pts: [
    [-0.026, 1.104], [0.026, 1.104], [0.086, 1.060], [0.124, 0.964],
    [0.152, 0.788], [0.174, 0.560], [0.202, 0.286], [0.222, 0.034],
    [-0.222, 0.034], [-0.202, 0.286], [-0.174, 0.560], [-0.152, 0.788],
    [-0.124, 0.964], [-0.086, 1.060],
  ], c: "glaze" },
  // the fillet at the crown, and folds falling from it
  { k: "stroke", pts: [[-0.098, 1.020], [0.098, 1.020]], w: 0.016, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.062, 1.006], [-0.104, 0.720], [-0.140, 0.300]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[0.000, 1.010], [0.004, 0.700], [0.000, 0.290]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[0.062, 1.006], [0.104, 0.720], [0.140, 0.300]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.186, 0.430], [0.186, 0.424]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.208, 0.180], [0.208, 0.176]], w: 0.011, taper: 0, c: "clay" },
];

// --- Dionysos: the god standing with the cup and the thyrsus ----------------
// Frontal torso, head in profile toward the cup, as archaic painters drew him.
// The two attributes carry the whole silhouette at frieze size: a kantharos held
// out on one side, a thyrsus taller than the god on the other.

// Ivy leaf: a pointed heart on a short stalk, `tilt` radians off horizontal.
// Drawn as one outline with a single incised midrib. A five-lobed outline loses
// its notches at frieze size and comes out as an arrowhead; a leaf assembled
// from discs comes out as a cloud. The silhouette has to do the work.
function ivyLeaf(x, y, size, side, tilt = 0) {
  const c = Math.cos(tilt);
  const t = Math.sin(tilt);
  const at = ([sx, sy]) => [x + side * (sx * c - sy * t) * size, y + (sx * t + sy * c) * size];
  return [
    { k: "stroke", pts: [at([0, 0]), at([0.24, 0])], w: 0.03 * size, taper: 0, c: "glaze" },
    { k: "poly", pts: [
      [0.08, 0.02], [0.22, 0.34], [0.48, 0.44], [0.74, 0.30],
      [1.02, 0.02], [0.72, -0.26], [0.46, -0.40], [0.20, -0.30],
    ].map(at), c: "glaze" },
    { k: "stroke", pts: [at([0.26, 0.01]), at([0.90, 0.02])], w: 0.06 * size, taper: 0, c: "clay" },
  ];
}

const dionysos = [
  // thyrsus, behind the figure
  { k: "stroke", pts: [[0.290, 0.020], [0.302, 0.580], [0.314, 1.086]], w: 0.028, taper: 0, c: "glaze" },
  // pine-cone finial: an elongated cone, latticed
  { k: "poly", pts: [
    [0.314, 1.222], [0.360, 1.170], [0.368, 1.116], [0.336, 1.076],
    [0.292, 1.076], [0.260, 1.116], [0.268, 1.170],
  ], c: "glaze" },
  { k: "stroke", pts: [[0.276, 1.104], [0.352, 1.156]], w: 0.009, taper: 0, c: "clay" },
  { k: "stroke", pts: [[0.272, 1.142], [0.340, 1.186]], w: 0.009, taper: 0, c: "clay" },
  { k: "stroke", pts: [[0.352, 1.104], [0.276, 1.156]], w: 0.009, taper: 0, c: "clay" },
  { k: "stroke", pts: [[0.356, 1.142], [0.288, 1.186]], w: 0.009, taper: 0, c: "clay" },
  // vine on the shaft, alternating sides
  ...ivyLeaf(0.300, 0.352, 0.130, 1, 0.55),
  ...ivyLeaf(0.296, 0.606, 0.124, -1, 0.55),
  ...ivyLeaf(0.306, 0.828, 0.130, 1, 0.55),
  ...ivyLeaf(0.310, 0.982, 0.114, -1, 0.55),

  // legs
  limb([[-0.056, 0.396], [-0.080, 0.216], [-0.074, 0.050]], 0.080, 0.24),
  { k: "poly", pts: [[-0.112, 0.056], [0.008, 0.038], [0.012, 0.000], [-0.120, 0.004]], c: "glaze" },
  limb([[0.064, 0.396], [0.092, 0.216], [0.106, 0.050]], 0.080, 0.24),
  { k: "poly", pts: [[0.070, 0.056], [0.190, 0.038], [0.194, 0.000], [0.062, 0.004]], c: "glaze" },

  // short draped skirt, gathered at the hip. Folds only — a cross line here
  // turns the drapery into a grid.
  { k: "poly", pts: [
    [-0.152, 0.578], [0.152, 0.578], [0.186, 0.428], [0.160, 0.348],
    [0.048, 0.374], [-0.048, 0.352], [-0.162, 0.374], [-0.186, 0.428],
  ], c: "glaze" },
  { k: "stroke", pts: [[-0.148, 0.588], [0.148, 0.588]], w: 0.020, taper: 0, c: "red" },
  { k: "stroke", pts: [[-0.092, 0.564], [-0.116, 0.386]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.014, 0.564], [-0.018, 0.368]], w: 0.011, taper: 0, c: "clay" },
  { k: "stroke", pts: [[0.064, 0.564], [0.086, 0.386]], w: 0.011, taper: 0, c: "clay" },

  // torso, frontal. Collarbone and the line under the chest, nothing else.
  { k: "poly", pts: [
    [-0.146, 0.828], [0.146, 0.828], [0.166, 0.756], [0.134, 0.660],
    [0.140, 0.572], [-0.140, 0.572], [-0.134, 0.660], [-0.166, 0.756],
  ], c: "glaze" },
  { k: "stroke", pts: [[-0.118, 0.802], [0.000, 0.780], [0.118, 0.802]], w: 0.012, taper: 0, c: "clay" },
  { k: "stroke", pts: [[-0.108, 0.706], [0.000, 0.692], [0.108, 0.706]], w: 0.012, taper: 0, c: "clay" },
  { k: "ell", c: [0.000, 0.622], r: [0.012, 0.010], col: "clay" },

  // arm out to the cup
  limb([[-0.140, 0.798], [-0.240, 0.780], [-0.312, 0.762]], 0.056, 0.28),
  { k: "ell", c: [-0.332, 0.756], r: [0.030, 0.029], col: "glaze" },
  // kantharos: deep bowl, tall foot, two loop handles standing above the rim
  { k: "poly", pts: [[-0.440, 0.830], [-0.324, 0.830], [-0.338, 0.768], [-0.426, 0.768]], c: "glaze" },
  { k: "stroke", pts: [[-0.382, 0.772], [-0.382, 0.744]], w: 0.022, taper: 0, c: "glaze" },
  { k: "poly", pts: [[-0.422, 0.744], [-0.342, 0.744], [-0.336, 0.726], [-0.428, 0.726]], c: "glaze" },
  { k: "stroke", pts: [[-0.438, 0.826], [-0.462, 0.842], [-0.460, 0.792], [-0.430, 0.776]], w: 0.013, taper: 0, c: "glaze" },
  { k: "stroke", pts: [[-0.326, 0.826], [-0.294, 0.842], [-0.296, 0.792], [-0.334, 0.776]], w: 0.013, taper: 0, c: "glaze" },
  { k: "stroke", pts: [[-0.434, 0.820], [-0.330, 0.820]], w: 0.012, taper: 0, c: "red" },

  // arm down, gripping the shaft
  limb([[0.140, 0.798], [0.226, 0.716], [0.274, 0.640]], 0.056, 0.28),
  { k: "ell", c: [0.296, 0.612], r: [0.030, 0.029], col: "glaze" },

  // Head in profile toward the cup. Head and beard are one silhouette, the way
  // archaic painters cut them, with the jaw marked by an incision — drawing the
  // beard as a second shape on top of the face turns the whole head into a blob.
  { k: "poly", pts: [
    [0.046, 0.846], [0.060, 0.906], [0.054, 0.958], [0.028, 1.000],
    [-0.016, 1.024], [-0.060, 1.008], [-0.084, 0.980], [-0.098, 0.960],
    [-0.134, 0.934], [-0.096, 0.924], [-0.086, 0.910], [-0.096, 0.884],
    [-0.088, 0.842], [-0.060, 0.802], [-0.026, 0.788], [0.010, 0.808],
  ], c: "glaze" },
  { k: "stroke", pts: [[0.040, 0.890], [-0.026, 0.900], [-0.086, 0.904]], w: 0.010, taper: 0, c: "clay" },
  { k: "ell", c: [-0.050, 0.964], r: [0.022, 0.015], col: "clay" },
  { k: "ell", c: [-0.056, 0.964], r: [0.008, 0.008], col: "glaze" },
  // ivy wreath: a red fillet across the brow, three leaves and two berries
  { k: "stroke", pts: [[-0.090, 0.982], [-0.010, 1.002], [0.050, 0.980]], w: 0.015, taper: 0, c: "red" },
  ...ivyLeaf(-0.078, 0.994, 0.068, -1, 0.35),
  ...ivyLeaf(-0.012, 1.012, 0.068, 1, 0.95),
  ...ivyLeaf(0.042, 0.990, 0.064, 1, 0.2),
  { k: "ell", c: [-0.044, 1.006], r: [0.011, 0.011], col: "red" },
  { k: "ell", c: [0.022, 0.998], r: [0.010, 0.010], col: "red" },
];

module.exports = { prometheus, medusa, icarus, veiled, dionysos };
