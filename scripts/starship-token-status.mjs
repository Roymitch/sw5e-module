import { getModuleId } from "./module-support.mjs";
import { isSw5eStarshipActor } from "./patch/starship-movement.mjs";
import {
	getStarshipExplicitSlowedLevel,
	getStarshipUsedFlag,
	isStarshipConditionActive,
	resolveStarshipExplicitSlowedLevelClick,
	setStarshipExplicitSlowedLevel,
	setStarshipUsedFlag,
	STARSHIP_CONDITION_IDS,
	STARSHIP_SLOWED_HUD_STATUS_IDS,
	STARSHIP_SYNCED_TOKEN_STATUS_IDS,
	STARSHIP_SYSTEM_DAMAGE_STATUS_ID,
	STARSHIP_USED_CONDITION_ID
} from "./starship-conditions.mjs";
import { getStarshipSystemDamageLevel } from "./starship-system-damage.mjs";

const STARSHIP_STATUS_SYNC_FLAG = "starshipStatusSync";
const STARSHIP_STATUS_SYNC_ORIGIN_SOCKET_OPTION = "sw5eStarshipStatusSyncOriginSocketId";

/** Per-actor in-memory queue state for the origin socket only. */
const syncingActors = new Map();

let starshipStatusSyncHooksRegistered = false;
let starshipStatusSyncRequestCounter = 0;
let starshipStatusSyncPassCounter = 0;
let starshipStatusSyncDiagCounter = 0;

/** Fresh mutable options for each Foundry embedded-document operation (Foundry mutates options in place). */
function getStarshipStatusSyncOptions(extra = {}) {
	return { ...extra, sw5eSkipStarshipStatusIconSync: true };
}

/** Stable embedded ActiveEffect _ids for display-only synced token statuses (avoid staticID truncation). */
const STARSHIP_SYNCED_STATUS_EFFECT_IDS = Object.freeze({
	[STARSHIP_USED_CONDITION_ID]: "sw5eSyncU0000001",
	[STARSHIP_SYSTEM_DAMAGE_STATUS_ID]: "sw5eSyncSD000001",
	starshipSlowed1: "sw5eSyncS1000001",
	starshipSlowed2: "sw5eSyncS2000001",
	starshipSlowed3: "sw5eSyncS3000001",
	starshipSlowed4: "sw5eSyncS4000001"
});

const STARSHIP_SYNCED_STATUS_DESCRIPTORS = Object.freeze(
	STARSHIP_SYNCED_TOKEN_STATUS_IDS.map(statusId => Object.freeze({
		statusId,
		effectId: STARSHIP_SYNCED_STATUS_EFFECT_IDS[statusId] ?? null
	}))
);

/** Legacy truncated id shared by all starshipSlowed1–4 under dnd5e.utils.staticID. */
const LEGACY_COLLIDED_SLOWED_SYNC_EFFECT_ID = "dnd5estarshipSlo";

function getStaticID(key) {
	const fn = globalThis.dnd5e?.utils?.staticID ?? foundry.utils.staticID;
	return fn(key);
}

/**
 * Stable embedded ActiveEffect _id for a synced Starship token status.
 * @param {string} statusId
 * @returns {string|null}
 */
export function getStarshipSyncedStatusEffectId(statusId) {
	return STARSHIP_SYNCED_STATUS_EFFECT_IDS[statusId] ?? null;
}

function getLegacySyncedStatusEffectIds() {
	const legacy = new Set([LEGACY_COLLIDED_SLOWED_SYNC_EFFECT_ID]);
	for ( const statusId of STARSHIP_SYNCED_TOKEN_STATUS_IDS ) {
		legacy.add(getStaticID(`dnd5e${statusId}`));
	}
	return legacy;
}

function getEffectStatusIds(effect) {
	const statuses = effect?.statuses;
	if ( !statuses ) return [];
	if ( statuses instanceof Set ) return [...statuses];
	return Array.isArray(statuses) ? statuses : [];
}

function getStarshipStatusSyncActorKey(actor) {
	return actor?.uuid ?? actor?.id ?? null;
}

function getCurrentEffectsById(actor) {
	return new Map((actor.effects ?? []).map(effect => [effect.id, effect]));
}

function getCurrentStarshipStatusSyncSession() {
	const session = game.socket?.session;
	const user = game.user;
	if ( !session?.sessionId || !user?.id ) return null;
	return {
		sessionId: String(session.sessionId),
		socketId: game.socket?.id ? String(game.socket.id) : null,
		userId: String(session.userId ?? user.id),
		isGM: user.isGM === true,
		ts: Date.now()
	};
}

function getCurrentStarshipStatusSyncSocketId() {
	const socketId = game.socket?.id;
	return typeof socketId === "string" && socketId.length ? socketId : null;
}

function getStarshipStatusSyncOriginSocketId(options) {
	const originSocketId = options?.[STARSHIP_STATUS_SYNC_ORIGIN_SOCKET_OPTION];
	return typeof originSocketId === "string" && originSocketId.length ? originSocketId : null;
}

function isStarshipStatusSyncDiagnosticsEnabled() {
	return globalThis.sw5eStarshipStatusSyncDiagnostics === true;
}

function getStarshipStatusSyncDiagnosticsStore() {
	globalThis.sw5eStarshipStatusSyncDiagnosticsLog ??= [];
	return globalThis.sw5eStarshipStatusSyncDiagnosticsLog;
}

