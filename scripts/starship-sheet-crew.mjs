/**
 * Starship sheet crew UI + role-group context (Phase 6 E1–E3).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 * Live path does not import categorize (getCompendiumPack from ids).
 */

import {
	buildVehicleAvailableActors,
	buildVehicleStarshipCrewContext,
	canCurrentUserDeployStarshipCrewRole,
	canCurrentUserUndeployStarshipCrew,
	deployStarshipCrew,
	deployStarshipCrewBatch,
	partitionCrewRosterGroups,
	toggleStarshipActiveCrew,
	undeployStarshipCrew
} from "./starship-character.mjs";
import {
	getCharacterDeploymentSummary,
	groupCharacterDeploymentFeaturesByParent,
	normalizeDeploymentGroupingKey
} from "./character-deployments.mjs";
import {
	canCurrentUserUpdateStarshipActor,
	warnStarshipActorUpdateDenied
} from "./starship-permissions.mjs";
import { escapeHtml, localizeOrFallback } from "./starship-sheet-html.mjs";
import { getCompendiumPack, STARSHIP_TAB_ID } from "./starship-sheet-ids.mjs";
import { getCrewRoleCollapseMapForStarship } from "./patch/starship-sheet-delegates.mjs";
import { makeItemEntry } from "./patch/starship-sheet-core-context.mjs";
import { isStarshipSheetEditMode } from "./patch/starship-sheet-sidebar.mjs";

/** @type {WeakSet<HTMLElement>} */
const _sw5eCrewRosterContextMenuWrappers = new WeakSet();

function getDnd5eContextMenu5e() {
	return globalThis.dnd5e?.applications?.ContextMenu5e ?? null;
}

function getEventTargetElement(event) {
	const t = event?.target;
	if ( t instanceof HTMLElement ) return t;
	if ( t?.parentElement instanceof HTMLElement ) return t.parentElement;
	return null;
}

export function resolveCrewActorFromUuid(uuid) {
	if ( !uuid ) return null;
	return globalThis.fromUuidSync?.(uuid)
		?? globalThis.game?.actors?.get(uuid)
		?? null;
}

export function formatCrewRoleMeta(crewRecord) {
	const name = crewRecord?.name ?? "Crew";
	const roles = [];
	if ( crewRecord?.isPilot ) roles.push("Pilot");
	else if ( crewRecord?.isCrew ) roles.push("Crew");
	return roles.length ? `${name} · ${roles.join(", ")}` : name;
}

/**
 * @param {string} label
 * @returns {string}
 */
export function crewRoleGroupKeyFromLabel(label) {
	return normalizeDeploymentGroupingKey(label) || "group";
}

/**
 * Default collapsed unless the viewing user's assigned character contributed items to the group.
 * Explicit user-flag entries override defaults. Attached-to-vessel defaults collapsed.
 *
 * @param {object} group
 * @param {Record<string, boolean>} collapseMap
 * @param {string|null} viewerCharacterUuid
 * @param {string} attachedLabel
 * @returns {boolean}
 */
export function resolveCrewRoleGroupCollapsed(group, collapseMap, viewerCharacterUuid, attachedLabel) {
	const key = group.groupKey;
	if ( key && Object.prototype.hasOwnProperty.call(collapseMap, key) ) {
		return Boolean(collapseMap[key]);
	}
	if ( group.label === attachedLabel ) return true;
	if ( viewerCharacterUuid && Array.isArray(group.items) ) {
		const mine = group.items.some(entry => entry?.sourceActorUuid === viewerCharacterUuid);
		if ( mine ) return false;
	}
	return true;
}

/**
 * Live-read Deployment features from assigned pilot/crew PCs, grouped by parent Deployment.
 * Vessel-attached ship deployment items trail in an "Attached to vessel" group.
 *
 * @param {object} actor Starship vehicle actor
 * @param {ReturnType<typeof categorizeStarshipItems>} categorized
 * @returns {Array<object>}
 */
