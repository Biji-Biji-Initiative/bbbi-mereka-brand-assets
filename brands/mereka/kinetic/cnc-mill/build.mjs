// Fig 3 · CNC mill: a desktop 3-axis gantry router milling the Mereka logomark.
// Build: node brands/mereka/kinetic/cnc-mill/build.mjs        (writes the three pages)
// Audit: node brands/mereka/kinetic/cnc-mill/build.mjs --audit
import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { k, kitScript, glScript, kitPath, logo, FREE, writePages } from "../shared.mjs";

const G = await import(kitPath("kit/lathe.mjs"));
const { tubePieces, tubeSvg } = await import(kitPath("kit/tube.mjs"));
const A = await import(kitPath("kit/audit.mjs"));
const HERE = dirname(fileURLToPath(import.meta.url));

// ---- Truth: the job -----------------------------------------------------------
// World units are millimetres; x runs along the gantry beam, y toward the front
// of the machine (toward the viewer), z up from the bench.
const TOOL_R = 2; // Ø4 mm two-flute flat end mill
const STOCK = { x: -95, y: -75, w: 190, d: 150, r: 1 };
const STOCK_Z = 63;
const TOP = 83; // stock top: work Z0
const DEPTH = { profile: 2, pocket: 3 };
const SAFE = TOP + 5;
const PARK = { x: 0, y: -100, z: TOP + 27 };
const FEED = { cut: 900, pocket: 900, helix: 450, plunge: 300, rapid: 2500 }; // mm/min
const RPM = 18000;
const STEPOVER = 1.8; // 45% of the tool
const CHIPS = 24;
// Hot chips: one ink table, by temperature in °C, for the shader and the SVG fallback.
const CHIP_STOPS = [[520, [0.36, 0.08, 0.05]], [600, [0.45, 0.09, 0.05]], [680, [0.56, 0.07, 0.04]], [780, [0.78, 0.1, 0.03]], [950, [0.95, 0.38, 0.06]], [1150, [1, 0.78, 0.12]], [1260, [1, 0.93, 0.78]]];
const SPEEDUP = 8;
const L0 = logo({ scale: 140 / 427.76, center: [0, 0], gap: 1.2 });
const DOT_R = L0.dotR;

function buildJob() {
  const keys = []; // [t s, x, y, z, op, sOp, feed, kind]
  const ops = [];
  let t = 0;
  let at = [PARK.x, PARK.y, PARK.z];
  const push = (op, s, feed, kind) => keys.push([t, at[0], at[1], at[2], op, s, feed, kind]);
  push(-1, 0, 0, 0);
  const move = (to, feed, op, s0, s1, kind) => {
    const len = Math.hypot(to[0] - at[0], to[1] - at[1], to[2] - at[2]);
    t += len / (feed / 60);
    at = to;
    push(op, s1, feed, kind);
    return len;
  };
  const rapidTo = (x, y, op) => {
    if (at[2] < SAFE - 1e-6) move([at[0], at[1], SAFE], FEED.rapid, op, 0, 0, 0);
    move([x, y, SAFE], FEED.rapid, op, 0, 0, 0);
  };
  // 1. Profile: the joined body's outline, one pass at 2 mm.
  {
    const ring = L0.body;
    const pts = [...ring, ring[0]];
    const op = ops.length;
    ops.push({ name: "profile", depth: DEPTH.profile, pts, len: 0 });
    rapidTo(pts[0][0], pts[0][1], op);
    move([pts[0][0], pts[0][1], TOP + 1], FEED.rapid, op, 0, 0, 0);
    move([pts[0][0], pts[0][1], TOP - DEPTH.profile], FEED.plunge, op, 0, 0, 1);
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      move([pts[i][0], pts[i][1], TOP - DEPTH.profile], FEED.cut, op, 0, s, 2);
    }
    ops[op].len = s;
    move([at[0], at[1], SAFE], FEED.rapid, op, s, s, 0);
  }
  // 2–5. Pockets: helical entry at the centre, then a spiral out to the wall and a finishing lap.
  const order = [0, 1, 2, FREE];
  for (const index of order) {
    const [cx, cy] = L0.dots[index];
    const op = ops.length;
    const pts = [];
    const rh = 1.5;
    const rOut = DOT_R - TOOL_R;
    const helixTurns = 2;
    const ring = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    rapidTo(cx + rh, cy, op);
    move([cx + rh, cy, TOP + 1], FEED.rapid, op, 0, 0, 0);
    let s = 0;
    const stepA = 0.12;
    pts.push(ring(rh, 0));
    for (let a = stepA; a <= helixTurns * 2 * Math.PI + 1e-9; a += stepA) {
      const p = ring(rh, a);
      s += Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]);
      pts.push(p);
      const z = TOP + 1 - (DEPTH.pocket + 1) * (a / (helixTurns * 2 * Math.PI));
      move([p[0], p[1], z], FEED.helix, op, 0, s, 1);
    }
    // Spiral out: r grows by one stepover per turn.
    let a = 0;
    for (;;) {
      a += Math.min(0.12, 2.2 / (rh + (STEPOVER * a) / (2 * Math.PI)));
      const r = Math.min(rOut, rh + (STEPOVER * a) / (2 * Math.PI));
      const p = ring(r, a);
      s += Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]);
      pts.push(p);
      move([p[0], p[1], TOP - DEPTH.pocket], FEED.pocket, op, 0, s, 2);
      if (r >= rOut) break;
    }
    // Finishing lap at the wall.
    const a0 = a;
    for (let b = 0.08; b <= 2 * Math.PI + 1e-9; b += 0.08) {
      const p = ring(rOut, a0 + b);
      s += Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]);
      pts.push(p);
      move([p[0], p[1], TOP - DEPTH.pocket], FEED.pocket, op, 0, s, 2);
    }
    ops.push({ name: index === FREE ? "pocket 4 · detached dot" : `pocket ${order.indexOf(index) + 1}`, depth: DEPTH.pocket, pts, len: s, dot: index });
    move([at[0], at[1], SAFE], FEED.rapid, op, s, s, 0);
  }
  // Home.
  move([at[0], at[1], PARK.z], FEED.rapid, ops.length - 1, ops[ops.length - 1].len, ops[ops.length - 1].len, 0);
  move([PARK.x, PARK.y, PARK.z], FEED.rapid, ops.length - 1, ops[ops.length - 1].len, ops[ops.length - 1].len, 0);
  // Fill the op index of the leading rapid for each op (keys before an op's first cut belong to it).
  return { keys, ops, total: t };
}
const JOB = buildJob();
const cutLength = JOB.ops.reduce((a, op) => a + op.len, 0);
const realSeconds = JOB.total;

