// Fig 4 · Orrery: the four dots of the Mereka logomark as planets on a geared orrery.
// Build: node brands/mereka/kinetic/orrery/build.mjs
//
// The four dot centres sit 91.9 world units (logo scale 0.5) from the logo's centre, so all
// four share one orbit. Pucks on one radius in one plane would collide every time one laps
// another, so, as in a real orrery, each planet rides its own level: arm k at z = ARM_Z[k],
// its puck on top, every arm and puck vertically clear of every other. The joined body is
// engraved on a glass top plate above them, and each puck is a lamp that shines straight up:
// its disc of light lands on the glass at the puck's exact x, y. When the gear train brings
// all four arms home together, the four discs of light fill the engraved mark exactly.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { k, kitScript, glScript, kitPath, logo, FREE, writePages, BRAND } from "../shared.mjs";

const { glCamera } = await import(kitPath("kit/gl.mjs"));
const HERE = dirname(fileURLToPath(import.meta.url));
const WIDTH = 600;
const HEIGHT = 470;
const TAU = Math.PI * 2;

// ---- Truth: the logomark and the gear train -----------------------------------
const L0 = logo({ scale: 0.5 });
const BODY = L0.body;
const DOTS = L0.dots; // bottom-left, top-left, top-right, detached
const DOT_R = L0.dotR;
const HOME = DOTS.map(([x, y]) => Math.atan2(y, x)); // each arm's logomark angle
const ORBIT = DOTS.map(([x, y]) => Math.hypot(x, y)); // 91.88 … 92.00

// One alignment period is PERIOD turns of the drive (the layshaft). In that time each arm
// makes TURNS[i] whole turns, so all four are home together once every PERIOD turns and
// never sooner (the ratios 1/2, 2/3, 5/6 and 1/3 need 2, 3, 6 and 3 turns; lcm = 6).
const PERIOD = 6;
const TURNS = [3, 4, 5, 2];
// Pinion on the layshaft / wheel on the arm's arbor: rate = pinion / wheel = TURNS / PERIOD.
const TEETH = [
  [16, 32], // bottom-left: 1/2
  [20, 30], // top-left: 2/3
  [20, 24], // top-right: 5/6
  [12, 36], // detached: 1/3
];
TEETH.forEach(([p, w], i) => {
  if (Math.abs(p / w - TURNS[i] / PERIOD) > 1e-9) throw new Error("ratio " + i);
});
// Level of each planet in the stack (0 lowest). The detached dot rides highest, nearest the glass.
const LEVEL = [0, 1, 2, 3];
const BY_LEVEL = [0, 1, 2, 3].map((level) => LEVEL.indexOf(level));

// ---- Machine geometry (world units, z up) --------------------------------------
const BASE_R = 147;
const PLINTH_R = 153;
const PLINTH = [-18, -8]; // lower step
const DECK = [-8, 0]; // upper step, top at z = 0
const FOOT = [-24, -18];
const FOOT_RING = 132;

const SPAN = 38; // column axis to layshaft axis
const LAY_ANGLE = (70 * Math.PI) / 180;
const LAY = [SPAN * Math.cos(LAY_ANGLE), SPAN * Math.sin(LAY_ANGLE)];
const GEAR_T = 2.8;
// Wheel levels from the bottom: the innermost arbor (the top planet) carries the lowest wheel.
const GEAR_Z = [12.2, 17.2, 22.2, 27.2];
const wheelZ = (i) => GEAR_Z[3 - LEVEL[i]];
const moduleOf = (i) => (2 * SPAN) / (TEETH[i][0] + TEETH[i][1]);

// Nested arbors: radius by level (level 3 innermost).
const TUBE_R = [8.2, 6.8, 5.4, 4.0];
const SPINDLE_R = 2.6;
const HUB_R = [12, 10.6, 9.2, 7.8];
const ARM_Z = [35, 42, 49, 56];
const ARM_T = 2.2;
const ARM_W = 2.5; // half width
const TAIL = 19; // counterweight radius on the far side
const HUB = (level) => [ARM_Z[level] - 0.8, ARM_Z[level] + 3];
const PEDESTAL_H = 0.8;
const PUCK_T = 2.6;
const puckZ = (level) => ARM_Z[level] + ARM_T + PEDESTAL_H;
const FLANGE = [61.8, 63.6];
const FLANGE_R = 13;
const GLASS_Z = 63.6;
const GLASS_T = 2.4;
const GLASS_TOP = GLASS_Z + GLASS_T;
const GLASS_R = 140;
const PILLAR_RING = 134;
const PILLARS = [162, 252, 342].map((d) => (d * Math.PI) / 180);

// Drive: a motor turns a worm; the worm turns a 20-tooth worm wheel on the layshaft.
const WORM_TEETH = 20;
const WORM_WHEEL = { z: [5.4, 8.6], r: 13 };
const WORM = { y: LAY[1] - 17, z: 7, r: 4, x: [LAY[0] - 9, LAY[0] + 9], pitch: Math.PI * 1.3 };
const MOTOR = { x: [LAY[0] + 22.6, LAY[0] + 48], r: 6.8 };
// Counter: an 8-tooth pinion low on the layshaft turns a 48-tooth dial wheel once per period.
// Counter: an 8-tooth pinion low on the layshaft drives a 40-tooth idler, which drives the
// 48-tooth dial wheel out at the front: 8/48, one turn of the dial per alignment period.
const COUNTER = { pinion: 8, idler: 40, wheel: 48, m: 1.15, z: [3.4, 4.8], face: [4.8, 5.4] };
const TRAIN_ANGLE = (70 * Math.PI) / 180;
const IDLER = [LAY[0] + ((COUNTER.m * (COUNTER.pinion + COUNTER.idler)) / 2) * Math.cos(TRAIN_ANGLE), LAY[1] + ((COUNTER.m * (COUNTER.pinion + COUNTER.idler)) / 2) * Math.sin(TRAIN_ANGLE)];
const DIAL = [IDLER[0] + ((COUNTER.m * (COUNTER.idler + COUNTER.wheel)) / 2) * Math.cos(TRAIN_ANGLE), IDLER[1] + ((COUNTER.m * (COUNTER.idler + COUNTER.wheel)) / 2) * Math.sin(TRAIN_ANGLE)];
const COUNTER_ANGLE = 0; // the index finger points at the dial from +x
const DIAL_R = (COUNTER.m * COUNTER.wheel) / 2;
if (COUNTER.wheel / COUNTER.pinion !== PERIOD) throw new Error("counter ratio");

const P = k.fitProjection(
  [
    ...k.circleRing(0, 0, PLINTH_R, 48).map(([x, y]) => [x, y, FOOT[0]]),
    ...k.circleRing(0, 0, GLASS_R, 48).map(([x, y]) => [x, y, GLASS_TOP + 2]),
  ],
  WIDTH,
  HEIGHT,
  { pad: 30, azimuth: 72, elevation: 42 },
);
const CAM = glCamera(P);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const depth = ([x, y], z = 0) => k.depthOf([x, y, z], P);
const byDepth = (list, key = (v) => v) => [...list].sort((a, b) => depth(key(a)) - depth(key(b)));
const polar = (r, a, [cx, cy] = [0, 0]) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const [VX, VY] = k.towardViewer(P);
const nearHalf = ([x, y]) => x * VX + y * VY > 0;

