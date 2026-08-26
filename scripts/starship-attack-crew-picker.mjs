/**
 * Lightweight pre-roll picker for Starship weapon attack firing crew (Bug 29 attack PB).
 * Dialog-safe candidate DTOs only — no live Actor documents in Application context.
 */
import { getModulePath } from "./module-support.mjs";

const Dialog5e = dnd5e.applications.api.Dialog5e;

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function formatResponsibleCrewOptionLabel(candidate={}) {
	const name = String(candidate.actorName ?? "").trim() || candidate.actorUuid || "";
	const role = String(candidate.deploymentLabel ?? "").trim();
	return role ? `${name} (${role})` : name;
}

export class StarshipAttackCrewPickerApp extends Dialog5e {
	constructor({
		actor=null,
		responsibleCrewCandidates=[],
		preselectedResponsibleCrewUuid=""
	}={}) {
		super({
			window: {
				subtitle: actor?.name ?? ""
			}
		});
		this.actor = actor;
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
		this.#result = new Promise(resolve => {
			this.#resolveResult = resolve;
		});
	}

	static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
		classes: ["roll-configuration", "sw5e-starship-attack-crew-picker"],
		window: {
			icon: "fa-solid fa-crosshairs"
		},
		form: {
			handler: StarshipAttackCrewPickerApp.#handleFormSubmission
		},
		position: {
			width: 420,
			height: "auto"
		}
	}, { inplace: false });

	static PARTS = {
		content: {
			template: getModulePath("templates/starship-attack-crew-picker.hbs")
		},
		buttons: {
			template: "systems/dnd5e/templates/dice/roll-buttons.hbs"
		}
	};

	#resolveResult;
	#result;
	#resolved = false;

	get title() {
		return localizeOrFallback("SW5E.Starship.Attack.FiringCrewTitle", "Firing Crew Member");
	}

	get result() {
		return this.#result;
	}

	async _preparePartContext(partId, context, options) {
		context = await super._preparePartContext(partId, context, options);
		if ( partId === "content" ) {
			context.responsibleCrewLabel = localizeOrFallback(
				"SW5E.Starship.Attack.FiringCrew",
				"Firing Crew Member"
			);
			context.placeholderLabel = localizeOrFallback(
				"SW5E.Starship.Roll.SelectCrewMember",
				"Select a crew member"
			);
			context.selectedResponsibleCrewUuid = this.selectedResponsibleCrewUuid || "";
			context.candidates = this.responsibleCrewCandidates.map(candidate => ({
				...candidate,
				label: formatResponsibleCrewOptionLabel(candidate),
				selected: candidate.actorUuid === this.selectedResponsibleCrewUuid
			}));
			return context;
		}
		if ( partId === "buttons" ) {
			context.buttons = {
				normal: {
					default: true,
					label: localizeOrFallback("DND5E.Roll", "Roll")
				}
			};
			return context;
		}
		return context;
	}

	async _onRender(context, options) {
		await super._onRender(context, options);
		const select = this.element?.querySelector?.('select[name="responsibleCrewUuid"]');
		if ( select ) {
			select.addEventListener("change", event => {
				this.selectedResponsibleCrewUuid = String(event.currentTarget?.value ?? "").trim();
			});
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
		const responsibleCrewUuid = String(
			formData.get("responsibleCrewUuid")
			?? formData.object?.responsibleCrewUuid
			?? this.selectedResponsibleCrewUuid
			?? ""
		).trim();

		const permitted = this.responsibleCrewCandidates.some(
			candidate => candidate.actorUuid === responsibleCrewUuid
		);
		if ( !responsibleCrewUuid || !permitted ) {
			const warnTitle = game.i18n.localize("SW5E.Starship.Attack.NoCrewPBTitle");
			const warnBody = game.i18n.localize("SW5E.Starship.Roll.NoCrewPBNotSelected");
			ui.notifications.warn(`${warnTitle}: ${warnBody}`);
			return;
		}

		this.#finish({ responsibleCrewUuid });
		await this.close({ submitted: true });
	}
}

/**
 * @param {object} config
 * @returns {Promise<{ responsibleCrewUuid: string }|null>}
 */
export async function promptStarshipAttackCrewPicker(config={}) {
	const app = new StarshipAttackCrewPickerApp(config);
	app.render(true);
	return app.result;
}