// ---- Camera -------------------------------------------------------------------
const WIDTH = 600;
const HEIGHT = 500;
const AZIMUTH = 58;
const ELEVATION = 36;
const FY0 = -250; // back of the frame
const FY1 = 110; // front of the frame
const FRAME_X = 230;
const BOX = { x: -55, y: FY1 + 42, w: 110, d: 58, r: 4 };
const P = k.fitProjection(
  [
    ...k.boxCorners({ x: -FRAME_X, y: FY0, w: 2 * FRAME_X, d: FY1 - FY0 + 58, r: 0 }, 0, 48),
    ...k.boxCorners(BOX, 0, 52),
    [0, -144, 336], [-230, -166, 260], [70, 12, 336], [226, -120, 160],
  ],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const Faded = (list, style) => k.fadedSvg(list, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const f2 = (v) => Math.round(v * 100) / 100;
const depthOf = (p) => G.dot3(p, V);

// ---- Recorder and part helpers -----------------------------------------------
// Every drawn item is put into one recorder with its true shape, so the audit can
// prove clearances, supports and depth order. `layer` says which live group it
// belongs to (and so how it moves); the live order is layer by layer, settled
// depth inside each layer.
const R = A.recorder(P);
const record = R.solid;
const LAYERS = ["base", "gleft", "lscrew", "clamps", "beam", "xchain", "carriage", "zaxis", "gright", "yscrew", "ychain", "front"];
const MOTION_OF = { gleft: "g", beam: "g", xchain: "g", carriage: "c", zaxis: "z", gright: "g" };
function put(name, layer, ref, svg, shapes = [], { bias = 0, motion, ...rest } = {}) {
  if (!LAYERS.includes(layer)) throw new Error("layer " + layer);
  return R.put({ name, at: ref, bias, svg, shapes, piece: "machine", layer, motion: motion ?? MOTION_OF[layer] ?? "", ...rest });
}
const XF = (o = [0, 0, 0]) => G.frameOf(o, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const YF = (o = [0, 0, 0]) => G.frameOf(o, [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const ZF = (o = [0, 0, 0]) => G.frameOf(o, [0, 0, 1], [1, 0, 0], [0, 1, 0]);
function box(name, layer, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.6, steps = 2, bevel = 0, extra = "", inner = "", bias = 0, ground = false, owner, motion } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = record(A.slab(plan, z0, z1 - z0, { name, ground, owner }, steps));
  put(name, layer, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias, motion });
  return shape;
}
function turned(name, layer, F, profile, style = {}, { extra = "", inner = "", bias = 0, smooth, steps, rims, bevel = 0, owner, ref, motion } = {}) {
  const opts = { bevel, ...(smooth !== undefined ? { smooth } : {}), ...(steps ? { steps } : {}), ...(rims ? { rims } : {}) };
  const paths = G.solidOf(profile, F, P, opts);
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const shape = record(A.solid(F, profile, { name, owner }));
  put(name, layer, ref ?? G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: "mid", ...style, inner }) + extra, [shape], { bias, motion });
  return shape;
}
const disc = (name, layer, F, s0, s1, r, style = {}, options = {}) => turned(name, layer, F, [[s0, r], [s1, r]], style, options);
function prism(name, layer, F, poly, s0, s1, style = {}, { extra = "", inner = "", bias = 0, ref, owner } = {}) {
  const shape = record(A.prism(F, poly, s0, s1, { name, owner }));
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const centre = G.add3(G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.mul3(F.u, cx)), G.mul3(F.v, cy));
  put(name, layer, ref ?? centre, S(G.prismOf(F, poly, s0, s1, P), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const chamferSquare = (h, c) => [[-h + c, -h], [h - c, -h], [h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c]];
// The visible half of a prism's cross-section at s: a band line round a motor or block.
function bandOf(F, poly, s) {
  const pts = poly.map(([u, v]) => G.add3(G.add3(G.add3(F.o, G.mul3(F.a, s)), G.mul3(F.u, u)), G.mul3(F.v, v)));
  let area = 0;
  for (let i = 0; i < poly.length; i++) area += poly[i][0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * poly[i][1];
  const sign = area > 0 ? 1 : -1;
  const seen = poly.map(([x0, y0], i) => {
    const [x1, y1] = poly[(i + 1) % poly.length];
    const n = G.add3(G.mul3(F.u, (y1 - y0) * sign), G.mul3(F.v, -(x1 - x0) * sign));
    return G.dot3(n, V) > 1e-6;
  });
  const runs = [];
  let run = null;
  const n = poly.length;
  const start = seen.findIndex((v, i) => v && !seen[(i + n - 1) % n]);
  if (start < 0) return seen[0] ? path3([...pts, pts[0]]) : "";
  for (let step = 0; step < n; step++) {
    const i = (start + step) % n;
    if (seen[i]) {
      if (!run) run = [pts[i]];
      run.push(pts[(i + 1) % n]);
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs.map((r) => path3(r)).join("");
}

// ---- The machine at rest (parked) --------------------------------------------
// The geometry is built at one pose: parked for the pages, or any other pose for the
// pose audit (CNC_POSE=x,y,z), which checks the parked paint order at that pose.
const POSE = process.env.CNC_POSE ? process.env.CNC_POSE.split(",").map(Number) : null;
const TX0 = POSE ? POSE[0] : PARK.x;
const TY0 = POSE ? POSE[1] : PARK.y;
const TZ0 = POSE ? POSE[2] : PARK.z;
const screwDots = (points, size = 0.45) => Dots(points.map(at), { size, tone: "mid" });
const screwHeads = (points, z, r = 1.6) => Ln(points.map(([x, y]) => k.ring(x, y, r, z, P, 14)).join(""), { tone: "lo" }) + Dots(points.map(([x, y]) => at([x, y, z])), { size: 0.4, tone: "mid" });
const back = [];
const BASE_PLAN = { x: -FRAME_X, y: FY0, w: 2 * FRAME_X, d: FY1 - FY0, r: 6 };
back.push(`<path class="iso-halo" d="${k.haloOf(BASE_PLAN, 0, 8, P)}"/>`);
back.push(`<path class="iso-halo" d="${k.haloOf(BOX, 0, 4, P)}"/>`);

// Feet: rubber pads under the four ends of the side extrusions.
for (const sx of [-1, 1]) for (const fy of [FY0 + 18, FY1 - 18]) {
  const x = sx * 190;
  const F = ZF([x, fy, 0]);
  const shapes = [record(A.disc(F, 0, 3, 14, { name: "stand.foot.pad", ground: true })), record(A.disc(F, 3, 8, 8, { name: "stand.foot.nut", ground: true }))];
  put("foot", "base", [x, fy, 3], S(G.disc(0, 3, 14, F, P), { tone: "lo" }) + S(G.disc(3, 8, 8, F, P, { steps: 6 }), { tone: "mid" }), shapes);
}

// Side extrusions: 40 × 80 aluminium profile lying flat, slots on the top and outer faces.
const SIDE = (sx) => ({ x0: sx > 0 ? 150 : -230, x1: sx > 0 ? 230 : -150 });
for (const sx of [-1, 1]) {
  const { x0, x1 } = SIDE(sx);
  const outer = sx > 0 ? x1 : x0;
  const slotTop = k.planOutline({ x: sx > 0 ? 177 : -183, y: FY0 + 0.6, w: 6, d: FY1 - FY0 - 1.2, r: 1 }, 48, P, 2);
  const faceSlots = [18, 38].map((z) => path3([[outer, FY0 + 0.6, z - 2.5], [outer, FY1 - 0.6, z - 2.5], [outer, FY1 - 0.6, z + 2.5], [outer, FY0 + 0.6, z + 2.5]], true)).join("");
  const endBores = [[-20, 18], [0, 18], [20, 18], [-20, 38], [0, 38], [20, 38]].map(([dx, z]) => G.circleOf(YF([(x0 + x1) / 2 + dx, FY1, z]), 0, 2.4, P, 18)).join("");
  const endSlots = [-30, -10, 10, 30].map((dx) => path3([[(x0 + x1) / 2 + dx - 2.5, FY1, 48], [(x0 + x1) / 2 + dx - 2.5, FY1, 44], [(x0 + x1) / 2 + dx + 2.5, FY1, 44], [(x0 + x1) / 2 + dx + 2.5, FY1, 48]])).join("");
  const bolts = [FY1 - 10, FY0 + 10].flatMap((y) => [18, 38].map((z) => [outer, y, z]));
  const memberBolts = sx > 0 ? Ln(bolts.map(([x, y, z]) => G.circleOf(XF([x, y, z]), 0, 2.2, P, 14)).join(""), { tone: "lo" }) + screwDots(bolts) : "";
  box(`frame.side${sx > 0 ? "R" : "L"}`, "base", [x0, FY0, 8], [x1, FY1, 48], { tone: "mid" }, {
    r: 1.2, steps: 3, bevel: 0.6,
    inner: Ln(faceSlots, { tone: "faint" }) + Ln(endBores + endSlots, { tone: "faint" }),
    extra: Ln(slotTop, { tone: "faint" }) + memberBolts,
  });
}
// Front and back members between the sides, and two supports under the spoilboard.
const LABEL = { x: -40, y: FY1, z0: 16, z1: 40 };
for (const [y0, y1, name] of [[FY0, FY0 + 20, "back"], [FY1 - 20, FY1, "front"]]) {
  const slots = name === "front" ? [18, 38].map((z) => path3([[-149.4, FY1, z - 2.5], [149.4, FY1, z - 2.5], [149.4, FY1, z + 2.5], [-149.4, FY1, z + 2.5]], true)).join("") : "";
  box(`frame.${name}`, "base", [-150, y0, 8], [150, y1, 48], { tone: "mid" }, { r: 0.4, steps: 2, bevel: 0.5, inner: Ln(slots, { tone: "faint" }) });
}
for (const [y0, y1] of [[-104, -84], [52, 72]]) box("frame.support", "base", [-150, y0, 28], [150, y1, 48], { tone: "lo" }, { r: 0.4 });
// Label plate on the front member, the one engraved word in the drawing.
{
  const y = FY1;
  const plate = [[LABEL.x, y, LABEL.z0], [LABEL.x + 80, y, LABEL.z0], [LABEL.x + 80, y, LABEL.z1], [LABEL.x, y, LABEL.z1]];
  const F = G.frameOf([0, y, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  const m = (() => {
    const o = at([LABEL.x + 6, y + 1.2, LABEL.z1 - 9]);
    const px = at([LABEL.x + 7, y + 1.2, LABEL.z1 - 9]);
    const pz = at([LABEL.x + 6, y + 1.2, LABEL.z1 - 10]);
    return `matrix(${f2(px[0] - o[0])} ${f2(px[1] - o[1])} ${f2(pz[0] - o[0])} ${f2(pz[1] - o[1])} ${f2(o[0])} ${f2(o[1])})`;
  })();
  const text = k.faceTextSvg(m, "MEREKA · CNC 3", { size: 6.2, tone: "hi" });
  const rules = [[LABEL.x + 6, 50], [LABEL.x + 6, 38]].map(([x, w], i) => path3([[x, y + 1.2, LABEL.z1 - 15 - i * 4], [x + w, y + 1.2, LABEL.z1 - 15 - i * 4]])).join("");
  const screws = [[LABEL.x + 3.5, LABEL.z0 + 3.5], [LABEL.x + 76.5, LABEL.z0 + 3.5], [LABEL.x + 3.5, LABEL.z1 - 3.5], [LABEL.x + 76.5, LABEL.z1 - 3.5]].map(([x, z]) => [x, y + 1.2, z]);
  const shape = record(A.box([LABEL.x, y, LABEL.z0], [LABEL.x + 80, y + 1.2, LABEL.z1], { name: "label" }));
  put("label", "base", [LABEL.x + 40, y + 0.6, 28], S(G.prismOf(F, rect(LABEL.x, LABEL.x + 80, LABEL.z0, LABEL.z1), 0, 1.2, P), { tone: "mid" }) + text + Ln(rules, { tone: "lo", free: true }) + screwDots(screws, 0.5), [shape], { bias: 0.2 });
  void plate;
}

// Spoilboard: MDF with a grid of threaded inserts and a ruler strip on its front edge.
const SPOIL = { x: -140, y: -120, w: 280, d: 208, r: 2 };
const SPOIL_Z = 48;
{
  const inserts = [];
  for (let x = -120; x <= 120; x += 40) for (let y = -100; y <= 60; y += 40) inserts.push([x, y]);
  const visible = inserts.filter(([x, y]) => !(Math.abs(x) < 100 && Math.abs(y) < 80));
  const strip = { x: -130, y: SPOIL.y + SPOIL.d - 9, w: 260, d: 6, r: 0.8 };
  const ticks = k.topTicks(strip.x + 5, strip.x + strip.w - 5, 5, 5, strip.y, STOCK_Z + 0.6, [1.6, 3.2], P);
  box("spoilboard", "base", [SPOIL.x, SPOIL.y, SPOIL_Z], [SPOIL.x + SPOIL.w, SPOIL.y + SPOIL.d, STOCK_Z], { tone: "lo" }, {
    r: 2, steps: 3, bevel: 0.6,
    inner: Ln(k.sideSeam(SPOIL, 55, P, 3), { tone: "faint" }),
    extra: Ln(visible.map(([x, y]) => k.ring(x, y, 3.2, STOCK_Z, P, 18)).join(""), { tone: "lo" }) + Dots(visible.map(([x, y]) => at([x, y, STOCK_Z])), { size: 0.55, tone: "lo" }) +
      S(k.slabOf(strip, STOCK_Z, 0.6, P, 2), { tone: "lo", crease: "none" }) + Ln(ticks.minor, { tone: "lo" }) + Ln(ticks.major, { tone: "mid" }),
  });
}

// Stock: a steel block, chamfered, on the spoilboard.
box("stock", "base", [STOCK.x, STOCK.y, STOCK_Z], [STOCK.x + STOCK.w, STOCK.y + STOCK.d, TOP], { tone: "hi", crease: "lo" }, { r: 1, steps: 2, bevel: 0.8 });

// Y rails on the sides, with their screw counterbores.
for (const sx of [-1, 1]) {
  const x0 = sx > 0 ? 152.5 : -167.5;
  const holes = [];
  for (let y = FY0 + 19; y < FY1 - 8; y += 30) holes.push([x0 + 7.5, y]);
  box(`yrail${sx > 0 ? "R" : "L"}`, "base", [x0, FY0 + 4, 48], [x0 + 15, FY1 - 4, 56], { tone: "mid" }, { r: 0.6, bevel: 0.4, extra: screwHeads(holes, 56, 2) });
}

// ---- Lead screws ----------------------------------------------------------------
// A screw is drawn once, static, with its thread rings in a group that slides by the
// nut's travel modulo the pitch: a turning helix seen from the side appears to move
// along its axis at exactly the nut's speed. Where the screw leaves the nut toward
// the viewer, a clipped copy of the same screw is drawn after the nut.
const SCREW_PITCH = 2.4;
let clipCount = 0;
function screwArt(F, s0, s1, r, axisName) {
  const body = G.disc(s0, s1, r, F, P, { steps: 24 });
  const rings = [];
  for (let s = s0 - SCREW_PITCH; s <= s1 + SCREW_PITCH; s += SCREW_PITCH) rings.push(G.arcOf(F, s, r, P, { trim: 0.35 }));
  const id = `cnc-sc${clipCount++}`;
  return `${S(body, { tone: "hi", crease: "lo" })}<clipPath id="${id}"><path d="${body.fill}"/></clipPath><g clip-path="url(#${id})"><g data-thread="${axisName}">${Ln(rings.join(""), { tone: "faint", className: "cnc-thread" })}</g></g>`;
}
// The screen region of the screw from s = c onward (hull of the section there and far beyond).
function frontClip(F, c, s1, r) {
  const ring = (s, rr) => Array.from({ length: 36 }, (_, i) => at(G.pointOf(F, s, rr, (i / 36) * Math.PI * 2)));
  return k.pathOf(G.hullOf([...ring(c, r), ...ring(s1, r)]), true);
}
function leadScrew(name, F, s0, s1, r, axisName, nut, { layer = "base", overlayLayer, motion, hold }) {
  const art = screwArt(F, s0, s1, r, axisName);
  const shapes = [record(A.disc(F, s0, nut[0], r, { name: `${name}.back`, owner: name })), record(A.disc(F, nut[1], s1, r, { name: `${name}.front`, owner: name }))];
  put(name, layer, G.add3(F.o, G.mul3(F.a, (s0 + nut[0]) / 2)), art, [shapes[0]], { attrs: "" });
  const id = `cnc-fc${clipCount++}`;
  const overlay = `<clipPath id="${id}"><path d="${frontClip(F, nut[1], s1, r)}"/></clipPath><g clip-path="url(#${id})"><g data-hold="${hold}">${screwArt(F, s0, s1, r, axisName)}</g></g>`;
  put(`${name}.out`, overlayLayer, G.add3(F.o, G.mul3(F.a, (nut[1] + s1) / 2)), overlay, [shapes[1]], { motion, bias: 0.05 });
}

// ---- Stepper motors (NEMA 17), ribbed stack between two end caps ------------------
const NEMA = chamferSquare(21, 4.5);
function stepper(name, layer, F, { motion, connector = true, bias = 0 } = {}) {
  // F.a points from the mounting face out to the back of the motor; s = 0 is the face.
  const caps = [[0, 7], [37, 48]];
  const ribs = [];
  for (let s = 9; s < 36; s += 2.6) ribs.push(bandOf(F, NEMA, s));
  const out = [];
  out.push(S(G.prismOf(F, NEMA, 0, 7, P), { tone: "hi", crease: "lo" }));
  out.push(S(G.prismOf(F, chamferSquare(20.2, 4.2), 7, 37, P), { tone: "mid", inner: Ln(ribs.join(""), { tone: "lo" }) }));
  out.push(S(G.prismOf(F, NEMA, 37, 48, P), { tone: "hi", crease: "lo", inner: Ln(bandOf(F, NEMA, 42.5), { tone: "faint" }) }));
  const screws = [[-15.5, -15.5], [15.5, -15.5], [15.5, 15.5], [-15.5, 15.5]].map(([u, v]) => G.add3(G.add3(G.add3(F.o, G.mul3(F.a, 48)), G.mul3(F.u, u)), G.mul3(F.v, v)));
  if (G.dot3(F.a, V) > 0.12) out.push(Ln(screws.map((p) => G.circleOf(G.frameOf(p, F.a, F.u, F.v), 0, 1.6, P, 14)).join(""), { tone: "lo" }) + screwDots(screws, 0.45));
  const shapes = [record(A.prism(F, NEMA, 0, 48, { name }))];
  put(name, layer, G.add3(F.o, G.mul3(F.a, 24)), out.join(""), shapes, { motion, bias });
  if (connector) {
    // A connector housing on the back cap, on the side facing up.
    const C = G.frameOf(G.add3(G.add3(F.o, G.mul3(F.a, 42.5)), G.mul3(F.v, 21)), F.v, F.u, F.a);
    prism(`${name}.plug`, layer, C, rect(-8, 8, -4, 4), 0, 5, { tone: "lo" }, { owner: name, extra: "" });
    if (motion) R.items[R.items.length - 1].motion = motion;
  }
}

// ---- Y drive: screws outside the rails, steppers on the front ends ----------------
const Y_SCREW_Z = 58;
const NUT_Y = [TY0 - 104, TY0 - 88];
for (const sx of [-1, 1]) {
  const x = sx * 188;
  const side = sx > 0 ? "R" : "L";
  box(`ybearing${side}`, "base", [x - 10, FY0 + 2, 48], [x + 10, FY0 + 14, 68], { tone: "mid" }, { r: 1.2, steps: 2, bevel: 0.4, extra: screwDots([[x - 6, FY0 + 14, 64], [x + 6, FY0 + 14, 64]]) });
  const F = YF([x, 0, Y_SCREW_Z]);
  leadScrew(`yscrew${side}`, F, FY0 + 14, FY1 - 18, 4, "y", NUT_Y, { layer: sx > 0 ? "yscrew" : "base", overlayLayer: sx > 0 ? "yscrew" : "gleft", motion: "g", hold: "g" });
  const drive = sx > 0 ? "yscrew" : "lscrew";
  const CF = YF([x, 0, Y_SCREW_Z]);
  disc(`ycoupler${side}`, drive, CF, FY1 - 18, FY1, 9, { tone: "hi", crease: "lo" }, {
    inner: Ln([FY1 - 13, FY1 - 9, FY1 - 5].map((s) => G.arcOf(CF, s, 9, P)).join(""), { tone: "lo" }),
    extra: screwDots([[x + 3, FY1 - 15.5, Y_SCREW_Z + 8.4], [x + 3, FY1 - 2.5, Y_SCREW_Z + 8.4]], 0.5),
  });
  box(`ymount${side}`, drive, [x - 24, FY1, 8], [x + 24, FY1 + 6, 82], { tone: "lo" }, { r: 1.5, steps: 2, bevel: 0.4, extra: screwDots([[x - 19, FY1 + 6, 14], [x + 19, FY1 + 6, 14], [x - 19, FY1 + 6, 30], [x + 19, FY1 + 6, 30]], 0.5) });
  stepper(`ymotor${side}`, drive, G.frameOf([x, FY1 + 6, Y_SCREW_Z], [0, 1, 0], [1, 0, 0], [0, 0, 1]));
}
// Home switch for Y at the back of the right rail; its roller touches the gantry when parked.
box("yswitch", "base", [168, FY0 + 3, 48], [173, FY0 + 15, 58], { tone: "hi", crease: "lo" }, { r: 0.6, extra: Ln(path3([[170.5, FY0 + 13, 58], [170.5, PARK.y - 137.6, 66.2]]), { tone: "hi" }) + Dots([at([170.5, PARK.y - 137.6, 66.2])], { size: 0.9, tone: "hi" }) + screwDots([[170.5, FY0 + 6, 58]], 0.35) });
// Chain tray on the outer half of the right side.
const TRAY = { x0: 198, x1: 222, y0: FY0 + 4, y1: -24 };
box("tray", "yscrew", [TRAY.x0, TRAY.y0, 48], [TRAY.x1, TRAY.y1, 51], { tone: "lo" }, { r: 0.4 });
box("tray.lipL", "yscrew", [TRAY.x0, TRAY.y0, 51], [TRAY.x0 + 1.6, TRAY.y1, 55], { tone: "lo" }, { r: 0.2 });
box("tray.lipR", "yscrew", [TRAY.x1 - 1.6, TRAY.y0, 51], [TRAY.x1, TRAY.y1, 55], { tone: "lo" }, { r: 0.2 });

// ---- Workholding: four step clamps -------------------------------------------------
for (const sx of [-1, 1]) for (const cy of [-46, 46]) {
  const o = (v) => sx * v;
  const sort = (a, b) => [Math.min(a, b), Math.max(a, b)];
  const [bx0, bx1] = sort(o(120), o(136));
  const step = [1, 2, 3].map((i) => k.sideSeam({ x: bx0, y: cy - 8, w: 16, d: 16, r: 0.5 }, STOCK_Z + i * 5, P, 2)).join("");
  box("clamp.block", "clamps", [bx0, cy - 8, STOCK_Z], [bx1, cy + 8, TOP], { tone: "lo" }, { r: 0.5, inner: Ln(step, { tone: "faint" }) });
  const [sx0, sx1] = sort(o(85), o(134));
  const slot = k.planOutline({ x: Math.min(o(102), o(118)), y: cy - 2.4, w: 16, d: 4.8, r: 2.4 }, TOP + 6, P, 3);
  box("clamp.strap", "clamps", [sx0, cy - 7, TOP], [sx1, cy + 7, TOP + 6], { tone: "mid" }, { r: 1, steps: 2, bevel: 0.4, extra: Ln(slot, { tone: "lo" }) });
  const SF = ZF([o(110), cy, 0]);
  disc("clamp.stud", "base", SF, STOCK_Z, TOP, 3.2, { tone: "hi", crease: "lo" });
  disc("clamp.washer", "clamps", SF, TOP + 6, TOP + 7.4, 7.4, { tone: "mid" });
  disc("clamp.nut", "clamps", SF, TOP + 7.4, TOP + 14, 6.2, { tone: "hi", crease: "lo" }, { steps: 6, bevel: 0.3 });
  disc("clamp.stud.top", "clamps", SF, TOP + 14, TOP + 19, 3.2, { tone: "hi", crease: "lo" }, { extra: Ln(G.circleOf(SF, TOP + 19, 1.2, P, 12), { tone: "lo" }) });
}

// ---- Gantry --------------------------------------------------------------------------
const PLATE_Y = [TY0 - 136, TY0 - 40];
for (const sx of [-1, 1]) {
  const side = sx > 0 ? "R" : "L";
  const layer = sx > 0 ? "gright" : "gleft";
  const sort = (a, b) => [Math.min(a, b), Math.max(a, b)];
  const [cx0, cx1] = sort(sx * 151, sx * 169);
  for (const [y0, y1] of [[TY0 - 130, TY0 - 100], [TY0 - 92, TY0 - 62]]) {
    box(`ycar${side}.seal`, layer, [cx0, y0, 56], [cx1, y0 + 2, 67], { tone: "lo" }, { r: 0.4 });
    box(`ycar${side}`, layer, [cx0, y0 + 2, 56], [cx1, y1 - 2, 68], { tone: "mid" }, { r: 0.8, bevel: 0.3, inner: Ln(k.sideSeam({ x: cx0, y: y0 + 2, w: 18, d: y1 - y0 - 4, r: 0.8 }, 61, P, 2), { tone: "faint" }) });
    box(`ycar${side}.seal`, layer, [cx0, y1 - 2, 56], [cx1, y1, 67], { tone: "lo" }, { r: 0.4 });
    const NF = YF([sx * 160, 0, 62]);
    disc(`ycar${side}.nipple`, layer, NF, y1, y1 + 2.5, 1.3, { tone: "hi" });
  }
  const [px0, px1] = sort(sx * 146, sx * 174);
  const plateScrews = [[TY0 - 125, TY0 - 105], [TY0 - 87, TY0 - 67]].flatMap(([a, b]) => [a, b]).flatMap((y) => [[sx * 153.5, y], [sx * 166.5, y]]);
  box(`gbase${side}`, layer, [px0, PLATE_Y[0], 68], [px1, PLATE_Y[1], 76], { tone: "mid" }, { r: 1.2, bevel: 0.4, extra: screwHeads(plateScrews, 76, 1.5) });
  const [nx0, nx1] = sort(sx * 182, sx * 198);
  box(`ynut${side}`, sx > 0 ? "yscrew" : layer, [nx0, NUT_Y[0], 50], [nx1, NUT_Y[1], 66], { tone: "hi", crease: "lo" }, { r: 0.8, bevel: 0.3, motion: "g", extra: sx > 0 ? screwDots([[198, NUT_Y[0] + 4, 54], [198, NUT_Y[1] - 4, 54], [198, NUT_Y[0] + 4, 62], [198, NUT_Y[1] - 4, 62]], 0.45) : "" });
  const [ox0, ox1] = sort(sx * 174, sx * 182);
  const face = sx > 0 ? 182 : -174;
  const win = (y0, y1, z0, z1) => path3([[face, y0, z0], [face, y1, z0], [face, y1, z1], [face, y0, z1]], true);
  const windows = sx > 0 ? win(TY0 - 126, TY0 - 50, 126, 140) : win(TY0 - 126, TY0 - 50, 90, 140);
  const beamScrews = [[TY0 - 108, 160], [TY0 - 84, 160], [TY0 - 108, 220], [TY0 - 84, 220], [TY0 - 128, 240], [TY0 - 48, 240], [TY0 - 128, 84], [TY0 - 48, 84]].map(([y, z]) => [face, y, z]);
  box(`gplate${side}`, layer, [ox0, PLATE_Y[0], 50], [ox1, PLATE_Y[1], 250], { tone: "mid" }, {
    r: 1, steps: 2, bevel: 0.6,
    extra: Ln(windows, { tone: "faint" }) + Ln(beamScrews.map((p) => G.circleOf(G.frameOf(p, [sx, 0, 0], [0, 1, 0], [0, 0, 1]), 0, 2.2, P, 14)).join(""), { tone: "lo" }) + screwDots(beamScrews, 0.5),
  });
}
// Beam: a 40 × 80 extrusion between the plates, two X rails on its front face.
{
  const slotTop = [TY0 - 106, TY0 - 86].map((y) => k.planOutline({ x: -173.4, y: y - 2.5, w: 346.8, d: 5, r: 1 }, 230, P, 2)).join("");
  const front = TY0 - 76;
  const frontSlot = path3([[-173.4, front, 187], [173.4, front, 187], [173.4, front, 193], [-173.4, front, 193]], true);
  box("beam", "beam", [-174, TY0 - 116, 150], [174, TY0 - 76, 230], { tone: "mid" }, { r: 0.6, steps: 2, bevel: 0.6, inner: Ln(frontSlot, { tone: "faint" }), extra: Ln(slotTop, { tone: "faint" }) });
  for (const [z0, z1] of [[159, 171], [209, 221]]) {
    const holes = [];
    for (let x = -160; x <= 160; x += 32) holes.push([x, TY0 - 70, (z0 + z1) / 2]);
    box("xrail", "beam", [-170, TY0 - 76, z0], [170, TY0 - 70, z1], { tone: "mid" }, { r: 0.5, bevel: 0.3, extra: Ln(holes.map((p) => G.circleOf(YF(p), 0, 2, P, 12)).join(""), { tone: "lo" }) + screwDots(holes, 0.4) });
  }
  box("xbearing", "carriage", [158, TY0 - 76, 180], [174, TY0 - 58, 200], { tone: "mid" }, { r: 1, bevel: 0.3, motion: "g", extra: screwDots([[163, TY0 - 58, 184], [169, TY0 - 58, 196]], 0.45) });
  const CF = XF([0, TY0 - 66, 190]);
  disc("xcoupler", "beam", CF, -174, -158, 8, { tone: "hi", crease: "lo" }, { inner: Ln([-170, -166, -162].map((s) => G.arcOf(CF, s, 8, P)).join(""), { tone: "lo" }) });
  stepper("xmotor", "gleft", G.frameOf([-182, TY0 - 66, 190], [-1, 0, 0], [0, 1, 0], [0, 0, 1]));
}
// X screw through the carriage nut.
const XNUT = [TX0 - 12, TX0 + 12];
leadScrew("xscrew", XF([0, TY0 - 66, 190]), -158, 158, 4, "x", XNUT, { layer: "carriage", overlayLayer: "carriage", motion: "c", hold: "c" });
R.items[R.items.length - 2].motion = "g";

// ---- X carriage and Z axis --------------------------------------------------------------
for (const [x0, x1] of [[TX0 - 38, TX0 - 8], [TX0 + 8, TX0 + 38]]) for (const [z0, z1] of [[155, 175], [205, 225]]) {
  box("xcar", "carriage", [x0, TY0 - 70, z0], [x1, TY0 - 60, z1], { tone: "mid" }, { r: 0.8, inner: Ln(path3([[x0 + 2, TY0 - 60, z0], [x0 + 2, TY0 - 60, z1]]) + path3([[x1 - 2, TY0 - 60, z0], [x1 - 2, TY0 - 60, z1]]), { tone: "faint" }) });
}
box("xnut", "carriage", [XNUT[0], TY0 - 72, 180], [XNUT[1], TY0 - 60, 200], { tone: "hi", crease: "lo" }, { r: 0.8 });
{
  const holes = [[-38, 165], [38, 165], [-38, 215], [38, 215], [-38, 262], [38, 262]].map(([x, z]) => [TX0 + x, TY0 - 52, z]);
  box("xplate", "carriage", [TX0 - 42, TY0 - 60, 150], [TX0 + 42, TY0 - 52, 270], { tone: "mid" }, { r: 1, bevel: 0.6, extra: Ln(holes.map((p) => G.circleOf(YF(p), 0, 2, P, 12)).join(""), { tone: "lo" }) + screwDots(holes, 0.45) });
}
for (const x of [TX0 - 25, TX0 + 25]) box("zrail", "carriage", [x - 4, TY0 - 52, 152], [x + 4, TY0 - 46, 268], { tone: "mid" }, { r: 0.4 });
box("ztop", "zaxis", [TX0 - 30, TY0 - 70, 270], [TX0 + 30, TY0 - 28, 276], { tone: "mid" }, { r: 1.5, bevel: 0.4, motion: "c", extra: screwDots([[TX0 - 26, TY0 - 31, 276], [TX0 + 26, TY0 - 31, 276]], 0.45) });
stepper("zmotor", "zaxis", G.frameOf([TX0, TY0 - 49, 276], [0, 0, 1], [0, -1, 0], [1, 0, 0]), { motion: "c" });
leadScrewZ: {
  const F = ZF([TX0, TY0 - 47.6, 0]);
  const art = screwArt(F, 154, 270, 4, "z");
  put("zscrew", "zaxis", [TX0, TY0 - 47.6, 212], art, [record(A.disc(F, 154, 270, 4, { name: "zscrew" }))], { motion: "c" });
}
// The moving Z: blocks, plate, spindle clamp, spindle, collet, end mill.
for (const x of [TX0 - 25, TX0 + 25]) box("zcar", "zaxis", [x - 8, TY0 - 46, TZ0 + 95], [x + 8, TY0 - 36, TZ0 + 125], { tone: "mid" }, { r: 0.6 });
{
  const holes = [[-25, 102], [25, 102], [-25, 118], [25, 118], [-27, 76], [27, 76], [-27, 144], [27, 144]].map(([x, z]) => [TX0 + x, TY0 - 30, TZ0 + z]);
  box("zplate", "zaxis", [TX0 - 32, TY0 - 36, TZ0 + 70], [TX0 + 32, TY0 - 30, TZ0 + 150], { tone: "mid" }, { r: 1.2, bevel: 0.5, extra: Ln(holes.map((p) => G.circleOf(YF(p), 0, 1.8, P, 12)).join(""), { tone: "lo" }) + screwDots(holes, 0.42) });
}
const SPF = ZF([TX0, TY0, 0]);
turned("spindle.lower", "zaxis", SPF, [[TZ0 + 38, 24], [TZ0 + 40, 26], [TZ0 + 92, 26]], { tone: "hi", crease: "lo" }, { inner: Ln(G.arcOf(SPF, TZ0 + 46, 26, P), { tone: "faint" }) });
box("spindle.clamp", "zaxis", [TX0 - 34, TY0 - 30, TZ0 + 92], [TX0 + 34, TY0 + 30, TZ0 + 132], { tone: "mid" }, {
  r: 3, steps: 3, bevel: 0.6,
  inner: Ln(path3([[TX0 + 6, TY0 + 30, TZ0 + 92], [TX0 + 6, TY0 + 30, TZ0 + 132]]), { tone: "lo" }),
});
{
  const F = XF([TX0 + 34, TY0 + 20, TZ0 + 112]);
  disc("spindle.clampScrew", "zaxis", F, 0, 3.6, 4.4, { tone: "hi", crease: "lo" }, { extra: Ln(G.circleOf(F, 3.6, 2, P, 6), { tone: "lo" }) });
}
{
  const fins = G.ribsOf(SPF, TZ0 + 142, TZ0 + 180, 26, 44, P, { fade: [0.1, 0.55], seams: true });
  const grille = [18, 12, 6].map((r) => G.circleOf(SPF, TZ0 + 196, r, P, 40)).join("");
  const spokes = [0, 1, 2, 3].map((i) => path3([G.pointOf(SPF, TZ0 + 196, 6, i * Math.PI / 2 + 0.3), G.pointOf(SPF, TZ0 + 196, 18, i * Math.PI / 2 + 0.3)])).join("");
  turned("spindle.upper", "zaxis", SPF, [[TZ0 + 132, 26], [TZ0 + 186, 26], [TZ0 + 188, 24.5], [TZ0 + 196, 24.5]], { tone: "hi", crease: "lo" }, {
    inner: Faded(fins, { tone: "lo" }),
    extra: Ln(grille + spokes, { tone: "lo" }) + Dots([at([TX0, TY0, TZ0 + 196])], { size: 0.8, tone: "mid" }),
  });
}
turned("spindle.nose", "zaxis", SPF, [[TZ0 + 33, 13], [TZ0 + 38, 13]], { tone: "mid" });
{
  const ring = G.disc(TZ0 + 28, TZ0 + 33, 18.5, SPF, P);
  const leds = G.dotsOf(SPF, TZ0 + 28.8, 18.5, 12, P, { fade: [0.04, 0.42] });
  const shape = record(A.disc(SPF, TZ0 + 28, TZ0 + 33, 18.5, { name: "ledring" }));
  put("ledring", "zaxis", [TX0, TY0, TZ0 + 30], S(ring, { tone: "lo", inner: Ln(G.arcOf(SPF, TZ0 + 31, 18.5, P), { tone: "faint" }) }) + `<g class="cnc-leds">${Dots(leds, { size: 0.7, tone: "hi" })}</g>`, [shape]);
}
turned("collet", "zaxis", SPF, [[TZ0 + 16, 8], [TZ0 + 18, 11], [TZ0 + 28, 11]], { tone: "hi", crease: "lo" }, { inner: Faded(G.ribsOf(SPF, TZ0 + 18, TZ0 + 28, 11, 6, P, { fade: [0.1, 0.55] }), { tone: "lo" }) });
{
  const flutes = G.ribsOf(SPF, TZ0, TZ0 + 10, TOOL_R, 4, P, { twist: 1.4, fade: [0.08, 0.5] });
  const shape = record(A.disc(SPF, Math.max(TZ0, TOP), TZ0 + 16, TOOL_R, { name: "endmill" }));
  put("endmill", "zaxis", [TX0, TY0, TZ0 + 8], `<g data-part="tool">${S(G.disc(TZ0, TZ0 + 16, TOOL_R, SPF, P, { steps: 20 }), { tone: "hi", lit: true, inner: Faded(flutes, { tone: "lit" }) + Ln(G.arcOf(SPF, TZ0 + 10, TOOL_R, P), { tone: "lit" }) })}</g>`, [shape], { bias: -0.05 });
}

// ---- Drag chains --------------------------------------------------------------------
// A chain is a string of links pinned at fixed pitch along a lower run, a half-turn of
// radius R and an upper run that ends on the moving bracket. Its lower run never slides:
// links roll from the run onto the bend as the moving end travels, so the bend moves at
// half the speed of the axis.
function chainCurve(spec, um) {
  const C = spec.length - Math.PI * spec.R;
  const ub = (spec.uf + um + spec.dir * C) / 2;
  const a = Math.abs(ub - spec.uf);
  return (s) => {
    if (s <= a) return [spec.uf + spec.dir * s, spec.w0];
    if (s <= a + Math.PI * spec.R) {
      const f = (s - a) / spec.R;
      return [ub + spec.dir * spec.R * Math.sin(f), spec.w0 + spec.R * (1 - Math.cos(f))];
    }
    return [ub - spec.dir * (s - a - Math.PI * spec.R), spec.w0 + 2 * spec.R];
  };
}
function chainLinks(spec, um) {
  // Inner links are closed bodies; outer links are a near side plate that straddles the
  // inner links' ends, plus a top and a bottom crossbar between them. Painting all bodies
  // and bars by depth, then all near plates by depth, needs no split at the joints.
  const curve = chainCurve(spec, um);
  const pitch = spec.length / spec.count;
  const out = [];
  for (let i = 0; i < spec.count; i++) {
    const p0 = curve(i * pitch);
    const p1 = curve((i + 1) * pitch);
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const t = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len];
    const n = [-t[1], t[0]];
    const q = (a, b) => [p0[0] + t[0] * a + n[0] * b, p0[1] + t[1] * a + n[1] * b];
    const end = (h, c) => [q(-2.2, -h + c), q(0.6, -h), q(len - 0.6, -h), q(len + 2.2, -h + c), q(len + 2.2, h - c), q(len - 0.6, h), q(0.6, h), q(-2.2, h - c)];
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const h = spec.h / 2;
    const ang = Math.atan2(t[1], t[0]);
    if (i % 2 === 1) out.push({ kind: "body", id: "b" + i, i, p0, ang, poly: end(h - 0.7, 2), mid, s: [spec.s0 + 1.4, spec.s1 - 1.4] });
    else {
      // One crossbar, on the outside of the loop (the top of the upper run).
      const o = -spec.dir;
      out.push({ kind: "bar", id: "t" + i, i, p0, ang, poly: o > 0 ? [q(3.6, h - 2.7), q(len - 3.6, h - 2.7), q(len - 3.6, h - 0.7), q(3.6, h - 0.7)] : [q(3.6, -h + 0.7), q(len - 3.6, -h + 0.7), q(len - 3.6, -h + 2.7), q(3.6, -h + 2.7)], mid, s: [spec.s0 + 1.4, spec.s1 - 1.4] });
      out.push({ kind: "plate", id: "p" + i, i, p0, ang, poly: end(h, 2.4), inset: [q(2.4, -h + 2.6), q(len - 2.4, -h + 2.6), q(len - 2.4, h - 2.6), q(2.4, h - 2.6)], pins: [p0, p1], mid, s: [spec.s1 - 1.4, spec.s1] });
    }
  }
  return out;
}
// One piece as SVG. `F` maps (s, u, w): s across the chain, u along the run, w up.
function chainPieceSvg(K, GG, P, F, piece) {
  const W = (s, [u, w]) => [F.o[0] + F.a[0] * s + F.u[0] * u + F.v[0] * w, F.o[1] + F.a[1] * s + F.u[1] * u + F.v[1] * w, F.o[2] + F.a[2] * s + F.u[2] * u + F.v[2] * w];
  const body = K.solidSvg(GG.prismOf(F, piece.poly, piece.s[0], piece.s[1], P), { tone: piece.kind === "plate" ? "mid" : "lo" });
  if (piece.kind !== "plate") return body;
  const face = piece.s[1];
  const inset = K.pathOf([...piece.inset, piece.inset[0]].map((p) => K.iso(W(face, p), P)));
  const pins = piece.pins.map((p) => GG.circleOf(GG.frameOf(W(face, p), F.a, F.u, F.v), 0, 1.8, P, 14)).join("");
  return body + K.lineSvg(inset, { tone: "faint" }) + K.lineSvg(pins, { tone: "lo" }) + K.dotsSvg(piece.pins.map((p) => K.iso(W(face, p), P)), { size: 0.45, tone: "hi" });
}
function chainSvg(K, GG, P, F, V, spec, um) {
  const pieces = chainLinks(spec, um).map((piece) => {
    const sm = (piece.s[0] + piece.s[1]) / 2;
    const c = [0, 1, 2].map((j) => F.o[j] + F.a[j] * sm + F.u[j] * piece.mid[0] + F.v[j] * piece.mid[1]);
    return { piece, key: c[0] * V[0] + c[1] * V[1] + c[2] * V[2] + (piece.kind === "plate" ? 1e4 : 0) };
  });
  pieces.sort((a, b) => a.key - b.key);
  return pieces.map(({ piece }) => chainPieceSvg(K, GG, P, F, piece)).join("");
}
const KIT = { solidSvg: k.solidSvg, lineSvg: k.lineSvg, dotsSvg: k.dotsSvg, pathOf: k.pathOf, iso: k.iso };

// Y chain on the right side, in the plane x = 200…218, lying in the tray.
const YCHAIN = { uf: -40, dir: -1, w0: 58, R: 24, length: 176 + Math.PI * 24, count: 17, h: 14, s0: 200, s1: 218, s1face: 218 };
const YCF = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const yEnd = (ty) => ty - 96; // the moving bracket sits at the middle of the side plate
// X chain on the beam top, in the plane y = TY − 106 … TY − 88.
const XCHAIN = { uf: 44.2, dir: 1, w0: 237, R: 25, length: 100 + Math.PI * 25, count: 12, h: 14, s0: TY0 - 106, s1: TY0 - 88, s1face: TY0 - 88 };
const XCF = G.frameOf([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const xEnd = (tx) => tx + 44.2;
function chainItems(name, layer, F, spec, um) {
  // Each piece is its own item for the audit, keyed in the order the page paints them.
  for (const piece of chainLinks(spec, um)) {
    const shape = record(A.prism(F, piece.poly, piece.s[0], piece.s[1], { name: `${name}.${piece.kind}`, owner: name }));
    const sm = (piece.s[0] + piece.s[1]) / 2;
    const c = [0, 1, 2].map((j) => F.o[j] + F.a[j] * sm + F.u[j] * piece.mid[0] + F.v[j] * piece.mid[1]);
    const chainKey = G.dot3(c, V) + (piece.kind === "plate" ? 1e4 : 0);
    put(`${name}.${piece.kind}${piece.i}`, layer, c, chainPieceSvg(KIT, G, P, F, piece), [shape], { chainKey, motion: "" });
  }
}
chainItems("ychain", "ychain", YCF, YCHAIN, yEnd(TY0));
chainItems("xchain", "xchain", XCF, XCHAIN, xEnd(TX0));
// Brackets: fixed ends on the tray and the beam, moving ends on the right plate and the carriage.
const YTOP = YCHAIN.w0 + 2 * YCHAIN.R;
box("ychain.fixed", "ychain", [200, YCHAIN.uf + 2.2, 51], [218, YCHAIN.uf + 12.2, 65], { tone: "hi", crease: "lo" }, { r: 0.8, extra: screwDots([[209, YCHAIN.uf + 12.2, 55], [209, YCHAIN.uf + 12.2, 61]], 0.5) });
box("ychain.moving", "ychain", [182, yEnd(TY0) + 2.2, YTOP - 7], [218, yEnd(TY0) + 12.2, YTOP + 7], { tone: "hi", crease: "lo" }, { r: 0.8, motion: "g", extra: screwDots([[212, yEnd(TY0) + 12.2, YTOP - 3], [212, yEnd(TY0) + 12.2, YTOP + 3]], 0.5) });
box("xchain.fixed", "xchain", [XCHAIN.uf - 12.2, XCHAIN.s0, 230], [XCHAIN.uf - 2.2, XCHAIN.s1, 244], { tone: "hi", crease: "lo" }, { r: 0.8 });
box("xchain.arm", "zaxis", [TX0 + 42, TY0 - 86, 236], [TX0 + 48, TY0 - 52, XCHAIN.w0 + 2 * XCHAIN.R + 7], { tone: "mid" }, { r: 0.6, motion: "c", bevel: 0.3, extra: screwDots([[TX0 + 48, TY0 - 56, 244], [TX0 + 48, TY0 - 56, 262]], 0.45) });
box("xchain.moving", "xchain", [xEnd(TX0) - 12.2, XCHAIN.s0, 280], [xEnd(TX0) - 2.2, XCHAIN.s1 + 2, XCHAIN.w0 + 2 * XCHAIN.R + 7], { tone: "hi", crease: "lo" }, { r: 0.8, motion: "c" });

// ---- Control box on the bench in front of the machine --------------------------------
{
  const z1 = 46;
  const vents = [0, 1, 2, 3, 4].map((i) => path3([[BOX.x + 14 + i * 7, BOX.y + BOX.d, 10], [BOX.x + 18 + i * 7, BOX.y + BOX.d, 10], [BOX.x + 18 + i * 7, BOX.y + BOX.d, 30], [BOX.x + 14 + i * 7, BOX.y + BOX.d, 30]], true)).join("");
  for (const [x, y] of [[BOX.x + 8, BOX.y + 8], [BOX.x + BOX.w - 8, BOX.y + 8], [BOX.x + 8, BOX.y + BOX.d - 8], [BOX.x + BOX.w - 8, BOX.y + BOX.d - 8]]) {
    const F = ZF([x, y, 0]);
    put("box.foot", "front", [x, y, 1], S(G.disc(0, 3, 5, F, P, { steps: 20 }), { tone: "lo" }), [record(A.disc(F, 0, 3, 5, { name: "stand.boxfoot", ground: true }))]);
  }
  box("box", "front", [BOX.x, BOX.y, 3], [BOX.x + BOX.w, BOX.y + BOX.d, z1], { tone: "mid" }, {
    r: 4, steps: 4, bevel: 0.8,
    inner: Ln(k.sideSeam(BOX, z1 - 6, P, 4), { tone: "lo" }) + Ln(vents, { tone: "faint" }),
    extra: screwHeads([[BOX.x + 5, BOX.y + 5], [BOX.x + BOX.w - 5, BOX.y + 5], [BOX.x + 5, BOX.y + BOX.d - 5], [BOX.x + BOX.w - 5, BOX.y + BOX.d - 5]], z1, 1.4),
  });
  // E-stop: a collar and a mushroom head.
  const EF = ZF([BOX.x + BOX.w - 24, BOX.y + 26, 0]);
  disc("estop.collar", "front", EF, z1, z1 + 5, 12, { tone: "mid" }, { bevel: 0.4 });
  turned("estop.head", "front", EF, [[z1 + 5, 9], [z1 + 8, 11], [z1 + 10, 11, 1], [z1 + 11.5, 9.5, 1], [z1 + 12.4, 6, 1], [z1 + 12.7, 0, 1]], { tone: "hi", crease: "lo" }, { ref: [BOX.x + BOX.w - 24, BOX.y + 26, z1 + 8] });
  // Feed-override knob with a knurl and a pointer.
  const KF = ZF([BOX.x + 30, BOX.y + 30, 0]);
  disc("box.knobBase", "front", KF, z1, z1 + 1, 13, { tone: "lo" }, { extra: (() => { const t = k.radialTicks(BOX.x + 30, BOX.y + 30, 12.6, 20, 5, z1 + 1, [1.2, 2.4], P, -Math.PI * 0.75, Math.PI * 1.5); return Ln(t.minor, { tone: "lo" }) + Ln(t.major, { tone: "mid" }); })() });
  disc("box.knob", "front", KF, z1 + 1, z1 + 8, 8, { tone: "hi", crease: "lo" }, {
    inner: Faded(G.ribsOf(KF, z1 + 1, z1 + 8, 8, 40, P, { fade: [0.1, 0.55] }), { tone: "lo" }),
    extra: Ln(k.lineOnTop([BOX.x + 30, BOX.y + 30], [BOX.x + 30 + 4.2, BOX.y + 30 - 4.2], z1 + 8, P), { tone: "hi", free: "end" }) + Dots([at([BOX.x + 30, BOX.y + 30, z1 + 8])], { size: 0.5, tone: "mid" }),
  });
  // Status LEDs: power, run, spindle. Run blinks while the job runs.
  const ledXs = [BOX.x + 52, BOX.x + 60, BOX.x + 68];
  const ledFrames = ledXs.map((x) => ZF([x, BOX.y + 16, 0]));
  ledFrames.forEach((F, i) => disc(`box.led${i}`, "front", F, z1, z1 + 1.6, 2.4, { tone: "mid" }, { extra: `<g class="cnc-led" data-led="${i}">${Dots([at([ledXs[i], BOX.y + 16, z1 + 1.6])], { size: 1.1, tone: "hi" })}</g>` }));
  // Rocker power switch.
  box("box.switch", "front", [BOX.x + 50, BOX.y + 34, z1], [BOX.x + 70, BOX.y + 46, z1 + 2], { tone: "lo" }, { r: 1 });
  box("box.rocker", "front", [BOX.x + 53, BOX.y + 36, z1 + 2], [BOX.x + 67, BOX.y + 44, z1 + 4.5], { tone: "hi", crease: "lo" }, { r: 1, extra: Ln(k.lineOnTop([BOX.x + 60, BOX.y + 36], [BOX.x + 60, BOX.y + 44], z1 + 4.5, P), { tone: "lo" }) });
  // Cable glands on the back face.
  disc("box.gland", "front", YF([BOX.x + 90, 0, 24]), BOX.y - 5, BOX.y, 4.5, { tone: "hi", crease: "lo" }, { steps: 6 });
  disc("box.glandR", "front", XF([0, BOX.y + 29, 20]), BOX.x + BOX.w, BOX.x + BOX.w + 5, 3.8, { tone: "hi", crease: "lo" }, { steps: 6 });
  disc("box.glandL", "front", XF([0, BOX.y + 29, 20]), BOX.x - 5, BOX.x, 3.8, { tone: "hi", crease: "lo" }, { steps: 6 });
}

// ---- Cables --------------------------------------------------------------------------------
// Each route is a few straight legs between real ports, filleted, cut into depth-sorted
// chunks and recorded for the audit. Routes on the gantry are built parked and move with it.
const CABLES = [];
function cable(name, layer, points, r, { tone = "mid", bend = 6, motion, bundle, touch, dots = [false, false], maxLength = 22 } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6), 10, { P, tube: r });
  R.route(name, route, r, { limp: true, bundle, touch, piece: "machine" });
  CABLES.push(name);
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.8, Math.min(1.6, r)) }).forEach((piece, index) =>
    put(`${name}:${index}`, layer, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii)], { bias: 0.05, motion }),
  );
  dots.forEach((on, index) => {
    if (!on) return;
    const end = index ? route[route.length - 1] : route[0];
    put(`${name}.end${index}`, layer, end, Dots([at(end)], { size: Math.max(0.6, r * KS * 0.7), tone: "hi" }), [A.ball(end, (Math.max(0.6, r * KS * 0.7)) / KS, { name: `${name}.end${index}`, owner: name })], { bias: 0.15, motion });
  });
  return route;
}
const glandR = [BOX.x + BOX.w + 5, BOX.y + 29, 20];
const glandL = [BOX.x - 5, BOX.y + 29, 20];
const glandB = [BOX.x + 90, BOX.y - 5, 24];
const plugFace = (sx) => [sx * 188, FY1 + 6 + 42.5, 79 + 5];
// Control box to the two Y motors: along the bench, then up to the plug on each motor.
cable("cable.ymotorR", "front", [glandR, [glandR[0] + 12, glandR[1], 20], [glandR[0] + 12, glandR[1], 1.8], [188, glandR[1], 1.8], [188, FY1 + 64, 1.8], [188, FY1 + 64, 98], [188, plugFace(1)[1], 98], plugFace(1)], 1.8, { bend: 5 });
cable("cable.ymotorL", "front", [glandL, [glandL[0] - 12, glandL[1], 20], [glandL[0] - 12, glandL[1], 1.8], [-188, glandL[1], 1.8], [-188, FY1 + 64, 1.8], [-188, FY1 + 64, 98], [-188, plugFace(-1)[1], 98], plugFace(-1)], 1.8, { bend: 5 });
// Control box to the Y chain: along the bench outside the right side, up to the tray, into the fixed bracket.
const yFixedFace = [209, YCHAIN.uf + 12.2, 58];
cable("cable.main", "ychain", [glandB, [glandB[0], glandB[1] - 12, 24], [glandB[0], glandB[1] - 20, 2.4], [236, glandB[1] - 20, 2.4], [236, -4, 2.4], [236, -4, 60], [209, -4, 60], [209, yFixedFace[1] + 8, 58], yFixedFace], 2.4, { bend: 7, tone: "mid" });
// On the gantry: from the Y chain's moving bracket up the right plate to a junction box on its top.
const JBOX = { x0: 166, x1: 186, y0: TY0 - 126, y1: TY0 - 104, z0: 250, z1: 263 };
box("jbox", "gright", [JBOX.x0, JBOX.y0, JBOX.z0], [JBOX.x1, JBOX.y1, JBOX.z1], { tone: "mid" }, { r: 1, bevel: 0.4, inner: Ln(k.sideSeam({ x: JBOX.x0, y: JBOX.y0, w: 20, d: 22, r: 1 }, 259, P, 2), { tone: "faint" }), extra: screwDots([[JBOX.x0 + 3, JBOX.y0 + 3, JBOX.z1], [JBOX.x1 - 3, JBOX.y1 - 3, JBOX.z1]], 0.45) });
const yMovTop = [192, yEnd(TY0) + 7.2, YTOP + 7];
cable("cable.gantry", "ychain", [yMovTop, [192, yMovTop[1], 256.5], [180, yMovTop[1] - 1.2, 256.5], [180, JBOX.y1, 256.5]], 1.8, { bend: 6, motion: "g" });
// Along the beam top, behind the X chain: the X motor's cable and the feed to the X chain.
const LANE_OUT = TY0 - 112.5, LANE_IN = TY0 - 109, LANE_Z = 230 + 1.6;
const xPlugTop = [-224.5, TY0 - 66, 216];
cable("cable.xmotor", "beam", [xPlugTop, [-224.5, TY0 - 66, 258], [-224.5, LANE_OUT, 258], [-166, LANE_OUT, 258], [-146, LANE_OUT, LANE_Z], [JBOX.x0 + 3, LANE_OUT, LANE_Z], [JBOX.x0 + 3, LANE_OUT, JBOX.z0]], 1.6, { bend: 7, motion: "g", bundle: "beam", touch: ["beam"] });
const xFixedFace = [XCHAIN.uf - 12.2, (XCHAIN.s0 + XCHAIN.s1) / 2, 237];
cable("cable.xfeed", "beam", [[JBOX.x0 + 3, LANE_IN, JBOX.z0], [JBOX.x0 + 3, LANE_IN, LANE_Z], [22, LANE_IN, LANE_Z], [22, xFixedFace[1], 237], xFixedFace], 1.6, { bend: 6, motion: "g", bundle: "beam", touch: ["beam"] });
// From the X chain's moving bracket over the arm to the Z motor's plug.
const zPlug = [TX0 + 26, TY0 - 49, 318.5];
cable("cable.zmotor", "zaxis", [[xEnd(TX0) - 7.2, (XCHAIN.s0 + XCHAIN.s1) / 2, XCHAIN.w0 + 2 * XCHAIN.R + 7], [xEnd(TX0) - 7.2, (XCHAIN.s0 + XCHAIN.s1) / 2, 318.5], [xEnd(TX0) - 7.2, zPlug[1], 318.5], zPlug], 1.6, { bend: 6, motion: "c" });

// ---- End mill clip: below the stock top the tool is hidden by the near rim of its kerf ----
const toolClip = (() => {
  const [vx, vy] = k.towardViewer(P);
  const f = Math.atan2(vy, vx);
  const arc = [];
  for (let i = 0; i <= 24; i++) {
    const a = f - Math.PI / 2 + (i / 24) * Math.PI;
    arc.push(at([TX0 + (TOOL_R + 0.25) * Math.cos(a), TY0 + (TOOL_R + 0.25) * Math.sin(a), TOP]));
  }
  const l = arc[0], r = arc[arc.length - 1];
  return k.pathOf([...arc, [r[0], -999], [l[0], -999]], true);
})();

// ---- Settle and order ------------------------------------------------------------------
R.items.forEach((item, index) => { item.made = index; });
A.settle(R, P);
const rank = new Map(LAYERS.map((name, i) => [name, i]));
const ORDER_FILE = process.env.CNC_ORDER;
const chainSide = (item) => (item.chainKey === undefined ? 0 : item.layer === "ychain" ? -1 : 1);
R.items.sort((a, b) => rank.get(a.layer) - rank.get(b.layer) || chainSide(a) - chainSide(b) || (a.chainKey !== undefined && b.chainKey !== undefined ? a.chainKey - b.chainKey : a.key - b.key));
if (POSE && ORDER_FILE) {
  // Impose the parked order (chain pieces keep their live depth sort) and audit it here.
  const parked = JSON.parse(readFileSync(ORDER_FILE, "utf8"));
  if (parked.length !== R.items.length) throw new Error(`pose has ${R.items.length} items, park ${parked.length}`);
  R.items.sort((a, b) => rank.get(a.layer) - rank.get(b.layer) || chainSide(a) - chainSide(b) || (a.chainKey !== undefined && b.chainKey !== undefined ? a.chainKey - b.chainKey : parked[a.made] - parked[b.made]));
}
R.items.forEach((item, index) => { item.key = index; });
if (!POSE && ORDER_FILE) writeFileSync(ORDER_FILE, JSON.stringify(R.items.map((item) => item.made).reduce((ranks, made, index) => ((ranks[made] = index), ranks), [])));

// The cut: per operation a rim, the far wall and the floor (seen through the opening),
// drawn as strokes of the tool's width in the stock's top plane, revealed by dash length.
const planeMatrix = (z) => {
  const o = at([0, 0, z]), ex = at([1, 0, z]), ey = at([0, 1, z]);
  return `matrix(${(ex[0] - o[0]).toFixed(5)} ${(ex[1] - o[1]).toFixed(5)} ${(ey[0] - o[0]).toFixed(5)} ${(ey[1] - o[1]).toFixed(5)} ${o[0].toFixed(3)} ${o[1].toFixed(3)})`;
};
const opPath = (pts) => "M" + pts.map(([x, y]) => `${f2(x)} ${f2(y)}`).join("L");
const cutSvg = (() => {
  const masks = [];
  const groups = JOB.ops.map((op, i) => {
    const d = opPath(op.pts);
    masks.push(`<mask id="cnc-open${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"><path class="cnc-stroke" data-dash="${i}" transform="${planeMatrix(TOP)}" d="${d}" stroke="#fff" stroke-width="${TOOL_R * 2}"/></mask>`);
    return `<g data-op="${i}" style="display:none">` +
      `<path class="cnc-stroke cnc-rim" data-dash="${i}" transform="${planeMatrix(TOP)}" d="${d}" stroke-width="${TOOL_R * 2 + 0.9}"/>` +
      `<path class="cnc-stroke cnc-wall" data-dash="${i}" transform="${planeMatrix(TOP)}" d="${d}" stroke-width="${TOOL_R * 2}"/>` +
      `<g mask="url(#cnc-open${i})"><path class="cnc-stroke cnc-floor" data-dash="${i}" transform="${planeMatrix(TOP - op.depth)}" d="${d}" stroke-width="${TOOL_R * 2 + 1.2}"/></g>` +
      `<path class="cnc-stroke cnc-fresh" data-fresh="${i}" transform="${planeMatrix(TOP - op.depth)}" d="${d}" stroke-width="${TOOL_R * 2 - 0.6}"/>` +
      `</g>`;
  });
  const pool = `<g class="cnc-pool" transform="${planeMatrix(TOP)}"><circle data-pool cx="${TX0}" cy="${TY0}" r="34" fill="url(#cnc-pool-grad)"/></g><g class="cnc-chips" data-chips>${Array.from({ length: CHIPS }, () => '<circle r="0" cx="0" cy="0"/>').join("")}</g>`;
  return `<defs><radialGradient id="cnc-pool-grad"><stop offset="0" class="cnc-pool-in"/><stop offset="1" class="cnc-pool-out"/></radialGradient>${masks.join("")}</defs><g class="cnc-cut" data-cut>${groups.join("")}</g>${pool}`;
})();

const itemSvg = (item) => {
  const motion = item.motion ? ` data-motion="${item.motion}"` : "";
  if (item.name === "endmill") {
    return `<g class="it" data-name="endmill" data-motion="c"><clipPath id="cnc-toolclip"><path d="${toolClip}"/></clipPath><g clip-path="url(#cnc-toolclip)"><g data-zonly>${item.svg}</g></g></g>`;
  }
  return `<g class="it" data-name="${item.name}"${motion}>${item.svg}</g>`;
};
const layerSvg = (layer) => {
  const items = R.items.filter((item) => item.layer === layer);
  if (layer === "ychain" || layer === "xchain") {
    const pieces = items.filter((item) => item.chainKey !== undefined);
    const rest = items.filter((item) => item.chainKey === undefined);
    const box = `<g data-chain="${layer === "ychain" ? "y" : "x"}"${layer === "xchain" ? ' data-motion="g"' : ""}>${pieces.map((item) => item.svg).join("")}</g>`;
    return layer === "ychain" ? box + rest.map(itemSvg).join("") : rest.map(itemSvg).join("") + box;
  }
  let out = items.map(itemSvg).join("");
  if (layer === "base") {
    const at0 = items.findIndex((item) => item.name === "stock");
    out = items.slice(0, at0 + 1).map(itemSvg).join("") + cutSvg + items.slice(at0 + 1).map(itemSvg).join("");
  }
  return out;
};

const LABEL_TEXT = "A desktop three-axis CNC router milling the Mereka logomark into a steel block. An aluminium-extrusion frame on rubber feet carries two Y rails; the gantry rides them on four bearing carriages, driven by lead screws from two stepper motors at the front. On the gantry beam an X carriage carries the Z axis and a 52 mm spindle with a cooling-finned body, an LED ring, an ER16 collet nut and a 4 mm end mill. Drag chains carry the cables along the right side and across the beam top. Four step clamps hold the stock on a spoilboard with threaded inserts, and a control box with an emergency stop, a feed knob and status LEDs sits in front. The tool traces the logo's joined body, then pockets each of the four dots, the detached one last.";
const backBody = back.join("") + layerSvg("base");
const frontBody = LAYERS.slice(1).map(layerSvg).join("");
const backSvg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL_TEXT, body: backBody, className: "cnc-back" });
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg cnc-layer cnc-front" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">${frontBody}</svg>`;

// ---- Live -----------------------------------------------------------------------------------
const keysFlat = (() => {
  const cols = [[], [], [], [], [], [], [], []];
  for (const key of JOB.keys) key.forEach((v, i) => cols[i].push(i < 4 || i === 5 ? f2(v) : v));
  return cols;
})();
// Op boundaries in job seconds: the time each op's first move starts.
const opStarts = JOB.ops.map((_, op) => JOB.keys[JOB.keys.findIndex((key) => key[4] === op) - 1][0]);
const DATA = {
  P, V, W: WIDTH, H: HEIGHT,
  park: [TX0, TY0, TZ0], top: TOP, toolR: TOOL_R, pitch: SCREW_PITCH,
  keys: keysFlat, total: f2(JOB.total), speedup: SPEEDUP, rpm: RPM,
  ops: JOB.ops.map((op) => ({ name: op.name, len: f2(op.len), depth: op.depth })), opStarts: opStarts.map(f2),
  ychain: YCHAIN, xchain: XCHAIN, ycf: YCF, xcf: XCF,
  stock: STOCK, spoil: SPOIL, stockZ: STOCK_Z, spoilZ: SPOIL_Z,
  chips: CHIPS, chipStops: CHIP_STOPS, opDepth: JOB.ops.map((op) => op.depth),
};

function live(D) {
  const stage = document.querySelector(".cnc-stage");
  const host = stage.closest("[data-theme]") || document.body;
  const readout = document.querySelector("[data-readout]");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const [T, X, Y, Z, OP, SO, FEEDS, KIND] = D.keys;
  const N = T.length;
  const P = D.P;
  const [TX0, TY0, TZ0] = D.park;
  const PRE = 0.8; // spindle spin-up, wall seconds
  const JOB = D.total / D.speedup;
  const HOLD = 3.6;
  const FADE = 1.8;
  const LOOP = PRE + JOB + HOLD + FADE;
  const KITF = { solidSvg, lineSvg, dotsSvg, pathOf, iso };
  const yEnd = (ty) => ty - 96;
  const xEnd = (tx) => tx + 44.2;

  function stateAt(t) {
    if (t <= 0) return { x: X[0], y: Y[0], z: Z[0], op: -1, s: 0, feed: 0, kind: -1 };
    if (t >= T[N - 1]) return { x: X[N - 1], y: Y[N - 1], z: Z[N - 1], op: D.ops.length, s: 0, feed: 0, kind: -2 };
    let lo = 0, hi = N - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= t) lo = mid; else hi = mid; }
    const f = (t - T[lo]) / (T[hi] - T[lo] || 1);
    const s0 = OP[lo] === OP[hi] ? SO[lo] : 0;
    return { x: X[lo] + (X[hi] - X[lo]) * f, y: Y[lo] + (Y[hi] - Y[lo]) * f, z: Z[lo] + (Z[hi] - Z[lo]) * f, op: OP[hi], s: s0 + (SO[hi] - s0) * f, feed: FEEDS[hi], kind: KIND[hi] };
  }

  const moving = { g: [], c: [], z: [] };
  stage.querySelectorAll("[data-motion]").forEach((el) => moving[el.dataset.motion]?.push(el));
  const zonly = stage.querySelector("[data-zonly]");
  const holds = [...stage.querySelectorAll("[data-hold]")];
  const threads = [...stage.querySelectorAll("[data-thread]")];
  const ychain = stage.querySelector('[data-chain="y"]');
  const xchain = stage.querySelector('[data-chain="x"]');
  const cut = stage.querySelector("[data-cut]");
  const opGroups = [...stage.querySelectorAll("[data-op]")];
  const dashes = D.ops.map((_, i) => [...stage.querySelectorAll(`[data-dash="${i}"]`)]);
  const fresh = D.ops.map((_, i) => stage.querySelector(`[data-fresh="${i}"]`));
  const pool = stage.querySelector("[data-pool]");
  const leds = [...stage.querySelectorAll("[data-led]")];
  const ring = stage.querySelector(".cnc-leds");
  const mod = (v, m) => ((v % m) + m) % m;
  const tr = (v) => translateAlong(P, v);

  // Chains: a piece is rebuilt only while it rides the bend; on the runs it keeps its
  // shape and is translated, and the DOM is reordered only when the depth order changes.
  function chainLive(container, spec, F) {
    const cache = new Map();
    let order = "";
    return (um) => {
      const list = chainLinks(spec, um).map((piece) => {
        let c = cache.get(piece.id);
        if (!c) {
          c = { el: document.createElementNS("http://www.w3.org/2000/svg", "g"), ang: NaN, p0: [0, 0] };
          cache.set(piece.id, c);
        }
        if (!(Math.abs(piece.ang - c.ang) <= 1e-7)) {
          c.el.innerHTML = chainPieceSvg(KITF, G, P, F, piece);
          c.el.removeAttribute("transform");
          c.ang = piece.ang;
          c.p0 = piece.p0;
        } else {
          const du = piece.p0[0] - c.p0[0], dw = piece.p0[1] - c.p0[1];
          c.el.setAttribute("transform", tr([F.u[0] * du + F.v[0] * dw, F.u[1] * du + F.v[1] * dw, F.u[2] * du + F.v[2] * dw]));
        }
        const sm = (piece.s[0] + piece.s[1]) / 2;
        const ctr = [0, 1, 2].map((j) => F.o[j] + F.a[j] * sm + F.u[j] * piece.mid[0] + F.v[j] * piece.mid[1]);
        return { c, id: piece.id, key: ctr[0] * D.V[0] + ctr[1] * D.V[1] + ctr[2] * D.V[2] + (piece.kind === "plate" ? 1e4 : 0) };
      });
      list.sort((a, b) => a.key - b.key);
      const next = list.map((x) => x.id).join(",");
      if (next !== order) {
        if (!order) container.textContent = "";
        const frag = document.createDocumentFragment();
        for (const x of list) frag.appendChild(x.c.el);
        container.appendChild(frag);
        order = next;
      }
    };
  }
  const yLive = chainLive(ychain, D.ychain, D.ycf);
  const xLive = chainLive(xchain, D.xchain, D.xcf);

  let drawn = { y: NaN, x: NaN, z: NaN, op: NaN, s: NaN, fade: NaN };
  function place(st, fade) {
    const dx = st.x - TX0, dy = st.y - TY0, dz = st.z - TZ0;
    if (dy !== drawn.y) {
      const g = tr([0, dy, 0]);
      for (const el of moving.g) el.setAttribute("transform", g);
      yLive(yEnd(st.y));
    }
    if (dx !== drawn.x || dy !== drawn.y) {
      const c = tr([dx, dy, 0]);
      for (const el of moving.c) el.setAttribute("transform", c);
      xLive(xEnd(st.x));
    }
    if (dx !== drawn.x || dy !== drawn.y || dz !== drawn.z) {
      const zz = tr([dx, dy, dz]);
      for (const el of moving.z) el.setAttribute("transform", zz);
      zonly.setAttribute("transform", tr([0, 0, dz]));
    }
    for (const el of holds) el.setAttribute("transform", el.dataset.hold === "g" ? tr([0, -dy, 0]) : tr([-dx, 0, 0]));
    for (const el of threads) {
      const axis = el.dataset.thread;
      el.setAttribute("transform", tr(axis === "y" ? [0, mod(dy, D.pitch), 0] : axis === "x" ? [mod(dx, D.pitch), 0, 0] : [0, 0, mod(dz, D.pitch)]));
    }
    drawn.x = dx; drawn.y = dy; drawn.z = dz;
    // The cut, op by op.
    if (st.op !== drawn.op || st.s !== drawn.s) {
      D.ops.forEach((op, i) => {
        const s = i < st.op ? op.len : i === st.op ? Math.min(st.s, op.len) : 0;
        opGroups[i].style.display = s > 0.01 ? "" : "none";
        if (s > 0.01) {
          const dash = `${s.toFixed(2)} ${(op.len + 20).toFixed(0)}`;
          for (const el of dashes[i]) el.setAttribute("stroke-dasharray", dash);
          const tail = Math.min(s, 14);
          const on = i === st.op && st.kind > 0 && tail > 0.05;
          fresh[i].style.display = on ? "" : "none";
          if (on) {
            fresh[i].setAttribute("stroke-dasharray", `${tail.toFixed(2)} ${(op.len + 40).toFixed(0)}`);
            fresh[i].setAttribute("stroke-dashoffset", (tail - s).toFixed(2));
          }
        }
      });
      drawn.op = st.op; drawn.s = st.s;
    }
    if (fade !== drawn.fade) { cut.style.opacity = fade.toFixed(3); drawn.fade = fade; }
    pool.setAttribute("cx", st.x.toFixed(2));
    pool.setAttribute("cy", st.y.toFixed(2));
  }

  const fmt = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(1).padStart(4, " ");
  function say(st, t, phase) {
    let what;
    if (phase === "reset") what = "new stock";
    else if (st.kind === -1) what = phase === "pre" ? "spindle up" : "homed";
    else if (st.kind === -2) what = "done";
    else if (st.kind === 0) what = "rapid";
    else if (st.kind === 1) what = st.op === 0 ? "plunge" : "helix in";
    else what = D.ops[st.op].name.replace(" · detached dot", "");
    const pct = Math.round((Math.min(t, D.total) / D.total) * 100);
    const text = `X${fmt(st.x)} Y${fmt(-st.y)} Z${fmt(st.z - D.top)} · F${st.kind === 0 ? "max" : st.feed || 0} · ${what} · ${pct}%`;
    if (readout.textContent !== text) readout.textContent = text;
    // The accessible value changes with the operation, not every frame.
    const words = st.kind === -2 ? "finished mark" : st.op >= 0 && st.op < D.ops.length ? D.ops[st.op].name : "parked";
    if (words !== spoken) {
      spoken = words;
      stage.setAttribute("aria-valuenow", String(pct));
      stage.setAttribute("aria-valuetext", `${words}, ${pct}% of the job`);
    }
  }
  let spoken = "";

  // ---- Light: the LED ring's pool, the fresh groove's glow and hot chips (WebGL) ----
  const STOCK = D.stock, SPOIL = D.spoil;
  const stopsGlsl = D.chipStops.map(([t, c], i) => `STOPS[${i}]=vec4(${c.map((v) => v.toFixed(3)).join(",")},${t.toFixed(1)});`).join("");
  const FRAG = `