function pushStarshipStatusSyncDiagnostic(level, event, data = {}) {
	if ( !isStarshipStatusSyncDiagnosticsEnabled() ) return null;
	const entry = {
		id: `diag-${++starshipStatusSyncDiagCounter}`,
		ts: Date.now(),
		level,
		event,
		...data
	};
	const store = getStarshipStatusSyncDiagnosticsStore();
	store.push(entry);
	if ( store.length > 200 ) store.splice(0, store.length - 200);
	const logger = level === "error" ? console.error : console.debug;
	logger(`SW5E MODULE | Starship token status sync ${event}.`, entry);
	return entry;
}

function buildStarshipStatusSyncChangeSummary(changes) {
	return {
		usedChanged: foundry.utils.hasProperty(changes, "flags.sw5e.legacyStarshipActor.system.attributes.used"),
		slowedChanged: foundry.utils.hasProperty(changes, "flags.sw5e.starship.conditions.slowedLevel"),
		systemDamageChanged: foundry.utils.hasProperty(changes, "flags.sw5e.legacyStarshipActor.system.attributes.systemDamage")
	};
}

function logStarshipStatusSyncActorUpdateDiagnostic(event, actor, changes, options, userId, extra = {}) {
	if ( !isStarshipStatusSyncDiagnosticsEnabled() ) return;
	const currentSession = getCurrentStarshipStatusSyncSession();
	pushStarshipStatusSyncDiagnostic("debug", event, {
		currentUserId: currentSession?.userId ?? null,
		sessionSessionId: currentSession?.sessionId ?? null,
		localSocketId: currentSession?.socketId ?? null,
		requestingUserId: userId ?? null,
		actorId: actor?.id ?? null,
		actorUuid: actor?.uuid ?? null,
		actorIsSynthetic: actor?.isToken === true,
		originSocketId: getStarshipStatusSyncOriginSocketId(options),
		changes: buildStarshipStatusSyncChangeSummary(changes),
		...extra
	});
}

function resolveStarshipStatusSyncActor(actorOrUuid) {
	let actor = actorOrUuid;
	if ( typeof actor === "string" ) {
		actor = globalThis.fromUuidSync?.(actor) ?? game.actors?.get?.(actor) ?? null;
	}
	if ( actor?.documentName !== "Actor" && actor?.actor?.documentName === "Actor" ) actor = actor.actor;
	if ( actor?.isToken && actor?.baseActor?.documentName === "Actor" ) actor = actor.baseActor;
	return actor?.documentName === "Actor" ? actor : null;
}

function collectStaleSyncedEffectIds(actor) {
	const stale = new Set();
	const legacyIds = getLegacySyncedStatusEffectIds();
	const expectedIds = new Set(
		STARSHIP_SYNCED_TOKEN_STATUS_IDS.map(statusId => getStarshipSyncedStatusEffectId(statusId))
	);

	for ( const effect of actor.effects ) {
		if ( legacyIds.has(effect.id) ) {
			stale.add(effect.id);
			continue;
		}

		const syncedStatus = getEffectStatusIds(effect).find(statusId => STARSHIP_SYNCED_TOKEN_STATUS_IDS.includes(statusId));
		if ( syncedStatus ) {
			const expectedId = getStarshipSyncedStatusEffectId(syncedStatus);
			if ( expectedId && effect.id !== expectedId ) stale.add(effect.id);
			continue;
		}

		if ( isStarshipSyncedStatusEffect(effect) && !expectedIds.has(effect.id) ) stale.add(effect.id);
	}

	return stale;
}

async function purgeCollidedLegacySyncedEffects(actor) {
	const toDelete = new Set();

	for ( const effect of actor.effects ) {
		if ( effect.id === LEGACY_COLLIDED_SLOWED_SYNC_EFFECT_ID ) toDelete.add(effect.id);

		for ( const statusId of getEffectStatusIds(effect) ) {
			if ( !STARSHIP_SLOWED_HUD_STATUS_IDS.includes(statusId) ) continue;
			const expectedId = getStarshipSyncedStatusEffectId(statusId);
			if ( expectedId && effect.id !== expectedId ) toDelete.add(effect.id);
		}
	}

	if ( !toDelete.size ) return false;
	await actor.deleteEmbeddedDocuments("ActiveEffect", [...toDelete], getStarshipStatusSyncOptions());
	return true;
}

export function isStarshipSyncedStatusEffect(effect) {
	return Boolean(effect?.flags?.sw5e?.[STARSHIP_STATUS_SYNC_FLAG]);
}

/** @deprecated Use {@link isStarshipSyncedStatusEffect}. */
export function isStarshipSystemDamageSyncEffect(effect) {
	return isStarshipSyncedStatusEffect(effect);
}

export function getStarshipSyncedStatusEffectIds() {
	return new Set(STARSHIP_SYNCED_TOKEN_STATUS_IDS.map(id => getStarshipSyncedStatusEffectId(id)));
}

function getCoverStatusIds() {
	return (CONFIG.statusEffects ?? [])
		.filter(effect => /^cover/i.test(effect.id ?? ""))
		.map(effect => effect.id);
}

