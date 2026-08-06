/**
 * Remediate production snv-monsters Actors:
 * 1) Rebuild skill proficiency / check bonuses from authoritative SnV source.
 * 2) Strip deprecated SpellData#preparation from embedded spell Items while
 *    preserving method/prepared.
 *
 * Usage: node utils/snv-monsters/remediate-skill-nan.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { stripBlockquotes } from "./classify.mjs";
import {
	parseSkills,
	assertSafeFormula
} from "./generate-generalized.mjs";
import { loadAuthoritativeSnVSource, splitCreatureBlocks } from "./parse.mjs";
import { ROOT } from "./paths.mjs";
import { validateAllProductionActors } from "./validate-actor-finite.mjs";

const DUMP = { lineWidth: 120, noRefs: true, quotingType: "\"" };
const PACK = path.join(ROOT, "packs/_source/snv-monsters");
const AUDIT = path.join(ROOT, "ai/audits/snv-monsters-compendium/n3/fts-embedding");

function walkYml(dir, out = []) {
	for ( const ent of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const p = path.join(dir, ent.name);
		if ( ent.isDirectory() ) walkYml(p, out);
		else if ( ent.name.endsWith(".yml") && ent.name !== "_folder.yml" ) out.push(p);
	}
	return out;
}

function parseAbilitiesFromActor(actor) {
	const out = {};
	for ( const [k, v] of Object.entries(actor.system?.abilities || {}) ) {
		out[k] = Number(v?.value ?? 10);
	}
	return out;
}

function parseProficiencyBonusFromActor(actor) {
	const explicit = Number(actor.system?.attributes?.prof);
	if ( Number.isFinite(explicit) && explicit > 0 ) return explicit;
	const cr = actor.system?.details?.cr;
	const crNum = typeof cr === "string" && cr.includes("/")
		? Number(cr.split("/")[0]) / Number(cr.split("/")[1])
		: Number(cr);
	if ( !Number.isFinite(crNum) ) return 2;
	if ( crNum <= 4 ) return 2;
	if ( crNum <= 8 ) return 3;
	if ( crNum <= 12 ) return 4;
	if ( crNum <= 16 ) return 5;
	if ( crNum <= 20 ) return 6;
	if ( crNum <= 24 ) return 7;
	if ( crNum <= 28 ) return 8;
	return 9;
}

function stripPreparation(item) {
	if ( item.type !== "spell" || !item.system ) return false;
	if ( !Object.prototype.hasOwnProperty.call(item.system, "preparation") ) return false;
	const prep = item.system.preparation;
	if ( item.system.method == null && prep?.mode ) {
		item.system.method = prep.mode === "prepared" || prep.mode === "always"
			? "powerCasting"
			: prep.mode;
	}
	if ( item.system.prepared == null && typeof prep?.prepared === "boolean" ) {
		item.system.prepared = prep.prepared;
	}
	if ( item.system.method == null ) item.system.method = "powerCasting";
	if ( item.system.prepared == null ) item.system.prepared = true;
	delete item.system.preparation;
	return true;
}

function remediateActor(doc, bodyByName) {
	const body = bodyByName.get(doc.name);
	const changes = {
		name: doc.name,
		id: doc._id,
		skillsRewritten: [],
		skillsCleared: [],
		preparationStripped: 0,
		errors: []
	};

	// Reset all skill bonuses/proficiency, then apply source-derived values when body exists.
	for ( const skill of Object.values(doc.system?.skills || {}) ) {
		skill.value = 0;
		skill.bonuses = skill.bonuses || {};
		skill.bonuses.check = "";
		skill.bonuses.passive = "";
	}

	if ( body ) {
		const text = stripBlockquotes(body);
		const abilities = parseAbilitiesFromActor(doc);
		const pb = parseProficiencyBonusFromActor(doc);
		try {
			const parsed = parseSkills(text, abilities, pb, { sourceName: doc.name });
			for ( const [skillKey, config] of Object.entries(parsed) ) {
				if ( !doc.system.skills?.[skillKey] ) continue;
				doc.system.skills[skillKey].value = config.value;
				if ( config.ability ) doc.system.skills[skillKey].ability = config.ability;
				doc.system.skills[skillKey].bonuses.check = assertSafeFormula(
					config.checkBonus ?? "",
					`system.skills.${skillKey}.bonuses.check`,
					{ sourceName: doc.name, skillKey }
				);
				doc.system.skills[skillKey].bonuses.passive = "";
				changes.skillsRewritten.push({
					skillKey,
					value: config.value,
					checkBonus: config.checkBonus,
					ability: config.ability
				});
			}
		} catch ( err ) {
			changes.errors.push(String(err?.message || err));
		}
	}

	// Clear any residual NaN that may remain on skills not present in source.
	for ( const [skillKey, skill] of Object.entries(doc.system?.skills || {}) ) {
		const check = skill?.bonuses?.check;
		if ( typeof check === "string" && /\bNaN\b/i.test(check) ) {
			skill.bonuses.check = "";
			changes.skillsCleared.push(skillKey);
		}
		if ( typeof check === "number" && !Number.isFinite(check) ) {
			skill.bonuses.check = "";
			changes.skillsCleared.push(skillKey);
		}
	}

	for ( const item of doc.items || [] ) {
		if ( stripPreparation(item) ) changes.preparationStripped += 1;
	}

	return changes;
}

const write = process.argv.includes("--write");
const { markdown } = loadAuthoritativeSnVSource();
const bodyByName = new Map(
	splitCreatureBlocks(markdown).map(b => [b.name, b.lines.join("\n")])
);

const before = validateAllProductionActors();
const results = [];
for ( const file of walkYml(PACK) ) {
	const doc = yaml.load(fs.readFileSync(file, "utf8"));
	if ( !doc?._id || doc._key?.startsWith("!folders") ) continue;
	if ( doc.type && !["npc", "character", "vehicle"].includes(doc.type) ) continue;
	const changes = remediateActor(doc, bodyByName);
	changes.path = path.relative(ROOT, file).split(path.sep).join("/");
	results.push(changes);
	if ( write ) fs.writeFileSync(file, `${yaml.dump(doc, DUMP)}\n`);
}

const after = write ? validateAllProductionActors({ includeDeprecatedPreparation: true }) : null;
fs.mkdirSync(AUDIT, { recursive: true });
const report = {
	write,
	before: {
		ok: before.ok,
		actorsAffected: before.actorsAffected,
		fieldsAffected: before.fieldsAffected,
		causesByCategory: before.causesByCategory
	},
	after: after && {
		ok: after.ok,
		actorsAffected: after.actorsAffected,
		fieldsAffected: after.fieldsAffected,
		causesByCategory: after.causesByCategory,
		deprecatedPreparationRemaining: after.causesByCategory["deprecated-spell-preparation"] || 0
	},
	actorsTouched: results.length,
	preparationStrippedTotal: results.reduce((n, r) => n + r.preparationStripped, 0),
	actorsWithSkillRewrites: results.filter(r => r.skillsRewritten.length).length,
	actorsWithErrors: results.filter(r => r.errors.length),
	sampleRewrites: results.filter(r => r.skillsRewritten.some(s => ["pil", "acr", "dec", "ins", "slt"].includes(s.skillKey))).slice(0, 10)
};
fs.writeFileSync(path.join(AUDIT, "skill-nan-remediate-result.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if ( write && after && !after.ok ) process.exitCode = 2;
if ( results.some(r => r.errors.length) ) process.exitCode = 2;
