// Fig 2 · Pin wall: a tabletop shape display. 616 square pins in a perforated bed,
// each on its own hidden actuator, raise the Mereka logomark in relief.
// Build: node brands/mereka/kinetic/pin-wall/build.mjs   (add --audit to prove the cable and hardware)
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { k, kitScript, glScript, kitPath, logo, FREE, inside, writePages } from "../shared.mjs";

const G = await import(kitPath("kit/lathe.mjs"));
const TB = await import(kitPath("kit/tube.mjs"));
const A = await import(kitPath("kit/audit.mjs"));
const { glCamera } = await import(kitPath("kit/gl.mjs"));

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDTH = 600;
const HEIGHT = 450;
const AZIMUTH = 72;
const ELEVATION = 50;

// ---- The machine, in millimetres -------------------------------------------
const COLS = 28;
const ROWS = 22;
const N = COLS * ROWS;
const PITCH = 12.7; // half-inch grid
const PIN = 8.4; // square pin
const HW = PIN / 2;
const CLEAR = 0.6; // radial clearance in the bore
const CHAMF = 0.9; // 45° lead-in chamfer at the top of every hole
const BORE = HW + CLEAR;
const OPEN = BORE + CHAMF; // half-width of a hole's opening on the bed face
const TRAVEL = 36; // actuator stroke
const REST = 1.0; // a pin at the bottom of its stroke stands this proud of the bed
const FIELD_W = COLS * PITCH;
const FIELD_D = ROWS * PITCH;
const X0 = -FIELD_W / 2;
const Y0 = -FIELD_D / 2;
const SPEED = 650; // mm/s, the actuator's top speed
const TAU = 0.07; // s, actuator follow time constant

// Frame (bezel) on the bed, bed plate, chassis, feet, table.
const FH = 5;
const IX = -X0 + 3.2;
const IY = -Y0 + 3.2;
const BAR = 13;
const OX = IX + BAR;
const OY = IY + BAR;
const BED_T = 14;
const BED = { x: -OX - 11, y: -OY - 10, w: 2 * (OX + 11), d: 2 * (OY + 10), r: 8 };
const CHASSIS_H = 60;
const CHASSIS = k.insetPlan(BED, 9);
const CH_TOP = -BED_T;
const CH_BOT = CH_TOP - CHASSIS_H;
const FOOT_H = 16;
const TABLE = CH_BOT - FOOT_H;

// Side control box on the table, cabled to the chassis.
const CB = { x: 236, y: -196, w: 64, d: 130, r: 5 };
const CB_FOOT = 3;
const CB_Z = TABLE + CB_FOOT;
const CB_H = 42;
const CB_TOP = CB_Z + CB_H;

// ---- The logomark and every pin's target -----------------------------------
const MARK = logo({ scale: 0.75, center: [0, 0], gap: 1.2 });
const W_EDGE = 0.45 * PITCH; // pins within this of the outline take a partial height
const smooth01 = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
function bodyDistance(p) {
  let best = Infinity;
  const ring = MARK.body;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
  }
  return inside(p, ring) ? -best : best;
}
const FREE_AT = MARK.dots[FREE];
const PINS = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const cx = X0 + (c + 0.5) * PITCH;
    const cy = Y0 + (r + 0.5) * PITCH;
    const sdBody = bodyDistance([cx, cy]);
    const sdDot = Math.hypot(cx - FREE_AT[0], cy - FREE_AT[1]) - MARK.dotR;
    const fb = smooth01(W_EDGE, -W_EDGE, sdBody);
    const fd = smooth01(W_EDGE, -W_EDGE, sdDot);
    const cluster = fd > 0.01 && sdDot < sdBody ? 1 : 0;
    PINS.push({ c, r, cx, cy, f: Math.max(fb, fd), cluster, sd: Math.min(sdBody, sdDot) });
  }
}
// Re-forming dot by dot: every raised pin belongs to the nearest of the three joined
// dots (or to the detached dot), and rises when a circle growing from that dot reaches it.
const DOT_ORDER = [0, 1, 2, FREE];
const reach = [0, 0, 0, 0];
for (const pin of PINS) {
  if (pin.f <= 0) continue;
  const dots = pin.cluster ? [FREE] : [0, 1, 2];
  let best = 0, bestD = Infinity;
  for (const d of dots) {
    const dist = Math.hypot(pin.cx - MARK.dots[d][0], pin.cy - MARK.dots[d][1]);
    if (dist < bestD) { bestD = dist; best = d; }
  }
  pin.region = DOT_ORDER.indexOf(best);
  pin.dist = bestD;
  reach[pin.region] = Math.max(reach[pin.region], bestD);
}
const xs = PINS.map((p) => p.cx), ys = PINS.map((p) => p.cy);
const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
let maxC = 0;
for (const pin of PINS) maxC = Math.max(maxC, Math.hypot(pin.cx, pin.cy));
for (const pin of PINS) {
  pin.wave = ((pin.cx - minX) / (maxX - minX)) * 0.86 + ((pin.cy - minY) / (maxY - minY)) * 0.14;
  pin.rd = pin.f > 0 ? pin.dist / reach[pin.region] : 0;
  pin.rc = Math.hypot(pin.cx, pin.cy) / maxC;
  pin.region = pin.region ?? 0;
}

// The sequence, one pure function of the clock for every pin: g is the share of the
// pin's own target, ridge a few millimetres of travelling wave on the flat field.
const LOOP = 17.6;
const RIDGE = 9;
function gateOf(t, w, cl, reg, rd, rc) {
  const ss = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  if (t < 1.0) return 0;
  if (t < 7.4) {
    if (cl) return ss(0, 1, (t - 3.6 - 0.45 * rd) / 0.55);
    return ss(0, 0.1, -0.12 + (1.24 * (t - 1.0)) / 2.6 - w);
  }
  if (t < 8.9) return 1 - ss(0, 1, (t - 7.4 - 0.55 * (1 - w)) / 0.65);
  if (t < 15.8) return ss(0, 1, (t - 8.9 - 1.1 * reg - 0.7 * rd) / 0.4);
  return 1 - ss(0, 1, (t - 15.8 - 0.6 * rc) / 0.6);
}
function ridgeOf(t, w) {
  if (t < 1.0 || t > 3.6) return 0;
  const front = -0.12 + (1.24 * (t - 1.0)) / 2.6;
  return Math.exp(-(((front - w) / 0.045) ** 2));
}
// Stops the arrow keys step through: [clock, name].
const STOPS = [
  [0.6, "flat"],
  [2.3, "wave"],
  [5.4, "whole mark"],
  [8.8, "relaxed"],
  [10.0, "dot 1"],
  [11.1, "dot 2"],
  [12.2, "dot 3"],
  [13.6, "dot 4 · whole"],
];
const PHASES = [
  [0, "flat"],
  [1.0, "wave"],
  [3.6, "last dot"],
  [4.8, "whole mark"],
  [7.4, "relaxing"],
  [8.9, "re-forming"],
  [13.4, "whole mark"],
  [15.8, "relaxing"],
  [17.0, "flat"],
];
const START = 5.4;
const targetOf = (pin, t) => {
  const g = gateOf(t, pin.wave, pin.cluster, pin.region, pin.rd, pin.rc);
  return Math.min(TRAVEL, TRAVEL * pin.f * g + RIDGE * ridgeOf(t, pin.wave) * (1 - g));
};

// ---- Camera ---------------------------------------------------------------
const markTop = MARK.body.map(([x, y]) => [x, y, REST + TRAVEL]);
const P = k.fitProjection(
  [...k.boxCorners(BED, -BED_T, FH), ...markTop, ...k.boxCorners(CHASSIS, TABLE, CH_TOP), ...k.boxCorners(CB, TABLE, CB_TOP + 10)],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: AZIMUTH, elevation: ELEVATION },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dt = (pts, style) => k.dotsSvg(pts, style);
const f1 = (v) => (Math.round(v * 100) / 100).toString();
const path2 = (pts, closed) => "M" + pts.map(([x, y]) => f1(x) + " " + f1(y)).join("L") + (closed ? "Z" : "");
const path3 = (pts, closed) => path2(pts.map(at), closed);
const cam = k.cameraOf(P);
const KZ = cam.k * cam.cosE; // screen px per mm of height
const KS = G.scaleOf(P);
const depth = ([x, y, z = 0]) => k.depthOf([x, y, z], P);
const byDepth = (list, key = (v) => v) => [...list].sort((a, b) => depth(key(a)) - depth(key(b)));

