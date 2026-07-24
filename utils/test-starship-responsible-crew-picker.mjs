#!/usr/bin/env node
/**
 * Offline tests for Bug 29E-P responsible-crew picker helpers
 * (scripts/starship-data.mjs + starship-permissions.mjs).
 */
import assert from "node:assert/strict";
import {
	buildStarshipResponsibleCrewCandidates,
	computeStarshipSkillCrewProficiencyPoints,
	determineResponsibleCrewSelectionMode,
	getDeploymentUuidList,
	publicChatExcludesResponsibleCrewIdentity,
	resolveValidatedResponsibleCrewActor,
	toDialogSafeResponsibleCrewCandidate,
	toDialogSafeResponsibleCrewCandidates,
	userOwnsStarshipResponsibleCrewActor
} from "../scripts/starship-data.mjs";
import { isStarshipCrewMembershipVisibleToUser } from "../scripts/starship-permissions.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function makeParentDeployment(rank) {
	return {
		id: `dep${rank}`,
		type: "feat",
		name: "Pilot",
		flags: {
			sw5e: {
				legacyDeployment: true,
				deployment: { rank }
			}
		},
		system: {
			type: { value: "deployment", subtype: "" },
			advancement: [{ type: "ItemGrant" }]
		}
	};
}

function makeCrewActor({
	uuid,
	name,
	prof,
	rank=1,
	ownedBy=null,
	type="character"
}={}) {
	const owners = new Set(ownedBy ? [ownedBy] : []);
	return {
		documentName: "Actor",
		type,
		uuid,
		id: String(uuid).split(".").pop(),
		name,
		img: `icons/${name}.svg`,
		items: [makeParentDeployment(rank)],
		system: { attributes: { prof } },
		testUserPermission(user, level) {
			if ( user?.isGM ) return true;
			if ( level === "OWNER" ) return owners.has(user?.id);
			return false;
		}
	};
}

function makeStarship({ pilotUuid=null, crewUuids=[], passengerUuids=[] }={}) {
	return {
		documentName: "Actor",
		type: "vehicle",
		uuid: "Actor.ship1",
		name: "Test Ship",
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: {
						attributes: {
							deployment: {
								pilot: { value: pilotUuid },
								crew: { items: crewUuids },
								passenger: { items: passengerUuids }
							}
						}
					}
				}
			}
		}
	};
}

function installActorResolver(actorsByUuid) {
	const previous = globalThis.fromUuidSync;
	globalThis.fromUuidSync = uuid => actorsByUuid.get(uuid) ?? null;
	return () => {
		if ( previous === undefined ) delete globalThis.fromUuidSync;
		else globalThis.fromUuidSync = previous;
	};
}

test("selection mode from distinct count", () => {
	assert.equal(determineResponsibleCrewSelectionMode(0), "none");
	assert.equal(determineResponsibleCrewSelectionMode(1), "automatic");
	assert.equal(determineResponsibleCrewSelectionMode(2), "picker");
	assert.equal(determineResponsibleCrewSelectionMode(5), "picker");
});

test("dialog-safe DTO strips live Actor", () => {
	const actor = { uuid: "Actor.a", name: "Ahsoka", img: "a.webp" };
	const safe = toDialogSafeResponsibleCrewCandidate({
		actor,
		actorUuid: "Actor.a",
		membershipRole: "pilot",
		deploymentLabel: "Pilot",
		proficiencyBonus: 3
	});
	assert.equal(safe.actorUuid, "Actor.a");
	assert.equal(safe.actorName, "Ahsoka");
	assert.equal(safe.image, "a.webp");
	assert.equal(safe.membershipRole, "pilot");
	assert.equal(safe.deploymentLabel, "Pilot");
	assert.equal(safe.proficiencyBonus, 3);
	assert.equal("actor" in safe, false);
});

test("dialog-safe list never includes actor keys", () => {
	const list = toDialogSafeResponsibleCrewCandidates([
		{ actor: { uuid: "Actor.x" }, actorUuid: "Actor.x", proficiencyBonus: 2, membershipRole: "crew" }
	]);
	assert.equal(list.length, 1);
	assert.equal("actor" in list[0], false);
});

test("OWNER helper rejects observer-only", () => {
	const user = { id: "u1", isGM: false };
	const actor = {
		testUserPermission(u, level) {
			return level === "OBSERVER";
		}
	};
	assert.equal(userOwnsStarshipResponsibleCrewActor(user, actor), false);
});

test("OWNER helper accepts OWNER", () => {
	const user = { id: "u1", isGM: false };
	const actor = {
		testUserPermission(u, level) {
			return u.id === "u1" && level === "OWNER";
		}
	};
	assert.equal(userOwnsStarshipResponsibleCrewActor(user, actor), true);
});

