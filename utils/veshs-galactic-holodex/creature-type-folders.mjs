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

export function folderIdForLabel(label) {
	const folder = getCreatureTypeFolder(label);
	if ( !folder ) throw new Error(`[veshs-galactic-holodex] unknown creature type folder label: ${label}`);
	return folder.id;
}

export function folderDocumentKeyForLabel(label) {
	const folder = getCreatureTypeFolder(label);
	if ( !folder ) throw new Error(`[veshs-galactic-holodex] unknown creature type folder label: ${label}`);
	return folder.key;
}

export function folderSemanticKeyForLabel(label) {
	const folder = getCreatureTypeFolder(label);
	if ( !folder ) throw new Error(`[veshs-galactic-holodex] unknown creature type folder label: ${label}`);
	return folder.semanticKey;
}
