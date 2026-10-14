// Shared pieces for the kinetic Mereka figures, built with the Anatomy skill kit
// (https://github.com/wheresryan22/anatomy), found at $ANATOMY_HOME or
// ~/.claude/skills/anatomy.
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ANATOMY = process.env.ANATOMY_HOME || join(homedir(), ".claude/skills/anatomy");
const load = (file) => import(pathToFileURL(join(ANATOMY, file)).href);
export const k = await load("kit/iso-kit.mjs");
export const { kitScript, glScript } = await load("scripts/inline-kit.mjs");
export const kitPath = (file) => pathToFileURL(join(ANATOMY, file)).href;

// ---- The logomark -----------------------------------------------------------
// The joined body's outline comes straight from the brand SVG, never redrawn.
// The four dots are its four circles (r = 64.14 in logo units).
export const LOGO_PATH = readFileSync(join(HERE, "../logos/svg/mereka-logomark-black.svg"), "utf8").match(/<path d="([^"]+)"/)[1];
export const LOGO_W = 427.76;
export const LOGO_H = 342.13;
export const LOGO_DOT_R = 64.14;
// Order used everywhere: bottom-left, top-left, top-right, then the detached dot.
export const LOGO_DOTS = [
  [64.28, 277.98],
  [64.14, 64.14],
  [363.33, 64.14],
  [363.62, 277.69],
];
export const FREE = 3;

