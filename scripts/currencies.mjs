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

/** Stock dnd5e coins-per-gp conversion rates (gp ≡ Credits). */
export const PHB_CURRENCY_CONVERSION = Object.freeze({
	pp: 0.1,
	gp: 1,
	ep: 2,
	sp: 10,
	cp: 100
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
 * Fold orphan PHB wallet keys and credit aliases into Galactic Credits, then delete those keys.
 * Leaves non-PHB leftovers (e.g. Era 2 wu/tr/pg) untouched.
 *
 * Conversion uses stock dnd5e coins-per-gp rates with gc ≡ former gp.
 * Credit aliases (credit, gp, ic, …) fold 1:1 into gc.
 *
 * @param {object} wallet
 * @returns {object}
 */
export function foldOrphanPhbCurrencyWallet(wallet={}) {
	const normalized = { ...(wallet ?? {}) };
	let gcTotal = toFiniteNumber(normalized[BASE_CURRENCY_KEY], 0) ?? 0;

	for ( const [key, value] of Object.entries(wallet ?? {}) ) {
		if ( key === BASE_CURRENCY_KEY ) continue;

		const amount = toFiniteNumber(value, 0) ?? 0;
		const lower = typeof key === "string" ? key.trim().toLowerCase() : key;

		// Credit / gp aliases → 1:1 into gc
		if ( normalizeSwCurrencyKey(key) === BASE_CURRENCY_KEY ) {
			gcTotal += amount;
			delete normalized[key];
			continue;
		}

		// Remaining PHB coins (pp/ep/sp/cp) → convert by coins-per-gp
		const conversion = PHB_CURRENCY_CONVERSION[lower];
		if ( conversion != null && conversion > 0 ) {
			gcTotal += amount / conversion;
			delete normalized[key];
		}
	}

	normalized[BASE_CURRENCY_KEY] = gcTotal;
	return normalized;
}

/**
 * Normalize actor wallets for SW5e Credits-only: fold PHB orphans + aliases into gc.
 */
export function normalizeSwCurrencyWallet(wallet={}) {
	return foldOrphanPhbCurrencyWallet(wallet);
}

/**
 * Restore Era 1 Credits-only currency CONFIG.
 * When strict, wipe stock dnd5e denominations (pp/gp/ep/sp/cp) and publish only Galactic Credits.
 * Icon resolution is left as-is for a later redo slice.
 */
export function applySw5eCreditsOnlyConfig(config, strict=true) {
	if ( strict ) config.currencies = {};
	else config.currencies ??= {};

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