// ---- Pins -------------------------------------------------------------------
// The two visible faces of a pin (+x and +y) run from its top down to where the near
// lead-in chamfer of its own hole hides them: the face's bottom edge then lands on
// screen exactly on that chamfer's inner edge, so no pin ever paints over a nearer cell.
const ZB_X = -CHAMF - (CLEAR * cam.sinE) / (cam.cosA * cam.cosE);
const ZB_Y = -CHAMF - (CLEAR * cam.sinE) / (cam.sinA * cam.cosE);
const shadeOf = ([nx, ny]) => Math.min(3, Math.max(0, Math.floor(((nx * -cam.sinA + ny * cam.cosA + 1) / 2) * 4)));
const SHADE_X = shadeOf([1, 0]);
const SHADE_Y = shadeOf([0, 1]);
const BEVEL = 0.55;
// Screen corners of each pin at z = 0: A (+x,-y), B (+x,+y), C (-x,+y), D (-x,-y).
const CORNERS = PINS.map(({ cx, cy }) => [at([cx + HW, cy - HW, 0]), at([cx + HW, cy + HW, 0]), at([cx - HW, cy + HW, 0]), at([cx - HW, cy - HW, 0])].flat());
// Rebuilds a pin's sides and outline for a top at height zt (mm). Inlined into the page.
function pinSides(q, zt, KZ, ZB_X, ZB_Y) {
  const r = (v) => Math.round(v * 100) / 100;
  const t = zt * KZ, bx = ZB_X * KZ, by = ZB_Y * KZ;
  const ax = r(q[0]), ay = q[1], bxx = r(q[2]), byy = q[3], cxx = r(q[4]), cy = q[5], dxx = r(q[6]), dy = q[7];
  const aT = r(ay - t), bT = r(byy - t), cT = r(cy - t), dT = r(dy - t);
  const aB = r(ay - bx), bBx = r(byy - bx), bBy = r(byy - by), cB = r(cy - by);
  return [
    `M${ax} ${aT}L${bxx} ${bT}L${bxx} ${bBx}L${ax} ${aB}Z`,
    `M${bxx} ${bT}L${cxx} ${cT}L${cxx} ${cB}L${bxx} ${bBy}Z`,
    `M${cxx} ${cT}L${dxx} ${dT}L${ax} ${aT}L${ax} ${aB}L${bxx} ${bBx}L${bxx} ${bBy}L${cxx} ${cB}Z`,
    `translate(0 ${r(-t)})`,
  ];
}
function pinTop(i) {
  const { cx, cy } = PINS[i];
  const q = (x, y) => at([cx + x, cy + y, 0]);
  const top = path2([q(HW, -HW), q(HW, HW), q(-HW, HW), q(-HW, -HW)], true);
  const crease = path2([q(HW, -HW), q(HW, HW), q(-HW, HW)]);
  const bevel = path2([q(HW, -HW), q(HW - BEVEL, -HW + BEVEL), q(HW - BEVEL, HW - BEVEL), q(-HW + BEVEL, HW - BEVEL), q(-HW, HW)]);
  return `<path class="iso-top" d="${top}"/><path class="iso-line iso-crease" data-tone="lo" d="${crease + bevel}"/>`;
}
// Every pin is the same shape on screen: its base centre plus constant offsets.
const O0 = at([0, 0, 0]);
const rel = (p) => [p[0] - O0[0], p[1] - O0[1]];
const SHAPE = [[HW, -HW], [HW, HW], [-HW, HW], [-HW, -HW], [HW - BEVEL, -HW + BEVEL], [HW - BEVEL, HW - BEVEL], [-HW + BEVEL, HW - BEVEL]].flatMap(([x, y]) => rel(at([x, y, 0])));
const BASES = PINS.map(({ cx, cy }) => at([cx, cy, 0]));
const PIN_ORDER = byDepth(PINS.map((_, i) => i), (i) => [PINS[i].cx, PINS[i].cy]);
const H0 = PINS.map((pin) => targetOf(pin, START));
function pinsSvg() {
  return PIN_ORDER.map((i) => {
    const [fx, fy, out, move] = pinSides(CORNERS[i], REST + H0[i], KZ, ZB_X, ZB_Y);
    return `<g class="iso-solid pw-pin" data-pin="${i}"${PINS[i].cluster ? ' data-lit=""' : ""}><path class="iso-shade" data-shade="${SHADE_X}" d="${fx}"/><path class="iso-shade" data-shade="${SHADE_Y}" d="${fy}"/><g transform="${move}">${pinTop(i)}</g><path class="iso-line iso-edge" data-tone="${H0[i] > 0.4 * TRAVEL ? "hi" : "mid"}" d="${out}"/></g>`;
  }).join("");
}

// ---- The perforated bed ----------------------------------------------------
// Every hole: a 45° lead-in chamfer round a square bore. Far chamfer walls face the
// viewer; of the near ones only the +x wall shows. The bore is a dark cavity.
function holes() {
  const far = [[], []], near = [[], []], bores = [], rims = [], glow = [];
  for (const pin of PINS) {
    const { cx, cy } = pin;
    const o = (x, y) => [cx + x * OPEN, cy + y * OPEN, 0];
    const b = (x, y) => [cx + x * BORE, cy + y * BORE, -CHAMF];
    far[0].push(path3([o(-1, -1), o(-1, 1), b(-1, 1), b(-1, -1)], true));
    far[1].push(path3([o(-1, -1), o(1, -1), b(1, -1), b(-1, -1)], true));
    near[0].push(path3([o(1, -1), o(1, 1), b(1, 1), b(1, -1)], true));
    near[1].push(path3([o(-1, 1), o(1, 1), b(1, 1), b(-1, 1)], true));
    const bore = path3([b(-1, -1), b(1, -1), b(1, 1), b(-1, 1)], true);
    bores.push(bore);
    if (pin.cluster) glow.push(bore);
    rims.push(path3([o(-1, -1), o(1, -1), o(1, 1), o(-1, 1)], true));
  }
  const fillOf = (shade, list) => `<path class="iso-shade" data-shade="${shade}" d="${list.join("")}"/>`;
  return [
    `<g class="pw-holes">`,
    fillOf(shadeOf([1, 0]) === 0 ? 0 : 0, far[0]),
    fillOf(2, far[1]),
    fillOf(3, near[0]),
    fillOf(1, near[1]),
    `<path class="pw-bore" d="${bores.join("")}"/>`,
    `<path class="pw-fallback" d="${glow.join("")}"/>`,
    L(rims.join(""), { tone: "lo" }),
    `</g>`,
  ].join("");
}

// ---- Hardware (recorded for the audit) ------------------------------------
const R = A.recorder(P);
const record = R.solid;
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "rig", ...rest });
}
const slab = (name, plan, z, h, style, { steps = 3, bevel = 0, inner = "", bias = 0, ground = false } = {}) =>
  put(name, [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], S(k.slabOf(plan, z, h, P, steps, bevel), { ...style, inner }), [record(A.slab(plan, z, h, { name, ...(ground ? { ground: true } : {}) }, steps))], { bias });
const cyl = (name, x, y, r, z, h, style, { steps = 28, bevel = 0, inner = "", bias = 0 } = {}) =>
  put(name, [x, y, z + h / 2], S(k.cylinder(x, y, r, z, h, P, steps, bevel), { ...style, inner }), [record(A.cylinder(x, y, r, z, h, { name }))], { bias });

// Chassis feet: levelling feet with a rubber pad, a hex body and a lock nut.
const FEET = byDepth(k.corners(CHASSIS, 14));
FEET.forEach(([x, y], n) => {
  cyl(`stand.pad${n}`, x, y, 10.5, TABLE, 3.2, { tone: "lo" }, { steps: 40, bevel: 0.4 });
  cyl(`foot.body${n}`, x, y, 8, TABLE + 3.2, 5, { tone: "mid" }, { steps: 6, bevel: 0.4 });
  cyl(`foot.stem${n}`, x, y, 3.4, TABLE + 8.2, FOOT_H - 11.2, { tone: "mid", crease: "none", inner: L(k.sideArc(x, y, 3.4, TABLE + 10, P, 16), { tone: "faint" }) }, { steps: 20 });
  cyl(`foot.nut${n}`, x, y, 6, CH_BOT - 3, 3, { tone: "mid" }, { steps: 6, bevel: 0.3 });
});

// The chassis: vents, panel seams, screws, a handle on the +x side.
const FRONT_Y = CHASSIS.y + CHASSIS.d;
const RIGHT_X = CHASSIS.x + CHASSIS.w;
function frontFace() {
  const out = [];
  // Two removable panels: their seams run the full height of the face.
  for (const x of [-64, 64]) out.push(k.segment([x, FRONT_Y, CH_BOT], [x, FRONT_Y, CH_TOP], P));
  const seams = L(out.join(""), { tone: "faint" });
  // Vent slots on the two outer panels: closed outlines, no ends.
  const slots = [];
  const slot = (x0, x1, z0, z1, face) => {
    const r = (z1 - z0) / 2;
    const pts = [];
    for (let s = 0; s <= 8; s++) { const a = Math.PI / 2 + (s / 8) * Math.PI; pts.push([x0 + r + Math.cos(a) * r, (z0 + z1) / 2 + Math.sin(a) * r]); }
    for (let s = 0; s <= 8; s++) { const a = -Math.PI / 2 + (s / 8) * Math.PI; pts.push([x1 - r + Math.cos(a) * r, (z0 + z1) / 2 + Math.sin(a) * r]); }
    return path3(pts.map(([u, z]) => (face === "y" ? [u, FRONT_Y, z] : [RIGHT_X, u, z])), true);
  };
  for (let n = 0; n < 7; n++) {
    const z = CH_BOT + 14 + n * 5.2;
    slots.push(slot(80, 128, z, z + 2.2, "y"));
    slots.push(slot(-170, -80, z, z + 2.2, "y"));
  }
  for (let n = 0; n < 7; n++) {
    const z = CH_BOT + 14 + n * 5.2;
    slots.push(slot(-130, -40, z, z + 2.2, "x"));
  }
  const screws = [];
  for (const x of [-180, -74, -54, 54, 74, 180]) for (const z of [CH_BOT + 6, CH_TOP - 6]) screws.push(at([x, FRONT_Y, z]));
  for (const y of [-140, -26, 26, 140]) for (const z of [CH_BOT + 6, CH_TOP - 6]) screws.push(at([RIGHT_X, y, z]));
  return seams + `<path class="iso-line pw-slot" data-tone="lo" d="${slots.join("")}"/>` + Dt(screws, { size: 0.55, tone: "mid" }) +
    L(k.segment([RIGHT_X, -20, CH_BOT], [RIGHT_X, -20, CH_TOP], P) + k.segment([RIGHT_X, 20, CH_BOT], [RIGHT_X, 20, CH_TOP], P), { tone: "faint" });
}
slab("chassis", CHASSIS, CH_BOT, CHASSIS_H, { tone: "mid" }, { steps: 6, bevel: 0.8, inner: L(k.sideSeam(CHASSIS, CH_BOT + 3, P, 6), { tone: "faint" }) + frontFace() });

// Label plate on the front panel: the one engraved word.
const LABEL = { x: -44, w: 88, z0: CH_BOT + 16, z1: CH_BOT + 40 };
{
  const plan = { x: LABEL.x, y: FRONT_Y, w: LABEL.w, d: 1.2, r: 0.4 };
  const fx = (x, z) => at([x, FRONT_Y + 1.2, z]);
  const rules = [[LABEL.z0 + 7, 40], [LABEL.z0 + 4, 26]].map(([z, w]) => path2([fx(LABEL.x + 8, z), fx(LABEL.x + 8 + w, z)])).join("");
  const text = k.faceTextSvg(k.sideMatrix([LABEL.x + 8, FRONT_Y + 1.2], LABEL.z1 - 6.5, P, "left"), "MEREKA", { size: 7.2, tone: "hi" });
  const inner = L(path2([fx(LABEL.x + 2, LABEL.z0 + 2), fx(LABEL.x + LABEL.w - 2, LABEL.z0 + 2), fx(LABEL.x + LABEL.w - 2, LABEL.z1 - 2), fx(LABEL.x + 2, LABEL.z1 - 2)], true), { tone: "faint" });
  const screws = Dt([fx(LABEL.x + LABEL.w - 6, LABEL.z0 + 6), fx(LABEL.x + LABEL.w - 6, LABEL.z1 - 6)], { size: 0.6, tone: "mid" });
  put("label", [0, FRONT_Y + 0.6, (LABEL.z0 + LABEL.z1) / 2], S(k.slabOf(plan, LABEL.z0, LABEL.z1 - LABEL.z0, P, 2, 0), { tone: "mid" }) + inner + text + L(rules, { tone: "lo", free: true }) + screws,
    [record(A.slab(plan, LABEL.z0, LABEL.z1 - LABEL.z0, { name: "label" }, 2))], { bias: 0.2 });
}

