/**
 * Tracked identity manifest loader. N1 pins are immutable; N3a extends the map
 * with a narrow approved actor/item/activity set only.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { IDENTITY_MAP_PATH } from "./paths.mjs";

const N1_ORIGIN = "n1-committed";
export const N3A_ORIGIN = "n3a-approved";
export const N3A_BATCH = "n3a";
export const N3A_BEASTS_FOLDER_KEY = "snv-folder:Beasts";

function shortHash(seed) {
	return crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 16);
}

function countIdentityCollections(actors = []) {
	let items = 0;
	let activities = 0;
	for ( const actor of actors ) {
		items += Object.keys(actor.items || {}).length;
		for ( const item of Object.values(actor.items || {}) ) {
			activities += Object.keys(item.activities || {}).length;
		}
	}
	return { items, activities };
}

function buildIdIndex(map) {
	const index = new Map();
	for ( const [semanticKey, folder] of Object.entries(map.folders || {}) ) {
		index.set(folder.id, `folder:${semanticKey}`);
	}
	for ( const [semanticKey, actor] of Object.entries(map.actors || {}) ) {
		index.set(actor.id, `actor:${semanticKey}`);
		for ( const item of Object.values(actor.items || {}) ) {
			index.set(item.id, `item:${semanticKey}:${item.name}`);
			for ( const activity of Object.values(item.activities || {}) ) {
				index.set(activity.id, `activity:${semanticKey}:${item.name}:${activity.id}`);
			}
		}
	}
	return index;
}

function buildKeyIndex(map) {
	const index = new Map();
	for ( const [semanticKey, folder] of Object.entries(map.folders || {}) ) {
		index.set(folder.key, `folder:${semanticKey}`);
	}
	for ( const [semanticKey, actor] of Object.entries(map.actors || {}) ) {
		index.set(actor.key, `actor:${semanticKey}`);
		for ( const item of Object.values(actor.items || {}) ) {
			index.set(item.key, `item:${semanticKey}:${item.name}`);
		}
	}
	return index;
}

function getOrThrow(object, key, label) {
	const value = object?.[key];
	if ( !value ) throw new Error(`[snv-monsters] missing ${label}: ${key}`);
	return value;
}

function normalizeCandidateList(ledger) {
	const candidates = ledger?.finalCandidates || [];
	if ( !Array.isArray(candidates) || !candidates.length ) {
		throw new Error("[snv-monsters] candidate ledger is missing finalCandidates");
	}
	return candidates.map(candidate => ({
		...candidate,
		passives: Array.isArray(candidate.passives) ? candidate.passives : [],
		nonAttackActions: Array.isArray(candidate.nonAttackActions) ? candidate.nonAttackActions : [],
		weaponAttacks: Array.isArray(candidate.weaponAttacks) ? candidate.weaponAttacks : []
	}));
}

function filterToBaselinePins(map) {
	return {
		...map,
		actors: Object.fromEntries(
			Object.entries(map.actors || {}).filter(([, actor]) => actor.origin === N1_ORIGIN)
		)
	};
}

/**
 * @returns {object}
 */
export function loadIdentityMap(mapPath = IDENTITY_MAP_PATH, opts = {}) {
	if ( !fs.existsSync(mapPath) ) {
		throw new Error(`[snv-monsters] missing tracked identity map: ${mapPath}`);
	}
	const parsed = JSON.parse(fs.readFileSync(mapPath, "utf8"));
	if ( opts.includeExtended === true ) return parsed;
	return filterToBaselinePins(parsed);
}

export function loadProductionIdentityMap(mapPath = IDENTITY_MAP_PATH) {
	return loadIdentityMap(mapPath, { includeExtended: true });
}

export function listPinnedActorKeys(map = loadIdentityMap()) {
	return Object.keys(map.actors || {});
}

export function getPinnedActor(semanticKey, map = loadIdentityMap()) {
	return map.actors?.[semanticKey] ?? null;
}

export function getPinnedFolder(semanticKey, map = loadIdentityMap()) {
	return map.folders?.[semanticKey] ?? null;
}

export function createN3aActorId(actorSemanticKey) {
	return shortHash(`n3a-actor:${actorSemanticKey}`);
}

export function createN3aItemId(actorSemanticKey, itemName) {
	return shortHash(`n3a-item:${actorSemanticKey}:${itemName}`);
}