/** Status palette entries allowed on SW5E Starship token HUDs. */
export function getStarshipTokenHudAllowlist() {
	return new Set([
		...STARSHIP_CONDITION_IDS,
		STARSHIP_USED_CONDITION_ID,
		STARSHIP_SYSTEM_DAMAGE_STATUS_ID,
		...STARSHIP_SLOWED_HUD_STATUS_IDS,
		...getCoverStatusIds()
	]);
}

/** Starship-only status IDs hidden from character/NPC token HUDs. */
export function getStarshipOnlyStatusIds() {
	return new Set([
		...STARSHIP_CONDITION_IDS,
		STARSHIP_USED_CONDITION_ID,
		STARSHIP_SYSTEM_DAMAGE_STATUS_ID,
		...STARSHIP_SLOWED_HUD_STATUS_IDS
	]);
}

function localizeStatusName(status) {
	const name = status?.name ?? "";
	if ( !name ) return "";
	const localized = game.i18n.localize(name);
	return localized && localized !== name ? localized : name;
}

function getStatusConfig(statusId) {
	return (CONFIG.statusEffects ?? []).find(effect => effect.id === statusId);
}

function resolveStarshipHudActiveState(statusId, actor, fallbackActive = false) {
	if ( statusId === STARSHIP_USED_CONDITION_ID ) return getStarshipUsedFlag(actor);
	if ( statusId === STARSHIP_SYSTEM_DAMAGE_STATUS_ID ) return getStarshipSystemDamageLevel(actor) > 0;
	if ( statusId.startsWith("starshipSlowed") && statusId.length === "starshipSlowed".length + 1 ) {
		const level = Number(statusId.slice("starshipSlowed".length));
		return getStarshipExplicitSlowedLevel(actor) === level;
	}
	if ( STARSHIP_CONDITION_IDS.includes(statusId) ) return isStarshipConditionActive(actor, statusId);
	return fallbackActive;
}

function buildHudChoiceFromStatus(status, actor, existingChoice) {
	const isActive = resolveStarshipHudActiveState(status.id, actor, existingChoice?.isActive ?? false);
	const title = localizeStatusName(status);
	return {
		_id: status._id,
		id: status.id,
		title,
		src: status.img,
		isOverlay: existingChoice?.isOverlay ?? false,
		cssClass: isActive ? "active" : "",
		isActive
	};
}

function filterStarshipTokenHudChoices(choices, actor) {
	const allow = getStarshipTokenHudAllowlist();
	const result = {};

	for ( const status of CONFIG.statusEffects ?? [] ) {
		if ( !allow.has(status.id) ) continue;
		result[status.id] = buildHudChoiceFromStatus(status, actor, choices?.[status.id]);
	}
	return result;
}

function stripStarshipStatusesFromChoices(choices) {
	const starshipOnly = getStarshipOnlyStatusIds();
	const result = { ...choices };
	for ( const id of starshipOnly ) delete result[id];
	return result;
}

function getDesiredSyncedStatusIds(actor) {
	const desired = new Set();
	if ( getStarshipUsedFlag(actor) ) desired.add(STARSHIP_USED_CONDITION_ID);
	const slowed = getStarshipExplicitSlowedLevel(actor);
	if ( slowed >= 1 && slowed <= 4 ) desired.add(`starshipSlowed${slowed}`);
	if ( getStarshipSystemDamageLevel(actor) > 0 ) desired.add(STARSHIP_SYSTEM_DAMAGE_STATUS_ID);
	return desired;
}

function refreshActorTokenEffectIcons(actor) {
	for ( const token of actor.getActiveTokens?.() ?? [] ) {
		token.object?.renderFlags?.set({ refreshEffects: true });
	}
}

function getSyncEffectDisplayData(statusId) {
	const statusConfig = getStatusConfig(statusId);
	return {
		name: localizeStatusName(statusConfig) || statusId,
		img: statusConfig?.img ?? "icons/svg/aura.svg"
	};
}

function buildSyncEffectUpdateData(existing, statusId) {
	const { name, img } = getSyncEffectDisplayData(statusId);
	const updates = { _id: existing.id };
	const existingStatuses = getEffectStatusIds(existing);

	if ( existing.disabled ) updates.disabled = false;
	if ( existing.name !== name ) updates.name = name;
	if ( existing.img !== img ) updates.img = img;
	if ( existing.transfer !== false ) updates.transfer = false;
	if ( existingStatuses.length !== 1 || existingStatuses[0] !== statusId ) {
		updates.statuses = [statusId];
	}
	if ( !isStarshipSyncedStatusEffect(existing) ) {
		updates.flags = foundry.utils.mergeObject(existing.flags ?? {}, {
			sw5e: { ...existing.flags?.sw5e, [STARSHIP_STATUS_SYNC_FLAG]: true }
		});
	}

	if ( Object.keys(updates).length === 1 ) return null;
	return updates;
}

function buildSyncEffectCreateData(statusId) {
	const effectId = getStarshipSyncedStatusEffectId(statusId);
	const { name, img } = getSyncEffectDisplayData(statusId);

	return {
		_id: effectId,
		name,
		img,
		disabled: false,
		transfer: false,
		flags: { sw5e: { [STARSHIP_STATUS_SYNC_FLAG]: true } },
		statuses: [statusId]
	};
}

function nextStarshipStatusSyncRequestId() {
	const socketId = getCurrentStarshipStatusSyncSocketId() ?? "no-socket";
	return `req:${socketId}:${++starshipStatusSyncRequestCounter}`;
}