test("shared proficiency points math", () => {
	assert.equal(computeStarshipSkillCrewProficiencyPoints(1, 4), 4);
	assert.equal(computeStarshipSkillCrewProficiencyPoints(0.5, 4), 2);
	assert.equal(computeStarshipSkillCrewProficiencyPoints(2, 3), 6);
	assert.equal(computeStarshipSkillCrewProficiencyPoints(1, NaN), 0);
});

test("Bug 6 visibility stub defaults true", () => {
	assert.equal(isStarshipCrewMembershipVisibleToUser({}, {}, {}), true);
});

test("public chat audit rejects name/uuid in flavor/flags", () => {
	assert.equal(publicChatExcludesResponsibleCrewIdentity({
		flavor: "Astrogation Check — No crew PB applied",
		speaker: { alias: "Ship" },
		flags: {}
	}, { name: "Rey", uuid: "Actor.rey" }), true);

	assert.equal(publicChatExcludesResponsibleCrewIdentity({
		flavor: "Crew PB: Rey",
		flags: {}
	}, { name: "Rey", uuid: "Actor.rey" }), false);

	assert.equal(publicChatExcludesResponsibleCrewIdentity({
		flavor: "ok",
		flags: { sw5e: { crew: "Actor.rey" } }
	}, { name: "Rey", uuid: "Actor.rey" }), false);
});

test("GM sees all qualified; passenger/rank0/malformed PB excluded; UUID dedupe", () => {
	const pilot = makeCrewActor({ uuid: "Actor.pilot", name: "Pilot", prof: 3, rank: 2 });
	const crew = makeCrewActor({ uuid: "Actor.crew", name: "Crew", prof: 4, rank: 1 });
	const passenger = makeCrewActor({ uuid: "Actor.pass", name: "Pass", prof: 5, rank: 3 });
	const rank0 = makeCrewActor({ uuid: "Actor.r0", name: "Zero", prof: 4, rank: 0 });
	const badPb = makeCrewActor({ uuid: "Actor.bad", name: "Bad", prof: Number.NaN, rank: 2 });
	const restore = installActorResolver(new Map([
		[pilot.uuid, pilot],
		[crew.uuid, crew],
		[passenger.uuid, passenger],
		[rank0.uuid, rank0],
		[badPb.uuid, badPb]
	]));
	try {
		const starship = makeStarship({
			pilotUuid: pilot.uuid,
			crewUuids: [crew.uuid, crew.uuid, rank0.uuid, badPb.uuid],
			passengerUuids: [passenger.uuid]
		});
		const gm = { id: "gm", isGM: true };
		const result = buildStarshipResponsibleCrewCandidates({ starshipActor: starship, user: gm });
		assert.equal(result.userAuthority, "gm");
		assert.equal(result.selectionMode, "picker");
		assert.equal(result.candidates.length, 2);
		assert.deepEqual(result.candidates.map(c => c.actorUuid).sort(), ["Actor.crew", "Actor.pilot"]);
		assert.equal(result.candidates.every(c => c.actor), true);
	} finally {
		restore();
	}
});

test("ordinary player: owned filter; unowned Pilot excluded; one owned → automatic", () => {
	const player = { id: "p1", isGM: false };
	const other = { id: "p2", isGM: false };
	const ownedCrew = makeCrewActor({
		uuid: "Actor.owned",
		name: "Owned",
		prof: 3,
		rank: 1,
		ownedBy: "p1"
	});
	const unownedPilot = makeCrewActor({
		uuid: "Actor.pilot",
		name: "Pilot",
		prof: 5,
		rank: 3,
		ownedBy: "p2"
	});
	const restore = installActorResolver(new Map([
		[ownedCrew.uuid, ownedCrew],
		[unownedPilot.uuid, unownedPilot]
	]));
	try {
		const starship = makeStarship({
			pilotUuid: unownedPilot.uuid,
			crewUuids: [ownedCrew.uuid]
		});
		const result = buildStarshipResponsibleCrewCandidates({ starshipActor: starship, user: player });
		assert.equal(result.selectionMode, "automatic");
		assert.equal(result.candidates.length, 1);
		assert.equal(result.candidates[0].actorUuid, "Actor.owned");
		assert.equal(result.automaticActor?.uuid, "Actor.owned");
		assert.equal(userOwnsStarshipResponsibleCrewActor(player, unownedPilot), false);
		assert.equal(userOwnsStarshipResponsibleCrewActor(other, ownedCrew), false);
	} finally {
		restore();
	}
});