// Power entry on the right panel: a mounting plate, an IEC inlet in its shroud, a
// rocker switch in its bezel and the fuse drawer under it.
{
  const PE = { x: 136, w: 40, z0: CH_BOT + 12, z1: CH_BOT + 46 };
  const fy = FRONT_Y + 1.2;
  const face = (x, z, dy = 0) => at([x, fy + dy, z]);
  const plate = { x: PE.x, y: FRONT_Y, w: PE.w, d: 1.2, r: 0.6 };
  const screws = Dt([face(PE.x + 3, PE.z0 + 3), face(PE.x + PE.w - 3, PE.z1 - 3)], { size: 0.5, tone: "mid" });
  put("pe.plate", [PE.x + PE.w / 2, FRONT_Y + 0.6, (PE.z0 + PE.z1) / 2], S(k.slabOf(plate, PE.z0, PE.z1 - PE.z0, P, 2, 0), { tone: "mid" }) + screws,
    [record(A.slab(plate, PE.z0, PE.z1 - PE.z0, { name: "pe.plate" }, 2))], { bias: 0.1 });
  // inlet: a shroud standing off the plate, its socket a closed outline with three pin dots
  const shroud = { x: PE.x + 21, y: fy, w: 15, d: 2.6, r: 1 };
  const sz0 = PE.z0 + 13, sz1 = PE.z0 + 25;
  const sy = fy + 2.6;
  const socket = path2([[shroud.x + 2.5, sz0 + 2], [shroud.x + 12.5, sz0 + 2], [shroud.x + 12.5, sz1 - 4], [shroud.x + 10.5, sz1 - 2], [shroud.x + 4.5, sz1 - 2], [shroud.x + 2.5, sz1 - 4]].map(([x, z]) => at([x, sy, z])), true);
  const pins = Dt([[shroud.x + 5, sz0 + 6], [shroud.x + 10, sz0 + 6], [shroud.x + 7.5, sz1 - 5]].map(([x, z]) => at([x, sy, z])), { size: 0.7, tone: "hi" });
  put("pe.inlet", [shroud.x + shroud.w / 2, fy + 1.3, (sz0 + sz1) / 2], S(k.slabOf(shroud, sz0, sz1 - sz0, P, 2, 0.3), { tone: "hi", crease: "lo" }) + L(socket, { tone: "lo" }) + pins,
    [record(A.slab(shroud, sz0, sz1 - sz0, { name: "pe.inlet" }, 2))], { bias: 0.2 });
  // rocker: a bezel and the rocker in it, tipped to "on"
  const bezel = { x: PE.x + 4, y: fy, w: 12, d: 1.4, r: 0.6 };
  put("pe.bezel", [bezel.x + 6, fy + 0.7, PE.z0 + 19], S(k.slabOf(bezel, PE.z0 + 12, 14, P, 2, 0.3), { tone: "mid" }), [record(A.slab(bezel, PE.z0 + 12, 14, { name: "pe.bezel" }, 2))], { bias: 0.2 });
  const rocker = { x: PE.x + 5.6, y: fy + 1.4, w: 8.8, d: 1.6, r: 0.5 };
  put("pe.rocker", [rocker.x + 4.4, rocker.y + 0.8, PE.z0 + 19], S(k.slabOf(rocker, PE.z0 + 13.6, 10.8, P, 2, 0.3), { tone: "hi", crease: "lo", inner: L(k.segment([rocker.x, rocker.y + rocker.d, PE.z0 + 19], [rocker.x + rocker.w, rocker.y + rocker.d, PE.z0 + 19], P), { tone: "faint" }) }),
    [record(A.slab(rocker, PE.z0 + 13.6, 10.8, { name: "pe.rocker" }, 2))], { bias: 0.3 });
  const fuse = { x: shroud.x + 1.5, y: fy, w: 12, d: 1.4, r: 0.5 };
  put("pe.fuse", [fuse.x + 6, fy + 0.7, PE.z0 + 7], S(k.slabOf(fuse, PE.z0 + 4.5, 5, P, 2, 0.3), { tone: "mid" }), [record(A.slab(fuse, PE.z0 + 4.5, 5, { name: "pe.fuse" }, 2))], { bias: 0.2 });
}

// Fan guard on the +x side, over the actuator bay's exhaust: a square frame with
// four screws, three closed rings and four spokes that end on the rings.
{
  const FC = [RIGHT_X, -112, CH_BOT + 30];
  const frame = { x: RIGHT_X, y: FC[1] - 17, w: 1.4, d: 34, r: 1.2 };
  const fx = RIGHT_X + 1.4;
  const rings = [5, 10, 15].map((r) => k.sideRing([fx, FC[1], FC[2]], r, "x", P, 48)).join("");
  const spokes = [0, 1, 2, 3].map((n) => { const a = Math.PI / 4 + (n * Math.PI) / 2; return k.segment([fx, FC[1] + 5 * Math.cos(a), FC[2] + 5 * Math.sin(a)], [fx, FC[1] + 15 * Math.cos(a), FC[2] + 15 * Math.sin(a)], P); }).join("");
  const screws = Dt([[-13.5, -13.5], [13.5, -13.5], [-13.5, 13.5], [13.5, 13.5]].map(([dy, dz]) => at([fx, FC[1] + dy, FC[2] + dz])), { size: 0.5, tone: "mid" });
  put("fan.guard", [RIGHT_X + 0.7, FC[1], FC[2]], S(k.slabOf(frame, FC[2] - 17, 34, P, 2, 0.3), { tone: "mid" }) + L(rings, { tone: "lo" }) + L(spokes, { tone: "lo" }) + screws + Dt([at([fx, FC[1], FC[2]])], { size: 1.6, tone: "lo" }),
    [record(A.slab(frame, FC[2] - 17, 34, { name: "fan.guard" }, 2))], { bias: 0.1 });
}

// Carry handle on the +x side: two standoffs and a bar.
const HANDLE_Z = CH_BOT + 34;
for (const y of [60, 130]) slab(`handle.post${y}`, { x: RIGHT_X, y: y - 4, w: 9, d: 8, r: 1 }, HANDLE_Z - 4, 8, { tone: "mid" }, { steps: 2, bias: 0.1 });
slab("handle.bar", { x: RIGHT_X + 9, y: 54, w: 5, d: 82, r: 2 }, HANDLE_Z - 3.5, 7, { tone: "hi", crease: "lo" }, { steps: 3, bevel: 0.4, bias: 0.2 });

// Control box: rubber feet, body with a lid seam, LED row, selector knob, toggle, stop.
const CB_FEET = k.corners(CB, 9);
CB_FEET.forEach(([x, y], n) => cyl(`stand.cbfoot${n}`, x, y, 4.5, TABLE, CB_FOOT, { tone: "lo" }, { steps: 20 }));
const CB_FRONT = CB.y + CB.d;
const CB_LID = CB_TOP - 6;
{
  const inner = L(k.sideSeam(CB, CB_LID, P, 4), { tone: "faint" });
  const lid = L(k.planOutline(k.insetPlan(CB, 5), CB_TOP, P, 4), { tone: "faint" }) +
    L(k.corners(CB, 9).map(([x, y]) => k.ring(x, y, 2, CB_TOP, P, 16)).join(""), { tone: "lo" }) +
    Dt(k.corners(CB, 9).map(([x, y]) => at([x, y, CB_TOP])), { size: 0.55, tone: "mid" });
  const id = slab("cb.body", CB, CB_Z, CB_H, { tone: "mid" }, { steps: 4, bevel: 0.6, inner });
  R.items[R.items.length - 1].svg += lid;
}
const LED_X = CB.x + CB.w - 14;
const LEDS = Array.from({ length: STOPS.length }, (_, n) => [LED_X, CB.y + 22 + n * 9]);
LEDS.forEach(([x, y], n) => {
  put(`cb.led${n}`, [x, y, CB_TOP + 0.8], S(k.cylinder(x, y, 2.6, CB_TOP, 1.4, P, 20, 0.3), { tone: "mid" }) +
    `<g data-led="${n}">${Dt([at([x, y, CB_TOP + 1.4])], { size: 1.1, tone: "faint" })}</g>`, [record(A.cylinder(x, y, 2.6, CB_TOP, 1.4, { name: `cb.led${n}` }))], { bias: 0.1 });
});
// A ruler strip beside the LEDs reads which stop each one stands for.
{
  const strip = { x: LED_X + 5, y: CB.y + 16, w: 4, d: (STOPS.length - 1) * 9 + 12, r: 0.6 };
  const t = k.topTicks(strip.y + 6, strip.y + 6 + (STOPS.length - 1) * 9 + 0.01, 9, 4, strip.x, CB_TOP + 0.4, [1.6, 2.8], P, "y");
  put("cb.strip", [strip.x + 2, strip.y + strip.d / 2, CB_TOP + 0.2], S(k.slabOf(strip, CB_TOP, 0.4, P, 2), { tone: "lo", crease: "none" }) + L(t.minor, { tone: "lo" }) + L(t.major, { tone: "mid" }),
    [record(A.slab(strip, CB_TOP, 0.4, { name: "cb.strip" }, 2))], { bias: 0.1 });
}
// The selector knob turns to the stop the sequence is at.
const KNOB = [CB.x + 24, CB.y + 40];
const KNOB_R = 10;
const KNOB_H = 8;
put("cb.knob", [KNOB[0], KNOB[1], CB_TOP + 4],
  S(k.cylinder(KNOB[0], KNOB[1], 15, CB_TOP, 1.2, P, 56, 0.3), { tone: "mid" }) +
  (() => { const t = k.radialTicks(KNOB[0], KNOB[1], 14.4, STOPS.length * 2, 2, CB_TOP + 1.2, [1.2, 2.4], P); return L(t.minor, { tone: "lo" }) + L(t.major, { tone: "mid" }); })() +
  S(k.cylinder(KNOB[0], KNOB[1], KNOB_R, CB_TOP + 1.2, KNOB_H, P, 56, 0.5), { tone: "hi", crease: "lo", inner: L(k.knurl(KNOB[0], KNOB[1], KNOB_R, CB_TOP + 2.4, CB_TOP + 1.2 + KNOB_H - 1.4, 48, P, 0.3), { tone: "lo" }) }) +
  L(k.ring(KNOB[0], KNOB[1], KNOB_R - 2.2, CB_TOP + 1.2 + KNOB_H, P, 48), { tone: "faint" }) + "__KNOB_POINTER__",
  [record(A.cylinder(KNOB[0], KNOB[1], 15, CB_TOP, 1.2, { name: "cb.knob.dial" })), record(A.cylinder(KNOB[0], KNOB[1], KNOB_R, CB_TOP + 1.2, KNOB_H, { name: "cb.knob" }))], { bias: 0.2 });
