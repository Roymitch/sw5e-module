import { getModuleId, localizeOrFallback } from "../module-support.mjs";

function localizeMaybe(value) {
	if ( typeof value !== "string" || !value.includes(".") ) return value;
	if ( typeof game.i18n.has === "function" ) return game.i18n.has(value) ? game.i18n.localize(value) : value;
	const localized = game.i18n.localize(value);
	return localized !== value ? localized : value;
}

function localizeFieldMetadata(field) {
	if ( !field ) return field;
	if ( typeof field.label === "string" ) field.label = localizeMaybe(field.label);
	if ( typeof field.hint === "string" ) field.hint = localizeMaybe(field.hint);
	return field;
}

function localizeFieldEntry(entry) {
	if ( !entry || typeof entry !== "object" ) return entry;
	if ( typeof entry.label === "string" ) entry.label = localizeMaybe(entry.label);
	if ( typeof entry.hint === "string" ) entry.hint = localizeMaybe(entry.hint);
	localizeFieldMetadata(entry.field);
	if ( Array.isArray(entry.fields) ) {
		for ( const child of entry.fields ) {
			localizeFieldMetadata(child?.field);
			if ( typeof child?.label === "string" ) child.label = localizeMaybe(child.label);
			if ( typeof child?.hint === "string" ) child.hint = localizeMaybe(child.hint);
		}
	}
	return entry;
}

function mapSectionLabel(label) {
	const localized = localizeMaybe(label);
	const racialTraits = game.i18n.localize("DND5E.RacialTraits");
	const sw5eFeatures = game.i18n.localize("SW5E.Features");
	if ( localized === racialTraits ) return game.i18n.localize("DND5E.FeaturesRace");
	if ( localized === sw5eFeatures ) return localizeOrFallback("SW5E.SpecialTraits.Sections.Sw5eFeatures", "SW5E Features");
	return localized;
}

function postProcessSpecialTraitsContext(context) {
	const sections = context?.flags?.sections;
	if ( !Array.isArray(sections) ) return context;
	for ( const section of sections ) {
		section.label = mapSectionLabel(section.label);
		if ( Array.isArray(section.fields) ) {
			for ( const entry of section.fields ) localizeFieldEntry(entry);
		}
	}
	return context;
}

function getHtmlRoot(html, app) {
	return html instanceof HTMLElement
		? html
		: html?.[0]
			?? (app?.element instanceof HTMLElement ? app.element : app?.element?.[0] ?? null);
}

function patchSpecialTraitsDom(root) {
	if ( !root ) return;
	const tab = root.matches?.('section.tab[data-tab="specialTraits"]')
		? root
		: root.querySelector?.('section.tab[data-tab="specialTraits"]');
	if ( !tab ) return;

	const firstFieldset = tab.querySelector("fieldset.card");
	const originalClassLabel = firstFieldset?.querySelector(".form-group > label");
	const originalClassHint = firstFieldset?.querySelector(".form-group > .hint");

	if ( originalClassLabel ) originalClassLabel.textContent = localizeOrFallback("SW5E.SpecialTraits.OriginalClass.Label", "Original Class");
	if ( originalClassHint ) originalClassHint.textContent = localizeOrFallback("SW5E.SpecialTraits.OriginalClass.Hint", "Choose which class should count as this character's original class when a feature refers to your original class.");
}

function registerWrapper(target, callback) {
	try {
		libWrapper.register(getModuleId(), target, callback, "WRAPPER");
	} catch (err) {
		console.warn(`SW5E | Failed to register Special Traits wrapper for '${target}'.`, err);
	}
}

function patchTabLabels() {
	registerWrapper("dnd5e.applications.actor.BaseActorSheet.prototype._prepareTabsContext", async function (wrapped, context, options) {
		context = await wrapped(context, options);
		if ( Array.isArray(context?.tabs) ) {
			const specialTraitsTab = context.tabs.find(tab => tab?.tab === "specialTraits");
			if ( specialTraitsTab ) specialTraitsTab.label = localizeOrFallback("SW5E.SpecialTraits.Label", "Special Traits");
		}
		return context;
	});
}

function patchContextPreparation() {
	const wrapContext = async function (wrapped, context, options) {
		context = await wrapped(context, options);
		return postProcessSpecialTraitsContext(context);
	};

	registerWrapper("dnd5e.applications.actor.BaseActorSheet.prototype._prepareSpecialTraitsContext", wrapContext);
	registerWrapper("dnd5e.applications.actor.NPCActorSheet.prototype._prepareSpecialTraitsContext", wrapContext);
}

function patchRenderedDom() {
	Hooks.on("renderBaseActorSheet", (app, html) => patchSpecialTraitsDom(getHtmlRoot(html, app)));
	Hooks.on("renderActorSheetV2", (app, html) => patchSpecialTraitsDom(getHtmlRoot(html, app)));
}

export function patchSpecialTraitsSheet() {
	patchTabLabels();
	patchContextPreparation();
	patchRenderedDom();
}