test("ordinary player: zero owned → none; two owned → picker", () => {
	const player = { id: "p1", isGM: false };
	const a = makeCrewActor({ uuid: "Actor.a", name: "A", prof: 2, rank: 1, ownedBy: "p1" });
	const b = makeCrewActor({ uuid: "Actor.b", name: "B", prof: 3, rank: 1, ownedBy: "p1" });
	const stranger = makeCrewActor({ uuid: "Actor.s", name: "S", prof: 4, rank: 1, ownedBy: "p2" });
	const restore = installActorResolver(new Map([
		[a.uuid, a],
		[b.uuid, b],
		[stranger.uuid, stranger]
	]));
	try {
		const noneShip = makeStarship({ crewUuids: [stranger.uuid] });
		assert.equal(
			buildStarshipResponsibleCrewCandidates({ starshipActor: noneShip, user: player }).selectionMode,
			"none"
		);
		const pickShip = makeStarship({ crewUuids: [a.uuid, b.uuid, stranger.uuid] });
		const pick = buildStarshipResponsibleCrewCandidates({ starshipActor: pickShip, user: player });
		assert.equal(pick.selectionMode, "picker");
		assert.equal(pick.candidates.length, 2);
	} finally {
		restore();
	}
});

test("resolveValidatedResponsibleCrewActor revalidates membership/ownership", () => {
	const player = { id: "p1", isGM: false };
	const owned = makeCrewActor({ uuid: "Actor.o", name: "O", prof: 2, rank: 1, ownedBy: "p1" });
	const map = new Map([[owned.uuid, owned]]);
	const restore = installActorResolver(map);
	try {
		const starship = makeStarship({ crewUuids: [owned.uuid] });
		assert.equal(
			resolveValidatedResponsibleCrewActor({
				starshipActor: starship,
				user: player,
				actorUuid: owned.uuid
			})?.uuid,
			owned.uuid
		);
		// membership removed
		starship.flags.sw5e.legacyStarshipActor.system.attributes.deployment.crew.items = [];
		assert.equal(
			resolveValidatedResponsibleCrewActor({
				starshipActor: starship,
				user: player,
				actorUuid: owned.uuid
			}),
			null
		);
	} finally {
		restore();
	}
});

test("ownership loss before submit fails validation", () => {
	const player = { id: "p1", isGM: false };
	const owned = makeCrewActor({ uuid: "Actor.o2", name: "O2", prof: 2, rank: 1, ownedBy: "p1" });
	const restore = installActorResolver(new Map([[owned.uuid, owned]]));
	try {
		const starship = makeStarship({ crewUuids: [owned.uuid] });
		owned.testUserPermission = () => false;
		assert.equal(
			resolveValidatedResponsibleCrewActor({
				starshipActor: starship,
				user: player,
				actorUuid: owned.uuid
			}),
			null
		);
	} finally {
		restore();
	}
});

test("empty placeholder UUID fails validation", () => {
	assert.equal(resolveValidatedResponsibleCrewActor({
		starshipActor: makeStarship(),
		user: { id: "gm", isGM: true },
		actorUuid: ""
	}), null);
});

test("getDeploymentUuidList reads Foundry object-map crew items", () => {
	assert.deepEqual(
		getDeploymentUuidList({ items: { 0: "Actor.a", 1: "Actor.b" } }).sort(),
		["Actor.a", "Actor.b"]
	);
	assert.deepEqual(
		getDeploymentUuidList({ items: new Set(["Actor.c", "Actor.d"]) }).sort(),
		["Actor.c", "Actor.d"]
	);
	assert.deepEqual(getDeploymentUuidList({ items: ["Actor.e"] }), ["Actor.e"]);
});

test("GM candidate builder recovers object-map crew UUIDs → picker", () => {
	const a = makeCrewActor({ uuid: "Actor.mapA", name: "A", prof: 2, rank: 1 });
	const b = makeCrewActor({ uuid: "Actor.mapB", name: "B", prof: 3, rank: 1 });
	const restore = installActorResolver(new Map([[a.uuid, a], [b.uuid, b]]));
	try {
		const starship = makeStarship({
			pilotUuid: null,
			crewUuids: []
		});
		starship.flags.sw5e.legacyStarshipActor.system.attributes.deployment.crew = {
			items: { 0: a.uuid, 1: b.uuid },
			active: false
		};
		const result = buildStarshipResponsibleCrewCandidates({
			starshipActor: starship,
			user: { id: "gm", isGM: true }
		});
		assert.equal(result.selectionMode, "picker");
		assert.equal(result.candidates.length, 2);
	} finally {
		restore();
	}
});

console.log(`\n${passed} tests passed`);
