import {
	applyStarshipPrototypeTokenDimensions,
	createBlankLegacyStarshipActorData,
	getStarshipPrototypeTokenDimensions
} from "../starship-data.mjs";
import {
	buildSpaceStationAcPenaltyEffectData,
	getSpaceStationBaseStockModUuids,
	isActiveSpaceStationActor,
	isSpaceStationRoleSpecializationFeat,
	isSpaceStationSizeBelowLarge,
	isSw5eSpaceStationActor,
	resolveSpaceStationRoleSpecializationModUuids,
	SPACE_STATION_AC_EFFECT_FLAG,
	STARSHIP_VARIANT_SPACE_STATION
} from "../space-station.mjs";
import { SETTINGS_NAMESPACE } from "../module-support.mjs";

const STARSHIP_CREATE_VALUE = "__sw5e_starship__";
const SPACE_STATION_CREATE_VALUE = "__sw5e_space_station__";
const STARSHIP_CREATE_FLAG = "flags.sw5e.createStarship";
const SPACE_STATION_CREATE_FLAG = "flags.sw5e.createSpaceStation";
const DEBUG_PREFIX = "sw5e-module | starship-create";

/** @see dnd5e `templates/apps/document-create.hbs` — Vehicle option lives in `ol.unlist.card > li`. */
const VEHICLE_RADIO_SELECTOR = 'input[type="radio"][value="vehicle"]';
const TYPE_LIST_SELECTOR = "ol.unlist.card";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function hasRequiredActorTypeValues(values) {
	return values.has("vehicle");
}

function getActorCreateForm(root) {
	if ( root instanceof HTMLFormElement ) return root;
	if ( !(root instanceof HTMLElement) ) return null;

	const form = root.querySelector("form");
	if ( !(form instanceof HTMLFormElement) ) return null;
	if ( !form.querySelector('[name="name"]') ) return null;

	const typeSelect = form.querySelector('select[name="type"]');
	if ( typeSelect instanceof HTMLSelectElement ) {
		const optionValues = new Set(Array.from(typeSelect.options).map(option => option.value));
		if ( hasRequiredActorTypeValues(optionValues) ) return form;
		return null;
	}

	const vehicleRadio = form.querySelector(VEHICLE_RADIO_SELECTOR);
	if ( !(vehicleRadio instanceof HTMLInputElement) || !vehicleRadio.name ) return null;

	const typeRadios = form.querySelectorAll(`input[type="radio"][name="${CSS.escape(vehicleRadio.name)}"]`);
	if ( !typeRadios.length ) return null;

	const radioValues = new Set(Array.from(typeRadios).map(r => r.value));
	if ( !hasRequiredActorTypeValues(radioValues) ) return null;
	return form;
}

function getTypeRadioName(form) {
	const vehicle = getVehicleTypeRadio(form);
	return vehicle instanceof HTMLInputElement ? vehicle.name : "";
}

function getVehicleTypeRadio(form) {
	return form.querySelector(VEHICLE_RADIO_SELECTOR);
}

function getStarshipTypeRadio(form) {
	const name = getTypeRadioName(form);
	return name
		? form.querySelector(`input[type="radio"][name="${CSS.escape(name)}"][value="${STARSHIP_CREATE_VALUE}"]`)
		: null;
}

function getSpaceStationTypeRadio(form) {
	const name = getTypeRadioName(form);
	return name
		? form.querySelector(`input[type="radio"][name="${CSS.escape(name)}"][value="${SPACE_STATION_CREATE_VALUE}"]`)
		: null;
}

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized === key ? fallback : localized;
}

function getStarshipOptionLabel() {
	return localizeOrFallback("TYPES.Actor.starship", "Starship");
}

function getSpaceStationOptionLabel() {
	return localizeOrFallback("SW5E.variant.SpaceStation.CreateOption", "Space Station");
}

function ensureSelectOption(typeSelect, value, label, afterValue) {
	if ( !(typeSelect instanceof HTMLSelectElement) ) return;
	if ( typeSelect.querySelector(`option[value="${value}"]`) ) return;

	const option = document.createElement("option");
	option.value = value;
	option.textContent = label;

	const afterOption = typeSelect.querySelector(`option[value="${afterValue}"]`);
	if ( afterOption ) afterOption.insertAdjacentElement("afterend", option);
	else typeSelect.append(option);
}