const KNOB_TOP = CB_TOP + 1.2 + KNOB_H;
// The pointer on the knob's face, turned to a stop (rebuilt live as the stop changes).
function knobPointer(turn, knob, r, z, P) {
  const a = turn * Math.PI * 2;
  const p = (x, y) => iso([x, y, z], P).map((v) => (Math.round(v * 100) / 100).toString()).join(" ");
  return "M" + p(knob[0], knob[1]) + "L" + p(knob[0] + Math.sin(a) * r, knob[1] - Math.cos(a) * r);
}
const iso = k.iso;
const pointerSvg = (turn) => `<g data-part="knob-pointer"><path class="iso-line" data-tone="hi" data-free="end" d="${knobPointer(turn, KNOB, KNOB_R - 2.2, KNOB_TOP + 0.05, P)}"/></g>` + Dt([at([KNOB[0], KNOB[1], KNOB_TOP + 0.05])], { size: 0.7, tone: "hi" });
// Toggle switch and stop button.
const TOGGLE = [CB.x + 22, CB.y + 88];
// A three-digit display reads the peak pin height, in its own window.
const SCREEN = { x: CB.x + 7, y: CB.y + 60, w: 32, d: 16, r: 1.6 };
const GLASS = k.insetPlan(SCREEN, 2.4);
{
  const bezel = S(k.slabOf(SCREEN, CB_TOP, 1.2, P, 3, 0.3), { tone: "mid" });
  const glass = `<path class="pw-glass" d="${k.planOutline(GLASS, CB_TOP + 1.2, P, 3)}"/>`;
  const clip = `<clipPath id="pw-screen"><path d="${k.planOutline(GLASS, CB_TOP + 1.2, P, 3)}"/></clipPath>`;
  const digits = `<g clip-path="url(#pw-screen)"><text class="pw-digits" transform="${k.topMatrix([GLASS.x + GLASS.w - 2.2, GLASS.y + GLASS.d - 2.6], CB_TOP + 1.2, P, "x")}" font-size="8.2" text-anchor="end" data-part="digits">__DIGITS__</text></g>`;
  put("cb.screen", [SCREEN.x + SCREEN.w / 2, SCREEN.y + SCREEN.d / 2, CB_TOP + 0.6], bezel + clip + glass + digits + L(k.planOutline(GLASS, CB_TOP + 1.2, P, 3), { tone: "lo" }),
    [record(A.slab(SCREEN, CB_TOP, 1.2, { name: "cb.screen" }, 3))], { bias: 0.15 });
}
cyl("cb.toggle.nut", TOGGLE[0], TOGGLE[1], 4.2, CB_TOP, 2.4, { tone: "mid" }, { steps: 6, bevel: 0.3, bias: 0.2 });
put("cb.toggle.lever", [TOGGLE[0], TOGGLE[1] + 3, CB_TOP + 7],
  S(G.solidOf([[0, 0.6], [1.2, 1.5], [9, 1.2], [9, 1.9, 1], [10.2, 1.7, 1], [11, 0.8, 1], [11.2, 0]], G.frameAlong([TOGGLE[0], TOGGLE[1], CB_TOP + 2.4], G.unit3([0, 0.42, 0.91])), P), { tone: "hi", crease: "lo" }),
  [record(A.solid(G.frameAlong([TOGGLE[0], TOGGLE[1], CB_TOP + 2.4], G.unit3([0, 0.42, 0.91])), [[0, 0.6], [1.2, 1.5], [9, 1.2], [9, 1.9, 1], [10.2, 1.7, 1], [11, 0.8, 1], [11.2, 0]], { name: "cb.toggle.lever" }))], { bias: 0.3 });
const STOP_AT = [CB.x + 24, CB.y + 108];
cyl("cb.stop.collar", STOP_AT[0], STOP_AT[1], 9.5, CB_TOP, 3, { tone: "mid" }, { steps: 40, bevel: 0.4, bias: 0.2 });
cyl("cb.stop.stem", STOP_AT[0], STOP_AT[1], 6, CB_TOP + 3, 3, { tone: "mid", crease: "none" }, { steps: 32, bias: 0.25 });
put("cb.stop.cap", [STOP_AT[0], STOP_AT[1], CB_TOP + 8.5], S(G.solidOf([[0, 10], [2.2, 10, 1], [3.4, 8.6, 1], [4.2, 5.6, 1], [4.5, 0]], G.frameAlong([STOP_AT[0], STOP_AT[1], CB_TOP + 6], [0, 0, 1]), P), { tone: "hi", crease: "lo" }),
  [record(A.solid(G.frameAlong([STOP_AT[0], STOP_AT[1], CB_TOP + 6], [0, 0, 1]), [[0, 10], [2.2, 10, 1], [3.4, 8.6, 1], [4.2, 5.6, 1], [4.5, 0]], { name: "cb.stop.cap" }))], { bias: 0.3 });

// The cable: from a connector on the box's front face, down onto the table, across and
// up into a bulkhead connector on the chassis's +x side.
const CB_PORT = [CB.x + CB.w / 2, CB_FRONT, CB_Z + 12];
const BULK = [RIGHT_X, 0, CH_BOT + 16];
const CABLE_R = 2.4;
const BOSS_R = 7;
{
  // Box connector: a square flange plate on the face and a round shell.
  const F = G.frameAlong(CB_PORT, [0, 1, 0]);
  const plate = { x: CB_PORT[0] - 8, y: CB_FRONT, w: 16, d: 1.6, r: 1 };
  slab("cb.port.plate", plate, CB_PORT[2] - 8, 16, { tone: "mid" }, { steps: 2, bias: 0.1 });
  R.items[R.items.length - 1].svg += Dt([[-5.5, -5.5], [5.5, 5.5]].map(([dx, dz]) => at([CB_PORT[0] + dx, CB_FRONT + 1.6, CB_PORT[2] + dz])), { size: 0.55, tone: "mid" });
  {
    const rp = { x: CB.x + 6, y: CB_FRONT, w: 18, d: 0.8, r: 0.3 };
    const fz = (x, z) => at([x, CB_FRONT + 0.8, z]);
    const z0 = CB_Z + 14, z1 = CB_Z + 30;
    const rules = [[z1 - 4.5, 12], [z1 - 7.5, 9], [z1 - 10.5, 11]].map(([z, w]) => path2([fz(rp.x + 3, z), fz(rp.x + 3 + w, z)])).join("");
    const inner = L(rules, { tone: "lo", free: true }) + Dt([fz(rp.x + 2, z0 + 2), fz(rp.x + rp.w - 2, z0 + 2)], { size: 0.45, tone: "mid" });
    put("cb.rating", [rp.x + rp.w / 2, CB_FRONT + 0.4, (z0 + z1) / 2], S(k.slabOf(rp, z0, z1 - z0, P, 2, 0), { tone: "mid" }) + inner, [record(A.slab(rp, z0, z1 - z0, { name: "cb.rating" }, 2))], { bias: 0.15 });
  }
  put("cb.port.shell", G.add3(CB_PORT, [0, 6, 0]), S(G.disc(1.6, 9, 5.2, F, P, { bevel: 0.3 }), { tone: "hi", crease: "lo", inner: L(G.arcOf(F, 5, 5.2, P), { tone: "faint" }) }),
    [record(A.disc(F, 1.6, 9, 5.2, { name: "cb.port.shell" }))], { bias: 0.2 });
}
{
  // Bulkhead: a round boss on the chassis face with a coupling nut.
  const F = G.frameAlong(BULK, [1, 0, 0]);
  put("bulk.boss", G.add3(BULK, [1, 0, 0]), S(G.disc(0, 2, BOSS_R + 3, F, P, { bevel: 0.3 }), { tone: "mid" }), [record(A.disc(F, 0, 2, BOSS_R + 3, { name: "bulk.boss" }))], { bias: 0.1 });
  put("bulk.nut", G.add3(BULK, [4.5, 0, 0]), S(G.disc(2, 7, 5.6, F, P, { steps: 6, bevel: 0.3 }), { tone: "hi", crease: "lo" }), [record(A.disc(F, 2, 7, 5.6, { name: "bulk.nut" }))], { bias: 0.2 });
}
function cable(name, points, r, { ends = [9, 7] } = {}) {
  const route = G.fillet(points, Math.max(10, r * 3), 10, { P, tube: r });
  R.route(name, route, r, { limp: true, piece: "rig" });
  TB.tubePieces(route, r, P, { maxLength: 14, spacing: 1.4, rings: { pitch: 2.2, twist: 0, fade: [0.12, 0.6], tone: "faint" } }).forEach((piece, index) =>
    put(`${name}:${index}`, piece.mid, TB.tubeSvg(piece, { tone: "mid" }), [A.tube(piece.points, piece.radii)], { bias: 0.05, route: name, chunk: index }),
  );
  return route;
}
const CABLE_Z = TABLE + CABLE_R + 0.3;
const CABLE = cable("cable", [
  [CB_PORT[0], CB_FRONT + 9, CB_PORT[2]],
  [CB_PORT[0], CB_FRONT + 22, CB_PORT[2]],
  [CB_PORT[0], CB_FRONT + 40, CABLE_Z],
  [CB_PORT[0] - 4, BULK[1] - 6, CABLE_Z],
  [BULK[0] + 26, BULK[1], CABLE_Z],
  [BULK[0] + 26, BULK[1], BULK[2]],
  [BULK[0] + 7, BULK[1], BULK[2]],
], CABLE_R);

