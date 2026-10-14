// Mereka logomark as a kinetic desk sculpture, drawn with the Anatomy skill kit.
// Build: node brands/mereka/kinetic/build.mjs [--light]
// Needs the Anatomy skill (https://github.com/wheresryan22/anatomy), found at
// $ANATOMY_HOME or ~/.claude/skills/anatomy.
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ANATOMY = process.env.ANATOMY_HOME || join(homedir(), ".claude/skills/anatomy");
const k = await import(pathToFileURL(join(ANATOMY, "kit/iso-kit.mjs")).href);
const { kitScript } = await import(pathToFileURL(join(ANATOMY, "scripts/inline-kit.mjs")).href);

const theme = process.argv.includes("--light") ? "light" : "dark";
const WIDTH = 600;
const HEIGHT = 420;

// ---- Truth: the logomark itself -------------------------------------------
// The outline of the joined body comes straight from the brand SVG; the four
// dots are its four circles (r = 64.14 in logo units).
const LOGO_SVG = readFileSync(join(HERE, "../logos/svg/mereka-logomark-black.svg"), "utf8");
const LOGO_PATH = LOGO_SVG.match(/<path d="([^"]+)"/)[1];
const LOGO_W = 427.76;
const LOGO_H = 342.13;
const SCALE = 0.5;
const toWorld = ([u, v]) => [(u - LOGO_W / 2) * SCALE, (v - LOGO_H / 2) * SCALE];

