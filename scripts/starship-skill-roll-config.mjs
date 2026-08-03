import { getExpandedProficiencyMultiplier } from "./patch/proficiency.mjs";

const Dialog5e = dnd5e.applications.api.Dialog5e;

const D20_ICON = "systems/dnd5e/icons/svg/dice/d20.svg";

function getRollModeChoices() {
	return Object.entries(CONFIG.Dice.rollModes).map(([value, entry]) => ({
		value,
		label: game.i18n.localize(entry.label)
	}));
}

function getAbilityLabel(key) {
	return CONFIG?.DND5E?.abilities?.[key]?.label
		?? CONFIG?.SW5E?.abilities?.[key]?.label
		?? String(key ?? "").toUpperCase();
}

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function buildFormulaLabel(entry = {}) {
	const terms = [entry?.parts?.abilityMod, entry?.parts?.proficiency, entry?.parts?.bonus]
		.map(value => Number(value))
		.filter(value => Number.isFinite(value) && value !== 0);

	let label = "1d20";
	for ( const value of terms ) {
		label += value < 0 ? ` - ${Math.abs(value)}` : ` + ${value}`;
	}
	return label;
}

function buildSkillPromptTitle(entry = {}) {
	const skill = entry?.label ?? localizeOrFallback("SW5E.Skill", "Skill");
	const ability = getAbilityLabel(entry?.ability);
	const formatted = game.i18n.format("DND5E.SkillPromptTitle", { ability, skill });
	if ( formatted && formatted !== "DND5E.SkillPromptTitle" ) return formatted;
	return `${ability} (${skill}) Check`;
}

function formatResponsibleCrewOptionLabel(candidate={}) {
	const name = String(candidate.actorName ?? "").trim() || candidate.actorUuid || "";
	const role = String(candidate.deploymentLabel ?? "").trim();
	return role ? `${name} (${role})` : name;
}

function computePreviewProficiencyPoints(proficiencyMode, crewPb) {
	const pb = Number(crewPb);
	if ( !Number.isFinite(pb) ) return 0;
	return Math.round(pb * getExpandedProficiencyMultiplier(proficiencyMode));
}

