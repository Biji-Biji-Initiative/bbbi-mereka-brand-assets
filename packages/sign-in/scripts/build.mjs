#!/usr/bin/env node
// Regenerates everything derived from the canonical logomark and the label set:
// mark.svg, mark.ts, the <sign-in:generated> blocks inside the hand-written
// sources, and the shadcn registry items. `node scripts/check.mjs` fails when
// any of these differ from what this script would write.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = join(PKG_DIR, "..", "..");
export const CANONICAL_MARK = join(REPO_DIR, "brands/mereka/logos/svg/mereka-logomark-black.svg");

// Mirrors bbi-infrastructure docs/AUTH_REGISTRY.yaml sso_display_policy.accepted_button_text.
export const LABELS = {
  signin: "Sign in with Mereka",
  continue: "Continue with Mereka",
  login: "Login with Mereka",
};

const read = (rel) => readFileSync(join(PKG_DIR, rel), "utf8");
export const VERSION = JSON.parse(read("package.json")).version;
export const TAG = `sign-in-v${VERSION}`;
export const CDN = `https://cdn.jsdelivr.net/gh/Biji-Biji-Initiative/bbbi-mereka-brand-assets@${TAG}/packages/sign-in`;

export function readCanonicalMark() {
  const svg = readFileSync(CANONICAL_MARK, "utf8");
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
  const c = svg.match(/<circle[^>]*\bcx="([^"]+)"[^>]*\bcy="([^"]+)"[^>]*\br="([^"]+)"/);
  const d = svg.match(/<path[^>]*\bd="([^"]+)"/)[1];
  const [, , width, height] = viewBox.split(/\s+/).map(Number);
  return { viewBox, width, height, circle: { cx: Number(c[1]), cy: Number(c[2]), r: Number(c[3]) }, path: d };
}

function markSvg(m, attrs = "") {
  const { cx, cy, r } = m.circle;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m.viewBox}" fill="currentColor"${attrs}><circle cx="${cx}" cy="${cy}" r="${r}"/><path d="${m.path}"/></svg>`;
}