function ensureStarshipSelectOption(typeSelect) {
	ensureSelectOption(typeSelect, STARSHIP_CREATE_VALUE, getStarshipOptionLabel(), "vehicle");
	ensureSelectOption(typeSelect, SPACE_STATION_CREATE_VALUE, getSpaceStationOptionLabel(), STARSHIP_CREATE_VALUE);
}

/**
 * Clone a type-list row and remap its radio to a custom create value.
 * @param {HTMLFormElement} form
 * @param {string} createValue
 * @param {string} label
 * @param {HTMLElement} insertAfterRow
 */
function insertClonedTypeRadioRow(form, createValue, label, insertAfterRow) {
	const existing = form.querySelector(
		`input[type="radio"][name="${CSS.escape(getTypeRadioName(form))}"][value="${createValue}"]`
	);
	if ( existing ) return existing.closest("li") ?? existing;

	const vehicleRadio = getVehicleTypeRadio(form);
	if ( !(vehicleRadio instanceof HTMLInputElement) || !(insertAfterRow instanceof HTMLElement) ) return null;

	const row = insertAfterRow.cloneNode(true);
	const cloneRadio =
		row.querySelector(`input[type="radio"][name="${CSS.escape(vehicleRadio.name)}"]`)
		?? row.querySelector('input[type="radio"]');
	if ( !(cloneRadio instanceof HTMLInputElement) ) return null;

	row.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));

	const newId =
		(typeof foundry !== "undefined" && foundry.utils?.randomID)
			? foundry.utils.randomID()
			: `sw5e-type-${Date.now()}`;

	cloneRadio.name = vehicleRadio.name;
	cloneRadio.value = createValue;
	cloneRadio.checked = false;
	cloneRadio.required = vehicleRadio.required;
	cloneRadio.disabled = false;
	cloneRadio.id = newId;

	const labelEl = cloneRadio.closest("label");
	if ( labelEl instanceof HTMLLabelElement ) labelEl.setAttribute("for", newId);

	const textSpan = labelEl?.querySelector(":scope > span");
	if ( textSpan ) textSpan.textContent = label;

	insertAfterRow.insertAdjacentElement("afterend", row);
	return row;
}

function ensureStarshipRadioOption(form) {
	if ( getStarshipTypeRadio(form) && getSpaceStationTypeRadio(form) ) return;

	const vehicleRadio = getVehicleTypeRadio(form);
	if ( !(vehicleRadio instanceof HTMLInputElement) ) return;

	const vehicleRow =
		vehicleRadio.closest(`${TYPE_LIST_SELECTOR} > li`)
		?? vehicleRadio.closest("li");
	if ( !vehicleRow ) return;

	const starshipRow = insertClonedTypeRadioRow(
		form,
		STARSHIP_CREATE_VALUE,
		getStarshipOptionLabel(),
		vehicleRow
	);
	insertClonedTypeRadioRow(
		form,
		SPACE_STATION_CREATE_VALUE,
		getSpaceStationOptionLabel(),
		starshipRow ?? vehicleRow
	);
}

function getHiddenFlagInput(form, name) {
	return form.querySelector(`input[type="hidden"][name="${name}"]`);
}

function syncHiddenFlag(form, name, enabled) {
	const existingInput = getHiddenFlagInput(form, name);
	if ( !enabled ) {
		existingInput?.remove();
		return;
	}
	if ( existingInput ) {
		existingInput.value = "true";
		return;
	}
	const input = document.createElement("input");
	input.type = "hidden";
	input.name = name;
	input.value = "true";
	form.append(input);
}

function syncCreateMarkers(form, { isStarship, isSpaceStation }) {
	syncHiddenFlag(form, STARSHIP_CREATE_FLAG, isStarship || isSpaceStation);
	syncHiddenFlag(form, SPACE_STATION_CREATE_FLAG, isSpaceStation);
}