// ---- Builders shared with the live page (inlined with .toString()) --------------
// A spur gear outline: trapezoid teeth on pitch radius r, `angle` puts a tooth centre.
function gearRing(cx, cy, r, teeth, angle, m) {
  const out = [];
  const pitch = (Math.PI * 2) / teeth;
  const ro = r + m * 0.95, ri = r - m * 1.2;
  for (let i = 0; i < teeth; i++) {
    const a = angle + i * pitch;
    for (const [rr, da] of [[ri, -0.5], [ri, -0.27], [ro, -0.14], [ro, 0.14], [ri, 0.27]]) {
      out.push([cx + rr * Math.cos(a + da * pitch), cy + rr * Math.sin(a + da * pitch)]);
    }
  }
  return out;
}
// A prism of any (concave) outline, built straight to markup: walls painted far to near and
// merged in runs of one shade (so a gear's flanks cover the roots behind them), then the top,
// the crease along the visible top edges and the silhouette.
function prismSvg(ring, z, h, tone, crease, inner, lit) {
  const P = PROJ;
  const n = ring.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const cam = k.cameraOf(P);
  const vx = cam.cosA, vy = cam.sinA;
  const kk = cam.k, ox = P.origin[0], oy = P.origin[1];
  const T = new Array(n), B = new Array(n), key = new Array(n);
  const f1 = (v) => Math.round(v * 10) / 10;
  for (let i = 0; i < n; i++) {
    const x = ring[i][0], y = ring[i][1];
    const sx = ox + (x * cam.sinA - y * cam.cosA) * kk;
    const sy = oy + (x * cam.cosA + y * cam.sinA) * cam.sinE * kk;
    T[i] = f1(sx) + " " + f1(sy - (z + h) * cam.cosE * kk);
    B[i] = f1(sx) + " " + f1(sy - z * cam.cosE * kk);
    key[i] = x * vx + y * vy;
  }
  const walls = [];
  const facing = new Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = ring[j][0] - ring[i][0], dy = ring[j][1] - ring[i][1], len = Math.hypot(dx, dy) || 1;
    const nx = area > 0 ? dy / len : -dy / len, ny = area > 0 ? -dx / len : dx / len;
    facing[i] = nx * vx + ny * vy > 1e-9;
    if (!facing[i]) continue;
    const light = (nx * -cam.sinA + ny * cam.cosA + 1) / 2;
    walls.push({ key: key[i] + key[j], shade: Math.min(3, Math.max(0, Math.floor(light * 4))), d: "M" + T[i] + "L" + T[j] + "L" + B[j] + "L" + B[i] + "Z" });
  }
  walls.sort((a, b) => a.key - b.key);
  let parts = "", run = -1, runD = "";
  for (const w of walls) {
    if (w.shade !== run && runD) { parts += '<path class="iso-shade" data-shade="' + run + '" d="' + runD + '"/>'; runD = ""; }
    run = w.shade; runD += w.d;
  }
  if (runD) parts += '<path class="iso-shade" data-shade="' + run + '" d="' + runD + '"/>';
  let top = "M" + T.join("L") + "Z", creaseD = "", outline = "";
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (facing[i]) { creaseD += "M" + T[i] + "L" + T[j]; outline += "M" + B[i] + "L" + B[j]; }
    else outline += "M" + T[i] + "L" + T[j];
    if (facing[i] !== facing[(i + n - 1) % n]) outline += "M" + T[i] + "L" + B[i];
  }
  return '<g class="iso-solid"' + (lit ? " data-lit" : "") + '>' + parts + '<path class="iso-top" d="' + top + '"/><path class="iso-line iso-crease" data-tone="' + crease + '" d="' + creaseD + '"/>' + (inner || "") +
    '<path class="iso-line iso-edge" data-tone="' + tone + '" d="' + outline + '"/></g>';
}
// A spur gear: toothed rim, a recessed web groove, five lightening holes and a hub collar.
function gearSvg(cx, cy, r, teeth, angle, m, z, h, hubR) {
  // The toothed body with its turned web ring: identical every tooth pitch, so it can be cached.
  const P = PROJ;
  const ring = gearRing(cx, cy, r, teeth, angle, m);
  const web = r - m * 1.2 - 1.6;
  const lines = web > hubR + 3 ? '<path class="iso-line" data-tone="faint" d="' + k.ring(cx, cy, web, z + h, P, 64) + '"/>' : "";
  return prismSvg(ring, z, h, "mid", "faint", "", false) + lines;
}
function gearHoles(cx, cy, r, m, hubR, angle, top) {
  // five lightening holes in the web, turning with the gear
  const P = PROJ;
  const web = r - m * 1.2 - 1.6;
  if (web <= hubR + 6) return "";
  const hr = Math.min(3.4, (web - hubR) * 0.3), hc = (web + hubR) / 2;
  let d = "";
  for (let i = 0; i < 5; i++) {
    const a = angle + 0.31 + (i * Math.PI * 2) / 5;
    d += k.ring(cx + hc * Math.cos(a), cy + hc * Math.sin(a), hr, top, P, 18);
  }
  return d;
}
// An arm at angle t: the bar in two pieces either side of its hub (tail with a counterweight,
// and the long reach out to the planet), each painted before or after the hub by facing.
function armParts(level, t) {
  const P = PROJ;
  const z = ARMZ[level], hubR = HUBR[level], reach = REACH[level];
  const c = Math.cos(t), s = Math.sin(t);
  const along = (u, v) => [u * c - v * s, u * s + v * c];
  const start = Math.sqrt(hubR * hubR - ARMW * ARMW);
  const piece = (u0, u1) => {
    const ring = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * Math.PI; ring.push(along(u1 + Math.cos(a) * ARMW * 0.0 , Math.sin(a) * ARMW)); }
    ring.length = 0;
    ring.push(along(u0, -ARMW), along(u1, -ARMW), along(u1, ARMW), along(u0, ARMW));
    return ring;
  };
  const main = piece(start, reach);
  const tail = piece(-TAILR, -start);
  const mainSvg = k.solidSvg(k.extrude(main, z, ARMT, P, { bevel: 0.4 }), { tone: "mid" }) +
    k.lineSvg(k.lineOnTop(along(start + 0.4, 1.1), along(reach - 4.6, 1.1), z + ARMT, P), { tone: "faint" });
  const [wx, wy] = along(-TAILR, 0);
  const weight = k.solidSvg(k.cylinder(wx, wy, 5.6, z - 0.8, 3.8, P, 28, 0.4), { tone: "mid" }) +
    k.lineSvg(k.sideArc(wx, wy, 5.6, z + 1.1, P, 16), { tone: "faint" });
  const tailNear = (-c) * VIEW[0] + (-s) * VIEW[1] > 0;
  const tailSvg = tailNear ? k.solidSvg(k.extrude(tail, z, ARMT, P, { bevel: 0.4 }), { tone: "mid" }) + weight
    : weight + k.solidSvg(k.extrude(tail, z, ARMT, P, { bevel: 0.4 }), { tone: "mid" });
  const mainNear = c * VIEW[0] + s * VIEW[1] > 0;
  // The set screw on the hub, on the side the arm points to.
  const [sx, sy] = along(hubR, 0);
  const screw = mainNear ? k.dotsSvg([k.iso([sx, sy, z + 1.1], P)], { size: 0.55, tone: "mid" }) : "";
  return { back: (mainNear ? "" : mainSvg) + (tailNear ? "" : tailSvg), front: (mainNear ? mainSvg + screw : "") + (tailNear ? tailSvg : "") };
}
// A cylinder lying along x (motor can, worm, shafts): facets round the axis, shaded like extrude.
function lyingCylinder(x0, x1, y, z, r, steps) {
  const P = PROJ;
  const cam = k.cameraOf(P);
  const view = [cam.cosA * cam.cosE, cam.sinA * cam.cosE, cam.sinE];
  const light = (() => { const l = [-cam.sinA, cam.cosA, 1.2]; const n = Math.hypot(...l); return l.map((v) => v / n); })();
  const ringAt = (x) => Array.from({ length: steps }, (_, i) => { const a = (i / steps) * Math.PI * 2; return [x, y + r * Math.cos(a), z + r * Math.sin(a)]; });
  const A = ringAt(x0), B = ringAt(x1);
  const shades = [[], [], [], []];
  const facing = [];
  for (let i = 0; i < steps; i++) {
    const a = ((i + 0.5) / steps) * Math.PI * 2;
    const n = [0, Math.cos(a), Math.sin(a)];
    const f = n[1] * view[1] + n[2] * view[2];
    facing.push(f > 1e-9);
    if (f <= 1e-9) continue;
    const lit = (n[1] * light[1] + n[2] * light[2] + 1) / 2;
    const shade = Math.min(3, Math.max(0, Math.floor(lit * 4)));
    const j = (i + 1) % steps;
    shades[shade].push(k.pathOf([A[i], A[j], B[j], B[i]].map((p) => k.iso(p, P)), true));
  }
  const capX = view[0] > 0 ? x1 : x0;
  const cap = (capX === x1 ? B : A).map((p) => k.iso(p, P));
  const flat = [...A, ...B].map((p) => k.iso(p, P));
  // hull for fill and outline
  const pts = [...flat].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  // crease: the cap rim (visible half meets the side)
  return { fill: k.pathOf(hull, true), outline: k.pathOf(hull, true), crease: k.pathOf(cap, true), top: k.pathOf(cap, true), shades: shades.map((list) => list.join("")) };
}
// The worm's thread: visible arcs of a helix of pitch `pitch` turned by `phase`.
function wormThread(x0, x1, y, z, r, pitch, phase) {
  const P = PROJ;
  const cam = k.cameraOf(P);
  const view = [cam.cosA * cam.cosE, cam.sinA * cam.cosE, cam.sinE];
  let d = "";
  let run = [];
  const flush = () => { if (run.length > 1) d += k.pathOf(run); run = []; };
  const steps = Math.ceil(((x1 - x0) / pitch) * 24);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const a = ((x - x0) / pitch) * Math.PI * 2 + phase;
    const f = Math.cos(a) * view[1] + Math.sin(a) * view[2];
    if (f > 0.12) run.push(k.iso([x, y + r * Math.cos(a), z + r * Math.sin(a)], P));
    else flush();
  }
  flush();
  return d;
}

// ---- Static art: base, drive, gear-train frame, pillars, glass ------------------
const DOTS_MID = (pts, size = 0.5) => D(pts.map((p) => at(p)), { size });

