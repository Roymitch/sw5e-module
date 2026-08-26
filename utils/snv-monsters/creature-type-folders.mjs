/**
 * Foundry Creature Type → snv-monsters Compendium folder taxonomy.
 * Supersedes source-section folder mapping (Beasts/Aberrations/…).
 */
import crypto from "node:crypto";

export const CREATURE_TYPE_FOLDER_LABELS = Object.freeze([
	"Aberration",
	"Beast",
	"Construct",
	"Droid",
	"Force Entity",
	"Humanoid",
	"Plant",
	"Starship",
	"Undead",
	"Custom Type"
]);

/** Stable folder IDs = sha256(`snv-folder:${label}`).slice(0, 16) */
export const CREATURE_TYPE_FOLDERS = Object.freeze({
	Aberration: Object.freeze({
		label: "Aberration",
		semanticKey: "snv-folder:Aberration",
		id: "c79ec9e6319e91f3",
		packSubdir: "aberration",
		sort: 100000
	}),
	Beast: Object.freeze({
		label: "Beast",
		semanticKey: "snv-folder:Beast",
		id: "ebd87deffbaf7f14",
		packSubdir: "beast",
		sort: 200000
	}),
	Construct: Object.freeze({
		label: "Construct",
		semanticKey: "snv-folder:Construct",
		id: "b85c99705796bd3c",
		packSubdir: "construct",
		sort: 300000
	}),
	Droid: Object.freeze({
		label: "Droid",
		semanticKey: "snv-folder:Droid",
		id: "369928055e801207",
		packSubdir: "droid",
		sort: 400000
	}),
	"Force Entity": Object.freeze({
		label: "Force Entity",
		semanticKey: "snv-folder:Force Entity",
		id: "f4d85328dc1b5e69",
		packSubdir: "force-entity",
		sort: 500000
	}),
	Humanoid: Object.freeze({
		label: "Humanoid",
		semanticKey: "snv-folder:Humanoid",
		id: "a907e6b54e75b9d3",
		packSubdir: "humanoid",
		sort: 600000
	}),
	Plant: Object.freeze({
		label: "Plant",
		semanticKey: "snv-folder:Plant",
		id: "75eb0e2e417ce93b",
		packSubdir: "plant",
		sort: 700000
	}),
	Starship: Object.freeze({
		label: "Starship",
		semanticKey: "snv-folder:Starship",
		id: "b41aace5f37856a4",
		packSubdir: "starship",
		sort: 800000
	}),
	Undead: Object.freeze({
		label: "Undead",
		semanticKey: "snv-folder:Undead",
		id: "c4eee40d9b3a867e",
		packSubdir: "undead",
		sort: 900000
	}),
	"Custom Type": Object.freeze({
		label: "Custom Type",
		semanticKey: "snv-folder:Custom Type",
		id: "4f561f7660224b78",
		packSubdir: "custom-type",
		sort: 1000000
	})
});

/** Obsolete source-section folders removed by taxonomy correction. */
export const OBSOLETE_SOURCE_SECTION_FOLDERS = Object.freeze([
	{ id: "9b15e7dfce3031e1", name: "Aberrations", semanticKey: "snv-folder:Aberrations" },
	{ id: "ed7eb55524af7eab", name: "Beasts", semanticKey: "snv-folder:Beasts" },
	{ id: "9f1a4571a73c2dae", name: "Constructs and Vehicles", semanticKey: "snv-folder:Constructs and Vehicles" },
	{ id: "16546b69f18516ea", name: "Droids", semanticKey: "snv-folder:Droids" },
	{ id: "f05d69f927581f63", name: "Humanoids", semanticKey: "snv-folder:Humanoids" },
	{ id: "b83e569dec185e65", name: "Humanoids: Force Users", semanticKey: "snv-folder:Humanoids: Force Users" }
]);

const TYPE_VALUE_TO_FOLDER = Object.freeze({
	aberration: "Aberration",
	beast: "Beast",
	construct: "Construct",
	droid: "Droid",
	force: "Force Entity",
	humanoid: "Humanoid",
	plant: "Plant",
	starship: "Starship",
	undead: "Undead"
});