function dataUri(svg) {
  const s = svg.replace(/"/g, "'").replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E");
  return `data:image/svg+xml,${s}`;
}

function tsBlock(m, native = false) {
  return [
    `export const SIGN_IN_VERSION = "${VERSION}";`,
    `export const SIGN_IN_LABELS = ${JSON.stringify(LABELS, null, 2).replace(/"(\w+)":/g, "$1:")} as const;`,
    `const MARK_VIEW_BOX = "${m.viewBox}";`,
    ...(native ? [`const MARK_ASPECT = ${m.width} / ${m.height};`] : []),
    `const MARK_CIRCLE = { cx: ${m.circle.cx}, cy: ${m.circle.cy}, r: ${m.circle.r} } as const;`,
    `const MARK_PATH =\n  "${m.path}";`,
  ];
}

// Generated block content per file, keyed by package-relative path.
function blocks(m) {
  return {
    "sign-in-with-mereka.js": [
      `  var VERSION = "${VERSION}";`,
      `  var LABELS = ${JSON.stringify(LABELS)};`,
      `  var MARK_SVG = '${markSvg(m, ' class="mereka-signin__mark" aria-hidden="true" focusable="false"')}';`,
    ],
    "react/SignInWithMereka.tsx": tsBlock(m),
    "react-native/SignInWithMereka.tsx": tsBlock(m, true),
    "openedx/_mereka-signin.scss": [`$mereka-signin-mark: url("${dataUri(markSvg(m).replace(' fill="currentColor"', ""))}") !default;`],
    "preview.html": [`      ${markSvg(m, ' class="mereka-signin__mark" aria-hidden="true" focusable="false"')}`],
  };
}

const START = "<sign-in:generated>";
const END = "</sign-in:generated>";

function replaceBlock(src, lines, file) {
  const out = [];
  const input = src.split("\n");
  let i = 0;
  let found = 0;
  while (i < input.length) {
    out.push(input[i]);
    if (input[i].includes(START)) {
      found++;
      out.push(...lines);
      while (i < input.length && !input[i].includes(END)) i++;
      if (i === input.length) throw new Error(`${file}: unterminated ${START}`);
      continue;
    }
    i++;
  }
  if (!found) throw new Error(`${file}: missing ${START} block`);
  return out.join("\n");
}

const stamp = (file, comment) =>
  comment === "css"
    ? `/* @mereka/sign-in v${VERSION} (${TAG}) - copied from ${CDN}/${file}. Upgrade by re-running the shadcn add with a newer tag. */\n`
    : `// @mereka/sign-in v${VERSION} (${TAG}) - copied from ${CDN}/${file}. Upgrade by re-running the shadcn add with a newer tag.\n`;

// shadcn drops a comment that precedes the first import, so the stamp goes after the imports.
const stampBeforeBlock = (src, file) => src.replace(/^(\/\/ <sign-in:generated>)/m, `${stamp(file)}$1`);

function registryItem(name, title, description, dependencies, files) {
  return JSON.stringify(
    {
      $schema: "https://ui.shadcn.com/schema/registry-item.json",
      name,
      type: "registry:component",
      title,
      description,
      dependencies,
      files: files.map(({ path, target, type, content }) => ({ path, type, target, content })),
      meta: { version: VERSION, tag: TAG, source: `${CDN}/` },
    },
    null,
    2,
  ) + "\n";
}

export function generate() {
  const m = readCanonicalMark();
  const files = {};
  files["mark.svg"] = markSvg(m) + "\n";
  files["mark.ts"] = [
    "// Generated by scripts/build.mjs from brands/mereka/logos/svg/mereka-logomark-black.svg. Do not edit.",
    `export const MARK_VIEW_BOX = "${m.viewBox}";`,
    `export const MARK_WIDTH = ${m.width};`,
    `export const MARK_HEIGHT = ${m.height};`,
    `export const MARK_CIRCLE = { cx: ${m.circle.cx}, cy: ${m.circle.cy}, r: ${m.circle.r} } as const;`,
    `export const MARK_PATH =\n  "${m.path}";`,
    `export const MARK_SVG =\n  '${markSvg(m)}';`,
    "",
  ].join("\n");
  for (const [file, lines] of Object.entries(blocks(m))) files[file] = replaceBlock(read(file), lines, file);

  const css = read("sign-in-with-mereka.css");
  const web = files["react/SignInWithMereka.tsx"];
  const submit = read("react/SignInWithMerekaSubmit.tsx");
  files["registry/sign-in-with-mereka.json"] = registryItem(
    "sign-in-with-mereka",
    "Sign in with Mereka",
    "The standard Sign in with Mereka button (React). Renders a <button> or <a>; your app keeps its own auth call.",
    [],
    [
      {
        path: "packages/sign-in/react/SignInWithMereka.tsx",
        target: "components/mereka/sign-in-with-mereka.tsx",
        type: "registry:component",
        content: stampBeforeBlock(web, "react/SignInWithMereka.tsx").replace('"../sign-in-with-mereka.css"', '"./sign-in-with-mereka.css"'),
      },
      {
        path: "packages/sign-in/react/SignInWithMerekaSubmit.tsx",
        target: "components/mereka/sign-in-with-mereka-submit.tsx",
        type: "registry:component",
        content: submit.replace(/^("use client";\n)/, `$1${stamp("react/SignInWithMerekaSubmit.tsx")}`).replace('"./SignInWithMereka"', '"./sign-in-with-mereka"'),
      },
      {
        path: "packages/sign-in/sign-in-with-mereka.css",
        target: "components/mereka/sign-in-with-mereka.css",
        type: "registry:file",
        content: stamp("sign-in-with-mereka.css", "css") + css,
      },
    ],
  );
  files["registry/sign-in-with-mereka-native.json"] = registryItem(
    "sign-in-with-mereka-native",
    "Sign in with Mereka (React Native)",
    "The standard Sign in with Mereka button for Expo / React Native (Pressable + react-native-svg; install it with `npx expo install react-native-svg`).",
    // No dependencies entry: shadcn would npm-install an unpinned react-native-svg; Expo apps need the SDK-matched one.
    [],
    [
      {
        path: "packages/sign-in/react-native/SignInWithMereka.tsx",
        target: "components/mereka/sign-in-with-mereka.tsx",
        type: "registry:component",
        content: stampBeforeBlock(files["react-native/SignInWithMereka.tsx"], "react-native/SignInWithMereka.tsx"),
      },
    ],
  );
  return files;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = generate();
  let changed = 0;
  for (const [file, content] of Object.entries(files)) {
    let current = null;
    try {
      current = read(file);
    } catch {}
    if (current !== content) {
      writeFileSync(join(PKG_DIR, file), content);
      changed++;
      console.log(`wrote ${file}`);
    }
  }
  console.log(changed ? `${changed} file(s) regenerated` : "up to date");
}
