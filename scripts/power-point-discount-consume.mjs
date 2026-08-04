/**
 * Idempotent SW5e Force/Tech point discount attribute consumption + dialog labels.
 */
import {
	POWER_POINT_DISCOUNT_APPLIED,
	classifyPowercastingType,
	isRecognizedPowerPointTarget,
	resolvePowerPointCost,
	resolveSelectedCastLevelFromUsage
} from "./power-point-cost.mjs";

/** @type {Function|null} */
let stockAttributeConsume = null;
/** @type {Function|null} */
let stockAttributeConsumptionLabels = null;
/** @type {boolean} */
let powerPointDiscountConsumeWrapped = false;
/** @type {boolean} */
let powerPointDiscountLabelsWrapped = false;

/**
 * Pending-aware current value for an actor resource path during consumption aggregation.
 * @param {object} actor
 * @param {object} updates
 * @param {string} keyPath
 * @returns {number}
 */
export function getPendingOrCurrentAttributeValue(actor, updates, keyPath) {
	const pending = updates?.actor?.[keyPath];
	if ( pending !== undefined && pending !== null && Number.isFinite(Number(pending)) ) return Number(pending);
	const current = globalThis.foundry?.utils?.getProperty?.(actor, keyPath)
		?? keyPath.split(".").reduce((o, k) => o?.[k], actor);
	return Number.isFinite(Number(current)) ? Number(current) : 0;
}

/**
 * Pure display contract for Consumption section hint/warn using finalCost.
 * @param {object} options
 * @param {object|null|undefined} options.actor
 * @param {object|null|undefined} options.item
 * @param {object|null|undefined} options.activity
 * @param {string} options.target Attribute target path without `system.`
 * @param {object|null|undefined} [options.config] Activity usage config
 * @returns {{
 *   applies: boolean,
 *   finalCost: number,
 *   rawCost: number,
 *   current: number,
 *   warn: boolean,
 *   cost: string
 * }}
 */
export function resolvePowerPointConsumptionDisplay({
	actor=null,
	item=null,
	activity=null,
	target,
	config=null
}={}) {
	if ( !isRecognizedPowerPointTarget(target) ) {
		return { applies: false, finalCost: 0, rawCost: 0, current: 0, warn: false, cost: "0" };
	}
	const expectedType = target === "powercasting.tech.points.value" ? "tech" : "force";
	const classified = classifyPowercastingType(item, activity);
	if ( classified !== expectedType ) {
		return { applies: false, finalCost: 0, rawCost: 0, current: 0, warn: false, cost: "0" };
	}

	const castLevel = resolveSelectedCastLevelFromUsage(item, config);
	const resolved = resolvePowerPointCost({ actor, item, activity, castLevel });
	const currentRaw = globalThis.foundry?.utils?.getProperty?.(actor?.system, target)
		?? target.split(".").reduce((o, k) => o?.[k], actor?.system);
	const current = Number.isFinite(Number(currentRaw)) ? Number(currentRaw) : 0;
	const finalCost = resolved.finalCost;
	return {
		applies: true,
		finalCost,
		rawCost: resolved.rawCost,
		current,
		warn: finalCost > current,
		cost: String(finalCost)
	};
}

/**
 * @returns {boolean}
 */
export function isPowerPointDiscountAttributeConsumeInstalled() {
	const attributeType = globalThis.CONFIG?.DND5E?.activityConsumptionTypes?.attribute;
	return Boolean(
		(powerPointDiscountConsumeWrapped || attributeType?.consume?.__sw5ePowerPointDiscountWrapper)
		&& (powerPointDiscountLabelsWrapped || attributeType?.consumptionLabels?.__sw5ePowerPointDiscountLabelsWrapper)
	);
}

/**
 * @param {object} attributeType
 * @returns {boolean}
 */