uniform vec4 uTool;
uniform vec4 uCutAt;
uniform vec4 uTrail[32];
uniform vec4 uChipA[${D.chips}];
uniform vec4 uChipB[${D.chips}];
uniform float uLight;
uniform float uRing;
const float TOP=${D.top.toFixed(1)};
const float SZ=${D.stockZ.toFixed(1)};
const vec4 STOCK=vec4(${STOCK.x.toFixed(1)},${STOCK.y.toFixed(1)},${(STOCK.x + STOCK.w).toFixed(1)},${(STOCK.y + STOCK.d).toFixed(1)});
const vec4 SPOIL=vec4(${SPOIL.x.toFixed(1)},${SPOIL.y.toFixed(1)},${(SPOIL.x + SPOIL.w).toFixed(1)},${(SPOIL.y + SPOIL.d).toFixed(1)});
const float TR=${D.toolR.toFixed(2)};
const float GRAV=9800.;
vec4 STOPS[${D.chipStops.length}];
float inRect(vec2 p,vec4 r,float s){return window(p.x,r.x,r.z,s)*window(p.y,r.y,r.w,s);}
float segD(vec2 p,vec2 a,vec2 b,out float t){vec2 ab=b-a;t=clamp(dot(p-a,ab)/max(dot(ab,ab),1e-6),0.,1.);return length(p-a-ab*t);}
vec3 chipHue(float T){vec3 c=STOPS[0].rgb;for(int i=1;i<${D.chipStops.length};i++){c=mix(c,STOPS[i].rgb,smoothstep(STOPS[i-1].w,STOPS[i].w,T));}return c;}
vec4 over(vec4 top,vec4 under){return top+under*(1.-top.a);}
float pool(vec3 s,vec3 L){vec3 d=L-s;float h=max(d.z,0.);float r2=dot(d.xy,d.xy);float c=h/sqrt(h*h+r2+1.);return c*c*c/(1.+(h*h+r2)/8100.);}
void main(){
  ${stopsGlsl}
  vec2 vb=viewOf(gl_FragCoord.xy);
  float px=pixelOf();
  float pxF=px/uCam.z;
  vec3 pTop=onFloor(vb,TOP);
  float near=length(pTop.xy-uTool.xy);
  if(near>230.){gl_FragColor=vec4(0.);return;}
  // What the pixel sees: the stock top, a stock face, or the spoilboard.
  float onTop=inRect(pTop.xy,STOCK,.7*pxF);
  vec3 fy=onWallY(vb,STOCK.w);
  vec3 fx=onWallX(vb,STOCK.z);
  float onFace=max(inRect(vec2(fy.x,fy.z),vec4(STOCK.x,SZ,STOCK.z,TOP),.7*px),inRect(vec2(fx.y,fx.z),vec4(STOCK.y,SZ,STOCK.w,TOP),.7*px));
  vec3 pSp=onFloor(vb,SZ);
  float onSp=(1.-onTop)*(1.-onFace)*inRect(pSp.xy,SPOIL,.7*pxF);
  // LED ring under the spindle: a pool on the stock and the spoilboard, the stock's shadow on the board.
  vec3 L=vec3(uTool.xy,uTool.z+30.5);
  vec3 cr=pSp+(L-pSp)*((TOP-SZ)/max(L.z-SZ,1.));
  float pen=18.*(TOP-SZ)/max(L.z-SZ,1.)+1.;
  float shadow=inRect(cr.xy,STOCK,pen*.5);
  float E=uRing*(onTop*pool(pTop,L)+onSp*(1.-shadow)*pool(pSp,L));
  // Fresh groove: seen through the opening at the top, lit on its floor and dimmer on the far wall.
  float glow=0.,halo=0.;
  if(near<78.)for(int i=0;i<31;i++){
    vec4 a=uTrail[i];vec4 b=uTrail[i+1];
    float h=min(a.z,b.z);
    if(h<.001)continue;
    float t;
    float dTop=segD(pTop.xy,a.xy,b.xy,t);
    float open=smoothstep(TR+.7*pxF,TR-.7*pxF,dTop);
    vec3 pf=onFloor(vb,TOP-a.w);
    float t2;
    float dF=segD(pf.xy,a.xy,b.xy,t2);
    float floorSeen=smoothstep(TR+.7*pxF,TR-.7*pxF,dF);
    glow=max(glow,mix(a.z,b.z,t2)*open*mix(.45,1.,floorSeen));
    halo=max(halo,mix(a.z,b.z,t)*exp(-pow(max(dTop-TR,0.)/2.6,2.)));
  }
  glow*=onTop;
  halo*=onTop;
  // The cutting zone: the chip–tool contact glows where the tool meets the steel.
  float dc=length(pTop.xy-uCutAt.xy);
  float eCut=uCutAt.z*onTop*(exp(-pow(dc/2.6,2.))+.42*exp(-pow(dc/7.,2.)));
  float Tcut=560.+720.*clamp(eCut,0.,1.);
  // Chips: thrown off the cutting edge, falling under gravity, cooling where they land.
  vec3 chipE=vec3(0.);
  vec4 chipInk=vec4(0.);
  float pxV=uView.x/uCanvas.x;
  if(near<118.)for(int i=0;i<${D.chips};i++){
    vec4 A=uChipA[i];vec4 B=uChipB[i];
    float age=A.w;
    if(age<0.||age>1.8)continue;
    float tf=min(age,B.w);
    vec3 p1=A.xyz+B.xyz*tf-vec3(0.,0.,.5*GRAV*tf*tf);
    float landed=smoothstep(B.w,B.w+.03,age);
    float t0=max(tf-.016*(1.-landed),0.);
    vec3 p0=A.xyz+B.xyz*t0-vec3(0.,0.,.5*GRAV*t0*t0);
    vec2 s1=project(p1);vec2 s0=project(p0);
    float tt;
    float d=segD(vb,s0,s1,tt);
    float w=max((.3+.5*pxV)*mix(1.,.75,landed),1.25*pxV);
    float core=exp(-d*d/(w*w));
    float T0=880.+380.*hash12(vec2(float(i),7.31));
    float T=380.+(T0-380.)*exp(-age/.46)-mix(140.,0.,tt)*step(age,B.w);
    float life=1.-smoothstep(1.35,1.8,age);
    float g=smoothstep(520.,760.,T);
    vec3 hue=chipHue(T);
    float hot=smoothstep(1050.,1250.,T)*step(age,.35);
    float ember=exp(-d*d/(9.*w*w))*landed*.35;
    chipE+=(core+ember)*life*g*(hue*(.9+2.2*smoothstep(700.,1150.,T))+vec3(.6,.55,.45)*hot);
    vec3 head=mix(hue,vec3(1.,.95,.86),.55*hot);
    vec4 ink=vec4(head,1.)*(.9*core*life*g);
    float tight=exp(-d*d/(.36*w*w));
    vec4 speck=vec4(vec3(.30,.29,.29),1.)*(.3*tight*life*(1.-g)*landed);
    chipInk=over(ink,over(speck,chipInk));
  }
  if(uLight<.5){
    vec3 c=vec3(.62,.72,.72)*E*.42+vec3(.22,.74,.76)*(glow*2.1+halo*.32)+vec3(.75,1.,1.)*smoothstep(.75,1.,glow)*.45+chipE
      +chipHue(Tcut)*eCut*(1.4+2.4*smoothstep(900.,1250.,Tcut));
    c=tonemap(c,1.25);
    float m=max(c.r,max(c.g,c.b));
    float n=(hash12(gl_FragCoord.xy+fract(uTime*.61)*91.)+hash12(gl_FragCoord.yx*1.37+fract(uTime*.37)*57.)-1.)/255.;
    c=max(c+n*smoothstep(0.,1.5/255.,m),0.);
    gl_FragColor=vec4(c,max(c.r,max(c.g,c.b)));
  }else{
    vec4 tint=vec4(vec3(.80,.93,.93),1.)*(.22*(1.-exp(-2.4*E)));
    float ac=.94*(1.-exp(-2.6*eCut));
    vec3 cutHue=mix(chipHue(Tcut),vec3(1.,.95,.82),.55*smoothstep(1050.,1260.,Tcut));
    vec4 cutInk=vec4(cutHue,1.)*ac;
    float e=1.-exp(-2.2*glow);
    vec3 teal=mix(vec3(.16,.53,.55),vec3(.78,.96,.95),smoothstep(.62,.95,e));
    vec4 tealInk=vec4(teal,1.)*(.93*e);
    vec4 ink=over(chipInk,over(cutInk,over(tealInk,tint)));
    ink.rgb=min(ink.rgb,vec3(ink.a));
    float n=(hash12(gl_FragCoord.xy+fract(uTime*.61)*91.)+hash12(gl_FragCoord.yx*1.37+fract(uTime*.37)*57.)-1.)/255.;
    ink=max(ink+n*smoothstep(0.,1.5/255.,ink.a),0.);
    ink.rgb=min(ink.rgb,vec3(ink.a));
    gl_FragColor=ink;
  }
}`;
  const glCanvas = stage.querySelector(".cnc-gl");
  const layer = typeof glLayer === "function" ? glLayer({ canvas: glCanvas, fragment: FRAG, view: [D.W, D.H], camera: glCamera(P), uniforms: ["uTool", "uCutAt", "uTrail", "uChipA", "uChipB", "uLight", "uRing"] }) : null;
  if (layer) stage.setAttribute("data-gl", "");
  const isLight = () => (host.getAttribute("data-theme") || "dark") === "light";
  const trail = new Float32Array(32 * 4);
  const chipA = new Float32Array(D.chips * 4);
  const chipB = new Float32Array(D.chips * 4);
  const chips = Array.from({ length: D.chips }, () => ({ age: -1, o: [0, 0, 0], v: [0, 0, 0], land: 0, T0: 900 }));
  for (let i = 0; i < D.chips; i++) chipA[i * 4 + 3] = -1;
  const ringEnv = { x: 0, v: 0 }, cutEnv = { x: 0, v: 0 };
  let emitDebt = 0, nextChip = 0, rng = 1;
  const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  const inStock = (x, y) => x > STOCK.x && x < STOCK.x + STOCK.w && y > STOCK.y && y < STOCK.y + STOCK.d;
  function emit(st, dir) {
    const c = chips[nextChip];
    nextChip = (nextChip + 1) % D.chips;
    // The edge leaves the cut on the front half of the tool; with the spindle turning
    // clockwise from above, the edge there moves along (sin φ, −cos φ).
    const phi = Math.atan2(dir[1], dir[0]) + (rand() - 0.5) * 2.8;
    const speed = 170 + 230 * rand();
    const up = 200 + 300 * rand();
    c.o = [st.x + D.toolR * Math.cos(phi), st.y + D.toolR * Math.sin(phi), D.top];
    c.v = [Math.sin(phi) * speed + Math.cos(phi) * 40 * rand(), -Math.cos(phi) * speed + Math.sin(phi) * 40 * rand(), up];
    const tTop = (2 * up) / 9800;
    const xl = c.o[0] + c.v[0] * tTop, yl = c.o[1] + c.v[1] * tTop;
    c.land = inStock(xl, yl) ? tTop : (up + Math.sqrt(up * up + 2 * 9800 * (D.top - D.stockZ))) / 9800;
    c.age = 0;
  }
  // Fallback chips (no WebGL): the same ink table, drawn as SVG dots.
  const chipDots = [...stage.querySelectorAll("[data-chips] circle")];
  const hueAt = (T) => {
    let c = D.chipStops[0][1];
    for (let i = 1; i < D.chipStops.length; i++) {
      const [t0] = D.chipStops[i - 1], [t1, c1] = D.chipStops[i];
      const u = Math.min(Math.max((T - t0) / (t1 - t0), 0), 1), w = u * u * (3 - 2 * u);
      c = c.map((v, j) => v + (c1[j] - v) * w);
    }
    return `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;
  };
  let lastShown = NaN;
  const cutAt = [0, 0];
  function light(st, t, dt, phase, calm) {
    const forward = !Number.isNaN(lastShown) && t > lastShown && t - lastShown < dt * D.speedup * 1.6 + 1e-6;
    lastShown = t;
    const cutting = st.kind >= 1 && st.z < D.top - 0.05 && phase !== "reset";
    settle(cutEnv, calm ? (st.kind >= 1 ? 1 : 0) : forward && cutting ? 1 : 0, dt, 0.18, calm);
    if (cutting) { cutAt[0] = st.x; cutAt[1] = st.y; }
    settle(ringEnv, phase === "reset" || st.kind === -1 && phase !== "pre" && t <= 0 ? 0 : 1, dt, 0.35, calm);
    // Trail: where the tool was over the last 0.45 s of display, its heat falling with age.
    const step = 0.11;
    for (let k = 0; k < 32; k++) {
      const tk = t - k * step;
      const s = stateAt(tk);
      const age = (k * step) / D.speedup;
      const cutK = tk > 0 && s.kind >= 1 && s.z < D.top - 0.05;
      trail[k * 4] = s.x;
      trail[k * 4 + 1] = s.y;
      trail[k * 4 + 2] = cutK ? Math.exp(-age / 0.16) * cutEnv.x : 0;
      trail[k * 4 + 3] = cutK ? D.top - Math.max(s.z, D.top - D.opDepth[Math.max(0, Math.min(s.op, D.opDepth.length - 1))]) : 2;
    }
    // Chips.
    if (!calm && cutEnv.x > 0.2 && cutting && forward) {
      const prev = stateAt(t - 0.05);
      const dir = [st.x - prev.x, st.y - prev.y];
      if (Math.hypot(dir[0], dir[1]) < 1e-3) { dir[0] = 1; dir[1] = 0; }
      emitDebt += dt * 22 * cutEnv.x;
      while (emitDebt >= 1) { emit(st, dir); emitDebt -= 1; }
    }
    chips.forEach((c, i) => {
      if (c.age >= 0) c.age += calm ? 0 : dt;
      if (c.age > 1.8) c.age = -1;
      chipA.set([c.o[0], c.o[1], c.o[2], c.age], i * 4);
      chipB.set([c.v[0], c.v[1], c.v[2], c.land], i * 4);
    });
    if (layer) {
      const active = ringEnv.x > 1e-3 || cutEnv.x > 1e-3 || chips.some((c) => c.age >= 0) || trail.some((v, j) => j % 4 === 2 && v > 1e-3);
      if (active) layer.draw({ uTool: [st.x, st.y, st.z, cutEnv.x], uCutAt: [cutAt[0], cutAt[1], cutEnv.x, 0], uTrail: trail, uChipA: chipA, uChipB: chipB, uLight: isLight() ? 1 : 0, uRing: ringEnv.x }, calm ? 0.8 : performance.now() / 1000);
      else layer.clear();
    } else {
      chips.forEach((c, i) => {
        const el = chipDots[i];
        if (c.age < 0) { el.setAttribute("r", "0"); return; }
        const tf = Math.min(c.age, c.land);
        const p = [c.o[0] + c.v[0] * tf, c.o[1] + c.v[1] * tf, c.o[2] + c.v[2] * tf - 4900 * tf * tf];
        const T = 380 + (980 - 380) * Math.exp(-c.age / 0.46);
        const q = iso(p, P);
        el.setAttribute("cx", q[0].toFixed(2));
        el.setAttribute("cy", q[1].toFixed(2));
        el.setAttribute("r", "0.7");
        const glowing = Math.min(Math.max((T - 520) / 240, 0), 1);
        el.setAttribute("fill", hueAt(Math.max(T, 520)));
        el.setAttribute("opacity", ((0.12 + 0.88 * glowing) * (1 - Math.min(Math.max((c.age - 1.35) / 0.45, 0), 1))).toFixed(2));
      });
    }
    return ringEnv.x > 1e-3 && Math.abs(ringEnv.v) > 1e-4 || cutEnv.x > 1e-3 || chips.some((c) => c.age >= 0);
  }

  let clock = 0, last = 0, frame = 0, visible = false, touring = !still.matches, idle = 0;
  let shown = 0, target = 0;
  const phaseOf = (c) => (c < PRE ? "pre" : c < PRE + JOB ? "job" : c < PRE + JOB + HOLD ? "hold" : "reset");
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    let phase = "job", fade = 1;
    if (touring) {
      clock = (clock + dt) % LOOP;
      phase = phaseOf(clock);
      target = Math.min(Math.max((clock - PRE) * D.speedup, 0), D.total);
      shown = target;
      if (phase === "reset") { const u = (clock - PRE - JOB - HOLD) / FADE; fade = 1 - u * u * (3 - 2 * u); }
    } else {
      shown = still.matches ? target : shown + (target - shown) * (1 - Math.exp(-dt / 0.22));
      if (Math.abs(target - shown) < 1e-3) shown = target;
    }
    const st = stateAt(shown);
    place(st, fade);
    say(st, shown, touring ? phase : "job");
    const glowing = light(st, shown, dt, touring ? phase : "job", still.matches);
    const running = shown > 0 && shown < D.total && phase !== "reset";
    leds.forEach((el, i) => el.toggleAttribute("data-on", i === 0 || (i === 1 && running && Math.floor(now / 400) % 2 === 0) || (i === 2 && running)));
    ring.toggleAttribute("data-on", running || phase === "pre");
    const settled = !touring && shown === target && !glowing;
    frame = visible && !settled ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
  const steer = (t) => {
    if (touring) { touring = false; target = shown; }
    target = Math.min(Math.max(t, 0), D.total);
    clearTimeout(idle);
    idle = setTimeout(() => { if (still.matches) return; touring = true; clock = PRE + shown / D.speedup; run(); }, 3600);
    run();
  };
  new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
  stage.addEventListener("pointermove", (event) => {
    const box = stage.getBoundingClientRect();
    const share = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    steer(share * D.total);
  });
  stage.addEventListener("keydown", (event) => {
    const now = touring ? shown : target;
    const starts = [...D.opStarts, D.total];
    if (event.key === "ArrowRight") { event.preventDefault(); steer(event.shiftKey ? now + 10 : starts.find((s) => s > now + 0.01) ?? D.total); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); steer(event.shiftKey ? now - 10 : [...starts].reverse().find((s) => s < now - 0.5) ?? 0); }
    else if (event.key === "Home") { event.preventDefault(); steer(0); }
    else if (event.key === "End") { event.preventDefault(); steer(D.total); }
    else if (event.key === " ") { event.preventDefault(); if (touring) steer(shown); else { touring = true; clock = PRE + shown / D.speedup; run(); } }
  });
  if (still.matches) { touring = false; target = D.total * 0.62; shown = target; }
  place(stateAt(shown), 1);
  if (still.matches) light(stateAt(shown), shown, 1 / 60, "job", true);
  addEventListener("resize", () => { if (!frame) light(stateAt(shown), shown, 0, "job", true); });
}