function nextStarshipStatusSyncPassId() {
	const socketId = getCurrentStarshipStatusSyncSocketId() ?? "no-socket";
	return `pass:${socketId}:${++starshipStatusSyncPassCounter}`;
}

function getDesiredSyncedStatusDescriptors(actor) {
	const desiredStatuses = getDesiredSyncedStatusIds(actor);
	return STARSHIP_SYNCED_STATUS_DESCRIPTORS.filter(descriptor => desiredStatuses.has(descriptor.statusId));
}

function collectDuplicateIds(ids = []) {
	const seen = new Set();
	const duplicates = new Set();
	for ( const id of ids ) {
		if ( !id ) continue;
		if ( seen.has(id) ) duplicates.add(id);
		seen.add(id);
	}
	return [...duplicates].sort();
}

function collectOverlappingOperationIds({ toDelete = [], toUpdate = [], toCreate = [] }) {
	const groupsById = new Map();
	for ( const [group, ids] of [
		["delete", toDelete],
		["update", toUpdate.map(update => update._id)],
		["create", toCreate.map(create => create._id)]
	] ) {
		for ( const id of ids ) {
			if ( !id ) continue;
			const groups = groupsById.get(id) ?? new Set();
			groups.add(group);
			groupsById.set(id, groups);
		}
	}
	return [...groupsById.entries()]
		.filter(([, groups]) => groups.size > 1)
		.map(([id, groups]) => ({ id, groups: [...groups].sort() }))
		.sort((a, b) => a.id.localeCompare(b.id));
}

function getStarshipStatusSyncQueueSummary(actorKey) {
	const state = syncingActors.get(actorKey);
	return {
		hasState: Boolean(state),
		running: Boolean(state?.running),
		pending: (state?.requests?.length ?? 0) > 0,
		queuedRequestCount: state?.requests?.length ?? 0
	};
}

function collectStarshipStatusSyncOperations(actor) {
	const desiredDescriptors = getDesiredSyncedStatusDescriptors(actor);
	const desiredIds = desiredDescriptors.map(descriptor => descriptor.effectId).filter(Boolean);
	const currentEffects = getCurrentEffectsById(actor);
	const toDelete = new Set(collectStaleSyncedEffectIds(actor));
	const toUpdate = [];
	const toCreate = [];

	for ( const descriptor of STARSHIP_SYNCED_STATUS_DESCRIPTORS ) {
		if ( !descriptor.effectId ) continue;
		const existing = currentEffects.get(descriptor.effectId);
		const desired = desiredDescriptors.some(candidate => candidate.statusId === descriptor.statusId);

		if ( desired ) {
			if ( existing ) {
				const updateData = buildSyncEffectUpdateData(existing, descriptor.statusId);
				if ( updateData ) toUpdate.push(updateData);
			} else {
				toCreate.push(buildSyncEffectCreateData(descriptor.statusId));
			}
		} else if ( existing ) {
			toDelete.add(existing.id);
		}
	}

	return {
		desiredDescriptors,
		desiredIds,
		duplicateDesiredIds: collectDuplicateIds(desiredIds),
		toDelete: [...toDelete].sort(),
		toUpdate,
		toCreate
	};
}

function logStarshipStatusSyncInvariantFailure(summary) {
	pushStarshipStatusSyncDiagnostic("error", "invariant-failed", summary);
	console.error("SW5E MODULE | Starship token status sync invariant failed.", summary);
}

function assertStarshipStatusSyncPlanInvariants(actor, plan, passId, stage) {
	const currentEffects = getCurrentEffectsById(actor);
	const currentEffectIds = [...currentEffects.keys()].sort();
	const createIds = plan.toCreate.map(create => create._id);
	const updateIds = plan.toUpdate.map(update => update._id);
	const deleteIds = [...plan.toDelete];
	const duplicateCreateIds = collectDuplicateIds(createIds);
	const duplicateUpdateIds = collectDuplicateIds(updateIds);
	const duplicateDeleteIds = collectDuplicateIds(deleteIds);
	const overlappingIds = collectOverlappingOperationIds(plan);
	const existingForCreate = createIds.filter(id => currentEffects.has(id)).sort();
	const missingForUpdate = updateIds.filter(id => !currentEffects.has(id)).sort();
	const missingForDelete = deleteIds.filter(id => !currentEffects.has(id)).sort();
	const invalid = Boolean(
		plan.duplicateDesiredIds.length
		|| duplicateCreateIds.length
		|| duplicateUpdateIds.length
		|| duplicateDeleteIds.length
		|| overlappingIds.length
		|| existingForCreate.length
		|| missingForUpdate.length
		|| missingForDelete.length
	);

	if ( invalid ) {
		logStarshipStatusSyncInvariantFailure({
			passId,
			stage,
			actorId: actor.id,
			actorUuid: actor.uuid,
			currentEffectIds,
			desiredIds: [...plan.desiredIds].sort(),
			duplicateDesiredIds: [...plan.duplicateDesiredIds].sort(),
			createIds: [...createIds].sort(),
			duplicateCreateIds,
			updateIds: [...updateIds].sort(),
			duplicateUpdateIds,
			deleteIds: [...deleteIds].sort(),
			duplicateDeleteIds,
			overlappingIds,
			existingForCreate,
			missingForUpdate,
			missingForDelete
		});
		return false;
	}

	return true;
}