function base() {
  const out = [];
  const plinth = { x: -PLINTH_R, y: -PLINTH_R, w: PLINTH_R * 2, d: PLINTH_R * 2, r: PLINTH_R };
  out.push(`<path class="iso-halo" d="${k.haloOf(plinth, FOOT[0], PLINTH[1] - FOOT[0], P)}"/>`);
  const feet = [0, 1, 2, 3, 4, 5].map((i) => polar(FOOT_RING, (i * TAU) / 6 + Math.PI / 6));
  for (const [x, y] of byDepth(feet)) {
    out.push(S(k.cylinder(x, y, 10, FOOT[0], 2, P, 40, 0.4), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 7.6, FOOT[0] + 2, FOOT[1] - FOOT[0] - 2, P, 36), { tone: "mid", inner: Ln(k.sideArc(x, y, 7.6, FOOT[0] + 3.6, P, 24), { tone: "faint" }) }));
  }
  out.push(S(k.cylinder(0, 0, PLINTH_R, PLINTH[0], PLINTH[1] - PLINTH[0], P, 160, 1.2), { tone: "lo", inner: Ln(k.sideArc(0, 0, PLINTH_R, PLINTH[0] + 3, P, 120), { tone: "faint" }) }));
  out.push(Ln(k.ring(0, 0, (PLINTH_R + BASE_R) / 2 + 0.4, PLINTH[1], P, 160), { tone: "faint" }));
  out.push(S(k.cylinder(0, 0, BASE_R, DECK[0], DECK[1] - DECK[0], P, 160, 1.4), { tone: "mid", inner: Ln(k.sideArc(0, 0, BASE_R, DECK[0] + 2.6, P, 120), { tone: "faint" }) }));
  // Deck furniture: a groove ring, screws round the rim, an inner turned ring under the orbit.
  out.push(Ln(k.ring(0, 0, BASE_R - 2.6, 0, P, 160), { tone: "lo" }));
  const screws = Array.from({ length: 12 }, (_, i) => polar(BASE_R - 6.2, (i * TAU) / 12));
  out.push(Ln(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(DOTS_MID(screws.map(([x, y]) => [x, y, 0]), 0.55));
  out.push(Ln(k.ring(0, 0, 124, 0, P, 160) + k.ring(0, 0, 60, 0, P, 120), { tone: "faint" }));
  // Engraved degree marks on the deck between the two orbit rings: every 10°, a major every 90°.
  const ticks = k.radialTicks(0, 0, 124, 36, 9, 0, [2.2, 4.2], P);
  out.push(Ln(ticks.minor, { tone: "faint" }), Ln(ticks.major, { tone: "lo" }));
  return out.join("");
}

function label() {
  const plan = { x: -40, y: 110, w: 36, d: 14, r: 1.6 };
  const out = [S(k.slabOf(plan, 0, 1.0, P, 3, 0.4), { tone: "mid" })];
  out.push(Ln(k.planOutline(k.insetPlan(plan, 1.6), 1.0, P, 3), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([plan.x + 4.2, plan.y + 7.2], 1.0, P, "x"), "MEREKA", { size: 4.6, tone: "hi" }));
  const rules = [10.2, 12.4].map((dy, n) => k.lineOnTop([plan.x + 4.2, plan.y + dy], [plan.x + (n ? 22 : 30), plan.y + dy], 1.0, P)).join("");
  out.push(Ln(rules, { tone: "lo", free: true }));
  out.push(D([at([plan.x + plan.w - 3.4, plan.y + 3.4, 1]), at([plan.x + plan.w - 3.4, plan.y + plan.d - 3.4, 1])], { size: 0.45 }));
  return out.join("");
}

// The visible front arc of a ring round a lying cylinder at x (a band, a seam, a fin).
function bandArc(x, y, z, r) {
  const cam = k.cameraOf(P);
  const view = [cam.cosA * cam.cosE, cam.sinA * cam.cosE, cam.sinE];
  const f = Math.atan2(view[2], view[1]);
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const a = f - Math.PI / 2 + 0.02 + ((Math.PI - 0.04) * i) / 32;
    pts.push(at([x, y + r * Math.cos(a), z + r * Math.sin(a)]));
  }
  return k.pathOf(pts);
}

// The worm in two bearing blocks behind the layshaft, and the motor to its right on a cradle.
// Along x the view comes slightly from +x, so each part is painted from left to right.
function drive(part) {
  const out = [];
  const [x0, x1] = MOTOR.x;
  const y = WORM.y, z = WORM.z;
  const blocks = [WORM.x[0] - 3.4, WORM.x[1] + 3.4];
  const shaft = (a, b) => S(lyingCylinder(a, b, y, z, 1.1, 16), { tone: "mid", crease: "none" });
  const block = (x) => {
    const plan = { x: x - 1.6, y: y - 4.4, w: 3.2, d: 8.8, r: 0.8 };
    return S(k.slabOf(plan, 0, z + 3.4, P, 3, 0.4), { tone: "mid" }) + D([at([x, y - 2.8, z + 3.4]), at([x, y + 2.8, z + 3.4])], { size: 0.42 });
  };
  if (part === "worm") {
    out.push(S(lyingCylinder(blocks[0] - 4.2, blocks[0] - 2.8, y, z, 2.2, 20), { tone: "mid", crease: "lo" }));
    out.push(shaft(blocks[0] - 2.8, blocks[0] - 1.6));
    out.push(block(blocks[0]));
    out.push(shaft(blocks[0] + 1.6, WORM.x[0]));
    out.push(`<g data-part="worm">${S(lyingCylinder(WORM.x[0], WORM.x[1], y, z, WORM.r, 32), { tone: "hi", crease: "lo" })}<path class="iso-line" data-tone="lo" data-part="thread" d="${wormThread(WORM.x[0] + 0.6, WORM.x[1] - 0.6, y, z, WORM.r, WORM.pitch, 0)}"/></g>`);
    out.push(shaft(WORM.x[1], blocks[1] - 1.6));
    out.push(block(blocks[1]));
    return out.join("");
  }
  out.push(shaft(blocks[1] + 1.6, x0));
  for (const x of [x0 + 4.5, x1 - 4.5]) {
    const plan = { x: x - 2.6, y: y - 7, w: 5.2, d: 14, r: 1 };
    out.push(S(k.slabOf(plan, 0, z - MOTOR.r + 1.4, P, 3, 0.4), { tone: "lo" }) + D([at([x, y - 5.2, z - MOTOR.r + 1.4]), at([x, y + 5.2, z - MOTOR.r + 1.4])], { size: 0.42 }));
  }
  const bands = [x0 + 2.4, x1 - 6.6, x1 - 4.4, x1 - 2.2].map((x) => bandArc(x, y, z, MOTOR.r)).join("");
  out.push(S(lyingCylinder(x0, x1, y, z, MOTOR.r, 48), { tone: "mid", crease: "lo", inner: Ln(bands, { tone: "faint" }) }));
  for (const dx of [-2, 2]) {
    const plan = { x: x0 + 9 + dx - 0.9, y: y - 1.6, w: 1.8, d: 3.2, r: 0.3 };
    out.push(S(k.slabOf(plan, z + MOTOR.r - 0.6, 2.2, P, 2, 0.2), { tone: "mid" }));
  }
  out.push(S(lyingCylinder(x1, x1 + 3.2, y, z, MOTOR.r - 1.4, 32), { tone: "lo", crease: "lo" }));
  return out.join("");
}

// The counter dial's fixed index finger, on a post beside the dial.
function counterIndex() {
  const a = COUNTER_ANGLE;
  const [px, py] = polar(DIAL_R + 6, a, DIAL);
  const out = [S(k.cylinder(px, py, 2.4, 0, COUNTER.face[1] + 1.2, P, 20, 0.3), { tone: "mid" })];
  const tip = polar(DIAL_R - 3.2, a, DIAL);
  const ring = [polar(1.2, a + Math.PI / 2, [px, py]), polar(1.2, a - Math.PI / 2, [px, py]), polar(0.5, a - Math.PI / 2, tip), polar(0.5, a + Math.PI / 2, tip)];
  out.push(S(k.extrude(ring, COUNTER.face[1] + 1.2, 0.8, P), { tone: "hi", crease: "lo" }));
  return out.join("");
}

function pillar(a) {
  const [x, y] = polar(PILLAR_RING, a);
  return [
    S(k.cylinder(x, y, 6, 0, 3, P, 32, 0.4), { tone: "lo" }),
    S(k.cylinder(x, y, 2.8, 3, FLANGE[0] - 3, P, 24), { tone: "mid", crease: "none", inner: Ln(k.sideArc(x, y, 2.8, 12, P, 16) + k.sideArc(x, y, 2.8, 50, P, 16), { tone: "faint" }) }),
    S(k.cylinder(x, y, 4.6, FLANGE[0], GLASS_Z - FLANGE[0], P, 28, 0.3), { tone: "mid" }),
  ].join("");
}

// ---- The glass: back half (under the light) and front half (engraving over it) --
const R1 = (v) => Math.round(v * 10) / 10;
function glassBack() {
  const side = k.cylinder(0, 0, GLASS_R, GLASS_Z, GLASS_T, P, 180);
  return `<g class="or-glass"><path class="or-glass-side" d="${side.shades.join("")}"/><path class="or-glass-top" d="${k.ring(0, 0, GLASS_R, GLASS_TOP, P, 200)}"/>` +
    `<path class="or-frost" d="${k.onTop(BODY, GLASS_TOP, P, true)}"/><path class="or-frost" d="${k.ring(DOTS[FREE][0], DOTS[FREE][1], DOT_R, GLASS_TOP, P, 96)}"/>` +
    `<path class="or-body-lit" d="${k.onTop(BODY, GLASS_TOP, P, true)}${k.ring(DOTS[FREE][0], DOTS[FREE][1], DOT_R, GLASS_TOP, P, 96)}"/></g>`;
}
function glassFront() {
  const side = k.cylinder(0, 0, GLASS_R, GLASS_Z, GLASS_T, P, 180);
  const out = [];
  out.push(Ln(side.outline, { tone: "mid" }));
  out.push(Ln(side.crease, { tone: "lo" }));
  out.push(Ln(k.ring(0, 0, GLASS_R - 1.2, GLASS_TOP, P, 200), { tone: "faint" }));
  // degree ring: ticks hang inward from a scale ring, every 5°, a major every 30°
  out.push(Ln(k.ring(0, 0, GLASS_R - 3.5, GLASS_TOP, P, 200), { tone: "lo" }));
  const t = k.radialTicks(0, 0, GLASS_R - 3.5, 72, 6, GLASS_TOP, [2.2, 4.4], P);
  out.push(Ln(t.minor, { tone: "lo" }), Ln(t.major, { tone: "mid" }));
  // home marks: a short bar at each planet's logomark angle, rooted on the scale ring
  // home marks: a small engraved index triangle at each planet's logomark angle, on the scale ring
  const home = HOME.map((a) => k.onTop([polar(GLASS_R - 3.5, a - 0.022), polar(GLASS_R - 3.5, a + 0.022), polar(GLASS_R - 9.5, a)], GLASS_TOP, P, true)).join("");
  out.push(Ln(home, { tone: "hi" }));
  out.push(`<g class="or-engrave">${Ln(k.onTop(BODY, GLASS_TOP, P, true), { tone: "mid" })}${Ln(k.ring(DOTS[FREE][0], DOTS[FREE][1], DOT_R, GLASS_TOP, P, 120), { tone: "mid" })}</g>`);
  // pillar cap nuts on the glass
  for (const a of PILLARS) {
    const [x, y] = polar(PILLAR_RING, a);
    out.push(S(k.cylinder(x, y, 4.2, GLASS_TOP, 1.8, P, 6, 0.3), { tone: "mid" }));
    out.push(D([at([x, y, GLASS_TOP + 1.8])], { size: 0.5 }));
  }
  return out.join("");
}