export function buildCrewRoleGroupsFromAssignedCrew(actor, categorized) {
	const featureFallback = localizeOrFallback("SW5E.FeatureCategory.Deployments", "Deployment Features");
	const ventureFallback = localizeOrFallback("SW5E.FeatureCategory.Ventures", "Ventures");
	const attachedLabel = localizeOrFallback("SW5E.StarshipSheet.CrewRolesAttachedVessel", "Attached to vessel");
	const expandLabel = localizeOrFallback("SW5E.StarshipSheet.CrewRolesGroupExpand", "Expand deployment features");
	const collapseLabel = localizeOrFallback("SW5E.StarshipSheet.CrewRolesGroupCollapse", "Collapse deployment features");
	const crewCtx = buildVehicleStarshipCrewContext(actor);
	const roster = Array.isArray(crewCtx?.roster) ? crewCtx.roster : [];
	const collapseMap = getCrewRoleCollapseMapForStarship(actor);
	const viewerCharacterUuid = game?.user?.character?.uuid ?? null;

	/** @type {Map<string, { label: string, items: object[], firstItemId: string|null }>} */
	const groupsByLabel = new Map();

	const ensureGroup = label => {
		const key = label || featureFallback;
		if ( !groupsByLabel.has(key) ) {
			groupsByLabel.set(key, {
				label: key,
				items: [],
				firstItemId: null
			});
		}
		return groupsByLabel.get(key);
	};

	for ( const crewRecord of roster ) {
		if ( !crewRecord?.isPilot && !crewRecord?.isCrew ) continue;
		const crewActor = resolveCrewActorFromUuid(crewRecord.uuid);
		if ( !crewActor ) {
			console.warn(`SW5E MODULE | Crew deployment features: could not resolve actor ${crewRecord.uuid}`);
			continue;
		}

		const parentGroups = groupCharacterDeploymentFeaturesByParent(crewActor, {
			featureFallback,
			ventureFallback
		});
		const meta = formatCrewRoleMeta(crewRecord);

		for ( const parentGroup of parentGroups ) {
			const group = ensureGroup(parentGroup.label);
			for ( const item of parentGroup.items ) {
				const entry = makeItemEntry(item, STARSHIP_TAB_ID, actor, {
					sotgPanel: "overview",
					meta,
					sourceActorUuid: crewRecord.uuid,
					allowDelete: false,
					supportsSheetNavigation: false
				});
				group.items.push(entry);
				if ( !group.firstItemId ) group.firstItemId = entry.id;
			}
		}
	}

	const vesselItems = categorized?.roles?.items ?? [];
	if ( vesselItems.length ) {
		const group = ensureGroup(attachedLabel);
		const sorted = [...vesselItems].sort((left, right) => left.name.localeCompare(right.name));
		for ( const item of sorted ) {
			const entry = makeItemEntry(item, STARSHIP_TAB_ID, actor, {
				sotgPanel: "overview",
				allowDelete: true
			});
			group.items.push(entry);
			if ( !group.firstItemId ) group.firstItemId = entry.id;
		}
	}

	return Array.from(groupsByLabel.values())
		.map(group => {
			const groupKey = crewRoleGroupKeyFromLabel(group.label);
			const entry = {
				label: group.label,
				groupKey,
				count: group.items.length,
				defaultTab: STARSHIP_TAB_ID,
				manageLabel: "Core",
				scrollTo: STARSHIP_TAB_ID,
				firstItemId: group.firstItemId,
				showEconomy: false,
				sotgPanel: "overview",
				supportsSheetNavigation: false,
				expandLabel,
				collapseLabel,
				items: group.items.sort((left, right) => left.name.localeCompare(right.name))
			};
			entry.collapsed = resolveCrewRoleGroupCollapsed(entry, collapseMap, viewerCharacterUuid, attachedLabel);
			return entry;
		})
		.filter(group => group.items.length)
		.sort((left, right) => {
			if ( left.label === attachedLabel ) return 1;
			if ( right.label === attachedLabel ) return -1;
			return left.label.localeCompare(right.label);
		});
}

export function buildGroupContext(group) {
	const items = group.items
		.sort((left, right) => left.name.localeCompare(right.name))
		.map(item => makeItemEntry(item, group.defaultTab, group.actor, { sotgPanel: group.sotgPanel }));
	return {
		label: group.label,
		count: group.items.length,
		defaultTab: group.defaultTab,
		manageLabel: group.manageLabel,
		scrollTo: group.scrollTo,
		firstItemId: group.items[0]?.id ?? null,
		showEconomy: Boolean(group.showEconomy) && items.some(item => item.weightLabel || item.priceLabel),
		sotgPanel: group.sotgPanel,
		items
	};
}

/**
 * Collect vessel-attached crew-role items using the same predicates as
 * {@link categorizeStarshipItems} `groups.roles`, without building other category arrays.
 * @param {object} actor
 * @returns {object[]}
 */
export function collectStarshipCrewRoleItems(actor) {
	const items = [];
	for ( const item of actor.items ) {
		const pack = getCompendiumPack(item);
		const featType = item.system?.type?.value;
		const role = item.flags?.sw5e?.starshipCharacter?.role;

		if ( item.flags?.sw5e?.legacyStarshipSize || role === "classification" ) continue;
		if ( item.flags?.sw5e?.legacyStarshipMod || role === "modification" || pack === "starshipmodifications" ) continue;
		if ( featType === "starshipAction" || pack === "starshipactions" ) continue;
		if ( featType === "deployment" || role === "deployment" || role === "venture" || pack === "deployments" || pack === "deploymentfeatures" || pack === "ventures" ) {
			items.push(item);
		}
	}
	return items;
}

/**
 * Core-path crew-role groups: assigned roster + vessel role items only (no full categorize/partition).
 * @param {object} actor
 * @returns {Array<object>}
 */
export function buildStarshipCrewRoleGroups(actor) {
	return buildCrewRoleGroupsFromAssignedCrew(actor, {
		roles: { items: collectStarshipCrewRoleItems(actor) }
	});
}

/**
 * Parent Deployment feat label for a resolved crew Actor (highest displayRank, then name).
 * Call once per Actor during context prep — do not re-scan in render helpers.
 * @param {object|null} actor
 * @returns {string}
 */
