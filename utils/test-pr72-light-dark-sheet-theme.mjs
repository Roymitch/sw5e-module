#!/usr/bin/env node
/**
 * Offline tests: PR #72 light/dark sheet theme parity (P8-PR72-THEME-01).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_LESS = fs.readFileSync(path.join(ROOT, "styles/less/module.less"), "utf8");
const LIGHT = fs.readFileSync(path.join(ROOT, "styles/less/variables/light.less"), "utf8");
const DARK = fs.readFileSync(path.join(ROOT, "styles/less/variables/dark.less"), "utf8");
const LEGACY = fs.readFileSync(path.join(ROOT, "styles/module.legacy.css"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "styles/module.css"), "utf8");
const SABER = path.join(ROOT, "styles/dual_color_saber3.jpeg");
const PAUSE_LESS = fs.readFileSync(
	path.join(ROOT, "styles/less/update/components/pause-overlay.less"),
	"utf8"
);

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

test("light and dark variable Less files exist and are imported", () => {
	assert.match(MODULE_LESS, /variables\/light\.less/);
	assert.match(MODULE_LESS, /variables\/dark\.less/);
	assert.match(MODULE_LESS, /@layer variables/);
	assert.match(LIGHT, /@scope \(\.theme-light\) to \(\.themed\)/);
	assert.match(DARK, /@scope \(\.theme-dark\) to \(\.themed\)/);
});

test("saber branding asset exists", () => {
	assert.equal(fs.existsSync(SABER), true);
});

test("light theme maps SW5e saber into DND5e header variables", () => {
	assert.match(LIGHT, /--dnd5e-character-header-image:\s*url\("\/modules\/sw5e-module\/styles\/dual_color_saber3\.jpeg"\)/);
	assert.match(LIGHT, /--dnd5e-item-header-image:\s*url\("\/modules\/sw5e-module\/styles\/dual_color_saber3\.jpeg"\)/);
	assert.match(LIGHT, /--dnd5e-npc-header-image:\s*url\("\/modules\/sw5e-module\/styles\/dual_color_saber3\.jpeg"\)/);
	assert.match(LIGHT, /--dnd5e-vehicle-header-image:\s*url\("\/modules\/sw5e-module\/styles\/dual_color_saber3\.jpeg"\)/);
	assert.match(LIGHT, /--dnd5e-character-body-image:\s*var\(--dnd5e-background-texture-paper-red\)/);
});

test("dark theme maps SW5e saber into DND5e header variables", () => {
	assert.match(DARK, /--dnd5e-character-background-image:\s*url\("\/modules\/sw5e-module\/styles\/dual_color_saber3\.jpeg"\)/);
	assert.match(DARK, /--dnd5e-character-header-image:\s*transparent/);
	assert.match(DARK, /--dnd5e-item-header-image:\s*url\("\/modules\/sw5e-module\/styles\/dual_color_saber3\.jpeg"\)/);
	assert.match(DARK, /--dnd5e-vehicle-header-image:\s*url\("\/modules\/sw5e-module\/styles\/dual_color_saber3\.jpeg"\)/);
});

test("legacy sheet ::before rules consume theme header variables", () => {
	assert.match(LEGACY, /background:\s*var\(--dnd5e-npc-header-image\)/);
	assert.match(LEGACY, /background:\s*var\(--dnd5e-vehicle-header-image\)/);
	assert.match(LEGACY, /background:\s*var\(--dnd5e-item-header-image\)/);
	assert.match(LEGACY, /background:\s*var\(--dnd5e-encounter-header-image\)/);
	assert.match(LEGACY, /background:\s*var\(--dnd5e-group-header-image\)/);
	// Ungated character override remains commented (PR #72).
	assert.match(LEGACY, /\/\*[\s\S]*?\.dnd5e2\.sheet\.actor\.character:not\(\.minimized\) \.window-content::before/);
});

test("powers banner uses DND5e theme variables", () => {
	assert.match(LEGACY, /--sw5e-powers-banner-surface:\s*var\(--dnd5e-background-card/);
	assert.match(LEGACY, /border:\s*var\(--dnd5e-border-gold\)/);
	assert.match(LEGACY, /box-shadow:\s*0 0 6px var\(--dnd5e-shadow-45\)/);
	assert.match(LEGACY, /color:\s*var\(--dnd5e-heading-3-color\)/);
});

test("compiled CSS contains theme scopes and does not leave unresolved obvious theme gaps", () => {
	assert.match(CSS, /@scope \(\.theme-light\) to \(\.themed\)/);
	assert.match(CSS, /@scope \(\.theme-dark\) to \(\.themed\)/);
	assert.match(CSS, /dual_color_saber3\.jpeg/);
	assert.doesNotMatch(CSS, /var\(--missing-/);
});

test("pause offsets from prior PR72 commit remain unchanged", () => {
	assert.match(PAUSE_LESS, /padding-bottom:\s*1\.4rem/);
	assert.match(PAUSE_LESS, /top:\s*0\.2rem/);
	assert.match(CSS, /padding-bottom:\s*1\.4rem/);
});

test("starship layout guards remain after theme rebuild", () => {
	assert.match(CSS, /:not\(\.tabs-right\)/);
	assert.match(CSS, /\.has-stations \.window-content/);
	assert.match(LEGACY, /\.has-stations \.window-content/);
});

test("no removed theme-subsystem selectors restored", () => {
	for ( const src of [LIGHT, DARK, MODULE_LESS] ) {
		const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
		assert.doesNotMatch(code, /data-sw5e-theme/);
		assert.doesNotMatch(code, /sw5e-theme-root/);
	}
});

console.log(`\n${passed} passed`);
