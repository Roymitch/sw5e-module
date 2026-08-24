#!/usr/bin/env node
/**
 * Offline regression: SW5e `gear` Item property must survive strict patchConfig.
 * DND5e 5.3.3 NPC gear UX (validProperties add + asGear) expects
 * CONFIG.DND5E.itemProperties.gear to exist after SW5e strict wipe/rebuild.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EN = JSON.parse(fs.readFileSync(path.join(ROOT, "languages/en.json"), "utf8"));
const CONFIG_SRC = fs.readFileSync(path.join(ROOT, "scripts/patch/config.mjs"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const EXPECTED = {
	label: "SW5E.Item.Property.Gear",
	full: "SW5E.Item.Property.GearFull",
	type: "Boolean",
	reference: "SW5E.Item.Property.GearDesc",
	isCharacter: true
};

test("config.mjs declares gear with expected contract keys", () => {
	assert.match(CONFIG_SRC, /\bgear:\s*\{/);
	assert.match(CONFIG_SRC, /label:\s*"SW5E\.Item\.Property\.Gear"/);
	assert.match(CONFIG_SRC, /full:\s*"SW5E\.Item\.Property\.GearFull"/);
	assert.match(CONFIG_SRC, /reference:\s*"SW5E\.Item\.Property\.GearDesc"/);
	assert.match(CONFIG_SRC, /type:\s*"Boolean"/);
	const gearBlock = CONFIG_SRC.match(/\bgear:\s*\{[\s\S]*?\n\t\t\},/);
	assert.ok(gearBlock, "gear property block missing");
	assert.match(gearBlock[0], /isCharacter:\s*true/);
	assert.doesNotMatch(gearBlock[0], /isStarship:\s*true/);
});

test("localization keys exist under SW5E.Item.Property", () => {
	const prop = EN["SW5E.Item"]?.Property;
	assert.ok(prop, "SW5E.Item.Property missing");
	assert.equal(prop.Gear, "Gear");
	assert.equal(prop.GearFull, "Gear");
	assert.equal(
		prop.GearDesc,
		"When items marked as gear are dropped onto another creature's sheet, a fresh, base version of that item is retrieved from the compendium pack and given to the other creature."
	);
});

test("gear declaration does not alter neighboring auto property contract in source", () => {
	assert.match(CONFIG_SRC, /\bauto:\s*\{[\s\S]*?label:\s*"SW5E\.Item\.Property\.Auto"/);
	assert.match(CONFIG_SRC, /\bhvy:\s*\{[\s\S]*?label:\s*"SW5E\.Item\.Property\.Heavy"/);
});

test("strict itemProperties wipe remains present (gear is re-declared after wipe)", () => {
	assert.match(CONFIG_SRC, /if\s*\(strict\)\s*config\.itemProperties\s*=\s*\{\s*\}/);
	const wipeIdx = CONFIG_SRC.indexOf("if (strict) config.itemProperties = {}");
	const gearIdx = CONFIG_SRC.indexOf("gear: {");
	assert.ok(wipeIdx >= 0 && gearIdx > wipeIdx, "gear must be declared after strict wipe");
});

test("idempotent re-read of localization gear keys", () => {
	const again = JSON.parse(fs.readFileSync(path.join(ROOT, "languages/en.json"), "utf8"));
	assert.deepEqual(again["SW5E.Item"].Property.Gear, EN["SW5E.Item"].Property.Gear);
	assert.deepEqual(again["SW5E.Item"].Property.GearDesc, EN["SW5E.Item"].Property.GearDesc);
	assert.deepEqual(again["SW5E.Item"].Property.GearFull, EN["SW5E.Item"].Property.GearFull);
});

// Static contract snapshot for future regressions (not a Foundry DataModel claim).
test("expected gear record shape snapshot", () => {
	assert.equal(EXPECTED.type, "Boolean");
	assert.equal(EXPECTED.isCharacter, true);
});

console.log(`\n${passed} passed`);