// ---- Column: the telescoping stack of arbors, bottom to top ---------------------
// Each wheel sits on its own arbor; above the wheels the arbors step in at each hub.
function columnPieces() {
  // returns [{ z0, z1, r, tone }] in paint order, with slots for wheels and arms marked
  const out = [];
  out.push({ kind: "boss" });
  // wheels from the bottom: g = 0..3 is level 3..0
  for (let g = 0; g < 4; g++) {
    const level = 3 - g;
    const z0 = g === 0 ? 3.6 : GEAR_Z[g] - 1.2;
    const z1 = g === 3 ? HUB(0)[0] : GEAR_Z[g + 1] - 1.2;
    out.push({ kind: "tube", r: TUBE_R[level], z0, z1: GEAR_Z[g], level });
    out.push({ kind: "gear", g, level });
    out.push({ kind: "tube", r: TUBE_R[level], z0: GEAR_Z[g] + GEAR_T, z1, level, collar: true });
  }
  for (let level = 0; level < 4; level++) {
    out.push({ kind: "arm", level });
    const z0 = HUB(level)[1];
    const z1 = level < 3 ? HUB(level + 1)[0] : FLANGE[0];
    out.push({ kind: "tube", r: level < 3 ? TUBE_R[level + 1] : SPINDLE_R, z0, z1, above: level });
  }
  out.push({ kind: "flange" });
  return out;
}

function tubeSvg({ r, z0, z1 }) {
  if (z1 - z0 < 0.05) return "";
  return S(k.cylinder(0, 0, r, z0, z1 - z0, P, 40), { tone: "mid", crease: "none" });
}

// Static slots in paint order. Live parts are empty groups the page fills.

const stack = [];
// Behind the column: far pillar, far drive parts.
// The deck furniture that lies under everything else goes first.
const pillarsFar = PILLARS.filter((a) => !nearHalf(polar(PILLAR_RING, a)) || Math.abs(Math.cos(a - (72 * Math.PI) / 180)) < 0.2);
const pillarsNear = PILLARS.filter((a) => !pillarsFar.includes(a));

// The gear train: column wheels and layshaft pinions at each level, far before near.
const gearSpecs = [];
for (let i = 0; i < 4; i++) {
  const [p, w] = TEETH[i];
  const m = moduleOf(i);
  const z = wheelZ(i);
  gearSpecs.push({ name: `wheel-${i}`, cx: 0, cy: 0, r: (m * w) / 2, teeth: w, m, z, h: GEAR_T, hub: TUBE_R[LEVEL[i]] + 1.6, holes: true, planet: i, kind: "wheel" });
  gearSpecs.push({ name: `pinion-${i}`, cx: LAY[0], cy: LAY[1], r: (m * p) / 2, teeth: p, m, z, h: GEAR_T, hub: 3.2, holes: false, planet: i, kind: "pinion" });
}
gearSpecs.push({ name: "worm-wheel", cx: LAY[0], cy: LAY[1], r: WORM_WHEEL.r, teeth: WORM_TEETH, m: (2 * WORM_WHEEL.r) / WORM_TEETH, z: WORM_WHEEL.z[0], h: WORM_WHEEL.z[1] - WORM_WHEEL.z[0], hub: 3.4, holes: true, kind: "worm" });
gearSpecs.push({ name: "counter-pinion", cx: LAY[0], cy: LAY[1], r: (COUNTER.m * COUNTER.pinion) / 2, teeth: COUNTER.pinion, m: COUNTER.m, z: COUNTER.z[0], h: COUNTER.z[1] - COUNTER.z[0], hub: 2.4, holes: false, kind: "cpinion" });
gearSpecs.push({ name: "counter-idler", cx: IDLER[0], cy: IDLER[1], r: (COUNTER.m * COUNTER.idler) / 2, teeth: COUNTER.idler, m: COUNTER.m, z: COUNTER.z[0], h: COUNTER.z[1] - COUNTER.z[0], hub: 3, holes: true, kind: "cidler" });
gearSpecs.push({ name: "counter-wheel", cx: DIAL[0], cy: DIAL[1], r: DIAL_R, teeth: COUNTER.wheel, m: COUNTER.m, z: COUNTER.z[0], h: COUNTER.z[1] - COUNTER.z[0], hub: 3, holes: false, kind: "cwheel" });

// Tooth phases so every pair meshes: at drive 0, each wheel has a tooth centred on the line
// to its pinion and the pinion has a gap there. Angles of everything as functions of drive n.
const toLay = Math.atan2(LAY[1], LAY[0]);
function phases() {
  const out = {};
  for (let i = 0; i < 4; i++) {
    const [p, w] = TEETH[i];
    out[`wheel-${i}`] = toLay - HOME[i]; // tooth at toLay when arm at HOME
    out[`pinion-${i}`] = toLay + Math.PI - Math.PI / p; // gap at toLay+π when layshaft at 0
  }
  out["worm-wheel"] = 0;
  out["counter-pinion"] = TRAIN_ANGLE - Math.PI / COUNTER.pinion; // gap toward the idler
  out["counter-idler"] = TRAIN_ANGLE + Math.PI; // tooth toward the pinion, and so one toward the dial
  out["counter-wheel"] = TRAIN_ANGLE + Math.PI + Math.PI / COUNTER.wheel; // gap toward the idler
  return out;
}
const PHASE = phases();

const DRIVE0 = 2.85; // drive turns at load: half way round, the four planets well spread

// Angles at drive n: arms advance, the layshaft turns the other way once per drive turn.
function anglesAt(n) {
  const arms = TURNS.map((t, i) => HOME[i] + (TAU * t * n) / PERIOD);
  const lay = -TAU * n;
  const dial = -(TAU * n) / PERIOD; // dial wheel: 8/48 of the layshaft, reversed twice
  const idler = (TAU * n * 8) / 40;
  return { arms, lay, dial, idler, worm: TAU * WORM_TEETH * n };
}
function gearAngle(spec, A) {
  if (spec.kind === "wheel") return A.arms[spec.planet] + PHASE[spec.name];
  if (spec.kind === "pinion") return A.lay + PHASE[spec.name];
  if (spec.kind === "worm" || spec.kind === "cpinion") return A.lay + PHASE[spec.name];
  if (spec.kind === "cidler") return A.idler + PHASE[spec.name];
  return A.dial + PHASE[spec.name];
}

// Paint order of the gear train: by level band, then far to near within a band.
const BANDS = [
  { z: COUNTER.z[0], items: ["counter-pinion", "counter-wheel"] },
  { z: WORM_WHEEL.z[0], items: ["worm-wheel"] },
  ...GEAR_Z.map((z, g) => ({ z, items: [`wheel-${BY_LEVEL[3 - g]}`, `pinion-${BY_LEVEL[3 - g]}`] })),
];

// ---- Assemble the back SVG --------------------------------------------------------
const A0 = anglesAt(DRIVE0);
const PROJ = P;
const ARMZ = ARM_Z, HUBR = HUB_R, ARMW = ARM_W, ARMT = ARM_T, TAILR = TAIL;
const REACH = ORBIT.map(() => 0);
LEVEL.forEach((level, i) => (REACH[level] = ORBIT[i]));
const VIEW = [VX, VY];

function gearGroup(spec) {
  const a = gearAngle(spec, A0);
  const holes = spec.holes ? gearHoles(spec.cx, spec.cy, spec.r, spec.m, spec.hub, a, spec.z + spec.h) : "";
  return `<g data-gear="${spec.name}"><g data-teeth>${gearSvg(spec.cx, spec.cy, spec.r, spec.teeth, a, spec.m, spec.z, spec.h, spec.hub)}</g><path class="iso-line" data-tone="lo" data-holes d="${holes}"/></g>`;
}
const specOf = Object.fromEntries(gearSpecs.map((s) => [s.name, s]));

// layshaft as segments between its gears; a collar on top
function layshaft() {
  const [x, y] = LAY;
  return {
    boss: S(k.cylinder(x, y, 5, 0, 3, P, 28, 0.3), { tone: "lo" }) + D([at([x + 3.6, y, 3]), at([x - 3.6, y, 3])], { size: 0.4 }),
    seg: (z0, z1) => (z1 - z0 > 0.05 ? S(k.cylinder(x, y, 1.8, z0, z1 - z0, P, 18), { tone: "mid", crease: "none" }) : ""),
    hub: (z, h, r) => S(k.cylinder(x, y, r, z, h, P, 22, 0.2), { tone: "mid" }),
    cap: S(k.cylinder(x, y, 3, GEAR_Z[3] + GEAR_T + 0.6, 1.6, P, 22, 0.3), { tone: "mid" }) + D([at([x, y, GEAR_Z[3] + GEAR_T + 2.2])], { size: 0.5 }),
  };
}

