import { getModulePath, localizeOrFallback } from "./module-support.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function getNumericValue(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function parseNumberInput(value, fallback = 0) {
	const text = String(value ?? "").trim();
	if ( !text ) return fallback;
	return getNumericValue(text) ?? fallback;
}

function parseNullableNumberInput(value) {
	const text = String(value ?? "").trim();
	if ( !text ) return null;
	return getNumericValue(text);
}

function getSuperiorityRuntime(actor) {
	return actor?._sw5eSuperiorityRuntime ?? {};
}

function formatDicePool(value, max, die) {
	const suffix = die > 0 ? `${max}d${die}` : `${max}`;
	return `${value} / ${suffix}`;
}

export class SuperiorityPointConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor({ actor } = {}) {
		super();
		this.actor = actor;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["config-sheet", "power-point-config", "superiority-point-config"],
		window: { resizable: true },
		position: { width: 420, height: "auto" }
	};

	static PARTS = {
		config: {
			template: getModulePath("templates/apps/superiority-point-config.hbs")
		}
	};

	get title() {
		return localizeOrFallback("SW5E.Superiority.Config.Points.Title", "Superiority Dice Configuration");
	}

	async _prepareContext() {
		const source = foundry.utils.deepClone(this.actor?._source?.system?.superiority ?? {});
		const superiority = this.actor?.system?.superiority ?? {};
		const runtime = getSuperiorityRuntime(this.actor);
		const sourceDice = source.dice ??= {};
		const sourceBonuses = sourceDice.bonuses ??= {};

		sourceDice.value = parseNumberInput(sourceDice.value, getNumericValue(superiority.dice?.value) ?? 0);
		sourceDice.max = sourceDice.max ?? null;
		sourceDice.bonuses.level ??= "";
		sourceDice.bonuses.overall ??= "";
		source.die = source.die ?? null;

		const calculatedMax = Math.max(0, getNumericValue(runtime.calculatedMax) ?? getNumericValue(superiority.dice?.max) ?? 0);
		const effectiveMax = Math.max(0, getNumericValue(superiority.dice?.max) ?? calculatedMax);
		const calculatedDie = Math.max(0, getNumericValue(runtime.calculatedDie) ?? getNumericValue(superiority.die) ?? 0);
		const effectiveDie = Math.max(0, getNumericValue(superiority.die) ?? calculatedDie);
		const currentValue = Math.max(0, getNumericValue(superiority.dice?.value) ?? sourceDice.value ?? 0);
		const hasMaxOverride = sourceDice.max !== null && sourceDice.max !== undefined && sourceDice.max !== "";
		const hasDieOverride = source.die !== null && source.die !== undefined && source.die !== "";

		return {
			value: currentValue,
			effectiveMax,
			effectiveDie,
			poolLabel: formatDicePool(currentValue, effectiveMax, effectiveDie),
			source,
			hasMaxOverride,
			hasDieOverride,
			calculatedMax,
			calculatedDie,
			maximumLegend: localizeOrFallback("SW5E.Superiority.Config.Points.MaximumLegend", "Maximum Superiority Dice"),
			currentLegend: localizeOrFallback("SW5E.Superiority.Config.Points.CurrentLegend", "Current Superiority Dice"),
			currentLabel: localizeOrFallback("SW5E.Superiority.Dice.Value", "Current Superiority Dice"),
			maxOverrideLabel: localizeOrFallback("SW5E.Superiority.Dice.MaxOverride", "Maximum Superiority Dice Override"),
			maxOverrideHint: localizeOrFallback("SW5E.Superiority.Config.Points.MaxOverrideHint", "Leave blank to use the calculated superiority dice maximum."),
			dieOverrideLabel: localizeOrFallback("SW5E.Superiority.Die.Override", "Superiority Die Override"),
			dieOverrideHint: localizeOrFallback("SW5E.Superiority.Config.Points.DieOverrideHint", "Leave blank to use the calculated superiority die size."),
			perLevelBonusLabel: localizeOrFallback("SW5E.Superiority.Config.Points.PerLevelBonus", "Per Level Bonus"),
			overallBonusLabel: localizeOrFallback("SW5E.Superiority.Config.Points.OverallBonus", "Overall Bonus"),
			saveLabel: localizeOrFallback("SW5E.Superiority.Config.Points.Save", "Save")
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		const form = root?.querySelector("form.sw5e-superiority-point-config-form");
		if ( !form || form.dataset.sw5eBound === "true" ) return;
		form.dataset.sw5eBound = "true";
		form.addEventListener("submit", this.#onSubmit.bind(this));
	}

	async #onSubmit(event) {
		event.preventDefault();
		if ( !this.actor ) return;

		const formData = new FormData(event.currentTarget);
		const runtime = getSuperiorityRuntime(this.actor);
		const calculatedMax = Math.max(0, getNumericValue(runtime.calculatedMax) ?? 0);
		const updateData = {
			"system.superiority.dice.value": parseNumberInput(formData.get("system.superiority.dice.value")),
			"system.superiority.dice.max": parseNullableNumberInput(formData.get("system.superiority.dice.max")),
			"system.superiority.dice.bonuses.level": String(formData.get("system.superiority.dice.bonuses.level") ?? "").trim(),
			"system.superiority.dice.bonuses.overall": String(formData.get("system.superiority.dice.bonuses.overall") ?? "").trim(),
			"system.superiority.die": parseNullableNumberInput(formData.get("system.superiority.die"))
		};

		const nextMax = updateData["system.superiority.dice.max"] === null
			? calculatedMax
			: Math.max(0, getNumericValue(updateData["system.superiority.dice.max"]) ?? 0);
		const submittedCurrent = getNumericValue(updateData["system.superiority.dice.value"]) ?? 0;
		updateData["system.superiority.dice.value"] = Math.max(0, Math.min(submittedCurrent, nextMax));

		await this.actor.update(updateData);
		this.render(true);
	}
}

export function openSuperiorityPointConfig(actor) {
	if ( !actor ) return;
	new SuperiorityPointConfigApp({ actor }).render(true);
}
