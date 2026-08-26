/**
 * Phase 3B / Bug 12 — Slice 3B-1 pure replenishment / food-capacity / cost-mode math.
 *
 * Side-effect free: no Actor access, document updates, DialogV2, notifications,
 * sheet mutation, or flag writes. Production callers are not switched in this slice.
 *
 * Later integration (not written here) stores independent modes at:
 *   flags.sw5e.starship.fuel.replenishCostMode
 *   flags.sw5e.starship.food.replenishCostMode
 */

/** @typedef {"perRestock"|"perUnit"} StarshipReplenishCostMode */

export const STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK = "perRestock";
export const STARSHIP_REPLENISH_COST_MODE_PER_UNIT = "perUnit";

/** Documented paths for later Slice 3B-2+ integration (helpers do not read/write these). */
export const STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG = "flags.sw5e.starship.fuel.replenishCostMode";
export const STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG = "flags.sw5e.starship.food.replenishCostMode";

/**
 * Non-negative whole-number normalization for resource values, capacities, and costs.
 * Truncates toward zero after Number(); rejects non-finite, negative, and non-numeric junk.
 * Dialog action strings (e.g. "refuel") → null.
 *
 * @param {unknown} raw
 * @returns {number|null}
 */
export function normalizeStarshipNonNegativeInt(raw) {
	if ( raw === undefined || raw === null ) return null;
	if ( typeof raw === "string" ) {
		const trimmed = raw.trim();
		if ( trimmed === "" ) return null;
		// Reject pure action / label strings that Number would coerce to NaN anyway,
		// and any non-numeric token (including "refuel" / "restock").
		if ( !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed) ) return null;
	}
	const n = Number(raw);
	if ( !Number.isFinite(n) ) return null;
	const trunc = Math.trunc(n);
	if ( trunc < 0 ) return null;
	return trunc;
}

/**
 * Signed whole-number normalization for Food capacity modifiers (and similar ADD AE fields).
 * Truncates toward zero. Invalid / action strings / non-finite → 0 (never null).
 *
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizeStarshipSignedInt(raw) {
	if ( raw === undefined || raw === null ) return 0;
	if ( typeof raw === "string" ) {
		const trimmed = raw.trim();
		if ( trimmed === "" ) return 0;
		if ( !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed) ) return 0;
	}
	const n = Number(raw);
	if ( !Number.isFinite(n) ) return 0;
	return Math.trunc(n);
}

/**
 * Positive whole-number quantity for burn/consume/add requests.
 * Zero, negative, non-numeric, and DialogV2 action strings → null.
 *
 * @param {unknown} raw
 * @returns {number|null}
 */
export function normalizeStarshipPositiveQuantity(raw) {
	const n = normalizeStarshipNonNegativeInt(raw);
	if ( n === null || n < 1 ) return null;
	return n;
}

/**
 * Replenishment room from current stock and effective capacity.
 * Does not lower current when current exceeds capacity — room is 0.
 *
 * @param {unknown} current
 * @param {unknown} effectiveCapacity
 * @returns {{current: number, capacity: number, room: number}}
 */
export function resolveStarshipReplenishRoom(current, effectiveCapacity) {
	const cur = normalizeStarshipNonNegativeInt(current) ?? 0;
	const cap = normalizeStarshipNonNegativeInt(effectiveCapacity) ?? 0;
	return {
		current: cur,
		capacity: cap,
		room: Math.max(0, cap - cur)
	};
}

/**
 * Add / replenish resolution (Fuel Refuel / Food Restock math).
 *
 * @param {unknown} requested
 * @param {unknown} current
 * @param {unknown} effectiveCapacity
 * @returns {{
 *   requested: number|null,
 *   current: number,
 *   capacity: number,
 *   room: number,
 *   applied: number,
 *   newValue: number,
 *   overRequest: boolean,
 *   shouldUpdate: boolean
 * }}
 */
export function resolveStarshipReplenishAdd(requested, current, effectiveCapacity) {
	const roomInfo = resolveStarshipReplenishRoom(current, effectiveCapacity);
	const req = normalizeStarshipPositiveQuantity(requested);
	if ( req === null || roomInfo.room <= 0 ) {
		return {
			requested: req,
			current: roomInfo.current,
			capacity: roomInfo.capacity,
			room: roomInfo.room,
			applied: 0,
			newValue: roomInfo.current,
			overRequest: false,
			shouldUpdate: false
		};
	}
	const applied = Math.min(req, roomInfo.room);
	return {
		requested: req,
		current: roomInfo.current,
		capacity: roomInfo.capacity,
		room: roomInfo.room,
		applied,
		newValue: roomInfo.current + applied,
		overRequest: req > roomInfo.room,
		shouldUpdate: applied > 0
	};
}

/**
 * Consume / burn resolution (Fuel Burn / Food Consume math).
 *
 * @param {unknown} requested
 * @param {unknown} current
 * @returns {{
 *   requested: number|null,
 *   current: number,
 *   applied: number,
 *   newValue: number,
 *   overRequest: boolean,
 *   shouldUpdate: boolean
 * }}
 */
export function resolveStarshipReplenishConsume(requested, current) {
	const cur = normalizeStarshipNonNegativeInt(current) ?? 0;
	const req = normalizeStarshipPositiveQuantity(requested);
	if ( req === null || cur <= 0 ) {
		return {
			requested: req,
			current: cur,
			applied: 0,
			newValue: cur,
			overRequest: false,
			shouldUpdate: false
		};
	}
	const applied = Math.min(req, cur);
	return {
		requested: req,
		current: cur,
		applied,
		newValue: cur - applied,
		overRequest: req > cur,
		shouldUpdate: applied > 0
	};
}