// The bed plate, the frame round the field, rulers and screws.
function bedPlate() {
  const inner = L(k.sideSeam(BED, -BED_T + 4, P, 8), { tone: "faint" });
  const out = [S(k.slabOf(BED, -BED_T, BED_T, P, 8, 1.2), { tone: "mid", inner })];
  const screws = k.corners(BED, 6);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }), Dt(screws.map(([x, y]) => at([x, y, 0])), { size: 0.6 }));
  return out.join("");
}
put("bed", [0, 0, -BED_T / 2], "", [record(A.slab(BED, -BED_T, BED_T, { name: "bed" }, 8))], { bias: 0 });
const BARS = {
  farY: { x: -OX, y: -OY, w: OX + IX, d: BAR, r: 1.2 },
  farX: { x: -OX, y: -IY, w: BAR, d: 2 * IY, r: 1.2 },
  nearY: { x: -OX, y: IY, w: OX + IX, d: BAR, r: 1.2 },
  nearX: { x: IX, y: -OY, w: BAR, d: 2 * OY, r: 1.2 },
};
function bar(name) {
  const plan = BARS[name];
  const along = plan.w > plan.d;
  const screws = [];
  const n = along ? 6 : 5;
  for (let s = 0; s < n; s++) {
    const u = (s + 0.5) / n;
    screws.push(along ? [plan.x + plan.w * u, plan.y + plan.d / 2] : [plan.x + plan.w / 2, plan.y + plan.d * u]);
  }
  let extra = "";
  if (name === "nearY") {
    const strip = { x: X0, y: IY + 2.4, w: FIELD_W, d: 4.6, r: 0.6 };
    const t = k.topTicks(X0, X0 + FIELD_W, PITCH, 5, strip.y, FH + 0.4, [2, 3.4], P, "x");
    extra = S(k.slabOf(strip, FH, 0.4, P, 2), { tone: "lo", crease: "none" }) + L(t.minor, { tone: "lo" }) + L(t.major, { tone: "mid" });
    screws.length = 0;
    for (const x of [-OX + 6.5, IX - 3]) screws.push([x, plan.y + plan.d / 2]);
  }
  if (name === "nearX") {
    const strip = { x: IX + 2.4, y: Y0, w: 4.6, d: FIELD_D, r: 0.6 };
    const t = k.topTicks(Y0, Y0 + FIELD_D, PITCH, 5, strip.x, FH + 0.4, [2, 3.4], P, "y");
    extra = S(k.slabOf(strip, FH, 0.4, P, 2), { tone: "lo", crease: "none" }) + L(t.minor, { tone: "lo" }) + L(t.major, { tone: "mid" });
    screws.length = 0;
    for (const y of [-OY + 6.5, OY - 6.5]) screws.push([plan.x + plan.w / 2 + 3, y]);
  }
  const rings = L(screws.map(([x, y]) => k.ring(x, y, 1.9, FH, P, 14)).join(""), { tone: "lo" });
  return S(k.slabOf(plan, 0, FH, P, 3, 0.5), { tone: "mid" }) + rings + Dt(screws.map(([x, y]) => at([x, y, FH])), { size: 0.5 }) + extra;
}

// Height gauge on the bed's back-right corner: a scale plate (0 at a resting pin's top,
// a tick every 2 mm, a major every 10) and an indicator that rides at the peak pin height.
const GAUGE = { x: OX + 2, y: BED.y + 2.5, w: 8, d: 3, r: 0.6 };
const GAUGE_FACE = GAUGE.y + GAUGE.d;
const GAUGE_TOP = REST + TRAVEL + 7;
function gauge() {
  const minor = [], major = [];
  for (let mm = 0; mm <= TRAVEL; mm += 2) {
    const z = REST + mm;
    (mm % 10 === 0 ? major : minor).push(k.segment([GAUGE.x, GAUGE_FACE, z], [GAUGE.x + (mm % 10 === 0 ? 3.6 : 2), GAUGE_FACE, z], P));
  }
  const inner = L(minor.join(""), { tone: "lo" }) + L(major.join(""), { tone: "mid" });
  return S(k.slabOf(k.insetPlan(GAUGE, -1.4), 0, 2, P, 3, 0.3), { tone: "mid" }) + Dt([at([GAUGE.x - 0.4, GAUGE.y - 0.4, 2]), at([GAUGE.x + GAUGE.w + 0.4, GAUGE.y + GAUGE.d + 0.4, 2])], { size: 0.45 }) +
    S(k.slabOf(GAUGE, 2, GAUGE_TOP - 2, P, 2, 0.3), { tone: "mid", inner }) + S(k.slabOf(k.insetPlan(GAUGE, -0.5), GAUGE_TOP, 1.4, P, 2, 0.3), { tone: "mid" });
}
const INDICATOR = { x: GAUGE.x + 4.4, y: GAUGE_FACE, w: 3.6, d: 1.8, r: 0.3 };
const indicatorSvg = () => S(k.slabOf(INDICATOR, REST - 1, 2, P, 2, 0.2), { tone: "hi", crease: "lo" }) +
  `<path class="iso-line" data-tone="hi" d="${path3([[INDICATOR.x, GAUGE_FACE + 0.9, REST], [GAUGE.x + 3.9, GAUGE_FACE + 0.9, REST]])}" data-free="end"/>`;

// ---- Settle and audit the hardware -----------------------------------------
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
A.auditOrExit(R, P, {});
const hardware = (filter) => R.items.filter(filter).map((item) => item.svg).join("");
const isAbove = (item) => item.name === "bed";
const bedIndex = R.items.findIndex(isAbove);
const START_STOP = STOPS.findIndex(([t]) => t === START);
const itemSvg = (item) => item.svg.replace("__KNOB_POINTER__", pointerSvg(START_STOP / STOPS.length)).replace("__DIGITS__", Math.max(...H0).toFixed(1)).replace(/<g data-led="(\d+)">/g, (m, n) => (+n === START_STOP ? `<g data-led="${n}" data-on="">` : m));
const lowerSvg = R.items.slice(0, bedIndex).map(itemSvg).join("");
const upperSvg = R.items.slice(bedIndex + 1).map(itemSvg).join("");

// ---- Page ------------------------------------------------------------------
const onTable = CABLE.filter((p) => p[2] < TABLE + CABLE_R + 1).map(([x, y]) => at([x, y, TABLE]));
const halo = `<path class="iso-halo" d="${k.haloOf(k.insetPlan(BED, -4), TABLE, 2, P)}"/><path class="iso-halo" d="${k.haloOf(CB, TABLE, 2, P)}"/><path class="pw-cable-shadow" d="${path2(onTable)}"/>`;
const backSvg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A tabletop shape display: a grid of 616 square aluminium pins in a perforated bed plate on a heavy chassis, framed by a bezel with rulers, with a control box cabled to its side. Pins inside the Mereka logomark stand raised, the outline's edge pins part-way, and the detached dot is a separate lit cluster.",
  body: [halo, lowerSvg, `<g class="pw-bed">${bedPlate()}${holes()}</g>`, gauge(), `<g data-part="indicator" transform="${k.translateAlong(P, [0, 0, Math.max(...H0)])}">${indicatorSvg()}</g>`, bar("farY"), bar("farX"), `<g class="pw-pins">${pinsSvg()}<path class="iso-line" data-tone="mid" data-probe="mid" d="M0 0" style="visibility:hidden"/><path class="iso-line" data-tone="hi" data-probe="hi" d="M0 0" style="visibility:hidden"/></g>`, upperSvg].join(""),
});
// A spirit level screwed to the bed's front margin: how the bed is set flat.
function level() {
  const plan = { x: -150, y: OY + 1.6, w: 40, d: 6.6, r: 1.6 };
  const top = 3.2;
  const vial = { x: plan.x + 8, y: plan.y + 1.6, w: 24, d: 3.4, r: 1.7 };
  const ticks = [-3.4, 3.4].map((dx) => k.lineOnTop([plan.x + 20 + dx, vial.y], [plan.x + 20 + dx, vial.y + vial.d], top, P)).join("");
  const bubble = k.ring(plan.x + 20, vial.y + vial.d / 2, 1.3, top, P, 24);
  return S(k.slabOf(plan, 0, top, P, 4, 0.4), { tone: "mid" }) + `<path class="pw-vial" d="${k.planOutline(vial, top, P, 4)}"/>` + L(k.planOutline(vial, top, P, 4), { tone: "lo" }) + L(ticks, { tone: "mid" }) + L(bubble, { tone: "hi" }) +
    Dt([at([plan.x + 3.6, plan.y + plan.d / 2, top]), at([plan.x + plan.w - 3.6, plan.y + plan.d / 2, top])], { size: 0.5, tone: "mid" });
}
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg pw-layer pw-front" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">${bar("nearY")}${bar("nearX")}${level()}</svg>`;

const DATA = {
  W: WIDTH, H: HEIGHT, P, camera: glCamera(P), N, COLS, ROWS, PITCH, HW, OPEN, BORE, X0, Y0, TRAVEL, REST, IX, IY, FH, SPEED, TAU, LOOP, RIDGE, START,
  KZ, ZB_X, ZB_Y,
  f: PINS.map((p) => Math.round(p.f * 1000) / 1000),
  cl: PINS.map((p) => p.cluster),
  w: PINS.map((p) => Math.round(p.wave * 1000) / 1000),
  reg: PINS.map((p) => p.region),
  rd: PINS.map((p) => Math.round(p.rd * 1000) / 1000),
  rc: PINS.map((p) => Math.round(p.rc * 1000) / 1000),
  cx: PINS.map((p) => Math.round(p.cx * 100) / 100),
  cy: PINS.map((p) => Math.round(p.cy * 100) / 100),
  q: CORNERS.map((q) => q.map((v) => Math.round(v * 100) / 100)),
  o: BASES.flat().map((v) => Math.round(v * 1000) / 1000),
  shape: SHAPE.map((v) => Math.round(v * 10000) / 10000),
  order: PIN_ORDER,
  stops: STOPS,
  phases: PHASES,
  knob: KNOB, knobR: KNOB_R - 2.2, knobTop: KNOB_TOP + 0.05,
};
const live = `
const gateOf = ${gateOf.toString()};
const ridgeOf = ${ridgeOf.toString()};
const pinSides = ${pinSides.toString()};
const knobPointer = ${knobPointer.toString()};
(${liveMain.toString()})(${JSON.stringify(DATA)});
`;
const markUp = PINS.filter((p) => p.f > 0).length;
const plate = () => k.plateHtml({
  fig: "Fig 2",
  title: "Pin wall",
  hint: "Hover to press the pins · arrows step",
  readout: readoutOf(H0),
  keys: [
    { mark: "lit", label: "The detached dot: its own cluster, the last to rise" },
    { mark: "raised", label: `The joined body: ${markUp - PINS.filter((p) => p.cluster).length} pins under the outline` },
    { mark: "flat", label: "Light from the LED under each hole, let through as its pin rises" },
  ],
  caption: `A tabletop shape display. ${N} square pins, ${PIN} mm across on a ${PITCH} mm (½ in) pitch, ${COLS} by ${ROWS}, each pushed by its own actuator through ${TRAVEL} mm of travel at up to ${(SPEED / 1000).toFixed(2)} m/s. Every pin's target comes from its signed distance to the real logomark outline: pins more than ${(W_EDGE).toFixed(1)} mm inside rise the full ${TRAVEL} mm, pins within ${(W_EDGE).toFixed(1)} mm of the edge take a partial height on a smooth falloff, so a ${PITCH} mm grid still draws a round edge. The detached dot is a cluster of its own and always rises last. An LED under every hole shines up through the gap its pin opens as it rises, so the light follows the pins.`,
  body: `<div class="pw-stage pw-cb" tabindex="0" role="slider" aria-label="Mereka pin wall: arrow keys step through the sequence, space pauses, hover presses the pins" aria-valuemin="0" aria-valuemax="${STOPS.length - 1}" aria-valuenow="2" aria-valuetext="whole mark, step 3 of ${STOPS.length}">${backSvg}<canvas class="pw-layer pw-paint" aria-hidden="true"></canvas><canvas class="pw-layer pw-gl" aria-hidden="true"></canvas>${frontSvg}<span class="pw-said" aria-live="polite"></span></div>`,
});
function readoutOf(H) {
  const up = H.filter((h) => h > 1).length;
  const peak = Math.max(...H);
  return `${up} / ${N} pins up · peak ${peak.toFixed(1)} mm`;
}
writePages({ dir: HERE, slug: "pin-wall", title: "Mereka Pin Wall", body: plate, script: kitScript() + glScript() + live, css: CSS() });
console.log(`pins ${N} · in the mark ${markUp} · cluster ${PINS.filter((p) => p.cluster).length} · items ${R.items.length} · solids ${R.solids.length}`);

