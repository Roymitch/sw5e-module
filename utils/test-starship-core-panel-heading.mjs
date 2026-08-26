#!/usr/bin/env node
/**
 * Offline tests: Core collapsible-header markup standardization (Slice C).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAYER = fs.readFileSync(path.join(ROOT, "templates/starship-sheet-layer.hbs"), "utf8");
const CREW_LESS = fs.readFileSync(path.join(ROOT, "styles/less/update/starships/crew.less"), "utf8");
const CORE_PANELS = fs.readFileSync(path.join(ROOT, "styles/less/starship-core-panels.less"), "utf8");
const VITALS = fs.readFileSync(path.join(ROOT, "templates/starship-sidebar-vitals.hbs"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function inline(name) {
	const m = LAYER.match(new RegExp(`\\{\\{#\\*inline "${name}"\\}\\}[\\s\\S]*?\\{\\{\\/inline\\}\\}`));
	assert.ok(m, `expected inline ${name}`);
	return m[0];
}

test("all four Core collapsible headers use h2 + neutral shared class", () => {
	const routing = inline("sw5e-starship-core-routing");
	const fuel = inline("sw5e-starship-core-fuel");
	const power = inline("sw5e-starship-core-advanced-power");
	assert.match(routing, /<h2[^>]*sw5e-starship-systems-field-heading[^>]*sw5e-starship-core-panel-heading/);
	assert.match(fuel, /<h2[^>]*sw5e-starship-systems-field-heading[^>]*sw5e-starship-core-panel-heading/);
	assert.match(power, /<h2[^>]*sw5e-starship-systems-field-heading[^>]*sw5e-starship-core-panel-heading/);
	assert.match(
		LAYER,
		/<h2 class="sw5e-starship-systems-field-heading sw5e-starship-core-panel-heading sw5e-starship-crew-panel-heading"/
	);
	assert.doesNotMatch(routing, /crew-panel-heading/);
	assert.doesNotMatch(fuel, /crew-panel-heading/);
	assert.doesNotMatch(power, /crew-panel-heading/);
});

test("Flight Manifest retains count and Add Crew", () => {
	assert.match(LAYER, /sw5e-starship-crew-panel-count/);
	assert.match(LAYER, /crew\.roster\.length/);
	assert.match(LAYER, /data-sw5e-crew-command="open-add-crew"/);
});

test("Power Routing retains selector and chevron collapse attrs", () => {
	const routing = inline("sw5e-starship-core-routing");
	assert.match(routing, /id="sw5e-core-routing"/);
	assert.match(routing, /name="system\.attributes\.power\.routing"/);
	assert.match(routing, /data-sw5e-core-collapse-action="toggle"/);
	assert.match(routing, /data-core-panel="routing"/);
	assert.match(routing, /fa-chevron-down/);
	assert.match(routing, /aria-expanded/);
});

test("Power Die Allocation and Fuel retain chevrons", () => {
	const power = inline("sw5e-starship-core-advanced-power");
	const fuel = inline("sw5e-starship-core-fuel");
	assert.match(power, /fa-chevron-down/);
	assert.match(fuel, /fa-chevron-down/);
	assert.match(power, /data-core-panel="advancedPower"/);
	assert.match(fuel, /data-core-panel="fuel"/);
});

test("neutral shared heading layout owns flex; no global font override", () => {
	assert.match(CREW_LESS, /\.sw5e-starship-core-panel-heading\s*\{[\s\S]*?display:\s*flex;/);
	assert.doesNotMatch(CREW_LESS, /--sw5e-font-heading\s*:/);
	assert.doesNotMatch(CREW_LESS, /\bh2\s*\{[^}]*font-family/);
	assert.doesNotMatch(LAYER, /font-family:\s*Inter|font-family:\s*Roboto/);
});

test("Skills alignment and sidebar repair icons remain intact", () => {
	assert.match(CORE_PANELS, /margin-top:\s*0;/);
	assert.match(LAYER, /sw5e-starship-overview-skills/);
	assert.match(VITALS, /data-sw5e-repair-action/);
});

console.log(`\n${passed} passed`);
