/**
 * Surgical remediation: replace empty-Activity Force/Tech spell Items on existing
 * production Actors while preserving Actor ID, folder, and non-spell Items.
 *
 * Usage: node utils/snv-monsters/fts-remediate-casting.mjs --write "Inquisitor, Grand" "ISB Infiltrator"
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { embedForceTechPowers } from "./embed-casting.mjs";
import { loadProductionIdentityMap } from "./identity.mjs";
import { loadAuthoritativeSnVSource, splitCreatureBlocks } from "./parse.mjs";
import { ROOT } from "./paths.mjs";
import { slugifyName } from "./parse-helpers.mjs";

const DUMP = { lineWidth: 120, noRefs: true, quotingType: "\"" };
const PACK = path.join(ROOT, "packs/_source/snv-monsters");
const AUDIT = path.join(ROOT, "ai/audits/snv-monsters-compendium/n3/fts-embedding");

function findYaml(name) {
	const slug = slugifyName(name);
	for ( const ent of fs.readdirSync(PACK, { withFileTypes: true }) ) {
		if ( !ent.isDirectory() ) continue;
		const p = path.join(PACK, ent.name, `${slug}.yml`);
		if ( fs.existsSync(p) ) return p;
	}
	return null;
}

function loadBodies() {
	const { markdown } = loadAuthoritativeSnVSource();
	const map = new Map();
	for ( const block of splitCreatureBlocks(markdown) ) {
		map.set(block.name, { section: block.section, body: block.lines.join("\n"), semanticKey: `snv:${block.section}:${slugifyName(block.name)}` });
	}
	return map;
}

function remediate(name, map) {
	const yamlPath = findYaml(name);
	if ( !yamlPath ) throw new Error(`no yaml for ${name}`);
	const bodies = loadBodies();
	const entry = bodies.get(name);
	if ( !entry ) throw new Error(`no source for ${name}`);
	const actor = yaml.load(fs.readFileSync(yamlPath, "utf8"));
	const beforeSpells = (actor.items || []).filter(i => i.type === "spell").length;
	const beforeEmpty = (actor.items || []).filter(
		i => i.type === "spell" && !Object.keys(i.system?.activities || {}).length
	).length;

	// Remove prior spell Items and casting feats so embed can re-insert cleanly.
	actor.items = (actor.items || []).filter(i => {
		if ( i.type === "spell" ) return false;
		if ( /^(?:Innate\s+)?(?:Force|Tech)casting$/i.test(i.name) ) return false;
		return true;
	});

	const semanticKey = Object.entries(map.actors || {}).find(([, a]) => a.name === name)?.[0]
		|| entry.semanticKey;
	const actorIdentity = map.actors[semanticKey] || {
		id: actor._id,
		name: actor.name,
		items: {}
	};

	const irEntry = { semanticKey, sourceName: name };
	const { exceptions, embedded } = embedForceTechPowers({
		actor,
		body: entry.body,
		irEntry,
		actorIdentity,
		nonproduction: false
	});

	actor.flags = actor.flags || {};
	actor.flags.sw5e = actor.flags.sw5e || {};
	actor.flags.sw5e.snvMonsters = {
		...(actor.flags.sw5e.snvMonsters || {}),
		forceTechEmbedding: {
			remediated: "2026-08-06",
			forcePowers: embedded.filter(e => e.castType === "force"),
			techPowers: embedded.filter(e => e.castType === "tech"),
			missingCanonical: exceptions.filter(e => e.type === "canonical-match-missing")
		}
	};

	// Pin new spell/casting item IDs into identity map without changing Actor id.
	if ( !map.actors[semanticKey] ) {
		map.actors[semanticKey] = {
			id: actor._id,
			name: actor.name,
			folderId: actor.folder,
			key: `!actors!${actor._id}`,
			items: {},
			pinned: true,
			origin: "fts-remediate-casting"
		};
	}
	const pinned = map.actors[semanticKey];
	pinned.id = actor._id;
	pinned.key = `!actors!${actor._id}`;
	for ( const item of actor.items ) {
		if ( item.type === "spell" || /^(?:Innate\s+)?(?:Force|Tech)casting$/i.test(item.name) ) {
			pinned.items[item._id] = {
				id: item._id,
				name: item.name,
				type: item.type,
				key: item._key,
				activities: Object.fromEntries(
					Object.keys(item.system?.activities || {}).map(id => [id, { id, pinned: true, origin: "fts-remediate-casting" }])
				),
				pinned: true,
				origin: "fts-remediate-casting"
			};
		}
	}

	fs.writeFileSync(yamlPath, `${yaml.dump(actor, DUMP)}\n`);
	const afterSpells = (actor.items || []).filter(i => i.type === "spell").length;
	const afterEmpty = (actor.items || []).filter(
		i => i.type === "spell" && !Object.keys(i.system?.activities || {}).length
	).length;
	return {
		name,
		path: path.relative(ROOT, yamlPath).split(path.sep).join("/"),
		actorId: actor._id,
		beforeSpells,
		beforeEmpty,
		afterSpells,
		afterEmpty,
		embedded: embedded.length,
		exceptions,
		forcePts: actor.system?.powercasting?.force?.points?.max ?? null,
		techPts: actor.system?.powercasting?.tech?.points?.max ?? null
	};
}

const args = process.argv.slice(2);
if ( args[0] !== "--write" || args.length < 2 ) {
	console.error("Usage: node utils/snv-monsters/fts-remediate-casting.mjs --write <Name> [Name...]");
	process.exit(1);
}
const names = args.slice(1);
const mapPath = path.join(ROOT, "utils/snv-monsters/manifests/identity-map.json");
const map = loadProductionIdentityMap(mapPath);
const results = names.map(n => remediate(n, map));
fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
fs.mkdirSync(AUDIT, { recursive: true });
fs.writeFileSync(path.join(AUDIT, "fts-n1-remediate-result.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
const bad = results.filter(r => r.afterEmpty > 0 || r.exceptions.some(e => e.type === "activities-missing"));
if ( bad.length ) process.exitCode = 2;
