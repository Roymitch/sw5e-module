import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import {
	detectFeatures,
	deriveCapability,
	deriveOutputSelection,
	deriveParseStatus,
	deriveProductionReadiness
} from "./classify.mjs";
import { getCreatureTypeFolder, resolveCreatureTypeFolderLabel } from "./creature-type-folders.mjs";
import { classifySourceFeatures } from "./feature-accounting.mjs";
import { generateGeneralizedActor } from "./generate-generalized.mjs";
import { buildProductionIdentityPlan, loadProductionIdentityMap, mergeIdentityMap, saveIdentityMap } from "./identity.mjs";
import { createEmptyIrEntry } from "./ir-schema.mjs";
import { parseAuthoritativeSource } from "./parse.mjs";
import { slugifyName, sha256 } from "./parse-helpers.mjs";
import { COMMITTED_PACK_SOURCE, GENERATOR_VERSION, SCHEMA_VERSION, ROOT } from "./paths.mjs";
import { validateActorPublicationSource, VGH_PROVENANCE_FLAG } from "./source-provenance.mjs";
import {
	assertAllowedOutputRoot,
	assertApprovedProductionYamlPath,
	registerProductionBatchDescriptor
} from "./write-guard.mjs";

const DUMP = { lineWidth: 120, noRefs: true, quotingType: "\"" };

const PILOT_NAMES = Object.freeze([
	"Acklay, Gladiator",
	"GEMINI Conspirator Droid",
	"Emperor's Wrath",
	"Ng'ok",
	"Oggdo, Legendary"
]);

const BATCHES = Object.freeze({
	"phase-3-pilot": {
		outputSelection: "selected-pilot",
		names: PILOT_NAMES
	},
	"phase-4-population": {
		outputSelection: "selected-population",
		names: null
	}
});

function repoRelative(targetPath) {
	return path.relative(ROOT, targetPath).split(path.sep).join("/");
}

function ensureDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
	return dirPath;
}

function ensureFolderYaml(folder) {
	const dir = path.join(COMMITTED_PACK_SOURCE, folder.packSubdir);
	ensureDir(dir);
	const folderPath = path.join(dir, "_folder.yml");
	if (fs.existsSync(folderPath)) return repoRelative(folderPath);
	const doc = {
		type: "Actor",
		folder: null,
		name: folder.label,
		color: null,
		sorting: "a",
		_id: folder.id,
		description: `Vesh's Galactic Holodex Compendium folder (${folder.label} Creature Type)`,
		sort: folder.sort,
		flags: {
			sw5e: {
				[VGH_PROVENANCE_FLAG]: {
					semanticKey: folder.semanticKey,
					folderTaxonomy: "foundry-creature-type",
					prototypePack: false
				}
			}
		},
		_stats: {
			duplicateSource: null,
			exportSource: null,
			coreVersion: "13.351",
			systemId: "dnd5e",
			systemVersion: "5.2.5",
			createdTime: null,
			modifiedTime: null,
			lastModifiedBy: null
		},
		_key: `!folders!${folder.id}`
	};
	fs.writeFileSync(folderPath, `${yaml.dump(doc, DUMP)}\n`);
	return repoRelative(folderPath);
}

function buildIrEntry(block, outputSelection) {
	const features = detectFeatures(block.body);
	const capability = deriveCapability(features);
	const parseStatus = deriveParseStatus({ warnings: [], parseFailed: false });
	const productionReadiness = deriveProductionReadiness({
		parseStatus,
		capabilityStatus: capability.capabilityStatus,
		outputSelection
	});
	return createEmptyIrEntry({
		schemaVersion: SCHEMA_VERSION,
		generatorVersion: GENERATOR_VERSION,
		sourceName: block.displayName,
		normalizedName: slugifyName(block.displayName),
		semanticKey: `vgh:${block.creatureType}:${slugifyName(block.displayName)}`,
		section: block.sourceSection,
		sourceOrder: block.sourceOrder,
		rawSourceHash: sha256(`${block.displayName}\n${block.body}`),
		parseStatus,
		capabilityStatus: capability.capabilityStatus,
		outputSelection,
		productionReadiness,
		warnings: [],
		unsupportedMechanics: capability.unsupportedMechanics,
		features,
		manualReview: capability.capabilityStatus === "manual-review-required",
		manualReviewReasons: capability.reasons,
		confidence: "medium"
	});
}