export function shortFolderId(label) {
	return crypto.createHash("sha256").update(`snv-folder:${label}`).digest("hex").slice(0, 16);
}

/**
 * Resolve Compendium folder label from stored Foundry creature type fields.
 * @returns {{ label: string|null, typeValue: string|null, unresolved: boolean, reason?: string }}
 */
export function resolveCreatureTypeFolderLabel(typeDetails = {}) {
	const value = String(typeDetails?.value || "").trim().toLowerCase();
	const custom = String(typeDetails?.custom || "").trim();
	if ( !value ) {
		return { label: null, typeValue: null, unresolved: true, reason: "missing-type-value" };
	}
	if ( value === "custom" ) {
		if ( !custom ) {
			return { label: null, typeValue: "custom", unresolved: true, reason: "empty-custom-type" };
		}
		return { label: "Custom Type", typeValue: "custom", unresolved: false };
	}
	const label = TYPE_VALUE_TO_FOLDER[value];
	if ( !label ) {
		return { label: null, typeValue: value, unresolved: true, reason: `unknown-type-value:${value}` };
	}
	return { label, typeValue: value, unresolved: false };
}

export function getCreatureTypeFolder(label) {
	return CREATURE_TYPE_FOLDERS[label] || null;
}

export function packSubdirForCreatureType(typeDetails) {
	const resolved = resolveCreatureTypeFolderLabel(typeDetails);
	if ( resolved.unresolved ) {
		throw new Error(`[snv-monsters] cannot resolve pack subdir: ${resolved.reason}`);
	}
	return getCreatureTypeFolder(resolved.label).packSubdir;
}

export function folderKeyForCreatureType(typeDetails) {
	const resolved = resolveCreatureTypeFolderLabel(typeDetails);
	if ( resolved.unresolved ) {
		throw new Error(`[snv-monsters] cannot resolve folder key: ${resolved.reason}`);
	}
	return getCreatureTypeFolder(resolved.label).semanticKey;
}

export function folderIdForCreatureType(typeDetails) {
	const resolved = resolveCreatureTypeFolderLabel(typeDetails);
	if ( resolved.unresolved ) {
		throw new Error(`[snv-monsters] cannot resolve folder id: ${resolved.reason}`);
	}
	return getCreatureTypeFolder(resolved.label).id;
}

/**
 * Map SnV descriptor type text to dnd5e/SW5e type.value (+ swarm/subtype).
 */
export function parseCreatureTypeFromDescriptorPart(typePart) {
	const raw = String(typePart || "").trim();
	if ( !raw ) return { value: "custom", subtype: "", swarm: "", custom: "" };

	let swarm = "";
	let working = raw;
	const swarmMatch = working.match(/^swarm of (tiny|small|medium|large|huge|gargantuan)\s+(.+)$/i);
	if ( swarmMatch ) {
		swarm = swarmMatch[1].toLowerCase();
		working = swarmMatch[2].trim();
	}

	let subtype = "";
	const paren = working.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
	if ( paren ) {
		working = paren[1].trim();
		subtype = paren[2].trim();
	}

	let normalized = working.toLowerCase().replace(/\s+/g, " ").trim();
	const pluralMap = {
		aberrations: "aberration",
		beasts: "beast",
		constructs: "construct",
		droids: "droid",
		"force entities": "force entity",
		humanoids: "humanoid",
		plants: "plant",
		starships: "starship"
	};
	if ( pluralMap[normalized] ) normalized = pluralMap[normalized];

	const alias = {
		aberration: "aberration",
		beast: "beast",
		construct: "construct",
		droid: "droid",
		"force entity": "force",
		"force-entity": "force",
		force: "force",
		humanoid: "humanoid",
		plant: "plant",
		starship: "starship",
		undead: "undead"
	};
	const value = alias[normalized];
	if ( value ) {
		return { value, subtype, swarm, custom: "" };
	}
	// SnV sometimes embeds "force-entity" inside complex form descriptors.
	if ( /force[- ]?entit/i.test(raw) ) {
		return { value: "force", subtype: subtype || "", swarm, custom: "" };
	}
	return { value: "custom", subtype: "", swarm, custom: raw };
}
