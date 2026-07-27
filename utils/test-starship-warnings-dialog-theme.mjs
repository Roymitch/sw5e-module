#!/usr/bin/env node
/**
 * Offline tests: Starship Warning dialog themed fills (Slice B).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const THEME = fs.readFileSync(path.join(ROOT, "styles/less/theme-overrides.less"), "utf8");
const UNDERWORLD = fs.readFileSync(path.join(ROOT, "styles/less/underworld-overrides.less"), "utf8");
const TEMPLATE = fs.readFileSync(path.join(ROOT, "templates/starship-warnings-dialog.hbs"), "utf8");
const SHEET = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet.mjs"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function dialogFillBlock(source, theme) {
	const re = new RegExp(
		`body\\[data-sw5e-theme="${theme}"\\][^{]*dialog\\.warnings\\.sw5e-starship-warnings-dialog[^{]*\\{([\\s\\S]*?)\\}`,
		"gm"
	);
	const blocks = [...source.matchAll(re)].map(m => m[1]);
	assert.ok(blocks.length, `expected ${theme} dialog.warnings.sw5e-starship-warnings-dialog rule`);
	const fill = blocks.find(b => /background-image:/.test(b));
	assert.ok(fill, `expected ${theme} dialog fill rule with background-image`);
	return fill;
}

test("Light selector exists for exact warning dialog", () => {
	const block = dialogFillBlock(THEME, "sw5e-light");
	assert.match(block, /background:/);
	assert.match(block, /background-image:/);
	assert.doesNotMatch(block, /background-image:\s*none/);
});

test("Dark selector exists and does not cancel its gradient fill", () => {
	const block = dialogFillBlock(THEME, "sw5e-dark");
	assert.match(block, /background:\s*linear-gradient/);
	assert.match(block, /background-image:\s*linear-gradient/);
	assert.doesNotMatch(block, /background-image:\s*none/);
});

test("Underworld selector exists for exact warning dialog", () => {
	const block = dialogFillBlock(UNDERWORLD, "sw5e-underworld");
	assert.match(block, /background:\s*linear-gradient/);
	assert.match(block, /background-image:\s*linear-gradient/);
	assert.doesNotMatch(block, /background-image:\s*none/);
});

test("no broad global dialog selector introduced for this slice", () => {
	assert.doesNotMatch(THEME, /body\[data-sw5e-theme="sw5e-dark"\]\s+dialog\s*\{/);
	assert.doesNotMatch(UNDERWORLD, /body\[data-sw5e-theme="sw5e-underworld"\]\s+dialog\s*\{/);
	assert.doesNotMatch(THEME, /\.window-content\s*\{[^}]*sw5e-starship-warnings/);
});

test("native dialog markup and open path unchanged; no warning suppression", () => {
	assert.match(TEMPLATE, /<header>/);
	assert.match(TEMPLATE, /\{\{body\}\}/);
	assert.match(TEMPLATE, /\{\{actorName\}\}/);
	assert.match(TEMPLATE, /method="dialog"/);
	assert.match(SHEET, /sw5e-starship-warnings-dialog/);
	assert.match(SHEET, /ensureWarningsDialog/);
	assert.doesNotMatch(SHEET, /_preparationWarnings\s*=\s*\[\]/);
	assert.doesNotMatch(SHEET, /filter.*preparationWarnings|suppress.*warning/i);
});

console.log(`\n${passed} passed`);