function buildLedger(batch, blocks) {
	const spec = BATCHES[batch];
	const outputSelection = spec.outputSelection;
	const actors = [];
	const folderMap = new Map();
	for (const block of blocks) {
		const folderResolution = resolveCreatureTypeFolderLabel(block.creatureTypeDetails || { value: block.creatureType });
		if (folderResolution.unresolved) {
			throw new Error(`[veshs-galactic-holodex] unresolved folder for ${block.displayName}: ${folderResolution.reason}`);
		}
		const folder = getCreatureTypeFolder(folderResolution.label);
		const exactFeatures = classifySourceFeatures(block.body);
		const irEntry = buildIrEntry(block, outputSelection);
		const yamlRelativePath = `packs/_source/veshs-galactic-holodex/${folder.packSubdir}/${slugifyName(block.displayName)}.yml`;
		actors.push({
			name: block.displayName,
			semanticKey: irEntry.semanticKey,
			sourceSection: block.sourceSection,
			body: block.body,
			irEntry,
			exactFeatures,
			passives: exactFeatures.passives,
			nonAttackActions: exactFeatures.nonAttackActions,
			weaponAttacks: exactFeatures.weaponAttacks,
			yamlRelativePath,
			folderAssignment: {
				folderName: folder.label,
				folderId: folder.id,
				folderSemanticKey: folder.semanticKey,
				packSubdir: folder.packSubdir
			}
		});
		folderMap.set(folder.semanticKey, {
			folderName: folder.label,
			folderId: folder.id,
			folderSemanticKey: folder.semanticKey,
			packSubdir: folder.packSubdir
		});
	}
	return {
		batch,
		actors,
		folderAssignments: [...folderMap.values()]
	};
}

function registerBatchDescriptor(batch, ledger) {
	return registerProductionBatchDescriptor({
		batch,
		productionRoot: COMMITTED_PACK_SOURCE,
		approvedYamlRelativePaths: ledger.actors.map(actor => actor.yamlRelativePath),
		allowedTrackedRelativePaths: [
			"utils/veshs-galactic-holodex/manifests/identity-map.json",
			...ledger.actors.map(actor => actor.yamlRelativePath),
			...ledger.folderAssignments.map(folder => `packs/_source/veshs-galactic-holodex/${folder.packSubdir}/_folder.yml`)
		]
	});
}

function writeBatch(batch) {
	const spec = BATCHES[batch];
	if (!spec) throw new Error(`[veshs-galactic-holodex] unknown batch ${batch}`);
	const parsed = parseAuthoritativeSource();
	const selectedBlocks = spec.names
		? parsed.completeActorBlocks.filter(block => spec.names.includes(block.displayName))
		: parsed.completeActorBlocks;
	const expectedCount = spec.names ? spec.names.length : parsed.completeActorBlocks.length;
	if (selectedBlocks.length !== expectedCount) {
		throw new Error(`[veshs-galactic-holodex] batch ${batch} resolved ${selectedBlocks.length} of ${expectedCount} requested actors`);
	}
	const ledger = buildLedger(batch, selectedBlocks);
	registerBatchDescriptor(batch, ledger);
	assertAllowedOutputRoot(COMMITTED_PACK_SOURCE, { allowProductionWrite: true, batch });

	const baseMap = loadProductionIdentityMap();
	const identityPlan = buildProductionIdentityPlan(batch, ledger, baseMap);
	const mergedMap = mergeIdentityMap(baseMap, identityPlan);
	saveIdentityMap(mergedMap);

	const writtenFolderPaths = ledger.folderAssignments.map(folderAssignment => {
		const folder = getCreatureTypeFolder(folderAssignment.folderName);
		return ensureFolderYaml(folder);
	});

	const writtenActorPaths = [];
	const exceptions = [];
	for (const actorRecord of ledger.actors) {
		const outputPath = path.join(ROOT, actorRecord.yamlRelativePath);
		ensureDir(path.dirname(outputPath));
		assertApprovedProductionYamlPath(outputPath, batch);
		const identityActor = mergedMap.actors[actorRecord.semanticKey];
		const result = generateGeneralizedActor({
			irEntry: actorRecord.irEntry,
			body: actorRecord.body,
			actorId: identityActor.id,
			productionContext: {
				exactFeatures: actorRecord.exactFeatures,
				identityActor
			}
		});
		const validation = validateActorPublicationSource(result.actor);
		if (!validation.ok) {
			throw new Error(`[veshs-galactic-holodex] publication source validation failed for ${actorRecord.name}: ${validation.failures.join("; ")}`);
		}
		fs.writeFileSync(outputPath, `${yaml.dump(result.actor, DUMP)}\n`);
		writtenActorPaths.push(actorRecord.yamlRelativePath);
		exceptions.push(...result.exceptions.map(exception => ({ actor: actorRecord.name, ...exception })));
	}

	return {
		batch,
		actorCount: ledger.actors.length,
		folderCount: ledger.folderAssignments.length,
		writtenActorPaths,
		writtenFolderPaths,
		exceptions
	};
}

const command = process.argv[2] || "phase-3-pilot";
const result = writeBatch(command);
console.log(JSON.stringify(result, null, 2));
