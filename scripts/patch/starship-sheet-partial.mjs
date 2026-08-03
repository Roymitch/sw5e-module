/**
 * Phase 5 (SS-0001) — app-local section signatures, render-generation, and
 * validation-first partial update framework. Partial updates are the standard
 * path; full rebuild remains the automatic recovery path.
 */

/** Independently owned plan surfaces. */
export const STARSHIP_SECTION = Object.freeze({
	SIDEBAR_VITALS: "sidebarVitals",
	SIDEBAR_SYSTEM_DAMAGE: "sidebarSystemDamage",
	SIDEBAR_DESTRUCTION: "sidebarDestruction",
	SIDEBAR_MOVEMENT: "sidebarMovement",
	SIDEBAR_DAMAGE_REDUCTION: "sidebarDamageReduction",
	SIDEBAR_MAX_FIRES: "sidebarMaxFires",
	CORE_SUMMARY: "coreSummary",
	CORE_SYSTEMS_ROUTING: "coreSystemsRouting",
	CORE_CREW: "coreCrew",
	CORE_SKILLS: "coreSkills",
	CORE_ABILITIES: "coreAbilities",
	CORE_STRUCTURAL_MODE: "coreStructuralMode"
});

/** Ownership marker attribute on stable mounts / Core section roots. */
export const STARSHIP_SECTION_ATTR = "data-sw5e-section";
export const STARSHIP_CORE_RENDER_DECISION = Object.freeze({
	PARTIAL_PRESERVE: "partial-preserve",
	STOCK_REPLACE: "stock-replace",
	NOT_REQUESTED: "not-requested"
});

const STARSHIP_CORE_BASELINE_SECTIONS = Object.freeze([
	STARSHIP_SECTION.CORE_SUMMARY,
	STARSHIP_SECTION.CORE_SYSTEMS_ROUTING,
	STARSHIP_SECTION.CORE_CREW,
	STARSHIP_SECTION.CORE_SKILLS,
	STARSHIP_SECTION.CORE_ABILITIES,
	STARSHIP_SECTION.CORE_STRUCTURAL_MODE
]);

function getStarshipRenderDecisionStore(app, { create = false } = {}) {
	if ( app?._sw5eStarshipRenderDecisions instanceof Map ) return app._sw5eStarshipRenderDecisions;
	if ( !create || !app ) return null;
	app._sw5eStarshipRenderDecisions = new Map();
	return app._sw5eStarshipRenderDecisions;
}

function nextStarshipRenderDecisionId(app) {
	const next = (Number(app?._sw5eStarshipRenderDecisionSeq) || 0) + 1;
	if ( app ) app._sw5eStarshipRenderDecisionSeq = next;
	return `${app?.id ?? "starship-sheet"}:${next}`;
}

export function cloneStarshipRequestedParts(parts) {
	if ( Array.isArray(parts) ) return [...parts];
	return parts ?? null;
}

export function createStarshipRenderDecision(app, options, decision) {
	if ( !app || !options || !decision || typeof decision !== "object" ) return null;
	const store = getStarshipRenderDecisionStore(app, { create: true });
	const decisionId = nextStarshipRenderDecisionId(app);
	const entry = { ...decision, decisionId };
	store.set(decisionId, entry);
	options._sw5eStarshipRenderDecisionId = decisionId;
	return entry;
}

export function getStarshipRenderDecision(app, options = null) {
	const decisionId = options?._sw5eStarshipRenderDecisionId ?? null;
	if ( !decisionId ) return null;
	return getStarshipRenderDecisionStore(app)?.get(decisionId) ?? null;
}

export function clearStarshipRenderDecision(app, options = null) {
	const decisionId = options?._sw5eStarshipRenderDecisionId ?? null;
	if ( !decisionId ) return;
	const store = getStarshipRenderDecisionStore(app);
	store?.delete(decisionId);
	if ( store?.size === 0 && app ) delete app._sw5eStarshipRenderDecisions;
	if ( options && "_sw5eStarshipRenderDecisionId" in options ) delete options._sw5eStarshipRenderDecisionId;
}

/**
 * @param {object} app
 * @param {{ preserveRenderGeneration?: boolean }} [options]
 */
export function clearStarshipSheetPartialState(app, options = {}) {
	if ( !app ) return;
	delete app._sw5eStarshipSectionSigs;
	delete app._sw5eStarshipPartialFailed;
	delete app._sw5eStarshipActorId;
	if ( options.preserveRenderGeneration !== true ) delete app._sw5eStarshipRenderGeneration;
}

/**
 * Bump and return the render generation for this sheet invocation.
 * @param {object} app
 * @returns {number}
 */
export function beginStarshipSheetRender(app) {
	const next = (Number(app?._sw5eStarshipRenderGeneration) || 0) + 1;
	if ( app ) app._sw5eStarshipRenderGeneration = next;
	return next;
}

/**
 * @param {object} app
 * @param {number} renderGen
 * @returns {boolean}
 */
export function isStarshipSheetRenderCurrent(app, renderGen) {
	return app != null && Number(app._sw5eStarshipRenderGeneration) === Number(renderGen);
}

/**
 * @param {object} app
 * @returns {Record<string, string>}
 */
