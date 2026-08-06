/**
 * Validate production snv-monsters Actors for nonfinite numbers, unsafe formulas,
 * skill NaN bonuses, and deprecated spell preparation blobs.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ROOT } from "./paths.mjs";

const PACK = path.join(ROOT, "packs/_source/snv-monsters");

function walkYml(dir, out = []) {
	if ( !fs.existsSync(dir) ) return out;
	for ( const ent of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const p = path.join(dir, ent.name);
		if ( ent.isDirectory() ) walkYml(p, out);
		else if ( ent.name.endsWith(".yml") && ent.name !== "_folder.yml" ) out.push(p);
	}
	return out;
}

function pushIssue(issues, actor, field, value, category) {
	issues.push({
		actorId: actor._id,
		name: actor.name,
		semanticKey: actor.flags?.sw5e?.snvMonsters?.semanticKey || null,
		yamlPath: actor.__yamlPath || null,
		field,
		value,
		category
	});
}

function scanValue(issues, actor, field, value) {
	if ( value === null || value === undefined ) return;
	if ( typeof value === "number" ) {
		if ( !Number.isFinite(value) ) {
			pushIssue(issues, actor, field, value, "nonfinite-number");
		}
		return;
	}
	if ( typeof value === "string" ) {
		if ( /\bNaN\b/i.test(value) ) pushIssue(issues, actor, field, value, "string-NaN");
		else if ( /\bInfinity\b/i.test(value) ) pushIssue(issues, actor, field, value, "string-Infinity");
		return;
	}
}

/**
 * @param {object} actor
 * @param {string} [yamlPath]
 */
export function validateActorFiniteData(actor, yamlPath = null) {
	const tagged = { ...actor, __yamlPath: yamlPath };
	const issues = [];
	const skills = actor.system?.skills || {};
	for ( const [skillKey, skill] of Object.entries(skills) ) {
		scanValue(issues, tagged, `system.skills.${skillKey}.value`, skill?.value);
		scanValue(issues, tagged, `system.skills.${skillKey}.bonuses.check`, skill?.bonuses?.check);
		scanValue(issues, tagged, `system.skills.${skillKey}.bonuses.passive`, skill?.bonuses?.passive);
	}
	for ( const [ability, block] of Object.entries(actor.system?.abilities || {}) ) {
		scanValue(issues, tagged, `system.abilities.${ability}.value`, block?.value);
		scanValue(issues, tagged, `system.abilities.${ability}.bonuses.check`, block?.bonuses?.check);
		scanValue(issues, tagged, `system.abilities.${ability}.bonuses.save`, block?.bonuses?.save);
	}
	const attrs = actor.system?.attributes || {};
	scanValue(issues, tagged, "system.attributes.hp.value", attrs.hp?.value);
	scanValue(issues, tagged, "system.attributes.hp.max", attrs.hp?.max);
	scanValue(issues, tagged, "system.attributes.ac.flat", attrs.ac?.flat);
	scanValue(issues, tagged, "system.details.cr", actor.system?.details?.cr);

	let preparationCount = 0;
	for ( const item of actor.items || [] ) {
		if ( item.type === "spell" && item.system && Object.prototype.hasOwnProperty.call(item.system, "preparation") ) {
			preparationCount += 1;
			pushIssue(
				issues,
				tagged,
				`items[${item.name}].system.preparation`,
				item.system.preparation,
				"deprecated-spell-preparation"
			);
		}
		for ( const [actId, act] of Object.entries(item.system?.activities || {}) ) {
			scanValue(issues, tagged, `items[${item.name}].activities.${actId}.attack.bonus`, act?.attack?.bonus);
		}
	}
	return { ok: issues.filter(i => i.category !== "deprecated-spell-preparation").length === 0, issues, preparationCount };
}

export function validateAllProductionActors({ includeDeprecatedPreparation = true } = {}) {
	const files = walkYml(PACK);
	const actors = [];
	const allIssues = [];
	let skillRecords = 0;
	for ( const file of files ) {
		const doc = yaml.load(fs.readFileSync(file, "utf8"));
		if ( !doc || doc._key?.startsWith("!folders") ) continue;
		if ( doc.type && doc.type !== "npc" && doc.type !== "character" && doc.type !== "vehicle" ) continue;
		skillRecords += Object.keys(doc.system?.skills || {}).length;
		const rel = path.relative(ROOT, file).split(path.sep).join("/");
		const result = validateActorFiniteData(doc, rel);
		actors.push({
			id: doc._id,
			name: doc.name,
			path: rel,
			ok: result.ok,
			issueCount: result.issues.length
		});
		const issues = includeDeprecatedPreparation
			? result.issues
			: result.issues.filter(i => i.category !== "deprecated-spell-preparation");
		allIssues.push(...issues);
	}
	const blocking = allIssues.filter(i => i.category !== "deprecated-spell-preparation");
	const byCategory = {};
	for ( const issue of allIssues ) {
		byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
	}
	const affectedActors = [...new Set(blocking.map(i => i.actorId))];
	return {
		actorsScanned: actors.length,
		skillRecordsScanned: skillRecords,
		actorsAffected: affectedActors.length,
		fieldsAffected: blocking.length,
		causesByCategory: byCategory,
		issues: allIssues,
		blockingIssues: blocking,
		ok: blocking.length === 0
	};
}

const isDirectRun = process.argv[1] && path.basename(process.argv[1]) === "validate-actor-finite.mjs";
if ( isDirectRun ) {
	const report = validateAllProductionActors();
	const outDir = path.join(ROOT, "ai/audits/snv-monsters-compendium/n3/fts-embedding");
	fs.mkdirSync(outDir, { recursive: true });
	fs.writeFileSync(path.join(outDir, "skill-nan-census.json"), `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify({
		ok: report.ok,
		actorsScanned: report.actorsScanned,
		skillRecordsScanned: report.skillRecordsScanned,
		actorsAffected: report.actorsAffected,
		fieldsAffected: report.fieldsAffected,
		causesByCategory: report.causesByCategory,
		sample: report.blockingIssues.slice(0, 20)
	}, null, 2));
	if ( !report.ok ) process.exitCode = 2;
}
