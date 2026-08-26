#!/usr/bin/env node
/**
 * Offline tests for Starship Uses/Recovery disposition source corrections.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "utils/apply-starship-uses-recovery-disposition.mjs");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function parseJsonObjects(stdout) {
	const objs = [];
	const text = String(stdout);
	let depth = 0;
	let start = -1;
	for ( let i = 0; i < text.length; i++ ) {
		const ch = text[i];
		if ( ch === "{" ) {
			if ( depth === 0 ) start = i;
			depth += 1;
		} else if ( ch === "}" ) {
			depth -= 1;
			if ( depth === 0 && start >= 0 ) {
				objs.push(JSON.parse(text.slice(start, i + 1)));
				start = -1;
			}
		}
	}
	return objs;
}

test("disposition --validate reports corrected totals", () => {
	const r = spawnSync(process.execPath, [SCRIPT, "--validate"], { cwd: ROOT, encoding: "utf8" });
	assert.equal(r.status, 0, r.stderr || r.stdout);
	const objs = parseJsonObjects(r.stdout);
	const last = objs[objs.length - 1];
	assert.equal(last.validated, true);
	assert.equal(last.counts.noUses.Citadel, 1);
	assert.equal(last.counts.noUses["Hold Together"], 6);
	assert.equal(last.counts.noUses["Boost Engines"], 104);
	assert.equal(last.counts.noUses.Search, 103);
	assert.equal(last.counts.pinpoint.total, 43);
	assert.equal(last.counts.pinpoint.sr, 43);
	assert.equal(last.counts.evasive.total, 20);
	assert.equal(last.counts.evasive.lr, 20);
});

test("Citadel uses proven no-Uses shape", () => {
	const doc = yaml.load(fs.readFileSync(
		path.join(ROOT, "packs/_source/starships/starship-features/gargantuan/citadel.yml"),
		"utf8"
	));
	assert.equal(doc.system.uses.max, "");
	assert.equal(doc.system.uses.per, null);
	assert.equal(doc.system.recharge.value, null);
	assert.equal(doc.system.recharge.charged, false);
});

test("Boost Engines standalone clears recharge value 1", () => {
	const doc = yaml.load(fs.readFileSync(
		path.join(ROOT, "packs/_source/starships/starship-actions/crew-actions/boost-engines.yml"),
		"utf8"
	));
	assert.equal(doc.system.uses.per, null);
	assert.equal(doc.system.recharge.value, null);
	assert.equal(doc.system.recharge.charged, false);
});

test("Pinpoint Strike preserves @details.tier and per sr", () => {
	const doc = yaml.load(fs.readFileSync(
		path.join(ROOT, "packs/_source/starships/starship-features/small/pinpoint-strike.yml"),
		"utf8"
	));
	assert.equal(doc.system.uses.max, "@details.tier");
	assert.equal(doc.system.uses.per, "sr");
});

test("Evasive Maneuvers preserves 2*@details.tier and per lr", () => {
	const doc = yaml.load(fs.readFileSync(
		path.join(ROOT, "packs/_source/starships/starship-features/medium/evasive-maneuvers.yml"),
		"utf8"
	));
	assert.equal(doc.system.uses.max, "2*@details.tier");
	assert.equal(doc.system.uses.per, "lr");
});

test("previously empty Evasive Drake embed restored via sourceId", () => {
	const doc = yaml.load(fs.readFileSync(
		path.join(ROOT, "packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml"),
		"utf8"
	));
	const item = doc.items.find(i => i._id === "qL9HNpwJfQIxcgog");
	assert.equal(item.flags.core.sourceId, "Compendium.sw5e-module.starships.BsyAajkYG8yoCLvj");
	assert.equal(item.system.uses.max, "2*@details.tier");
	assert.equal(item.system.uses.per, "lr");
});

console.log(`\n${passed} passed`);
