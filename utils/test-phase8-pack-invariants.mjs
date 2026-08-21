#!/usr/bin/env node
/**
 * P8B-06, P8B-07, P8B-09 — Offline pack-source invariants for Auto-Thrusters,
 * Drake once-only embeds, and B-Wing hull/shield constants.
 * Fixture/static coverage only; does not prove Foundry import or sheet preparation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTO_THRUSTERS = path.join(
	ROOT,
	"packs/_source/starships/starship-features/small/auto-thrusters.yml"
);
const DRAKES = path.join(ROOT, "packs/_source/drakes-shipyard");
const B_WING = path.join(DRAKES, "a-sf-01-b-wing-starfighter.yml");

const APPROVED_AT_ITEM_ID = "Ps2LiBeSQQAi57Kf";
const APPROVED_AT_EFFECT_ID = "DwFh63OFTvVGSjQD";
const APPROVED_AT_KEY = "system.abilities.dex.bonuses.save";
const APPROVED_AT_VALUE = "+max(1, floor((@abilities.str.value - 10) / 4))";
const APPROVED_AT_MODE = 2;

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function walkYaml(dir, acc=[]) {
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const full = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walkYaml(full, acc);
		else if ( /\.ya?ml$/i.test(entry.name) ) acc.push(full);
	}
	return acc;
}

function isAutoThrustersItem(item) {
	if ( !item || typeof item !== "object" ) return false;
	if ( item._id === APPROVED_AT_ITEM_ID ) return true;
	return String(item.name || "").toLowerCase() === "auto-thrusters";
}

function isAutoThrustersEffect(effect) {
	if ( !effect || typeof effect !== "object" ) return false;
	if ( effect._id === APPROVED_AT_EFFECT_ID ) return true;
	return String(effect.name || "").toLowerCase() === "auto-thrusters";
}

function countAutoThrusters(actor) {
	const items = Array.isArray(actor?.items) ? actor.items : [];
	const itemHits = items.filter(isAutoThrustersItem);
	let effectHits = (Array.isArray(actor?.effects) ? actor.effects : []).filter(isAutoThrustersEffect).length;
	for ( const item of items ) {
		const effects = Array.isArray(item?.effects) ? item.effects : [];
		effectHits += effects.filter(isAutoThrustersEffect).length;
	}
	return { itemHits: itemHits.length, effectHits, items: itemHits };
}

check("P8B-06: canonical Auto-Thrusters AE key/formula/mode and once-only effect", () => {
	const doc = yaml.load(fs.readFileSync(AUTO_THRUSTERS, "utf8"));
	assert.equal(doc.name, "Auto-Thrusters");
	assert.equal(doc._id, APPROVED_AT_ITEM_ID);
	assert.equal(Array.isArray(doc.effects), true);
	assert.equal(doc.effects.length, 1, "canonical feature must embed exactly one effect");
	const effect = doc.effects[0];
	assert.equal(effect._id, APPROVED_AT_EFFECT_ID);
	assert.equal(effect.name, "Auto-Thrusters");
	assert.equal(effect.transfer, true);
	assert.equal(Array.isArray(effect.changes), true);
	assert.equal(effect.changes.length, 1);
	assert.equal(effect.changes[0].key, APPROVED_AT_KEY);
	assert.equal(effect.changes[0].value, APPROVED_AT_VALUE);
	assert.equal(effect.changes[0].mode, APPROVED_AT_MODE);
});

check("P8B-07: Drake actors with Auto-Thrusters have at most one item and one effect", () => {
	const files = walkYaml(DRAKES);
	assert.equal(files.length >= 80, true, `expected Drake shipyard YAML census, got ${files.length}`);
	const withAuto = [];
	for ( const file of files ) {
		const doc = yaml.load(fs.readFileSync(file, "utf8"));
		const counts = countAutoThrusters(doc);
		if ( counts.itemHits || counts.effectHits ) {
			withAuto.push({
				file: path.basename(file),
				itemHits: counts.itemHits,
				effectHits: counts.effectHits,
				itemIds: counts.items.map(i => i._id)
			});
			assert.equal(counts.itemHits <= 1, true, `${path.basename(file)} has ${counts.itemHits} Auto-Thrusters items`);
			assert.equal(counts.effectHits <= 1, true, `${path.basename(file)} has ${counts.effectHits} Auto-Thrusters effects`);
			// Drake embeds are actor-local copies: IDs need not equal the canonical feature _id.
			if ( counts.itemHits === 1 ) {
				const item = counts.items[0];
				assert.equal(String(item.name), "Auto-Thrusters");
				const effects = Array.isArray(item.effects) ? item.effects : [];
				const atEffects = effects.filter(isAutoThrustersEffect);
				assert.equal(atEffects.length, 1, `${path.basename(file)} Auto-Thrusters item must embed exactly one AT effect`);
				const change = atEffects[0]?.changes?.[0];
				assert.equal(change?.key, APPROVED_AT_KEY);
				assert.equal(change?.value, APPROVED_AT_VALUE);
				assert.equal(change?.mode, APPROVED_AT_MODE);
			}
		}
	}
	assert.equal(withAuto.length, 10, `expected exactly 10 Drake actors with Auto-Thrusters, got ${withAuto.length}`);
	console.log(`  note - Drake Auto-Thrusters census: ${withAuto.length} actors, all once-only`);
});

check("P8B-09: B-Wing stores Hull 44/44 and Shields 75/75 in attributes.hp", () => {
	const doc = yaml.load(fs.readFileSync(B_WING, "utf8"));
	assert.equal(doc.name, "A/SF-01 B-wing starfighter");
	assert.equal(doc._id, "Y0Vf2Yi6pPQjliD1");
	const hp = doc?.system?.attributes?.hp;
	assert.equal(hp?.value, 44);
	assert.equal(hp?.max, 44);
	assert.equal(hp?.temp, 75);
	assert.equal(hp?.tempmax, 75);
});

console.log(`\n${passed} checks passed (P8B-06, P8B-07, P8B-09)`);