export function getStarshipSectionSignatures(app) {
	if ( !app._sw5eStarshipSectionSigs || typeof app._sw5eStarshipSectionSigs !== "object" ) {
		app._sw5eStarshipSectionSigs = Object.create(null);
	}
	return app._sw5eStarshipSectionSigs;
}

/**
 * @param {object} app
 * @param {string} sectionId
 * @param {string} signature
 */
export function setStarshipSectionSignature(app, sectionId, signature) {
	getStarshipSectionSignatures(app)[sectionId] = signature;
}

/**
 * @param {object} app
 * @param {string} sectionId
 * @returns {string|undefined}
 */
export function getStarshipSectionSignature(app, sectionId) {
	return getStarshipSectionSignatures(app)[sectionId];
}

/**
 * Stable JSON for section signatures (sorted keys; JSON-safe primitives/arrays/objects only).
 * @param {*} value
 * @returns {string}
 */
export function stableSignature(value) {
	return JSON.stringify(sortKeysDeep(value));
}

/**
 * @param {*} value
 * @returns {*}
 */
function sortKeysDeep(value) {
	if ( value === null || typeof value !== "object" ) return value;
	if ( Array.isArray(value) ) return value.map(sortKeysDeep);
	const out = {};
	for ( const key of Object.keys(value).sort() ) out[key] = sortKeysDeep(value[key]);
	return out;
}

/**
 * @param {string|undefined} prior
 * @param {string} next
 * @returns {boolean}
 */
export function sectionSignatureUnchanged(prior, next) {
	return prior != null && prior === next;
}

/**
 * Conservative Actor-identity full-rebuild signal (not part of per-section signatures).
 * @param {object} app
 * @param {Actor} actor
 * @returns {boolean}
 */
export function consumeStarshipActorIdentityChange(app, actor) {
	const id = actor?.id ?? actor?.uuid ?? null;
	const prior = app?._sw5eStarshipActorId ?? null;
	if ( app ) app._sw5eStarshipActorId = id;
	if ( prior == null ) return false;
	return prior !== id;
}

/**
 * @param {object} app
 * @param {Actor} actor
 */
export function rememberStarshipActorIdentity(app, actor) {
	if ( app ) app._sw5eStarshipActorId = actor?.id ?? actor?.uuid ?? null;
}

/**
 * @param {object} app
 * @param {boolean} failed
 */
export function setStarshipPartialFailed(app, failed) {
	if ( app ) app._sw5eStarshipPartialFailed = failed === true;
}

/**
 * @param {object} app
 * @returns {boolean}
 */
export function isStarshipPartialFailed(app) {
	return app?._sw5eStarshipPartialFailed === true;
}

export function hasStarshipCoreBaseline(app) {
	return STARSHIP_CORE_BASELINE_SECTIONS.every(sectionId => getStarshipSectionSignature(app, sectionId) != null);
}

/**
 * Mark a stable mount with ownership id.
 * @param {HTMLElement} el
 * @param {string} sectionId
 */
export function markStarshipSectionElement(el, sectionId) {
	if ( !(el instanceof HTMLElement) ) return;
	el.setAttribute(STARSHIP_SECTION_ATTR, sectionId);
}

/**
 * @param {Iterable<HTMLElement>} els
 * @param {string} sectionId
 */
export function markStarshipSectionElements(els, sectionId) {
	for ( const el of els ?? [] ) markStarshipSectionElement(el, sectionId);
}

/**
 * @param {ParentNode} root
 * @param {string} sectionId
 * @param {string|null} [fallbackSelector]
 * @returns {HTMLElement[]}
 */
export function queryStarshipSectionElements(root, sectionId, fallbackSelector = null) {
	if ( !(root instanceof Element) && !(root instanceof DocumentFragment) ) return [];
	const marked = Array.from(root.querySelectorAll(`[${STARSHIP_SECTION_ATTR}="${CSS.escape(sectionId)}"]`))
		.filter(node => node instanceof HTMLElement);
	if ( marked.length ) {
		if ( !fallbackSelector ) return marked;
		const filtered = marked.filter(node => node.matches(fallbackSelector));
		if ( filtered.length ) return filtered;
	}
	if ( !fallbackSelector ) return [];
	return Array.from(root.querySelectorAll(fallbackSelector)).filter(node => node instanceof HTMLElement);
}

/**
 * Validate one section target set before partial apply.
 * @param {{ root: ParentNode, sectionId: string, fallbackSelector?: string|null, expectedCount?: number, allowUnmarkedFallback?: boolean }} spec
 * @returns {{ ok: boolean, reason?: string, elements: HTMLElement[] }}
 */
export function validateStarshipSectionTarget(spec) {
	const expected = spec.expectedCount ?? 1;
	const elements = queryStarshipSectionElements(spec.root, spec.sectionId, spec.fallbackSelector ?? null);
	if ( expected === 0 ) {
		return elements.length === 0
			? { ok: true, elements }
			: { ok: false, reason: "unexpected-presence", elements };
	}
	if ( elements.length === 0 ) return { ok: false, reason: "missing", elements };
	if ( elements.length !== expected ) return { ok: false, reason: "duplicated", elements };
	if ( spec.allowUnmarkedFallback === true ) return { ok: true, elements };
	const hasOwnership = elements.every(el => el.getAttribute(STARSHIP_SECTION_ATTR) === spec.sectionId);
	return hasOwnership
		? { ok: true, elements }
		: { ok: false, reason: "ownership", elements };
}

