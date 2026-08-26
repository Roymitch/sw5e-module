/**
 * Canonical Force/Tech point cost helpers for SW5e powercasting discounts.
 * Pure calculation only — no document writes.
 */

/** Ephemeral usage-config marker: discounted FP/TP consumption already applied. */
export const POWER_POINT_DISCOUNT_APPLIED = Symbol.for("sw5e.powerPointDiscountApplied");

export const FORCE_POWER_DISCOUNT_FLAG = "forcePowerDiscount";
export const TECH_POWER_DISCOUNT_FLAG = "techPowerDiscount";

const FORCE_POINTS_TARGET = "powercasting.force.points.value";
const TECH_POINTS_TARGET = "powercasting.tech.points.value";

/**
 * Only finite values representing an exact non-negative integer are valid.
 * Examples: 2, "2", 2.0, "2.0" → 2; 2.7, "2.7", negative, blank, null → 0.
 * @param {unknown} value
 * @returns {number}
 */
export function normalizePowerPointDiscount(value) {
	if ( value === null || value === undefined ) return 0;
	if ( typeof value === "string" ) {
		const text = value.trim();
		if ( !text ) return 0;
		if ( !/^\d+(\.0+)?$/.test(text) ) return 0;
		const numeric = Number(text);
		if ( !Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0 ) return 0;
		return numeric;
	}
	if ( typeof value !== "number" ) return 0;
	if ( !Number.isFinite(value) || !Number.isInteger(value) || value < 0 ) return 0;
	return value;
}

/**
 * @param {"force"|"tech"} castType
 * @returns {string}
 */
export function getPowerPointDiscountFlagKey(castType) {
	return castType === "tech" ? TECH_POWER_DISCOUNT_FLAG : FORCE_POWER_DISCOUNT_FLAG;
}

/**
 * Prepared (Active-Effect-adjusted) discount for runtime cost resolution.
 * @param {object|null|undefined} actor
 * @param {"force"|"tech"} castType
 * @returns {number}
 */
export function getActorPowerPointDiscount(actor, castType) {
	if ( !actor || (castType !== "force" && castType !== "tech") ) return 0;
	const key = getPowerPointDiscountFlagKey(castType);
	return normalizePowerPointDiscount(actor?.flags?.sw5e?.[key]);
}

/**
 * Source/base discount for Power Point Config preload and save.
 * @param {object|null|undefined} actor
 * @param {"force"|"tech"} castType
 * @returns {number}
 */
export function getActorPowerPointDiscountSource(actor, castType) {
	if ( !actor || (castType !== "force" && castType !== "tech") ) return 0;
	const key = getPowerPointDiscountFlagKey(castType);
	return normalizePowerPointDiscount(actor?._source?.flags?.sw5e?.[key]);
}

/**
 * @param {unknown} target
 * @returns {"force"|"tech"|null}
 */
export function getPowercastingTypeFromAttributeTarget(target) {
	if ( target === FORCE_POINTS_TARGET ) return "force";
	if ( target === TECH_POINTS_TARGET ) return "tech";
	return null;
}

/**
 * @param {unknown} target
 * @returns {boolean}
 */
export function isRecognizedPowerPointTarget(target) {
	return getPowercastingTypeFromAttributeTarget(target) !== null;
}

/**
 * @param {object|null|undefined} item
 * @returns {"force"|"tech"|null}
 */
function getPowercastingTypeFromSchoolMetadata(item) {
	if ( item?.type !== "spell" ) return null;
	const school = item?.system?.school;
	if ( typeof school !== "string" || !school ) return null;
	const powerCasting = globalThis.CONFIG?.DND5E?.powerCasting ?? {};
	if ( school in (powerCasting.force?.schools ?? {}) ) return "force";
	if ( school in (powerCasting.tech?.schools ?? {}) ) return "tech";
	return null;
}

/**
 * Collect attribute consumption targets from an activity and/or item.
 * @param {object|null|undefined} item
 * @param {object|null|undefined} activity
 * @returns {string[]}
 */
function collectAttributeConsumeTargets(item, activity) {
	const targets = [];
	const pushTarget = value => {
		if ( typeof value === "string" && value ) targets.push(value);
	};

	const activityTargets = activity?.consumption?.targets;
	if ( activityTargets ) {
		for ( const entry of activityTargets ) {
			if ( entry?.type === "attribute" ) pushTarget(entry.target);
		}
	}

	const activities = item?.system?.activities;
	if ( activities ) {
		const list = typeof activities.values === "function"
			? [...activities.values()]
			: Object.values(activities);
		for ( const act of list ) {
			for ( const entry of act?.consumption?.targets ?? [] ) {
				if ( entry?.type === "attribute" ) pushTarget(entry.target);
			}
		}
	}

	const legacy = item?.system?.consume;
	if ( legacy?.type === "attribute" || typeof legacy?.target === "string" ) {
		pushTarget(legacy.target);
	}

	return targets;
}

/**
 * @param {object|null|undefined} item
 * @param {object|null|undefined} activity
 * @returns {"force"|"tech"|null}
 */
function getPowercastingTypeFromConsumeTargets(item, activity) {
	const found = new Set();
	for ( const target of collectAttributeConsumeTargets(item, activity) ) {
		const type = getPowercastingTypeFromAttributeTarget(target);
		if ( type ) found.add(type);
	}
	if ( found.size === 1 ) return [...found][0];
	return null;
}

