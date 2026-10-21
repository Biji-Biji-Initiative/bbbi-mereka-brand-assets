#!/usr/bin/env node
// Checks for @mereka/sign-in. No dependencies: `node packages/sign-in/scripts/check.mjs`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CANONICAL_MARK, LABELS, PKG_DIR, VERSION, generate, readCanonicalMark } from "./build.mjs";

// bbi-infrastructure docs/AUTH_REGISTRY.yaml sso_display_policy.accepted_button_text
const ACCEPTED = ["Sign in with Mereka", "Continue with Mereka", "Login with Mereka"];

let failures = 0;
const ok = (msg) => console.log(`ok   ${msg}`);
const fail = (msg) => {
  failures++;
  console.log(`FAIL ${msg}`);
};
const read = (rel) => readFileSync(join(PKG_DIR, rel), "utf8");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return [relative(PKG_DIR, p)];
  });
}
const sources = walk(PKG_DIR).filter((f) => /\.(css|scss|js|mjs|ts|tsx|json|html|svg)$/.test(f));

// 1. The mark matches the canonical logomark, and every generated file is current.
{
  const canonical = readFileSync(CANONICAL_MARK, "utf8");
  const m = readCanonicalMark();
  const markSvg = read("mark.svg");
  const markTs = read("mark.ts");
  const { cx, cy, r } = m.circle;
  if (!canonical.includes(`d="${m.path}"`)) fail("could not read the canonical path");
  else if (
    markSvg.includes(`d="${m.path}"`) &&
    markSvg.includes(`viewBox="${m.viewBox}"`) &&
    markSvg.includes(`<circle cx="${cx}" cy="${cy}" r="${r}"/>`) &&
    markTs.includes(`"${m.path}"`) &&
    markTs.includes(`{ cx: ${cx}, cy: ${cy}, r: ${r} }`)
  )
    ok(`mark.svg and mark.ts match ${relative(join(PKG_DIR, "../.."), CANONICAL_MARK)}`);
  else fail("mark.svg / mark.ts drifted from the canonical logomark");

  const stale = Object.entries(generate()).filter(([file, content]) => {
    try {
      return read(file) !== content;
    } catch {
      return true;
    }
  });
  if (stale.length) fail(`out of date (run node scripts/build.mjs): ${stale.map(([f]) => f).join(", ")}`);
  else ok("generated mark blocks, mark files and registry items are current");
}

// 2. Labels: the kit's set is exactly the accepted set; no user-facing text names Authentik.
{
  const kit = Object.values(LABELS);
  const extra = kit.filter((l) => !ACCEPTED.includes(l));
  const missing = ACCEPTED.filter((l) => !kit.includes(l));
  if (extra.length || missing.length) fail(`label set mismatch: extra ${JSON.stringify(extra)} missing ${JSON.stringify(missing)}`);
  else ok(`labels are the accepted set: ${kit.join(" | ")}`);

  const phrase = /\b(?:sign(?:ed)?[ -]?in|sign[ -]?up|log[ -]?in|continue)\s+(?:with|using|via)\s+["']?([A-Za-z]+)/gi;
  const offenders = [];
  for (const file of sources.filter((f) => !f.startsWith("scripts/"))) {
    for (const match of read(file).matchAll(phrase)) {
      const text = match[0].replace(/["']/g, "");
      if (/authentik/i.test(match[1])) offenders.push(`${file}: "${text}"`);
      else if (!/^mereka$/i.test(match[1])) offenders.push(`${file}: unexpected provider in "${text}"`);
      else if (!ACCEPTED.some((a) => a.toLowerCase() === text.toLowerCase())) offenders.push(`${file}: "${text}" is not an accepted label`);
    }
  }
  if (offenders.length) offenders.forEach((o) => fail(o));
  else ok(`no source file has a label outside the accepted set or naming Authentik (${sources.length} files scanned)`);

  const guards = ["sign-in-with-mereka.js", "react/SignInWithMereka.tsx", "react-native/SignInWithMereka.tsx"];
  const unguarded = guards.filter((f) => !read(f).includes("/authentik/i.test("));
  if (unguarded.length) fail(`free-text label guard missing in ${unguarded.join(", ")}`);
  else ok("free-text labels are refused when they name Authentik (custom element, React, React Native)");
}

// 3. The CSS defines every class the README documents.
{
  const css = read("sign-in-with-mereka.css");
  const readme = read("README.md");
  const documented = [...new Set(readme.match(/\bmereka-signin(?:--|__)[a-z]+\b/g) ?? [])];
  const required = ["dark", "light", "brand", "auto", "sm", "md", "lg", "rect", "pill", "full"].map((v) => `mereka-signin--${v}`);
  const all = [...new Set(["mereka-signin", ...required, ...documented])];
  const undefinedClasses = all.filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(css));
  if (undefinedClasses.length) fail(`CSS is missing ${undefinedClasses.join(", ")}`);
  else ok(`CSS defines all ${all.length} documented classes`);

  const vars = ["bg", "fg", "border", "radius", "font", "ring", "height", "font-size", "mark-size"].map((v) => `--mereka-signin-${v}`);
  const unusedVars = vars.filter((v) => !css.includes(`var(${v}`));
  const undocumented = vars.filter((v) => !readme.includes(v));
  if (unusedVars.length || undocumented.length) fail(`custom properties unused ${unusedVars} / undocumented ${undocumented}`);
  else ok(`CSS honours and README documents ${vars.length} theming properties`);
}

// 4. Version stamps agree with package.json.
{
  const registry = ["registry/sign-in-with-mereka.json", "registry/sign-in-with-mereka-native.json"].map((f) => JSON.parse(read(f)));
  const stamps = registry.every((r) => r.meta.version === VERSION && r.files.every((f) => f.content.includes(`@mereka/sign-in v${VERSION}`)));
  if (stamps) ok(`registry items are stamped v${VERSION}`);
  else fail("registry version stamps disagree with package.json");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