function flatten(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const out = [];
  let i = 0, cmd = "", cur = [0, 0], start = [0, 0], ctrl = null;
  const num = () => parseFloat(tokens[i++]);
  const cubic = (p0, p1, p2, p3) => {
    for (let s = 1; s <= 10; s++) {
      const t = s / 10, m = 1 - t;
      out.push([
        m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
        m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const base = rel ? cur : [0, 0];
    switch (cmd.toLowerCase()) {
      case "m": cur = [base[0] + num(), base[1] + num()]; start = cur; out.push(cur); cmd = rel ? "l" : "L"; ctrl = null; break;
      case "l": cur = [base[0] + num(), base[1] + num()]; out.push(cur); ctrl = null; break;
      case "h": cur = [(rel ? cur[0] : 0) + num(), cur[1]]; out.push(cur); ctrl = null; break;
      case "v": cur = [cur[0], (rel ? cur[1] : 0) + num()]; out.push(cur); ctrl = null; break;
      case "c": {
        const p1 = [base[0] + num(), base[1] + num()], p2 = [base[0] + num(), base[1] + num()], p3 = [base[0] + num(), base[1] + num()];
        cubic(cur, p1, p2, p3); ctrl = p2; cur = p3; break;
      }
      case "s": {
        const p1 = ctrl ? [2 * cur[0] - ctrl[0], 2 * cur[1] - ctrl[1]] : cur;
        const p2 = [base[0] + num(), base[1] + num()], p3 = [base[0] + num(), base[1] + num()];
        cubic(cur, p1, p2, p3); ctrl = p2; cur = p3; break;
      }
      case "z": cur = start; ctrl = null; break;
      default: throw new Error("path command " + cmd);
    }
  }
  const ring = [];
  for (const p of out.map(toWorld)) {
    const last = ring[ring.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.9) ring.push(p);
  }
  const [a, b] = [ring[0], ring[ring.length - 1]];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.9) ring.pop();
  return ring;
}

// Even spacing along the outline keeps wall facing from flickering on tiny kinks.
function resample(ring, gap) {
  const closed = [...ring, ring[0]];
  const lengths = [0];
  for (let i = 1; i < closed.length; i++) lengths.push(lengths[i - 1] + Math.hypot(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1]));
  const total = lengths[lengths.length - 1];
  const count = Math.round(total / gap);
  const out = [];
  for (let n = 0, j = 1; n < count; n++) {
    const want = (n / count) * total;
    while (lengths[j] < want) j++;
    const t = (want - lengths[j - 1]) / (lengths[j] - lengths[j - 1] || 1);
    out.push([closed[j - 1][0] + (closed[j][0] - closed[j - 1][0]) * t, closed[j - 1][1] + (closed[j][1] - closed[j - 1][1]) * t]);
  }
  // One pass of neighbour averaging irons out sampling noise, well under a unit.
  return out.map((p, i) => {
    const a = out[(i + count - 1) % count], b = out[(i + 1) % count];
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
  });
}
const BODY = resample(flatten(LOGO_PATH), 1.6);
const DOT_R = 64.14 * SCALE;
// Wave order: bottom-left, top-left, top-right, then the detached dot.
const NODES = [
  [64.28, 277.98],
  [64.14, 64.14],
  [363.33, 64.14],
  [363.62, 277.69],
].map(toWorld);
const FREE = 3;

// ---- The machine ------------------------------------------------------------
const PLINTH = { x: -136, y: -110, w: 272, d: 250, r: 12 };
const PLINTH_H = 22;
const FOOT_H = 6;
const STAND = 8; // standoffs under the plate
const PLATE_T = 12;
const TOP = STAND + PLATE_T; // top face of the plate: the logomark
const PUCK_R = DOT_R - 0.8; // each dot is a puck in a pocket, flush at rest
const HOLE_R = DOT_R;
const PUCK_H = 7;
const GLAND_H = 2;
const FLOOR = TOP - PUCK_H - GLAND_H; // pocket floor
const LIFT = 30; // cam lift, world units
const CRANK = [-18, 116];
const LABEL = { x: -124, y: 104, w: 62, d: 22, r: 2 };
const FREE_AT = NODES[FREE];
const GAUGE = { x: FREE_AT[0] + DOT_R + 4, y: FREE_AT[1] - 9, w: 6, d: 6, r: 1 };
const GAUGE_TOP = TOP + LIFT + 8;

const P = k.fitProjection(
  [...k.boxCorners(PLINTH, -PLINTH_H - FOOT_H, 0), [NODES[1][0], NODES[1][1], TOP + LIFT], [GAUGE.x, GAUGE.y, GAUGE_TOP + 2]],
  WIDTH,
  HEIGHT,
  { pad: 40, azimuth: 72, elevation: 40 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const depth = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (list, key = (v) => v) => [...list].sort((a, b) => depth(key(a)) - depth(key(b)));
const pathOf = (pts, closed) => "M" + pts.map(([x, y]) => x.toFixed(1) + " " + y.toFixed(1)).join("L") + (closed ? "Z" : "");

function plinth() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLINTH, -PLINTH_H - FOOT_H, PLINTH_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLINTH, 24))) {
    out.push(S(k.cylinder(x, y, 9, -PLINTH_H - FOOT_H, 2, P, 32), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 7, -PLINTH_H - FOOT_H + 2, FOOT_H - 2, P, 32), { tone: "mid" }));
  }
  // The camshaft runs inside the plinth, behind an access cover on the front face.
  const fy = PLINTH.y + PLINTH.d;
  const cover = [[-70, -17], [70, -17], [70, -5], [-70, -5]].map(([x, z]) => at([x, fy, z]));
  const coverScrews = [[-66, -11], [66, -11]].map(([x, z]) => at([x, fy, z]));
  const inner = L(k.sideSeam(PLINTH, -2, P, 8), { tone: "faint" }) + L(pathOf(cover, true), { tone: "lo" }) + D(coverScrews, { size: 0.5 });
  out.push(S(k.slabOf(PLINTH, -PLINTH_H, PLINTH_H, P, 8, 1.6), { tone: "mid", inner }));
  out.push(L(k.planOutline(k.insetPlan(PLINTH, 6), 0, P), { tone: "lo" }));
  const screws = k.corners(PLINTH, 12);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
  return out.join("");
}

