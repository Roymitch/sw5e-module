#!/usr/bin/env node
/**
 * Offline regression: superiority-school (maneuver type) icon contract.
 * Assets and CONFIG icons exist historically; Powers-tab must wire them via
 * the Maneuver type column template (not spellSchools).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	MANEUVER_TYPE_COLUMN_TEMPLATE,
	applyManeuverTypeSchoolColumn,
	resolveManeuverSpellbookColumns
} from "../scripts/maneuver-powers-list-context.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_SRC = fs.readFileSync(path.join(ROOT, "scripts/patch/config.mjs"), "utf8");
const TEMPLATE = fs.readFileSync(
	path.join(ROOT, "templates/inventory/columns/maneuver-type.hbs"),
	"utf8"
);

const SCHOOLS = [
	{ key: "physical", file: "physical.svg" },
	{ key: "mental", file: "mental.svg" },
	{ key: "general", file: "general.svg" }
];

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

test("every superiority type has a configured icon path in config.mjs", () => {
	for ( const { key, file } of SCHOOLS ) {
		const re = new RegExp(
			`${key}:\\s*\\{[\\s\\S]*?icon:\\s*"modules/sw5e-module/icons/svg/schools/${file}"`,
			"m"
		);
		assert.match(CONFIG_SRC, re, `missing icon for ${key}`);
	}
});

test("configured icon SVG assets exist on disk", () => {
	for ( const { file } of SCHOOLS ) {
		const p = path.join(ROOT, "icons/svg/schools", file);
		assert.equal(fs.existsSync(p), true, `missing asset ${file}`);
		assert.ok(fs.statSync(p).size > 0, `empty asset ${file}`);
	}
});

test("maneuver-type column template looks up superiority.types icons", () => {
	assert.match(TEMPLATE, /@root\.config\.superiority\.types/);
	assert.match(TEMPLATE, /entry\.system\.type\.value/);
	assert.match(TEMPLATE, /typeConfig\.icon/);
	assert.match(TEMPLATE, /dnd5e-icon/);
	assert.doesNotMatch(TEMPLATE, /\{\{.*spellSchools/);
});

test("MANEUVER_TYPE_COLUMN_TEMPLATE points at module maneuver-type.hbs", () => {
	assert.match(MANEUVER_TYPE_COLUMN_TEMPLATE, /maneuver-type\.hbs$/);
	assert.match(MANEUVER_TYPE_COLUMN_TEMPLATE, /^modules\/sw5e-module\//);
});

test("applyManeuverTypeSchoolColumn remaps school only and does not mutate input", () => {
	const input = [
		{ id: "time", template: "t" },
		{ id: "school", template: "systems/dnd5e/templates/inventory/columns/school.hbs" }
	];
	const out = applyManeuverTypeSchoolColumn(input);
	assert.notEqual(out, input);
	assert.equal(input[1].template.includes("school.hbs"), true);
	assert.equal(out[1].template, MANEUVER_TYPE_COLUMN_TEMPLATE);
	assert.equal(out[0], input[0]);
});

test("unknown school leaves empty icon slot without throwing", () => {
	const cols = applyManeuverTypeSchoolColumn([{ id: "school", template: "x" }]);
	assert.equal(cols[0].template, MANEUVER_TYPE_COLUMN_TEMPLATE);
	// Template itself uses {{#with}} / {{#if typeConfig.icon}} — no crash path offline.
	assert.match(TEMPLATE, /\{\{#if typeConfig\.icon\}\}/);
});

test("resolveManeuverSpellbookColumns is stable across repeated calls", () => {
	const base = [{ id: "school", template: "stock" }, { id: "controls", template: "c" }];
	const a = resolveManeuverSpellbookColumns(base, {});
	const b = resolveManeuverSpellbookColumns(base, {});
	assert.deepEqual(a, b);
	assert.equal(a[0].template, MANEUVER_TYPE_COLUMN_TEMPLATE);
});

test("maneuver.mjs registers type column template on actor sheet spells parts", () => {
	const src = fs.readFileSync(path.join(ROOT, "scripts/patch/maneuver.mjs"), "utf8");
	assert.match(src, /registerManeuverTypeColumnTemplate/);
	assert.match(src, /PARTS\?\.spells/);
	assert.match(src, /maneuver-type\.hbs/);
});

console.log(`\n${passed} passed`);