export function resolveDeploymentAssignmentLabel(actor) {
	if ( !actor ) return "";
	const deployments = getCharacterDeploymentSummary(actor)?.deployments;
	if ( !Array.isArray(deployments) || !deployments.length ) return "";
	const lang = globalThis.game?.i18n?.lang;
	const sorted = deployments.slice().sort((left, right) => {
		const rankDelta = (Number(right?.displayRank) || 0) - (Number(left?.displayRank) || 0);
		if ( rankDelta !== 0 ) return rankDelta;
		return String(left?.name ?? "").localeCompare(String(right?.name ?? ""), lang);
	});
	return String(sorted[0]?.name ?? "").trim();
}

export function buildAssignedCrewSearchText(record) {
	const parts = [String(record?.name ?? "")];
	if ( record?.deploymentAssignmentLabel ) parts.push(String(record.deploymentAssignmentLabel));
	if ( record?.isPilot ) parts.push(localizeOrFallback("SW5E.StarshipCrewBadgePilot", "Pilot"));
	if ( record?.active ) parts.push(localizeOrFallback("SW5E.StarshipCrewBadgeActive", "Active"));
	if ( !record?.isPilot && record?.isCrew ) parts.push(localizeOrFallback("SW5E.StarshipCrewBadgeCrew", "Crew"));
	if ( record?.isPassenger ) parts.push(localizeOrFallback("SW5E.StarshipCrewBadgePassenger", "Passenger"));
	return parts.join(" ").trim().toLowerCase();
}

const CREW_ROSTER_GROUP_LABEL_FALLBACKS = Object.freeze({
	character: "Player Characters",
	npc: "NPCs",
	other: "Other"
});

/**
 * @param {object|null|undefined} actor
 * @returns {boolean}
 */
export function canCurrentUserObserveActor(actor) {
	if ( !actor || !globalThis.game?.user ) return false;
	const levels = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS;
	const observer = levels?.OBSERVER ?? 2;
	try {
		return Boolean(actor.testUserPermission?.(globalThis.game.user, observer));
	} catch ( _err ) {
		return false;
	}
}

/**
 * Enrich crew template context once: resolve each Actor, attach Deployment label + searchText,
 * then derive rosterGroups by referencing enriched rows. Collapse is derived from the sheet app map.
 * @param {{ roster?: object[] }} crewContext
 * @param {{ collapseMap?: Record<string, boolean> }} [options]
 * @returns {{ roster: object[], rosterGroups: object[] }}
 */
export function enrichCrewContextForSheetSearch(crewContext, { collapseMap = null } = {}) {
	const roster = Array.isArray(crewContext?.roster) ? crewContext.roster : [];
	const map = collapseMap && typeof collapseMap === "object" ? collapseMap : {};
	const enrichedRoster = roster.map(record => {
		const actor = resolveCrewActorFromUuid(record?.uuid);
		const deploymentAssignmentLabel = resolveDeploymentAssignmentLabel(actor);
		const enriched = {
			...record,
			deploymentAssignmentLabel
		};
		enriched.searchText = buildAssignedCrewSearchText(enriched);
		return enriched;
	});
	const expandLabel = localizeOrFallback("SW5E.StarshipCrewGroupExpand", "Expand crew group");
	const collapseLabel = localizeOrFallback("SW5E.StarshipCrewGroupCollapse", "Collapse crew group");
	const rosterGroups = partitionCrewRosterGroups(enrichedRoster).map(group => ({
		key: group.key,
		labelKey: group.labelKey,
		label: localizeOrFallback(
			group.labelKey,
			CREW_ROSTER_GROUP_LABEL_FALLBACKS[group.key] ?? group.key
		),
		rows: group.rows,
		collapsed: Boolean(map[group.key]),
		bodyId: `sw5e-crew-group-body-${group.key}`,
		expandLabel,
		collapseLabel
	}));
	return {
		...crewContext,
		roster: enrichedRoster,
		rosterGroups
	};
}

/**
 * Sync a roster group’s collapsed presentation in the DOM only.
 * @param {HTMLElement} group
 * @param {boolean} collapsed
 */
export function syncCrewRosterGroupCollapsedDom(group, collapsed) {
	if ( !(group instanceof HTMLElement) ) return;
	group.classList.toggle("is-collapsed", Boolean(collapsed));
	const btn = group.querySelector("[data-sw5e-crew-roster-collapse]");
	if ( !(btn instanceof HTMLElement) ) return;
	btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
	const expandLabel = btn.dataset.expandLabel
		?? localizeOrFallback("SW5E.StarshipCrewGroupExpand", "Expand crew group");
	const collapseLabel = btn.dataset.collapseLabel
		?? localizeOrFallback("SW5E.StarshipCrewGroupCollapse", "Collapse crew group");
	const label = collapsed ? expandLabel : collapseLabel;
	btn.title = label;
	btn.setAttribute("aria-label", label);
}

/**
 * Client-side filter for assigned roster rows. Search temporary expand is DOM-only —
 * does not write app collapse map or mutate crew context.
 * @param {HTMLElement} wrapper
 * @param {string} query
 * @param {object} [app]
 */
