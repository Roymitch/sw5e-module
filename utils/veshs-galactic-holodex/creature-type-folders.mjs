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

function shortHash(seed) {
	return crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 16);
}

function packSubdirForLabel(label) {
	return String(label || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export const CREATURE_TYPE_FOLDERS = Object.freeze(Object.fromEntries(
	CREATURE_TYPE_FOLDER_LABELS.map((label, index) => [
		label,
		Object.freeze({
			label,
			semanticKey: `vgh-folder:${label}`,
			id: shortHash(`vgh-folder:${label}`),
			key: `!folders!${shortHash(`vgh-folder:${label}`)}`,
			packSubdir: packSubdirForLabel(label),
			sort: (index + 1) * 100000
		})
	])
));

export function getCreatureTypeFolder(label) {
	return CREATURE_TYPE_FOLDERS[label] || null;
}

export function resolveCreatureTypeFolderLabel(typeDetails = {}) {
	const value = String(typeDetails?.value || "").trim().toLowerCase();
	const custom = String(typeDetails?.custom || "").trim();
	if (!value) {
		return { label: null, typeValue: null, unresolved: true, reason: "missing-type-value" };
	}
	if (value === "custom") {
		if (!custom) {
			return { label: null, typeValue: "custom", unresolved: true, reason: "empty-custom-type" };
		}
		return { label: "Custom Type", typeValue: "custom", unresolved: false };
	}
	const label = TYPE_VALUE_TO_FOLDER[value];
	if (!label) {
		return { label: null, typeValue: value, unresolved: true, reason: `unknown-type-value:${value}` };
	}
	return { label, typeValue: value, unresolved: false };
}

export function parseCreatureTypeFromDescriptorPart(typePart) {
	const raw = String(typePart || "").trim();
	if (!raw) return { value: "custom", subtype: "", swarm: "", custom: "" };

	let swarm = "";
	let working = raw;
	const swarmMatch = working.match(/^swarm of (tiny|small|medium|large|huge|gargantuan)\s+(.+)$/i);
	if (swarmMatch) {
		swarm = swarmMatch[1].toLowerCase();
		working = swarmMatch[2].trim();
	}

	let subtype = "";
	const parenMatch = working.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
	if (parenMatch) {
		working = parenMatch[1].trim();
		subtype = parenMatch[2].trim();
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
		starships: "starship",
		undead: "undead"
	};
	if (pluralMap[normalized]) normalized = pluralMap[normalized];

	const aliasMap = {
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
	const value = aliasMap[normalized];
	if (value) {
		return { value, subtype, swarm, custom: "" };
	}
	if (/force[- ]?entit/i.test(raw)) {
		return { value: "force", subtype: subtype || "", swarm, custom: "" };
	}
	return { value: "custom", subtype: "", swarm, custom: raw };
}

export function packSubdirForCreatureType(typeDetails) {
	const resolved = resolveCreatureTypeFolderLabel(typeDetails);
	if (resolved.unresolved) {
		throw new Error(`[veshs-galactic-holodex] cannot resolve pack subdir: ${resolved.reason}`);
	}
	return getCreatureTypeFolder(resolved.label).packSubdir;
}

export function folderIdForLabel(label) {
	const folder = getCreatureTypeFolder(label);
	if (!folder) throw new Error(`[veshs-galactic-holodex] unknown creature type folder label: ${label}`);
	return folder.id;
}

export function folderDocumentKeyForLabel(label) {
	const folder = getCreatureTypeFolder(label);
	if (!folder) throw new Error(`[veshs-galactic-holodex] unknown creature type folder label: ${label}`);
	return folder.key;
}

export function folderSemanticKeyForLabel(label) {
	const folder = getCreatureTypeFolder(label);
	if (!folder) throw new Error(`[veshs-galactic-holodex] unknown creature type folder label: ${label}`);
	return folder.semanticKey;
}

export function folderIdForCreatureType(typeDetails) {
	const resolved = resolveCreatureTypeFolderLabel(typeDetails);
	if (resolved.unresolved) {
		throw new Error(`[veshs-galactic-holodex] cannot resolve folder id: ${resolved.reason}`);
	}
	return folderIdForLabel(resolved.label);
}
