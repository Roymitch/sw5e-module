/**
 * Phase 5 / Bug 10 — Starship-only virtual Token Resource façades.
 *
 * Identifiers persist on TokenDocument bar1/bar2.attribute.
 * Storage remains system.attributes.hp.{value,max,temp,tempmax}.
 * Token HUD write-back maps virtual IDs to hull/shield fields without using
 * stock `attributes.hp` → applyDamage (shield-first chat damage stays intact).
 */

import { getModuleId, localizeOrFallback } from "./module-support.mjs";
import { isSw5eStarshipActor } from "./starship-sheet-ids.mjs";
import {
	getStarshipEffectiveHullMax,
	getStarshipEffectiveShieldMax
} from "./starship-system-damage.mjs";

/** @type {string} Persisted Token bar attribute for Hull-only display. */
export const STARSHIP_TOKEN_RESOURCE_HULL = "sw5e.starshipHull";

/** @type {string} Persisted Token bar attribute for Shields-only display. */
export const STARSHIP_TOKEN_RESOURCE_SHIELDS = "sw5e.starshipShields";

export const STARSHIP_TOKEN_RESOURCE_IDS = Object.freeze([
	STARSHIP_TOKEN_RESOURCE_HULL,
	STARSHIP_TOKEN_RESOURCE_SHIELDS
]);

export const STARSHIP_TOKEN_RESOURCE_I18N = Object.freeze({
	group: "SW5E.TokenResource.Group",
	hull: "SW5E.TokenResource.StarshipHull",
	shields: "SW5E.TokenResource.StarshipShields"
});

export const STARSHIP_TOKEN_RESOURCE_FALLBACKS = Object.freeze({
	group: "SW5e Starship",
	hull: "Starship Hull",
	shields: "Starship Shields"
});

/** libWrapper targets confirmed against dnd5e 5.2.5 package exports. */
export const STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS = Object.freeze({
	tokenConfig: "dnd5e.applications.TokenConfig5e.prototype._prepareResourcesTab",
	prototypeTokenConfig: "dnd5e.applications.PrototypeTokenConfig5e.prototype._prepareResourcesTab",
	getBarAttribute: "dnd5e.documents.TokenDocument5e.prototype.getBarAttribute",
	modifyTokenAttribute: "dnd5e.documents.Actor5e.prototype.modifyTokenAttribute"
});

/**
 * Registration plan for offline contract tests.
 * getBarAttribute / Token Config use WRAPPER (must chain).
 * modifyTokenAttribute uses MIXED (virtual IDs cannot safely call stock).
 * @returns {{wrappers: string[], getBarAttributeType: "WRAPPER", modifyTokenAttributeType: "MIXED"}}
 */
export function getStarshipTokenResourceRegistrationPlan() {
	return {
		wrappers: [
			STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.tokenConfig,
			STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.prototypeTokenConfig,
			STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.getBarAttribute,
			STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.modifyTokenAttribute
		],
		wrapperType: "WRAPPER",
		getBarAttributeType: "WRAPPER",
		modifyTokenAttributeType: "MIXED",
		modifyTokenAttribute: true
	};
}

/**
 * @param {string|null|undefined} attribute
 * @returns {boolean}
 */
export function isStarshipTokenResourceAttribute(attribute) {
	return STARSHIP_TOKEN_RESOURCE_IDS.includes(attribute);
}

/**
 * @param {number|null|undefined} value
 * @returns {number} Finite non-negative integer (invalid → 0, matching sheet vitals)
 */
export function normalizeStarshipTokenResourceCurrent(value) {
	const n = Number(value);
	if ( !Number.isFinite(n) ) return 0;
	return Math.max(0, Math.trunc(n));
}

/**
 * @param {Actor} actor
 * @returns {{value: number, max: number}|null}
 */
export function readStarshipHullBarPair(actor) {
	const hp = actor?.system?.attributes?.hp;
	if ( !hp || typeof hp !== "object" ) return null;
	const value = normalizeStarshipTokenResourceCurrent(hp.value);
	const max = getStarshipEffectiveHullMax(actor, hp.max);
	if ( !Number.isFinite(max) ) return null;
	return { value, max: Math.max(0, Math.trunc(max)) };
}

/**
 * @param {Actor} actor
 * @returns {{value: number, max: number}|null}
 */
export function readStarshipShieldBarPair(actor) {
	const hp = actor?.system?.attributes?.hp;
	if ( !hp || typeof hp !== "object" ) return null;
	const value = normalizeStarshipTokenResourceCurrent(hp.temp);
	const max = getStarshipEffectiveShieldMax(actor, hp.tempmax);
	if ( !Number.isFinite(max) ) return null;
	return { value, max: Math.max(0, Math.trunc(max)) };
}