const latheSource = readFileSync(new URL(kitPath("kit/lathe.mjs")), "utf8").replace(/^import .*$/m, "").replace(/^export /gm, "");
const latheScript = `const G = (() => {${latheSource}\nreturn { viewOf, scaleOf, frameAlong, frameOf, pointOf, disc, prismOf, circleOf, arcOf, dot3, add3, sub3, mul3, unit3, cross3, lightOf, toneOf, hullOf };})();\n`;
const LIVE = `${latheScript}\nconst chainCurve = ${chainCurve.toString()};\nconst chainLinks = ${chainLinks.toString()};\nconst chainPieceSvg = ${chainPieceSvg.toString()};\nconst chainSvg = ${chainSvg.toString()};\n(${live.toString()})(${JSON.stringify(DATA)});\n`;

const CSS = `
.cnc-stage{position:relative;touch-action:pan-y;outline:none}
.cnc-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.cnc-stage>svg,.cnc-stage>canvas{display:block;width:100%;height:auto}
.cnc-stage>.cnc-layer{position:absolute;inset:0;height:100%!important;pointer-events:none}
.iso-figure{--cnc-rim:#8a8a8f;--cnc-wall:#a9a9a6;--cnc-floor:#d6d6d2;--cnc-fresh:#2d898b;--cnc-pool:#e9f4f4;--cnc-led:#26262a}
.iso:not([data-theme="light"]) .iso-figure{--cnc-rim:#5c5c5c;--cnc-wall:#0b0b0b;--cnc-floor:#141414;--cnc-fresh:#3fb3b5;--cnc-pool:#2b3536;--cnc-led:#ffffff}
.cnc-stroke{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:none!important}
.cnc-rim{stroke:var(--cnc-rim)}.cnc-wall{stroke:var(--cnc-wall)}.cnc-floor{stroke:var(--cnc-floor)}.cnc-fresh{stroke:var(--cnc-fresh);opacity:.85}
.cnc-pool-in{stop-color:var(--cnc-pool);stop-opacity:.9}.cnc-pool-out{stop-color:var(--cnc-pool);stop-opacity:0}
.iso[data-theme="light"] .cnc-pool{mix-blend-mode:multiply}
.cnc-stage[data-gl] .cnc-fresh,.cnc-stage[data-gl] .cnc-pool,.cnc-stage[data-gl] .cnc-chips{display:none}
.cnc-led circle{transition:opacity .25s}.cnc-led:not([data-on]) circle{opacity:.18}.cnc-led[data-on] circle{fill:var(--cnc-led)}
.cnc-leds circle{transition:opacity .4s}.cnc-leds:not([data-on]) circle{opacity:.2}.cnc-leds[data-on] circle{fill:var(--cnc-led)}
`;