function backSvg() {
  const out = [];
  out.push(base());
  out.push(label());
  for (const a of pillarsFar) out.push(pillar(a));
  // counter dial: wheel + face rotate together; drawn first (lowest), then its index finger
  // column foot boss
  const boss = S(k.cylinder(0, 0, 11, 0, 3.6, P, 48, 0.5), { tone: "lo" }) +
    D(Array.from({ length: 6 }, (_, i) => at([...polar(8.4, (i * TAU) / 6), 3.6])), { size: 0.45 });
  const lay = layshaft();
  out.push(boss);
  out.push(lay.boss);
  // counter band (lowest gears)
  const cOrder = byDepth(["counter-pinion", "counter-idler", "counter-wheel"], (n) => [specOf[n].cx, specOf[n].cy]);
  out.push(lay.seg(3, COUNTER.z[0]));
  for (const n of cOrder) {
    if (n === "counter-wheel") out.push(`<g data-gear="counter-wheel">${counterWheelSvg(A0.dial)}</g>`);
    else out.push(gearGroup(specOf[n]));
  }
  out.push(counterIndex());
  out.push(lay.seg(COUNTER.z[1], WORM_WHEEL.z[0]));
  // the column's innermost arbor rises from the boss
  out.push(drive("worm"));
  out.push(gearGroup(specOf["worm-wheel"]));
  // Column and layshaft gears, level by level.
  let z = WORM_WHEEL.z[1];
  for (let g = 0; g < 4; g++) {
    const i = BY_LEVEL[3 - g];
    const level = LEVEL[i];
    const gz = GEAR_Z[g];
    const tubeBelow = tubeSvg({ r: TUBE_R[level], z0: g === 0 ? 3.6 : GEAR_Z[g - 1] + GEAR_T, z1: gz });
    const layBelow = lay.seg(z, gz);
    // which is nearer: column (0,0) or layshaft
    const layNear = depth(LAY) > depth([0, 0]);
    out.push(layNear ? tubeBelow + layBelow : layBelow + tubeBelow);
    const wheel = gearGroup(specOf[`wheel-${i}`]), pin = gearGroup(specOf[`pinion-${i}`]);
    out.push(layNear ? wheel + (g === 0 ? drive("motor") : "") + pin : pin + wheel);
    out.push(S(k.cylinder(0, 0, TUBE_R[level] + 1.6, gz + GEAR_T, 0.8, P, 32, 0.2), { tone: "mid" }));
    z = gz + GEAR_T;
  }
  out.push(lay.seg(z, z + 0.6) + lay.cap);
  // above the wheels: outer arbor up to the first hub
  out.push(tubeSvg({ r: TUBE_R[0], z0: GEAR_Z[3] + GEAR_T + 0.8, z1: HUB(0)[0] }));
  // arms, hubs, pucks
  for (let level = 0; level < 4; level++) {
    const i = BY_LEVEL[level];
    const [h0, h1] = HUB(level);
    out.push(`<g data-arm-back="${level}"></g>`);
    out.push(S(k.cylinder(0, 0, HUB_R[level], h0, h1 - h0, P, 48, 0.4), { tone: "mid", inner: Ln(k.sideArc(0, 0, HUB_R[level], h0 + 0.9, P, 32), { tone: "faint" }) }));
    out.push(`<g data-arm-front="${level}"></g>`);
    out.push(`<g data-puck-slot="${level}-back"></g>`);
    const z1 = level < 3 ? HUB(level + 1)[0] : FLANGE[0];
    const r = level < 3 ? TUBE_R[level + 1] : SPINDLE_R;
    out.push(tubeSvg({ r, z0: h1, z1 }));
    if (level < 3) out.push(Ln(k.sideArc(0, 0, r, (h1 + z1) / 2, P, 24), { tone: "lo" }));
    out.push(`<g data-puck-slot="${level}-front"></g>`);
  }
  out.push(S(k.cylinder(0, 0, FLANGE_R, FLANGE[0], FLANGE[1] - FLANGE[0], P, 56, 0.4), { tone: "mid" }));
  for (const a of pillarsNear) out.push(pillar(a));
  out.push(glassBack());
  return out.join("");
}

function counterFace(angle) {
  // the dial face rides on the wheel: six divisions of drive turns; the zero (alignment) mark
  // comes round to the fixed index finger once per period
  const P = PROJ;
  const [cx, cy] = DIAL;
  const W = CWHEEL;
  const zeroAt = W.index + angle;
  const t = k.radialTicks(cx, cy, W.faceR, 36, 6, W.top, [1.6, 3.6], P, zeroAt + Math.PI / 2);
  const zero = k.lineOnTop([cx + Math.cos(zeroAt) * 2.6, cy + Math.sin(zeroAt) * 2.6], [cx + Math.cos(zeroAt) * W.faceR, cy + Math.sin(zeroAt) * W.faceR], W.top, P);
  return { minor: t.minor, major: t.major, zero };
}
function counterWheelSvg(angle) {
  const P = PROJ;
  const [cx, cy] = DIAL;
  const W = CWHEEL;
  const f = counterFace(angle);
  return '<g data-teeth>' + gearSvg(cx, cy, W.r, W.teeth, angle + W.phase, W.m, W.z, W.h, 3) + '</g>' +
    k.solidSvg(k.cylinder(cx, cy, W.faceR, W.z + W.h, W.top - W.z - W.h, P, 96, 0.3), { tone: "hi", crease: "lo" }) +
    '<path class="iso-line" data-tone="lo" data-minor d="' + f.minor + '"/><path class="iso-line" data-tone="mid" data-major d="' + f.major + '"/>' +
    '<path class="iso-line" data-tone="hi" data-zero d="' + f.zero + '"/>' + k.lineSvg(k.ring(cx, cy, 2.6, W.top, P, 20), { tone: "lo" });
}

const CWHEEL = {
  r: DIAL_R, teeth: COUNTER.wheel, m: COUNTER.m, z: COUNTER.z[0], h: COUNTER.z[1] - COUNTER.z[0],
  phase: PHASE["counter-wheel"], faceR: DIAL_R - 2.4, top: COUNTER.face[1], index: COUNTER_ANGLE,
};

