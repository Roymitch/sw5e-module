import crypto from "node:crypto";
import fs from "node:fs";
import { IDENTITY_MAP_PATH } from "./paths.mjs";
import { slugifyName } from "./parse-helpers.mjs";
import { getProductionBatchDescriptor } from "./write-guard.mjs";

function shortHash(seed) {
	return crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 16);
}

export function semanticKeyFor(creatureType, name) {
	if ( !creatureType || !name ) {
		throw new Error("[veshs-galactic-holodex] semanticKeyFor requires creatureType and name");
	}
	return `vgh:${creatureType}:${slugifyName(name)}`;
}

export function loadIdentityMap(mapPath = IDENTITY_MAP_PATH) {
	if ( !fs.existsSync(mapPath) ) {
		throw new Error(`[veshs-galactic-holodex] missing identity map: ${mapPath}`);
	}
	try {
		return JSON.parse(fs.readFileSync(mapPath, "utf8"));
	} catch ( error ) {
		throw new Error(`[veshs-galactic-holodex] invalid identity map JSON at ${mapPath}: ${error.message}`);
	}
}

export function loadProductionIdentityMap(mapPath = IDENTITY_MAP_PATH) {
	return loadIdentityMap(mapPath);
}

export function saveIdentityMap(map, mapPath = IDENTITY_MAP_PATH) {
	fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
	return mapPath;
}

export function summarizeIdentityMap(map = loadIdentityMap()) {
	const actors = Object.values(map.actors || {});
	const folders = Object.keys(map.folders || {}).length;
	const items = actors.reduce((count, actor) => count + Object.keys(actor.items || {}).length, 0);
	const activities = actors.reduce((count, actor) => count + Object.values(actor.items || {})
		.reduce((inner, item) => inner + Object.keys(item.activities || {}).length, 0), 0);
	return { folders, actors: actors.length, items, activities };
}

export function summarizeIdentityAddition(proposed = {}) {
	return summarizeIdentityMap({
		folders: proposed.folders || {},
		actors: proposed.actors || {}
	});
}

export function createProductionActorId(batch, semanticKey) {
	getProductionBatchDescriptor(batch);
	return shortHash(`${batch}:actor:${semanticKey}`);
}

export function createProductionItemId(batch, semanticKey, itemName) {
	getProductionBatchDescriptor(batch);
	return shortHash(`${batch}:item:${semanticKey}:${itemName}`);
}

export function createProductionActivityId(batch, semanticKey, itemName, activityName = itemName) {
	getProductionBatchDescriptor(batch);
	return shortHash(`${batch}:activity:${semanticKey}:${itemName}:${activityName}`);
}

export function createProductionEffectId(batch, semanticKey, itemName, effectName) {
	getProductionBatchDescriptor(batch);
	return shortHash(`${batch}:effect:${semanticKey}:${itemName}:${effectName}`);
}

export function resolvePinnedItemIdentity(actorIdentity, itemName, type = null) {
	const matches = Object.values(actorIdentity?.items || {}).filter(item =>
		item.name === itemName && (type ? item.type === type : true)
	);
	if ( matches.length !== 1 ) {
		throw new Error(
			`[veshs-galactic-holodex] expected exactly one pinned item for ${actorIdentity?.name || actorIdentity?.id}: `
			+ `${itemName} (${type || "any"}) but found ${matches.length}`
		);
	}
	return matches[0];
}

export function mergeIdentityMap(baseMap, extension) {
	const merged = structuredClone(baseMap);
	merged.folders = { ...(merged.folders || {}) };
	merged.actors = { ...(merged.actors || {}) };
	for ( const [semanticKey, folder] of Object.entries(extension.folders || {}) ) {
		merged.folders[semanticKey] = folder;
	}
	for ( const [semanticKey, actor] of Object.entries(extension.actors || {}) ) {
		merged.actors[semanticKey] = actor;
	}
	return merged;
}

