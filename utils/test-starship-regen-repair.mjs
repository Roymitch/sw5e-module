#!/usr/bin/env node
/**
 * Offline tests: Starship Regen Power Die notify policy + passive shield regen trunc + mult reuse.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	resolveStarshipPassiveShieldRegenGain,
	syncStarshipPassiveShieldRegenRollTotal,
	truncateStarshipPassiveShieldRegenGain
} from "../scripts/starship-dice-rolls.mjs";
import { notifyOrSkipStarshipPowerRecoveryFullCapacity } from "../scripts/starship-power-recovery-notify.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POWER = fs.readFileSync(path.join(ROOT, "scripts/starship-power-recovery.mjs"), "utf8");
const REPAIR = fs.readFileSync(path.join(ROOT, "scripts/starship-repair.mjs"), "utf8");
const DICE = fs.readFileSync(path.join(ROOT, "scripts/starship-dice-rolls.mjs"), "utf8");
const DELEGATES = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet-delegates.mjs"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function withWarnings(fn) {
	const warnings = [];
	const previousUi = globalThis.ui;
	globalThis.ui = {
		notifications: {
			warn: msg => {
				warnings.push(String(msg));
			}
		}
	};
	try {
		return { result: fn(), warnings };
	} finally {
		globalThis.ui = previousUi;
	}
}

// —— Passive regen trunc ——
test("20 × 0.667 truncates to 13 (not round)", () => {
	assert.equal(truncateStarshipPassiveShieldRegenGain(20 * 0.667), 13);
	assert.equal(resolveStarshipPassiveShieldRegenGain(20 * 0.667, 999), 13);
});

test("6 × 0.667 truncates to 4", () => {
	assert.equal(resolveStarshipPassiveShieldRegenGain(6 * 0.667, 999), 4);
});

test("8 × 0.5 truncates to 4", () => {
	assert.equal(resolveStarshipPassiveShieldRegenGain(8 * 0.5, 999), 4);
});

test("13.8 truncates to 13 not 14", () => {
	assert.equal(truncateStarshipPassiveShieldRegenGain(13.8), 13);
	assert.notEqual(Math.round(13.8), truncateStarshipPassiveShieldRegenGain(13.8));
});

test("headroom smaller than truncated result caps correctly", () => {
	assert.equal(resolveStarshipPassiveShieldRegenGain(20 * 0.667, 5), 5);
	assert.equal(resolveStarshipPassiveShieldRegenGain(20 * 0.667, 0), 0);
});

test("chat/display total sync equals applied gain; no decimal final", () => {
	const applied = resolveStarshipPassiveShieldRegenGain(20 * 0.667, 999);
	assert.equal(applied, 13);
	const roll = {
		_total: 13.34,
		get total() {
			return this._total;
		}
	};
	syncStarshipPassiveShieldRegenRollTotal(roll, applied);
	assert.equal(roll.total, 13);
	assert.equal(Number.isInteger(roll.total), true);
});

test("coefficient is not pre-rounded; formula multiplies then truncates gain", () => {
	assert.match(DICE, /dieFace\} \* @attributes\.equip\.shields\.regenRateMult/);
	assert.match(DICE, /resolveStarshipPassiveShieldRegenGain\(rawTotal,\s*headroom\)/);
	assert.match(DICE, /Math\.trunc/);
	assert.doesNotMatch(DICE, /Math\.round\(roll\.total\)/);
	assert.doesNotMatch(DICE, /Math\.ceil\(roll\.total\)/);
});

// —— Notify policy ——
test("source: Regen passes notifyFullCapacity false + legacyCentralFirst; Advanced Power defaults prompt", () => {
	assert.match(REPAIR, /recoverStarshipPowerDice\(actor,\s*\{[\s\S]*notifyFullCapacity:\s*false/);
	assert.match(REPAIR, /allocationMode:\s*"legacyCentralFirst"/);
	assert.match(POWER, /notifyFullCapacity\s*=\s*true/);
	assert.match(POWER, /allocationMode\s*=\s*STARSHIP_POWER_RECOVERY_ALLOCATION_MODE_PROMPT/);
	assert.match(POWER, /STARSHIP_POWER_RECOVERY_ALLOCATION_MODE_PROMPT\s*=\s*"prompt"/);
	assert.match(POWER, /STARSHIP_POWER_RECOVERY_ALLOCATION_MODE_LEGACY\s*=\s*"legacyCentralFirst"/);
	assert.match(POWER, /notifyOrSkipStarshipPowerRecoveryFullCapacity/);
	assert.match(DELEGATES, /recoverStarshipPowerDice\(act\)/);
	assert.doesNotMatch(DELEGATES, /notifyFullCapacity:\s*false/);
	assert.doesNotMatch(DELEGATES, /allocationMode:\s*"legacyCentralFirst"/);
});

test("automatic full-capacity recovery is quiet", () => {
	const { result, warnings } = withWarnings(() =>
		notifyOrSkipStarshipPowerRecoveryFullCapacity({ notifyFullCapacity: false })
	);
	assert.equal(result, false);
	assert.equal(warnings.length, 0);
});

test("explicit full-capacity recovery still warns", () => {
	const { result, warnings } = withWarnings(() =>
		notifyOrSkipStarshipPowerRecoveryFullCapacity({ notifyFullCapacity: true })
	);
	assert.equal(result, false);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /capacity|already/i);
});

test("default notifyFullCapacity warns (Advanced Power default)", () => {
	const { result, warnings } = withWarnings(() =>
		notifyOrSkipStarshipPowerRecoveryFullCapacity()
	);
	assert.equal(result, false);
	assert.equal(warnings.length, 1);
});

// —— Mult reuse / atomicity decisions ——
test("apply resolves effectiveRegenMult once and passes into preview", () => {
	assert.match(
		DICE,
		/const effectiveRegenMult = getStarshipEffectiveShieldRegenRateMult\([\s\S]*?await getStarshipShieldRegenRateMult\(actor\)/
	);
	assert.match(DICE, /previewStarshipNaturalShieldDieRoll\(actor,\s*\{\s*effectiveRegenMult\s*\}\)/);
	assert.match(DICE, /effectiveRegenMult\s*\?\?/);
});

test("Shield temp (Actor) and shldDiceUsed (Size Item) remain separate updates", () => {
	assert.match(DICE, /system\.attributes\.hp\.temp/);
	assert.match(DICE, /updateEmbeddedDocuments\("Item"/);
	assert.match(DICE, /Atomicity note/);
	assert.match(DICE, /buildStarshipShieldDiceSpendItemUpdate\(actor,\s*1\)/);
});

test("Shield die spend remains after successful preview; spendCount is 1", () => {
	assert.match(DICE, /if \( !preview \|\| preview\.error \|\| preview\.spGain <= 0 \) return preview;/);
	assert.match(DICE, /buildStarshipShieldDiceSpendItemUpdate\(actor,\s*1\)/);
});

console.log(`\n${passed} tests passed`);