function label() {
  const out = [S(k.slabOf(LABEL, 0, 1.2, P, 3, 0.4), { tone: "mid" })];
  out.push(L(k.planOutline(k.insetPlan(LABEL, 2), 1.2, P, 3), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([LABEL.x + 6, LABEL.y + 9.5], 1.2, P, "x"), "MEREKA", { size: 5.4, tone: "hi" }));
  const rules = [14, 17.5].map((dy, n) => k.lineOnTop([LABEL.x + 6, LABEL.y + dy], [LABEL.x + (n ? 32 : 44), LABEL.y + dy], 1.2, P)).join("");
  out.push(L(rules, { tone: "lo", free: true }));
  out.push(D([at([LABEL.x + LABEL.w - 5, LABEL.y + 5, 1.2]), at([LABEL.x + LABEL.w - 5, LABEL.y + LABEL.d - 5, 1.2])], { size: 0.5 }));
  return out.join("");
}

// The crank: a degree ring on a boss, a knurled knob and a handle that orbits it.
const [CX, CY] = CRANK;
const BOSS_H = 2;
const KNOB_R = 10;
const KNOB_H = 7;
const KNOB_TOP = BOSS_H + KNOB_H;
function crankBase() {
  const out = [S(k.cylinder(CX, CY, 19, 0, BOSS_H, P, 64, 0.6), { tone: "mid" })];
  const ticks = k.radialTicks(CX, CY, 18, 24, 6, BOSS_H, [1.6, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(S(k.cylinder(CX, CY, KNOB_R, BOSS_H, KNOB_H, P, 48, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(CX, CY, KNOB_R, BOSS_H + 1.2, KNOB_TOP - 1.2, 54, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(CX, CY, KNOB_R - 2, KNOB_TOP, P, 40), { tone: "faint" }));
  return out.join("");
}
function crankHandle(turn) {
  const a = turn * Math.PI * 2;
  const hx = CX + Math.sin(a) * 5.5, hy = CY - Math.cos(a) * 5.5;
  return [
    k.lineSvg(k.lineOnTop([CX, CY], [CX + Math.sin(a) * (KNOB_R - 2), CY - Math.cos(a) * (KNOB_R - 2)], KNOB_TOP + 0.05, P), { tone: "hi" }),
    k.dotsSvg([k.iso([CX, CY, KNOB_TOP], P)], { size: 0.6, tone: "hi" }),
    k.solidSvg(k.cylinder(hx, hy, 1.9, KNOB_TOP, 9, P, 18), { tone: "mid" }),
    k.solidSvg(k.cylinder(hx, hy, 2.6, KNOB_TOP + 9, 2.4, P, 20, 0.3), { tone: "hi", crease: "lo" }),
  ].join("");
}

function standoffs() {
  const posts = [...NODES.slice(0, 3), [0, 20]];
  return byDepth(posts).map(([x, y]) => S(k.cylinder(x, y, 7, 0, STAND, P, 28), { tone: "lo" })).join("");
}

// The plate is concave, and extrude() paints wall shades in tone buckets rather than
// by depth, so its walls can cover one another the wrong way round. A prism's own
// top face is always nearer than any of its walls, so paint it like this instead:
// front-facing wall quads far to near, then every bottom and vertical edge, then the
// top face, which hides whatever of those lies behind the plate, then the rim.
function concavePrism(ring, z, h, { tone = "hi", crease = "lo", inner = "", bevel = 0.8 } = {}) {
  const kit = k.extrude(ring, z, h, P, { convex: false, bevel });
  const n = ring.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % n]; area += ax * by - bx * ay; }
  const [vx, vy] = k.towardViewer(P);
  const { sinA, cosA } = k.cameraOf(P);
  const top = ring.map(([x, y]) => at([x, y, z + h]));
  const bottom = ring.map(([x, y]) => at([x, y, z]));
  const walls = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = ring[j][0] - ring[i][0], dy = ring[j][1] - ring[i][1], len = Math.hypot(dx, dy) || 1;
    const [nx, ny] = area > 0 ? [dy / len, -dx / len] : [-dy / len, dx / len];
    if (nx * vx + ny * vy <= 1e-9) continue;
    const lit = (nx * -sinA + ny * cosA + 1) / 2;
    const shade = Math.min(3, Math.max(0, Math.floor(lit * 4)));
    const mid = [(ring[i][0] + ring[j][0]) / 2, (ring[i][1] + ring[j][1]) / 2];
    walls.push({ key: depth(mid), d: pathOf([top[i], top[j], bottom[j], bottom[i]], true), shade });
  }
  walls.sort((a, b) => a.key - b.key);
  const r1 = (v) => String(Math.round(v * 10) / 10);
  const topKeys = new Set(top.map(([x, y]) => r1(x) + " " + r1(y)));
  const below = [], rim = [];
  for (const sub of kit.outline.match(/M[^M]+/g)) {
    const first = sub.slice(1).split("L")[0].trim().replace(",", " ");
    const pts = sub.slice(1).split("L");
    const vertical = pts.length === 2 && Math.abs(parseFloat(pts[0]) - parseFloat(pts[1])) < 0.15;
    (vertical || !topKeys.has(first) ? below : rim).push(sub);
  }
  return `<g class="iso-solid" data-seamless="">${walls.map((w) => `<path class="iso-shade" data-shade="${w.shade}" d="${w.d}"/>`).join("")}${inner}<path class="iso-line iso-edge" data-tone="${tone}" d="${below.join("")}"/><path class="iso-top" d="${kit.top}"/><path class="iso-line iso-crease" data-tone="${crease}" d="${kit.crease}"/>${kit.bevel ? `<path class="iso-line iso-bevel" data-tone="${crease}" d="${kit.bevel}"/>` : ""}<path class="iso-line iso-edge" data-tone="${tone}" d="${rim.join("")}"/></g>`;
}

function body() {
  const out = [`<path class="iso-halo" d="${k.extrude(BODY, 0, 0.1, P, { convex: false }).fill}" style="filter:blur(5px);opacity:.7"/>`];
  out.push(concavePrism(BODY, STAND, PLATE_T, { inner: L(k.ringSeam(BODY, STAND + 3, P), { tone: "faint" }) }));
  return out.join("");
}

function pedestal() {
  const [x, y] = FREE_AT;
  return [
    S(k.cylinder(x, y, 9, 0, STAND, P, 28), { tone: "lo" }),
    S(k.cylinder(x, y, DOT_R, STAND, PLATE_T, P, 80, 0.8), { tone: "hi", crease: "lo", inner: L(k.sideArc(x, y, DOT_R, STAND + 3, P, 40), { tone: "faint" }) }),
  ].join("");
}

// A pocket: dark bore wall, a floor with a gland and its bolt circle, clipped to the bore.
function nearArc([x, y], r, z) {
  const [vx, vy] = k.towardViewer(P);
  const f = Math.atan2(vy, vx);
  const pts = [];
  for (let s = 0; s <= 48; s++) {
    const a = f - Math.PI / 2 + (s / 48) * Math.PI;
    pts.push(at([x + r * Math.cos(a), y + r * Math.sin(a), z]));
  }
  return pts;
}
function pocket([x, y], i) {
  const bore = k.ring(x, y, HOLE_R, TOP, P, 96);
  const out = [`<clipPath id="bore-${i}"><path d="${bore}"/></clipPath>`];
  out.push(`<path class="iso-shade" data-shade="0" d="${bore}"/>`);
  const floor = [`<path class="iso-shade" data-shade="2" d="${k.ring(x, y, HOLE_R, FLOOR, P, 96)}"/>`];
  const bolts = [];
  for (let n = 0; n < 6; n++) {
    const a = (n / 6) * Math.PI * 2 + 0.3;
    bolts.push([x + Math.cos(a) * 14, y + Math.sin(a) * 14]);
  }
  floor.push(L(k.ring(x, y, 19, FLOOR, P, 64), { tone: "faint" }));
  floor.push(L(bolts.map(([bx, by]) => k.ring(bx, by, 1.6, FLOOR, P, 12)).join(""), { tone: "lo" }));
  floor.push(D(bolts.map(([bx, by]) => at([bx, by, FLOOR])), { size: 0.45 }));
  floor.push(S(k.cylinder(x, y, 5, FLOOR, GLAND_H, P, 28, 0.4), { tone: "mid" }));
  out.push(`<g clip-path="url(#bore-${i})">${floor.join("")}</g>`);
  out.push(L(bore, { tone: "lo" }));
  return out.join("");
}
// Screen region above the bore's near rim: what of a rising puck is not hidden by the plate.
function riseClip(p, i) {
  const arc = nearArc(p, HOLE_R + 0.2, TOP);
  const [l, r] = [arc[0], arc[arc.length - 1]];
  return `<clipPath id="rise-${i}"><path d="${pathOf([...arc, [r[0], -999], [l[0], -999]], true)}"/></clipPath>`;
}

function puck([x, y], index) {
  const lit = index === FREE;
  const z = TOP - PUCK_H;
  const out = [];
  out.push(S(k.cylinder(x, y, PUCK_R, z, PUCK_H, P, 96, 0.9), {
    tone: "hi",
    crease: "lo",
    lit,
    inner: L(k.sideArc(x, y, PUCK_R, TOP - 1.6, P, 48), { tone: "faint" }),
  }));
  out.push(L(k.ring(x, y, PUCK_R - 5, TOP, P, 80), { tone: lit ? "mid" : "faint" }));
  out.push(L(k.ring(x, y, 2.6, TOP, P, 16), { tone: "lo" }));
  out.push(D([at([x, y, TOP])], { size: 0.6, tone: lit ? "lit" : "mid" }));
  return out.join("");
}
// The detached dot carries a flag that reads its lift on the gauge post.
function flag([x, y]) {
  const tip = GAUGE.x + 3;
  const ring = [[x + PUCK_R - 6, y - 1.6], [tip, y - 1.6], [tip, y + 1.6], [x + PUCK_R - 6, y + 1.6]];
  return [
    S(k.extrude(ring, TOP, 1.2, P), { tone: "hi", crease: "lo", lit: true }),
    D([at([x + PUCK_R - 3.5, y, TOP + 1.2])], { size: 0.45 }),
    `<path class="iso-line" data-tone="lit" d="${k.lineOnTop([tip - 4, y], [tip, y], TOP + 1.2, P)}"/>`,
  ].join("");
}

function gauge() {
  const foot = k.insetPlan(GAUGE, -4);
  const out = [S(k.slabOf(foot, 0, 2, P, 3, 0.4), { tone: "mid" })];
  out.push(D([at([foot.x + 2.5, foot.y + 2.5, 2]), at([foot.x + foot.w - 2.5, foot.y + foot.d - 2.5, 2])], { size: 0.45 }));
  // Ticks on the front face, hanging from its left edge: every 2 units, a major every 10.
  const face = GAUGE.y + GAUGE.d;
  const minor = [], major = [];
  for (let n = 0; n <= LIFT / 2; n++) {
    const z = TOP + 1.2 + n * 2;
    const big = n % 5 === 0;
    (big ? major : minor).push(k.segment([GAUGE.x, face, z], [GAUGE.x + (big ? 3.6 : 2), face, z], P));
  }
  const inner = L(minor.join(""), { tone: "lo" }) + L(major.join(""), { tone: "mid" });
  out.push(S(k.slabOf(GAUGE, 2, GAUGE_TOP - 2, P, 3, 0.4), { tone: "mid", inner }));
  out.push(S(k.slabOf(k.insetPlan(GAUGE, -0.6), GAUGE_TOP, 1.6, P, 3, 0.3), { tone: "mid" }));
  return out.join("");
}

const rodSvg = ([x, y], lift) => (lift > 0.05 ? k.solidSvg(k.cylinder(x, y, 2.2, TOP - PUCK_H, lift, P, 16), { tone: "mid", crease: "none" }) : "");

// The cam: each lobe spans 0.3 turn and the lobes start 0.15 turn apart, so the
// wave runs through the four dots in 0.75 turn and the mark rests whole for 0.25.
const PHASE = NODES.map((_, i) => i * 0.15);
const cam = (u) => (u < 0.3 ? (1 - Math.cos((u / 0.3) * 2 * Math.PI)) / 2 : 0);
const liftAt = (turn, i) => LIFT * cam((((turn - PHASE[i]) % 1) + 1) % 1);

// Paint order: plate and pedestal by depth, then each dot far to near.
const plateFirst = depth([0, 0]) < depth(FREE_AT);
const order = byDepth(NODES.map((p, i) => i), (i) => NODES[i]);
const START = 0.12;
const parts = [
  plinth(),
  label(),
  crankBase(),
  `<g data-part="handle">${crankHandle(START)}</g>`,
  standoffs(),
  gauge(),
  plateFirst ? body() + pedestal() : pedestal() + body(),
  ...NODES.map(pocket),
  ...order.map((i) => {
    const lift = liftAt(START, i);
    const move = k.translateAlong(P, [0, 0, lift]);
    return [
      riseClip(NODES[i], i),
      `<g clip-path="url(#rise-${i})">`,
      `<g data-part="rod" data-node="${i}">${rodSvg(NODES[i], lift)}</g>`,
      `<g data-part="puck" data-node="${i}" transform="${move}">${puck(NODES[i], i)}</g>`,
      `</g>`,
      L(k.sideArc(NODES[i][0], NODES[i][1], HOLE_R, TOP, P, 64), { tone: "lo" }),
      i === FREE ? `<g data-part="flag" data-node="${i}" transform="${move}">${flag(NODES[i])}</g>` : "",
    ].join("");
  }),
];

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "The Mereka logomark built as a kinetic desk sculpture: the joined body is a thick plate on standoffs over a plinth, and the four dots are pucks on cam-driven rods. Turning the crank sends a wave through the mark, lifting the dots in turn from bottom-left to top-left, top-right and finally the detached dot, which reads its lift on a gauge post.",
  body: parts,
});