function assertStarshipStatusSyncCreateStageInvariants(actor, plan, passId) {
	const currentEffects = getCurrentEffectsById(actor);
	const currentEffectIds = [...currentEffects.keys()].sort();
	const createIds = plan.toCreate.map(create => create._id);
	const duplicateCreateIds = collectDuplicateIds(createIds);
	const existingForCreate = createIds.filter(id => currentEffects.has(id)).sort();
	const invalid = Boolean(duplicateCreateIds.length || existingForCreate.length);

	pushStarshipStatusSyncDiagnostic("debug", "pre-create", {
		passId,
		actorId: actor.id,
		actorUuid: actor.uuid,
		currentEffectIdsBeforeCreate: currentEffectIds,
		createIds: [...createIds].sort(),
		duplicateCreateIds,
		existingForCreate
	});

	if ( invalid ) {
		logStarshipStatusSyncInvariantFailure({
			passId,
			stage: "pre-create",
			actorId: actor.id,
			actorUuid: actor.uuid,
			currentEffectIds,
			createIds: [...createIds].sort(),
			duplicateCreateIds,
			existingForCreate
		});
		return false;
	}

	return true;
}

function buildStarshipStatusSyncRequest(actor, meta = {}) {
	const worldActor = resolveStarshipStatusSyncActor(actor);
	const session = getCurrentStarshipStatusSyncSession();
	return worldActor ? {
		requestId: nextStarshipStatusSyncRequestId(),
		actorId: worldActor.id,
		actorUuid: worldActor.uuid,
		actorKey: getStarshipStatusSyncActorKey(worldActor),
		actorIsSynthetic: Boolean(actor?.isToken),
		hookName: meta.hookName ?? "unknown",
		initiatingUserId: meta.initiatingUserId ?? null,
		originSocketId: meta.originSocketId ?? null,
		watchedChanges: meta.watchedChanges ?? null,
		requestingUserId: session?.userId ?? null,
		requestingSocketId: session?.socketId ?? null
	} : null;
}

function getStarshipStatusSyncOwnership(actor, request) {
	const actorKey = getStarshipStatusSyncActorKey(actor);
	const localSocketId = getCurrentStarshipStatusSyncSocketId();
	const originSocketId = request?.originSocketId ?? null;
	const expectedActorKey = request?.actorKey ?? null;
	return {
		actorKey,
		actorMatches: Boolean(actorKey && expectedActorKey && actorKey === expectedActorKey),
		expectedActorKey,
		localSocketId,
		originSocketId,
		ownsSocket: Boolean(localSocketId && originSocketId && localSocketId === originSocketId)
	};
}

function logStarshipStatusSyncWriteOwnershipDecision(actor, request, passId, stage, ownership) {
	pushStarshipStatusSyncDiagnostic("debug", "write-ownership", {
		passId,
		stage,
		actorId: actor?.id ?? null,
		actorUuid: actor?.uuid ?? null,
		originSocketId: ownership.originSocketId,
		localSocketId: ownership.localSocketId,
		sessionSessionId: getCurrentStarshipStatusSyncSession()?.sessionId ?? null,
		actorKey: ownership.actorKey,
		expectedActorKey: ownership.expectedActorKey,
		actorMatches: ownership.actorMatches,
		ownsSocket: ownership.ownsSocket,
		allowed: ownership.ownsSocket && ownership.actorMatches
	});
}

function assertStarshipStatusSyncWriteOwnership(actor, request, passId, stage) {
	const ownership = getStarshipStatusSyncOwnership(actor, request);
	logStarshipStatusSyncWriteOwnershipDecision(actor, request, passId, stage, ownership);
	if ( ownership.ownsSocket && ownership.actorMatches ) return true;
	pushStarshipStatusSyncDiagnostic("error", "write-ownership-abort", {
		passId,
		stage,
		actorId: actor?.id ?? null,
		actorUuid: actor?.uuid ?? null,
		originSocketId: ownership.originSocketId,
		localSocketId: ownership.localSocketId,
		sessionSessionId: getCurrentStarshipStatusSyncSession()?.sessionId ?? null,
		actorKey: ownership.actorKey,
		expectedActorKey: ownership.expectedActorKey
	});
	return false;
}

function prepareStarshipStatusSyncPlan(actor, request, passId, stage) {
	if ( !assertStarshipStatusSyncWriteOwnership(actor, request, passId, stage) ) return null;
	const plan = collectStarshipStatusSyncOperations(actor);
	if ( !assertStarshipStatusSyncPlanInvariants(actor, plan, passId, stage) ) return null;
	if ( stage === "create" && plan.toCreate.length && !assertStarshipStatusSyncCreateStageInvariants(actor, plan, passId) ) {
		return null;
	}
	return plan;
}