function assertNoIdentityCollisions(proposed, map = loadProductionIdentityMap()) {
	const existingActorIds = new Map(Object.entries(map.actors || {}).map(([semanticKey, actor]) => [actor.id, semanticKey]));
	const existingFolderIds = new Map(Object.entries(map.folders || {}).map(([semanticKey, folder]) => [folder.id, semanticKey]));
	const seenActorIds = new Map();
	const seenFolderIds = new Map();
	const failures = [];
	for ( const [semanticKey, folder] of Object.entries(proposed.folders || {}) ) {
		const prior = existingFolderIds.get(folder.id);
		if ( prior && prior !== semanticKey ) failures.push(`folder id collision: ${folder.id} for ${semanticKey} vs ${prior}`);
		const seen = seenFolderIds.get(folder.id);
		if ( seen && seen !== semanticKey ) failures.push(`proposed folder id collision: ${folder.id} for ${semanticKey} vs ${seen}`);
		seenFolderIds.set(folder.id, semanticKey);
	}
	for ( const [semanticKey, actor] of Object.entries(proposed.actors || {}) ) {
		const prior = existingActorIds.get(actor.id);
		if ( prior && prior !== semanticKey ) failures.push(`actor id collision: ${actor.id} for ${semanticKey} vs ${prior}`);
		const seen = seenActorIds.get(actor.id);
		if ( seen && seen !== semanticKey ) failures.push(`proposed actor id collision: ${actor.id} for ${semanticKey} vs ${seen}`);
		seenActorIds.set(actor.id, semanticKey);
	}
	if ( failures.length ) {
		throw new Error(`[veshs-galactic-holodex] identity collisions refused:\n- ${failures.join("\n- ")}`);
	}
	return true;
}

export function buildProductionIdentityPlan(batch, ledger, map = loadProductionIdentityMap()) {
	getProductionBatchDescriptor(batch);
	const proposed = { folders: {}, actors: {} };
	for ( const folderAssignment of ledger.folderAssignments || [] ) {
		proposed.folders[folderAssignment.folderSemanticKey] = {
			id: folderAssignment.folderId,
			name: folderAssignment.folderName,
			key: `!folders!${folderAssignment.folderId}`,
			pinned: true,
			origin: batch,
			folderTaxonomy: "foundry-creature-type"
		};
	}
	for ( const candidate of ledger.actors || [] ) {
		const existing = map.actors?.[candidate.semanticKey];
		const actorId = existing?.id || createProductionActorId(batch, candidate.semanticKey);
		const actor = {
			id: actorId,
			name: candidate.name,
			folderId: candidate.folderAssignment.folderId,
			key: `!actors!${actorId}`,
			items: { ...(existing?.items || {}) },
			pinned: true,
			origin: batch,
			batch
		};
		const addPinnedItem = (itemName, type) => {
			const existingItem = Object.values(actor.items).find(item => item.name === itemName && item.type === type);
			const itemId = existingItem?.id || createProductionItemId(batch, candidate.semanticKey, itemName);
			const item = {
				id: itemId,
				name: itemName,
				type,
				key: `!actors.items!${actorId}.${itemId}`,
				activities: { ...(existingItem?.activities || {}) },
				pinned: true,
				origin: batch
			};
			if ( type === "weapon" && !Object.keys(item.activities).length ) {
				const activityId = createProductionActivityId(batch, candidate.semanticKey, itemName);
				item.activities[activityId] = {
					id: activityId,
					pinned: true,
					origin: batch
				};
			}
			actor.items[itemId] = item;
		};
		for ( const itemName of candidate.passives || [] ) addPinnedItem(itemName, "feat");
		for ( const itemName of candidate.nonAttackActions || [] ) addPinnedItem(itemName, "feat");
		for ( const itemName of candidate.weaponAttacks || [] ) addPinnedItem(itemName, "weapon");
		proposed.actors[candidate.semanticKey] = actor;
	}
	assertNoIdentityCollisions(proposed, map);
	return proposed;
}