/**
 * @param {object} app
 * @param {Actor} actor
 * @param {{ hasCoreWrapper: boolean, structuralModeChanged?: boolean, summaryChanged?: boolean }} opts
 * @returns {{ allowPartial: boolean, reason: string }}
 */
export function evaluateStarshipPartialGate(app, actor, opts = {}) {
	if ( isStarshipPartialFailed(app) ) {
		return { allowPartial: false, reason: "prior-partial-failure" };
	}
	if ( consumeStarshipActorIdentityChange(app, actor) ) {
		clearStarshipSheetPartialState(app, { preserveRenderGeneration: true });
		rememberStarshipActorIdentity(app, actor);
		return { allowPartial: false, reason: "actor-identity-changed" };
	}
	if ( !opts.hasCoreWrapper ) {
		return { allowPartial: false, reason: "first-mount" };
	}
	if ( opts.structuralModeChanged ) {
		return { allowPartial: false, reason: "structural-mode-changed" };
	}
	if ( opts.summaryChanged ) {
		return { allowPartial: false, reason: "summary-changed" };
	}
	return { allowPartial: true, reason: "ok" };
}

export function evaluateStarshipCorePreRenderEligibility(app, actor, opts = {}) {
	if ( !opts.coreRequested ) {
		return { coreDecision: STARSHIP_CORE_RENDER_DECISION.NOT_REQUESTED, reason: "not-requested" };
	}
	if ( opts.isFirstRender ) {
		return { coreDecision: STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE, reason: "first-mount" };
	}
	if ( !opts.hasCoreWrapper ) {
		return { coreDecision: STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE, reason: "missing-or-malformed-core-root" };
	}
	if ( opts.malformedCoreRoot ) {
		return { coreDecision: STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE, reason: "missing-or-malformed-core-root" };
	}
	if ( !opts.hasPriorBaseline ) {
		return { coreDecision: STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE, reason: "no-usable-prior-baseline" };
	}
	if ( isStarshipPartialFailed(app) ) {
		return { coreDecision: STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE, reason: "prior-partial-failure" };
	}
	if ( consumeStarshipActorIdentityChange(app, actor) ) {
		clearStarshipSheetPartialState(app, { preserveRenderGeneration: true });
		rememberStarshipActorIdentity(app, actor);
		return { coreDecision: STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE, reason: "actor-identity-changed" };
	}
	if ( opts.structuralModeChanged ) {
		return { coreDecision: STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE, reason: "structural-mode-changed" };
	}
	if ( opts.summaryChanged ) {
		return { coreDecision: STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE, reason: "summary-changed" };
	}
	return { coreDecision: STARSHIP_CORE_RENDER_DECISION.PARTIAL_PRESERVE, reason: "eligible" };
}

/**
 * @param {object} app
 * @param {string} sectionId
 * @param {*} signaturePayload
 * @returns {{ dirty: boolean, signature: string }}
 */
export function compareStarshipSectionSignature(app, sectionId, signaturePayload) {
	const signature = stableSignature(signaturePayload);
	const prior = getStarshipSectionSignature(app, sectionId);
	return {
		dirty: !sectionSignatureUnchanged(prior, signature),
		signature
	};
}

/**
 * Subtree replacement inside a stable mount (honest: not an in-place element update).
 * @param {HTMLElement} mount
 * @param {string} html
 */
export function replaceStarshipSectionSubtree(mount, html) {
	mount.innerHTML = html;
}

/**
 * Replace a Core section root with a newly rendered element (preserves siblings).
 * @param {HTMLElement} existing
 * @param {HTMLElement} next
 * @param {string} sectionId
 */
export function replaceStarshipSectionRoot(existing, next, sectionId) {
	markStarshipSectionElement(next, sectionId);
	existing.replaceWith(next);
}

/**
 * Signature payloads (documented in the Phase 5 session note and plan).
 */
export function signaturePayloadSidebarVitals(ctx) {
	return {
		sheetEditMode: Boolean(ctx?.sheetEditMode),
		labels: {
			hullPoints: ctx?.labels?.hullPoints ?? "",
			shieldPoints: ctx?.labels?.shieldPoints ?? "",
			hullDice: ctx?.labels?.hullDice ?? "",
			shieldDice: ctx?.labels?.shieldDice ?? "",
			configureHullPoints: ctx?.labels?.configureHullPoints ?? "",
			configureShieldPoints: ctx?.labels?.configureShieldPoints ?? "",
			configureHullDice: ctx?.labels?.configureHullDice ?? "",
			configureShieldDice: ctx?.labels?.configureShieldDice ?? ""
		},
		vitals: {
			hull: {
				value: ctx?.vitals?.hull?.value ?? null,
				max: ctx?.vitals?.hull?.max ?? null,
				pct: ctx?.vitals?.hull?.pct ?? null
			},
			shield: {
				value: ctx?.vitals?.shield?.value ?? null,
				max: ctx?.vitals?.shield?.max ?? null,
				pct: ctx?.vitals?.shield?.pct ?? null
			},
			hullDice: {
				current: ctx?.vitals?.hullDice?.current ?? null,
				max: ctx?.vitals?.hullDice?.max ?? null,
				die: ctx?.vitals?.hullDice?.die ?? "",
				pct: ctx?.vitals?.hullDice?.pct ?? null
			},
			shieldDice: {
				current: ctx?.vitals?.shieldDice?.current ?? null,
				max: ctx?.vitals?.shieldDice?.max ?? null,
				die: ctx?.vitals?.shieldDice?.die ?? "",
				pct: ctx?.vitals?.shieldDice?.pct ?? null
			}
		}
	};
}

