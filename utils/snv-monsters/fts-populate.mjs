/**
 * Build FTS population candidate ledgers and produce Actors.
 * Usage: node utils/snv-monsters/fts-populate.mjs --prepare fts-p1
 *        node utils/snv-monsters/fts-populate.mjs --write fts-p1
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import crypto from "node:crypto";
import {
	CREATURE_TYPE_FOLDERS,
	getCreatureTypeFolder,
	parseCreatureTypeFromDescriptorPart,
	resolveCreatureTypeFolderLabel
} from "./creature-type-folders.mjs";
import { detectFeatures, deriveCapability, stripBlockquotes } from "./classify.mjs";
import { embedForceTechPowers, embedSuperiorityManeuvers } from "./embed-casting.mjs";
import { generateGeneralizedActor } from "./generate-generalized.mjs";
import {
	buildProductionIdentityPlan,
	loadProductionIdentityMap,
	mergeIdentityMap,
	summarizeIdentityAddition
} from "./identity.mjs";
import { createEmptyIrEntry } from "./ir-schema.mjs";
import { loadAuthoritativeSnVSource, splitCreatureBlocks, sha256, semanticKeyFor } from "./parse.mjs";
import { parseForcecasting, parseTechcasting } from "./parse-casting.mjs";
import { COMMITTED_PACK_SOURCE, ROOT } from "./paths.mjs";
import { normalizeName, slugifyName } from "./parse-helpers.mjs";

const DUMP = { lineWidth: 120, noRefs: true, quotingType: "\"" };
const AUDIT = path.join(ROOT, "ai/audits/snv-monsters-compendium/n3/fts-embedding");

function shortHash(seed) {
	return crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 16);
}

function parseDescriptorType(body) {
	const text = stripBlockquotes(body);
	const line = text.split("\n").map(l => l.trim()).find(l => /^\*[^*]+\*$/.test(l));
	if ( !line ) return { value: "custom", custom: "unknown" };
	const descriptor = line.replace(/^\*|\*$/g, "").trim();
	const afterSize = descriptor.replace(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+/i, "");
	const [typePart] = afterSize.split(/\s*,\s*/, 2);
	return parseCreatureTypeFromDescriptorPart(typePart);
}