function startStarshipStatusSyncQueue(actor, actorKey, state) {
	if ( state.running ) return state.active;
	state.running = true;
	state.active = (async () => {
		try {
			while ( true ) {
				const requests = state.requests.splice(0);
				if ( !requests.length ) break;
				const requestActorKeys = [...new Set(requests.map(request => request.actorKey).filter(Boolean))];
				const requestOriginSocketIds = [...new Set(requests.map(request => request.originSocketId).filter(Boolean))];
				const latestRequest = requests.at(-1);
				const liveActor = resolveStarshipStatusSyncActor(latestRequest?.actorUuid ?? latestRequest?.actorId ?? actor.uuid);
				if ( !liveActor?.effects || !isSw5eStarshipActor(liveActor) ) continue;
				if ( requestActorKeys.length !== 1 || requestActorKeys[0] !== actorKey || requestOriginSocketIds.length !== 1 ) {
					pushStarshipStatusSyncDiagnostic("error", "queue-request-abort", {
						passId: nextStarshipStatusSyncPassId(),
						actorId: liveActor.id,
						actorUuid: liveActor.uuid,
						actorKey,
						requestActorKeys,
						requestOriginSocketIds,
						requestIds: requests.map(request => request.requestId)
					});
					continue;
				}
				await runStarshipStatusIconSync(liveActor, {
					passId: nextStarshipStatusSyncPassId(),
					requests,
					originSocketId: requestOriginSocketIds[0],
					actorKey
				});
			}
		} catch ( err ) {
			console.error("SW5E MODULE | Starship token status icon sync failed.", err);
		} finally {
			state.running = false;
			state.active = null;
			if ( state.requests.length ) {
				queueMicrotask(() => {
					if ( syncingActors.get(actorKey) === state && !state.running ) {
						void startStarshipStatusSyncQueue(actor, actorKey, state);
					}
				});
			} else {
				syncingActors.delete(actorKey);
			}
		}
	})();
	return state.active;
}

function enqueueStarshipStatusSyncRequest(actor, actorKey, request) {
	let state = syncingActors.get(actorKey);
	if ( !state ) {
		state = { running: false, requests: [], active: null };
		syncingActors.set(actorKey, state);
	}

	state.requests.push(request);
	return startStarshipStatusSyncQueue(actor, actorKey, state);
}

async function handleStarshipStatusSyncRequest(request, { source = "local" } = {}) {
	if ( !request?.requestId ) return;
	const actor = resolveStarshipStatusSyncActor(request.actorUuid ?? request.actorId);
	if ( !actor?.effects || !isSw5eStarshipActor(actor) ) return;
	const actorKey = getStarshipStatusSyncActorKey(actor);
	const ownership = getStarshipStatusSyncOwnership(actor, request);

	pushStarshipStatusSyncDiagnostic("debug", "request", {
		requestId: request.requestId,
		source,
		currentUserId: getCurrentStarshipStatusSyncSession()?.userId ?? null,
		sessionSessionId: getCurrentStarshipStatusSyncSession()?.sessionId ?? null,
		localSocketId: ownership.localSocketId,
		originSocketId: ownership.originSocketId,
		actorId: actor.id,
		actorUuid: actor.uuid,
		actorIsSynthetic: request.actorIsSynthetic === true,
		hookName: request.hookName ?? "unknown",
		initiatingUserId: request.initiatingUserId ?? null,
		watchedChanges: request.watchedChanges ?? null,
		actorMatches: ownership.actorMatches,
		ownsSocket: ownership.ownsSocket,
		queueAdmissionDecision: ownership.ownsSocket && ownership.actorMatches ? "enqueue" : "return",
		queueState: getStarshipStatusSyncQueueSummary(actorKey),
		requestingSocketId: request.requestingSocketId ?? null
	});

	if ( !ownership.ownsSocket || !ownership.actorMatches ) return;
	return enqueueStarshipStatusSyncRequest(actor, actorKey, request);
}

/**
 * Sync display-only ActiveEffects for flag-backed Used, explicit Slowed, and System Damage.
 * Source of truth remains actor flags; effects exist only for token/HUD icon rendering.
 * @param {Actor} actor
 * @param {{ hookName?: string, initiatingUserId?: string|null }} [meta]
 */
export async function syncStarshipTokenStatusIcons(actor, meta = {}) {
	const worldActor = resolveStarshipStatusSyncActor(actor);
	if ( !worldActor?.effects || !isSw5eStarshipActor(worldActor) ) return;
	const request = buildStarshipStatusSyncRequest(actor, meta);
	if ( !request ) return;
	return handleStarshipStatusSyncRequest(request, { source: "local" });
}