export function createN3aActivityId(actorSemanticKey, weaponName) {
	return shortHash(`n3a-activity:${actorSemanticKey}:${weaponName}:attack`);
}

export function summarizeIdentityAddition(proposed = {}) {
	const actors = Object.values(proposed.actors || {});
	const items = actors.reduce((count, actor) => count + Object.keys(actor.items || {}).length, 0);
	const activities = actors.reduce((count, actor) => count + Object.values(actor.items || {})
		.reduce((inner, item) => inner + Object.keys(item.activities || {}).length, 0), 0);
	return { actors: actors.length, items, activities };
}

export function buildN3aIdentityPlan(ledger, map = loadProductionIdentityMap()) {
	const candidates = normalizeCandidateList(ledger);
	const folderId = getOrThrow(map.folders, N3A_BEASTS_FOLDER_KEY, "folder pin").id;
	const actors = {};

	for ( const candidate of candidates ) {
		const actorId = createN3aActorId(candidate.semanticKey);
		const actor = {
			id: actorId,
			name: candidate.name,
			folderId,
			key: `!actors!${actorId}`,
			items: {},
			pinned: true,
			origin: N3A_ORIGIN,
			batch: N3A_BATCH
		};
		for ( const itemName of [...candidate.passives, ...candidate.nonAttackActions] ) {
			const itemId = createN3aItemId(candidate.semanticKey, itemName);
			actor.items[itemId] = {
				id: itemId,
				name: itemName,
				type: "feat",
				key: `!actors.items!${actorId}.${itemId}`,
				activities: {},
				pinned: true,
				origin: N3A_ORIGIN
			};
		}
		for ( const itemName of candidate.weaponAttacks ) {
			const itemId = createN3aItemId(candidate.semanticKey, itemName);
			const activityId = createN3aActivityId(candidate.semanticKey, itemName);
			actor.items[itemId] = {
				id: itemId,
				name: itemName,
				type: "weapon",
				key: `!actors.items!${actorId}.${itemId}`,
				activities: {
					[activityId]: {
						id: activityId,
						pinned: true,
						origin: N3A_ORIGIN
					}
				},
				pinned: true,
				origin: N3A_ORIGIN
			};
		}
		actors[candidate.semanticKey] = actor;
	}

	const proposed = { actors };
	assertNoPinnedIdMutation(proposed, map);
	assertNoIdentityCollisions(proposed, map);
	return proposed;
}

export function mergeIdentityMap(baseMap, extension) {
	const merged = structuredClone(baseMap);
	merged.actors = merged.actors || {};
	for ( const [semanticKey, actor] of Object.entries(extension.actors || {}) ) {
		merged.actors[semanticKey] = actor;
	}
	return merged;
}

export function resolvePinnedItemIdentity(actorIdentity, itemName, type = null) {
	const matches = Object.values(actorIdentity?.items || {}).filter(item =>
		item.name === itemName && (type ? item.type === type : true)
	);
	if ( matches.length !== 1 ) {
		throw new Error(
			`[snv-monsters] expected exactly one pinned item for ${actorIdentity?.name || actorIdentity?.id}: `
			+ `${itemName} (${type || "any"}) but found ${matches.length}`
		);
	}
	return matches[0];
}

/**
 * Resolve actor id for a semantic key. Never invents a new id for pinned keys.
 * @param {string} semanticKey
 * @param {{ sandboxTempId?: string }} [opts]
 */
export function resolveActorId(semanticKey, opts = {}, map = loadIdentityMap()) {
	const pinned = map.actors?.[semanticKey];
	if ( pinned ) {
		if ( opts.sandboxTempId && opts.sandboxTempId !== pinned.id ) {
			throw new Error(
				`[snv-monsters] refused to overwrite pinned actor id for ${semanticKey}: `
				+ `${pinned.id} (attempted ${opts.sandboxTempId})`
			);
		}
		return pinned.id;
	}
	if ( opts.sandboxTempId ) return opts.sandboxTempId;
	throw new Error(`[snv-monsters] no pinned or sandbox id for ${semanticKey}`);
}

/**
 * Assert proposed id assignments do not mutate pinned N1 identities.
 */
