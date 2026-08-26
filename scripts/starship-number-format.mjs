/**
 * Locale-aware whole-number formatting for Ship’s Stores presentation.
 * Presentation only — never use formatted strings in math or Actor updates.
 */

/**
 * Resolve active Foundry/i18n locale for grouping separators.
 * @returns {string}
 */
export function resolveStarshipNumberLocale() {
	const lang = globalThis.game?.i18n?.lang;
	if ( typeof lang === "string" && lang.trim() ) return lang;
	return "en";
}

/**
 * Localized “unavailable” presentation for unsafe / invalid display values.
 * @returns {string}
 */
export function formatStarshipWholeNumberUnavailable() {
	const key = "SW5E.StarshipSheet.FoodCapacityUnavailable";
	const localized = globalThis.game?.i18n?.localize?.(key);
	if ( localized && localized !== key ) return localized;
	return "Unavailable (too large to display exactly)";
}

/**
 * Format a whole number with locale-aware grouping separators.
 *
 * @param {unknown} value — caller-normalized number preferred
 * @param {{
 *   locale?: string,
 *   safeInteger?: boolean,
 *   allowNegative?: boolean
 * }} [options]
 * @returns {string}
 */
export function formatStarshipWholeNumber(value, options={}) {
	if ( options.safeInteger === false ) return formatStarshipWholeNumberUnavailable();

	const n = Number(value);
	if ( !Number.isFinite(n) ) return formatStarshipWholeNumberUnavailable();

	const trunc = Math.trunc(n);
	if ( options.allowNegative !== true && trunc < 0 ) {
		return formatStarshipWholeNumberUnavailable();
	}
	if ( !Number.isSafeInteger(trunc) ) return formatStarshipWholeNumberUnavailable();

	const locale = typeof options.locale === "string" && options.locale.trim()
		? options.locale
		: resolveStarshipNumberLocale();

	try {
		return new Intl.NumberFormat(locale, {
			maximumFractionDigits: 0
		}).format(trunc);
	} catch ( _err ) {
		try {
			return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(trunc);
		} catch ( _err2 ) {
			return String(trunc);
		}
	}
}

/**
 * Bar context for Fuel (units). Presentation only — never mutates Actor.
 * @param {unknown} fuelValue
 * @param {unknown} fuelCap
 * @returns {{
 *   fuelPct: number,
 *   fuelBarLabel: string,
 *   fuelHasCap: boolean,
 *   fuelValueFormatted: string,
 *   fuelCapFormatted: string
 * }}
 */
export function buildStarshipFuelBarContext(fuelValue, fuelCap) {
	const value = Number.isFinite(Number(fuelValue)) ? Math.max(0, Math.trunc(Number(fuelValue))) : 0;
	const cap = Number.isFinite(Number(fuelCap)) ? Math.max(0, Math.trunc(Number(fuelCap))) : 0;
	const pct = cap > 0
		? Math.min(100, Math.max(0, Math.round((value / cap) * 100)))
		: (value > 0 ? 100 : 0);
	const valueFmt = formatStarshipWholeNumber(value);
	const capFmt = formatStarshipWholeNumber(cap);
	const barLabel = cap > 0 ? `${valueFmt} / ${capFmt} units` : `${valueFmt} units`;
	return {
		fuelPct: pct,
		fuelBarLabel: barLabel,
		fuelHasCap: cap > 0,
		fuelValueFormatted: valueFmt,
		fuelCapFormatted: capFmt
	};
}
