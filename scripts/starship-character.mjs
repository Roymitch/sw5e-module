import { getLegacyStarshipActorSystem } from "./starship-data.mjs";
import {
	canCurrentUserUpdateStarshipActor,
	isStarshipCrewMembershipVisibleToUser
} from "./starship-permissions.mjs";

export const STARSHIP_CREW_DEPLOYMENT_FLAG = "starshipDeployment";

/** Soft max length for ship-owned custom role strings (truncate on write). */
export const STARSHIP_CREW_CUSTOM_ROLE_MAX_LENGTH = 80;

const STARSHIP_DEPLOYMENT_ROLES = ["pilot", "crew", "passenger"];

function cloneDeep(data) {
	if ( globalThis.foundry?.utils?.deepClone ) return globalThis.foundry.utils.deepClone(data);
	if ( data === undefined ) return undefined;
	if ( typeof globalThis.structuredClone === "function" ) return globalThis.structuredClone(data);
	return JSON.parse(JSON.stringify(data));
}

function cloneData(data) {
	return cloneDeep(data ?? {});
}

function toNumber(value, fallback = 0) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeUuidSet(value) {
	if ( value instanceof Set ) return Array.from(value).filter(Boolean);
	if ( Array.isArray(value) ) return value.filter(Boolean);
	if ( value && typeof value === "object" ) {
		if ( value.items instanceof Set ) return Array.from(value.items).filter(Boolean);
		if ( Array.isArray(value.items) ) return value.items.filter(Boolean);
		if ( Array.isArray(value.value) ) return value.value.filter(Boolean);
	}
	return [];
}

function resolveActorDocument(subject) {
	if ( !subject ) return null;
	if ( subject.documentName === "Actor" ) return subject;
	if ( typeof subject === "string" ) {
		return globalThis.fromUuidSync?.(subject)
			?? globalThis.game?.actors?.get(subject)
			?? null;
	}
	return null;
}

function getCrewDeploymentFlag(actor) {
	return actor?.flags?.sw5e?.[STARSHIP_CREW_DEPLOYMENT_FLAG] ?? null;
}

