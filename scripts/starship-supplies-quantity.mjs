/**
 * Phase 3B / Bug 12 — Slice 3B-5 shared Ship’s Stores quantity parsing.
 * Empty → 0; submitted 0 stays 0; invalid (negative, action strings, non-numeric) → fail.
 */

/**
 * Parse a submitted supplies quantity field.
 * @param {unknown} raw
 * @returns {{ok: true, value: number}|{ok: false}}
 */
export function parseStarshipSuppliesRequestedQuantity(raw) {
	if ( raw === undefined || raw === null ) return { ok: true, value: 0 };
	if ( typeof raw === "string" ) {
		const trimmed = raw.trim();
		if ( trimmed === "" ) return { ok: true, value: 0 };
		if ( !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed) ) return { ok: false };
		const n = Number(trimmed);
		if ( !Number.isFinite(n) ) return { ok: false };
		const trunc = Math.trunc(n);
		if ( trunc < 0 ) return { ok: false };
		return { ok: true, value: trunc };
	}
	const n = Number(raw);
	if ( !Number.isFinite(n) ) return { ok: false };
	const trunc = Math.trunc(n);
	if ( trunc < 0 ) return { ok: false };
	return { ok: true, value: trunc };
}

/**
 * Localize with `{name}` interpolation.
 * @param {string} key
 * @param {string} fallback
 * @param {Record<string, string|number>} [data]
 * @returns {string}
 */
export function localizeStarshipSupplies(key, fallback, data={}) {
	const formatted = globalThis.game?.i18n?.format?.(key, data);
	if ( formatted && formatted !== key ) return formatted;
	const localized = globalThis.game?.i18n?.localize?.(key);
	if ( localized && localized !== key ) {
		return Object.entries(data).reduce(
			(text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
			localized
		);
	}
	return Object.entries(data).reduce(
		(text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
		fallback
	);
}