export function applyStarshipAssignedCrewSearchFilter(wrapper, query, app = null) {
	if ( !(wrapper instanceof HTMLElement) ) return;
	const needle = String(query ?? "").trim().toLowerCase();
	const rows = wrapper.querySelectorAll(".sw5e-starship-crew-roster .sw5e-starship-crew-row");
	if ( !rows.length ) return;

	let visible = 0;
	for ( const row of rows ) {
		const hay = row.getAttribute("data-search") ?? "";
		const match = !needle || hay.includes(needle);
		row.classList.toggle("is-filtered-out", !match);
		if ( match ) visible += 1;
	}

	const collapseMap = app?._sw5eCrewRosterGroupCollapse && typeof app._sw5eCrewRosterGroupCollapse === "object"
		? app._sw5eCrewRosterGroupCollapse
		: {};

	for ( const group of wrapper.querySelectorAll(".sw5e-starship-crew-roster .sw5e-starship-crew-group") ) {
		const groupRows = group.querySelectorAll(".sw5e-starship-crew-row");
		let groupVisible = 0;
		for ( const row of groupRows ) {
			if ( !row.classList.contains("is-filtered-out") ) groupVisible += 1;
		}
		const hideGroup = Boolean(needle) && groupVisible === 0;
		group.classList.toggle("is-filtered-out", hideGroup);

		if ( needle ) {
			if ( groupVisible > 0 ) syncCrewRosterGroupCollapsedDom(group, false);
		} else {
			const key = group.getAttribute("data-crew-group") ?? "";
			syncCrewRosterGroupCollapsedDom(group, Boolean(collapseMap[key]));
		}
	}

	const empty = wrapper.querySelector(".sw5e-starship-crew-assigned-search-empty");
	if ( !(empty instanceof HTMLElement) ) return;
	const showEmpty = Boolean(needle) && visible === 0;
	empty.classList.toggle("is-hidden", !showEmpty);
	empty.hidden = !showEmpty;
}

/**
 * Bind assigned-roster search once per Core tab wrapper; restore query after innerHTML updates.
 * @param {HTMLElement} wrapper
 * @param {object} app
 */
export function ensureStarshipAssignedCrewSearch(wrapper, app) {
	if ( !(wrapper instanceof HTMLElement) ) return;
	const input = wrapper.querySelector("input.sw5e-starship-crew-assigned-search");
	if ( !(input instanceof HTMLInputElement) ) return;

	const stored = typeof app?._sw5eAssignedCrewSearchQuery === "string"
		? app._sw5eAssignedCrewSearchQuery
		: "";
	if ( input.value !== stored ) input.value = stored;
	applyStarshipAssignedCrewSearchFilter(wrapper, stored, app);

	if ( wrapper.dataset.sw5eAssignedCrewSearchDelegate === "1" ) return;
	wrapper.dataset.sw5eAssignedCrewSearchDelegate = "1";
	wrapper.addEventListener("input", event => {
		const target = event.target;
		if ( !(target instanceof HTMLInputElement) ) return;
		if ( !target.classList.contains("sw5e-starship-crew-assigned-search") ) return;
		if ( app ) app._sw5eAssignedCrewSearchQuery = target.value;
		applyStarshipAssignedCrewSearchFilter(wrapper, target.value, app);
	});
}

/**
 * Sheet-app collapse preferences for PC/NPC/(Other) roster groups. One-install per wrapper.
 * @param {HTMLElement} wrapper
 * @param {object} app
 */
export function ensureStarshipCrewRosterGroupCollapse(wrapper, app) {
	if ( !(wrapper instanceof HTMLElement) ) return;
	if ( wrapper.dataset.sw5eCrewRosterCollapseDelegate === "1" ) return;
	wrapper.dataset.sw5eCrewRosterCollapseDelegate = "1";
	wrapper.addEventListener("click", event => {
		const btn = event.target?.closest?.("[data-sw5e-crew-roster-collapse]");
		if ( !(btn instanceof HTMLElement) ) return;
		event.preventDefault();
		event.stopPropagation();
		const group = btn.closest(".sw5e-starship-crew-group");
		if ( !(group instanceof HTMLElement) ) return;
		const key = btn.getAttribute("data-sw5e-crew-roster-collapse")
			|| group.getAttribute("data-crew-group")
			|| "";
		if ( !key ) return;
		if ( !app._sw5eCrewRosterGroupCollapse || typeof app._sw5eCrewRosterGroupCollapse !== "object" ) {
			app._sw5eCrewRosterGroupCollapse = {};
		}
		const willCollapse = !group.classList.contains("is-collapsed");
		app._sw5eCrewRosterGroupCollapse[key] = willCollapse;
		syncCrewRosterGroupCollapsedDom(group, willCollapse);
	});
}

/**
 * Portrait/name open Actor sheet after OBSERVER permission check. One-install per wrapper.
 * @param {HTMLElement} wrapper
 * @param {object} _app
 */