const live = `
const P = ${JSON.stringify(P)};
const NODES = ${JSON.stringify(NODES)};
const LIFT = ${LIFT}, TOP = ${TOP}, PUCK_H = ${PUCK_H}, FREE = ${FREE};
const CX = ${CX}, CY = ${CY}, KNOB_R = ${KNOB_R}, KNOB_TOP = ${KNOB_TOP};
const PHASE = ${JSON.stringify(PHASE)};
const cam = ${cam.toString()};
const liftAt = ${liftAt.toString()};
const crankHandle = ${crankHandle.toString().replaceAll("k.", "")};
const rodSvg = ${rodSvg.toString().replaceAll("k.", "")};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const pick = (part, i) => svg.querySelector('[data-part="' + part + '"][data-node="' + i + '"]');
const pucks = NODES.map((_, i) => pick("puck", i));
const rods = NODES.map((_, i) => pick("rod", i));
const flag = pick("flag", FREE);
const handle = svg.querySelector('[data-part="handle"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const SPEED = 0.11; // crank turns per second on the idle tour
let turn = ${START}, target = turn, touring = !still.matches, frame = 0, last = 0, visible = false, idle = 0;
let drawnTurn = NaN;
function draw() {
  if (Math.abs(turn - drawnTurn) < 1e-4) return;
  drawnTurn = turn;
  const lifts = NODES.map((_, i) => liftAt(turn, i));
  lifts.forEach((lift, i) => {
    pucks[i].setAttribute("transform", translateAlong(P, [0, 0, lift]));
    rods[i].innerHTML = rodSvg(NODES[i], lift);
    if (i === FREE) flag.setAttribute("transform", translateAlong(P, [0, 0, lift]));
  });
  handle.innerHTML = crankHandle(turn);
  const deg = Math.round((((turn % 1) + 1) % 1) * 360) % 360;
  const text = "crank " + String(deg).padStart(3, " ") + "° · lifts " + lifts.map((v) => Math.round(v)).join(" / ");
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(deg));
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) target += SPEED * dt;
  turn = still.matches ? target : turn + (target - turn) * (1 - Math.exp(-dt / 0.35));
  if (Math.abs(target - turn) < 1e-4) turn = target;
  draw();
  const settled = !touring && turn === target;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => {
  touring = false; target = next; clearTimeout(idle);
  idle = setTimeout(() => { touring = !still.matches; run(); }, 3600);
  run();
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
let anchor = null;
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const share = (event.clientX - box.left) / box.width;
  if (anchor === null) anchor = { share, turn: target };
  steer(anchor.turn + (share - anchor.share) * 1.5);
});
stage.addEventListener("pointerleave", () => { anchor = null; steer(target); });
stage.addEventListener("keydown", (event) => {
  const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
  if (event.key === "Home") { event.preventDefault(); steer(Math.round(target)); return; }
  if (!step) return;
  event.preventDefault();
  steer(Math.round(target * 24 + step) / 24);
});
draw();
`;