export function signaturePayloadSidebarSystemDamage(ctx) {
	return {
		editable: Boolean(ctx?.editable),
		panelAria: ctx?.panelAria ?? "",
		catastrophic: Boolean(ctx?.catastrophic),
		pips: (ctx?.pips ?? []).map(pip => ({
			n: pip?.n ?? null,
			filled: Boolean(pip?.filled),
			classes: pip?.classes ?? "",
			tooltip: pip?.tooltip ?? "",
			label: pip?.label ?? ""
		}))
	};
}

export function signaturePayloadSidebarDestruction(ctx) {
	return {
		open: Boolean(ctx?.open),
		editMode: Boolean(ctx?.editMode),
		editable: Boolean(ctx?.editable),
		canRoll: Boolean(ctx?.canRoll),
		panelAria: ctx?.panelAria ?? "",
		successTrayPips: (ctx?.successTrayPips ?? []).map(pip => ({ filled: Boolean(pip?.filled) })),
		failureTrayPips: (ctx?.failureTrayPips ?? []).map(pip => ({ filled: Boolean(pip?.filled) })),
		rollLabel: ctx?.rollLabel ?? "",
		rollTooltip: ctx?.rollTooltip ?? "",
		rollUnavailableTooltip: ctx?.rollUnavailableTooltip ?? "",
		resetLabel: ctx?.resetLabel ?? "",
		resetTooltip: ctx?.resetTooltip ?? "",
		toggleTooltipKey: ctx?.toggleTooltipKey ?? "",
		toggleTooltip: ctx?.toggleTooltip ?? ""
	};
}

export function signaturePayloadSidebarMovement(ctx) {
	return {
		movementAriaLabel: ctx?.movementAriaLabel ?? "",
		spaceSpeedLabel: ctx?.spaceSpeedLabel ?? "",
		spaceSpeedDisplay: ctx?.spaceSpeedDisplay ?? "",
		turningSpeedLabel: ctx?.turningSpeedLabel ?? "",
		turningSpeedDisplay: ctx?.turningSpeedDisplay ?? "",
		travelSpeedLabel: ctx?.travelSpeedLabel ?? "",
		travelSpeedDisplay: ctx?.travelSpeedDisplay ?? "",
		travelPaceLabel: ctx?.travelPaceLabel ?? "",
		travelPaceDisplay: ctx?.travelPaceDisplay ?? "",
		showMovementCounters: Boolean(ctx?.showMovementCounters),
		showMovementConfig: Boolean(ctx?.showMovementConfig),
		movementConfigLabel: ctx?.movementConfigLabel ?? ""
	};
}

export function signaturePayloadSidebarDamageReduction(ctx) {
	return {
		sheetEditMode: Boolean(ctx?.sheetEditMode),
		editable: Boolean(ctx?.editable),
		showInPlay: Boolean(ctx?.showInPlay),
		label: ctx?.label ?? "",
		value: ctx?.value ?? null,
		ariaLabel: ctx?.ariaLabel ?? "",
		inputValue: ctx?.inputValue ?? "",
		placeholder: ctx?.placeholder ?? ""
	};
}

export function signaturePayloadSidebarMaxFires(ctx) {
	return {
		show: Boolean(ctx?.show),
		label: ctx?.label ?? "",
		value: ctx?.value ?? null,
		ariaLabel: ctx?.ariaLabel ?? ""
	};
}

export function signaturePayloadCoreSummary(meta = {}) {
	return {
		actorName: meta.actorName ?? "",
		actorImage: meta.actorImage ?? "",
		title: meta.title ?? "",
		subtitle: meta.subtitle ?? "",
		headerBadges: meta.headerBadges ?? null,
		summaryStrip: meta.summaryStrip ?? null,
		legacyNotes: meta.legacyNotes ?? null,
		overviewLandingKicker: meta.overviewLandingKicker ?? "",
		overviewLandingTitle: meta.overviewLandingTitle ?? "",
		overviewLandingLede: meta.overviewLandingLede ?? ""
	};
}