function prepareStarshipSubmission(form) {
	const typeSelect = form.querySelector('select[name="type"]');
	if ( typeSelect instanceof HTMLSelectElement ) {
		const isSpaceStation = typeSelect.value === SPACE_STATION_CREATE_VALUE;
		const isStarship = typeSelect.value === STARSHIP_CREATE_VALUE || isSpaceStation;
		syncCreateMarkers(form, { isStarship, isSpaceStation });
		if ( isStarship ) typeSelect.value = "vehicle";
		return;
	}

	const starshipRadio = getStarshipTypeRadio(form);
	const stationRadio = getSpaceStationTypeRadio(form);
	const vehicleRadio = getVehicleTypeRadio(form);
	if ( !(vehicleRadio instanceof HTMLInputElement) ) return;

	const isSpaceStation = stationRadio instanceof HTMLInputElement && stationRadio.checked;
	const isStarship = (starshipRadio instanceof HTMLInputElement && starshipRadio.checked) || isSpaceStation;
	syncCreateMarkers(form, { isStarship, isSpaceStation });
	if ( isStarship ) {
		if ( starshipRadio ) starshipRadio.checked = false;
		if ( stationRadio ) stationRadio.checked = false;
		vehicleRadio.checked = true;
	}
}

function isPendingStarshipCreate(document, data = {}) {
	return Boolean(
		data?.flags?.sw5e?.createStarship
		?? document?._source?.flags?.sw5e?.createStarship
		?? false
	);
}

function isPendingSpaceStationCreate(document, data = {}) {
	return Boolean(
		data?.flags?.sw5e?.createSpaceStation
		?? document?._source?.flags?.sw5e?.createSpaceStation
		?? false
	);
}

