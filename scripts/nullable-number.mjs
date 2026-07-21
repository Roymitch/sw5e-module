/**
 * Narrow nullable-number presence helpers for SW5E DC override fields.
 * Distinguishes absence from an explicit numeric zero.
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAbsentNullableNumberSource(value) {
	if ( value === undefined || value === null ) return true;
	if ( typeof value === "string" && value.trim() === "" ) return true;
	return false;
}

/**
 * Parse an explicit nullable number override.
 * Absent sources return `null` (caller uses calculated fallback).
 * Explicit `0` / `"0"` return `0`.
 * Non-finite conversions return `null` (fallback).
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseExplicitNullableNumber(value) {
	if ( isAbsentNullableNumberSource(value) ) return null;
	const n = Number(value);
	if ( !Number.isFinite(n) ) return null;
	return n;
}