export function ensureStarshipCrewRosterOpenActor(wrapper, _app) {
	if ( !(wrapper instanceof HTMLElement) ) return;
	if ( wrapper.dataset.sw5eCrewRosterOpenActorDelegate === "1" ) return;
	wrapper.dataset.sw5eCrewRosterOpenActorDelegate = "1";
	wrapper.addEventListener("click", event => {
		const target = getEventTargetElement(event);
		if ( !target ) return;
		if ( target.closest("[data-sw5e-crew-command], [data-sw5e-crew-roster-collapse], [data-context-menu]") ) return;
		const openEl = target.closest("[data-sw5e-crew-open-actor]");
		if ( !openEl ) return;
		const row = openEl.closest(".sw5e-starship-crew-row[data-actor-uuid]");
		if ( !row ) return;
		event.preventDefault();
		void openStarshipCrewRosterActorSheet(row.getAttribute("data-actor-uuid"));
	});
}

/**
 * @param {string|null} uuid
 * @returns {Promise<void>}
 */
export async function openStarshipCrewRosterActorSheet(uuid) {
	if ( !uuid ) {
		ui?.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipCrewActorMissing",
			"That crew member could not be found."
		));
		return;
	}
	let actor = resolveCrewActorFromUuid(uuid);
	if ( !actor && globalThis.fromUuid ) {
		try {
			actor = await globalThis.fromUuid(uuid);
		} catch ( _err ) {
			actor = null;
		}
	}
	if ( !actor ) {
		ui?.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipCrewActorMissing",
			"That crew member could not be found."
		));
		return;
	}
	if ( !canCurrentUserObserveActor(actor) ) {
		ui?.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipCrewActorNoPermission",
			"You do not have permission to view that actor."
		));
		return;
	}
	await actor.sheet?.render(true);
}

/**
 * Portrait + name + @UUID only. Re-checks OBSERVER before create.
 * @param {object} actor
 * @returns {Promise<void>}
 */
export async function displayStarshipCrewActorInChat(actor) {
	if ( !canCurrentUserObserveActor(actor) ) return;
	const name = String(actor.name ?? "");
	const img = String(actor.img || "icons/svg/mystery-man.svg");
	const uuid = String(actor.uuid ?? "");
	if ( !uuid ) return;
	const content = [
		`<div class="sw5e-starship-crew-chat-card">`,
		`<img class="sw5e-starship-crew-chat-portrait" src="${escapeHtml(img)}" alt="" width="36" height="36" />`,
		`<div class="sw5e-starship-crew-chat-copy">`,
		`<strong class="sw5e-starship-crew-chat-name">${escapeHtml(name)}</strong>`,
		`<div>@UUID[${uuid}]</div>`,
		`</div></div>`
	].join("");
	const ChatMessageCls = globalThis.ChatMessage;
	if ( !ChatMessageCls?.implementation?.create && !ChatMessageCls?.create ) return;
	const create = ChatMessageCls.implementation?.create?.bind(ChatMessageCls.implementation)
		?? ChatMessageCls.create.bind(ChatMessageCls);
	await create({ content });
}

/**
 * @param {HTMLElement} element
 * @param {object} app
 */
