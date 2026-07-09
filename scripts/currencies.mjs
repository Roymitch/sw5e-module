import { getModulePath } from "./module-support.mjs";

export const BASE_CURRENCY_KEY = "gc";

const CURRENCY_ALIASES = Object.freeze({
	credit: BASE_CURRENCY_KEY,
	credits: BASE_CURRENCY_KEY,
	gc: BASE_CURRENCY_KEY,
	gp: BASE_CURRENCY_KEY,
	ic: BASE_CURRENCY_KEY,
	imperialcredit: BASE_CURRENCY_KEY,
	imperialcredits: BASE_CURRENCY_KEY,
	"imperial-credit": BASE_CURRENCY_KEY
});

const DND5E_GOLD_ICON = "systems/dnd5e/icons/currency/gold.webp";
const FOUNDRY_COINS_ICON = "icons/svg/coins.svg"; // absolute last resort if gold path is unavailable

function toFiniteNumber(value, fallback=null) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
}

function isNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}

/**
 * Resolve a valid icon path for Galactic Credits.
 * Precedence: existing gc.icon → module asset → dnd5e gold → Foundry coins.
 * Do not inherit gp.icon — stock dnd5e always has gold.webp, which would hide the SW5e coin.
 */
function resolveGcCurrencyIcon(existing={}) {
	if ( isNonEmptyString(existing.icon) ) return existing.icon.trim();

	try {
		const moduleIcon = getModulePath("assets/currency/gc.svg");
		if ( isNonEmptyString(moduleIcon) ) return moduleIcon;
	} catch {
		/* fall through to system defaults */
	}

	return isNonEmptyString(DND5E_GOLD_ICON) ? DND5E_GOLD_ICON : FOUNDRY_COINS_ICON;
}

export function getBaseCurrencyKey() {
	return BASE_CURRENCY_KEY;
}

export function normalizeSwCurrencyKey(key) {
	if ( typeof key !== "string" ) return key;
	const normalized = key.trim().toLowerCase();
	return CURRENCY_ALIASES[normalized] ?? normalized;
}

export function normalizeSwPriceDenomination(denomination, { fallbackToBase=true }={}) {
	const normalized = normalizeSwCurrencyKey(denomination);
	if ( CONFIG.DND5E?.currencies?.[normalized] ) return normalized;
	return fallbackToBase ? BASE_CURRENCY_KEY : normalized;
}

/**
 * Merge legacy gp/credit wallet keys into gc without removing other denominations or amounts.
 */
export function normalizeSwCurrencyWallet(wallet={}) {
	const normalized = { ...(wallet ?? {}) };
	let gcTotal = toFiniteNumber(normalized[BASE_CURRENCY_KEY], 0) ?? 0;

	for ( const [key, value] of Object.entries(wallet ?? {}) ) {
		if ( key === BASE_CURRENCY_KEY ) continue;
		if ( normalizeSwCurrencyKey(key) !== BASE_CURRENCY_KEY ) continue;
		gcTotal += toFiniteNumber(value, 0) ?? 0;
		delete normalized[key];
	}

	normalized[BASE_CURRENCY_KEY] = gcTotal;
	return normalized;
}

/**
 * Ensure Galactic Credits exists on CONFIG.DND5E.currencies without replacing other currencies.
 * Third-party modules may patch labels, rates, icons, or additional denominations afterward.
 */
export function applySw5eGalacticCreditsDefault(config) {
	config.currencies ??= {};
	const existing = config.currencies[BASE_CURRENCY_KEY] ?? {};
	config.currencies[BASE_CURRENCY_KEY] = {
		label: "SW5E.CurrencyGC",
		abbreviation: "SW5E.CurrencyAbbrGC",
		conversion: 1,
		...existing,
		// Always assign last so an empty/undefined existing.icon cannot wipe the resolved path.
		icon: resolveGcCurrencyIcon(existing)
	};
}
