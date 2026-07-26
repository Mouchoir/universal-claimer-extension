/**
 * Guard for the release pipeline: the published artifact must be exactly what the tag points at.
 * Rather than rewriting manifest.json during the build (which would mean the store binary was
 * assembled by CI rather than taken from the source), this fails the release when the tag and the
 * committed manifest version disagree.
 *
 * Usage: node scripts/check-version.mjs v1.2.3
 */
import { readFileSync } from "node:fs";

const tag = (process.argv[2] ?? "").trim();
if (!tag) {
  console.error("usage: check-version.mjs <tag>   (e.g. v0.1.0)");
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));
const expected = tag.replace(/^v/, "");

if (manifest.version !== expected) {
  console.error(
    `Version mismatch: tag ${tag} implies ${expected}, but src/manifest.json says ${manifest.version}.\n` +
      "Bump the manifest, commit it, and tag that commit — the store build must match the source.",
  );
  process.exit(1);
}
console.log(`OK: manifest version ${manifest.version} matches tag ${tag}`);