export function signaturePayloadCoreSystemsRouting(meta = {}) {
	const systemsCore = meta.systemsCore ?? {};
	const advancedPower = systemsCore.advancedPower ?? {};
	return {
		showPowerRouting: Boolean(meta.showPowerRouting),
		systemsSetupEditable: Boolean(meta.systemsSetupEditable),
		systemsRoutingEditable: Boolean(meta.systemsRoutingEditable),
		systemsCore: {
			labels: {
				powerRouting: systemsCore.labels?.powerRouting ?? "",
				fuel: systemsCore.labels?.fuel ?? "",
				fuelCapacity: systemsCore.labels?.fuelCapacity ?? "",
				burnFuel: systemsCore.labels?.burnFuel ?? "",
				burnFuelTooltip: systemsCore.labels?.burnFuelTooltip ?? "",
				refuel: systemsCore.labels?.refuel ?? "",
				refuelTooltip: systemsCore.labels?.refuelTooltip ?? "",
				fuelCurrent: systemsCore.labels?.fuelCurrent ?? "",
				fuelCap: systemsCore.labels?.fuelCap ?? "",
				fuelCost: systemsCore.labels?.fuelCost ?? ""
			},
			routingOptions: (systemsCore.routingOptions ?? []).map(option => ({
				value: option?.value ?? "",
				label: option?.label ?? "",
				tooltip: option?.tooltip ?? "",
				selected: Boolean(option?.selected)
			})),
			coreCollapse: {
				routing: Boolean(systemsCore.coreCollapse?.routing),
				fuel: Boolean(systemsCore.coreCollapse?.fuel)
			},
			coreCollapseLabels: {
				routing: {
					expand: systemsCore.coreCollapseLabels?.routing?.expand ?? "",
					collapse: systemsCore.coreCollapseLabels?.routing?.collapse ?? ""
				},
				fuel: {
					expand: systemsCore.coreCollapseLabels?.fuel?.expand ?? "",
					collapse: systemsCore.coreCollapseLabels?.fuel?.collapse ?? ""
				}
			},
			fuelPct: systemsCore.fuelPct ?? null,
			fuelBarLabel: systemsCore.fuelBarLabel ?? "",
			fuelValue: systemsCore.fuelValue ?? null,
			fuelCap: systemsCore.fuelCap ?? null,
			fuelCost: systemsCore.fuelCost ?? null,
			fuelReplenishCostMode: {
				mode: systemsCore.fuelReplenishCostMode?.mode ?? "perRestock",
				modeLabel: systemsCore.fuelReplenishCostMode?.modeLabel ?? "",
				configEditable: Boolean(systemsCore.fuelReplenishCostMode?.configEditable),
				configureLabel: systemsCore.fuelReplenishCostMode?.configureLabel ?? ""
			},
			food: {
				value: systemsCore.food?.value ?? 0,
				rawBase: systemsCore.food?.rawBase ?? 0,
				customBase: systemsCore.food?.customBase ?? 0,
				selectedBase: systemsCore.food?.selectedBase ?? 0,
				sourceModifier: systemsCore.food?.sourceModifier ?? 0,
				preparedModifier: systemsCore.food?.preparedModifier ?? 0,
				effectiveCapacity: systemsCore.food?.effectiveCapacity ?? 0,
				effectiveUnavailable: Boolean(systemsCore.food?.effectiveUnavailable),
				cost: systemsCore.food?.cost ?? 0,
				overrideActive: Boolean(systemsCore.food?.overrideActive),
				capBaseEditable: Boolean(systemsCore.food?.capBaseEditable),
				outsideRaw: Boolean(systemsCore.food?.outsideRaw),
				pct: systemsCore.food?.pct ?? 0,
				barLabel: systemsCore.food?.barLabel ?? "",
				replenishCostMode: {
					mode: systemsCore.food?.replenishCostMode?.mode ?? "perRestock",
					modeLabel: systemsCore.food?.replenishCostMode?.modeLabel ?? "",
					configEditable: Boolean(systemsCore.food?.replenishCostMode?.configEditable),
					configureLabel: systemsCore.food?.replenishCostMode?.configureLabel ?? ""
				}
			},
			labels: {
				fuel: systemsCore.labels?.fuel ?? "",
				fuelAndSupplies: systemsCore.labels?.fuelAndSupplies ?? "",
				shipsStores: systemsCore.labels?.shipsStores ?? "",
				shipsStoresConfigure: systemsCore.labels?.shipsStoresConfigure ?? "",
				food: systemsCore.labels?.food ?? ""
			},
			advancedPower: {
				collapsed: Boolean(advancedPower.collapsed),
				panelAria: advancedPower.panelAria ?? "",
				title: advancedPower.title ?? "",
				expandTooltip: advancedPower.expandTooltip ?? "",
				collapseTooltip: advancedPower.collapseTooltip ?? "",
				dieLabel: advancedPower.dieLabel ?? "",
				dieOptions: (advancedPower.dieOptions ?? []).map(option => ({
					value: option?.value ?? "",
					selected: Boolean(option?.selected)
				})),
				dieDisplay: advancedPower.dieDisplay ?? "",
				canRecover: Boolean(advancedPower.canRecover),
				recoverLabel: advancedPower.recoverLabel ?? "",
				recoverTooltip: advancedPower.recoverTooltip ?? "",
				currentLabel: advancedPower.currentLabel ?? "",
				maxLabel: advancedPower.maxLabel ?? "",
				spendLabel: advancedPower.spendLabel ?? "",
				spendTooltip: advancedPower.spendTooltip ?? "",
				slots: (advancedPower.slots ?? []).map(slot => ({
					key: slot?.key ?? "",
					label: slot?.label ?? "",
					isCentral: Boolean(slot?.isCentral),
					value: slot?.value ?? null,
					storedMax: slot?.storedMax ?? null,
					maxDisplayDiffers: Boolean(slot?.maxDisplayDiffers),
					maxDisplayHint: slot?.maxDisplayHint ?? "",
					displayValue: slot?.displayValue ?? null,
					displayMax: slot?.displayMax ?? null,
					pct: slot?.pct ?? 0,
					canSpend: Boolean(slot?.canSpend)
				}))
			}
		}
	};
}