/**
 * Shared Force/Tech classifier used by preview, affordability, consumption, and tests.
 * @param {object|null|undefined} item
 * @param {object|null|undefined} [activity]
 * @returns {"force"|"tech"|null}
 */
export function classifyPowercastingType(item, activity=null) {
	if ( !item ) return null;
	const type = item.type;
	if ( type === "maneuver" || type === "sw5e-module.maneuver" || type === "sw5e.maneuver" ) return null;

	const fromMetadata = getPowercastingTypeFromSchoolMetadata(item);
	const fromTarget = getPowercastingTypeFromConsumeTargets(item, activity);

	if ( fromMetadata ) {
		if ( fromTarget && fromTarget !== fromMetadata ) return null;
		return fromMetadata;
	}

	// Legacy fallback: exact FP/TP attribute target on a spell / powerCasting item only.
	if ( fromTarget && (item.type === "spell" || item?.system?.method === "powerCasting") ) {
		return fromTarget;
	}

	return null;
}

/**
 * Unscaled base point cost from the matching activity/item consume amount.
 * @param {object|null|undefined} item
 * @param {object|null|undefined} activity
 * @param {"force"|"tech"} powercastingType
 * @returns {number}
 */
export function getUnscaledPowerPointBaseCost(item, activity, powercastingType) {
	const targetPath = powercastingType === "tech" ? TECH_POINTS_TARGET : FORCE_POINTS_TARGET;
	const activityTarget = activity?.consumption?.targets
		? [...(typeof activity.consumption.targets.values === "function"
			? activity.consumption.targets.values()
			: activity.consumption.targets)].find(target =>
			target?.type === "attribute" && target?.target === targetPath
		)
		: null;

	let baseCostValue = activityTarget?.value;
	if ( baseCostValue === undefined || baseCostValue === null || baseCostValue === "" ) {
		const legacy = item?.system?.consume;
		if ( legacy?.target === targetPath ) baseCostValue = legacy.amount;
	}
	if ( baseCostValue === undefined || baseCostValue === null || baseCostValue === "" ) {
		const activities = item?.system?.activities;
		const list = activities
			? (typeof activities.values === "function" ? [...activities.values()] : Object.values(activities))
			: [];
		for ( const act of list ) {
			const match = (act?.consumption?.targets ?? []).find(target =>
				target?.type === "attribute" && target?.target === targetPath
			);
			if ( match ) {
				baseCostValue = match.value;
				break;
			}
		}
	}

	const baseCost = Number(baseCostValue);
	return Number.isFinite(baseCost) ? baseCost : 0;
}

/**
 * @param {object|null|undefined} item
 * @param {unknown} castLevel
 * @returns {number}
 */
export function resolveSelectedCastLevel(item, castLevel) {
	const itemLevel = Number.isFinite(Number(item?.system?.level)) ? Number(item.system.level) : 0;
	const selected = Number(castLevel);
	return Number.isFinite(selected) ? selected : itemLevel;
}

/**
 * Derive selected cast level from usage config without double-counting scaling.
 * Prefer submitted spell.slot; use usageConfig.scaling only when slot is unavailable.
 * @param {object|null|undefined} item
 * @param {object|null|undefined} usageConfig
 * @returns {number}
 */
export function resolveSelectedCastLevelFromUsage(item, usageConfig) {
	const itemLevel = Number.isFinite(Number(item?.system?.level)) ? Number(item.system.level) : 0;
	const slotRaw = usageConfig?.spell?.slot;
	if ( slotRaw !== undefined && slotRaw !== null && slotRaw !== "" ) {
		const fromSlot = Number(slotRaw);
		if ( Number.isFinite(fromSlot) ) return fromSlot;
	}
	const scaling = Number(usageConfig?.scaling);
	if ( Number.isFinite(scaling) && scaling >= 0 ) return itemLevel + scaling;
	return itemLevel;
}

/**
 * Canonical point-cost resolver. Owns scaling exactly once from selectedLevel - itemLevel.
 * Callers must not supply an additional scaling amount.
 *
 * @param {object} [options]
 * @param {object|null|undefined} [options.actor]
 * @param {object|null|undefined} [options.item]
 * @param {object|null|undefined} [options.activity]
 * @param {unknown} [options.castLevel]
 * @returns {{
 *   powercastingType: "force"|"tech"|null,
 *   baseCost: number,
 *   itemLevel: number,
 *   selectedLevel: number,
 *   scalingCost: number,
 *   rawCost: number,
 *   discount: number,
 *   finalCost: number
 * }}
 */
export function resolvePowerPointCost({ actor=null, item=null, activity=null, castLevel }={}) {
	const powercastingType = classifyPowercastingType(item, activity);
	const itemLevel = Number.isFinite(Number(item?.system?.level)) ? Number(item.system.level) : 0;
	const selectedLevel = resolveSelectedCastLevel(item, castLevel);

	if ( !powercastingType ) {
		return {
			powercastingType: null,
			baseCost: 0,
			itemLevel,
			selectedLevel,
			scalingCost: 0,
			rawCost: 0,
			discount: 0,
			finalCost: 0
		};
	}

	const baseCost = getUnscaledPowerPointBaseCost(item, activity, powercastingType);
	const scalingCost = Math.max(0, selectedLevel - itemLevel);
	const rawCost = baseCost + scalingCost;
	const discount = getActorPowerPointDiscount(actor, powercastingType);
	const finalCost = Math.max(0, rawCost - discount);

	return {
		powercastingType,
		baseCost,
		itemLevel,
		selectedLevel,
		scalingCost,
		rawCost,
		discount,
		finalCost
	};
}
