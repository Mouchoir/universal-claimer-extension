/**
 * Enforce the store field limits before a package is ever built.
 *
 * `web-ext lint` does not catch these: they are Chrome Web Store rules, not Firefox ones, so a
 * manifest that lints clean can still be rejected at upload — which costs a round trip with a
 * dashboard rather than a failed command. This is that round trip, moved into the repository.
 *
 * The limits applied are the strictest of the two stores, so one manifest satisfies both.
 *
 * Usage: node scripts/check-manifest.mjs
 */
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));

/** [field, max, why] — `why` names the store whose limit is the binding one. */
const LIMITS = [
  ["name", 45, "Chrome Web Store"],
  ["description", 132, "Chrome Web Store"],
];

const problems = [];

for (const [field, max, store] of LIMITS) {
  const value = manifest[field];
  if (typeof value !== "string" || value.length === 0) {
    problems.push(`manifest.${field} is missing`);
    continue;
  }
  if (value.length > max) {
    problems.push(
      `manifest.${field} is ${value.length} characters; ${store} allows ${max}.\n` +
        `    ${value}`,
    );
  }
}

// Both stores reject a listing with no 128px icon, and a browser with no icons at all falls back
// to a generic puzzle piece — which looks like a broken install.
for (const size of ["16", "48", "128"]) {
  if (!manifest.icons?.[size]) problems.push(`manifest.icons["${size}"] is missing`);
}

if (problems.length > 0) {
  console.error("Manifest is not publishable:\n");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `OK: name ${manifest.name.length}/45, description ${manifest.description.length}/132, icons present`,
);