export function prepareStarshipCrewRosterContextMenu(element, app) {
	const row = element?.closest?.(".sw5e-starship-crew-row[data-actor-uuid]") ?? element;
	const uuid = row?.getAttribute?.("data-actor-uuid") || row?.dataset?.actorUuid || "";
	const actor = resolveCrewActorFromUuid(uuid);
	const sheetEditMode = isStarshipSheetEditMode(app);
	const canObserve = canCurrentUserObserveActor(actor);

	const options = [{
		name: localizeOrFallback("SW5E.StarshipCrewContextView", "View Character"),
		icon: '<i class="fa-solid fa-eye fa-fw"></i>',
		condition: () => canCurrentUserObserveActor(resolveCrewActorFromUuid(uuid)),
		callback: () => { void openStarshipCrewRosterActorSheet(uuid); }
	}, {
		name: localizeOrFallback("SW5E.StarshipCrewContextDisplayChat", "Display in Chat"),
		icon: '<i class="fa-solid fa-message fa-fw"></i>',
		condition: () => canCurrentUserObserveActor(resolveCrewActorFromUuid(uuid)),
		callback: () => {
			const live = resolveCrewActorFromUuid(uuid);
			if ( !canCurrentUserObserveActor(live) ) return;
			void displayStarshipCrewActorInChat(live);
		}
	}];

	const canToggle = Boolean(row?.querySelector?.('[data-sw5e-crew-command="toggle-active"]:not([disabled])'))
		|| (app?.isEditable !== false && canCurrentUserUpdateStarshipActor(app?.actor));
	if ( canToggle ) {
		const isActive = row?.classList?.contains("sw5e-crew-active");
		options.push({
			name: isActive
				? localizeOrFallback("SW5E.StarshipCrewDeactivate", "Deactivate Crew Member")
				: localizeOrFallback("SW5E.StarshipCrewActivate", "Activate Crew Member"),
			icon: '<i class="fa-solid fa-toggle-on fa-fw"></i>',
			condition: () => app?.isEditable !== false && canCurrentUserUpdateStarshipActor(app?.actor),
			callback: async () => {
				if ( app?.isEditable === false ) {
					warnStarshipActorUpdateDenied();
					return;
				}
				const ok = await toggleStarshipActiveCrew(app?.actor, uuid);
				if ( ok !== true ) warnStarshipActorUpdateDenied();
			},
			group: "state"
		});
	}

	const canRemove = app?.isEditable !== false
		&& canCurrentUserUndeployStarshipCrew(app?.actor, actor ?? uuid);
	if ( canRemove ) {
		options.push({
			name: localizeOrFallback("SW5E.StarshipCrewRemove", "Remove Crew Member"),
			icon: '<i class="fa-solid fa-user-xmark fa-fw"></i>',
			condition: () => app?.isEditable !== false
				&& canCurrentUserUndeployStarshipCrew(app?.actor, resolveCrewActorFromUuid(uuid) ?? uuid),
			callback: async () => {
				if ( app?.isEditable === false
					|| !canCurrentUserUndeployStarshipCrew(app?.actor, resolveCrewActorFromUuid(uuid) ?? uuid) ) {
					warnStarshipActorUpdateDenied();
					return;
				}
				const ok = await undeployStarshipCrew(app.actor, uuid);
				if ( ok !== true ) warnStarshipActorUpdateDenied();
			},
			group: "action"
		});
	}

	if ( sheetEditMode ) {
		const canSetPilot = Boolean(row?.querySelector?.('[data-sw5e-crew-command="set-pilot"]:not([disabled])'));
		const canClearPilot = Boolean(row?.querySelector?.('[data-sw5e-crew-command="undeploy-pilot"]:not([disabled])'));
		if ( canSetPilot ) {
			options.push({
				name: localizeOrFallback("SW5E.StarshipCrewSetPilot", "Set Pilot"),
				icon: '<i class="fa-solid fa-user-check fa-fw"></i>',
				condition: () => isStarshipSheetEditMode(app),
				callback: async () => {
					if ( !isStarshipSheetEditMode(app) ) {
						warnStarshipActorUpdateDenied();
						return;
					}
					const ok = await deployStarshipCrew(app.actor, uuid, "pilot");
					if ( ok !== true ) warnStarshipActorUpdateDenied();
				},
				group: "action"
			});
		}
		if ( canClearPilot ) {
			options.push({
				name: localizeOrFallback("SW5E.StarshipCrewClearPilot", "Clear Pilot"),
				icon: '<i class="fa-solid fa-user-slash fa-fw"></i>',
				condition: () => isStarshipSheetEditMode(app),
				callback: async () => {
					if ( !isStarshipSheetEditMode(app) ) {
						warnStarshipActorUpdateDenied();
						return;
					}
					const ok = await undeployStarshipCrew(app.actor, uuid, ["pilot"]);
					if ( ok !== true ) warnStarshipActorUpdateDenied();
				},
				group: "action"
			});
		}
	}

	ui.context.menuItems = options;
	return canObserve;
}

/**
 * One-install ContextMenu5e for Core crew roster rows (SotG parity lifecycle).
 * @param {HTMLElement} wrapper
 * @param {object} app
 */
export function ensureStarshipCrewRosterContextMenu(wrapper, app) {
	if ( !(wrapper instanceof HTMLElement) || _sw5eCrewRosterContextMenuWrappers.has(wrapper) ) return;
	_sw5eCrewRosterContextMenuWrappers.add(wrapper);

	const ContextMenu5e = getDnd5eContextMenu5e();
	if ( ContextMenu5e ) {
		new ContextMenu5e(wrapper, ".sw5e-starship-crew-row[data-actor-uuid]", [], {
			onOpen: el => prepareStarshipCrewRosterContextMenu(el, app),
			jQuery: false
		});
	} else {
		console.warn("SW5E MODULE | dnd5e ContextMenu5e unavailable (is the dnd5e system loaded?).");
	}
}

/**
 * Client-side filter for Add Crew dialog rows/groups. No document I/O.
 * @param {HTMLElement} root
 * @param {string} query
 */
export function applyAddCrewDialogSearchFilter(root, query) {
	if ( !(root instanceof HTMLElement) ) return;
	const needle = String(query ?? "").trim().toLowerCase();
	let visible = 0;

	for ( const group of root.querySelectorAll(".sw5e-add-crew-group") ) {
		let groupVisible = 0;
		for ( const entry of group.querySelectorAll(".sw5e-add-crew-entry") ) {
			const hay = entry.getAttribute("data-search") ?? "";
			const match = !needle || hay.includes(needle);
			entry.classList.toggle("is-filtered-out", !match);
			if ( match ) groupVisible += 1;
		}
		group.classList.toggle("is-filtered-out", groupVisible === 0);
		visible += groupVisible;
	}

	const empty = root.querySelector(".sw5e-add-crew-search-empty");
	if ( !(empty instanceof HTMLElement) ) return;
	const showEmpty = Boolean(needle) && visible === 0;
	empty.classList.toggle("is-hidden", !showEmpty);
	empty.hidden = !showEmpty;
}

/**
 * @param {object} actorChoice
 * @returns {string}
 */