async function runStarshipStatusIconSync(actor, { passId, requests = [], originSocketId = null, actorKey = null } = {}) {
	const requestContext = { originSocketId, actorKey };
	const plan = prepareStarshipStatusSyncPlan(actor, requestContext, passId, "pass-start");
	if ( !plan ) return;
	const currentSession = getCurrentStarshipStatusSyncSession();
	const currentEffectIds = [...getCurrentEffectsById(actor).keys()].sort();
	const createIds = plan.toCreate.map(create => create._id).sort();
	const duplicateCreateIds = collectDuplicateIds(createIds);

	pushStarshipStatusSyncDiagnostic("debug", "pass-start", {
		passId,
		currentUserId: currentSession?.userId ?? null,
		sessionSessionId: currentSession?.sessionId ?? null,
		localSocketId: currentSession?.socketId ?? null,
		originSocketId,
		actorId: actor.id,
		actorUuid: actor.uuid,
		actorIsSynthetic: actor.isToken === true,
		hookNames: [...new Set(requests.map(request => request.hookName ?? "unknown"))].sort(),
		initiatingUserIds: [...new Set(requests.map(request => request.initiatingUserId).filter(Boolean))].sort(),
		requestIds: requests.map(request => request.requestId),
		queueState: getStarshipStatusSyncQueueSummary(getStarshipStatusSyncActorKey(actor)),
		currentEffectIds,
		desiredDeterministicIds: [...plan.desiredIds].sort(),
		duplicateDesiredIds: [...plan.duplicateDesiredIds].sort(),
		plannedCreateIds: createIds,
		duplicateCreateIds,
		plannedUpdateIds: plan.toUpdate.map(update => update._id).sort(),
		plannedDeleteIds: [...plan.toDelete].sort(),
		overlappingOperationIds: collectOverlappingOperationIds(plan)
	});

	const deletePlan = prepareStarshipStatusSyncPlan(actor, requestContext, passId, "delete");
	if ( !deletePlan ) return;
	if ( deletePlan.toDelete.length ) {
		await actor.deleteEmbeddedDocuments("ActiveEffect", deletePlan.toDelete, getStarshipStatusSyncOptions());
	}

	const updatePlan = prepareStarshipStatusSyncPlan(actor, requestContext, passId, "update");
	if ( !updatePlan ) return;
	if ( updatePlan.toUpdate.length ) {
		await actor.updateEmbeddedDocuments("ActiveEffect", updatePlan.toUpdate, getStarshipStatusSyncOptions());
	}

	const createPlan = prepareStarshipStatusSyncPlan(actor, requestContext, passId, "create");
	if ( !createPlan ) return;
	if ( createPlan.toCreate.length ) {
		pushStarshipStatusSyncDiagnostic("debug", "create-submit", {
			passId,
			actorId: actor.id,
			actorUuid: actor.uuid,
			originSocketId,
			localSocketId: getCurrentStarshipStatusSyncSocketId(),
			createIdsSubmitted: createPlan.toCreate.map(create => create._id).sort()
		});
		await actor.createEmbeddedDocuments("ActiveEffect", createPlan.toCreate, getStarshipStatusSyncOptions({ keepId: true }));
	}

	if ( !assertStarshipStatusSyncWriteOwnership(actor, requestContext, passId, "post-stale-delete") ) return;
	const postStale = [...collectStaleSyncedEffectIds(actor)].filter(id => !deletePlan.toDelete.includes(id));
	if ( postStale.length ) {
		const currentEffects = getCurrentEffectsById(actor);
		const missingPostStale = postStale.filter(id => !currentEffects.has(id)).sort();
		if ( missingPostStale.length ) {
			logStarshipStatusSyncInvariantFailure({
				passId,
				stage: "post-stale-delete",
				actorId: actor.id,
				actorUuid: actor.uuid,
				deleteIds: [...postStale].sort(),
				missingForDelete: missingPostStale,
				currentEffectIds: [...currentEffects.keys()].sort()
			});
			return;
		}
		await actor.deleteEmbeddedDocuments("ActiveEffect", postStale, getStarshipStatusSyncOptions());
	}

	let purgedLegacy = false;
	if ( assertStarshipStatusSyncWriteOwnership(actor, requestContext, passId, "legacy-purge") ) {
		purgedLegacy = await purgeCollidedLegacySyncedEffects(actor);
	}

	await new Promise(resolve => queueMicrotask(resolve));
	if ( assertStarshipStatusSyncWriteOwnership(actor, requestContext, passId, "legacy-purge-microtask")
		&& await purgeCollidedLegacySyncedEffects(actor) ) purgedLegacy = true;

	if (
		deletePlan.toDelete.length
		|| updatePlan.toUpdate.length
		|| createPlan.toCreate.length
		|| postStale.length
		|| purgedLegacy
	) {
		refreshActorTokenEffectIcons(actor);
	}

	setTimeout(() => {
		if ( !isSw5eStarshipActor(actor) ) return;
		if ( !assertStarshipStatusSyncWriteOwnership(actor, requestContext, passId, "legacy-purge-timeout") ) return;
		void purgeCollidedLegacySyncedEffects(actor).then(purged => {
			if ( purged ) refreshActorTokenEffectIcons(actor);
		});
	}, 150);
}

/** @deprecated Use {@link syncStarshipTokenStatusIcons}. */
export async function syncStarshipSystemDamageStatusEffect(actor) {
	return syncStarshipTokenStatusIcons(actor);
}

function actorChangesRequireStatusIconSync(changes) {
	return foundry.utils.hasProperty(changes, "flags.sw5e.legacyStarshipActor.system.attributes.used")
		|| foundry.utils.hasProperty(changes, "flags.sw5e.starship.conditions.slowedLevel")
		|| foundry.utils.hasProperty(changes, "flags.sw5e.legacyStarshipActor.system.attributes.systemDamage");
}

function shouldSkipStatusIconSync(options) {
	return Boolean(options?.sw5eSkipStarshipStatusIconSync);
}

