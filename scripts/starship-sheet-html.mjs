/**
 * Local sheet i18n / HTML helpers (Phase 6 Slice B).
 * Move-only from scripts/patch/starship-sheet.mjs — do not replace with module-support.
 */

export function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized === key ? fallback : localized;
}

export function escapeHtml(str) {
	return String(str ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
