/**
 * Maneuver Item Details sheet context helpers (Bug 26 / Phase 0C-B).
 *
 * Builds FormSelect-style option arrays consumed by `details-maneuver.hbs` and
 * dnd5e field partials (`field-activation` / `field-range` / `field-duration`).
 * Mirrors the resulting Spell sheet context *shapes* using public CONFIG.DND5E
 * tables — does not copy SpellData.getSheetData internals.
 */

/**
 * Whether a persisted/sourceClass string is known poison from object coercion.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPoisonedSourceClass(value) {
	return value === "[object Object]";
}

/**
 * Build Source Class `{ value, label }[]` options from actor.spellcastingClasses.
 *
 * Contract:
 * - `value` is the identifier key from Object.entries (always a string).
 * - `label` is a safe display name (`cls.name` when usable).
 * - Malformed entries (missing class doc / unusable label) are omitted.
 * - Does not discard keys for being "non-string" — entries keys are strings.
 *
 * @param {Record<string, { name?: unknown }>|null|undefined} spellcastingClasses
 * @returns {{ value: string, label: string }[]}
 */
export function buildManeuverSourceClassOptions(spellcastingClasses) {
	const options = [];
	for ( const [value, cls] of Object.entries(spellcastingClasses ?? {}) ) {
		if ( !cls || (typeof cls !== "object") || Array.isArray(cls) ) continue;
		const label = cls.name;
		if ( (typeof label !== "string") || !label ) continue;
		options.push({ value, label });
	}
	return options;
}

/**
 * Activation type options for `dnd5e.field-activation` (Spell Details shape).
 * Labels remain localization keys; formField localizes them.
 *
 * @param {object} [config=globalThis.CONFIG?.DND5E]
 * @returns {{ value: string, label: string, group?: string }[]}
 */
export function buildManeuverActivationTypes(config = globalThis.CONFIG?.DND5E) {
	const types = config?.activityActivationTypes ?? {};
	return [
		...Object.entries(types).map(([value, entry]) => ({
			value,
			label: entry?.label,
			group: entry?.group
		})),
		{ value: "", label: "DND5E.NoneActionLabel" }
	];
}

/**
 * Duration unit options for `dnd5e.field-duration` (Spell Details shape).
 *
 * @param {object} [config=globalThis.CONFIG?.DND5E]
 * @returns {{ value: string, label: string, group?: string }[]}
 */
export function buildManeuverDurationUnits(config = globalThis.CONFIG?.DND5E) {
	const special = config?.specialTimePeriods ?? {};
	const scalar = config?.scalarTimePeriods ?? {};
	const permanent = config?.permanentTimePeriods ?? {};
	return [
		...Object.entries(special).map(([value, label]) => ({ value, label })),
		...Object.entries(scalar).map(([value, label]) => ({
			value, label, group: "DND5E.DurationTime"
		})),
		...Object.entries(permanent).map(([value, label]) => ({
			value, label, group: "DND5E.DurationPermanent"
		}))
	];
}

/**
 * Range type / unit options for `dnd5e.field-range` (Spell Details shape).
 *
 * @param {object} [config=globalThis.CONFIG?.DND5E]
 * @returns {{ value: string, label: string, group?: string }[]}
 */
export function buildManeuverRangeTypes(config = globalThis.CONFIG?.DND5E) {
	const rangeTypes = config?.rangeTypes ?? {};
	const movementUnits = config?.movementUnits ?? {};
	return [
		...Object.entries(rangeTypes).map(([value, label]) => ({ value, label })),
		...Object.entries(movementUnits).map(([value, entry]) => ({
			value,
			label: entry?.label,
			group: "DND5E.RangeDistance"
		}))
	];
}

/**
 * Whether a prepared summary label is meaningful for display.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMeaningfulSummaryLabel(value) {
	if ( value == null ) return false;
	if ( typeof value !== "string" ) return false;
	return value.trim().length > 0;
}

/**
 * Build read-only Description-tab summary rows from prepared Item labels.
 * Item-owned labels only — no Activity sync, no description-text inference.
 *
 * @param {Item|null|undefined} item
 * @returns {{ label: string, value: string }[]}
 */
export function buildManeuverDescriptionSummary(item) {
	const labels = item?.labels ?? {};
	const rows = [];

	const activation = isMeaningfulSummaryLabel(labels.ritualActivation)
		? labels.ritualActivation
		: (isMeaningfulSummaryLabel(labels.activation) ? labels.activation : null);
	if ( activation ) rows.push({ label: "SW5E.Maneuver.ActivationTime", value: activation });

	if ( isMeaningfulSummaryLabel(labels.range) ) {
		rows.push({ label: "DND5E.Range", value: labels.range });
	}

	if ( isMeaningfulSummaryLabel(labels.target) ) {
		rows.push({ label: "DND5E.Target", value: labels.target });
	}

	const duration = isMeaningfulSummaryLabel(labels.concentrationDuration)
		? labels.concentrationDuration
		: (isMeaningfulSummaryLabel(labels.duration) ? labels.duration : null);
	if ( duration ) rows.push({ label: "DND5E.Duration", value: duration });

	// Area is already folded into `labels.target` when a template exists (dnd5e TargetField).
	// Item-local limited uses only — never Superiority pool.
	const usesLabel = item?.system?.uses?.label;
	if ( isMeaningfulSummaryLabel(usesLabel) ) {
		rows.push({ label: "DND5E.Uses", value: usesLabel });
	}

	return rows;
}