export function assertNoPinnedIdMutation(proposed, map = loadIdentityMap()) {
	const failures = [];
	for ( const [sk, folder] of Object.entries(proposed.folders || {}) ) {
		const pinned = map.folders?.[sk];
		if ( pinned && folder.id !== pinned.id ) {
			failures.push(`folder ${sk}: ${folder.id} !== pinned ${pinned.id}`);
		}
	}
	for ( const [sk, actor] of Object.entries(proposed.actors || {}) ) {
		const pinned = map.actors?.[sk];
		if ( !pinned ) continue;
		if ( actor.id !== pinned.id ) failures.push(`actor ${sk}: ${actor.id} !== ${pinned.id}`);
		for ( const [itemId, item] of Object.entries(actor.items || {}) ) {
			const pItem = pinned.items?.[itemId];
			if ( pItem && item.id && item.id !== pItem.id ) {
				failures.push(`item ${sk}/${itemId} id mutation`);
			}
			for ( const [actId] of Object.entries(item.activities || {}) ) {
				if ( pItem && !pItem.activities?.[actId] ) {
					failures.push(`activity ${sk}/${itemId}/${actId} not in pin set (extension ok only via N3 process)`);
				}
			}
		}
		if ( actor.items ) {
			for ( const pid of Object.keys(pinned.items || {}) ) {
				if ( !actor.items[pid] && !Object.values(actor.items).some(item => item.id === pid) ) {
					failures.push(`missing pinned item ${sk}/${pid}`);
				}
			}
		}
	}
	if ( failures.length ) {
		throw new Error(`[snv-monsters] pinned identity mutation refused:\n- ${failures.join("\n- ")}`);
	}
	return true;
}

export function assertNoIdentityCollisions(proposed, map = loadProductionIdentityMap()) {
	const idIndex = buildIdIndex(map);
	const keyIndex = buildKeyIndex(map);
	const failures = [];

	for ( const [semanticKey, folder] of Object.entries(proposed.folders || {}) ) {
		const prior = idIndex.get(folder.id);
		if ( prior && prior !== `folder:${semanticKey}` ) failures.push(`folder id collision ${folder.id} with ${prior}`);
		const priorKey = keyIndex.get(folder.key);
		if ( priorKey && priorKey !== `folder:${semanticKey}` ) failures.push(`folder key collision ${folder.key} with ${priorKey}`);
	}

	for ( const [semanticKey, actor] of Object.entries(proposed.actors || {}) ) {
		const prior = idIndex.get(actor.id);
		if ( prior && prior !== `actor:${semanticKey}` ) failures.push(`actor id collision ${actor.id} with ${prior}`);
		const priorKey = keyIndex.get(actor.key);
		if ( priorKey && priorKey !== `actor:${semanticKey}` ) failures.push(`actor key collision ${actor.key} with ${priorKey}`);
		for ( const item of Object.values(actor.items || {}) ) {
			const itemOwner = `item:${semanticKey}:${item.name}`;
			const priorItem = idIndex.get(item.id);
			if ( priorItem && priorItem !== itemOwner ) failures.push(`item id collision ${item.id} with ${priorItem}`);
			const priorItemKey = keyIndex.get(item.key);
			if ( priorItemKey && priorItemKey !== itemOwner ) failures.push(`item key collision ${item.key} with ${priorItemKey}`);
			for ( const activity of Object.values(item.activities || {}) ) {
				const activityOwner = `activity:${semanticKey}:${item.name}:${activity.id}`;
				const priorActivity = idIndex.get(activity.id);
				if ( priorActivity && priorActivity !== activityOwner ) {
					failures.push(`activity id collision ${activity.id} with ${priorActivity}`);
				}
			}
		}
	}

	if ( failures.length ) {
		throw new Error(`[snv-monsters] identity collision refused:\n- ${failures.join("\n- ")}`);
	}
	return true;
}

export function summarizeIdentityMap(map = loadIdentityMap()) {
	const allActors = Object.values(map.actors || {});
	const baselineActors = allActors.filter(actor => actor.origin === N1_ORIGIN);
	const totalCounts = countIdentityCollections(allActors);
	const baselineCounts = countIdentityCollections(baselineActors);
	return {
		folders: Object.values(map.folders || {}).filter(folder => folder.origin === N1_ORIGIN).length,
		actors: baselineActors.length,
		items: baselineCounts.items,
		activities: baselineCounts.activities,
		foldersTotal: Object.keys(map.folders || {}).length,
		actorsTotal: allActors.length,
		itemsTotal: totalCounts.items,
		activitiesTotal: totalCounts.activities,
		schemaVersion: map.schemaVersion
	};
}