// ---- Live page (inlined with .toString(); runs in the browser) ---------------
function liveMain(D) {
  const stage = document.querySelector(".pw-stage");
  const svg = stage.querySelector("svg.iso-svg");
  const host = stage.closest(".iso") || document.body;
  const readout = document.querySelector("[data-readout]");
  const said = stage.querySelector(".pw-said");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const N = D.N;
  const els = new Array(N);
  for (const g of svg.querySelectorAll("[data-pin]")) els[+g.dataset.pin] = [g.children[0], g.children[1], g.children[3], g.children[2]];
  const leds = [...svg.querySelectorAll("[data-led]")];
  const pointerEl = svg.querySelector('[data-part="knob-pointer"] path');
  const indicator = svg.querySelector('[data-part="indicator"]');
  const digits = svg.querySelector('[data-part="digits"]');
  let shownPeak = -1;
  const TRAVEL = D.TRAVEL;
  const HS = D.TRAVEL + D.REST + 1;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ss = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

  // ---- state
  const h = new Float32Array(N), v = new Float32Array(N), base = new Float32Array(N), tgt = new Float32Array(N);
  const drawn = new Float32Array(N), led = new Float32Array(N), rl = new Float32Array(N);
  const START_H = (t) => { for (let i = 0; i < N; i++) { const g = gateOf(t, D.w[i], D.cl[i], D.reg[i], D.rd[i], D.rc[i]); base[i] = Math.min(TRAVEL, TRAVEL * D.f[i] * g + D.RIDGE * ridgeOf(t, D.w[i]) * (1 - g)); } };
  let clock = D.START, goal = null, touring = !still.matches, paused = false;
  START_H(clock);
  for (let i = 0; i < N; i++) { h[i] = base[i]; drawn[i] = base[i]; }
  const touch = { x: 0, y: 0, gx: 0, gy: 0, amp: 0, want: 0, ex: 0, ey: 0, emitAt: -9, pressAt: -9 };
  const ripples = [];
  let real = 0, first = still.matches ? 1 : 0, knobTurn = stopIndex(clock), stopShown = -1, phaseShown = "", stopSaid = -1;

  function stopIndex(t) { let n = 0; D.stops.forEach(([s], i) => { if (t >= s - 0.05) n = i; }); return n; }
  function phaseOf(t) { let name = D.phases[0][1]; for (const [s, label] of D.phases) if (t >= s) name = label; return name; }

  // ---- pointer: the screen point's ray against the current pins
  const inv = (sx, sy, z) => {
    const c = cameraOf(D.P);
    const qx = (sx - D.P.origin[0]) / c.k, qy = (sy - D.P.origin[1]) / c.k;
    const b = (qy + z * c.cosE) / c.sinE;
    return [qx * c.sinA + b * c.cosA, -qx * c.cosA + b * c.sinA];
  };
  function touchPoint(sx, sy) {
    for (let z = D.REST + TRAVEL + 1; z >= 0; z -= 0.75) {
      const [x, y] = inv(sx, sy, z);
      const c = Math.floor((x - D.X0) / D.PITCH), r = Math.floor((y - D.Y0) / D.PITCH);
      if (c < 0 || r < 0 || c >= D.COLS || r >= D.ROWS) continue;
      const i = r * D.COLS + c;
      if (Math.abs(x - D.cx[i]) <= D.HW && Math.abs(y - D.cy[i]) <= D.HW && z <= D.REST + h[i]) return [x, y];
    }
    return inv(sx, sy, 0);
  }
  const R_DENT = 2.1 * D.PITCH;
  function press(event) {
    const box = svg.getBoundingClientRect();
    const sx = ((event.clientX - box.left) / box.width) * D.W, sy = ((event.clientY - box.top) / box.height) * D.H;
    const [x, y] = touchPoint(sx, sy);
    const onField = Math.abs(x) < -D.X0 + 6 && Math.abs(y) < -D.Y0 + 6;
    if (onField && !touch.want) touch.pressAt = real;
    touch.want = onField ? 1 : 0;
    if (onField) { touch.gx = x; touch.gy = y; if (touch.amp < 0.02) { touch.x = x; touch.y = y; } }
    hold();
  }

  // ---- GL light layer: teal light from LEDs under the bed, through each pin's gap
  const SHADER = `
uniform sampler2D uH;uniform float uLight;uniform float uFirst;
const float COLS=${D.COLS}.,ROWS=${D.ROWS}.,PITCH=${D.PITCH},HW=${D.HW},OPEN=${D.OPEN.toFixed(3)},X0=${D.X0.toFixed(3)},Y0=${D.Y0.toFixed(3)},HS=${HS.toFixed(3)},ZTOP=${(D.REST + D.TRAVEL + 0.6).toFixed(2)},IX=${D.IX.toFixed(3)},IY=${D.IY.toFixed(3)},FH=${D.FH.toFixed(2)};
vec4 cell(vec2 c){
  if(c.x<0.||c.y<0.||c.x>COLS-1.||c.y>ROWS-1.)return vec4(0.);
  vec4 t=floor(texture2D(uH,(c+.5)/vec2(COLS,ROWS))*255.+.5);
  return vec4((t.r*256.+t.g)/65535.*HS,t.b/255.,t.a/255.,1.);
}
vec2 centre(vec2 c){return vec2(X0,Y0)+(c+.5)*PITCH;}
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
float wallLight(vec3 w,float along,float ci,bool alongY){
  float s=0.;
  for(int j=-1;j<=1;j++){
    float n=floor((along-(alongY?Y0:X0))/PITCH)+float(j);
    vec2 c=alongY?vec2(ci,n):vec2(n,ci);
    vec4 nb=cell(c);
    float lat=along-(alongY?centre(c).y:centre(c).x);
    s+=nb.y*exp(-lat*lat/70.);
  }
  return s*exp(-w.z/4.5);
}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  float px=pixelOf();
  vec3 V=towardViewer();
  vec3 p0=onFloor(vb,ZTOP);
  vec3 pf=onFloor(vb,0.);
  vec2 lo=min(p0.xy,pf.xy),hi=max(p0.xy,pf.xy);
  if(hi.x<-IX-6.||lo.x>IX+6.||hi.y<-IY-6.||lo.y>IY+6.){gl_FragColor=vec4(0.);return;}
  vec3 dir=-V;
  float sF=ZTOP/V.z;
  vec2 q0=(p0.xy-vec2(X0,Y0))/PITCH;
  vec2 c=floor(q0);
  vec2 sStep=PITCH/(-dir.xy);
  vec2 sNext=(q0-c)*sStep;
  float kind=0.;float sHit=sF;vec2 hc=vec2(0.);vec2 nrm=vec2(0.);
  for(int k=0;k<11;k++){
    vec4 cc=cell(c);
    if(cc.w>0.){
      vec2 m=centre(c);
      vec2 a=(m-HW-p0.xy)/dir.xy;vec2 b=(m+HW-p0.xy)/dir.xy;
      vec2 t0=min(a,b);vec2 t1=max(a,b);
      float ta=max(t0.x,t0.y);float tb=min(t1.x,t1.y);
      if(ta<tb&&ta<sF){
        float za=ZTOP-ta*V.z;
        if(za<=cc.x){kind=2.;sHit=ta;hc=c;nrm=t0.x>t0.y?vec2(1.,0.):vec2(0.,1.);break;}
        float st=(ZTOP-cc.x)/V.z;
        if(st<tb){kind=1.;sHit=st;hc=c;break;}
      }
    }
    float sn=min(sNext.x,sNext.y);
    if(sn>=sF)break;
    if(sNext.x<sNext.y){c.x-=1.;sNext.x+=sStep.x;}else{c.y-=1.;sNext.y+=sStep.y;}
  }
  vec3 q=p0+dir*sHit;
  float emit=0.;float tint=0.;
  if(kind==2.){
    vec4 own=cell(hc);
    tint+=own.y*.7*exp(-q.z/6.);
    vec2 side=vec2(nrm.y,nrm.x);
    for(int s=-1;s<=1;s++){
      vec2 nc=hc+nrm+side*float(s);
      vec4 nb=cell(nc);
      float lat=dot(q.xy-centre(nc),side);
      tint+=nb.y*1.05*exp(-q.z/13.)*exp(-lat*lat/50.);
    }
  }else if(kind==0.){
    float soft=.7*px/uCam.z;
    float field=smoothstep(-soft,soft,q.x+IX)*smoothstep(-soft,soft,q.y+IY)*(1.-smoothstep(-soft,soft,q.x-IX))*(1.-smoothstep(-soft,soft,q.y-IY));
    vec2 c0=floor((q.xy-vec2(X0,Y0))/PITCH);
    vec4 own=cell(c0);
    vec2 d=abs(q.xy-centre(c0));
    float hole=(1.-smoothstep(-soft,soft,max(d.x,d.y)-OPEN))*own.w;
    emit+=hole*own.y*field;
    float spill=0.;
    for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
      vec2 nc=c0+vec2(float(i),float(j));
      vec4 nb=cell(nc);
      vec2 dd=abs(q.xy-centre(nc));
      spill+=nb.y*exp(-max(max(dd.x,dd.y)-OPEN,0.)/3.4);
    }
    tint+=(1.-hole)*spill*.7*field;
    if(q.x<-IX+1.){vec3 w=onWallX(vb,-IX);float on=window(w.z,0.,FH,.25)*window(w.y,-IY,IY,.3);tint+=on*.7*wallLight(w,w.y,0.,true);}
    if(q.y<-IY+1.){vec3 w=onWallY(vb,-IY);float on=window(w.z,0.,FH,.25)*window(w.x,-IX,IX,.3);tint+=on*.7*wallLight(w,w.x,0.,false);}
  }
  vec3 core=vec3(.62,1.,.95);
  vec3 E=vec3(.16,.92,.86)*emit*1.7+vec3(.10,.62,.62)*tint;
  vec3 col=tonemap(E,1.);
  col=mix(col,core*max(col.g,.0),smoothstep(.55,1.2,emit)*.6);
  float a=max(col.r,max(col.g,col.b));
  vec4 dark=vec4(col,a);
  float ee=1.-exp(-1.8*emit);
  vec3 seen=mix(vec3(1.),vec3(.08,.55,.57),smoothstep(.03,.5,ee));
  seen=mix(seen,vec3(.66,.97,.95),smoothstep(.62,.97,ee));
  vec4 em=inkFor(seen,.92*smoothstep(.5,.95,ee));
  float ta=.72*(1.-exp(-1.5*tint));
  vec4 ti=vec4(vec3(.15,.56,.58)*ta,ta);
  vec4 light=em+ti*(1.-em.a);
  vec4 o=mix(dark,light,uLight)*uFirst;
  float n=(hash12(gl_FragCoord.xy+fract(uTime*.61)*91.)+hash12(gl_FragCoord.yx*1.37+fract(uTime*.37)*57.)-1.)/255.;
  o+=n*smoothstep(0.,1.5/255.,o.a);
  o=max(o,0.);o.rgb=min(o.rgb,vec3(o.a));
  gl_FragColor=o;
}`;
  let layer = null, texture = null;
  const bytes = new Uint8Array(N * 4);
  try {
    layer = glLayer({ canvas: stage.querySelector(".pw-gl"), fragment: SHADER, view: [D.W, D.H], camera: D.camera, uniforms: ["uLight", "uFirst"] });
  } catch (error) { layer = null; }
  if (layer) {
    const gl = layer.gl;
    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    for (const [p, val] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, val);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, D.COLS, D.ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    stage.setAttribute("data-gl", "");
  }
  let glDirty = true, shownDot = "";
  const fallback = svg.querySelector(".pw-fallback");
  const CLUSTER = D.cl.reduce((a, b) => a + b, 0);
  function drawLight() {
    let level = 0;
    for (let i = 0; i < N; i++) {
      const lift = Math.pow(clamp(h[i] / TRAVEL, 0, 1), 0.6);
      led[i] = clamp(lift * (D.cl[i] ? 1 : 0.68) + 0.8 * rl[i], 0, 1);
      if (D.cl[i]) level += lift;
    }
    if (!layer) {
      const dot = (first * level / CLUSTER).toFixed(2);
      if (fallback && dot !== shownDot) { shownDot = dot; fallback.style.opacity = String(0.6 * dot); }
      return;
    }
    for (let i = 0; i < N; i++) {
      const z = Math.round(clamp((D.REST + h[i]) / HS, 0, 1) * 65535);
      bytes[i * 4] = z >> 8; bytes[i * 4 + 1] = z & 255;
      bytes[i * 4 + 2] = Math.round(led[i] * 255);
      bytes[i * 4 + 3] = D.cl[i] ? 255 : 0;
    }
    const gl = layer.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, D.COLS, D.ROWS, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    layer.draw({ uLight: host.getAttribute("data-theme") === "light" ? 1 : 0, uFirst: first }, still.matches ? 0.8 : real);
  }

  // ---- one frame
  function targets(dt) {
    START_H(clock);
    // the hand: a crater where it presses, a rim of displaced pins round it
    touch.amp += ((still.matches ? touch.want : touch.want) - touch.amp) * (still.matches ? 1 : 1 - Math.exp(-dt / (touch.want ? 0.12 : 0.35)));
    if (Math.abs(touch.amp - touch.want) < 1e-3) touch.amp = touch.want;
    const follow = still.matches ? 1 : 1 - Math.exp(-dt / 0.09);
    touch.x += (touch.gx - touch.x) * follow;
    touch.y += (touch.gy - touch.y) * follow;
    // ripples leave the hand as it moves
    const fresh = touch.amp > 0.5 && touch.emitAt < touch.pressAt;
    if (!still.matches && touch.want && (fresh || (Math.hypot(touch.x - touch.ex, touch.y - touch.ey) > 2.6 * D.PITCH && real - touch.emitAt > 0.45))) {
      ripples.push({ x: touch.x, y: touch.y, age: 0 });
      touch.ex = touch.x; touch.ey = touch.y; touch.emitAt = real;
      if (ripples.length > 3) ripples.shift();
    }
    for (const r of ripples) r.age += dt;
    while (ripples.length && ripples[0].age > 2.6) ripples.shift();
    rl.fill(0);
    for (let i = 0; i < N; i++) {
      let t = base[i];
      const b = t / TRAVEL;
      if (touch.amp > 1e-3) {
        const r = Math.hypot(D.cx[i] - touch.x, D.cy[i] - touch.y);
        const dent = Math.exp(-((r / R_DENT) ** 2));
        const rim = Math.exp(-(((r - 1.7 * R_DENT) / (0.55 * R_DENT)) ** 2));
        t += touch.amp * (-TRAVEL * dent + 11 * rim * (1 - b));
      }
      for (const w of ripples) {
        const r = Math.hypot(D.cx[i] - w.x, D.cy[i] - w.y);
        const amp = 9 * ss(0, 0.12, w.age) * Math.exp(-w.age / 0.85);
        const ring = amp * Math.exp(-(((r - 140 * w.age - 14) / 8) ** 2));
        t += ring * (1 - 2 * b);
        rl[i] += ring / 9;
      }
      tgt[i] = clamp(t, 0, TRAVEL);
    }
  }
  function actuate(dt) {
    let moving = false;
    const w = 1 / D.TAU;
    for (let i = 0; i < N; i++) {
      if (still.matches) { h[i] = tgt[i]; v[i] = 0; continue; }
      for (let s = 0; s < 2; s++) {
        const a = w * w * (tgt[i] - h[i]) - 2 * w * v[i];
        v[i] = clamp(v[i] + a * dt * 0.5, -D.SPEED, D.SPEED);
        h[i] += v[i] * dt * 0.5;
      }
      if (Math.abs(tgt[i] - h[i]) < 0.01 && Math.abs(v[i]) < 0.5) { h[i] = tgt[i]; v[i] = 0; } else moving = true;
    }
    return moving;
  }
  // ---- pins: painted into a 2D canvas from the SVG's own shapes and tokens (the SVG
  // pins stay as the source and the no-script picture); SVG updates only without a canvas.
  const paintCanvas = stage.querySelector(".pw-paint");
  const ctx = paintCanvas && paintCanvas.getContext ? paintCanvas.getContext("2d") : null;
  let inks = null, paintDirty = true;
  function readInks() {
    const of = (g) => {
      const cs = (el) => getComputedStyle(el);
      return { fx: cs(g.children[0]).fill, fy: cs(g.children[1]).fill, top: cs(g.children[2].children[0]).fill, crease: cs(g.children[2].children[1]).stroke, edge: cs(g.children[3]).stroke };
    };
    const plain = svg.querySelector("[data-pin]:not([data-lit])"), lit = svg.querySelector("[data-pin][data-lit]");
    inks = [of(plain), of(lit || plain)];
    // flat pins are the bed's texture (mid); a pin's edge brightens to hi as it rises
    const rgb = (text) => (text.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    const mid = rgb(getComputedStyle(svg.querySelector('[data-probe="mid"]')).stroke);
    const hiProbe = rgb(getComputedStyle(svg.querySelector('[data-probe="hi"]') || svg.querySelector('[data-pin]:not([data-lit]) > .iso-edge')).stroke);
    inks[0].ramp = Array.from({ length: 17 }, (_, n) => { const u = n / 16; return `rgb(${mid.map((m, c) => Math.round(m + (hiProbe[c] - m) * u)).join(",")})`; });
    paintDirty = true;
  }
  if (ctx) { stage.setAttribute("data-paint", ""); readInks(); }
  function paint() {
    const box = paintCanvas.getBoundingClientRect();
    const ratio = Math.min(4, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(box.width * ratio)), ch = Math.max(1, Math.round(box.height * ratio));
    if (paintCanvas.width !== cw || paintCanvas.height !== ch) { paintCanvas.width = cw; paintCanvas.height = ch; }
    const sx = cw / D.W, sy = ch / D.H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.lineWidth = (0.6 * ratio) / sx;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const s = D.shape, o = D.o, BX = -D.ZB_X * D.KZ, BY = -D.ZB_Y * D.KZ;
    for (const i of D.order) {
      const ink = inks[D.cl[i]];
      const ox = o[2 * i], oy = o[2 * i + 1], t = -(D.REST + h[i]) * D.KZ;
      const ax = ox + s[0], ay = oy + s[1], bx = ox + s[2], by = oy + s[3], cx = ox + s[4], cy = oy + s[5], dx = ox + s[6], dy = oy + s[7];
      ctx.fillStyle = ink.fx;
      ctx.beginPath(); ctx.moveTo(ax, ay + t); ctx.lineTo(bx, by + t); ctx.lineTo(bx, by + BX); ctx.lineTo(ax, ay + BX); ctx.closePath(); ctx.fill();
      ctx.fillStyle = ink.fy;
      ctx.beginPath(); ctx.moveTo(bx, by + t); ctx.lineTo(cx, cy + t); ctx.lineTo(cx, cy + BY); ctx.lineTo(bx, by + BY); ctx.closePath(); ctx.fill();
      ctx.fillStyle = ink.top;
      ctx.beginPath(); ctx.moveTo(ax, ay + t); ctx.lineTo(bx, by + t); ctx.lineTo(cx, cy + t); ctx.lineTo(dx, dy + t); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ink.crease;
      ctx.beginPath(); ctx.moveTo(ax, ay + t); ctx.lineTo(bx, by + t); ctx.lineTo(cx, cy + t);
      ctx.moveTo(ax, ay + t); ctx.lineTo(ox + s[8], oy + s[9] + t); ctx.lineTo(ox + s[10], oy + s[11] + t); ctx.lineTo(ox + s[12], oy + s[13] + t); ctx.lineTo(cx, cy + t); ctx.stroke();
      ctx.strokeStyle = ink.ramp ? ink.ramp[Math.round(16 * ss(0.04, 0.45, h[i] / TRAVEL))] : ink.edge;
      ctx.beginPath(); ctx.moveTo(cx, cy + t); ctx.lineTo(dx, dy + t); ctx.lineTo(ax, ay + t); ctx.lineTo(ax, ay + BX); ctx.lineTo(bx, by + BX); ctx.lineTo(bx, by + BY); ctx.lineTo(cx, cy + BY); ctx.closePath(); ctx.stroke();
    }
    paintDirty = false;
  }
  function drawPins() {
    let changed = false;
    for (let i = 0; i < N; i++) {
      if (Math.abs(h[i] - drawn[i]) < 0.02) continue;
      drawn[i] = h[i];
      changed = true;
      if (ctx) continue;
      const [fx, fy, out, move] = pinSides(D.q[i], D.REST + h[i], D.KZ, D.ZB_X, D.ZB_Y);
      const e = els[i];
      e[0].setAttribute("d", fx); e[1].setAttribute("d", fy); e[2].setAttribute("d", out); e[3].setAttribute("transform", move);
    }
    if (ctx && (changed || paintDirty)) paint();
    return changed;
  }
  function words() {
    let up = 0, peak = 0;
    for (let i = 0; i < N; i++) { if (h[i] > 1) up++; if (h[i] > peak) peak = h[i]; }
    const text = `${up} / ${N} pins up · peak ${peak.toFixed(1)} mm`;
    if (indicator && Math.abs(peak - shownPeak) > 0.02) { shownPeak = peak; indicator.setAttribute("transform", translateAlong(D.P, [0, 0, peak])); }
    const shown = peak.toFixed(1);
    if (digits && digits.textContent !== shown) digits.textContent = shown;
    if (readout.textContent !== text) readout.textContent = text;
    const stop = stopIndex(clock);
    if (stop !== stopShown) {
      stopShown = stop;
      leds.forEach((el, n) => (n === stop ? el.setAttribute("data-on", "") : el.removeAttribute("data-on")));
      stage.setAttribute("aria-valuenow", String(stop));
    }
    const phase = touch.want ? "pressed by hand" : phaseOf(clock);
    if (phase !== phaseShown || stop !== stopSaid) {
      stopSaid = stop;
      phaseShown = phase;
      stage.setAttribute("aria-valuetext", `${phase}, step ${stop + 1} of ${D.stops.length}`);
      if (document.activeElement === stage) said.textContent = phase;
    }
  }

  let frame = 0, last = 0, visible = false, quiet = 0;
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    real += dt;
    const calm = still.matches;
    first = calm ? 1 : Math.min(1, first + dt / 1.2);
    if (touring && !paused) { clock += dt; if (clock >= D.LOOP) clock -= D.LOOP; }
    else if (goal !== null) { clock = calm ? goal : Math.min(goal, clock + dt); }
    targets(dt);
    const moving = actuate(dt);
    const changed = drawPins();
    const turnGoal = stopIndex(clock);
    const prevTurn = knobTurn;
    knobTurn += calm ? turnGoal - knobTurn : (turnGoal - knobTurn) * (1 - Math.exp(-dt / 0.18));
    if (Math.abs(turnGoal - knobTurn) < 1e-3) knobTurn = turnGoal;
    if (pointerEl && knobTurn !== prevTurn) pointerEl.setAttribute("d", knobPointer(knobTurn / D.stops.length, D.knob, D.knobR, D.knobTop, D.P));
    if (changed || glDirty || first < 1 || ripples.length) drawLight();
    if (paintDirty && ctx) paint();
    glDirty = false;
    words();
    const busy = (touring && !paused) || (goal !== null && clock !== goal) || moving || ripples.length || touch.amp !== touch.want || first < 1 || knobTurn !== turnGoal;
    frame = visible && busy ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
  function hold() {
    if (touring) { touring = false; goal = clock; }
    clearTimeout(quiet);
    quiet = setTimeout(() => { touring = !still.matches && !paused; goal = null; touch.want = 0; run(); }, 3600);
    run();
  }
  function stepTo(index, jump) {
    const t = D.stops[(index + D.stops.length) % D.stops.length][0];
    if (jump || t < clock) clock = t;
    goal = t;
    hold();
  }
  new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
  stage.addEventListener("pointermove", press);
  stage.addEventListener("pointerdown", press);
  stage.addEventListener("pointerleave", () => { touch.want = 0; hold(); });
  stage.addEventListener("keydown", (event) => {
    const now = stopIndex(clock);
    const exact = Math.abs(D.stops[now][0] - clock) < 0.06;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); stepTo(exact || clock > D.stops[now][0] ? now + 1 : now, now + 1 >= D.stops.length); }
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); stepTo(exact ? now - 1 : now, true); }
    else if (event.key === "Home") { event.preventDefault(); stepTo(0, true); }
    else if (event.key === "End") { event.preventDefault(); stepTo(2, true); }
    else if (event.key === " ") { event.preventDefault(); paused = !paused; if (paused) { touring = false; goal = clock; clearTimeout(quiet); } else { touring = !still.matches; goal = null; } run(); }
    else if (event.key === "Escape") { touch.want = 0; run(); }
  });
  stage.addEventListener("focus", () => { said.textContent = phaseShown; });
  const restyle = () => { glDirty = true; if (ctx) readInks(); run(); };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", restyle);
  new MutationObserver(restyle).observe(host, { attributes: true, attributeFilter: ["data-theme"] });
  new ResizeObserver(() => { glDirty = true; paintDirty = true; run(); }).observe(stage);
  if (still.matches) { clock = D.START; goal = clock; }
  words();
}

