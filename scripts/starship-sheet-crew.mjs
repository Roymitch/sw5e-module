/**
 * Starship sheet crew UI + role-group context (Phase 6 E1–E3).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 * Live path does not import categorize (getCompendiumPack from ids).
 */

import {
	buildVehicleAvailableActors,
	buildVehicleStarshipCrewContext,
	canCurrentUserDeployStarshipCrewRole,
	deployStarshipCrew,
	deployStarshipCrewBatch
} from "./starship-character.mjs";
import {
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

export function buildAssignedCrewSearchText(record) {
	const parts = [String(record?.name ?? "")];
	if ( record?.isPilot ) parts.push(localizeOrFallback("SW5E.StarshipCrewBadgePilot", "Pilot"));
	if ( record?.active ) parts.push(localizeOrFallback("SW5E.StarshipCrewBadgeActive", "Active"));
	if ( !record?.isPilot && record?.isCrew ) parts.push(localizeOrFallback("SW5E.StarshipCrewBadgeCrew", "Crew"));
	if ( record?.isPassenger ) parts.push(localizeOrFallback("SW5E.StarshipCrewBadgePassenger", "Passenger"));
	return parts.join(" ").trim().toLowerCase();
}

/**
 * Enrich crew template context with precomputed search text. Does not reorder roster.
 * @param {{ roster?: object[] }} crewContext
 * @returns {{ roster: object[] }}
 */
export function enrichCrewContextForSheetSearch(crewContext) {
	const roster = Array.isArray(crewContext?.roster) ? crewContext.roster : [];
	return {
		...crewContext,
		roster: roster.map(record => ({
			...record,
			searchText: buildAssignedCrewSearchText(record)
		}))
	};
}

/**
 * Client-side filter for assigned roster rows. No document I/O.
 * @param {HTMLElement} wrapper
 * @param {string} query
 */
export function applyStarshipAssignedCrewSearchFilter(wrapper, query) {
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
	applyStarshipAssignedCrewSearchFilter(wrapper, stored);

	if ( wrapper.dataset.sw5eAssignedCrewSearchDelegate === "1" ) return;
	wrapper.dataset.sw5eAssignedCrewSearchDelegate = "1";
	wrapper.addEventListener("input", event => {
		const target = event.target;
		if ( !(target instanceof HTMLInputElement) ) return;
		if ( !target.classList.contains("sw5e-starship-crew-assigned-search") ) return;
		if ( app ) app._sw5eAssignedCrewSearchQuery = target.value;
		applyStarshipAssignedCrewSearchFilter(wrapper, target.value);
	});
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