/**
 * Food capacity resolution: Size RAW base OR custom base + signed prepared modifier.
 * Does not infer ship size from the capacity number. Does not mutate current Food.
 *
 * Safe-integer policy: when `selectedBase + modifier` is outside Number.isSafeInteger,
 * `safeInteger` is false and `effectiveCapacity` still uses `max(0, unclamped)` from the
 * IEEE sum so callers can refuse to display an exact unsafe total. Stored bases/mods
 * are never rewritten by this helper.
 *
 * outsideRaw uses custom base vs Size RAW only — modifiers do not set outsideRaw.
 *
 * @param {unknown} rawSizeFoodCap
 * @param {unknown} actorFoodCap
 * @param {unknown} overrideActive
 * @param {unknown} [foodCapMod=0]
 * @returns {{
 *   normalizedRawBase: number,
 *   normalizedCustomBase: number,
 *   rawCap: number,
 *   actorCap: number,
 *   overrideActive: boolean,
 *   selectedBase: number,
 *   normalizedModifier: number,
 *   unclampedEffectiveCapacity: number,
 *   effectiveCapacity: number,
 *   effectiveCap: number,
 *   safeInteger: boolean,
 *   outsideRaw: boolean,
 *   tinyPositiveCustom: boolean,
 *   tinyPositiveOverride: boolean
 * }}
 */
export function resolveStarshipFoodCapacity(rawSizeFoodCap, actorFoodCap, overrideActive, foodCapMod=0) {
	const rawBase = normalizeStarshipNonNegativeInt(rawSizeFoodCap) ?? 0;
	const customBase = normalizeStarshipNonNegativeInt(actorFoodCap) ?? 0;
	const active = overrideActive === true || overrideActive === "true" || overrideActive === 1;
	const selectedBase = active ? customBase : rawBase;
	const modifier = normalizeStarshipSignedInt(foodCapMod);
	const unclamped = selectedBase + modifier;
	const safeInteger = Number.isSafeInteger(selectedBase)
		&& Number.isSafeInteger(modifier)
		&& Number.isSafeInteger(unclamped);
	const effective = Math.max(0, unclamped);
	const tinyPositiveCustom = active && rawBase === 0 && customBase > 0;
	return {
		normalizedRawBase: rawBase,
		normalizedCustomBase: customBase,
		rawCap: rawBase,
		actorCap: customBase,
		overrideActive: active,
		selectedBase,
		normalizedModifier: modifier,
		unclampedEffectiveCapacity: unclamped,
		effectiveCapacity: effective,
		effectiveCap: effective,
		safeInteger,
		outsideRaw: active && customBase !== rawBase,
		tinyPositiveCustom,
		tinyPositiveOverride: tinyPositiveCustom
	};
}

/**
 * Resource-independent cost-mode resolution. Does not read Actor flags.
 *
 * @param {unknown} rawMode
 * @returns {StarshipReplenishCostMode}
 */
export function resolveStarshipReplenishCostMode(rawMode) {
	if ( rawMode === STARSHIP_REPLENISH_COST_MODE_PER_UNIT ) return STARSHIP_REPLENISH_COST_MODE_PER_UNIT;
	if ( rawMode === STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK ) return STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK;
	return STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK;
}

/**
 * Display / transaction cost from mode, configured cost, and **applied** quantity.
 * No currency mutation. Uses applied (post-clamp) quantity only.
 *
 * Safe-integer boundary: when `perUnit` product exceeds `Number.MAX_SAFE_INTEGER`,
 * `safeInteger` is false and `displayCost` still returns the IEEE product so callers
 * can choose how to present overflow rather than silently inventing a different value.
 *
 * @param {unknown} rawMode
 * @param {unknown} configuredCost
 * @param {unknown} appliedQuantity
 * @returns {{
 *   mode: StarshipReplenishCostMode,
 *   configuredCost: number,
 *   applied: number,
 *   displayCost: number,
 *   safeInteger: boolean
 * }}
 */
export function calculateStarshipReplenishDisplayCost(rawMode, configuredCost, appliedQuantity) {
	const mode = resolveStarshipReplenishCostMode(rawMode);
	const cost = normalizeStarshipNonNegativeInt(configuredCost) ?? 0;
	const applied = normalizeStarshipNonNegativeInt(appliedQuantity) ?? 0;
	if ( applied <= 0 ) {
		return { mode, configuredCost: cost, applied: 0, displayCost: 0, safeInteger: true };
	}
	let displayCost;
	if ( mode === STARSHIP_REPLENISH_COST_MODE_PER_UNIT ) {
		displayCost = applied * cost;
	} else {
		displayCost = cost;
	}
	const safeInteger = Number.isSafeInteger(displayCost);
	return { mode, configuredCost: cost, applied, displayCost, safeInteger };
}

/**
 * Structured warning payload for later UI slices (no notifications here).
 *
 * @param {"burn"|"consume"|"refuel"|"restock"|string} operation
 * @param {number|null|undefined} requested
 * @param {number|null|undefined} applied
 * @returns {{
 *   operation: string,
 *   requested: number,
 *   applied: number,
 *   clamped: boolean
 * }|null}
 */
export function prepareStarshipReplenishClampWarning(operation, requested, applied) {
	const req = normalizeStarshipNonNegativeInt(requested);
	const app = normalizeStarshipNonNegativeInt(applied);
	if ( req === null || app === null ) return null;
	if ( req <= app ) return null;
	return {
		operation: String(operation ?? ""),
		requested: req,
		applied: app,
		clamped: true
	};
}
