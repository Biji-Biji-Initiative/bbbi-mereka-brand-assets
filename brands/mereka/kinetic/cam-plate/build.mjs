// Fig 1 · Cam plate: the Mereka logomark as a kinetic desk sculpture.
// Build: node brands/mereka/kinetic/cam-plate/build.mjs
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { k, kitScript, logo, FREE, writePages, concavePrism as prism } from "../shared.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDTH = 600;
const HEIGHT = 420;

const L0 = logo({ scale: 0.5 });
const BODY = L0.body;
const DOT_R = L0.dotR;
const NODES = L0.dots;

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

const concavePrism = (ring, z, h, options) => prism(P, ring, z, h, options);

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

const plate = () => k.plateHtml({
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
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Mereka kinetic logo: arrow keys turn the crank 15 degrees" aria-valuemin="0" aria-valuemax="359" aria-valuenow="${Math.round(START * 360)}">${svg}</div>`,
});

writePages({ dir: HERE, slug: "cam-plate", title: "Mereka Cam Plate", body: plate, script: kitScript() + live });
