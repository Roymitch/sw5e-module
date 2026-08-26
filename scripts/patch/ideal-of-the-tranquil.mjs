import { getModuleId } from "../module-support.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

const IDEAL_UID_FRAGMENT = "ideal_of_the_tranquil";
const IDEAL_IDENTIFIER = "ideal-of-the-tranquil";
const IDEAL_NAME = "Ideal of the Tranquil";

/**
 * @param {import("@league/foundry").documents.Item} item
 */
function isIdealOfTheTranquilItem(item) {
	if ( !item || item.type !== "feat" ) return false;
	const uid = item.flags?.["sw5e-importer"]?.uid;
	if ( typeof uid === "string" && uid.includes(IDEAL_UID_FRAGMENT) ) return true;
	if ( item.system?.identifier === IDEAL_IDENTIFIER ) return true;
	return item.name === IDEAL_NAME;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 */
function findIdealOfTheTranquil(actor) {
	return actor?.items?.find?.(isIdealOfTheTranquilItem) ?? null;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {string} key
 */
function abilityMod(actor, key) {
	const m = actor?.system?.abilities?.[key]?.mod;
	return Number.isFinite(Number(m)) ? Number(m) : 0;
}

/**
 * Half ability modifier, minimum of one (Ideal of the Tranquil).
 * @param {number} mod
 */
function halfModTempPoints(mod) {
	return Math.max(1, Math.floor(Number(mod) / 2));
}

function localizeOr(key, fallback) {
	const s = game.i18n.localize(key);
	return s && s !== key ? s : fallback;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 */
function canApplyIdealTemp(actor) {
	if ( !actor || actor.type !== "character" ) return false;
	if ( !findIdealOfTheTranquil(actor) ) return false;
	if ( !actor.isOwner && !game.user.isGM ) return false;
	return true;
}

/**
 * After a short or long rest: previous temporary force points are lost, then the
 * character gains new temporary force points equal to half WIS or CHA (choice, min 1).
 * Cancel clears temp (lost on rest) without granting new points.
 * @param {import("@league/foundry").documents.Actor} actor
 */
async function runIdealOfTheTranquilRestFlow(actor) {
	try {
		if ( !canApplyIdealTemp(actor) ) return;

		const wisMod = abilityMod(actor, "wis");
		const chaMod = abilityMod(actor, "cha");
		const wisTotal = halfModTempPoints(wisMod);
		const chaTotal = halfModTempPoints(chaMod);
		const wisLabel = CONFIG.DND5E?.abilities?.wis?.label ?? "Wisdom";
		const chaLabel = CONFIG.DND5E?.abilities?.cha?.label ?? "Charisma";
		const previousTemp = Math.max(0, Number(actor.system?.powercasting?.force?.points?.temp) || 0);

		const content = `
<div class="standard-form sw5e-ideal-of-the-tranquil-dialog flexcol gap-sm">
	<p>${foundry.utils.escapeHTML(localizeOr(
		"SW5E.IdealOfTheTranquil.DialogIntro",
		"Choose Wisdom or Charisma for Ideal of the Tranquil. Each line shows how many temporary force points that choice grants (minimum 1)."
	))}</p>
	<ul class="plain">
		<li>${game.i18n.format("SW5E.IdealOfTheTranquil.DialogPreviousTemp", { value: previousTemp })}</li>
		<li>${game.i18n.format("SW5E.IdealOfTheTranquil.DialogWisdomLine", {
			ability: wisLabel,
			mod: wisMod,
			total: wisTotal
		})}</li>
		<li>${game.i18n.format("SW5E.IdealOfTheTranquil.DialogCharismaLine", {
			ability: chaLabel,
			mod: chaMod,
			total: chaTotal
		})}</li>
	</ul>
</div>`;

		const choice = await DialogV2.wait({
			rejectClose: false,
			modal: true,
			window: { title: localizeOr("SW5E.IdealOfTheTranquil.Title", "Ideal of the Tranquil") },
			position: { width: 420 },
			content,
			buttons: [
				{
					action: "wis",
					label: game.i18n.format("SW5E.IdealOfTheTranquil.ButtonWisdom", { total: wisTotal }),
					icon: "fas fa-eye",
					default: true
				},
				{
					action: "cha",
					label: game.i18n.format("SW5E.IdealOfTheTranquil.ButtonCharisma", { total: chaTotal }),
					icon: "fas fa-moon"
				},
				{
					action: "cancel",
					label: game.i18n.localize("Cancel"),
					icon: "fas fa-times"
				}
			]
		});

		if ( !canApplyIdealTemp(actor) ) return;

		if ( choice !== "wis" && choice !== "cha" ) {
			await actor.update({ "system.powercasting.force.points.temp": 0 });
			return;
		}

		const amount = choice === "wis" ? wisTotal : chaTotal;
		const abilityLabel = choice === "wis" ? wisLabel : chaLabel;
		await actor.update({ "system.powercasting.force.points.temp": amount });

		ui.notifications.info(game.i18n.format("SW5E.IdealOfTheTranquil.Success", {
			ability: abilityLabel,
			amount
		}));
	} catch ( err ) {
		console.error(`${getModuleId()} | Ideal of the Tranquil`, err);
		ui.notifications.error(localizeOr(
			"SW5E.IdealOfTheTranquil.ErrorUnexpected",
			"Ideal of the Tranquil could not be completed. If this keeps happening, check the console (F12) for details."
		));
	}
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 */
function onRest(actor) {
	if ( !canApplyIdealTemp(actor) ) return;
	void runIdealOfTheTranquilRestFlow(actor);
}

export function patchIdealOfTheTranquil() {
	Hooks.on("dnd5e.shortRest", actor => onRest(actor));
	Hooks.on("dnd5e.longRest", actor => onRest(actor));
}
