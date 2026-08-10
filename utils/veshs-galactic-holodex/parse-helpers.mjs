import crypto from "node:crypto";

export function stripMarkdown(value) {
	return String(value ?? "")
		.replace(/\*\*/g, "")
		.replace(/\*/g, "")
		.replace(/`/g, "")
		.replace(/_/g, "")
		.trim();
}

export function normalizeName(value) {
	return stripMarkdown(value)
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[(),.:/]/g, " ")
		.replace(/['"`]/g, "")
		.replace(/-/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

export function normalizeForMatching(value) {
	return normalizeName(value)
		.replace(/\bfaction\b/g, "")
		.replace(/\btemplate\b/g, "")
		.replace(/\bvariant\b/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function slugifyName(value) {
	return normalizeName(value).replace(/\s+/g, "-");
}

export function semanticKeyFor(creatureType, name) {
	return `vgh:${creatureType}:${slugifyName(name)}`;
}

export function sha256(value) {
	return crypto.createHash("sha256").update(String(value)).digest("hex").toUpperCase();
}

export function sha256Buffer(buffer) {
	return crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
}
