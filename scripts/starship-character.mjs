import { getLegacyStarshipActorSystem } from "./starship-data.mjs";
import { canCurrentUserUpdateStarshipActor } from "./starship-permissions.mjs";

export const STARSHIP_CREW_DEPLOYMENT_FLAG = "starshipDeployment";

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

function buildResolvedCrewRecord(deployment, uuid, starship, { sheetEditable = true } = {}) {
	const actor = resolveActorDocument(uuid);
	const roles = getDeploymentRolesForUuid(deployment, uuid);
	const canShip = canCurrentUserUpdateStarshipActor(starship);
	const canCrew = Boolean(actor) && canCurrentUserUpdateStarshipActor(actor);
	const canMutateAssignment = sheetEditable && canShip && canCrew;
	const canSetPilot = sheetEditable && Boolean(actor)
		&& canCurrentUserDeployStarshipCrewRole(starship, actor, "pilot");
	return {
		uuid,
		name: actor?.name ?? "Unknown Crew",
		img: actor?.img || "icons/svg/mystery-man.svg",
		type: actor?.type ?? "",
		isPilot: roles.includes("pilot"),
		isCrew: roles.includes("crew"),
		isPassenger: roles.includes("passenger"),
		active: deployment.active.value === uuid,
		roles,
		proficiency: toNumber(actor?.system?.attributes?.prof, 0),
		pilotSkill: toNumber(actor?.system?.skills?.pil?.value, 0),
		canToggleActive: sheetEditable && canShip,
		canRemove: canMutateAssignment,
		canUndeployPilot: canMutateAssignment && roles.includes("pilot"),
		canSetPilot
	};
}

function compareCrewRecords(left, right) {
	if ( left.isPilot !== right.isPilot ) return left.isPilot ? -1 : 1;
	if ( left.active !== right.active ) return left.active ? -1 : 1;
	return left.name.localeCompare(right.name);
}

function buildResolvedCrewRoster(deployment, starship, options = {}) {
	return Array.from(collectDeploymentUuids(deployment))
		.map(uuid => buildResolvedCrewRecord(deployment, uuid, starship, options))
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

	return game.actors.contents
		.filter(actor => {
			if ( !isDeployableCrewActor(actor) || (actor.id === starship.id) ) return false;
			if ( isGM ) return true;
			return canCurrentUserUpdateStarshipActor(actor);
		})
		.map(actor => {
			const deploymentFlag = getCrewDeploymentFlag(actor);
			const assignedShip = deploymentFlag?.starshipUuid ? resolveActorDocument(deploymentFlag.starshipUuid) : null;
			const canDeployPilot = canCurrentUserDeployStarshipCrewRole(starship, actor, "pilot");
			const canDeployCrew = canCurrentUserDeployStarshipCrewRole(starship, actor, "crew");
			const canDeployPassenger = canCurrentUserDeployStarshipCrewRole(starship, actor, "passenger");
			return {
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
			};
		})
		.filter(choice => choice.canDeployPilot || choice.canDeployCrew || choice.canDeployPassenger)
		.sort(compareAvailableCrewChoices);
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

	await starship.update(buildDeploymentUpdateData(deployment));
	await updateCrewDeploymentFlag(crewActor, starship, getDeploymentRolesForUuid(deployment, crewUuid));
	return true;
}

export async function deployStarshipCrew(starshipSubject, crewSubject, role) {
	const starship = resolveActorDocument(starshipSubject);
	const crewActor = resolveActorDocument(crewSubject);
	if ( !STARSHIP_DEPLOYMENT_ROLES.includes(role) ) throw new Error(`Unsupported crew deployment role: ${role}`);

	const writeSet = resolveDeployWriteSet(starship, crewActor, role);
	if ( !writeSet.ok || !canUpdateAllActors(writeSet.actors) ) return false;

	const priorAssignment = getCrewDeploymentFlag(crewActor);
	if ( priorAssignment?.starshipUuid && (priorAssignment.starshipUuid !== starship.uuid) ) {
		const previousStarship = resolveActorDocument(priorAssignment.starshipUuid);
		if ( !previousStarship ) return false;
		const transferred = await undeployStarshipCrew(previousStarship, crewActor);
		if ( transferred !== true ) return false;
	}

	const deployment = cloneStarshipDeployment(starship);
	const crewUuid = crewActor.uuid;
	const displacedPilotUuid = (role === "pilot" && deployment.pilot.value && (deployment.pilot.value !== crewUuid))
		? deployment.pilot.value
		: null;

	if ( role === "pilot" ) deployment.pilot.value = crewUuid;
	if ( role === "crew" || role === "pilot" ) deployment.crew.items.add(crewUuid);
	if ( role === "passenger" ) deployment.passenger.items.add(crewUuid);

	await starship.update(buildDeploymentUpdateData(deployment));
	await updateCrewDeploymentFlag(crewActor, starship, getDeploymentRolesForUuid(deployment, crewUuid));

	if ( displacedPilotUuid && (displacedPilotUuid !== crewUuid) ) {
		const displacedPilot = resolveActorDocument(displacedPilotUuid);
		if ( displacedPilot ) {
			await updateCrewDeploymentFlag(displacedPilot, starship, getDeploymentRolesForUuid(deployment, displacedPilotUuid));
		}
	}
	return true;
}

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

export function buildVehicleStarshipCrewContext(actor, { sheetEditable = true } = {}) {
	const legacySystem = getLegacyStarshipActorSystem(actor) ?? {};
	const deployment = getDeploymentState(legacySystem.attributes?.deployment);
	syncDeploymentActiveFlags(deployment);
	return {
		roster: buildResolvedCrewRoster(deployment, actor, { sheetEditable })
	};
}

export function buildVehicleAvailableActors(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor) ?? {};
	const deployment = getDeploymentState(legacySystem.attributes?.deployment);
	const assignedUuids = collectDeploymentUuids(deployment);
	return buildAvailableStarshipCrewChoices(actor).filter(a => !assignedUuids.has(a.uuid));
}
