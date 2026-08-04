/**
 * Shared parse helpers (no classification side effects).
 */
import crypto from "node:crypto";

export function normalizeName(value) {
	return String(value ?? "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[''`]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function slugifyName(name) {
	return normalizeName(name).replace(/\s+/g, "-");
}

export function sha256(text) {
	return crypto.createHash("sha256").update(String(text)).digest("hex");
}

export function semanticKeyFor(section, name) {
	return `snv:${section}:${slugifyName(name)}`;
}
