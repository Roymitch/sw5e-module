/**
 * Power Die recovery full-capacity notification policy (Foundry-free helpers).
 * Callers pass notifyFullCapacity explicitly — do not infer from UI text or caller names.
 */

function localizeOrFallback(key, fallback, data = {}) {
	const formatted = globalThis.game?.i18n?.format?.(key, data);
	if ( formatted && formatted !== key ) return formatted;
	const localized = globalThis.game?.i18n?.localize?.(key);
	if ( localized && localized !== key ) return localized;
	return Object.entries(data).reduce(
		(text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
		fallback
	);
}

/**
 * @param {object} [options]
 * @param {boolean} [options.notifyFullCapacity=true] Explicit Advanced Power Recover → warn.
 *   Automatic Regen sub-step should pass false for a quiet no-op.
 * @returns {false}
 */
export function notifyOrSkipStarshipPowerRecoveryFullCapacity({ notifyFullCapacity = true } = {}) {
	if ( notifyFullCapacity ) {
		globalThis.ui?.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipSheet.AdvancedPowerRecoveryFull",
			"All power die pools are already at capacity."
		));
	}
	return false;
}
