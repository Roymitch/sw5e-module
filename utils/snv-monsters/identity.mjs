/**
 * Tracked identity manifest loader. Pinned N1 IDs are immutable.
 */
import fs from "node:fs";
import { IDENTITY_MAP_PATH } from "./paths.mjs";

/**
 * @returns {object}
 */
export function loadIdentityMap(mapPath = IDENTITY_MAP_PATH) {
	if ( !fs.existsSync(mapPath) ) {
		throw new Error(`[snv-monsters] missing tracked identity map: ${mapPath}`);
	}
	return JSON.parse(fs.readFileSync(mapPath, "utf8"));
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
		// Ensure all pinned item ids still present when full actor proposed
		if ( actor.items ) {
			for ( const pid of Object.keys(pinned.items || {}) ) {
				if ( !actor.items[pid] && !Object.values(actor.items).some(i => i.id === pid) ) {
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

export function summarizeIdentityMap(map = loadIdentityMap()) {
	const actors = Object.values(map.actors || {});
	let items = 0;
	let activities = 0;
	for ( const a of actors ) {
		items += Object.keys(a.items || {}).length;
		for ( const it of Object.values(a.items || {}) ) {
			activities += Object.keys(it.activities || {}).length;
		}
	}
	return {
		folders: Object.keys(map.folders || {}).length,
		actors: actors.length,
		items,
		activities,
		schemaVersion: map.schemaVersion
	};
}