export function buildAddCrewEntryHtml(actorChoice) {
	const name = String(actorChoice?.name ?? "");
	const searchText = name.trim().toLowerCase();
	const elsewhereClass = actorChoice?.assignedElsewhere ? " sw5e-add-crew-elsewhere" : "";
	const aboardNote = actorChoice?.assignedElsewhere
		? `<span class="sw5e-add-crew-note">${escapeHtml(localizeOrFallback("SW5E.StarshipCrewAboard", "Aboard: {name}").replaceAll("{name}", actorChoice.assignedShipName ?? ""))}</span>`
		: "";
	const pilotLabel = localizeOrFallback("SW5E.StarshipCrewBadgePilot", "Pilot");
	const crewLabel = localizeOrFallback("SW5E.StarshipCrewBadgeCrew", "Crew");
	const passengerLabel = localizeOrFallback("SW5E.StarshipCrewBadgePassenger", "Passenger");
	const pilotDisabled = actorChoice?.canDeployPilot ? "" : " disabled";
	const crewDisabled = actorChoice?.canDeployCrew ? "" : " disabled";
	const passengerDisabled = actorChoice?.canDeployPassenger ? "" : " disabled";
	const uuid = escapeHtml(actorChoice.uuid);
	const safeName = escapeHtml(name);

	return `
		<div class="sw5e-add-crew-entry${elsewhereClass}" data-search="${escapeHtml(searchText)}" data-actor-uuid="${uuid}">
			<input
				type="checkbox"
				class="sw5e-add-crew-select"
				data-actor-uuid="${uuid}"
				aria-label="${safeName}"
			/>
			<img src="${escapeHtml(actorChoice?.img || "icons/svg/mystery-man.svg")}" alt="${safeName}" />
			<div class="sw5e-add-crew-copy">
				<strong>${safeName}</strong>
				${aboardNote}
			</div>
			<div class="sw5e-add-crew-roles">
				<button type="button" data-actor-uuid="${uuid}" data-deploy-role="pilot"${pilotDisabled}>${escapeHtml(pilotLabel)}</button>
				<button type="button" data-actor-uuid="${uuid}" data-deploy-role="crew"${crewDisabled}>${escapeHtml(crewLabel)}</button>
				<button type="button" data-actor-uuid="${uuid}" data-deploy-role="passenger"${passengerDisabled}>${escapeHtml(passengerLabel)}</button>
			</div>
		</div>
	`;
}

/**
 * Distinct checked Actor UUIDs from the Add Crew dialog (selection Set).
 * @param {HTMLElement} root
 * @returns {string[]}
 */
export function collectAddCrewSelectedUuids(root) {
	if ( !(root instanceof HTMLElement) ) return [];
	const uuids = [];
	const seen = new Set();
	for ( const input of root.querySelectorAll("input.sw5e-add-crew-select:checked") ) {
		if ( !(input instanceof HTMLInputElement) ) continue;
		const uuid = input.dataset.actorUuid;
		if ( !uuid || seen.has(uuid) ) continue;
		seen.add(uuid);
		uuids.push(uuid);
	}
	return uuids;
}

/**
 * Enable/disable batch role buttons from current selection size.
 * Pilot enabled only when exactly one Actor is selected.
 * @param {HTMLElement} root
 */
export function syncAddCrewBatchActionState(root) {
	if ( !(root instanceof HTMLElement) ) return;
	const count = collectAddCrewSelectedUuids(root).length;
	const pilotBtn = root.querySelector("[data-sw5e-batch-role=\"pilot\"]");
	const crewBtn = root.querySelector("[data-sw5e-batch-role=\"crew\"]");
	const passengerBtn = root.querySelector("[data-sw5e-batch-role=\"passenger\"]");
	if ( pilotBtn instanceof HTMLButtonElement ) pilotBtn.disabled = count !== 1;
	if ( crewBtn instanceof HTMLButtonElement ) crewBtn.disabled = count < 1;
	if ( passengerBtn instanceof HTMLButtonElement ) passengerBtn.disabled = count < 1;
}