// ---- Planets: a lamp puck on a pedestal, built at the origin and moved per frame ----
function puckSvg(i) {
  const level = LEVEL[i];
  const z = puckZ(level);
  const lit = i === FREE;
  const out = [];
  out.push(S(k.cylinder(0, 0, 5, z - PEDESTAL_H, PEDESTAL_H, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(0, 0, DOT_R, z, PUCK_T, P, 128, 0.6), { tone: "hi", crease: "lo", lit, inner: Ln(k.sideArc(0, 0, DOT_R, z + 1.1, P, 64), { tone: "faint" }) }));
  const top = z + PUCK_T;
  out.push(Ln(k.ring(0, 0, DOT_R - 3.6, top, P, 120), { tone: lit ? "mid" : "lo" }));
  // the lamp lens: a raised frosted disc with two rings, held by eight screws in the bezel
  out.push(S(k.cylinder(0, 0, DOT_R - 6, top, 0.5, P, 96, 0.3), { tone: lit ? "mid" : "lo", crease: "faint" }));
  out.push(Ln(k.ring(0, 0, DOT_R - 14, top + 0.5, P, 72) + k.ring(0, 0, 4.2, top + 0.5, P, 24), { tone: "faint" }));
  const screws = Array.from({ length: 8 }, (_, n) => polar(DOT_R - 1.9, (n * TAU) / 8 + 0.2));
  out.push(D(screws.map(([x, y]) => at([x, y, top])), { size: 0.45, tone: lit ? "hi" : "mid" }));
  out.push(D([at([0, 0, top + 0.5])], { size: 0.6, tone: lit ? "lit" : "mid" }));
  return out.join("");
}

// The fallback light (no WebGL): a disc on the glass over each planet.
const fallbackDisc = k.ring(0, 0, DOT_R, GLASS_TOP, P, 96);

// ---- Body distance field for the shader ------------------------------------------
const SDF_BOX = [-114, -92, 228, 184]; // x0, y0, w, h in world units
const SDF_W = 229, SDF_H = 185;
const SDF_SPAN = 10;
function bodySdf() {
  const data = new Uint8Array(SDF_W * SDF_H);
  const n = BODY.length;
  const inside = ([px, py]) => {
    let hit = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = BODY[i], [xj, yj] = BODY[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  for (let row = 0; row < SDF_H; row++) {
    for (let col = 0; col < SDF_W; col++) {
      const p = [SDF_BOX[0] + (col / (SDF_W - 1)) * SDF_BOX[2], SDF_BOX[1] + (row / (SDF_H - 1)) * SDF_BOX[3]];
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        const a = BODY[i], b = BODY[(i + 1) % n];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
      }
      const d = inside(p) ? -best : best;
      data[row * SDF_W + col] = Math.round(127.5 + (Math.max(-SDF_SPAN, Math.min(SDF_SPAN, d)) / SDF_SPAN) * 127.5);
    }
  }
  return Buffer.from(data).toString("base64");
}
const SDF = bodySdf();

// ---- Live state as data ---------------------------------------------------------
const DATA = {
  W: WIDTH, H: HEIGHT, P, camera: CAM, TAU, PERIOD, TURNS, HOME, ORBIT, LEVEL, FREE, DOT_R,
  DRIVE0, WORM_TEETH, WORM, GLASS_TOP, GLASS_R, PUCK_Z: LEVEL.map((level) => puckZ(level) + PUCK_T),
  ARMZ: ARM_Z, HUBR: HUB_R, ARMW: ARM_W, ARMT: ARM_T, TAILR: TAIL, REACH, VIEW, PHASE, DIAL, CWHEEL,
  gears: gearSpecs.filter((s) => s.kind !== "cwheel").map(({ name, cx, cy, r, teeth, m, z, h, hub, holes, planet, kind }) => ({ name, cx, cy, r, teeth, m, z, h, hub, holes, planet, kind })),
  sdf: { box: SDF_BOX, w: SDF_W, h: SDF_H, span: SDF_SPAN, data: SDF },
  teal: BRAND.teal,
};

// ---- The shader: light on the glass top plane --------------------------------------
// Everything lives on the plane z = GLASS_TOP (onFloor), in world units.
// uPuck[k]: x, y, depth below the glass, lamp level; uArm[k]: cos, sin, reach, level;
// uTrail[k]: angle, turns per drive turn, orbit radius, level. Levels order the shadows:
// a higher planet or arm stops the light of every lower one.
const FRAGMENT = `
uniform vec4 uPuck[4];
uniform vec4 uArm[4];
uniform vec4 uTrail[4];
uniform vec4 uHome[4];
uniform vec4 uGlow;      // x: lamps, y: alignment, z: flow front 0..1, w: bloom
uniform float uLight;
uniform float uTau;
uniform sampler2D uSdf;
uniform vec4 uSdfBox;
uniform vec4 uGeo;       // x: dot radius, y: glass radius, z: glass top, w: sdf span
float segDist(vec2 p, vec2 a, vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}
float bodySd(vec2 p){
  vec2 uv=(p-uSdfBox.xy)/uSdfBox.zw;
  float inBox=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
  float v=texture2D(uSdf,clamp(uv,0.,1.)).r;
  return mix(uGeo.w,(v*255.-127.5)/127.5*uGeo.w,inBox);
}
vec4 over(vec4 top,vec4 under){return top+under*(1.-top.a);}
vec4 inkFor(vec3 seen,float cover){vec3 absorbed=1.-seen;float a=max(max(absorbed.r,max(absorbed.g,absorbed.b)),cover);return vec4(vec3(a)-absorbed,a);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec3 q=onFloor(vb,uGeo.z);
  vec2 p=q.xy;
  float px=pixelOf()/uCam.z;
  float R=uGeo.x;
  float rad=length(p);
  float onGlass=1.-smoothstep(uGeo.y-16.,uGeo.y-8.,rad);
  if(onGlass<=0.){gl_FragColor=vec4(0.);return;}
  float sw=.3/uK;
  // lamps: a soft disc of the dot's exact radius over each planet, softer the deeper it sits
  float lamp=0.;float core=0.;
  for(int k=0;k<4;k++){
    vec4 pk=uPuck[k];
    float d=length(p-pk.xy);
    float soft=.5*px+.07*pk.z;
    float disc=1.-smoothstep(R-soft,R+soft,d);
    float shade=1.;
    for(int j=0;j<4;j++){
      vec4 pj=uPuck[j];
      vec4 aj=uArm[j];
      float higher=step(uTrail[k].w+.5,uTrail[j].w);
      float occ=1.-smoothstep(R-.9,R+.9,length(p-pj.xy));
      float bar=1.-smoothstep(2.5-.9,2.5+.9,segDist(p,vec2(0.),aj.xy*aj.z));
      shade*=1.-higher*max(occ,bar)*.92;
    }
    lamp+=disc*shade*pk.w*(.62+.38*exp(-d*d/180.));
    core+=disc*shade*pk.w*exp(-d*d/40.);
  }
  // phosphor trails: a thin line on each planet's true orbit, fading behind it
  float trail=0.;
  float phi=atan(p.y,p.x);
  for(int k=0;k<4;k++){
    vec4 t=uTrail[k];
    float ang=mod(t.x-phi,6.2831853);
    float age=ang/(6.2831853*t.y);
    float line=exp(-pow((rad-t.z)/(1.1+.7*px),2.))+.22*exp(-pow((rad-t.z)/7.,2.));
    trail+=line*exp(-age/uTau)*smoothstep(0.,.08,ang);
  }
  trail*=uGlow.x;
  // the engraved body: light flows out of the four dots and fills it, brightest along its edge
  float sb=bodySd(p);
  vec2 hf=uHome[3].xy;
  float sf=length(p-hf)-R;
  float s=min(sb,sf);
  float fill=1.-smoothstep(-sw,.6*sw,s);
  float rimIn=fill*exp(-max(-s-sw,0.)/2.6);
  float e=0.;
  for(int k=0;k<4;k++){e+=exp(-(length(p-uHome[k].xy)-R)/14.);}
  float f=-14.*log(max(e,1e-6));
  float front=uGlow.z*118.-12.;
  float flow=1.-smoothstep(front-22.,front,f);
  float body=uGlow.y*flow*(.42*fill+.95*rimIn)+uGlow.w*fill*.55;
  // energies to light
  vec3 lampHue=vec3(.42,.86,.84);
  vec3 trailHue=vec3(.30,.86,.84);
  vec3 bodyHue=vec3(.20,.70,.71);
  vec3 dark=lampHue*lamp*.62+vec3(.8,1.,1.)*core*.55+trailHue*trail*.75+bodyHue*body*1.15;
  dark=tonemap(dark,1.2)*onGlass;
  float m=max(dark.r,max(dark.g,dark.b));
  float n=(hash12(gl_FragCoord.xy+fract(uTime*.61)*91.)+hash12(gl_FragCoord.yx*1.37+fract(uTime*.37)*57.)-1.)/255.;
  vec4 darkInk=vec4(max(dark+n*smoothstep(0.,1.5/255.,m),0.),0.);
  darkInk.a=max(darkInk.r,max(darkInk.g,darkInk.b));
  // paper: a saturated teal body with a pale core, inks solved from what the paper should show
  float eb=1.-exp(-1.6*body);
  vec3 bodySeen=mix(mix(vec3(1.),vec3(.16,.55,.56),smoothstep(.0,.55,eb)),vec3(.80,.95,.94),smoothstep(.75,1.,eb)*.6);
  vec4 bodyInk=inkFor(bodySeen,.0)*smoothstep(0.,.08,eb);
  float el=1.-exp(-1.4*lamp);
  vec3 lampSeen=mix(vec3(1.),vec3(.62,.86,.86),smoothstep(0.,.7,el));
  lampSeen=mix(lampSeen,vec3(.17,.56,.57),smoothstep(.0,1.,1.-exp(-2.*core))*.65);
  vec4 lampInk=inkFor(lampSeen,0.)*smoothstep(0.,.05,el);
  float et=1.-exp(-1.3*trail);
  vec4 trailInk=inkFor(mix(vec3(1.),vec3(.24,.62,.63),et*.85),0.)*smoothstep(0.,.04,et);
  vec4 paper=over(trailInk,over(lampInk,bodyInk))*onGlass;
  paper.rgb=min(paper.rgb,vec3(paper.a));
  float pm=paper.a;
  paper=max(paper+vec4(n)*smoothstep(0.,1.5/255.,pm),0.);
  paper.rgb=min(paper.rgb,vec3(paper.a));
  gl_FragColor=mix(darkInk,paper,uLight);
}`;

// ---- Page ---------------------------------------------------------------------------
// Fill the live slots with the opening pose so the page reads before any script runs.
const lifted = (i, n) => {
  const a = anglesAt(n).arms[i];
  return [ORBIT[i] * Math.cos(a), ORBIT[i] * Math.sin(a)];
};
function fillSlots(markup) {
  let out = markup;
  for (let level = 0; level < 4; level++) {
    const i = BY_LEVEL[level];
    const parts = armParts(level, A0.arms[i]);
    out = out.replace(`<g data-arm-back="${level}"></g>`, `<g data-arm-back="${level}">${parts.back}</g>`);
    out = out.replace(`<g data-arm-front="${level}"></g>`, `<g data-arm-front="${level}">${parts.front}</g>`);
    const [x, y] = lifted(i, DRIVE0);
    const side = nearHalf([x, y]) ? "front" : "back";
    out = out.replace(`<g data-puck-slot="${level}-${side}"></g>`, `<g data-puck-slot="${level}-${side}"><g data-puck="${i}" transform="${k.translateAlong(P, [x, y, 0])}">${puckSvg(i)}</g></g>`);
  }
  const discs = DOTS.map((_, i) => {
    const [x, y] = lifted(i, DRIVE0);
    return `<path data-fall="${i}" d="${fallbackDisc}" transform="${k.translateAlong(P, [x, y, 0])}"/>`;
  }).join("");
  return out.replace("</g></svg>", `</g><g class="or-fallback">${discs}</g></svg>`);
}

const backMarkup = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  className: "or-back",
  label:
    "A brass orrery whose four planets are the four dots of the Mereka logomark. A motor and worm turn a layshaft; four pinions on it drive four wheels on nested arbors at 1/2, 2/3, 5/6 and 1/3 of its speed, so the four arms lap one another on four levels and all come home together once every six turns of the drive. Each planet is a lamp under an engraved glass top: when they align, their four discs of light fill the engraved mark exactly.",
  body: backSvg(),
});
const backFilled = backMarkup.replace(/<\/svg>$/, `<g class="or-fallback">${DOTS.map((_, i) => {
  const [x, y] = lifted(i, DRIVE0);
  return `<path data-fall="${i}" d="${fallbackDisc}" transform="${k.translateAlong(P, [x, y, 0])}"/>`;
}).join("")}</g></svg>`);
let backFinal = backFilled;
for (let level = 0; level < 4; level++) {
  const i = BY_LEVEL[level];
  const parts = armParts(level, A0.arms[i]);
  backFinal = backFinal.replace(`<g data-arm-back="${level}"></g>`, `<g data-arm-back="${level}">${parts.back}</g>`);
  backFinal = backFinal.replace(`<g data-arm-front="${level}"></g>`, `<g data-arm-front="${level}">${parts.front}</g>`);
  const [x, y] = lifted(i, DRIVE0);
  const side = nearHalf([x, y]) ? "front" : "back";
  backFinal = backFinal.replace(`<g data-puck-slot="${level}-${side}"></g>`, `<g data-puck-slot="${level}-${side}"><g data-puck="${i}" transform="${k.translateAlong(P, [x, y, 0])}">${puckSvg(i)}</g></g>`);
}
const frontMarkup = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg or-layer or-front" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">${glassFront()}</svg>`;
const STAGE = `<div class="or-stage" tabindex="0" role="slider" aria-label="Mereka orrery: hover or drag across to turn the drive; arrow keys step a twelfth of a turn, Space or End jumps to the next alignment, Home to the last" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${DRIVE0}">${backFinal}<canvas class="or-layer or-gl" aria-hidden="true"></canvas>${frontMarkup}<span class="or-said" aria-live="polite"></span></div>`;