function isSw5eStarshipActorData(data) {
	return data?.type === "vehicle" && data?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

function getStarshipActorSizeKey(data) {
	return data?.system?.traits?.size
		?? data?.flags?.sw5e?.legacyStarshipActor?.system?.traits?.size
		?? "med";
}

function syncStarshipPrototypeTokenSource(document, data = {}) {
	if ( !document?.updateSource ) return false;
	const mergedData = foundry.utils.mergeObject(document.toObject(), data ?? {}, {
		inplace: false,
		insertKeys: true,
		insertValues: true,
		overwrite: true
	});
	if ( !isSw5eStarshipActorData(mergedData) ) return false;
	const { width, height } = getStarshipPrototypeTokenDimensions(getStarshipActorSizeKey(mergedData));
	if ( mergedData?.prototypeToken?.width === width && mergedData?.prototypeToken?.height === height ) return false;
	document.updateSource({
		prototypeToken: {
			width,
			height
		}
	});
	return true;
}

function applyBlankStarshipSeed(document, { asSpaceStation = false } = {}) {
	const source = createBlankLegacyStarshipActorData(document.toObject());
	if ( asSpaceStation ) {
		source.flags ??= {};
		source.flags.sw5e ??= {};
		source.flags.sw5e.legacyStarshipActor ??= { type: "starship", system: {} };
		source.flags.sw5e.legacyStarshipActor.variant = STARSHIP_VARIANT_SPACE_STATION;
		// Stations are Large+ by RAW; seed Large so soft size warning is not immediate.
		source.system ??= {};
		source.system.traits ??= {};
		if ( !source.system.traits.size || source.system.traits.size === "med" ) {
			source.system.traits.size = "lg";
		}
		source.flags.sw5e.legacyStarshipActor.system ??= {};
		source.flags.sw5e.legacyStarshipActor.system.traits ??= {};
		source.flags.sw5e.legacyStarshipActor.system.traits.size = source.system.traits.size;
	}
	applyStarshipPrototypeTokenDimensions(source, source.system?.traits?.size);
	document.updateSource(source);

	if ( document._source?.flags?.sw5e ) {
		delete document._source.flags.sw5e.createStarship;
		delete document._source.flags.sw5e.createSpaceStation;
	}
	if ( document.flags?.sw5e ) {
		delete document.flags.sw5e.createStarship;
		delete document.flags.sw5e.createSpaceStation;
	}
}

async function repairCreatedStarshipPrototypeToken(actor) {
	if ( !actor || actor.pack || !actor.isOwner ) return false;
	const actorData = actor.toObject();
	if ( !isSw5eStarshipActorData(actorData) ) return false;
	const { width, height } = getStarshipPrototypeTokenDimensions(getStarshipActorSizeKey(actorData));
	if ( actor.prototypeToken?.width === width && actor.prototypeToken?.height === height ) return false;
	await actor.update({
		"prototypeToken.width": width,
		"prototypeToken.height": height
	});
	return true;
}

function actorHasSpaceStationAcEffect(actor) {
	return (actor?.effects?.contents ?? []).some(effect =>
		effect?.flags?.[SETTINGS_NAMESPACE]?.[SPACE_STATION_AC_EFFECT_FLAG]
		|| effect?.flags?.sw5e?.[SPACE_STATION_AC_EFFECT_FLAG]
	);
}

function actorHasStockModFromUuid(actor, uuid) {
	const id = uuid?.split(".")?.pop?.() ?? "";
	return (actor?.items?.contents ?? []).some(item => {
		const sourceId = item.flags?.core?.sourceId ?? item._stats?.compendiumSource ?? "";
		return sourceId === uuid || (id && sourceId.endsWith(`.${id}`)) || item._id === id;
	});
}

/**
 * Resolve and embed missing stock mods by UUID. Soft-warns on resolve failure.
 * @param {Actor} actor
 * @param {string[]} uuids
 * @returns {Promise<Item[]>}
 */
async function grantMissingStockModsFromUuids(actor, uuids = []) {
	const missingUuids = uuids.filter(uuid => uuid && !actorHasStockModFromUuid(actor, uuid));
	if ( !missingUuids.length ) return [];

	const docs = [];
	for ( const uuid of missingUuids ) {
		try {
			const doc = await fromUuid(uuid);
			if ( doc ) docs.push(doc.toObject());
			else {
				ui.notifications?.warn?.(
					`SW5E: Could not resolve space station stock modification (${uuid}).`
				);
			}
		} catch ( err ) {
			console.warn(`${DEBUG_PREFIX} Failed to resolve stock mod ${uuid}`, err);
			ui.notifications?.warn?.(
				`SW5E: Could not resolve space station stock modification (${uuid}).`
			);
		}
	}
	if ( !docs.length ) return [];
	return actor.createEmbeddedDocuments("Item", docs);
}

/**
 * Grant base stock Central Computer + AC −2 effect after station create (not during render).
 * @param {Actor} actor
 */
export async function ensureSpaceStationCreateGrants(actor) {
	if ( !actor || actor.pack || !actor.isOwner ) return;
	if ( !isSw5eSpaceStationActor(actor) ) return;

	const updates = [];
	if ( !actorHasSpaceStationAcEffect(actor) ) {
		const effectData = buildSpaceStationAcPenaltyEffectData(actor.uuid);
		updates.push(actor.createEmbeddedDocuments("ActiveEffect", [effectData]));
	}

	updates.push(grantMissingStockModsFromUuids(actor, getSpaceStationBaseStockModUuids()));
	await Promise.all(updates);
}

/**
 * When a Space Station Role Specialization feat is added, grant missing size-based stock mods.
 * @param {Item} item
 * @param {string} [userId]
 */
export async function ensureSpaceStationRoleSpecializationGrants(item, userId) {
	if ( userId && game.user?.id !== userId ) return;
	if ( !item || item.pack ) return;
	if ( !isSpaceStationRoleSpecializationFeat(item) ) return;

	const actor = item.actor;
	if ( !actor || actor.pack || !actor.isOwner ) return;
	if ( !isActiveSpaceStationActor(actor) ) return;

	const uuids = resolveSpaceStationRoleSpecializationModUuids(item);
	if ( !uuids.length ) return;

	await grantMissingStockModsFromUuids(actor, uuids);
}

function syncCreateMarkersFromForm(form) {
	const typeSelect = form.querySelector('select[name="type"]');
	if ( typeSelect instanceof HTMLSelectElement ) {
		const isSpaceStation = typeSelect.value === SPACE_STATION_CREATE_VALUE;
		const isStarship = typeSelect.value === STARSHIP_CREATE_VALUE || isSpaceStation;
		syncCreateMarkers(form, { isStarship, isSpaceStation });
		return;
	}

	const starshipRadio = getStarshipTypeRadio(form);
	const stationRadio = getSpaceStationTypeRadio(form);
	const isSpaceStation = stationRadio instanceof HTMLInputElement && stationRadio.checked;
	const isStarship = (starshipRadio instanceof HTMLInputElement && starshipRadio.checked) || isSpaceStation;
	syncCreateMarkers(form, { isStarship, isSpaceStation });
}

function attachStarshipCreateListeners(form) {
	if ( form.dataset.sw5eStarshipCreateListeners === "true" ) return;
	form.dataset.sw5eStarshipCreateListeners = "true";

	const typeSelect = form.querySelector('select[name="type"]');
	if ( typeSelect instanceof HTMLSelectElement ) {
		typeSelect.addEventListener("change", () => syncCreateMarkersFromForm(form));
	} else {
		form.addEventListener("change", ev => {
			const name = getTypeRadioName(form);
			if ( !name || !(ev.target instanceof HTMLInputElement) ) return;
			if ( ev.target.name !== name || ev.target.type !== "radio" ) return;
			syncCreateMarkersFromForm(form);
		});
	}

	form.addEventListener("submit", () => prepareStarshipSubmission(form), { capture: true });
}

/**
 * Duplicate row prevention: {@link ensureStarshipRadioOption} exits early if
 * both custom radios already exist.
 *
 * Listener duplication: {@link attachStarshipCreateListeners} uses
 * `form.dataset.sw5eStarshipCreateListeners`.
 */
function injectStarshipCreateOption(app, html) {
	const root = getHtmlRoot(html);
	const form = getActorCreateForm(root);
	if ( !form ) return;

	const typeSelect = form.querySelector('select[name="type"]');
	if ( typeSelect instanceof HTMLSelectElement ) {
		ensureStarshipSelectOption(typeSelect);
		syncCreateMarkersFromForm(form);
		attachStarshipCreateListeners(form);
		return;
	}

	ensureStarshipRadioOption(form);
	syncCreateMarkersFromForm(form);
	attachStarshipCreateListeners(form);
}

export function patchStarshipCreate() {
	Hooks.on("renderApplicationV2", injectStarshipCreateOption);
	Hooks.on("preCreateActor", (document, data) => {
		if ( isPendingStarshipCreate(document, data) ) {
			applyBlankStarshipSeed(document, {
				asSpaceStation: isPendingSpaceStationCreate(document, data)
			});
		}
		syncStarshipPrototypeTokenSource(document, data);
	});
	Hooks.on("createActor", (actor, _options, userId) => {
		if ( game.user?.id !== userId ) return;
		void repairCreatedStarshipPrototypeToken(actor).catch(err => {
			console.warn(`${DEBUG_PREFIX} Failed to repair created starship token dimensions`, err);
		});
		if ( isSw5eSpaceStationActor(actor) ) {
			void ensureSpaceStationCreateGrants(actor).catch(err => {
				console.warn(`${DEBUG_PREFIX} Failed to apply space station create grants`, err);
			});
		}
	});
	Hooks.on("updateActor", (actor, changed, _options, userId) => {
		if ( game.user?.id !== userId ) return;
		const variant = foundry.utils.getProperty(changed, "flags.sw5e.legacyStarshipActor.variant");
		if ( variant !== STARSHIP_VARIANT_SPACE_STATION ) return;
		if ( !isSw5eSpaceStationActor(actor) ) return;
		void ensureSpaceStationCreateGrants(actor).catch(err => {
			console.warn(`${DEBUG_PREFIX} Failed to apply space station convert grants`, err);
		});
	});
	Hooks.on("createItem", (item, _options, userId) => {
		void ensureSpaceStationRoleSpecializationGrants(item, userId).catch(err => {
			console.warn(`${DEBUG_PREFIX} Failed to apply Role Specialization stock mods`, err);
		});
	});
}

export { isSpaceStationSizeBelowLarge };
