/**
 * Starship Feature recovery terminology — display-only label helpers.
 * Native period values remain `lr` / `sr` / `recharge`. Native Recharge is untouched.
 */

import { getCompendiumPack } from "./starship-sheet-ids.mjs";
import { localizeOrFallback } from "./starship-sheet-html.mjs";

/** Native dnd5e recovery period value for Long Rest. */
export const STARSHIP_RECOVERY_PERIOD_LR = "lr";
/** Native dnd5e recovery period value for Short Rest. */
export const STARSHIP_RECOVERY_PERIOD_SR = "sr";
/** Native dnd5e recharge-check period value (unchanged). */
export const STARSHIP_RECOVERY_PERIOD_RECHARGE = "recharge";

export const STARSHIP_FEATURE_FEAT_TYPES = new Set(["starship", "starshipAction"]);
export const STARSHIP_FEATURE_PACKS = new Set(["starshipfeatures", "starshiped"]);

/**
 * Resolve pack key from sourceId or live `item.pack` (parentless compendium docs).
 * @param {Item|object|null|undefined} item
 * @returns {string|null}
 */
export function resolveStarshipFeaturePackKey(item) {
	const fromSource = getCompendiumPack(item);
	if ( fromSource ) return fromSource;
	const pack = item?.pack;
	if ( typeof pack === "string" && pack.includes(".") ) {
		const key = pack.split(".").at(-1);
		return key || null;
	}
	return null;
}

/**
 * Authoritative Item identity for Starship Feature / Starship Action feats.
 * Does not use parent Actor type, sheet title, or name.
 * @param {Item|object|null|undefined} item
 * @returns {boolean}
 */
export function isSw5eStarshipFeatureItem(item) {
	if ( !item || item.type !== "feat" ) return false;
	const featType = item.system?.type?.value;
	if ( STARSHIP_FEATURE_FEAT_TYPES.has(featType) ) return true;
	const pack = resolveStarshipFeaturePackKey(item);
	return STARSHIP_FEATURE_PACKS.has(pack);
}

/**
 * Clone recovery-period select options and remap only lr/sr display labels.
 * Does not mutate the input array or CONFIG.
 * @param {Array<{value: string, label: string, group?: string}>|null|undefined} nativeOptions
 * @returns {Array<{value: string, label: string, group?: string}>}
 */
export function cloneStarshipRecoveryPeriodChoices(nativeOptions) {
	const options = Array.isArray(nativeOptions)
		? nativeOptions.map(option => (option && typeof option === "object" ? { ...option } : option))
		: [];
	for ( const option of options ) {
		if ( !option || typeof option !== "object" ) continue;
		if ( option.value === STARSHIP_RECOVERY_PERIOD_LR ) {
			option.label = localizeOrFallback(
				"SW5E.Starship.RecoveryPeriod.RefittingLongRest",
				"Refitting (Long Rest)"
			);
		} else if ( option.value === STARSHIP_RECOVERY_PERIOD_SR ) {
			option.label = localizeOrFallback(
				"SW5E.Starship.RecoveryPeriod.RechargeShortRest",
				"Recharge (Short Rest)"
			);
		}
	}
	return options;
}

/**
 * Compact abbreviation for one native recovery period (Starship Features column).
 * Recharge returns null so callers keep native Recovery-column emptiness.
 * @param {string|null|undefined} period
 * @returns {string|null}
 */
export function getStarshipRecoveryPeriodAbbreviation(period) {
	if ( period === STARSHIP_RECOVERY_PERIOD_LR ) {
		return localizeOrFallback("SW5E.Starship.RecoveryAbbreviation.Refitting", "RF");
	}
	if ( period === STARSHIP_RECOVERY_PERIOD_SR ) {
		return localizeOrFallback("SW5E.Starship.RecoveryAbbreviation.Recharge", "RC");
	}
	if ( period === STARSHIP_RECOVERY_PERIOD_RECHARGE ) return null;
	const config = globalThis.CONFIG?.DND5E?.limitedUsePeriods?.[period];
	if ( !config ) return null;
	return config.abbreviation ?? config.label ?? null;
}

/**
 * Build Features-tab Recovery column text parallel to dnd5e UsesField.prepareData.
 * Recharge entries are omitted (native Uses column / empty Recovery).
 * @param {Item|object|null|undefined} item
 * @returns {string}
 */
export function buildStarshipRecoveryCompactLabel(item) {
	const recovery = item?.system?.uses?.recovery;
	if ( !Array.isArray(recovery) || !recovery.length ) return "";

	const periods = [];
	for ( const entry of recovery ) {
		const period = entry?.period;
		if ( period === STARSHIP_RECOVERY_PERIOD_RECHARGE ) continue;
		const abbr = getStarshipRecoveryPeriodAbbreviation(period);
		if ( abbr ) periods.push(abbr);
	}
	if ( !periods.length ) return "";

	const formatter = globalThis.game?.i18n?.getListFormatter?.({ style: "narrow" });
	return formatter ? formatter.format(periods) : periods.join(", ");
}