const CSS = `
.or-stage{position:relative;touch-action:pan-y;outline:none;cursor:ew-resize}
.or-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.or-stage>svg,.or-stage>canvas{display:block;width:100%;height:auto}
.or-stage>.or-layer{position:absolute;inset:0;height:100%!important;pointer-events:none}
.iso:not([data-theme="light"]) .or-gl{mix-blend-mode:screen}
.or-said{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.iso-figure{--or-glass:rgba(170,225,228,.045);--or-glass-edge:rgba(170,225,228,.11);--or-frost:rgba(205,240,240,.045);--or-lit-fill:#2d898b;--or-lamp:#7fd3d1}
.iso[data-theme="light"] .iso-figure{--or-glass:rgba(110,160,166,.075);--or-glass-edge:rgba(100,150,156,.2);--or-frost:rgba(255,255,255,.4);--or-lit-fill:#2d898b;--or-lamp:#2d898b}
.or-glass-top{fill:var(--or-glass);stroke:none}
.or-glass-side{fill:var(--or-glass-edge);stroke:none}
.or-frost{fill:var(--or-frost);stroke:none}
.or-body-lit{fill:var(--or-lit-fill);stroke:none;opacity:calc(var(--or-align,0)*.55)}
.or-fallback path{fill:var(--or-lamp);stroke:none;opacity:calc(var(--or-lamps,1)*.22)}
.iso[data-theme="light"] .or-fallback path,.iso[data-theme="light"] .or-body-lit{mix-blend-mode:multiply}
.or-stage[data-gl] .or-body-lit,.or-stage[data-gl] .or-fallback{display:none}
`;

