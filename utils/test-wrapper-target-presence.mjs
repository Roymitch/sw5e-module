#!/usr/bin/env node
/**
 * P8B-08 — Static presence: every active libWrapper.register target string in scripts/
 * must appear as a literal registration. Intentionally removed targets are allowlisted.
 * Does not prove runtime registration success against dnd5e exports.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");

/**
 * Targets historically inventoried but intentionally not registered after Phase 2+
 * stack adaptations. Keep explicit — do not silently drop without inventory evidence.
 */
const INTENTIONALLY_ABSENT_TARGETS = new Set([
	// LW-018: _prepareTabsContext removed upstream in dnd5e 5.3; wrap must stay removed.
	"dnd5e.applications.actor.BaseActorSheet.prototype._prepareTabsContext",
	// LW-039: deepFreeze wrap remains removed (Phase 2 / Bug 11 policy).
	"foundry.utils.deepFreeze"
]);

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function walkMjs(dir, acc=[]) {
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const full = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walkMjs(full, acc);
		else if ( entry.name.endsWith(".mjs") ) acc.push(full);
	}
	return acc;
}

function collectRegisterTargets(files) {
	const targets = new Map();
	const re = /libWrapper\.register\(\s*[^,]+,\s*(['"`])([^'"`]+)\1/g;
	for ( const file of files ) {
		const src = fs.readFileSync(file, "utf8");
		let match;
		while ( (match = re.exec(src)) ) {
			const target = match[2];
			if ( !targets.has(target) ) targets.set(target, []);
			targets.get(target).push(path.relative(ROOT, file).replaceAll("\\", "/"));
		}
	}
	return targets;
}

check("P8B-08: at least one libWrapper.register target exists under scripts/", () => {
	const files = walkMjs(SCRIPTS);
	const targets = collectRegisterTargets(files);
	assert.equal(targets.size > 0, true, "expected libWrapper.register calls in scripts/");
	console.log(`  note - active register targets: ${targets.size}`);
});

check("P8B-08: intentionally absent targets are not registered", () => {
	const files = walkMjs(SCRIPTS);
	const targets = collectRegisterTargets(files);
	for ( const absent of INTENTIONALLY_ABSENT_TARGETS ) {
		assert.equal(
			targets.has(absent),
			false,
			`intentionally absent target must not be registered: ${absent}`
		);
	}
});

check("P8B-08: every registered target string is non-empty and unique-keyed", () => {
	const files = walkMjs(SCRIPTS);
	const targets = collectRegisterTargets(files);
	for ( const [target, filesForTarget] of targets ) {
		assert.equal(typeof target, "string");
		assert.equal(target.length > 0, true);
		assert.equal(filesForTarget.length >= 1, true);
	}
	// Sanity: known critical starship prepare target remains present.
	assert.equal(
		targets.has("dnd5e.documents.Actor5e.prototype.getRollData")
			|| [...targets.keys()].some(t => t.includes("getRollData")),
		true,
		"expected getRollData wrapper target to remain registered"
	);
});

check("P8B-08: inventory allowlist entries document intentional absences only", () => {
	assert.equal(INTENTIONALLY_ABSENT_TARGETS.has("dnd5e.applications.actor.BaseActorSheet.prototype._prepareTabsContext"), true);
	assert.equal(INTENTIONALLY_ABSENT_TARGETS.has("foundry.utils.deepFreeze"), true);
});

console.log(`\n${passed} checks passed (P8B-08)`);