// The one lit part, the detached dot, wears Mereka teal (#2d898b).
const BRAND_CSS = `
.iso-figure{--anatomy-lit-top:#2d898b;--anatomy-lit-shade:#226a6c;--anatomy-lit:#9fdcdd}
.iso[data-theme="light"] .iso-figure{--anatomy-lit-top:#2d898b;--anatomy-lit-shade:#257375;--anatomy-lit:#164f50}
`;
const plate = k.plateHtml({
  fig: "Fig 1",
  title: "Mereka, in motion",
  hint: "Hover and sweep to turn the crank",
  readout: "crank " + Math.round(START * 360) + "°",
  keys: [
    { mark: "lit", label: "The detached dot: the last to rise, read on the gauge" },
    { mark: "raised", label: "The joined body, cut from the brand outline" },
  ],
  caption:
    "The Mereka logomark as a kinetic sculpture. One crank turns a hidden camshaft with four lobes, each 108° wide and set 54° after the last, so the dots rise 30 units and settle in a wave: bottom-left, top-left, top-right, and then the one that stands apart. For the last quarter of every turn all four rest on their seats and the mark is whole.",
  body: `<style>${BRAND_CSS}</style><div class="iso-stage" tabindex="0" role="slider" aria-label="Mereka kinetic logo: arrow keys turn the crank 15 degrees" aria-valuemin="0" aria-valuemax="359" aria-valuenow="${Math.round(START * 360)}">${svg}</div>`,
});