function CSS() {
  return `
.pw-stage{position:relative;touch-action:pan-y;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;cursor:crosshair}
.pw-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.pw-stage>svg,.pw-stage>canvas{display:block;width:100%;height:auto}
.pw-stage>.pw-layer{position:absolute;inset:0;height:100%!important;pointer-events:none}
.iso:not([data-theme="light"]) .pw-gl{mix-blend-mode:screen}
.pw-said{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.pw-bed{--pw-bore:#050505}
.iso[data-theme="light"] .pw-bed{--pw-bore:#7d8286}
.pw-bore{fill:var(--pw-bore);stroke:none}
.pw-fallback{fill:#2d898b;stroke:none;opacity:0}
.pw-stage[data-gl] .pw-fallback{display:none}
.pw-stage[data-paint] .pw-pins{visibility:hidden}
.pw-pin[data-lit] .iso-top{fill:var(--anatomy-lit-top)}
.pw-pin[data-lit]>.iso-shade{fill:var(--anatomy-lit-shade)}
.pw-pin[data-lit] .iso-edge{stroke:var(--anatomy-lit)}
.pw-pins{--pw-lit-crease:#73c4c5}
.iso[data-theme="light"] .pw-pins{--pw-lit-crease:#7cc3c4}
.pw-pin[data-lit] .iso-crease{stroke:var(--pw-lit-crease)}
.pw-slot{fill:none}
.pw-cb{--pw-glass:#0a0d0d;--pw-digit:#cfe3e3;--pw-vial:#1d2324}
.iso[data-theme="light"] .pw-cb{--pw-glass:#2c3233;--pw-digit:#e9f4f4;--pw-vial:#dbe6e6}
.pw-glass{fill:var(--pw-glass);stroke:none}
.pw-digits{fill:var(--pw-digit);font-family:var(--anatomy-mono);font-variant-numeric:tabular-nums;letter-spacing:.06em}
.pw-vial{fill:var(--pw-vial);stroke:none}
.pw-cable-shadow{fill:none;stroke:var(--anatomy-halo);stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round;filter:blur(2.2px);opacity:var(--anatomy-halo-opacity);transform:translateY(1.5px)}
g[data-led][data-on] .iso-dots circle{opacity:1;fill:var(--anatomy-hi)}
`;
}