export function signaturePayloadCoreCrew(meta = {}) {
	return {
		crewManageEditable: Boolean(meta.crewManageEditable),
		crewRolesKicker: meta.crewRolesKicker ?? "",
		sotgSheetEditMode: Boolean(meta.sotgSheetEditMode),
		systemsCore: {
			coreCollapse: {
				crew: Boolean(meta.systemsCore?.coreCollapse?.crew)
			},
			coreCollapseLabels: {
				crew: {
					expand: meta.systemsCore?.coreCollapseLabels?.crew?.expand ?? "",
					collapse: meta.systemsCore?.coreCollapseLabels?.crew?.collapse ?? ""
				}
			}
		},
		crew: {
			roster: (meta.crew?.roster ?? []).map(entry => ({
				uuid: entry?.uuid ?? "",
				membershipId: entry?.membershipId ?? "",
				kind: entry?.kind ?? "individual",
				quantity: entry?.quantity ?? 1,
				name: entry?.name ?? "",
				img: entry?.img ?? "",
				searchText: entry?.searchText ?? "",
				assignmentSubtitle: entry?.assignmentSubtitle ?? "",
				customRole: entry?.customRole ?? "",
				membershipHidden: Boolean(entry?.membershipHidden),
				active: Boolean(entry?.active),
				isPilot: Boolean(entry?.isPilot),
				isCrew: Boolean(entry?.isCrew),
				isPassenger: Boolean(entry?.isPassenger),
				canUndeployPilot: Boolean(entry?.canUndeployPilot),
				canSetPilot: Boolean(entry?.canSetPilot),
				canToggleActive: Boolean(entry?.canToggleActive),
				canRemove: Boolean(entry?.canRemove),
				canAdjustQuantity: Boolean(entry?.canAdjustQuantity),
				canQuantityIncrement: Boolean(entry?.canQuantityIncrement),
				canQuantityDecrement: Boolean(entry?.canQuantityDecrement)
			})),
			visibleQuantitySum: meta.crew?.visibleQuantitySum ?? null
		},
		crewRoleGroups: (meta.crewRoleGroups ?? []).map(group => ({
			groupKey: group?.groupKey ?? "",
			label: group?.label ?? "",
			count: group?.count ?? null,
			supportsSheetNavigation: Boolean(group?.supportsSheetNavigation),
			firstItemId: group?.firstItemId ?? "",
			manageLabel: group?.manageLabel ?? "",
			collapsed: Boolean(group?.collapsed),
			expandLabel: group?.expandLabel ?? "",
			collapseLabel: group?.collapseLabel ?? "",
			items: (group?.items ?? []).map(item => ({
				id: item?.id ?? "",
				name: item?.name ?? "",
				img: item?.img ?? "",
				meta: item?.meta ?? "",
				priceLabel: item?.priceLabel ?? "",
				weightLabel: item?.weightLabel ?? "",
				defaultTab: item?.defaultTab ?? "",
				allowDelete: Boolean(item?.allowDelete),
				sourceActorUuid: item?.sourceActorUuid ?? "",
				sotgPanel: item?.sotgPanel ?? ""
			}))
		}))
	};
}

export function signaturePayloadCoreSkills(meta = {}) {
	return {
		editable: Boolean(meta.editable),
		overviewSkillsAriaLabel: meta.overviewSkillsAriaLabel ?? "",
		overviewSkillsKicker: meta.overviewSkillsKicker ?? "",
		overviewSkillConfigureTitle: meta.overviewSkillConfigureTitle ?? "",
		skillsCrewPbAttribution: meta.skillsCrewPbAttribution ?? "",
		skills: (meta.skills ?? []).map(skill => ({
			id: skill?.id ?? "",
			label: skill?.label ?? "",
			abilityAbbr: skill?.abilityAbbr ?? "",
			icon: skill?.icon ?? "",
			modDisplay: skill?.modDisplay ?? "",
			passiveDisplay: skill?.passiveDisplay ?? "",
			proficiencyClass: skill?.proficiencyClass ?? "",
			crewPbAttributionLabel: skill?.crewPbAttributionLabel ?? ""
		}))
	};
}

export function signaturePayloadCoreAbilities(meta = {}) {
	return {
		sotgSheetEditMode: Boolean(meta.sotgSheetEditMode),
		overviewAbilitiesAriaLabel: meta.overviewAbilitiesAriaLabel ?? "",
		overviewAbilities: (meta.overviewAbilities ?? []).map(ability => ({
			key: ability?.key ?? "",
			label: ability?.label ?? "",
			abilityIcon: ability?.abilityIcon ?? "",
			abbrLower: ability?.abbrLower ?? "",
			configureLabel: ability?.configureLabel ?? "",
			inputName: ability?.inputName ?? "",
			sourceValue: ability?.sourceValue ?? null,
			value: ability?.value ?? null,
			modSign: ability?.modSign ?? "",
			modAbs: ability?.modAbs ?? null,
			save: ability?.save ?? null,
			hover: ability?.hover ?? "",
			proficient: ability?.proficient ?? null,
			proficientName: ability?.proficientName ?? "",
			saveRollTooltip: ability?.saveRollTooltip ?? ""
		}))
	};
}