export async function openAddCrewDialog(actor) {
	if ( !canCurrentUserUpdateStarshipActor(actor) ) {
		warnStarshipActorUpdateDenied();
		return;
	}
	const available = buildVehicleAvailableActors(actor);

	if ( !available.length ) {
		ui?.notifications?.info(localizeOrFallback(
			"SW5E.StarshipCrewNoneAvailable",
			"No actors available to add. Create character or NPC actors in the Actors tab first."
		));
		return;
	}

	const characters = available.filter(a => a.type === "character");
	const npcs = available.filter(a => a.type === "npc");
	const others = available.filter(a => a.type !== "character" && a.type !== "npc");

	const charactersHeading = localizeOrFallback("SW5E.StarshipCrewGroupCharacters", "Player Characters");
	const npcsHeading = localizeOrFallback("SW5E.StarshipCrewGroupNpcs", "NPCs");
	const searchPlaceholder = localizeOrFallback("SW5E.StarshipCrewSearchPlaceholder", "Filter crew by name…");
	const searchEmpty = localizeOrFallback("SW5E.StarshipCrewSearchEmpty", "No matching crew found.");
	const pilotLabel = localizeOrFallback("SW5E.StarshipCrewBadgePilot", "Pilot");
	const crewLabel = localizeOrFallback("SW5E.StarshipCrewBadgeCrew", "Crew");
	const passengerLabel = localizeOrFallback("SW5E.StarshipCrewBadgePassenger", "Passenger");

	const groupsHtml = [
		characters.length
			? `<div class="sw5e-add-crew-group" data-crew-group="character">
				<h3 class="sw5e-add-crew-group-heading">${escapeHtml(charactersHeading)}</h3>
				${characters.map(buildAddCrewEntryHtml).join("")}
			</div>`
			: "",
		npcs.length
			? `<div class="sw5e-add-crew-group" data-crew-group="npc">
				<h3 class="sw5e-add-crew-group-heading">${escapeHtml(npcsHeading)}</h3>
				${npcs.map(buildAddCrewEntryHtml).join("")}
			</div>`
			: "",
		others.length
			? `<div class="sw5e-add-crew-group" data-crew-group="other">
				${others.map(buildAddCrewEntryHtml).join("")}
			</div>`
			: ""
	].join("");

	const content = `
		<div class="sw5e-add-crew-dialog">
			<div class="form-group sw5e-add-crew-search-wrap">
				<input
					type="search"
					class="sw5e-add-crew-search"
					name="sw5eAddCrewSearch"
					placeholder="${escapeHtml(searchPlaceholder)}"
					autocomplete="off"
					aria-label="${escapeHtml(searchPlaceholder)}"
				/>
			</div>
			<div class="sw5e-add-crew-list">${groupsHtml}</div>
			<p class="sw5e-add-crew-search-empty is-hidden" hidden>${escapeHtml(searchEmpty)}</p>
			<div class="sw5e-add-crew-batch-actions">
				<button type="button" class="sw5e-add-crew-batch-role" data-sw5e-batch-role="pilot" disabled>${escapeHtml(pilotLabel)}</button>
				<button type="button" class="sw5e-add-crew-batch-role" data-sw5e-batch-role="crew" disabled>${escapeHtml(crewLabel)}</button>
				<button type="button" class="sw5e-add-crew-batch-role" data-sw5e-batch-role="passenger" disabled>${escapeHtml(passengerLabel)}</button>
			</div>
		</div>
	`;

	await foundry.applications.api.DialogV2.wait({
		window: { title: localizeOrFallback("SW5E.StarshipCrewAdd", "Add Crew Member") },
		content,
		buttons: [{
			action: "cancel",
			label: localizeOrFallback("Cancel", "Cancel"),
			icon: "fas fa-times"
		}],
		rejectClose: false,
		render: (_event, dialog) => {
			const root = dialog.element.querySelector(".sw5e-add-crew-dialog") ?? dialog.element;
			const searchInput = root.querySelector("input.sw5e-add-crew-search");
			if ( searchInput instanceof HTMLInputElement ) {
				searchInput.addEventListener("input", () => {
					applyAddCrewDialogSearchFilter(root, searchInput.value);
				});
			}

			const onSelectionChange = () => syncAddCrewBatchActionState(root);
			root.querySelectorAll("input.sw5e-add-crew-select").forEach(input => {
				input.addEventListener("change", onSelectionChange);
			});
			syncAddCrewBatchActionState(root);

			root.querySelectorAll("[data-sw5e-batch-role]").forEach(btn => {
				btn.addEventListener("click", async () => {
					if ( !(btn instanceof HTMLButtonElement) || btn.disabled ) return;
					const role = btn.dataset.sw5eBatchRole;
					const selectedUuids = collectAddCrewSelectedUuids(root);
					if ( !role || !selectedUuids.length ) return;
					if ( role === "pilot" && selectedUuids.length !== 1 ) return;

					root.querySelectorAll("[data-sw5e-batch-role]").forEach(b => {
						if ( b instanceof HTMLButtonElement ) b.disabled = true;
					});
					try {
						const result = await deployStarshipCrewBatch(actor, selectedUuids, role);
						if ( result.ok !== true ) {
							warnStarshipActorUpdateDenied();
							syncAddCrewBatchActionState(root);
							return;
						}
						await dialog.close();
					} catch ( err ) {
						console.error("SW5E MODULE | Failed to batch-add crew members.", err);
						syncAddCrewBatchActionState(root);
					}
				});
			});

			root.querySelectorAll("[data-actor-uuid][data-deploy-role]").forEach(btn => {
				btn.addEventListener("click", async () => {
					const role = btn.dataset.deployRole;
					const crewUuid = btn.dataset.actorUuid;
					if ( !canCurrentUserDeployStarshipCrewRole(actor, crewUuid, role) ) {
						warnStarshipActorUpdateDenied();
						return;
					}
					btn.disabled = true;
					try {
						const ok = await deployStarshipCrew(actor, crewUuid, role);
						if ( ok !== true ) {
							warnStarshipActorUpdateDenied();
							return;
						}
						await dialog.close();
					} catch ( err ) {
						console.error("SW5E MODULE | Failed to add crew member.", err);
					} finally {
						if ( btn.isConnected ) btn.disabled = false;
					}
				});
			});
		}
	});
}