export class StarshipSkillRollConfigApp extends Dialog5e {
	constructor({
		actor,
		entry,
		abilities,
		defaultRollMode,
		initialMode,
		forcedAdvantage,
		systemDamageNote,
		crewPbAttributionLabel,
		canShowCrewPbAttribution=false,
		showResponsibleCrewPicker=false,
		responsibleCrewCandidates=[],
		preselectedResponsibleCrewUuid=""
	}={}) {
		super({
			window: {
				subtitle: actor?.name ?? ""
			}
		});
		this.actor = actor;
		this.entry = entry ? foundry.utils.deepClone(entry) : {};
		this.abilities = abilities ?? {};
		this.defaultRollMode = defaultRollMode ?? game.settings.get("core", "rollMode");
		this.forcedAdvantage = Boolean(forcedAdvantage);
		this.systemDamageNote = systemDamageNote ?? "";
		this.canShowCrewPbAttribution = Boolean(canShowCrewPbAttribution);
		this.crewPbAttributionLabel = this.canShowCrewPbAttribution && typeof crewPbAttributionLabel === "string"
			? crewPbAttributionLabel.trim()
			: "";
		this.showResponsibleCrewPicker = Boolean(showResponsibleCrewPicker);
		this.responsibleCrewCandidates = Array.isArray(responsibleCrewCandidates)
			? responsibleCrewCandidates.map(candidate => ({
				actorUuid: String(candidate?.actorUuid ?? ""),
				actorName: String(candidate?.actorName ?? ""),
				image: String(candidate?.image ?? ""),
				membershipRole: String(candidate?.membershipRole ?? ""),
				deploymentLabel: String(candidate?.deploymentLabel ?? ""),
				proficiencyBonus: Number.isFinite(Number(candidate?.proficiencyBonus))
					? Number(candidate.proficiencyBonus)
					: 0
			})).filter(candidate => candidate.actorUuid)
			: [];
		const preselect = String(preselectedResponsibleCrewUuid ?? "").trim();
		this.selectedResponsibleCrewUuid = this.responsibleCrewCandidates.some(c => c.actorUuid === preselect)
			? preselect
			: "";
		this.baseAbilityMod = Number(this.entry?.parts?.abilityMod) || 0;
		this.baseBonus = Number(this.entry?.parts?.bonus) || 0;
		this.proficiencyMode = this.entry?.proficiencyMode;
		const advantage = CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ?? 1;
		this.initialMode = this.forcedAdvantage ? advantage : (initialMode ?? (CONFIG?.Dice?.D20Roll?.ADV_MODE?.NORMAL ?? 0));
		this.#result = new Promise(resolve => {
			this.#resolveResult = resolve;
		});
	}

	static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
		classes: ["roll-configuration", "sw5e-starship-skill-roll-config"],
		window: {
			icon: "fa-solid fa-dice"
		},
		form: {
			handler: StarshipSkillRollConfigApp.#handleFormSubmission
		},
		position: {
			width: 400,
			height: "auto"
		}
	}, { inplace: false });

	static PARTS = {
		formulas: {
			template: "systems/dnd5e/templates/dice/roll-formulas.hbs"
		},
		configuration: {
			template: "systems/dnd5e/templates/dice/roll-configuration.hbs"
		},
		buttons: {
			template: "systems/dnd5e/templates/dice/roll-buttons.hbs"
		}
	};

	#resolveResult;
	#result;
	#resolved = false;

	get title() {
		return buildSkillPromptTitle(this.entry);
	}

	get result() {
		return this.#result;
	}

	async _prepareContext(options={}) {
		return super._prepareContext(options);
	}

	async _preparePartContext(partId, context, options) {
		context = await super._preparePartContext(partId, context, options);
		switch ( partId ) {
			case "formulas":
				return this.#prepareFormulasContext(context);
			case "configuration":
				return this.#prepareConfigurationContext(context);
			case "buttons":
				return this.#prepareButtonsContext(context);
			default:
				return context;
		}
	}

	#prepareFormulasContext(context) {
		context.dice = [{ icon: D20_ICON, label: "d20" }];
		context.rolls = [{
			roll: {
				formula: buildFormulaLabel(this.entry),
				data: { situational: "" }
			}
		}];
		return context;
	}

	#prepareConfigurationContext(context) {
		const abilityOptions = Object.keys(this.abilities).map(key => ({
			value: key,
			label: getAbilityLabel(key)
		}));
		if ( !abilityOptions.length ) {
			abilityOptions.push({
				value: this.entry?.ability ?? "int",
				label: getAbilityLabel(this.entry?.ability ?? "int")
			});
		}

		context.fields = [
			{
				field: new foundry.data.fields.StringField({
					required: true,
					blank: false,
					label: game.i18n.localize("DND5E.Abilities")
				}),
				name: "ability",
				options: abilityOptions,
				value: this.entry?.ability ?? abilityOptions[0]?.value ?? "int"
			},
			{
				field: new foundry.data.fields.StringField({
					required: true,
					blank: false,
					label: game.i18n.localize("DND5E.RollMode")
				}),
				name: "rollMode",
				options: getRollModeChoices(),
				value: this.defaultRollMode
			}
		];

		if ( this.showResponsibleCrewPicker ) {
			const placeholder = localizeOrFallback(
				"SW5E.Starship.Roll.SelectCrewMember",
				"Select a crew member"
			);
			const options = [
				{ value: "", label: placeholder },
				...this.responsibleCrewCandidates.map(candidate => ({
					value: candidate.actorUuid,
					label: formatResponsibleCrewOptionLabel(candidate)
				}))
			];
			context.fields.unshift({
				field: new foundry.data.fields.StringField({
					required: true,
					blank: true,
					label: localizeOrFallback(
						"SW5E.Starship.Roll.ResponsibleCrew",
						"Responsible Crew Member"
					)
				}),
				name: "responsibleCrewUuid",
				options,
				value: this.selectedResponsibleCrewUuid || ""
			});
		}
		return context;
	}

	#prepareButtonsContext(context) {
		const advantage = CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ?? 1;
		const normal = CONFIG?.Dice?.D20Roll?.ADV_MODE?.NORMAL ?? 0;
		const disadvantage = CONFIG?.Dice?.D20Roll?.ADV_MODE?.DISADVANTAGE ?? -1;

		let defaultButton = "normal";
		if ( this.initialMode === advantage ) defaultButton = "advantage";
		else if ( this.initialMode === disadvantage ) defaultButton = "disadvantage";

		if ( this.forcedAdvantage ) {
			context.buttons = {
				advantage: {
					default: true,
					label: localizeOrFallback("DND5E.Advantage", "Advantage")
				}
			};
			return context;
		}

		context.buttons = {
			advantage: {
				default: defaultButton === "advantage",
				label: localizeOrFallback("DND5E.Advantage", "Advantage")
			},
			normal: {
				default: defaultButton === "normal",
				label: localizeOrFallback("DND5E.Normal", "Normal")
			},
			disadvantage: {
				default: defaultButton === "disadvantage",
				label: localizeOrFallback("DND5E.Disadvantage", "Disadvantage")
			}
		};
		return context;
	}

	#applyResponsibleCrewPreview(actorUuid) {
		const uuid = String(actorUuid ?? "").trim();
		this.selectedResponsibleCrewUuid = uuid;
		const candidate = this.responsibleCrewCandidates.find(entry => entry.actorUuid === uuid) ?? null;
		const proficiency = candidate
			? computePreviewProficiencyPoints(this.proficiencyMode, candidate.proficiencyBonus)
			: 0;
		this.entry.parts ??= {};
		this.entry.parts.abilityMod = this.baseAbilityMod;
		this.entry.parts.bonus = this.baseBonus;
		this.entry.parts.proficiency = proficiency;
		this.entry.total = this.baseAbilityMod + proficiency + this.baseBonus;

		if ( candidate && this.canShowCrewPbAttribution ) {
			this.crewPbAttributionLabel = game.i18n.format("SW5E.Starship.Roll.CrewPBSourceExplicit", {
				name: candidate.actorName
			});
		} else {
			this.crewPbAttributionLabel = "";
		}

		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		if ( !root ) return;
		const formulaEl = root.querySelector(".rolls .roll .formula, [data-formula], .dice-formula");
		const formulaNodes = root.querySelectorAll(".formula");
		const label = buildFormulaLabel(this.entry);
		if ( formulaEl ) formulaEl.textContent = label;
		for ( const node of formulaNodes ) node.textContent = label;

		let note = root.querySelector(".sw5e-starship-skill-crew-pb-note");
		if ( this.crewPbAttributionLabel ) {
			if ( !note ) {
				const fieldset = root.querySelector("fieldset");
				const after = root.querySelector(".sw5e-starship-skill-system-note") ?? fieldset;
				if ( after ) {
					note = document.createElement("p");
					note.className = "notes sw5e-starship-skill-crew-pb-note";
					after.insertAdjacentElement("afterend", note);
				}
			}
			if ( note ) note.textContent = this.crewPbAttributionLabel;
		} else if ( note ) {
			note.remove();
		}
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		if ( !root ) return;

		if ( root.dataset.sw5eBound !== "true" ) {
			root.dataset.sw5eBound = "true";
		}

		const actorName = this.actor?.name ?? "";
		const title = root.querySelector(".window-title");
		let subtitle = root.querySelector(".window-subtitle");
		if ( actorName && title ) {
			if ( !subtitle ) {
				subtitle = document.createElement("h2");
				subtitle.className = "window-subtitle";
				title.insertAdjacentElement("afterend", subtitle);
			}
			subtitle.textContent = actorName;
		}

		if ( this.systemDamageNote ) {
			const fieldset = root.querySelector("fieldset");
			if ( fieldset && !fieldset.nextElementSibling?.classList?.contains("sw5e-starship-skill-system-note") ) {
				const note = document.createElement("p");
				note.className = "notes sw5e-starship-skill-system-note";
				note.textContent = this.systemDamageNote;
				fieldset.insertAdjacentElement("afterend", note);
			}
		}

		if ( this.crewPbAttributionLabel ) {
			const fieldset = root.querySelector("fieldset");
			const after = root.querySelector(".sw5e-starship-skill-system-note") ?? fieldset;
			if ( after && !root.querySelector(".sw5e-starship-skill-crew-pb-note") ) {
				const note = document.createElement("p");
				note.className = "notes sw5e-starship-skill-crew-pb-note";
				note.textContent = this.crewPbAttributionLabel;
				after.insertAdjacentElement("afterend", note);
			}
		}

		if ( this.showResponsibleCrewPicker && root.dataset.sw5eCrewPickerBound !== "true" ) {
			let select = root.querySelector('select[name="responsibleCrewUuid"]');
			// Fallback: if formField omitted the control, inject into the configuration fieldset.
			if ( !select ) {
				const fieldset = root.querySelector("fieldset");
				if ( fieldset ) {
					const wrap = document.createElement("div");
					wrap.className = "form-group sw5e-starship-responsible-crew";
					const label = document.createElement("label");
					label.textContent = localizeOrFallback(
						"SW5E.Starship.Roll.ResponsibleCrew",
						"Responsible Crew Member"
					);
					select = document.createElement("select");
					select.name = "responsibleCrewUuid";
					const placeholder = document.createElement("option");
					placeholder.value = "";
					placeholder.textContent = localizeOrFallback(
						"SW5E.Starship.Roll.SelectCrewMember",
						"Select a crew member"
					);
					select.append(placeholder);
					for ( const candidate of this.responsibleCrewCandidates ) {
						const option = document.createElement("option");
						option.value = candidate.actorUuid;
						option.textContent = formatResponsibleCrewOptionLabel(candidate);
						if ( candidate.actorUuid === this.selectedResponsibleCrewUuid ) option.selected = true;
						select.append(option);
					}
					wrap.append(label, select);
					fieldset.append(wrap);
				}
			}
			if ( select ) {
				select.addEventListener("change", event => {
					this.#applyResponsibleCrewPreview(event.currentTarget?.value);
				});
				root.dataset.sw5eCrewPickerBound = "true";
			}
		}
	}

	async close(options={}) {
		if ( !this.#resolved && !options?.submitted ) this.#finish(null);
		return super.close(options);
	}

	#finish(result) {
		if ( this.#resolved ) return;
		this.#resolved = true;
		this.#resolveResult?.(result);
	}

	static async #handleFormSubmission(event, form, formData) {
		const action = event.submitter?.dataset?.action ?? "normal";
		const advantage = CONFIG?.Dice?.D20Roll?.ADV_MODE ?? {};
		let advantageMode = advantage.NORMAL ?? 0;
		if ( action === "advantage" ) advantageMode = advantage.ADVANTAGE ?? 1;
		else if ( action === "disadvantage" ) advantageMode = advantage.DISADVANTAGE ?? -1;

		const situational = formData.get("roll.0.situational")
			?? formData.object?.roll?.[0]?.situational
			?? "";

		const responsibleCrewUuid = String(
			formData.get("responsibleCrewUuid")
			?? formData.object?.responsibleCrewUuid
			?? this.selectedResponsibleCrewUuid
			?? ""
		).trim();

		if ( this.showResponsibleCrewPicker ) {
			const permitted = this.responsibleCrewCandidates.some(candidate => candidate.actorUuid === responsibleCrewUuid);
			if ( !responsibleCrewUuid || !permitted ) {
				const warnTitle = game.i18n.localize("SW5E.Starship.Roll.NoCrewPBTitle");
				const warnBody = game.i18n.localize("SW5E.Starship.Roll.NoCrewPBNotSelected");
				ui.notifications.warn(`${warnTitle}: ${warnBody}`);
				return;
			}
		}

		this.#finish({
			ability: String(formData.get("ability") || this.entry?.ability || "int"),
			bonus: String(situational).trim(),
			rollMode: String(formData.get("rollMode") || this.defaultRollMode),
			advantageMode: Number.isFinite(Number(advantageMode)) ? Number(advantageMode) : this.initialMode,
			responsibleCrewUuid
		});
		await this.close({ submitted: true });
	}
}

export async function promptStarshipSkillRoll(config={}) {
	const app = new StarshipSkillRollConfigApp(config);
	app.render(true);
	return app.result;
}