export function signaturePayloadCoreStructuralMode(meta = {}) {
	return {
		sotgSheetEditMode: Boolean(meta.sotgSheetEditMode),
		editable: meta.actorEditable !== false,
		showPowerRouting: Boolean(meta.showPowerRouting),
		overviewAbilitiesPresent: Boolean(meta.overviewAbilitiesPresent),
		crewPanelPresent: Boolean(meta.crewPanelPresent)
	};
}

/**
 * Record baseline signatures after the full Core path wins.
 * @param {object} app
 * @param {Actor} actor
 * @param {object} meta
 */
export function recordStarshipCoreBaseline(app, actor, meta) {
	setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_SUMMARY, stableSignature(signaturePayloadCoreSummary(meta)));
	setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_SYSTEMS_ROUTING, stableSignature(signaturePayloadCoreSystemsRouting(meta)));
	setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_CREW, stableSignature(signaturePayloadCoreCrew(meta)));
	setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_SKILLS, stableSignature(signaturePayloadCoreSkills(meta)));
	setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_ABILITIES, stableSignature(signaturePayloadCoreAbilities(meta)));
	setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_STRUCTURAL_MODE, stableSignature(signaturePayloadCoreStructuralMode(meta)));
	rememberStarshipActorIdentity(app, actor);
}

function buildStarshipCorePartialAttempt(status, reason, details = undefined) {
	const attempt = { status, reason };
	if ( details && Object.keys(details).length ) attempt.details = details;
	return attempt;
}

/**
 * Apply Core subsection replacements from a freshly rendered layer HTML string.
 * The full wrapper identity is preserved; invalid or unsupported plans fall back.
 *
 * @param {HTMLElement} existingWrapper  `.sw5e-starship-tab` Core wrapper
 * @param {string} renderedHtml
 * @param {object} app
 * @param {number} renderGen
 * @param {object} meta
 * @returns {Promise<"applied"|"skipped"|"fallback">}
 */