const name = theme === "light" ? "mereka-kinetic-light.html" : "mereka-kinetic.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Mereka, in motion", theme, body: plate, script: kitScript() + live }));

// --artifact: one page that follows the viewer's light or dark theme, for a claude.ai Artifact.
if (process.argv.includes("--artifact")) {
  const follow = `
const root = document.documentElement, host = document.querySelector("main.iso"), dark = matchMedia("(prefers-color-scheme: dark)");
const pickTheme = () => host.setAttribute("data-theme", root.dataset.theme || (dark.matches ? "dark" : "light"));
pickTheme(); dark.addEventListener("change", pickTheme);
new MutationObserver(pickTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
`;
  const page = `<title>Mereka in Motion</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{--page:#f2f2ef;color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--page:#0b0b0b;color-scheme:dark}}
:root[data-theme="dark"]{--page:#0b0b0b;color-scheme:dark}
body{background:var(--page);margin:0;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
${k.ISO_CSS}
.iso-page{background:var(--anatomy-page);color:var(--anatomy-text);width:min(650px,100%);margin:0 auto;padding-block:48px 72px}
</style>
<main class="iso iso-page" data-theme="light">${plate}</main>
<script type="module">${(follow + kitScript() + live).replace(/<\/(script)/gi, "<\\/$1")}</script>`;
  writeFileSync(join(HERE, "mereka-kinetic-artifact.html"), page);
  console.log("wrote mereka-kinetic-artifact.html");
}
console.log("wrote", name, "·", BODY.length, "outline points");