const plate = () => k.plateHtml({
  fig: "Fig 3",
  title: "Mereka, milled",
  hint: "Hover to scrub the job · ← → step ops",
  readout: "X 0.0 Y 100.0 Z 27.0 · homed · 0%",
  keys: [
    { mark: "lit", label: "The end mill: Ø4 mm, two flutes, 18,000 rpm" },
    { mark: "raised", label: "Steel stock held by four step clamps on the spoilboard" },
    { mark: "edge", label: "Drag chains carry the cables to the gantry and the carriage" },
  ],
  caption: `The toolpath is the brand outline itself. The spindle traces the joined body at ${FEED.cut} mm/min, 2 mm deep, then helixes into each dot at ${FEED.helix} mm/min and spirals out at a ${STEPOVER} mm stepover to a 3 mm pocket, the detached dot last. ${Math.round(cutLength)} mm of cut, plunges at ${FEED.plunge} mm/min and rapids at ${FEED.rapid} mm/min make a ${Math.floor(realSeconds / 60)} min ${Math.round(realSeconds % 60)} s job, shown here ${SPEEDUP}× faster. Gantry, carriage and Z positions all come from that one program, and the lead screws turn to match. The LED ring lights the stock, the fresh groove glows for a moment behind the tool, and chips leave the clockwise cutting edge, arc under gravity and cool from yellow to dark where they land.`,
  body: `<div class="iso-stage cnc-stage" tabindex="0" role="slider" aria-label="CNC mill milling the Mereka logomark. Hover across the figure to scrub the job; left and right arrows step between operations, Shift with an arrow jogs ten seconds, Home and End jump to the start and the finished mark, Space pauses." aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${backSvg}<canvas class="cnc-layer cnc-gl" aria-hidden="true"></canvas>${frontSvg}</div>`,
});

if (!POSE) writePages({ dir: HERE, slug: "cnc-mill", title: "Mereka CNC Mill", body: plate, script: kitScript() + glScript() + LIVE, css: CSS });
console.log(`${R.items.length} items · ${R.solids.length} solids · ${CABLES.length} cables · job ${realSeconds.toFixed(1)} s real · ${cutLength.toFixed(0)} mm cut · scale ${KS.toFixed(3)}`);
A.auditOrExit(R, P, { cover: ["yscrewR", "yscrewL", "xscrew"] });
