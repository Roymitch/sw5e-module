/**
 * Force / Tech / Superiority embedding unit tests.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveExactMonsterArtwork } from "./artwork.mjs";
import { buildCanonicalPowerIndex, loadAndCloneCanonicalPower, resolveCanonicalPower } from "./canonical-powers.mjs";
import { detectFeatures } from "./classify.mjs";
import { generateGeneralizedActor, parseSkills } from "./generate-generalized.mjs";
import { createEmptyIrEntry } from "./ir-schema.mjs";
import { parseForcecasting, parseTechcasting } from "./parse-casting.mjs";
let passed = 0;
function test(name, fn) {
	try {
		fn();
		passed += 1;
		console.log(`ok - ${name}`);
	} catch ( err ) {
		console.error(`not ok - ${name}`);
		console.error(err);
		process.exitCode = 1;
	}
}

test("canonical power index includes Force Jump and Tech Absorb Energy", () => {
	const idx = buildCanonicalPowerIndex();
	assert.ok(idx.forceCount > 200);
	assert.ok(idx.techCount > 200);
	assert.equal(resolveCanonicalPower("Force Jump", "force").match, "exact-name");
	assert.equal(resolveCanonicalPower("Absorb Energy", "tech").match, "exact-name");
	const jump = loadAndCloneCanonicalPower("Force Jump", "force");
	assert.equal(jump.ok, true);
	assert.ok(Object.keys(jump.clone.system.activities || {}).length >= 1);
	assert.equal(jump.clone.system.consume.target, "powercasting.force.points.value");
});

test("parseForcecasting extracts youngling resources and tiers", () => {
	const body = `
***Forcecasting.*** The youngling is a 1st-level forcecaster. Its forcecasting ability is Wisdom (force save DC 11, +3 to hit with force attacks, 5 force points and knows the following force powers:
At-will: *affect mind, force disarm, force push/pull, saber reflect*  <br>
1st-level: *breath control, disperse force, heroism, sense emotion, sense force* <br>
`;
	const parsed = parseForcecasting(body);
	assert.equal(parsed.level, 1);
	assert.equal(parsed.abilityKey, "wis");
	assert.equal(parsed.saveDc, 11);
	assert.equal(parsed.attackBonus, 3);
	assert.equal(parsed.points, 5);
	assert.ok(parsed.powerNames.includes("Force Push/Pull"));
	assert.ok(parsed.powerNames.includes("Sense Force"));
});

test("parseTechcasting extracts BB astromech", () => {
	const body = `
***Techcasting.*** The droid is a 3rd-level techcaster. Its techcasting ability is Intelligence (tech save DC 13, +5 to hit with tech powers). It has 15 tech points and knows the following tech powers: 
At-will: *jet of flame, mending, minor hologram, on/off, wire line* <br>
1st-Level: *decryption program, expeditious retreat, hologram, repair droid, target lock* <br>
2nd-Level: *motivator boost, pyrotechnics, release*
`;
	const parsed = parseTechcasting(body);
	assert.equal(parsed.level, 3);
	assert.equal(parsed.points, 15);
	assert.equal(parsed.abilityKey, "int");
	assert.ok(parsed.powerNames.includes("On/Off"));
});

test("tight Force detection excludes Hssiss prose false positive", () => {
	const hssiss = detectFeatures(`
***Sith-Born.*** Dark forcecasters and Sith (species) have advantage on Animal Handling checks against hssiss.
A force-based Improved Restoration power cures the poison.
`);
	assert.equal(hssiss.hasForce, false);
	const youngling = detectFeatures(`
***Forcecasting.*** The youngling is a 1st-level forcecaster. It has 5 force points.
`);
	assert.equal(youngling.hasForce, true);
});

test("generator embeds Force powers with activities and point pool", () => {
	const body = `
*Small humanoid (human), light*
- Armor Class 12
- Hit Points 9 (2d8)
- Speed 30 ft.
| STR | DEX | CON | INT | WIS | CHA |
| 10 (+0) | 14 (+2) | 10 (+0) | 10 (+0) | 12 (+1) | 10 (+0) |
- Challenge 1/8 (25 XP)
***Forcecasting.*** The youngling is a 1st-level forcecaster. Its forcecasting ability is Wisdom (force save DC 11, +3 to hit with force attacks, 5 force points and knows the following force powers:
At-will: *force disarm, force push/pull*  <br>
1st-level: *force jump, sense force* <br>
### Actions
**Unarmed Strike.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 4 (1d4+2) kinetic damage.
`;
	const ir = createEmptyIrEntry({
		sourceName: "Synthetic Youngling",
		semanticKey: "snv:Humanoids: Force Users:synthetic-youngling",
		section: "Humanoids (Force Users)",
		features: detectFeatures(body),
		unsupportedMechanics: ["force-power-embedding-incomplete"],
		parseStatus: "parsed-valid",
		capabilityStatus: "partially-supported",
		outputSelection: "selected-edge-case",
		productionReadiness: "sandbox-only"
	});
	const { actor, exceptions, forceTechEmbed } = generateGeneralizedActor({ irEntry: ir, body });
	assert.equal(actor.system.details.powerForceLevel, 1);
	assert.equal(actor.system.powercasting.force.points.max, 5);
	const spells = actor.items.filter(i => i.type === "spell");
	assert.ok(spells.length >= 3, `expected embedded spells, got ${spells.map(s => s.name)}`);
	assert.ok(spells.every(s => Object.keys(s.system.activities || {}).length > 0));
	assert.ok(spells.some(s => s.system.consume?.target === "powercasting.force.points.value"));
	assert.ok(forceTechEmbed.embedded.some(e => e.name === "Force Jump"));
	assert.equal(exceptions.some(e => e.mechanic === "force-power-embedding-incomplete"), false);
});

test("generator embeds Tech powers for synthetic droid", () => {
	const body = `
*Small construct (droid), unaligned*
- Armor Class 13
- Hit Points 22 (4d6+8)
- Speed 30 ft.
| STR | DEX | CON | INT | WIS | CHA |
| 8 (-1) | 14 (+2) | 14 (+2) | 16 (+3) | 10 (+0) | 8 (-1) |
- Challenge 1 (200 XP)
***Techcasting.*** The droid is a 3rd-level techcaster. Its techcasting ability is Intelligence (tech save DC 13, +5 to hit with tech powers). It has 15 tech points and knows the following tech powers: 
At-will: *on/off* <br>
1st-Level: *hologram* <br>
### Actions
**Shock.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6+2) lightning damage.
`;
	const ir = createEmptyIrEntry({
		sourceName: "Synthetic Astromech",
		semanticKey: "snv:Droids:synthetic-astromech",
		section: "Droids",
		features: detectFeatures(body),
		unsupportedMechanics: ["tech-power-embedding-incomplete"],
		parseStatus: "parsed-valid",
		capabilityStatus: "partially-supported",
		outputSelection: "selected-edge-case",
		productionReadiness: "sandbox-only"
	});
	const { actor, exceptions } = generateGeneralizedActor({ irEntry: ir, body });
	assert.equal(actor.system.details.powerTechLevel, 3);
	assert.equal(actor.system.powercasting.tech.points.max, 15);
	const spells = actor.items.filter(i => i.type === "spell");
	assert.ok(spells.length >= 2);
	assert.ok(spells.some(s => s.system.consume?.target === "powercasting.tech.points.value" || s.system.level === 0));
	assert.equal(exceptions.some(e => e.mechanic === "tech-power-embedding-incomplete"), false);
});

test("maintainer-locked Tech aliases resolve to Capacity Boost and Shocking Ray", () => {
	buildCanonicalPowerIndex();
	const capacity = resolveCanonicalPower("Charge Power Cell", "tech");
	assert.equal(capacity.match, "exact-name");
	assert.equal(capacity.canonical.name, "Capacity Boost");
	assert.equal(capacity.canonical.id, "uYsjujidPJJ6EblO");
	const cloneCap = loadAndCloneCanonicalPower("Charge Power Cell", "tech");
	assert.equal(cloneCap.ok, true);
	assert.equal(cloneCap.clone.name, "Capacity Boost");
	assert.equal(cloneCap.clone.system.consume.target, "powercasting.tech.points.value");
	assert.ok(Object.keys(cloneCap.clone.system.activities || {}).length >= 1);
	assert.equal(Object.prototype.hasOwnProperty.call(cloneCap.clone.system, "preparation"), false);
	assert.ok(cloneCap.clone.system.method);

	const shocking = resolveCanonicalPower("Scorching Ray", "tech");
	assert.equal(shocking.match, "exact-name");
	assert.equal(shocking.canonical.name, "Shocking Ray");
	assert.equal(shocking.canonical.id, "iY0c4E1XdTKhd2H8");
	const cloneShock = loadAndCloneCanonicalPower("Scorching Ray", "tech");
	assert.equal(cloneShock.ok, true);
	assert.equal(cloneShock.clone.name, "Shocking Ray");
	assert.equal(cloneShock.clone.system.consume.target, "powercasting.tech.points.value");
	assert.ok(Object.keys(cloneShock.clone.system.activities || {}).length >= 1);
	assert.equal(Object.prototype.hasOwnProperty.call(cloneShock.clone.system, "preparation"), false);
});

test("parseSkills maps Piloting/Acrobatics abilities and never emits NaN check bonuses", () => {
	const abilities = { str: 14, dex: 18, con: 12, int: 16, wis: 14, cha: 16 };
	const skills = parseSkills(
		"Skills** Acrobatics +11, Piloting +5, Deception +10, Insight +10, Sleight of Hand +11, Perception +10",
		abilities,
		6,
		{ sourceName: "Test Actor" }
	);
	assert.equal(skills.pil.ability, "int");
	assert.equal(skills.acr.ability, "dex");
	assert.equal(skills.dec.ability, "cha");
	assert.equal(skills.ins.ability, "wis");
	assert.equal(skills.slt.ability, "dex");
	for ( const [key, cfg] of Object.entries(skills) ) {
		assert.equal(/\bNaN\b/i.test(String(cfg.checkBonus)), false, key);
		assert.ok(Number.isFinite(cfg.value), key);
	}
	assert.ok(skills.pil);
	assert.notEqual(String(skills.pil.checkBonus), "NaN");
});

test("runtime automation must not read deprecated SpellData#preparation API", () => {
	// Contract: clones must expose method/prepared only (no serialized preparation blob).
	const cloneCap = loadAndCloneCanonicalPower("Capacity Boost", "tech");
	assert.equal(cloneCap.ok, true);
	assert.equal(Object.prototype.hasOwnProperty.call(cloneCap.clone.system, "preparation"), false);
	assert.ok(cloneCap.clone.system.method);
	assert.equal(typeof cloneCap.clone.system.prepared, "boolean");
	// Harness scripts must not inspect the deprecated getter path for display.
	const embed = fs.readFileSync(new URL("./embed-casting.mjs", import.meta.url), "utf8");
	assert.equal(/system\.preparation\?\.(mode|prepared)/.test(embed), false);
});

test("exact-folder artwork resolves approved local Avatar/Token over npc.svg", () => {
	const art = resolveExactMonsterArtwork("Navy Trooper", { folderId: "a907e6b54e75b9d3" });
	assert.equal(art.artworkException, null);
	assert.match(art.avatarPath, /036_-_Navy_Trooper\/Avatar\.webp$/);
	assert.match(art.tokenPath, /036_-_Navy_Trooper\/Token\.webp$/);
	assert.equal(art.approvalStatus, "approved");
	const hyphenated = resolveExactMonsterArtwork("Front Line Soldier", { folderId: "a907e6b54e75b9d3" });
	assert.equal(hyphenated.artworkException, null);
	assert.match(hyphenated.avatarPath, /371_-_Front-Line_Soldier\/Avatar\.webp$/);
});

console.log(`\n${passed} fts embedding tests passed`);