export async function tryApplyStarshipCorePartialUpdates(existingWrapper, renderedHtml, app, renderGen, meta, options = {}) {
	if ( !(existingWrapper instanceof HTMLElement) ) {
		return buildStarshipCorePartialAttempt("fallback", "missing-target", {
			target: "existingWrapper"
		});
	}
	if ( options.expectedCoreRoot && existingWrapper !== options.expectedCoreRoot ) {
		return buildStarshipCorePartialAttempt("fallback", "root-identity-mismatch", {
			target: "existingWrapper"
		});
	}
	if ( !isStarshipSheetRenderCurrent(app, renderGen) ) {
		return buildStarshipCorePartialAttempt("skipped", "stale-generation");
	}

	const temp = document.createElement("div");
	temp.innerHTML = renderedHtml;
	const nextPanel = temp.querySelector(".sw5e-starship-panel");
	if ( !(nextPanel instanceof HTMLElement) ) {
		return buildStarshipCorePartialAttempt("fallback", "no-patchable-section", {
			target: ".sw5e-starship-panel"
		});
	}

	const structural = compareStarshipSectionSignature(app, STARSHIP_SECTION.CORE_STRUCTURAL_MODE, signaturePayloadCoreStructuralMode(meta));
	if ( structural.dirty ) {
		return buildStarshipCorePartialAttempt("fallback", "structural-mismatch", {
			section: STARSHIP_SECTION.CORE_STRUCTURAL_MODE
		});
	}

	const summary = compareStarshipSectionSignature(app, STARSHIP_SECTION.CORE_SUMMARY, signaturePayloadCoreSummary(meta));
	if ( summary.dirty ) {
		return buildStarshipCorePartialAttempt("fallback", "unsupported-dirty-section", {
			section: STARSHIP_SECTION.CORE_SUMMARY
		});
	}

	const abilitiesSig = compareStarshipSectionSignature(app, STARSHIP_SECTION.CORE_ABILITIES, signaturePayloadCoreAbilities(meta));
	const skillsSig = compareStarshipSectionSignature(app, STARSHIP_SECTION.CORE_SKILLS, signaturePayloadCoreSkills(meta));
	const crewSig = compareStarshipSectionSignature(app, STARSHIP_SECTION.CORE_CREW, signaturePayloadCoreCrew(meta));
	const systemsSig = compareStarshipSectionSignature(app, STARSHIP_SECTION.CORE_SYSTEMS_ROUTING, signaturePayloadCoreSystemsRouting(meta));

	const hasAbilities = Boolean(meta.overviewAbilitiesPresent);
	const hasSkills = Array.isArray(meta.skills) && meta.skills.length > 0;
	const hasCrew = Boolean(meta.crewPanelPresent);
	const wantsRouting = Boolean(meta.showPowerRouting);

	const sectionRoots = [
		{
			id: STARSHIP_SECTION.CORE_ABILITIES,
			signature: abilitiesSig.signature,
			dirty: abilitiesSig.dirty,
			selector: ".sw5e-starship-overview-abilities-row",
			expectedCount: hasAbilities ? 1 : 0
		},
		{
			id: STARSHIP_SECTION.CORE_SKILLS,
			signature: skillsSig.signature,
			dirty: skillsSig.dirty,
			selector: "section.sw5e-starship-overview-skills",
			expectedCount: hasSkills ? 1 : 0
		},
		{
			id: STARSHIP_SECTION.CORE_CREW,
			signature: crewSig.signature,
			dirty: crewSig.dirty,
			selector: 'section.sw5e-starship-crew-panel[data-sw5e-core-panel="crew"]',
			expectedCount: hasCrew ? 1 : 0
		},
		{
			id: STARSHIP_SECTION.CORE_SYSTEMS_ROUTING,
			signature: systemsSig.signature,
			dirty: systemsSig.dirty,
			selector: "section.sw5e-starship-core-routing-panel",
			expectedCount: wantsRouting ? 1 : 0
		},
		{
			id: STARSHIP_SECTION.CORE_SYSTEMS_ROUTING,
			signature: systemsSig.signature,
			dirty: systemsSig.dirty,
			selector: 'section.sw5e-starship-core-advanced-power-panel[data-sw5e-core-panel="advancedPower"]',
			expectedCount: 1
		},
		{
			id: STARSHIP_SECTION.CORE_SYSTEMS_ROUTING,
			signature: systemsSig.signature,
			dirty: systemsSig.dirty,
			selector: 'section.sw5e-starship-core-fuel-panel[data-sw5e-core-panel="fuel"]',
			expectedCount: 1
		}
	];

	/** @type {{ id: string, signature: string, existing: HTMLElement, next: HTMLElement }[]} */
	const plan = [];

	for ( const spec of sectionRoots ) {
		const existingCheck = validateStarshipSectionTarget({
			root: existingWrapper,
			sectionId: spec.id,
			fallbackSelector: spec.selector,
			expectedCount: spec.expectedCount
		});
		const nextNodes = Array.from(temp.querySelectorAll(spec.selector)).filter(node => node instanceof HTMLElement);
		if ( spec.expectedCount === 0 ) {
			if ( !existingCheck.ok ) {
				return buildStarshipCorePartialAttempt("fallback", "validation-failure", {
					section: spec.id,
					selector: spec.selector,
					expectedCount: spec.expectedCount,
					actualCount: existingCheck.elements.length,
					validationReason: existingCheck.reason ?? "unknown"
				});
			}
			if ( nextNodes.length !== 0 ) {
				return buildStarshipCorePartialAttempt("fallback", "unexpected-presence", {
					section: spec.id,
					selector: spec.selector,
					expectedCount: spec.expectedCount,
					actualCount: nextNodes.length
				});
			}
			continue;
		}
		if ( nextNodes.length !== spec.expectedCount ) {
			return buildStarshipCorePartialAttempt(
				"fallback",
				nextNodes.length === 0 ? "missing-target" : "duplicate-target",
				{
					target: "next",
					section: spec.id,
					selector: spec.selector,
					expectedCount: spec.expectedCount,
					actualCount: nextNodes.length
				}
			);
		}
		if ( !existingCheck.ok ) {
			const validationReason = existingCheck.reason ?? "unknown";
			return buildStarshipCorePartialAttempt(
				"fallback",
				validationReason === "missing"
					? "missing-target"
					: validationReason === "duplicated"
						? "duplicate-target"
						: "validation-failure",
				{
					target: "existing",
					section: spec.id,
					selector: spec.selector,
					expectedCount: spec.expectedCount,
					actualCount: existingCheck.elements.length,
					validationReason
				}
			);
		}
		if ( !spec.dirty ) continue;
		for ( let i = 0; i < spec.expectedCount; i += 1 ) {
			plan.push({
				id: spec.id,
				signature: spec.signature,
				existing: existingCheck.elements[i],
				next: nextNodes[i]
			});
		}
	}

	if ( !isStarshipSheetRenderCurrent(app, renderGen) ) {
		return buildStarshipCorePartialAttempt("skipped", "stale-generation");
	}

	try {
		for ( const item of plan ) replaceStarshipSectionRoot(item.existing, item.next, item.id);
		setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_SUMMARY, summary.signature);
		setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_SYSTEMS_ROUTING, systemsSig.signature);
		setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_CREW, crewSig.signature);
		setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_SKILLS, skillsSig.signature);
		setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_ABILITIES, abilitiesSig.signature);
		setStarshipSectionSignature(app, STARSHIP_SECTION.CORE_STRUCTURAL_MODE, structural.signature);
		rememberStarshipActorIdentity(app, app?.actor ?? null);
		setStarshipPartialFailed(app, false);
		return buildStarshipCorePartialAttempt("applied", plan.length ? "patched" : "no-dirty-sections", {
			dirtySections: [...new Set(plan.map(item => item.id))]
		});
	} catch ( err ) {
		console.error("SW5E MODULE | Starship Core partial update failed.", err);
		setStarshipPartialFailed(app, true);
		return buildStarshipCorePartialAttempt("fallback", "exception-during-patch", {
			message: err?.message ?? String(err ?? "Unknown error")
		});
	}
}