// Flatten the SVG path (M, L, H, V, C, S, Z, absolute or relative) to logo-unit points.
export function flatten(d, perCurve = 10) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const out = [];
  let i = 0, cmd = "", cur = [0, 0], start = [0, 0], ctrl = null;
  const num = () => parseFloat(tokens[i++]);
  const cubic = (p0, p1, p2, p3) => {
    for (let s = 1; s <= perCurve; s++) {
      const t = s / perCurve, m = 1 - t;
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
  return out;
}

// Even spacing along a closed outline keeps wall facing from flickering on tiny kinks.
export function resample(ring, gap) {
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

// The logomark in world units, centred on `center`, `scale` world units per logo unit.
// body: the joined body's outline (closed, evenly spaced every `gap` world units).
// dots: the four dot centres; dotR: their radius; toWorld: logo units -> world floor.
// The logo's x runs along world +x and its y (down the page) along world +y.
export function logo({ scale = 0.5, center = [0, 0], gap = 1.6 } = {}) {
  const toWorld = ([u, v]) => [(u - LOGO_W / 2) * scale + center[0], (v - LOGO_H / 2) * scale + center[1]];
  const raw = flatten(LOGO_PATH).map(toWorld);
  const ring = [];
  for (const p of raw) {
    const last = ring[ring.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > gap * 0.5) ring.push(p);
  }
  if (Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < gap * 0.5) ring.pop();
  return { body: resample(ring, gap), dots: LOGO_DOTS.map(toWorld), dotR: LOGO_DOT_R * scale, toWorld, scale };
}

// Is a 2D point inside a polygon (even-odd)?
export function inside([px, py], poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
// Is a world floor point inside the full logomark (joined body or any dot)?
export const inLogo = (p, L) => inside(p, L.body) || L.dots.some(([x, y]) => Math.hypot(p[0] - x, p[1] - y) <= L.dotR);
// Signed distance (negative inside) from a floor point to the full logomark's edge.
export function logoDistance(p, L) {
  let best = Infinity;
  const ring = L.body;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
  }
  if (inside(p, ring)) return -best;
  // The detached dot is the only part outside the joined body's outline.
  const free = L.dots[FREE];
  const toFree = Math.hypot(p[0] - free[0], p[1] - free[1]) - L.dotR;
  return Math.min(best, toFree);
}

// ---- Drawing ----------------------------------------------------------------
export const pathOf = (pts, closed) => "M" + pts.map(([x, y]) => x.toFixed(1) + " " + y.toFixed(1)).join("L") + (closed ? "Z" : "");

// A concave prism (the joined body). extrude() paints wall shades in tone buckets
// rather than by depth, so on a concave outline walls can cover one another the
// wrong way round. A prism's own top face is always nearer than any of its walls,
// so: front-facing wall quads far to near, then every bottom and vertical edge,
// then the top face (which hides whatever of those lies behind it), then the rim.
export function concavePrism(P, ring, z, h, { tone = "hi", crease = "lo", inner = "", bevel = 0.8, lit = false } = {}) {
  const kit = k.extrude(ring, z, h, P, { convex: false, bevel });
  const at = (p) => k.iso(p, P);
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
    const light = (nx * -sinA + ny * cosA + 1) / 2;
    const shade = Math.min(3, Math.max(0, Math.floor(light * 4)));
    const mid = [(ring[i][0] + ring[j][0]) / 2, (ring[i][1] + ring[j][1]) / 2, z];
    walls.push({ key: k.depthOf(mid, P), d: pathOf([top[i], top[j], bottom[j], bottom[i]], true), shade });
  }
  walls.sort((a, b) => a.key - b.key);
  const r1 = (v) => String(Math.round(v * 10) / 10);
  const topKeys = new Set(top.map(([x, y]) => r1(x) + " " + r1(y)));
  const below = [], rim = [];
  for (const sub of kit.outline.match(/M[^M]+/g) || []) {
    const pts = sub.slice(1).split("L");
    const first = pts[0].trim().replace(",", " ");
    const vertical = pts.length === 2 && Math.abs(parseFloat(pts[0]) - parseFloat(pts[1])) < 0.15;
    (vertical || !topKeys.has(first) ? below : rim).push(sub);
  }
  return `<g class="iso-solid" data-seamless=""${lit ? ' data-lit=""' : ""}>${walls.map((w) => `<path class="iso-shade" data-shade="${w.shade}" d="${w.d}"/>`).join("")}${inner}<path class="iso-line iso-edge" data-tone="${tone}" d="${below.join("")}"/><path class="iso-top" d="${kit.top}"/><path class="iso-line iso-crease" data-tone="${crease}" d="${kit.crease}"/>${kit.bevel ? `<path class="iso-line iso-bevel" data-tone="${crease}" d="${kit.bevel}"/>` : ""}<path class="iso-line iso-edge" data-tone="${tone}" d="${rim.join("")}"/></g>`;
}

// ---- Brand ------------------------------------------------------------------
// Mereka primary colours from guides/brand-guidelines.md.
export const BRAND = { teal: "#2d898b", magenta: "#ab3b78", blue: "#295cad" };
// The one lit part wears Mereka teal. Add more rules through `css` in writePages.
export const BRAND_CSS = `
.iso-figure{--anatomy-lit-top:#2d898b;--anatomy-lit-shade:#226a6c;--anatomy-lit:#9fdcdd}
.iso[data-theme="light"] .iso-figure{--anatomy-lit-top:#2d898b;--anatomy-lit-shade:#257375;--anatomy-lit:#164f50}
`;

// ---- Pages ------------------------------------------------------------------
// Writes <slug>.html (dark), <slug>-light.html and <slug>-artifact.html (follows the
// viewer's theme; written as page content without <html>/<body> for a claude.ai
// Artifact) into `dir`. `body(theme)` returns the plate HTML (from k.plateHtml);
// `script` is the module source to inline (kitScript() + live, plus glScript() for
// shaders). Live code that needs the theme reads document.querySelector(".iso").dataset.theme
// for the artifact page, where it can change while the page is open.
export function writePages({ dir, slug, title, body, script, css = "" }) {
  const style = `<style>${BRAND_CSS}${css}</style>`;
  for (const theme of ["dark", "light"]) {
    const name = theme === "light" ? `${slug}-light.html` : `${slug}.html`;
    writeFileSync(join(dir, name), k.pageHtml({ title, theme, body: style + body(theme), script }));
  }
  const follow = `
{ const root = document.documentElement, host = document.querySelector("main.iso"), dark = matchMedia("(prefers-color-scheme: dark)");
  const pickTheme = () => host.setAttribute("data-theme", root.dataset.theme || (dark.matches ? "dark" : "light"));
  pickTheme(); dark.addEventListener("change", pickTheme);
  new MutationObserver(pickTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] }); }
`;
  const page = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{--page:#f2f2ef;color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--page:#0b0b0b;color-scheme:dark}}
:root[data-theme="dark"]{--page:#0b0b0b;color-scheme:dark}
body{background:var(--page);margin:0;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
${k.ISO_CSS}
.iso-page{background:var(--anatomy-page);color:var(--anatomy-text);width:min(650px,100%);margin:0 auto;padding-block:48px 72px}
${BRAND_CSS}${css}
</style>
<main class="iso iso-page" data-theme="light">${body("light")}</main>
<script type="module">${(follow + script).replace(/<\/(script)/gi, "<\\/$1")}</script>`;
  writeFileSync(join(dir, `${slug}-artifact.html`), page);
  console.log(`wrote ${slug}.html, ${slug}-light.html, ${slug}-artifact.html`);
}