/**
 * Resolve a Starship virtual bar attribute.
 * @param {Actor} actor
 * @param {string|null|undefined} attribute
 * @returns {object|null|undefined}
 *   - `undefined` — not a Starship virtual attribute (caller must wrap to stock)
 *   - `null` — virtual attribute but unavailable
 *   - object — stock-compatible `{ type, attribute, value, max, editable }`
 */
export function resolveStarshipVirtualBarAttribute(actor, attribute) {
	if ( !isStarshipTokenResourceAttribute(attribute) ) return undefined;
	if ( !isSw5eStarshipActor(actor) ) return undefined;

	const pair = attribute === STARSHIP_TOKEN_RESOURCE_HULL
		? readStarshipHullBarPair(actor)
		: readStarshipShieldBarPair(actor);

	if ( !pair ) return null;
	return {
		type: "bar",
		attribute,
		value: pair.value,
		max: pair.max,
		editable: true
	};
}

/**
 * Build the two Starship Resource dropdown choices (localized labels).
 * @returns {{group: string, value: string, label: string}[]}
 */
export function buildStarshipTokenResourceChoices() {
	const group = localizeOrFallback(
		STARSHIP_TOKEN_RESOURCE_I18N.group,
		STARSHIP_TOKEN_RESOURCE_FALLBACKS.group
	);
	return [
		{
			group,
			value: STARSHIP_TOKEN_RESOURCE_HULL,
			label: localizeOrFallback(
				STARSHIP_TOKEN_RESOURCE_I18N.hull,
				STARSHIP_TOKEN_RESOURCE_FALLBACKS.hull
			)
		},
		{
			group,
			value: STARSHIP_TOKEN_RESOURCE_SHIELDS,
			label: localizeOrFallback(
				STARSHIP_TOKEN_RESOURCE_I18N.shields,
				STARSHIP_TOKEN_RESOURCE_FALLBACKS.shields
			)
		}
	];
}

/**
 * Append Starship-only virtual Resource choices without duplicates.
 * Preserves existing array order; appends only missing identifiers.
 * @param {object[]} barAttributes
 * @param {Actor|null|undefined} actor
 * @returns {object[]}
 */
export function appendStarshipTokenResourceChoices(barAttributes, actor) {
	if ( !Array.isArray(barAttributes) ) return barAttributes;
	if ( !isSw5eStarshipActor(actor) ) return barAttributes;

	for ( const choice of buildStarshipTokenResourceChoices() ) {
		if ( barAttributes.some(entry => entry?.value === choice.value) ) continue;
		barAttributes.push(choice);
	}
	return barAttributes;
}

/**
 * Resolve actor from Token Config / Prototype Token Config application.
 * @param {object} app
 * @returns {Actor|null}
 */
export function getTokenConfigActor(app) {
	return app?.actor ?? app?.object?.actor ?? app?.document?.actor ?? null;
}

/**
 * Compute the next current value for a virtual bar edit (Token HUD semantics).
 * Token HUD passes `value` as the delta when `isDelta` is true, otherwise absolute.
 * @param {number} current
 * @param {number} max
 * @param {number} value
 * @param {boolean} isDelta
 * @returns {number}
 */
export function resolveStarshipVirtualTokenAttributeNext(current, max, value, isDelta) {
	const cur = Number(current);
	const safeCurrent = Number.isFinite(cur) ? cur : 0;
	const raw = Number(value);
	const amount = Number.isFinite(raw) ? raw : 0;
	const next = isDelta ? safeCurrent + amount : amount;
	const safeMax = Number.isFinite(Number(max)) ? Math.max(0, Math.trunc(Number(max))) : 0;
	return Math.min(safeMax, Math.max(0, Math.trunc(next)));
}

/**
 * Apply a Token HUD / modifyTokenAttribute write for a Starship virtual resource.
 * Writes Hull → hp.value, Shields → hp.temp. Does not call applyDamage.
 * @param {Actor} actor
 * @param {string} attribute
 * @param {number} value
 * @param {boolean} [isDelta=false]
 * @returns {Promise<Actor|null>}
 */
export async function applyStarshipVirtualTokenAttributeUpdate(actor, attribute, value, isDelta=false) {
	if ( !isSw5eStarshipActor(actor) || !isStarshipTokenResourceAttribute(attribute) ) return null;

	if ( attribute === STARSHIP_TOKEN_RESOURCE_HULL ) {
		const pair = readStarshipHullBarPair(actor);
		if ( !pair ) return actor;
		const next = resolveStarshipVirtualTokenAttributeNext(pair.value, pair.max, value, isDelta);
		if ( next === pair.value ) return actor;
		await actor.update({ "system.attributes.hp.value": next });
		return actor;
	}

	if ( attribute === STARSHIP_TOKEN_RESOURCE_SHIELDS ) {
		const pair = readStarshipShieldBarPair(actor);
		if ( !pair ) return actor;
		const next = resolveStarshipVirtualTokenAttributeNext(pair.value, pair.max, value, isDelta);
		if ( next === pair.value ) return actor;
		await actor.update({ "system.attributes.hp.temp": next });
		return actor;
	}

	return null;
}