const LIVE_SOURCE = String.raw`// ---- live: the drive, the tour, the light ----
const stage = document.querySelector(".or-stage");
const back = stage.querySelector(".or-back");
const canvas = stage.querySelector(".or-gl");
const said = stage.querySelector(".or-said");
const host = stage.closest(".iso") || document.body;
const readout = stage.closest(".iso-plate").querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const gearEls = D.gears.map((g) => { const el = back.querySelector('[data-gear="' + g.name + '"]'); return { g, el, teeth: el.querySelector("[data-teeth]"), holes: el.querySelector("[data-holes]"), drawn: NaN, idx: -1, cache: [] }; });
const counterEl = back.querySelector('[data-gear="counter-wheel"]');
const counter = { g: { cx: DIAL[0], cy: DIAL[1], r: CWHEEL.r, teeth: CWHEEL.teeth, m: CWHEEL.m, z: CWHEEL.z, h: CWHEEL.h, hub: 3 }, teeth: counterEl.querySelector("[data-teeth]"), minor: counterEl.querySelector("[data-minor]"), major: counterEl.querySelector("[data-major]"), zero: counterEl.querySelector("[data-zero]"), drawn: NaN, idx: -1, cache: [] };
// A gear's toothed body repeats every tooth pitch: keep QUANT parsed poses per gear and swap
// them in, so turning a gear costs a node swap rather than a parse.
const QUANT = 40;
const SVGNS = "http://www.w3.org/2000/svg";
function swapTeeth(item, a, g) {
  const pitch = TAU / g.teeth;
  const idx = ((Math.round(((a / pitch) % 1) * QUANT) % QUANT) + QUANT) % QUANT;
  if (idx === item.idx) return;
  item.idx = idx;
  let node = item.cache[idx];
  if (!node) {
    node = document.createElementNS(SVGNS, "g");
    node.innerHTML = gearSvg(g.cx, g.cy, g.r, g.teeth, (idx / QUANT) * pitch, g.m, g.z, g.h, g.hub);
    item.cache[idx] = node;
  }
  item.teeth.replaceChildren(node);
}
const threadEl = back.querySelector('[data-part="thread"]');
const armBack = [0, 1, 2, 3].map((l) => back.querySelector('[data-arm-back="' + l + '"]'));
const armFront = [0, 1, 2, 3].map((l) => back.querySelector('[data-arm-front="' + l + '"]'));
const slots = [0, 1, 2, 3].map((l) => ({ back: back.querySelector('[data-puck-slot="' + l + '-back"]'), front: back.querySelector('[data-puck-slot="' + l + '-front"]') }));
const pucks = [0, 1, 2, 3].map((i) => back.querySelector('[data-puck="' + i + '"]'));
const falls = [0, 1, 2, 3].map((i) => back.querySelector('[data-fall="' + i + '"]'));
const BY_LEVEL = [0, 1, 2, 3].map((l) => D.LEVEL.indexOf(l));
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const mod = (a, n) => ((a % n) + n) % n;

// ---- the light layer ----
let layer = null;
try {
  layer = glLayer({ canvas, fragment: FRAGMENT, view: [D.W, D.H], camera: D.camera, uniforms: ["uPuck", "uArm", "uTrail", "uHome", "uGlow", "uLight"], fixed: { uTau: 0.24, uSdfBox: D.sdf.box, uGeo: [D.DOT_R, D.GLASS_R, D.GLASS_TOP, D.sdf.span] } });
} catch (error) { layer = null; }
if (layer) {
  const gl = layer.gl;
  const bytes = Uint8Array.from(atob(D.sdf.data), (c) => c.charCodeAt(0));
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, D.sdf.w, D.sdf.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  stage.setAttribute("data-gl", "");
}
const HOMES = new Float32Array(16);
D.HOME.forEach((a, i) => { HOMES[i * 4] = D.ORBIT[i] * Math.cos(a); HOMES[i * 4 + 1] = D.ORBIT[i] * Math.sin(a); });

// ---- the model: everything follows the drive n (layshaft turns) ----
const errorOf = (A) => Math.max(...A.arms.map((a, i) => Math.abs(wrapPi(a - HOME[i]))));
let n = still.matches ? PERIOD * Math.ceil(D.DRIVE0 / PERIOD) : D.DRIVE0;
let target = n;
const drive = { x: n, v: 0 };
let follow = 0.4;
const env = { lamps: { x: still.matches ? 1 : 0, v: 0 }, align: { x: 0, v: 0 }, flow: { x: 0, v: 0 } };
let bloomAt = -1e9, bloomed = false, clock = 0;
let drawn = null, alignedSaid = null;

function place() {
  const A = anglesAt(n);
  for (const item of gearEls) {
    const g = item.g;
    const a = (g.kind === "wheel" ? A.arms[g.planet] : g.kind === "cidler" ? A.idler : A.lay) + PHASE[g.name];
    if (g.holes && Math.abs(a - item.drawn) > 0.06 / g.r) { item.drawn = a; item.holes.setAttribute("d", gearHoles(g.cx, g.cy, g.r, g.m, g.hub, a, g.z + g.h)); }
    swapTeeth(item, a, g);
  }
  swapTeeth(counter, A.dial + CWHEEL.phase, counter.g);
  if (Math.abs(A.dial - counter.drawn) > 0.002) {
    counter.drawn = A.dial;
    const f = counterFace(A.dial);
    counter.minor.setAttribute("d", f.minor); counter.major.setAttribute("d", f.major); counter.zero.setAttribute("d", f.zero);
  }
  threadEl.setAttribute("d", wormThread(D.WORM.x[0] + 0.6, D.WORM.x[1] - 0.6, D.WORM.y, D.WORM.z, D.WORM.r, D.WORM.pitch, A.worm));
  for (let level = 0; level < 4; level++) {
    const i = BY_LEVEL[level];
    const parts = armParts(level, A.arms[i]);
    armBack[level].innerHTML = parts.back;
    armFront[level].innerHTML = parts.front;
    const x = D.ORBIT[i] * Math.cos(A.arms[i]), y = D.ORBIT[i] * Math.sin(A.arms[i]);
    const move = k.translateAlong(PROJ, [x, y, 0]);
    pucks[i].setAttribute("transform", move);
    falls[i].setAttribute("transform", move);
    const slot = x * VIEW[0] + y * VIEW[1] > 0 ? slots[level].front : slots[level].back;
    if (pucks[i].parentNode !== slot) slot.appendChild(pucks[i]);
  }
  return A;
}

function say(A, err) {
  const phase = mod(n, PERIOD);
  const togo = PERIOD - phase;
  const deg = (err * 180) / Math.PI;
  const text = deg < 0.05 ? "aligned · the mark is whole · drive " + (Math.round(n / PERIOD) * PERIOD % 60) + " turns" :
    "drive " + phase.toFixed(2) + " · aligns in " + togo.toFixed(2) + " turns";
  if (readout.textContent !== text) readout.textContent = text;
  const aligned = deg < 0.05;
  if (aligned !== alignedSaid) {
    alignedSaid = aligned;
    stage.setAttribute("aria-valuetext", aligned ? "Aligned: the four planets are home and the mark is whole" : "Drive " + phase.toFixed(1) + " of 6 turns; aligns in " + togo.toFixed(1));
    if (said && document.activeElement === stage) said.textContent = aligned ? "aligned" : "";
  }
}

function light(A, err, dt, calm) {
  const deg = (err * 180) / Math.PI;
  let moving = settle(env.lamps, 1, dt, 0.45, calm);
  moving = settle(env.align, Math.exp(-Math.pow(deg / 16, 2)), dt, 0.22, calm) || moving;
  moving = settle(env.flow, Math.exp(-Math.pow(deg / 2.2, 2)), dt, 0.55, calm) || moving;
  if (deg < 0.4 && !bloomed) { bloomed = true; bloomAt = clock; }
  if (deg > 6) bloomed = false;
  const bloom = calm ? 0 : burst(clock - bloomAt, 0.3, 1.5);
  if (bloom > 1e-3) moving = true;
  stage.style.setProperty("--or-align", (env.align.x * (0.4 + 0.6 * env.flow.x)).toFixed(3));
  stage.style.setProperty("--or-lamps", env.lamps.x.toFixed(3));
  if (!layer) return moving;
  const puck = new Float32Array(16), arm = new Float32Array(16), trail = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    const a = A.arms[i], level = D.LEVEL[i];
    puck.set([D.ORBIT[i] * Math.cos(a), D.ORBIT[i] * Math.sin(a), D.GLASS_TOP - D.PUCK_Z[i], env.lamps.x], i * 4);
    arm.set([Math.cos(a), Math.sin(a), REACH[level], level], i * 4);
    trail.set([a, TURNS[i] / PERIOD, D.ORBIT[i], level], i * 4);
  }
  const theme = host.getAttribute("data-theme") === "light" ? 1 : 0;
  layer.draw({ uPuck: puck, uArm: arm, uTrail: trail, uHome: HOMES, uGlow: [env.lamps.x, env.align.x, env.flow.x, bloom], uLight: theme }, calm ? 0.8 : clock);
  return moving;
}

// ---- the idle tour: travel to the next alignment with a calm arrival, rest there, go on ----
const TRAVEL = 21; // seconds per full period of travel
const REST = 3.4;
let tour = null; // { from, to, start, dur, rest }
let glide = null; // a key's jump to an alignment: { from, to, start, dur }
const ease = (u) => u - Math.sin(TAU * u) / TAU;
function nextHome(x) { return (Math.floor(x / PERIOD + 1e-6) + 1) * PERIOD; }
function startTour() {
  const from = drive.x;
  const home = Math.round(from / PERIOD) * PERIOD;
  // resting on an alignment already: hold it first, then go on round
  if (Math.abs(from - home) < 1e-3) { tour = { from: home, to: home, start: clock, dur: 1e-3, rest: REST }; return; }
  const to = nextHome(from);
  tour = { from, to, start: clock, dur: Math.max(4, ((to - from) / PERIOD) * TRAVEL), rest: REST };
}
function tourAt(t) {
  const u = (t - tour.start) / tour.dur;
  if (u >= 1) {
    if (t - tour.start - tour.dur > tour.rest) { const to = tour.to; tour = { from: to, to: to + PERIOD, start: t, dur: TRAVEL, rest: REST }; return to; }
    return tour.to;
  }
  return tour.from + (tour.to - tour.from) * ease(Math.max(0, u));
}

let frame = 0, last = 0, visible = false, idle = 0;
const touring = () => !!tour;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  clock += dt;
  let moving = false;
  if (tour && !calm) { target = tourAt(clock); drive.x = target; drive.v = 0; moving = true; }
  else if (glide && !calm) {
    const u = Math.min(1, (clock - glide.start) / glide.dur);
    drive.x = glide.from + (glide.to - glide.from) * ease(u); drive.v = 0; moving = true;
    if (u >= 1) glide = null;
  }
  else moving = settle(drive, target, dt, follow, calm);
  n = drive.x;
  const A = (drawn === n) ? anglesAt(n) : place();
  drawn = n;
  const err = errorOf(A);
  say(A, err);
  moving = light(A, err, dt, calm) || moving;
  frame = visible && (moving || tour) ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
function steer(next, glideTo) {
  tour = null;
  glide = glideTo && !still.matches ? { from: drive.x, to: next, start: clock, dur: 1.4 + 0.75 * Math.abs(next - drive.x) } : null;
  target = next;
  follow = Math.min(1.1, 0.3 + 0.12 * Math.abs(next - drive.x));
  clearTimeout(idle);
  const resume = () => {
    // the tour takes over only from rest, so it never yanks a drive that is still arriving
    if (glide || Math.abs(target - drive.x) > 1e-3 || Math.abs(drive.v) > 1e-3) { idle = setTimeout(resume, 500); return; }
    if (!still.matches) { startTour(); run(); }
  };
  idle = setTimeout(resume, 3600);
  run();
}
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
let anchor = null;
const svgBox = () => back.getBoundingClientRect();
stage.addEventListener("pointermove", (event) => {
  const box = svgBox();
  const share = (event.clientX - box.left) / box.width;
  if (anchor === null) anchor = { share, n: drive.x };
  steer(anchor.n + (share - anchor.share) * PERIOD);
});
stage.addEventListener("pointerdown", (event) => {
  const box = svgBox();
  anchor = { share: (event.clientX - box.left) / box.width, n: drive.x };
});
stage.addEventListener("pointerleave", () => { anchor = null; });
stage.addEventListener("keydown", (event) => {
  const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
  const from = tour || glide ? drive.x : target;
  if (step) { event.preventDefault(); steer(Math.round((from + step * (event.shiftKey ? 1 : 1 / 12)) * 12) / 12); return; }
  if (event.key === " " || event.key === "End" || event.key === "PageDown" || event.key === "Enter") { event.preventDefault(); steer(nextHome(from), true); return; }
  if (event.key === "Home" || event.key === "PageUp") { event.preventDefault(); steer((Math.ceil(from / PERIOD - 1e-6) - 1) * PERIOD, true); }
});
stage.addEventListener("focus", () => { if (said) said.textContent = alignedSaid ? "aligned" : ""; });
if (!still.matches) setTimeout(() => { if (!anchor && target === drive.x) { startTour(); run(); } }, 1400);
place();
`;

const LIVE = `
const D = ${JSON.stringify(DATA)};
const k = { iso, extrude, cylinder, ring, onTop, lineOnTop, solidSvg, lineSvg, dotsSvg, sideArc, radialTicks, depthOf, towardViewer, cameraOf, pathOf, circleRing, translateAlong };
const PROJ = D.P, ARMZ = D.ARMZ, HUBR = D.HUBR, ARMW = D.ARMW, ARMT = D.ARMT, TAILR = D.TAILR, REACH = D.REACH, VIEW = D.VIEW, PHASE = D.PHASE, DIAL = D.DIAL, CWHEEL = D.CWHEEL;
const TAU = D.TAU, PERIOD = D.PERIOD, TURNS = D.TURNS, HOME = D.HOME, WORM_TEETH = D.WORM_TEETH;
const gearRing = ${gearRing.toString()};
const prismSvg = ${prismSvg.toString()};
const gearSvg = ${gearSvg.toString()};
const armParts = ${armParts.toString()};
const wormThread = ${wormThread.toString()};
const counterWheelSvg = ${counterWheelSvg.toString()};
const counterFace = ${counterFace.toString()};
const gearHoles = ${gearHoles.toString()};
const anglesAt = ${anglesAt.toString()};
const FRAGMENT = ${JSON.stringify(FRAGMENT)};
${LIVE_SOURCE}
`;

const plate = () => k.plateHtml({
  fig: "Fig 4",
  title: "Mereka, finding each other",
  hint: "Drag to turn · Space: align",
  readout: "drive " + (DRIVE0 % PERIOD).toFixed(2) + " · aligns in " + (PERIOD - (DRIVE0 % PERIOD)).toFixed(2) + " turns",
  keys: [
    { mark: "lit", label: "The detached dot: the slowest planet, one turn in three" },
    { mark: "raised", label: "Four planets on nested arbors, each on its own level" },
    { mark: "edge", label: "The joined body, engraved on the glass from the brand outline" },
  ],
  caption:
    "The four dots of the Mereka logomark as planets on a geared orrery. A motor and worm turn the layshaft; its pinions drive the four arbors through 16/32, 20/30, 20/24 and 12/36, so the planets make 3, 4, 5 and 2 turns while the drive makes 6. They lap one another on four levels and meet only once in every six turns, when the counter dial's mark reaches its index. Each planet is a lamp under the glass: at that moment its disc of light lands exactly on its place in the engraved mark, and the light runs on through the body that joins them.",
  body: STAGE,
});

writePages({ dir: HERE, slug: "orrery", title: "Mereka Orrery", body: plate, script: kitScript() + glScript() + LIVE, css: CSS });