function isLegacyVehicleStarship(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

function isDeployableCrewActor(subject) {
	const actor = resolveActorDocument(subject);
	if ( !actor ) return false;
	return ["character", "npc"].includes(actor.type);
}

function getDeploymentState(existingDeployment = {}, preservedDeployment = {}) {
	return {
		pilot: {
			value: existingDeployment?.pilot?.value ?? preservedDeployment?.pilot?.value ?? null,
			active: Boolean(existingDeployment?.pilot?.active ?? preservedDeployment?.pilot?.active)
		},
		crew: {
			items: new Set(normalizeUuidSet(existingDeployment?.crew ?? preservedDeployment?.crew)),
			active: Boolean(existingDeployment?.crew?.active ?? preservedDeployment?.crew?.active)
		},
		passenger: {
			items: new Set(normalizeUuidSet(existingDeployment?.passenger ?? preservedDeployment?.passenger)),
			active: Boolean(existingDeployment?.passenger?.active ?? preservedDeployment?.passenger?.active)
		},
		active: {
			value: existingDeployment?.active?.value ?? preservedDeployment?.active?.value ?? null
		}
	};
}

function collectDeploymentUuids(deployment) {
	const uuids = new Set();
	if ( deployment?.pilot?.value ) uuids.add(deployment.pilot.value);
	for (const uuid of normalizeUuidSet(deployment?.crew)) uuids.add(uuid);
	for (const uuid of normalizeUuidSet(deployment?.passenger)) uuids.add(uuid);
	return uuids;
}

function getDeploymentRolesForUuid(deployment, uuid) {
	if ( !uuid ) return [];
	const roles = [];
	if ( deployment?.pilot?.value === uuid ) roles.push("pilot");
	if ( deployment?.crew?.items?.has?.(uuid) ) roles.push("crew");
	if ( deployment?.passenger?.items?.has?.(uuid) ) roles.push("passenger");
	return roles;
}

/**
 * Clone `flags.sw5e.starship.crewProfiles` as a plain object map.
 * Storage keys encode Actor UUIDs so Foundry expandObject/setProperty do not split on `.`.
 * Conceptual identity remains the full Actor UUID.
 * @param {Actor|null|undefined} starship
 * @returns {Record<string, object>}
 */
function cloneCrewProfilesMap(starship) {
	return normalizeCrewProfilesMap(starship?.flags?.sw5e?.starship?.crewProfiles);
}

/** Fullwidth full stop — not a Foundry setProperty path separator. */
const CREW_PROFILE_KEY_DOT = "\uFF0E";

/**
 * @param {string} uuid
 * @returns {string}
 */
function toCrewProfileStorageKey(uuid) {
	return String(uuid ?? "").replaceAll(".", CREW_PROFILE_KEY_DOT);
}

/**
 * @param {string} key
 * @returns {string}
 */
function fromCrewProfileStorageKey(key) {
	return String(key ?? "").replaceAll(CREW_PROFILE_KEY_DOT, ".");
}

/** Bug 28: ship-owned membership records (aggregates + optional persisted individuals). */
const CREW_MEMBERSHIPS_PATH = "flags.sw5e.starship.crewMemberships";

/**
 * Deterministic membershipId for dual-read individual rows (no render writes).
 * @param {string} actorUuid
 * @returns {string}
 */
export function toDeterministicIndividualMembershipId(actorUuid) {
	return `indiv_${toCrewProfileStorageKey(actorUuid)}`;
}

/**
 * @returns {string}
 */
function createAggregateMembershipId() {
	const id = globalThis.foundry?.utils?.randomID?.()
		?? (typeof globalThis.crypto?.randomUUID === "function"
			? globalThis.crypto.randomUUID().replaceAll("-", "")
			: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
	return `agg_${id}`;
}

/**
 * @param {Actor|null|undefined} starship
 * @returns {Record<string, object>}
 */
function getWrittenCrewMembershipsMap(starship) {
	const raw = starship?.flags?.sw5e?.starship?.crewMemberships;
	if ( !raw || typeof raw !== "object" || Array.isArray(raw) ) return {};
	const out = {};
	for ( const [key, value] of Object.entries(raw) ) {
		if ( !key || !value || typeof value !== "object" || Array.isArray(value) ) continue;
		out[key] = value;
	}
	return out;
}

/**
 * Resolve Hybrid D memberships: written records + dual-read UUID Sets as qty-1 individuals.
 * Read-only — never writes Actor data.
 * @param {Actor|null|undefined} starship
 * @param {ReturnType<typeof getDeploymentState>} [deployment]
 * @returns {Array<{
 *   membershipId: string,
 *   sourceActorUuid: string,
 *   kind: "individual"|"aggregate",
 *   quantity: number,
 *   roles: string[],
 *   written: boolean
 * }>}
 */
export function resolveStarshipCrewMemberships(starship, deployment = null) {
	if ( !starship || !isLegacyVehicleStarship(starship) ) return [];
	const dep = deployment ?? cloneStarshipDeployment(starship);
	const written = getWrittenCrewMembershipsMap(starship);
	const referencedSources = new Set();
	const memberships = [];

	for ( const [membershipId, record] of Object.entries(written) ) {
		const sourceActorUuid = String(record?.sourceActorUuid ?? "").trim();
		if ( !sourceActorUuid ) continue;
		const kind = record?.kind === "aggregate" ? "aggregate" : "individual";
		const quantity = kind === "aggregate"
			? Math.max(1, Math.floor(Number(record?.quantity) || 1))
			: 1;
		const roles = Array.isArray(record?.roles)
			? record.roles.filter(r => STARSHIP_DEPLOYMENT_ROLES.includes(r))
			: getDeploymentRolesForUuid(dep, sourceActorUuid);
		referencedSources.add(sourceActorUuid);
		memberships.push({
			membershipId,
			sourceActorUuid,
			kind,
			quantity,
			roles: roles.length ? roles : getDeploymentRolesForUuid(dep, sourceActorUuid),
			written: true
		});
	}

	for ( const uuid of collectDeploymentUuids(dep) ) {
		if ( referencedSources.has(uuid) ) continue;
		memberships.push({
			membershipId: toDeterministicIndividualMembershipId(uuid),
			sourceActorUuid: uuid,
			kind: "individual",
			quantity: 1,
			roles: getDeploymentRolesForUuid(dep, uuid),
			written: false
		});
	}

	return memberships;
}

/**
 * @param {Actor|null|undefined} starship
 * @param {string} membershipId
 * @returns {ReturnType<typeof resolveStarshipCrewMemberships>[number]|null}
 */
export function findStarshipCrewMembership(starship, membershipId) {
	const id = String(membershipId ?? "").trim();
	if ( !id ) return null;
	return resolveStarshipCrewMemberships(starship).find(m => m.membershipId === id) ?? null;
}

/**
 * Profile identity for a membership: prefer membershipId key, fall back to source Actor UUID.
 * @param {Actor|null|undefined} starship
 * @param {string} membershipId
 * @param {string} [sourceActorUuid]
 * @returns {boolean}
 */
function readMembershipHiddenFlag(starship, membershipId, sourceActorUuid="") {
	if ( membershipId && getStarshipCrewMembershipHiddenForIdentity(starship, membershipId) ) return true;
	if ( sourceActorUuid && getStarshipCrewMembershipHiddenForIdentity(starship, sourceActorUuid) ) return true;
	return false;
}

/**
 * Hidden flag for one profile identity key (membershipId or Actor UUID).
 * @param {Actor|null|undefined} starship
 * @param {string} identity
 * @returns {boolean}
 */
function getStarshipCrewMembershipHiddenForIdentity(starship, identity) {
	if ( !starship || !identity ) return false;
	const shapes = locateCrewProfileShapes(starship?.flags?.sw5e?.starship?.crewProfiles, identity);
	if ( shapes.hasCanonical ) return shapes.canonicalProfile?.hidden === true;
	for ( const profile of [shapes.rawUuidProfile, shapes.nestedLegacyProfile] ) {
		if ( isCrewProfileObject(profile) && profile.hidden === true ) return true;
	}
	return false;
}

/**
 * Custom role for membershipId with UUID dual-read fallback.
 * @param {Actor|null|undefined} starship
 * @param {string} membershipId
 * @param {string} [sourceActorUuid]
 * @returns {string}
 */
export function getStarshipCrewCustomRoleForMembership(starship, membershipId, sourceActorUuid="") {
	if ( !starship ) return "";
	if ( membershipId ) {
		const shapes = locateCrewProfileShapes(starship?.flags?.sw5e?.starship?.crewProfiles, membershipId);
		const role = resolveCustomRoleFromShapes(shapes);
		if ( role ) return role;
	}
	if ( sourceActorUuid ) return getStarshipCrewCustomRole(starship, sourceActorUuid);
	return "";
}

/**
 * Count of sourceActorUuid references among resolved memberships.
 * @param {Actor|null|undefined} starship
 * @param {string} sourceActorUuid
 * @param {string} [exceptMembershipId]
 * @returns {number}
 */
function countMembershipsForSourceActor(starship, sourceActorUuid, exceptMembershipId="") {
	const uuid = String(sourceActorUuid ?? "");
	if ( !uuid ) return 0;
	return resolveStarshipCrewMemberships(starship)
		.filter(m => m.sourceActorUuid === uuid && m.membershipId !== exceptMembershipId)
		.length;
}

/**
 * Copy complete profile object for re-key (preserve hidden, customRole, unknown siblings).
 * @param {Actor} starship
 * @param {string} fromIdentity
 * @returns {object}
 */
function cloneCompleteCrewProfileForIdentity(starship, fromIdentity) {
	const shapes = locateCrewProfileShapes(starship?.flags?.sw5e?.starship?.crewProfiles, fromIdentity);
	const siblings = mergeCrewProfileSiblings(
		shapes.nestedLegacyProfile,
		shapes.rawUuidProfile,
		shapes.canonicalProfile
	);
	const role = resolveCustomRoleFromShapes(shapes);
	const target = { ...siblings };
	if ( role ) target.customRole = role;
	if ( shapes.canonicalProfile?.hidden === true
		|| shapes.rawUuidProfile?.hidden === true
		|| shapes.nestedLegacyProfile?.hidden === true ) {
		target.hidden = true;
	}
	return target;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isCrewProfileObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} nest
 * @returns {boolean}
 */
function isActorIdNest(nest) {
	if ( !isCrewProfileObject(nest) ) return false;
	return !Object.prototype.hasOwnProperty.call(nest, "customRole")
		&& !Object.prototype.hasOwnProperty.call(nest, "hidden");
}

/**
 * Locate proven profile shapes for one Actor UUID in raw crewProfiles.
 * Proven shapes only: canonical encoded, raw UUID own-key, nested Actor→id.
 * @param {unknown} raw
 * @param {string} actorUuid
 * @returns {{
 *   storageKey: string,
 *   actorId: string|null,
 *   hasCanonical: boolean,
 *   canonicalProfile: object|null,
 *   hasRawUuid: boolean,
 *   rawUuidProfile: object|null,
 *   hasNested: boolean,
 *   nestedLegacyProfile: object|null
 * }}
 */
function locateCrewProfileShapes(raw, actorUuid) {
	const uuid = String(actorUuid ?? "");
	const storageKey = toCrewProfileStorageKey(uuid);
	const actorId = uuid.startsWith("Actor.") ? uuid.slice("Actor.".length) : null;
	const result = {
		storageKey,
		actorId,
		hasCanonical: false,
		canonicalProfile: null,
		hasRawUuid: false,
		rawUuidProfile: null,
		hasNested: false,
		nestedLegacyProfile: null
	};
	if ( !uuid || !isCrewProfileObject(raw) ) return result;

	if ( Object.prototype.hasOwnProperty.call(raw, storageKey) ) {
		result.hasCanonical = true;
		result.canonicalProfile = isCrewProfileObject(raw[storageKey]) ? { ...raw[storageKey] } : {};
	}
	if ( uuid.includes(".") && Object.prototype.hasOwnProperty.call(raw, uuid) ) {
		result.hasRawUuid = true;
		result.rawUuidProfile = isCrewProfileObject(raw[uuid]) ? { ...raw[uuid] } : {};
	}
	if ( actorId && isActorIdNest(raw.Actor) && Object.prototype.hasOwnProperty.call(raw.Actor, actorId) ) {
		result.hasNested = true;
		result.nestedLegacyProfile = isCrewProfileObject(raw.Actor[actorId])
			? { ...raw.Actor[actorId] }
			: {};
	}
	return result;
}

/**
 * @param {unknown} raw
 * @returns {Set<string>}
 */
function listCrewProfileActorUuids(raw) {
	const uuids = new Set();
	if ( !isCrewProfileObject(raw) ) return uuids;
	for ( const [key, value] of Object.entries(raw) ) {
		if ( !key ) continue;
		if ( key.includes(CREW_PROFILE_KEY_DOT) ) {
			uuids.add(fromCrewProfileStorageKey(key));
			continue;
		}
		if ( key === "Actor" && isActorIdNest(value) ) {
			for ( const id of Object.keys(value) ) {
				if ( id ) uuids.add(`Actor.${id}`);
			}
			continue;
		}
		if ( key.includes(".") ) uuids.add(key);
	}
	return uuids;
}

/**
 * Merge sibling fields: later profiles overwrite earlier (call with nested → raw → canonical).
 * `customRole` is never copied from profile layers here.
 * @param {...(object|null|undefined)} profiles
 * @returns {object}
 */
function mergeCrewProfileSiblings(...profiles) {
	const result = {};
	for ( const profile of profiles ) {
		if ( !isCrewProfileObject(profile) ) continue;
		for ( const [key, value] of Object.entries(profile) ) {
			if ( key === "customRole" ) continue;
			result[key] = value;
		}
	}
	return result;
}

/**
 * Role string from a single profile object.
 * @param {object|null|undefined} profile
 * @returns {string}
 */
function customRoleFromProfile(profile) {
	const role = profile?.customRole;
	return typeof role === "string" ? role : "";
}

/**
 * Compatibility reader role from located shapes (missing vs empty canonical).
 * @param {ReturnType<typeof locateCrewProfileShapes>} shapes
 * @returns {string}
 */
function resolveCustomRoleFromShapes(shapes) {
	if ( shapes.hasCanonical ) {
		const role = customRoleFromProfile(shapes.canonicalProfile);
		return typeof role === "string" && role.trim() ? normalizeCustomRoleText(role) : "";
	}
	for ( const profile of [shapes.rawUuidProfile, shapes.nestedLegacyProfile] ) {
		const role = customRoleFromProfile(profile);
		if ( typeof role === "string" && role.trim() ) return normalizeCustomRoleText(role);
	}
	return "";
}

/**
 * Pure helper: rebuild crewProfiles as encoded-only map for one Actor mutation.
 * Preserves other Actors; merges target siblings (canonical wins; legacy fills gaps);
 * customRole for target comes only from nextRole (omit when clear + no siblings).
 * @param {{
 *   rawProfiles: unknown,
 *   actorUuid: string,
 *   nextRole: string,
 *   removeTarget?: boolean
 * }} options
 * @returns {Record<string, object>}
 */
function canonicalizeCrewProfilesForActor({
	rawProfiles,
	actorUuid,
	nextRole,
	removeTarget = false
} = {}) {
	const cleaned = {};
	const targetUuid = String(actorUuid ?? "");
	const uuids = listCrewProfileActorUuids(rawProfiles);
	if ( targetUuid ) uuids.add(targetUuid);

	for ( const uuid of uuids ) {
		const shapes = locateCrewProfileShapes(rawProfiles, uuid);
		const siblings = mergeCrewProfileSiblings(
			shapes.nestedLegacyProfile,
			shapes.rawUuidProfile,
			shapes.canonicalProfile
		);

		if ( uuid === targetUuid ) {
			if ( removeTarget ) continue;
			const role = normalizeCustomRoleText(nextRole);
			if ( role ) {
				cleaned[shapes.storageKey] = { ...siblings, customRole: role };
			} else if ( Object.keys(siblings).length ) {
				cleaned[shapes.storageKey] = { ...siblings };
			}
			continue;
		}

		const role = resolveCustomRoleFromShapes(shapes);
		if ( role ) cleaned[shapes.storageKey] = { ...siblings, customRole: role };
		else if ( Object.keys(siblings).length || shapes.hasCanonical || shapes.hasRawUuid || shapes.hasNested ) {
			if ( Object.keys(siblings).length ) cleaned[shapes.storageKey] = { ...siblings };
			else if ( shapes.hasCanonical || shapes.hasRawUuid || shapes.hasNested ) {
				// Preserve empty profile shell only if it existed somehow without siblings/role — skip empty.
			}
		}
	}
	return cleaned;
}

/**
 * Normalize raw flag data into an encoded-key profile map.
 * Recovers Foundry-split shapes (`{ Actor: { <id>: profile } }`) from failed prior writes.
 * @param {unknown} raw
 * @returns {Record<string, object>}
 */
function normalizeCrewProfilesMap(raw) {
	const map = {};
	if ( !raw || typeof raw !== "object" || Array.isArray(raw) ) return map;

	const assignProfile = (uuid, value) => {
		if ( !uuid ) return;
		const storageKey = toCrewProfileStorageKey(uuid);
		map[storageKey] = value && typeof value === "object" && !Array.isArray(value)
			? { ...value }
			: {};
	};

	for ( const [key, value] of Object.entries(raw) ) {
		if ( !key ) continue;

		// Split form from expandObject: Actor -> { id -> profile }
		if ( key === "Actor" && value && typeof value === "object" && !Array.isArray(value) ) {
			const looksLikeNest = !Object.prototype.hasOwnProperty.call(value, "customRole")
				&& !Object.prototype.hasOwnProperty.call(value, "hidden");
			if ( looksLikeNest ) {
				for ( const [id, profile] of Object.entries(value) ) {
					if ( !id ) continue;
					assignProfile(`Actor.${id}`, profile);
				}
				continue;
			}
		}

		if ( key.includes(CREW_PROFILE_KEY_DOT) ) {
			assignProfile(fromCrewProfileStorageKey(key), value);
			continue;
		}
		if ( key.includes(".") ) {
			assignProfile(key, value);
			continue;
		}
		// Unknown bare key — keep under encoded form of itself (no dots to split).
		assignProfile(key, value);
	}
	return map;
}

/**
 * @param {object} profile
 * @returns {boolean}
 */
function profileHasSiblings(profile) {
	if ( !isCrewProfileObject(profile) ) return false;
	const copy = { ...profile };
	delete copy.customRole;
	return Object.keys(copy).length > 0;
}

/**
 * Build the canonical profile object for a membership-hidden write while preserving customRole.
 * @param {ReturnType<typeof locateCrewProfileShapes>} shapes
 * @param {boolean} hidden
 * @returns {object}
 */
function buildMembershipHiddenTargetProfile(shapes, hidden) {
	const siblings = mergeCrewProfileSiblings(
		shapes.nestedLegacyProfile,
		shapes.rawUuidProfile,
		shapes.canonicalProfile
	);
	delete siblings.hidden;
	const role = resolveCustomRoleFromShapes(shapes);
	const target = { ...siblings };
	if ( role ) target.customRole = role;
	if ( hidden ) target.hidden = true;
	return target;
}

/**
 * Compose a membership-hidden write without touching Actor documents.
 * Callers merge `narrow` updates into a larger starship.update payload when possible.
 * @param {Actor} starship
 * @param {string} actorUuid
 * @param {boolean} hidden
 * @returns {{ mode: "noop" }|{ mode: "narrow", update: object }|{ mode: "replace", cleaned: Record<string, object> }}
 */
function composeCrewMembershipHiddenWrite(starship, actorUuid, hidden) {
	const rawProfiles = cloneDeep(starship?.flags?.sw5e?.starship?.crewProfiles ?? {});
	const shapes = locateCrewProfileShapes(rawProfiles, actorUuid);
	const storageKey = toCrewProfileStorageKey(actorUuid);
	const targetProfile = buildMembershipHiddenTargetProfile(shapes, hidden);
	const hasContent = Object.keys(targetProfile).length > 0;

	if ( shapes.hasRawUuid ) {
		const cleaned = canonicalizeCrewProfilesForActor({
			rawProfiles,
			actorUuid,
			nextRole: resolveCustomRoleFromShapes(shapes),
			removeTarget: !hasContent
		});
		if ( hasContent ) cleaned[storageKey] = targetProfile;
		else delete cleaned[storageKey];
		return { mode: "replace", cleaned };
	}

	const update = {};
	if ( hasContent ) {
		update[`flags.sw5e.starship.crewProfiles.${storageKey}`] = targetProfile;
	} else if ( shapes.hasCanonical ) {
		update[`flags.sw5e.starship.crewProfiles.-=${storageKey}`] = null;
	}

	// Drop nested Actor→id legacy for this UUID so encoded key remains authoritative.
	if ( shapes.hasNested && shapes.actorId ) {
		update[`flags.sw5e.starship.crewProfiles.Actor.-=${shapes.actorId}`] = null;
	}

	if ( !Object.keys(update).length ) return { mode: "noop" };
	return { mode: "narrow", update };
}

/**
 * Persist `crewProfiles.*.hidden` for one Actor UUID (preserve customRole + siblings).
 * @param {Actor} starship
 * @param {string} actorUuid
 * @param {boolean} hidden
 * @returns {Promise<{ ok: true }|{ ok: false, reason: string }>}
 */
async function persistCrewMembershipHidden(starship, actorUuid, hidden) {
	const composed = composeCrewMembershipHiddenWrite(starship, actorUuid, hidden);
	if ( composed.mode === "noop" ) return { ok: true };
	if ( composed.mode === "replace" ) {
		const replaced = await replaceCrewProfilesMap(starship, composed.cleaned);
		return replaced ? { ok: true } : { ok: false, reason: "update" };
	}
	try {
		await starship.update(composed.update);
	} catch ( _err ) {
		return { ok: false, reason: "update" };
	}
	return { ok: true };
}

/**
 * Persist cleaned profiles when a raw dotted UUID key exists (non-atomic two-step).
 * @param {Actor} starship
 * @param {Record<string, object>} cleanedProfiles
 * @returns {Promise<boolean>}
 */
async function replaceCrewProfilesMap(starship, cleanedProfiles) {
	try {
		await starship.update({ "flags.sw5e.starship.-=crewProfiles": null });
	} catch ( _err ) {
		return false;
	}
	try {
		await starship.update({ "flags.sw5e.starship.crewProfiles": cleanedProfiles });
	} catch ( _err ) {
		return false;
	}
	return true;
}

/**
 * Narrow Foundry updates for canonical + nested shapes (no raw dotted UUID key).
 * @param {string} storageKey
 * @param {string|null} actorId
 * @param {ReturnType<typeof locateCrewProfileShapes>} shapes
 * @param {string} nextRole
 * @param {object} targetProfile
 * @returns {object}
 */
function buildNarrowCrewProfileUpdate(storageKey, actorId, shapes, nextRole, targetProfile) {
	const update = {};
	if ( nextRole ) {
		update[`flags.sw5e.starship.crewProfiles.${storageKey}`] = targetProfile;
	} else if ( shapes.hasCanonical ) {
		if ( profileHasSiblings(shapes.canonicalProfile) ) {
			update[`flags.sw5e.starship.crewProfiles.${storageKey}.-=customRole`] = null;
		} else {
			update[`flags.sw5e.starship.crewProfiles.-=${storageKey}`] = null;
		}
	}

	if ( shapes.hasNested && actorId ) {
		if ( profileHasSiblings(shapes.nestedLegacyProfile) ) {
			update[`flags.sw5e.starship.crewProfiles.Actor.${actorId}.-=customRole`] = null;
		} else {
			update[`flags.sw5e.starship.crewProfiles.Actor.-=${actorId}`] = null;
		}
	}
	return update;
}

/**
 * After clear with siblings on canonical only, ensure customRole removed via narrow path;
 * when setting, targetProfile already includes role.
 * When clearing and canonical missing but nested present, nested deletes alone suffice.
 * When setting and no legacy, write encoded key only.
 * @param {Actor} starship
 * @param {string} actorUuid
 * @param {string} nextRole
 * @param {boolean} [removeTarget]
 * @returns {Promise<{ ok: true }|{ ok: false, reason: string }>}
 */
async function persistCanonicalCrewProfile(starship, actorUuid, nextRole, removeTarget = false) {
	const rawProfiles = cloneDeep(starship?.flags?.sw5e?.starship?.crewProfiles ?? {});
	const shapes = locateCrewProfileShapes(rawProfiles, actorUuid);
	const cleaned = canonicalizeCrewProfilesForActor({
		rawProfiles,
		actorUuid,
		nextRole,
		removeTarget
	});
	const storageKey = toCrewProfileStorageKey(actorUuid);
	const targetProfile = cleaned[storageKey] ?? {};

	if ( shapes.hasRawUuid ) {
		const replaced = await replaceCrewProfilesMap(starship, cleaned);
		return replaced ? { ok: true } : { ok: false, reason: "update" };
	}

	if ( removeTarget ) {
		const update = {};
		if ( shapes.hasCanonical ) {
			update[`flags.sw5e.starship.crewProfiles.-=${storageKey}`] = null;
		}
		if ( shapes.hasNested && shapes.actorId ) {
			update[`flags.sw5e.starship.crewProfiles.Actor.-=${shapes.actorId}`] = null;
		}
		if ( !Object.keys(update).length ) return { ok: true };
		try {
			await starship.update(update);
		} catch ( _err ) {
			return { ok: false, reason: "update" };
		}
		return { ok: true };
	}

	const narrow = buildNarrowCrewProfileUpdate(
		storageKey,
		shapes.actorId,
		shapes,
		nextRole,
		targetProfile
	);

	// Canonical-only set with no nested: write encoded key (or clear via narrow).
	if ( !Object.keys(narrow).length && nextRole ) {
		narrow[`flags.sw5e.starship.crewProfiles.${storageKey}`] = targetProfile;
	}

	if ( !Object.keys(narrow).length ) return { ok: true };

	try {
		await starship.update(narrow);
	} catch ( _err ) {
		return { ok: false, reason: "update" };
	}
	return { ok: true };
}

/**
 * @param {Actor|null|undefined} starship
 * @param {string} uuid
 * @returns {boolean}
 */
export function isStarshipCrewMemberUuid(starship, uuid) {
	if ( !starship || !uuid || !isLegacyVehicleStarship(starship) ) return false;
	const deployment = cloneStarshipDeployment(starship);
	return getDeploymentRolesForUuid(deployment, uuid).length > 0;
}

/**
 * Ship-owned custom role for a crew UUID.
 * If a canonical encoded profile exists, return its role (or "") — never fall through to legacy.
 * Only when the canonical profile is missing: raw UUID, then nested Actor→id.
 * @param {Actor|null|undefined} starship
 * @param {string} uuid
 * @returns {string}
 */
export function getStarshipCrewCustomRole(starship, uuid) {
	if ( !starship || !uuid ) return "";
	const shapes = locateCrewProfileShapes(starship?.flags?.sw5e?.starship?.crewProfiles, uuid);
	return resolveCustomRoleFromShapes(shapes);
}

/**
 * Ship-owned membership concealment flag (Bug 6 / Bug 28).
 * Prefers membershipId profile key; falls back to source Actor UUID legacy keys.
 * @param {Actor|null|undefined} starship
 * @param {string} membershipIdOrUuid membershipId preferred; Actor UUID still accepted
 * @param {string} [sourceActorUuid]
 * @returns {boolean}
 */
export function getStarshipCrewMembershipHidden(starship, membershipIdOrUuid, sourceActorUuid="") {
	if ( !starship || !membershipIdOrUuid ) return false;
	const membership = findStarshipCrewMembership(starship, membershipIdOrUuid);
	if ( membership ) {
		return readMembershipHiddenFlag(starship, membership.membershipId, membership.sourceActorUuid);
	}
	if ( sourceActorUuid ) {
		return readMembershipHiddenFlag(starship, membershipIdOrUuid, sourceActorUuid);
	}
	// Legacy: treat arg as Actor UUID (and also try as membershipId key).
	return readMembershipHiddenFlag(starship, membershipIdOrUuid, membershipIdOrUuid);
}

/**
 * Set or clear ship-owned membership concealment (Bug 6 / Bug 28).
 * Prefer membershipId: aggregates write the membershipId profile key; individuals keep UUID key.
 * @param {Actor|string} starshipSubject
 * @param {string} membershipIdOrCrewUuid
 * @param {boolean} hidden
 * @returns {Promise<{ ok: true, actorUuid: string, membershipId: string, hidden: boolean }|{ ok: false, reason: string }>}
 */
export async function setStarshipCrewMembershipHidden(starshipSubject, membershipIdOrCrewUuid, hidden) {
	const starship = resolveActorDocument(starshipSubject);
	const ref = typeof membershipIdOrCrewUuid === "string" ? membershipIdOrCrewUuid : "";
	if ( !ref ) return { ok: false, reason: "no-uuid" };
	if ( !starship || !isLegacyVehicleStarship(starship) ) return { ok: false, reason: "not-starship" };
	if ( globalThis.game?.user?.isGM !== true ) return { ok: false, reason: "permission" };

	const membership = findStarshipCrewMembership(starship, ref)
		?? resolveStarshipCrewMemberships(starship).find(m => m.sourceActorUuid === ref)
		?? null;
	if ( !membership ) return { ok: false, reason: "membership" };

	const profileIdentity = membership.kind === "aggregate"
		? membership.membershipId
		: membership.sourceActorUuid;
	const nextHidden = hidden === true;
	if ( getStarshipCrewMembershipHidden(starship, membership.membershipId, membership.sourceActorUuid) === nextHidden ) {
		return {
			ok: true,
			actorUuid: membership.sourceActorUuid,
			membershipId: membership.membershipId,
			hidden: nextHidden
		};
	}

	const persist = await persistCrewMembershipHidden(starship, profileIdentity, nextHidden);
	if ( persist.ok !== true ) return persist;

	const readback = getStarshipCrewMembershipHidden(
		starship,
		membership.membershipId,
		membership.sourceActorUuid
	);
	if ( readback !== nextHidden ) {
		console.debug("SW5E MODULE | Membership hidden readback failed", {
			membershipId: membership.membershipId,
			expected: nextHidden,
			readback
		});
		return { ok: false, reason: "readback" };
	}

	return {
		ok: true,
		actorUuid: membership.sourceActorUuid,
		membershipId: membership.membershipId,
		hidden: nextHidden
	};
}

/**
 * Normalize custom role text: trim, soft-truncate to max length, empty → "".
 * @param {unknown} value
 * @returns {string}
 */
function normalizeCustomRoleText(value) {
	const trimmed = String(value ?? "").trim();
	if ( !trimmed ) return "";
	if ( trimmed.length <= STARSHIP_CREW_CUSTOM_ROLE_MAX_LENGTH ) return trimmed;
	return trimmed.slice(0, STARSHIP_CREW_CUSTOM_ROLE_MAX_LENGTH);
}

/**
 * Set or clear ship-owned custom role (Bug 28: membershipId for aggregates).
 * @param {Actor|string} starshipSubject
 * @param {string} membershipIdOrCrewUuid
 * @param {unknown} roleText
 * @returns {Promise<{ ok: true, actorUuid: string, membershipId: string, customRole: string }|{ ok: false, reason: string }>}
 */
export async function setStarshipCrewCustomRole(starshipSubject, membershipIdOrCrewUuid, roleText) {
	const starship = resolveActorDocument(starshipSubject);
	const ref = typeof membershipIdOrCrewUuid === "string" ? membershipIdOrCrewUuid : "";
	if ( !ref ) return { ok: false, reason: "no-uuid" };
	if ( !starship || !isLegacyVehicleStarship(starship) ) return { ok: false, reason: "not-starship" };
	if ( !canCurrentUserUpdateStarshipActor(starship) ) return { ok: false, reason: "permission" };

	const membership = findStarshipCrewMembership(starship, ref)
		?? resolveStarshipCrewMemberships(starship).find(m => m.sourceActorUuid === ref)
		?? null;
	if ( !membership ) return { ok: false, reason: "membership" };

	const profileIdentity = membership.kind === "aggregate"
		? membership.membershipId
		: membership.sourceActorUuid;
	const storageKey = toCrewProfileStorageKey(profileIdentity);
	const nextRole = normalizeCustomRoleText(roleText);

	const persist = await persistCanonicalCrewProfile(starship, profileIdentity, nextRole, false);
	if ( persist.ok !== true ) return persist;

	const readback = membership.kind === "aggregate"
		? getStarshipCrewCustomRoleForMembership(starship, membership.membershipId, membership.sourceActorUuid)
		: getStarshipCrewCustomRole(starship, membership.sourceActorUuid);
	if ( readback !== nextRole ) {
		const stored = starship?.flags?.sw5e?.starship?.crewProfiles;
		const storedKeys = stored && typeof stored === "object" ? Object.keys(stored) : [];
		const shapes = locateCrewProfileShapes(stored, profileIdentity);
		console.debug("SW5E MODULE | Custom Role readback failed", {
			actorUuid: membership.sourceActorUuid,
			membershipId: membership.membershipId,
			storageKey,
			expected: nextRole,
			readback,
			storedKeys,
			hasCanonical: shapes.hasCanonical,
			hasRawUuid: shapes.hasRawUuid,
			hasNested: shapes.hasNested
		});
		return { ok: false, reason: "readback" };
	}

	return {
		ok: true,
		actorUuid: membership.sourceActorUuid,
		membershipId: membership.membershipId,
		customRole: nextRole
	};
}

function syncDeploymentActiveFlags(deployment) {
	const activeUuid = deployment?.active?.value ?? null;
	if ( activeUuid && !collectDeploymentUuids(deployment).has(activeUuid) ) {
		deployment.active.value = null;
	}
	const currentActive = deployment?.active?.value ?? null;
	deployment.pilot.active = Boolean(currentActive && (deployment.pilot.value === currentActive));
	deployment.crew.active = Boolean(currentActive && deployment.crew.items.has(currentActive));
	deployment.passenger.active = Boolean(currentActive && deployment.passenger.items.has(currentActive));
	return deployment;
}

function cloneStarshipDeployment(starship) {
	const legacySystem = getLegacyStarshipActorSystem(starship) ?? {};
	return getDeploymentState(legacySystem.attributes?.deployment);
}

function buildDeploymentUpdateData(deployment) {
	syncDeploymentActiveFlags(deployment);
	// Vehicle actors store deployment in flags — dnd5e's DataModel silently discards writes to system.attributes.*
	const prefix = "flags.sw5e.legacyStarshipActor.system.attributes.deployment";
	return {
		[`${prefix}.pilot.value`]: deployment.pilot.value,
		[`${prefix}.pilot.active`]: deployment.pilot.active,
		[`${prefix}.crew.items`]: Array.from(deployment.crew.items),
		[`${prefix}.crew.active`]: deployment.crew.active,
		[`${prefix}.passenger.items`]: Array.from(deployment.passenger.items),
		[`${prefix}.passenger.active`]: deployment.passenger.active,
		[`${prefix}.active.value`]: deployment.active.value
	};
}

function buildCrewDeploymentFlagData(starship, roles) {
	return {
		starshipUuid: starship.uuid,
		starshipName: starship.name ?? "",
		roles: Array.from(new Set(roles)).sort()
	};
}

async function updateCrewDeploymentFlag(actor, starship, roles) {
	const normalizedRoles = Array.from(new Set(roles)).filter(role => STARSHIP_DEPLOYMENT_ROLES.includes(role));
	if ( !normalizedRoles.length ) {
		return actor.update({
			[`flags.sw5e.-=${STARSHIP_CREW_DEPLOYMENT_FLAG}`]: null
		});
	}
	return actor.update({
		[`flags.sw5e.${STARSHIP_CREW_DEPLOYMENT_FLAG}`]: buildCrewDeploymentFlagData(starship, normalizedRoles)
	});
}

/**
 * Complete Actor write set for deploy/transfer/pilot-replace — resolve only, no writes.
 * Fail closed (`ok: false`) if a required participant cannot be resolved.
 * @returns {{ ok: boolean, actors: object[] }}
 */
function resolveDeployWriteSet(starship, crewActor, role) {
	if ( !starship || !crewActor ) return { ok: false, actors: [] };
	if ( !isLegacyVehicleStarship(starship) ) return { ok: false, actors: [] };
	if ( !isDeployableCrewActor(crewActor) ) return { ok: false, actors: [] };
	if ( !STARSHIP_DEPLOYMENT_ROLES.includes(role) ) return { ok: false, actors: [] };

	/** @type {Map<string, object>} */
	const byKey = new Map();
	const add = actor => {
		if ( !actor ) return;
		const key = actor.uuid || actor.id;
		if ( key ) byKey.set(key, actor);
	};

	add(starship);
	add(crewActor);

	const priorAssignment = getCrewDeploymentFlag(crewActor);
	if ( priorAssignment?.starshipUuid && (priorAssignment.starshipUuid !== starship.uuid) ) {
		const previousStarship = resolveActorDocument(priorAssignment.starshipUuid);
		if ( !previousStarship ) return { ok: false, actors: [] };
		add(previousStarship);
	}

	if ( role === "pilot" ) {
		const deployment = cloneStarshipDeployment(starship);
		const displacedUuid = (deployment.pilot.value && (deployment.pilot.value !== crewActor.uuid))
			? deployment.pilot.value
			: null;
		if ( displacedUuid ) {
			const displacedPilot = resolveActorDocument(displacedUuid);
			if ( !displacedPilot ) return { ok: false, actors: [] };
			add(displacedPilot);
		}
	}

	return { ok: true, actors: Array.from(byKey.values()) };
}

function resolveUndeployWriteSet(starship, crewActor) {
	if ( !starship || !crewActor ) return { ok: false, actors: [] };
	if ( !isLegacyVehicleStarship(starship) ) return { ok: false, actors: [] };
	if ( !isDeployableCrewActor(crewActor) ) return { ok: false, actors: [] };
	return { ok: true, actors: [starship, crewActor] };
}

function canUpdateAllActors(actors) {
	if ( !Array.isArray(actors) || !actors.length ) return false;
	return actors.every(actor => canCurrentUserUpdateStarshipActor(actor));
}

/**
 * Presentation + selection-time helper: true when the full deploy write set is authorized.
 * Mutation helpers re-run the same resolve+permission preflight before any write.
 * @param {object|string} starshipSubject
 * @param {object|string} crewSubject
 * @param {string} role
 * @returns {boolean}
 */
export function canCurrentUserDeployStarshipCrewRole(starshipSubject, crewSubject, role) {
	const starship = resolveActorDocument(starshipSubject);
	const crewActor = resolveActorDocument(crewSubject);
	const writeSet = resolveDeployWriteSet(starship, crewActor, role);
	if ( !writeSet.ok ) return false;
	return canUpdateAllActors(writeSet.actors);
}

/**
 * Presentation helper: true when the undeploy write set is authorized.
 * Mutation helpers re-run the same resolve+permission preflight before any write.
 * @param {object|string} starshipSubject
 * @param {object|string} crewSubject
 * @returns {boolean}
 */
export function canCurrentUserUndeployStarshipCrew(starshipSubject, crewSubject) {
	const starship = resolveActorDocument(starshipSubject);
	const crewActor = resolveActorDocument(crewSubject);
	const writeSet = resolveUndeployWriteSet(starship, crewActor);
	if ( !writeSet.ok ) return false;
	return canUpdateAllActors(writeSet.actors);
}

/**
 * Resolve subjects once to distinct deployable crew Actors (ordered by first appearance).
 * Fail closed if any non-empty subject cannot be resolved to a deployable character/npc.
 * @param {Array<object|string>} subjects
 * @returns {{ ok: boolean, crewActors: object[] }}
 */
export function resolveDistinctCrewActors(subjects) {
	const list = Array.isArray(subjects) ? subjects : [];
	/** @type {Map<string, object>} */
	const byUuid = new Map();
	for ( const subject of list ) {
		if ( subject == null || subject === "" ) continue;
		const actor = resolveActorDocument(subject);
		if ( !actor || !isDeployableCrewActor(actor) ) return { ok: false, crewActors: [] };
		const key = actor.uuid || actor.id;
		if ( !key ) return { ok: false, crewActors: [] };
		if ( !byUuid.has(key) ) byUuid.set(key, actor);
	}
	const crewActors = Array.from(byUuid.values());
	if ( !crewActors.length ) return { ok: false, crewActors: [] };
	return { ok: true, crewActors };
}

/**
 * Combined write set for a batch deploy — resolve only, no writes.
 * Unions per-Actor write sets (transfers, pilot displacement, shared ships).
 * Pilot role requires exactly one crew Actor.
 * @param {object} starship already-resolved starship Actor
 * @param {object[]} crewActors already-resolved distinct crew Actors
 * @param {string} role
 * @returns {{ ok: boolean, actors: object[], crewActors: object[] }}
 */
export function resolveDeployWriteSetBatch(starship, crewActors, role) {
	if ( !starship || !isLegacyVehicleStarship(starship) ) return { ok: false, actors: [], crewActors: [] };
	if ( !Array.isArray(crewActors) || !crewActors.length ) return { ok: false, actors: [], crewActors: [] };
	if ( !STARSHIP_DEPLOYMENT_ROLES.includes(role) ) return { ok: false, actors: [], crewActors: [] };
	if ( role === "pilot" && crewActors.length !== 1 ) return { ok: false, actors: [], crewActors: [] };

	/** @type {Map<string, object>} */
	const byKey = new Map();
	const add = actor => {
		if ( !actor ) return;
		const key = actor.uuid || actor.id;
		if ( key ) byKey.set(key, actor);
	};

	for ( const crewActor of crewActors ) {
		const writeSet = resolveDeployWriteSet(starship, crewActor, role);
		if ( !writeSet.ok ) return { ok: false, actors: [], crewActors: [] };
		for ( const actor of writeSet.actors ) add(actor);
	}

	return { ok: true, actors: Array.from(byKey.values()), crewActors };
}

/**
 * Combined write-set preflight for batch deploy. No writes.
 * @param {object|string} starshipSubject
 * @param {Array<object|string>} subjects
 * @param {string} role
 * @returns {{ ok: boolean, starship: object|null, crewActors: object[], actors: object[], phase: string }}
 */
export function preflightDeployStarshipCrewBatch(starshipSubject, subjects, role) {
	const starship = resolveActorDocument(starshipSubject);
	if ( !starship || !isLegacyVehicleStarship(starship) ) {
		return { ok: false, starship: null, crewActors: [], actors: [], phase: "preflight" };
	}
	const resolved = resolveDistinctCrewActors(subjects);
	if ( !resolved.ok ) {
		return { ok: false, starship, crewActors: [], actors: [], phase: "preflight" };
	}
	const writeSet = resolveDeployWriteSetBatch(starship, resolved.crewActors, role);
	if ( !writeSet.ok || !canUpdateAllActors(writeSet.actors) ) {
		return { ok: false, starship, crewActors: resolved.crewActors, actors: writeSet.actors ?? [], phase: "preflight" };
	}
	return {
		ok: true,
		starship,
		crewActors: writeSet.crewActors,
		actors: writeSet.actors,
		phase: "preflight"
	};
}

function buildResolvedCrewRecordFromMembership(deployment, membership, starship, { sheetEditable = true } = {}) {
	const uuid = membership.sourceActorUuid;
	const actor = resolveActorDocument(uuid);
	const roles = membership.roles?.length
		? membership.roles
		: getDeploymentRolesForUuid(deployment, uuid);
	const canShip = canCurrentUserUpdateStarshipActor(starship);
	const canCrew = Boolean(actor) && canCurrentUserUpdateStarshipActor(actor);
	const canMutateAssignment = sheetEditable && canShip && canCrew;
	const canSetPilot = sheetEditable && Boolean(actor)
		&& canCurrentUserDeployStarshipCrewRole(starship, actor, "pilot");
	const kind = membership.kind === "aggregate" ? "aggregate" : "individual";
	const quantity = kind === "aggregate"
		? Math.max(1, Math.floor(Number(membership.quantity) || 1))
		: 1;
	const canPromote = kind === "individual" && actor?.type === "npc";
	const canAdjustQuantity = Boolean(
		sheetEditable && canShip && (kind === "aggregate" || canPromote)
	);
	return {
		membershipId: membership.membershipId,
		uuid,
		sourceActorUuid: uuid,
		kind,
		quantity,
		name: actor?.name ?? "Unknown Crew",
		img: actor?.img || "icons/svg/mystery-man.svg",
		type: actor?.type ?? "",
		isPilot: roles.includes("pilot"),
		isCrew: roles.includes("crew"),
		isPassenger: roles.includes("passenger"),
		roles,
		proficiency: toNumber(actor?.system?.attributes?.prof, 0),
		pilotSkill: toNumber(actor?.system?.skills?.pil?.value, 0),
		canRemove: canMutateAssignment,
		canUndeployPilot: canMutateAssignment && roles.includes("pilot"),
		canSetPilot,
		canAdjustQuantity,
		canQuantityIncrement: canAdjustQuantity,
		canQuantityDecrement: canAdjustQuantity && kind === "aggregate" && quantity > 1
	};
}

function compareCrewRecords(left, right) {
	// Bug 29D: Pilot-first, then deterministic name. No Active-first sorting.
	if ( left.isPilot !== right.isPilot ) return left.isPilot ? -1 : 1;
	return left.name.localeCompare(right.name);
}

function buildResolvedCrewRoster(deployment, starship, options = {}) {
	return resolveStarshipCrewMemberships(starship, deployment)
		.map(membership => buildResolvedCrewRecordFromMembership(deployment, membership, starship, options))
		.sort(compareCrewRecords);
}

function availableCrewTypeRank(type) {
	if ( type === "character" ) return 0;
	if ( type === "npc" ) return 1;
	return 2;
}

function compareAvailableCrewChoices(left, right) {
	const typeCmp = availableCrewTypeRank(left?.type) - availableCrewTypeRank(right?.type);
	if ( typeCmp !== 0 ) return typeCmp;
	const leftName = String(left?.name ?? "");
	const rightName = String(right?.name ?? "");
	return leftName.localeCompare(rightName);
}

export function buildAvailableStarshipCrewChoices(starship) {
	if ( !globalThis.game?.actors ) return [];
	if ( !isLegacyVehicleStarship(starship) ) return [];

	const isGM = globalThis.game?.user?.isGM === true;
	if ( !isGM && !canCurrentUserUpdateStarshipActor(starship) ) return [];

	// Narrow before expensive deployment/permission work: characters and NPCs only.
	const choices = [];
	for ( const actor of game.actors ) {
		if ( actor.id === starship.id ) continue;
		if ( actor.type !== "character" && actor.type !== "npc" ) continue;
		if ( !isGM && !canCurrentUserUpdateStarshipActor(actor) ) continue;

		const deploymentFlag = getCrewDeploymentFlag(actor);
		const assignedShip = deploymentFlag?.starshipUuid ? resolveActorDocument(deploymentFlag.starshipUuid) : null;
		const canDeployPilot = canCurrentUserDeployStarshipCrewRole(starship, actor, "pilot");
		const canDeployCrew = canCurrentUserDeployStarshipCrewRole(starship, actor, "crew");
		const canDeployPassenger = canCurrentUserDeployStarshipCrewRole(starship, actor, "passenger");
		if ( !canDeployPilot && !canDeployCrew && !canDeployPassenger ) continue;

		choices.push({
			uuid: actor.uuid,
			name: actor.name,
			img: actor.img,
			type: actor.type,
			assignedElsewhere: Boolean(deploymentFlag?.starshipUuid && (deploymentFlag.starshipUuid !== starship.uuid)),
			assignedShipName: assignedShip?.name ?? deploymentFlag?.starshipName ?? "",
			roles: Array.isArray(deploymentFlag?.roles) ? deploymentFlag.roles : [],
			canDeployPilot,
			canDeployCrew,
			canDeployPassenger
		});
	}
	return choices.sort(compareAvailableCrewChoices);
}

/**
 * Adjust aggregate quantity or promote individual NPC → aggregate (EDIT +).
 * @param {Actor|string} starshipSubject
 * @param {string} membershipId
 * @param {number} delta
 * @returns {Promise<{ ok: true, membershipId: string, quantity: number, kind: string }|{ ok: false, reason: string }>}
 */
export async function adjustStarshipCrewMembershipQuantity(starshipSubject, membershipId, delta) {
	const starship = resolveActorDocument(starshipSubject);
	const id = String(membershipId ?? "").trim();
	const step = Math.trunc(Number(delta) || 0);
	if ( !id || !step ) return { ok: false, reason: "invalid" };
	if ( !starship || !isLegacyVehicleStarship(starship) ) return { ok: false, reason: "not-starship" };
	if ( !canCurrentUserUpdateStarshipActor(starship) ) return { ok: false, reason: "permission" };

	const membership = findStarshipCrewMembership(starship, id);
	if ( !membership ) return { ok: false, reason: "membership" };

	const sourceActor = resolveActorDocument(membership.sourceActorUuid);
	if ( !sourceActor ) return { ok: false, reason: "no-actor" };

	// Already aggregate: increment/decrement only (min 1).
	if ( membership.kind === "aggregate" ) {
		const nextQty = Math.max(1, membership.quantity + step);
		if ( nextQty === membership.quantity ) {
			return {
				ok: true,
				membershipId: membership.membershipId,
				quantity: membership.quantity,
				kind: "aggregate"
			};
		}
		const update = {
			[`${CREW_MEMBERSHIPS_PATH}.${membership.membershipId}`]: {
				sourceActorUuid: membership.sourceActorUuid,
				kind: "aggregate",
				quantity: nextQty,
				roles: membership.roles
			}
		};
		try {
			await starship.update(update);
		} catch ( _err ) {
			return { ok: false, reason: "update" };
		}
		return {
			ok: true,
			membershipId: membership.membershipId,
			quantity: nextQty,
			kind: "aggregate"
		};
	}

	// Individual: only + promotes NPC → aggregate qty 2 (or increments existing aggregate for same source).
	if ( step < 0 ) return { ok: false, reason: "individual" };
	if ( sourceActor.type !== "npc" ) return { ok: false, reason: "pc" };

	const existingAgg = resolveStarshipCrewMemberships(starship)
		.find(m => m.kind === "aggregate" && m.sourceActorUuid === membership.sourceActorUuid);
	if ( existingAgg ) {
		return adjustStarshipCrewMembershipQuantity(starship, existingAgg.membershipId, step);
	}

	const newId = createAggregateMembershipId();
	const roles = membership.roles.length
		? membership.roles
		: getDeploymentRolesForUuid(cloneStarshipDeployment(starship), membership.sourceActorUuid);
	const profile = cloneCompleteCrewProfileForIdentity(starship, membership.sourceActorUuid);
	const memKey = `${CREW_MEMBERSHIPS_PATH}.${newId}`;
	const profileKey = `flags.sw5e.starship.crewProfiles.${toCrewProfileStorageKey(newId)}`;
	const update = {
		[memKey]: {
			sourceActorUuid: membership.sourceActorUuid,
			kind: "aggregate",
			quantity: 2,
			roles
		},
		[profileKey]: profile
	};

	// Atomic with membershipId profile: remove legacy UUID profile keys in the same update.
	const legacyShapes = locateCrewProfileShapes(
		starship?.flags?.sw5e?.starship?.crewProfiles,
		membership.sourceActorUuid
	);
	if ( legacyShapes.hasCanonical ) {
		update[`flags.sw5e.starship.crewProfiles.-=${legacyShapes.storageKey}`] = null;
	}
	if ( legacyShapes.hasRawUuid ) {
		// Raw UUID keys need map replace — fall back to two-step after membershipId profile lands.
	}
	if ( legacyShapes.hasNested && legacyShapes.actorId ) {
		update[`flags.sw5e.starship.crewProfiles.Actor.-=${legacyShapes.actorId}`] = null;
	}

	try {
		await starship.update(update);
	} catch ( _err ) {
		return { ok: false, reason: "update" };
	}

	// Verify membershipId profile exists before considering legacy cleanup complete.
	const memShapes = locateCrewProfileShapes(starship?.flags?.sw5e?.starship?.crewProfiles, newId);
	if ( !memShapes.hasCanonical && Object.keys(profile).length > 0 ) {
		return { ok: false, reason: "profile-readback" };
	}

	if ( legacyShapes.hasRawUuid ) {
		const rawProfiles = cloneDeep(starship?.flags?.sw5e?.starship?.crewProfiles ?? {});
		const cleaned = canonicalizeCrewProfilesForActor({
			rawProfiles,
			actorUuid: membership.sourceActorUuid,
			nextRole: "",
			removeTarget: true
		});
		// Preserve the new membershipId profile in cleaned map.
		const enc = toCrewProfileStorageKey(newId);
		if ( memShapes.hasCanonical ) cleaned[enc] = memShapes.canonicalProfile;
		const replaced = await replaceCrewProfilesMap(starship, cleaned);
		if ( !replaced ) return { ok: false, reason: "update" };
	}

	return { ok: true, membershipId: newId, quantity: 2, kind: "aggregate" };
}

/**
 * Undeploy one membership by membershipId (Remove).
 * Removes source UUID from role Sets only when no remaining membership references it.
 * @param {Actor|string} starshipSubject
 * @param {string} membershipId
 * @returns {Promise<boolean>}
 */
export async function undeployStarshipCrewMembership(starshipSubject, membershipId) {
	const starship = resolveActorDocument(starshipSubject);
	const id = String(membershipId ?? "").trim();
	if ( !starship || !id ) return false;
	const membership = findStarshipCrewMembership(starship, id);
	if ( !membership ) return false;

	const crewActor = resolveActorDocument(membership.sourceActorUuid);
	if ( !crewActor ) return false;
	if ( !canUpdateAllActors([starship, crewActor]) ) return false;

	const deployment = cloneStarshipDeployment(starship);
	const remainingRefs = countMembershipsForSourceActor(starship, membership.sourceActorUuid, id);
	const updateData = {};

	if ( membership.written ) {
		updateData[`${CREW_MEMBERSHIPS_PATH}.-=${membership.membershipId}`] = null;
		updateData[`flags.sw5e.starship.crewProfiles.-=${toCrewProfileStorageKey(membership.membershipId)}`] = null;
	}

	if ( remainingRefs === 0 ) {
		if ( deployment.pilot.value === membership.sourceActorUuid ) deployment.pilot.value = null;
		deployment.crew.items.delete(membership.sourceActorUuid);
		deployment.passenger.items.delete(membership.sourceActorUuid);
		Object.assign(updateData, buildDeploymentUpdateData(deployment));

		const rawProfiles = cloneDeep(starship?.flags?.sw5e?.starship?.crewProfiles ?? {});
		const shapes = locateCrewProfileShapes(rawProfiles, membership.sourceActorUuid);
		if ( shapes.hasCanonical || shapes.hasRawUuid || shapes.hasNested ) {
			if ( shapes.hasRawUuid ) {
				await starship.update(updateData);
				const cleaned = canonicalizeCrewProfilesForActor({
					rawProfiles,
					actorUuid: membership.sourceActorUuid,
					nextRole: "",
					removeTarget: true
				});
				const replaced = await replaceCrewProfilesMap(starship, cleaned);
				if ( !replaced ) return false;
				await updateCrewDeploymentFlag(
					crewActor,
					starship,
					getDeploymentRolesForUuid(cloneStarshipDeployment(starship), membership.sourceActorUuid)
				);
				return true;
			}
			if ( shapes.hasCanonical ) {
				updateData[`flags.sw5e.starship.crewProfiles.-=${shapes.storageKey}`] = null;
			}
			if ( shapes.hasNested && shapes.actorId ) {
				updateData[`flags.sw5e.starship.crewProfiles.Actor.-=${shapes.actorId}`] = null;
			}
		}
	}

	if ( !Object.keys(updateData).length ) return true;
	try {
		await starship.update(updateData);
	} catch ( _err ) {
		return false;
	}
	const nextRoles = remainingRefs === 0
		? []
		: getDeploymentRolesForUuid(cloneStarshipDeployment(starship), membership.sourceActorUuid);
	await updateCrewDeploymentFlag(crewActor, starship, nextRoles);
	return true;
}

export async function undeployStarshipCrew(starshipSubject, crewSubject, roles = STARSHIP_DEPLOYMENT_ROLES) {
	const starship = resolveActorDocument(starshipSubject);
	const crewActor = resolveActorDocument(crewSubject);
	const writeSet = resolveUndeployWriteSet(starship, crewActor);
	if ( !writeSet.ok || !canUpdateAllActors(writeSet.actors) ) return false;

	const roleSet = new Set(Array.isArray(roles) ? roles : [roles]);
	const deployment = cloneStarshipDeployment(starship);
	const crewUuid = crewActor.uuid;

	if ( roleSet.has("pilot") && (deployment.pilot.value === crewUuid) ) {
		deployment.pilot.value = null;
	}
	if ( roleSet.has("crew") ) deployment.crew.items.delete(crewUuid);
	if ( roleSet.has("passenger") ) deployment.passenger.items.delete(crewUuid);

	const updateData = buildDeploymentUpdateData(deployment);
	// Clear ship-owned profile only when membership fully ends — same owner as Custom Role cleanup.
	if ( !getDeploymentRolesForUuid(deployment, crewUuid).length ) {
		// Bug 28: remove written membership records for this source Actor.
		for ( const m of resolveStarshipCrewMemberships(starship) ) {
			if ( m.sourceActorUuid !== crewUuid || !m.written ) continue;
			updateData[`${CREW_MEMBERSHIPS_PATH}.-=${m.membershipId}`] = null;
			updateData[`flags.sw5e.starship.crewProfiles.-=${toCrewProfileStorageKey(m.membershipId)}`] = null;
		}
		const rawProfiles = cloneDeep(starship?.flags?.sw5e?.starship?.crewProfiles ?? {});
		const shapes = locateCrewProfileShapes(rawProfiles, crewUuid);
		if ( shapes.hasCanonical || shapes.hasRawUuid || shapes.hasNested ) {
			const cleaned = canonicalizeCrewProfilesForActor({
				rawProfiles,
				actorUuid: crewUuid,
				nextRole: "",
				removeTarget: true
			});
			if ( shapes.hasRawUuid ) {
				await starship.update(updateData);
				const replaced = await replaceCrewProfilesMap(starship, cleaned);
				if ( !replaced ) return false;
				await updateCrewDeploymentFlag(crewActor, starship, getDeploymentRolesForUuid(deployment, crewUuid));
				return true;
			}
			if ( shapes.hasCanonical ) {
				updateData[`flags.sw5e.starship.crewProfiles.-=${shapes.storageKey}`] = null;
			}
			if ( shapes.hasNested && shapes.actorId ) {
				updateData[`flags.sw5e.starship.crewProfiles.Actor.-=${shapes.actorId}`] = null;
			}
		}
	}

	await starship.update(updateData);
	await updateCrewDeploymentFlag(crewActor, starship, getDeploymentRolesForUuid(deployment, crewUuid));
	return true;
}

/**
 * Deploy a crew Actor to a Starship role.
 * Optional `options.hidden === true` requests Bug 6 membership concealment via the
 * storage-abstracted profile writer (GM-only). Non-GM hidden intent is ignored
 * (visible deploy still proceeds when otherwise authorized).
 * Already-deployed + GM hidden: hide in place without role duplication.
 * New deploy + GM hidden: prefer one starship.update covering membership + profile.
 * @param {Actor|string} starshipSubject
 * @param {Actor|string} crewSubject
 * @param {string} role
 * @param {{ hidden?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
export async function deployStarshipCrew(starshipSubject, crewSubject, role, options={}) {
	const starship = resolveActorDocument(starshipSubject);
	const crewActor = resolveActorDocument(crewSubject);
	if ( !STARSHIP_DEPLOYMENT_ROLES.includes(role) ) throw new Error(`Unsupported crew deployment role: ${role}`);

	const writeSet = resolveDeployWriteSet(starship, crewActor, role);
	if ( !writeSet.ok || !canUpdateAllActors(writeSet.actors) ) return false;

	const crewUuid = crewActor.uuid;
	const applyHidden = options?.hidden === true && globalThis.game?.user?.isGM === true;

	// Phase 1A′: already aboard + GM hidden intent → hide existing membership only.
	if ( applyHidden && isStarshipCrewMemberUuid(starship, crewUuid) ) {
		const hideResult = await setStarshipCrewMembershipHidden(starship, crewUuid, true);
		return hideResult?.ok === true;
	}

	const priorAssignment = getCrewDeploymentFlag(crewActor);
	if ( priorAssignment?.starshipUuid && (priorAssignment.starshipUuid !== starship.uuid) ) {
		const previousStarship = resolveActorDocument(priorAssignment.starshipUuid);
		if ( !previousStarship ) return false;
		const transferred = await undeployStarshipCrew(previousStarship, crewActor);
		if ( transferred !== true ) return false;
	}

	const deployment = cloneStarshipDeployment(starship);
	const displacedPilotUuid = (role === "pilot" && deployment.pilot.value && (deployment.pilot.value !== crewUuid))
		? deployment.pilot.value
		: null;

	if ( role === "pilot" ) deployment.pilot.value = crewUuid;
	if ( role === "crew" || role === "pilot" ) deployment.crew.items.add(crewUuid);
	if ( role === "passenger" ) deployment.passenger.items.add(crewUuid);

	const updateData = buildDeploymentUpdateData(deployment);
	let pendingProfileReplace = null;
	if ( applyHidden ) {
		const composed = composeCrewMembershipHiddenWrite(starship, crewUuid, true);
		if ( composed.mode === "narrow" ) Object.assign(updateData, composed.update);
		else if ( composed.mode === "replace" ) pendingProfileReplace = composed.cleaned;
	}

	await starship.update(updateData);
	if ( pendingProfileReplace ) {
		const replaced = await replaceCrewProfilesMap(starship, pendingProfileReplace);
		if ( !replaced ) return false;
	}
	if ( applyHidden && getStarshipCrewMembershipHidden(starship, crewUuid) !== true ) {
		console.debug("SW5E MODULE | Deploy-with-hidden readback failed", { actorUuid: crewUuid });
		return false;
	}

	await updateCrewDeploymentFlag(crewActor, starship, getDeploymentRolesForUuid(deployment, crewUuid));

	if ( displacedPilotUuid && (displacedPilotUuid !== crewUuid) ) {
		const displacedPilot = resolveActorDocument(displacedPilotUuid);
		if ( displacedPilot ) {
			await updateCrewDeploymentFlag(displacedPilot, starship, getDeploymentRolesForUuid(deployment, displacedPilotUuid));
		}
	}
	return true;
}

/**
 * Deploy distinct crew Actors after combined write-set preflight.
 * Not atomic: a mid-write failure can leave partial completion (disclosed; remaining stopped).
 * Uses the same resolved Actor documents from preflight — does not re-resolve between steps.
 * @param {object|string} starshipSubject
 * @param {Array<object|string>} subjects
 * @param {string} role
 * @returns {Promise<{ ok: boolean, phase: string, completed: object[], failed: object|null, crewActors: object[] }>}
 */
export async function deployStarshipCrewBatch(starshipSubject, subjects, role) {
	const preflight = preflightDeployStarshipCrewBatch(starshipSubject, subjects, role);
	if ( !preflight.ok ) {
		return {
			ok: false,
			phase: "preflight",
			completed: [],
			failed: null,
			crewActors: preflight.crewActors
		};
	}

	const { starship, crewActors } = preflight;
	const completed = [];
	for ( const crewActor of crewActors ) {
		const ok = await deployStarshipCrew(starship, crewActor, role);
		if ( ok !== true ) {
			return {
				ok: false,
				phase: "write",
				completed,
				failed: crewActor,
				crewActors
			};
		}
		completed.push(crewActor);
	}

	return { ok: true, phase: "write", completed, failed: null, crewActors };
}

/**
 * Legacy helper (Bug 29D): Active Crew is no longer a sheet UI station or proficiency source.
 * `deployment.active.value` may still be persisted; this writer is unwired from the sheet.
 * Prefer leaving the field inert rather than migrating. Callers should not use this for PB.
 * @param {Actor|string} starshipSubject
 * @param {Actor|string|null} [crewSubject]
 * @returns {Promise<boolean>}
 */
export async function toggleStarshipActiveCrew(starshipSubject, crewSubject = null) {
	const starship = resolveActorDocument(starshipSubject);
	if ( !isLegacyVehicleStarship(starship) ) return false;
	if ( !canCurrentUserUpdateStarshipActor(starship) ) return false;

	const deployment = cloneStarshipDeployment(starship);
	const crewActor = resolveActorDocument(crewSubject);
	const targetUuid = crewActor?.uuid ?? (typeof crewSubject === "string" ? crewSubject : null);
	const nextActive = (targetUuid && (deployment.active.value === targetUuid)) ? null : targetUuid;

	if ( nextActive && !collectDeploymentUuids(deployment).has(nextActive) ) return false;
	deployment.active.value = nextActive;
	await starship.update(buildDeploymentUpdateData(deployment));
	return true;
}

/**
 * Partition a flat crew roster into headed groups without cloning row objects.
 * `rows` arrays hold references into the given `roster` (same object identity).
 * Empty groups are omitted. Unknown Actor types land in `other` only when present.
 *
 * @param {object[]} roster
 * @returns {Array<{ key: string, labelKey: string, rows: object[] }>}
 */
export function partitionCrewRosterGroups(roster) {
	const list = Array.isArray(roster) ? roster : [];
	const characters = [];
	const npcs = [];
	const others = [];
	for ( const row of list ) {
		if ( row?.type === "character" ) characters.push(row);
		else if ( row?.type === "npc" ) npcs.push(row);
		else others.push(row);
	}
	const groups = [];
	if ( characters.length ) {
		groups.push({
			key: "character",
			labelKey: "SW5E.StarshipCrewGroupCharacters",
			rows: characters
		});
	}
	if ( npcs.length ) {
		groups.push({
			key: "npc",
			labelKey: "SW5E.StarshipCrewGroupNpcs",
			rows: npcs
		});
	}
	if ( others.length ) {
		groups.push({
			key: "other",
			labelKey: "SW5E.StarshipCrewGroupOther",
			rows: others
		});
	}
	return groups;
}

export function buildVehicleStarshipCrewContext(actor, { sheetEditable = true } = {}) {
	const legacySystem = getLegacyStarshipActorSystem(actor) ?? {};
	const deployment = getDeploymentState(legacySystem.attributes?.deployment);
	syncDeploymentActiveFlags(deployment);
	const user = globalThis.game?.user;
	const roster = buildResolvedCrewRoster(deployment, actor, { sheetEditable })
		.filter(row => isStarshipCrewMembershipVisibleToUser(actor, {
			membershipId: row?.membershipId,
			uuid: row?.uuid
		}, user))
		.map(row => ({
			...row,
			membershipHidden: getStarshipCrewMembershipHidden(
				actor,
				row?.membershipId,
				row?.uuid
			) === true
		}));
	const visibleQuantitySum = roster.reduce(
		(sum, row) => sum + Math.max(1, Math.floor(Number(row?.quantity) || 1)),
		0
	);
	return { roster, visibleQuantitySum };
}

export function buildVehicleAvailableActors(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor) ?? {};
	const deployment = getDeploymentState(legacySystem.attributes?.deployment);
	const assignedUuids = collectDeploymentUuids(deployment);
	return buildAvailableStarshipCrewChoices(actor).filter(a => !assignedUuids.has(a.uuid));
}