function registerStarshipTokenStatusIconSyncHooks() {
	if ( starshipStatusSyncHooksRegistered ) return;
	starshipStatusSyncHooksRegistered = true;

	Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
		if ( shouldSkipStatusIconSync(options) ) return;
		if ( !isSw5eStarshipActor(actor) ) return;
		if ( !actorChangesRequireStatusIconSync(changes) ) return;

		const localSocketId = getCurrentStarshipStatusSyncSocketId();
		if ( !getStarshipStatusSyncOriginSocketId(options) && localSocketId ) {
			options[STARSHIP_STATUS_SYNC_ORIGIN_SOCKET_OPTION] = localSocketId;
		}

		logStarshipStatusSyncActorUpdateDiagnostic("pre-update-stamp", actor, changes, options, userId, {
			stampedOriginSocketId: getStarshipStatusSyncOriginSocketId(options),
			localSocketId,
			stampedMatchesLocalSocket: getStarshipStatusSyncOriginSocketId(options) === localSocketId
		});
	});

	Hooks.once("ready", () => {
		pushStarshipStatusSyncDiagnostic("debug", "ready-sync-deferred", {
			currentUserId: game.user?.id ?? null,
			localSocketId: getCurrentStarshipStatusSyncSocketId(),
			sessionSessionId: getCurrentStarshipStatusSyncSession()?.sessionId ?? null
		});
	});

	Hooks.on("updateActor", (actor, changes, options, userId) => {
		if ( shouldSkipStatusIconSync(options) ) return;
		if ( !isSw5eStarshipActor(actor) ) return;
		if ( !actorChangesRequireStatusIconSync(changes) ) return;

		const originSocketId = getStarshipStatusSyncOriginSocketId(options);
		const localSocketId = getCurrentStarshipStatusSyncSocketId();
		const queueAdmissionAllowed = Boolean(originSocketId && localSocketId && originSocketId === localSocketId);

		logStarshipStatusSyncActorUpdateDiagnostic("update-actor-observed", actor, changes, options, userId, {
			localSocketId,
			receivedOriginSocketId: originSocketId,
			sessionSessionId: getCurrentStarshipStatusSyncSession()?.sessionId ?? null,
			markerPresent: Boolean(originSocketId),
			queueAdmissionDecision: queueAdmissionAllowed ? "queue" : "return"
		});

		if ( !originSocketId ) {
			pushStarshipStatusSyncDiagnostic("debug", "update-actor-unmarked", {
				actorId: actor.id,
				actorUuid: actor.uuid,
				requestingUserId: userId ?? null,
				changes: buildStarshipStatusSyncChangeSummary(changes),
				markerPresent: false
			});
			return;
		}
		if ( !localSocketId || originSocketId !== localSocketId ) return;

		void syncStarshipTokenStatusIcons(actor, {
			hookName: "updateActor",
			initiatingUserId: userId ?? null,
			originSocketId,
			watchedChanges: buildStarshipStatusSyncChangeSummary(changes)
		});
	});
}

function getTokenHudPrototype() {
	return foundry.applications?.hud?.TokenHUD?.prototype
		?? CONFIG.Token?.hudClass?.prototype;
}

function wrapTokenHudStatusChoices() {
	const proto = getTokenHudPrototype();
	if ( !proto?._getStatusEffectChoices ) return;

	try {
		libWrapper.register(getModuleId(), "foundry.applications.hud.TokenHUD.prototype._getStatusEffectChoices", function(wrapped) {
			const choices = wrapped.call(this);
			const actor = this.actor;
			if ( !actor ) return choices;

			if ( isSw5eStarshipActor(actor) ) return filterStarshipTokenHudChoices(choices, actor);
			return stripStarshipStatusesFromChoices(choices);
		}, "MIXED");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap TokenHUD _getStatusEffectChoices for starship statuses.", err);
	}
}

async function handleStarshipFlagBackedStatusToggle(actor, statusId) {
	if ( statusId === STARSHIP_USED_CONDITION_ID ) {
		await setStarshipUsedFlag(actor, !getStarshipUsedFlag(actor));
		return true;
	}

	if ( statusId.startsWith("starshipSlowed") && statusId.length === "starshipSlowed".length + 1 ) {
		const clicked = Number(statusId.slice("starshipSlowed".length));
		const next = resolveStarshipExplicitSlowedLevelClick(getStarshipExplicitSlowedLevel(actor), clicked);
		await setStarshipExplicitSlowedLevel(actor, next);
		return true;
	}

	if ( statusId === STARSHIP_SYSTEM_DAMAGE_STATUS_ID ) return true;

	return false;
}

function wrapActorToggleStatusEffect() {
	const ActorClass = CONFIG.Actor?.documentClass;
	if ( !ActorClass?.prototype?.toggleStatusEffect ) return;

	try {
		libWrapper.register(getModuleId(), "CONFIG.Actor.documentClass.prototype.toggleStatusEffect", function(wrapped, statusId, options) {
			if ( isSw5eStarshipActor(this) ) {
				if ( statusId === STARSHIP_USED_CONDITION_ID
					|| statusId === STARSHIP_SYSTEM_DAMAGE_STATUS_ID
					|| (statusId.startsWith("starshipSlowed") && statusId.length === "starshipSlowed".length + 1) ) {
					void handleStarshipFlagBackedStatusToggle(this, statusId);
					return this;
				}
			}
			return wrapped.call(this, statusId, options);
		}, "MIXED");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap Actor toggleStatusEffect for starship flag statuses.", err);
	}
}

/**
 * Register Token HUD filtering and flag-backed status toggles for SW5E Starships.
 */
export function registerStarshipTokenStatusHooks() {
	wrapTokenHudStatusChoices();
	wrapActorToggleStatusEffect();
	registerStarshipTokenStatusIconSyncHooks();
}
