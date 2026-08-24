#!/usr/bin/env node
/**
 * Offline tests: PR #72 HGTTG species artwork filename parity.
 * Pack `_source` references hyphenated lowercase module paths; filesystem assets
 * must exist under the PR #72 corrected names (Windows FS is case-insensitive).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPECIES = path.join(ROOT, "icons/packs/Species");

/** PR #72 renamed assets (exact tracked filenames). */
const PR72_FILES = [
	"H-nemthe.webp",
	"Ishi-Tib.webp",
	"Ruurian-Larvae.webp",
	"S-kytri.webp",
	"Swokes-Swokes.webp",
	"Yam-rii.webp"
];

/** Obsolete pre-PR72 names must not remain tracked on disk as primary assets. */
const OBSOLETE = [
	"H'nemthe.webp",
	"Ishi Tib.webp",
	"Ruurian.webp",
	"S'kytri.webp",
	"Swokes Swokes.webp",
	"Yam'rii.webp"
];

/** Pack `_source` img path basenames (lowercase). */
const PACK_BASENAMES = [
	"h-nemthe.webp",
	"ishi-tib.webp",
	"ruurian-larvae.webp",
	"s-kytri.webp",
	"swokes-swokes.webp",
	"yam-rii.webp"
];

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

test("PR #72 corrected species webp files exist", () => {
	for ( const name of PR72_FILES ) {
		assert.equal(fs.existsSync(path.join(SPECIES, name)), true, `missing ${name}`);
	}
});

test("obsolete apostrophe/space species filenames are gone", () => {
	for ( const name of OBSOLETE ) {
		assert.equal(fs.existsSync(path.join(SPECIES, name)), false, `obsolete still present: ${name}`);
	}
});

test("pack-referenced lowercase basenames resolve on disk (Windows casefold)", () => {
	for ( const name of PACK_BASENAMES ) {
		assert.equal(fs.existsSync(path.join(SPECIES, name)), true, `pack path unresolved: ${name}`);
	}
});

test("hgttgspecies pack source img paths use hyphenated Species/*.webp", () => {
	const files = [
		["hnemthe.yml", "h-nemthe.webp"],
		["ishi-tib.yml", "ishi-tib.webp"],
		["ruurian-larvae.yml", "ruurian-larvae.webp"],
		["skytri.yml", "s-kytri.webp"],
		["swokes-swokes.yml", "swokes-swokes.webp"],
		["yamrii.yml", "yam-rii.webp"]
	];
	for ( const [yml, base] of files ) {
		const text = fs.readFileSync(path.join(ROOT, "packs/_source/hgttgspecies", yml), "utf8");
		const m = text.match(/^img:\s*(.+)$/m);
		assert.ok(m, `img missing in ${yml}`);
		assert.match(m[1], new RegExp(`icons/packs/Species/${base.replace(".", "\\.")}$`));
	}
});

console.log(`\n${passed} passed`);
