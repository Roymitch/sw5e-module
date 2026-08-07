import crypto from "node:crypto";
import fs from "node:fs";
import { IDENTITY_MAP_PATH } from "./paths.mjs";

function shortHash(seed) {
	return crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 16);
}

export function slugifyName(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/['"`]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
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

export function summarizeIdentityMap(map = loadIdentityMap()) {
	const actors = Object.values(map.actors || {});
	const folders = Object.keys(map.folders || {}).length;
	const items = actors.reduce((count, actor) => count + Object.keys(actor.items || {}).length, 0);
	const activities = actors.reduce((count, actor) => count + Object.values(actor.items || {})
		.reduce((inner, item) => inner + Object.keys(item.activities || {}).length, 0), 0);
	return { folders, actors: actors.length, items, activities };
}

export function createProductionActorId(batch, semanticKey) {
	return shortHash(`${batch}:actor:${semanticKey}`);
}

export function createProductionItemId(batch, semanticKey, itemName) {
	return shortHash(`${batch}:item:${semanticKey}:${itemName}`);
}

export function createProductionActivityId(batch, semanticKey, itemName, activityName = itemName) {
	return shortHash(`${batch}:activity:${semanticKey}:${itemName}:${activityName}`);
}

export function createProductionEffectId(batch, semanticKey, itemName, effectName) {
	return shortHash(`${batch}:effect:${semanticKey}:${itemName}:${effectName}`);
}