function installConsumeWrapper(attributeType) {
	if ( powerPointDiscountConsumeWrapped ) return true;
	if ( !attributeType?.consume ) return false;
	if ( attributeType.consume.__sw5ePowerPointDiscountWrapper ) {
		powerPointDiscountConsumeWrapped = true;
		return true;
	}

	stockAttributeConsume = attributeType.consume;

	async function sw5ePowerPointDiscountAttributeConsume(config, updates) {
		const target = this?.target;
		if ( !isRecognizedPowerPointTarget(target) ) {
			return stockAttributeConsume.call(this, config, updates);
		}

		const expectedType = target === "powercasting.tech.points.value" ? "tech" : "force";
		const classified = classifyPowercastingType(this?.item, this?.activity);
		if ( classified !== expectedType ) {
			return stockAttributeConsume.call(this, config, updates);
		}

		if ( config?.[POWER_POINT_DISCOUNT_APPLIED] ) return;

		const castLevel = resolveSelectedCastLevelFromUsage(this.item, config);
		const resolved = resolvePowerPointCost({
			actor: this.actor,
			item: this.item,
			activity: this.activity,
			castLevel
		});
		const finalCost = resolved.finalCost;
		const keyPath = `system.${target}`;
		const current = getPendingOrCurrentAttributeValue(this.actor, updates, keyPath);

		const utils = globalThis.dnd5e?.utils ?? {};
		const formatNumber = utils.formatNumber ?? (value => String(value));
		const getHumanReadableAttributeLabel = utils.getHumanReadableAttributeLabel
			?? (() => target);
		const attribute = getHumanReadableAttributeLabel(target, { actor: this.actor }) ?? target;
		const ConsumptionError = globalThis.dnd5e?.dataModels?.activity?.ConsumptionError
			?? globalThis.Error;

		let warningMessage;
		if ( (finalCost > 0) && !current ) warningMessage = "DND5E.CONSUMPTION.Warning.None";
		else if ( current < finalCost ) warningMessage = "DND5E.CONSUMPTION.Warning.NotEnough";
		if ( warningMessage ) {
			const localize = globalThis.game?.i18n?.format?.bind(globalThis.game.i18n)
				?? ((key, data) => `${key}:${JSON.stringify(data)}`);
			throw new ConsumptionError(localize(warningMessage, {
				available: formatNumber(current),
				cost: formatNumber(finalCost),
				type: localize("DND5E.CONSUMPTION.Type.Attribute.Warning", { attribute })
			}));
		}

		updates.actor ??= {};
		updates.actor[keyPath] = current - finalCost;
		config[POWER_POINT_DISCOUNT_APPLIED] = true;
	}

	sw5ePowerPointDiscountAttributeConsume.__sw5ePowerPointDiscountWrapper = true;
	attributeType.consume = sw5ePowerPointDiscountAttributeConsume;
	powerPointDiscountConsumeWrapped = true;
	return true;
}

/**
 * Wrap ActivityUsageDialog Consumption hint/warn to use finalCost (ephemeral only).
 * Owner: CONFIG.DND5E.activityConsumptionTypes.attribute.consumptionLabels
 * ← ConsumptionTargetData.consumptionLabelsAttribute ← _resolveHintCost(raw).
 * @param {object} attributeType
 * @returns {boolean}
 */
function installConsumptionLabelsWrapper(attributeType) {
	if ( powerPointDiscountLabelsWrapped ) return true;
	if ( !attributeType?.consumptionLabels ) return false;
	if ( attributeType.consumptionLabels.__sw5ePowerPointDiscountLabelsWrapper ) {
		powerPointDiscountLabelsWrapped = true;
		return true;
	}

	stockAttributeConsumptionLabels = attributeType.consumptionLabels;

	function sw5ePowerPointDiscountConsumptionLabels(config, options) {
		const target = this?.target;
		const display = resolvePowerPointConsumptionDisplay({
			actor: this?.actor,
			item: this?.item,
			activity: this?.activity,
			target,
			config
		});
		if ( !display.applies ) {
			return stockAttributeConsumptionLabels.call(this, config, options);
		}

		const utils = globalThis.dnd5e?.utils ?? {};
		const formatNumber = utils.formatNumber ?? (value => String(value));
		const getHumanReadableAttributeLabel = utils.getHumanReadableAttributeLabel
			?? (() => target);
		const localize = globalThis.game?.i18n?.localize?.bind(globalThis.game.i18n) ?? (key => key);
		const format = globalThis.game?.i18n?.format?.bind(globalThis.game.i18n)
			?? ((key, data) => `${key}:${JSON.stringify(data)}`);

		const increaseKey = "Decrease";
		const attribute = getHumanReadableAttributeLabel(target, { actor: this.actor }) ?? target;
		return {
			label: localize(`DND5E.CONSUMPTION.Type.Attribute.Prompt${increaseKey}`),
			hint: format(
				`DND5E.CONSUMPTION.Type.Attribute.PromptHint${increaseKey}`,
				{
					cost: display.cost,
					attribute,
					current: formatNumber(display.current)
				}
			),
			warn: display.warn
		};
	}

	sw5ePowerPointDiscountConsumptionLabels.__sw5ePowerPointDiscountLabelsWrapper = true;
	attributeType.consumptionLabels = sw5ePowerPointDiscountConsumptionLabels;
	powerPointDiscountLabelsWrapped = true;
	return true;
}

/**
 * Capture stock attribute consume/labels once and install idempotent SW5e wrappers.
 * @returns {boolean} Whether both wrappers are installed after this call.
 */
export function installPowerPointDiscountAttributeConsume() {
	const attributeType = globalThis.CONFIG?.DND5E?.activityConsumptionTypes?.attribute;
	if ( !attributeType ) return false;
	const consumeOk = installConsumeWrapper(attributeType);
	const labelsOk = installConsumptionLabelsWrapper(attributeType);
	return Boolean(consumeOk && labelsOk);
}

/**
 * Test helper: reset install state (does not restore CONFIG).
 */
export function resetPowerPointDiscountAttributeConsumeForTests() {
	stockAttributeConsume = null;
	stockAttributeConsumptionLabels = null;
	powerPointDiscountConsumeWrapped = false;
	powerPointDiscountLabelsWrapped = false;
}

/**
 * @returns {Function|null}
 */
export function getStockAttributeConsumeForTests() {
	return stockAttributeConsume;
}

/**
 * @returns {Function|null}
 */
export function getStockAttributeConsumptionLabelsForTests() {
	return stockAttributeConsumptionLabels;
}
