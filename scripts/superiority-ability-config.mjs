import { getModulePath, localizeOrFallback } from "./module-support.mjs";
import { getPowercastingAbilityOptionIds } from "./powercasting-overrides.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SUPERIORITY_TYPES = ["mental", "physical", "general"];
const SUPERIORITY_TYPE_LABEL_KEYS = {
	mental: "SW5E.Superiority.Type.Mental.Label",
	physical: "SW5E.Superiority.Type.Physical.Label",
	general: "SW5E.Superiority.Type.General.Label"
};
const SUPERIORITY_TYPE_LABEL_FALLBACKS = {
	mental: "Mental",
	physical: "Physical",
	general: "General"
};

function labelAbility(id) {
	if ( !id ) return localizeOrFallback("SW5E.Superiority.Config.Ability.UseDefault", "Use Default");
	const cfg = CONFIG.DND5E.abilities[id];
	return cfg?.label ? game.i18n.localize(cfg.label) : id.toUpperCase();
}

function buildAbilityOptions(selected, defaults = []) {
	const options = [{
		value: "",
		label: localizeOrFallback("SW5E.Superiority.Config.Ability.UseDefault", "Use Default"),
		selected: !selected
	}];
	for ( const id of getPowercastingAbilityOptionIds() ) {
		if ( defaults.length && !defaults.includes(id) ) continue;
		options.push({ value: id, label: labelAbility(id), selected: selected === id });
	}
	return options;
}

export class SuperiorityAbilityConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor({ actor } = {}) {
		super();
		this.actor = actor;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["config-sheet", "power-casting-ability-config", "superiority-ability-config"],
		window: { resizable: true },
		position: { width: 480, height: "auto" }
	};

	static PARTS = {
		config: {
			template: getModulePath("templates/apps/superiority-ability-config.hbs")
		}
	};

	get title() {
		return localizeOrFallback("SW5E.Superiority.Config.Ability.Title", "Configure Superiority");
	}

	async _prepareContext() {
		const actor = this.actor;
		const sourceTypes = foundry.utils.deepClone(actor?._source?.system?.superiority?.types ?? {});

		return {
			titleLabel: localizeOrFallback("SW5E.Superiority.Label", "Superiority"),
			typeRows: SUPERIORITY_TYPES.map(type => ({
				type,
				typeLabel: localizeOrFallback(SUPERIORITY_TYPE_LABEL_KEYS[type], SUPERIORITY_TYPE_LABEL_FALLBACKS[type] ?? type),
				abilityOptions: buildAbilityOptions(
					sourceTypes?.[type]?.attr ?? "",
					CONFIG.DND5E.superiority.types?.[type]?.attr ?? []
				)
			})),
			abilityColumnLabel: localizeOrFallback("SW5E.Superiority.Config.Ability.AbilityColumn", "Maneuver Ability"),
			resetLabel: localizeOrFallback("SW5E.Superiority.Config.Ability.Reset", "Reset to Defaults"),
			saveLabel: localizeOrFallback("SW5E.Superiority.Config.Ability.Save", "Save Changes")
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		const form = root?.querySelector("form.sw5e-superiority-ability-config-form");
		if ( !form || form.dataset.sw5eBound === "true" ) return;
		form.dataset.sw5eBound = "true";
		form.addEventListener("submit", this.#onSubmit.bind(this));
	}

	async #onSubmit(event) {
		event.preventDefault();
		if ( !this.actor ) return;

		const formData = new FormData(event.currentTarget);
		const submitAction = event.submitter?.dataset?.action ?? "save";
		const updateData = {};

		for ( const type of SUPERIORITY_TYPES ) {
			const attrPath = `system.superiority.types.${type}.attr`;
			const dcPath = `system.superiority.types.${type}.dc`;
			if ( submitAction === "reset" ) {
				updateData[attrPath] = null;
				updateData[dcPath] = null;
				continue;
			}

			const attr = String(formData.get(attrPath) ?? "").trim();
			updateData[attrPath] = attr || null;
		}

		await this.actor.update(updateData);
		if ( submitAction === "reset" ) this.render(true);
		else await this.close();
	}
}

export function openSuperiorityAbilityConfig(actor) {
	if ( !actor ) return;
	new SuperiorityAbilityConfigApp({ actor }).render(true);
}