/**
 * Whether this modifyTokenAttribute call should be handled as a Starship virtual write.
 * @param {Actor} actor
 * @param {string} attribute
 * @returns {boolean}
 */
export function shouldHandleStarshipVirtualTokenAttribute(actor, attribute) {
	return isSw5eStarshipActor(actor) && isStarshipTokenResourceAttribute(attribute);
}

/**
 * libWrapper MIXED body for Actor5e#modifyTokenAttribute.
 * Virtual Starship resources: handle and skip stock (stock would crash / mis-route to applyDamage).
 * All other attributes: delegate to wrapped (preserves attributes.hp shield-first damage).
 * @param {Function} wrapped
 * @param {string} attribute
 * @param {number} value
 * @param {boolean} isDelta
 * @param {boolean} isBar
 * @returns {Promise<Actor>}
 */
export async function wrapStarshipModifyTokenAttribute(wrapped, attribute, value, isDelta=false, isBar=true) {
	if ( shouldHandleStarshipVirtualTokenAttribute(this, attribute) ) {
		const updated = await applyStarshipVirtualTokenAttributeUpdate(this, attribute, value, isDelta);
		return updated ?? this;
	}
	return wrapped.call(this, attribute, value, isDelta, isBar);
}

/**
 * Resolve the attribute path Foundry/dnd5e uses for a bar lookup.
 * Prefers `options.alternative` (Token Config live preview) over bar1/bar2 storage.
 * @param {TokenDocument} tokenDoc
 * @param {string} barName
 * @param {{alternative?: string}} [options]
 * @returns {string|null|undefined}
 */
export function resolveRequestedBarAttribute(tokenDoc, barName, options={}) {
	if ( options?.alternative !== undefined && options?.alternative !== null && options.alternative !== "" ) {
		return options.alternative;
	}
	return tokenDoc?.[barName]?.attribute;
}

/**
 * After stock/dnd5e resolution, optionally replace with a Starship virtual bar.
 * Does not call stock itself — for WRAPPER chaining the caller must invoke wrapped first.
 * @param {object|null} stockResult
 * @param {Actor|null|undefined} actor
 * @param {string|null|undefined} attribute
 * @returns {object|null}
 */
export function applyStarshipGetBarAttributeAfterStock(stockResult, actor, attribute) {
	if ( !isSw5eStarshipActor(actor) ) return stockResult;
	const resolved = resolveStarshipVirtualBarAttribute(actor, attribute);
	if ( resolved !== undefined ) return resolved;
	return stockResult;
}

/**
 * libWrapper WRAPPER body for TokenDocument5e#getBarAttribute.
 * Always chains `wrapped` exactly once, then replaces only for Starship virtual IDs.
 * @param {Function} wrapped
 * @param {string} barName
 * @param {{alternative?: string}} [options]
 * @returns {object|null}
 */
export function wrapStarshipGetBarAttribute(wrapped, barName, options={}) {
	const stockResult = wrapped.call(this, barName, options);
	const attribute = resolveRequestedBarAttribute(this, barName, options);
	return applyStarshipGetBarAttributeAfterStock(stockResult, this?.actor, attribute);
}

async function wrapPrepareResourcesTab(wrapped, ...args) {
	const context = await wrapped.apply(this, args);
	const actor = getTokenConfigActor(this);
	if ( context?.barAttributes ) {
		appendStarshipTokenResourceChoices(context.barAttributes, actor);
	}
	return context;
}

function registerWrapper(target, callback, mode="WRAPPER") {
	try {
		libWrapper.register(getModuleId(), target, callback, mode);
		return true;
	} catch ( err ) {
		console.warn(`SW5E MODULE | Could not wrap ${target} for Starship token resources.`, err);
		return false;
	}
}

/**
 * Register Starship virtual Token Resource wrappers (init).
 * getBarAttribute: WRAPPER (always chains).
 * modifyTokenAttribute: MIXED (virtual IDs handled without stock call).
 */
export function registerStarshipTokenResourceHooks() {
	registerWrapper(STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.tokenConfig, wrapPrepareResourcesTab, "WRAPPER");
	registerWrapper(STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.prototypeTokenConfig, wrapPrepareResourcesTab, "WRAPPER");
	registerWrapper(STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.getBarAttribute, wrapStarshipGetBarAttribute, "WRAPPER");
	registerWrapper(
		STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.modifyTokenAttribute,
		wrapStarshipModifyTokenAttribute,
		"MIXED"
	);
}
