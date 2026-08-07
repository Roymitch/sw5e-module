import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ARTWORK_GENERATION_QUEUE_PATH, ensureArtworkGenerationRoot } from "./artwork-evidence.mjs";
import { findExactMonsterArtworkFolder } from "./artwork.mjs";
import { COMMITTED_PACK_SOURCE } from "./paths.mjs";
import { normalizeName } from "./parse-helpers.mjs";

export const PILOT_ACTOR_NAMES = Object.freeze([
	"Clodhopper Swarm",
	"Kell Dragon",
	"Mole Serpent",
	"Destroyer Droideka",
	"3P0 Series Droid",
	"Purge Trooper, Commander",
	"Vesuvague Vines",
	"Umrach"
]);

function walkYamlFiles(dir, out = []) {
	if ( !fs.existsSync(dir) ) return out;
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const fullPath = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walkYamlFiles(fullPath, out);
		else if ( entry.name.endsWith(".yml") && entry.name !== "_folder.yml" ) out.push(fullPath);
	}
	return out;
}

function readActorDocs(packSourceRoot) {
	return walkYamlFiles(packSourceRoot).flatMap(filePath => {
		try {
			const doc = yaml.load(fs.readFileSync(filePath, "utf8"));
			if ( !doc?.name ) return [];
			return [{ filePath, doc }];
		} catch {
			return [];
		}
	});
}

function pilotPriority(sourceName) {
	const index = PILOT_ACTOR_NAMES.findIndex(name => normalizeName(name) === normalizeName(sourceName));
	return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function queueEntry({ filePath, doc, includeLegacyFallbacks, monsterIconRoot }) {
	const artwork = doc?.flags?.sw5e?.snvMonsters?.artwork || {};
	const replacementStatus = artwork.replacementStatus || null;
	const isNeedsReplacement = replacementStatus === "needs-replacement";
	const isLegacyFallback = includeLegacyFallbacks
		&& !replacementStatus
		&& artwork.path === "systems/dnd5e/icons/svg/actors/npc.svg";
	if ( !isNeedsReplacement && !isLegacyFallback ) return null;
	if ( findExactMonsterArtworkFolder(doc.name, { monsterIconRoot }) ) return null;
	return {
		sourceName: doc.name,
		sourceIdentity: doc?.flags?.sw5e?.snvMonsters?.semanticKey || null,
		creatureTypeFolder: doc?.flags?.sw5e?.snvMonsters?.creatureTypeFolder || null,
		yamlPath: filePath,
		currentArtworkPath: artwork.path || doc.img || null,
		replacementStatus: replacementStatus || "legacy-fallback",
		queueReason: isNeedsReplacement ? "needs-replacement" : "legacy-fallback",
		cohort: pilotPriority(doc.name) === Number.MAX_SAFE_INTEGER ? "bounded-expansion" : "pilot",
		priority: pilotPriority(doc.name)
	};
}

export function buildArtworkQueue({
	packSourceRoot = COMMITTED_PACK_SOURCE,
	monsterIconRoot,
	includeLegacyFallbacks = false,
	generatedOn = null
} = {}) {
	const entries = readActorDocs(packSourceRoot)
		.map(entry => queueEntry({ ...entry, includeLegacyFallbacks, monsterIconRoot }))
		.filter(Boolean)
		.sort((left, right) => {
			if ( left.priority !== right.priority ) return left.priority - right.priority;
			if ( left.creatureTypeFolder !== right.creatureTypeFolder ) {
				return String(left.creatureTypeFolder || "").localeCompare(String(right.creatureTypeFolder || ""));
			}
			return left.sourceName.localeCompare(right.sourceName);
		});
	return {
		generatedOn,
		includeLegacyFallbacks,
		pilotActorNames: [...PILOT_ACTOR_NAMES],
		total: entries.length,
		entries
	};
}

export function writeArtworkQueue(opts = {}) {
	ensureArtworkGenerationRoot();
	const queue = buildArtworkQueue(opts);
	fs.writeFileSync(ARTWORK_GENERATION_QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
	return ARTWORK_GENERATION_QUEUE_PATH;
}