/** Minimal feature split for production exactFeatures accounting. */
function classifySourceFeatures(body) {
	const text = stripBlockquotes(body);
	const weaponAttacks = [];
	const nonAttackActions = [];
	const passives = [];
	const attackNameRe = /\*\*\*([^*]+)\.\*\*\*\s*\*?(?:Melee|Ranged) Weapon Attack:\*?\s*[+-]\d+/gi;
	let match;
	while ( (match = attackNameRe.exec(text)) ) {
		weaponAttacks.push(match[1].trim());
	}
	const actionBlock = text.match(/###\s+Actions\b([\s\S]*?)(?=###\s+|\pagebreakNum|$)/i)?.[1] || "";
	const actionNames = [...actionBlock.matchAll(/\*\*\*([^*]+)\.\*\*\*/g)].map(m => m[1].trim());
	for ( const name of actionNames ) {
		if ( weaponAttacks.includes(name) ) continue;
		nonAttackActions.push(name);
	}
	const traitRegion = text.split(/###\s+Actions\b/i)[0] || text;
	for ( const m of traitRegion.matchAll(/\*\*\*([^*]+)\.\*\*\*/g) ) {
		const name = m[1].trim();
		if ( /^(?:Innate\s+)?(?:Force|Tech)casting$/i.test(name) ) continue;
		if ( /^Superiority$/i.test(name) ) continue;
		passives.push(name);
	}
	return {
		passives: [...new Set(passives)],
		nonAttackActions: [...new Set(nonAttackActions)],
		weaponAttacks: [...new Set(weaponAttacks)]
	};
}

function loadBodies() {
	const { markdown } = loadAuthoritativeSnVSource();
	const map = new Map();
	for ( const block of splitCreatureBlocks(markdown) ) {
		map.set(block.name, { section: block.section, body: block.lines.join("\n") });
	}
	return map;
}

const BATCHES = {
	"fts-p1": {
		names: [
			"BB Series Astromech Droid",
			"Jedi Youngling",
			"Nekghoul",
			"Jubba Bird"
		],
		origin: "fts-p1-approved",
		packPhase: "fts-p1-tracked"
	},
	"fts-force-aberration-1": {
		names: [
			"Nekghoul Adept",
			"Nekghoul Mystic",
			"Nekghoul Savage",
			"Nekghoul Tormenter",
			"Starweird"
		],
		origin: "fts-force-aberration-1-approved",
		packPhase: "fts-force-aberration-1"
	},
	"fts-tech-droids-1": {
		names: [
			"000 Series Protocol Droid",
			"C1 Series Astromech Droid",
			"R2 Series Astromech Droid",
			"Super Tactical Droid",
			"T-Series Tactical Droid",
			"T3-Series Utility Droid"
		],
		origin: "fts-tech-droids-1-approved",
		packPhase: "fts-tech-droids-1"
	},
	"fts-force-aberration-2": {
		names: [
			"Manifestation of Abeloth",
			"Vessel of Abeloth"
		],
		origin: "fts-force-aberration-2-approved",
		packPhase: "fts-force-aberration-2"
	},
	"fts-force-beasts-1": {
		names: [
			"Maalraas, Adolescent",
			"Maalraas, Nighthunter"
		],
		origin: "fts-force-beasts-1-approved",
		packPhase: "fts-force-beasts-1"
	},
	"fts-nonforce-aberration-reopen": {
		names: [
			"Hssiss",
			"Leviathan",
			"Sea Leviathan",
			"Terentatek",
			"Terentatek Mauler",
			"Tuk'ata",
			"War Wyrm"
		],
		origin: "fts-nonforce-aberration-reopen-approved",
		packPhase: "fts-nonforce-aberration-reopen",
		note: "Former false-positive Force flags; produce without Force embedding"
	},
	"fts-tech-misc-1": {
		names: [
			"Roggwart"
		],
		origin: "fts-tech-misc-1-approved",
		packPhase: "fts-tech-misc-1"
	}
};

function buildLedger(batchId) {
	const spec = BATCHES[batchId];
	if ( !spec ) throw new Error(`unknown batch ${batchId}`);
	const bodies = loadBodies();
	const actors = [];
	for ( const name of spec.names ) {
		const entry = bodies.get(name);
		if ( !entry ) throw new Error(`missing source ${name}`);
		const features = classifySourceFeatures(entry.body);
		const typeDetails = parseDescriptorType(entry.body);
		const resolvedFolder = resolveCreatureTypeFolderLabel(typeDetails);
		if ( resolvedFolder.unresolved ) {
			throw new Error(`unresolved creature type for ${name}: ${resolvedFolder.reason}`);
		}
		const folder = getCreatureTypeFolder(resolvedFolder.label);
		if ( !folder ) throw new Error(`cannot resolve folder for ${name} label=${resolvedFolder.label}`);
		const semanticKey = semanticKeyFor(entry.section, name);
		const detected = detectFeatures(entry.body);
		const force = parseForcecasting(entry.body);
		const tech = parseTechcasting(entry.body);
		actors.push({
			sourceName: name,
			name,
			semanticKey,
			sourceHash: sha256(`${name}\n${entry.body}`),
			yamlPath: `packs/_source/snv-monsters/${folder.packSubdir}/${slugifyName(name)}.yml`,
			passives: features.passives,
			nonAttackActions: features.nonAttackActions,
			weaponAttacks: features.weaponAttacks,
			traitsAndActions: features,
			artwork: {
				avatarPath: "systems/dnd5e/icons/svg/actors/npc.svg",
				tokenPath: "systems/dnd5e/icons/svg/actors/npc.svg",
				approvalStatus: "approved-fallback",
				folderId: folder.id,
				artworkException: "npc-svg-fallback"
			},
			folderAssignment: {
				folderName: folder.label,
				folderId: folder.id,
				folderSemanticKey: folder.semanticKey
			},
			detected,
			force,
			tech,
			typeDetails
		});
	}
	const itemCount = actors.reduce((n, a) => n + a.passives.length + a.nonAttackActions.length + a.weaponAttacks.length, 0);
	const activityCount = actors.reduce((n, a) => n + a.weaponAttacks.length, 0);
	// casting feats + powers counted separately in identity when pinned from generation; ledger uses combat features only
	const ledger = {
		schemaVersion: "fts-population-candidate-0.1",
		date: "2026-08-06",
		slice: { batchId, populationSliceId: batchId.toUpperCase() },
		folderAssignment: actors[0]?.folderAssignment,
		actors,
		finalCandidates: actors.map(a => ({
			name: a.name,
			semanticKey: a.semanticKey,
			passives: a.passives,
			nonAttackActions: a.nonAttackActions,
			weaponAttacks: a.weaponAttacks,
			artwork: a.artwork,
			folderAssignment: a.folderAssignment
		})),
		counts: {
			actors: actors.length,
			items: itemCount,
			activities: activityCount
		},
		compiledExpectations: {
			expectedYamlPaths: actors.map(a => a.yamlPath),
			expectedSemanticKeys: actors.map(a => a.semanticKey)
		},
		note: spec.note || null
	};
	fs.mkdirSync(AUDIT, { recursive: true });
	const ledgerPath = path.join(AUDIT, `${batchId}-candidate-ledger.json`);
	fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
	return { ledger, ledgerPath, spec };
}

function pinIdentity(batchId, ledger, spec) {
	const mapPath = path.join(ROOT, "utils/snv-monsters/manifests/identity-map.json");
	const map = loadProductionIdentityMap(mapPath);
	// Ensure creature-type folders exist
	for ( const folder of Object.values(CREATURE_TYPE_FOLDERS) ) {
		if ( !map.folders[folder.semanticKey] ) {
			map.folders[folder.semanticKey] = {
				id: folder.id,
				name: folder.label,
				key: `!folders!${folder.id}`,
				pinned: true,
				origin: "n3-folder-taxonomy",
				folderTaxonomy: "foundry-creature-type"
			};
		}
	}
	const actors = {};
	for ( const candidate of ledger.finalCandidates ) {
		const existing = map.actors?.[candidate.semanticKey];
		// Preserve production Actor IDs on re-write / remediation.
		const actorId = existing?.id || shortHash(`${batchId}-actor:${candidate.semanticKey}`);
		const folderId = candidate.folderAssignment.folderId;
		const actor = {
			id: actorId,
			name: candidate.name,
			folderId,
			key: `!actors!${actorId}`,
			items: { ...(existing?.items || {}) },
			pinned: true,
			origin: existing?.origin || spec.origin,
			batch: batchId
		};
		for ( const itemName of [...candidate.passives, ...candidate.nonAttackActions] ) {
			const prior = Object.values(actor.items).find(i => i.name === itemName && i.type === "feat");
			const itemId = prior?.id || shortHash(`${batchId}-item:${candidate.semanticKey}:${itemName}`);
			actor.items[itemId] = {
				id: itemId,
				name: itemName,
				type: "feat",
				key: `!actors.items!${actorId}.${itemId}`,
				activities: prior?.activities || {},
				pinned: true,
				origin: prior?.origin || spec.origin
			};
		}
		for ( const itemName of candidate.weaponAttacks ) {
			const prior = Object.values(actor.items).find(i => i.name === itemName && i.type === "weapon");
			const itemId = prior?.id || shortHash(`${batchId}-item:${candidate.semanticKey}:${itemName}`);
			const activityId = prior
				? Object.keys(prior.activities || {})[0]
				: shortHash(`${batchId}-activity:${candidate.semanticKey}:${itemName}:attack`);
			actor.items[itemId] = {
				id: itemId,
				name: itemName,
				type: "weapon",
				key: `!actors.items!${actorId}.${itemId}`,
				activities: { [activityId]: { id: activityId, pinned: true, origin: prior?.origin || spec.origin } },
				pinned: true,
				origin: prior?.origin || spec.origin
			};
		}
		actors[candidate.semanticKey] = actor;
	}
	const merged = mergeIdentityMap(map, { actors });
	fs.writeFileSync(mapPath, `${JSON.stringify(merged, null, 2)}\n`);
	return merged;
}

function writeBatch(batchId) {
	const { ledger, ledgerPath, spec } = buildLedger(batchId);
	const mapPath = path.join(ROOT, "utils/snv-monsters/manifests/identity-map.json");
	let map = pinIdentity(batchId, ledger, spec);
	const bodies = loadBodies();
	const written = [];
	const failures = [];
	for ( const candidate of ledger.actors ) {
		try {
			const entry = bodies.get(candidate.name);
			const detected = detectFeatures(entry.body);
			const cap = deriveCapability(detected);
			const irEntry = createEmptyIrEntry({
				sourceName: candidate.name,
				semanticKey: candidate.semanticKey,
				section: entry.section,
				normalizedName: normalizeName(candidate.name),
				rawSourceHash: candidate.sourceHash,
				features: detected,
				unsupportedMechanics: cap.unsupportedMechanics,
				capabilityStatus: cap.capabilityStatus,
				parseStatus: "parsed-valid",
				outputSelection: `selected-${batchId}`,
				productionReadiness: "prototype-validated",
				generatorVersion: "fts-2026-08-06",
				schemaVersion: "fts-ir-0.1"
			});
			const actorIdentity = map.actors[candidate.semanticKey];
			const { actor, exceptions, forceTechEmbed } = generateGeneralizedActor({
				irEntry,
				body: entry.body,
				actorId: actorIdentity.id,
				nonproduction: false,
				productionContext: {
					batch: batchId,
					identityActor: actorIdentity,
					artwork: candidate.artwork,
					metadata: {
						outputSelection: `selected-${batchId}`,
						productionReadiness: "prototype-validated",
						packPhase: spec.packPhase
					},
					exactFeatures: {
						passives: candidate.passives,
						nonAttackActions: candidate.nonAttackActions,
						weaponAttacks: candidate.weaponAttacks
					}
				}
			});
			for ( const item of actor.items ) {
				if ( actorIdentity.items[item._id] ) continue;
				if ( item.type === "spell" || item.type === "sw5e-module.maneuver"
					|| /^(?:Innate\s+)?(?:Force|Tech)casting$/i.test(item.name) ) {
					actorIdentity.items[item._id] = {
						id: item._id,
						name: item.name,
						type: item.type,
						key: item._key,
						activities: Object.fromEntries(
							Object.keys(item.system?.activities || {}).map(id => [id, { id, pinned: true, origin: spec.origin }])
						),
						pinned: true,
						origin: spec.origin
					};
				}
			}
			const hard = exceptions.filter(e => e.type === "canonical-match-missing" || e.type === "activities-missing");
			if ( hard.length ) {
				failures.push({ name: candidate.name, hard });
			}
			const outPath = path.join(ROOT, candidate.yamlPath);
			fs.mkdirSync(path.dirname(outPath), { recursive: true });
			fs.writeFileSync(outPath, `${yaml.dump(actor, DUMP)}\n`);
			written.push({
				name: candidate.name,
				path: candidate.yamlPath,
				id: actor._id,
				spells: actor.items.filter(i => i.type === "spell").length,
				forcePts: actor.system.powercasting?.force?.points?.max ?? null,
				techPts: actor.system.powercasting?.tech?.points?.max ?? null,
				exceptions: exceptions.length,
				missingCanonical: (forceTechEmbed?.exceptions || []).filter(e => e.type === "canonical-match-missing")
			});
		} catch ( err ) {
			// Drop identity pin for actors that never landed on disk in this write.
			delete map.actors[candidate.semanticKey];
			failures.push({ name: candidate.name, hard: [{ type: "generator-throw", message: String(err?.message || err) }] });
		}
	}
	fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
	const result = { batchId, ledgerPath, written, failures };
	fs.writeFileSync(path.join(AUDIT, `${batchId}-write-result.json`), `${JSON.stringify(result, null, 2)}\n`);
	console.log(JSON.stringify(result, null, 2));
	if ( failures.length ) process.exitCode = 2;
	return result;
}

/**
 * Dynamically register a remaining-population batch from a name list.
 */
export function registerDynamicBatch(batchId, names, note = null) {
	BATCHES[batchId] = {
		names,
		origin: `${batchId}-approved`,
		packPhase: batchId,
		note
	};
	return BATCHES[batchId];
}

const args = process.argv.slice(2);
const mode = args[0];
const batchId = args[1];
if ( mode === "--prepare" ) {
	const { ledgerPath, ledger } = buildLedger(batchId);
	console.log(JSON.stringify({ ledgerPath, actors: ledger.counts }, null, 2));
} else if ( mode === "--write" ) {
	writeBatch(batchId);
} else if ( mode === "--write-names" ) {
	// node fts-populate.mjs --write-names <batchId> Name1|Name2|...
	const names = String(args[2] || "").split("|").map(s => s.trim()).filter(Boolean);
	if ( !batchId || !names.length ) {
		console.error("Usage: node utils/snv-monsters/fts-populate.mjs --write-names <batchId> Name1|Name2|...");
		process.exit(1);
	}
	registerDynamicBatch(batchId, names);
	writeBatch(batchId);
} else {
	console.error("Usage: node utils/snv-monsters/fts-populate.mjs --prepare|--write <batchId> | --write-names <batchId> Name1|...");
	process.exit(1);
}
