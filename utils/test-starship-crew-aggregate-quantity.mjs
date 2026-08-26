#!/usr/bin/env node
/**
 * Offline tests for Bug 28 Hybrid D aggregate NPC crew quantity.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	adjustStarshipCrewMembershipQuantity,
	buildVehicleStarshipCrewContext,
	deployStarshipCrew,
	findStarshipCrewMembership,
	getStarshipCrewMembershipHidden,
	resolveStarshipCrewMemberships,
	toDeterministicIndividualMembershipId,
	undeployStarshipCrewMembership
} from "../scripts/starship-character.mjs";
import {
	signaturePayloadCoreCrew,
	stableSignature
} from "../scripts/patch/starship-sheet-partial.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EN_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, "languages/en.json"), "utf8"));
const CREW_LAYER_HBS = fs.readFileSync(path.join(ROOT, "templates/starship-sheet-layer.hbs"), "utf8");
const CREW_LESS = fs.readFileSync(path.join(ROOT, "styles/less/update/starships/crew.less"), "utf8");
const SHEET_SRC = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet.mjs"), "utf8");

let passed = 0;
function test(name, fn) {
	const result = fn();
	if ( result && typeof result.then === "function" ) {
		throw new Error(`Async test "${name}" must be awaited via testAsync`);
	}
	passed += 1;
	console.log(`ok - ${name}`);
}

async function testAsync(name, fn) {
	await fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function encodeProfileKey(uuid) {
	return String(uuid).replaceAll(".", "\uFF0E");
}

function applyStarshipUpdate(starship, data) {
	const depPrefix = "flags.sw5e.legacyStarshipActor.system.attributes.deployment";
	const starshipFlags = starship.flags.sw5e.starship;
	if ( !starshipFlags.crewProfiles ) starshipFlags.crewProfiles = {};
	if ( !starshipFlags.crewMemberships ) starshipFlags.crewMemberships = {};
	const profiles = starshipFlags.crewProfiles;
	const memberships = starshipFlags.crewMemberships;

	for ( const [key, value] of Object.entries(data ?? {}) ) {
		if ( key === `${depPrefix}.crew.items` ) {
			starship.flags.sw5e.legacyStarshipActor.system.attributes.deployment.crew.items = Array.from(value);
			continue;
		}
		if ( key === `${depPrefix}.passenger.items` ) {
			starship.flags.sw5e.legacyStarshipActor.system.attributes.deployment.passenger.items = Array.from(value);
			continue;
		}
		if ( key === `${depPrefix}.pilot.value` ) {
			starship.flags.sw5e.legacyStarshipActor.system.attributes.deployment.pilot.value = value;
			continue;
		}
		if ( key.startsWith("flags.sw5e.starship.crewMemberships.") ) {
			const rest = key.slice("flags.sw5e.starship.crewMemberships.".length);
			if ( rest.startsWith("-=") ) delete memberships[rest.slice(2)];
			else memberships[rest] = value;
			continue;
		}
		if ( key.startsWith("flags.sw5e.starship.crewProfiles.") && !key.includes(".Actor.") ) {
			const storageKey = key.slice("flags.sw5e.starship.crewProfiles.".length);
			if ( storageKey.startsWith("-=") ) delete profiles[storageKey.slice(2)];
			else profiles[storageKey] = value;
		}
	}
}

function makeCrewActor(uuid, { name="Crew", type="npc" }={}) {
	return {
		documentName: "Actor",
		type,
		uuid,
		id: String(uuid).split(".").pop(),
		name,
		img: "icons/svg/mystery-man.svg",
		flags: { sw5e: {} },
		system: { attributes: { prof: 2 }, skills: { pil: { value: 0 } } },
		canUserModify() { return true; },
		async update() { return this; }
	};
}

function makeStarship({
	crewUuids=[],
	passengerUuids=[],
	pilotUuid=null,
	profiles={},
	memberships={},
	canUpdate=true
}={}) {
	const starship = {
		documentName: "Actor",
		type: "vehicle",
		uuid: "Actor.ship1",
		id: "ship1",
		name: "Test Ship",
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: {
						attributes: {
							deployment: {
								pilot: { value: pilotUuid, active: false },
								crew: { items: [...crewUuids], active: false },
								passenger: { items: [...passengerUuids], active: false },
								active: { value: null }
							}
						}
					}
				},
				starship: {
					crewProfiles: structuredClone(profiles),
					crewMemberships: structuredClone(memberships)
				}
			}
		},
		canUserModify() { return canUpdate; },
		updates: [],
		async update(data) {
			this.updates.push(structuredClone(data));
			applyStarshipUpdate(this, data);
			return this;
		}
	};
	return starship;
}

function withGameUser(user, fn) {
	const prevGame = globalThis.game;
	globalThis.game = { ...(prevGame ?? {}), user };
	try {
		return fn();
	} finally {
		if ( prevGame === undefined ) delete globalThis.game;
		else globalThis.game = prevGame;
	}
}

async function withGameUserAsync(user, fn) {
	const prevGame = globalThis.game;
	globalThis.game = { ...(prevGame ?? {}), user };
	try {
		return await fn();
	} finally {
		if ( prevGame === undefined ) delete globalThis.game;
		else globalThis.game = prevGame;
	}
}

function withActorResolver(actorsByUuid, fn) {
	const previous = globalThis.fromUuidSync;
	globalThis.fromUuidSync = uuid => actorsByUuid.get(uuid) ?? null;
	try {
		return fn();
	} finally {
		if ( previous === undefined ) delete globalThis.fromUuidSync;
		else globalThis.fromUuidSync = previous;
	}
}

async function withActorResolverAsync(actorsByUuid, fn) {
	const previous = globalThis.fromUuidSync;
	globalThis.fromUuidSync = uuid => actorsByUuid.get(uuid) ?? null;
	try {
		return await fn();
	} finally {
		if ( previous === undefined ) delete globalThis.fromUuidSync;
		else globalThis.fromUuidSync = previous;
	}
}

const gm = { id: "gm", isGM: true };
const owner = { id: "owner", isGM: false };

test("dual-read synthesizes qty-1 individuals without writing", () => {
	const npc = makeCrewActor("Actor.npc1", { name: "Trooper", type: "npc" });
	const ship = makeStarship({
		crewUuids: [npc.uuid],
		profiles: { [encodeProfileKey(npc.uuid)]: { hidden: false, customRole: "Gunner" } }
	});
	const before = structuredClone(ship.flags.sw5e.starship);
	withActorResolver(new Map([[npc.uuid, npc]]), () => {
		withGameUser(gm, () => {
			const memberships = resolveStarshipCrewMemberships(ship);
			assert.equal(memberships.length, 1);
			assert.equal(memberships[0].kind, "individual");
			assert.equal(memberships[0].quantity, 1);
			assert.equal(memberships[0].written, false);
			assert.equal(memberships[0].membershipId, toDeterministicIndividualMembershipId(npc.uuid));
			assert.equal(ship.updates.length, 0);
			assert.deepEqual(ship.flags.sw5e.starship, before);
		});
	});
});

await testAsync("EDIT + promotes individual NPC to one aggregate qty 2 with atomic profile re-key", async () => {
	const npc = makeCrewActor("Actor.npc1", { name: "Trooper", type: "npc" });
	const uuidKey = encodeProfileKey(npc.uuid);
	const ship = makeStarship({
		crewUuids: [npc.uuid],
		profiles: { [uuidKey]: { hidden: true, customRole: "Gunner", homebrewNote: "keep-me" } }
	});
	await withActorResolverAsync(new Map([[npc.uuid, npc]]), async () => {
		await withGameUserAsync(gm, async () => {
			const indivId = toDeterministicIndividualMembershipId(npc.uuid);
			const result = await adjustStarshipCrewMembershipQuantity(ship, indivId, 1);
			assert.equal(result.ok, true);
			assert.equal(result.kind, "aggregate");
			assert.equal(result.quantity, 2);
			assert.ok(result.membershipId.startsWith("agg_"));

			const memberships = resolveStarshipCrewMemberships(ship);
			assert.equal(memberships.length, 1, "no duplicate after promote");
			assert.equal(memberships[0].kind, "aggregate");
			assert.equal(memberships[0].quantity, 2);
			assert.equal(memberships[0].membershipId, result.membershipId);

			const memKey = encodeProfileKey(result.membershipId);
			assert.deepEqual(ship.flags.sw5e.starship.crewProfiles[memKey], {
				hidden: true,
				customRole: "Gunner",
				homebrewNote: "keep-me"
			});
			assert.equal(ship.flags.sw5e.starship.crewProfiles[uuidKey], undefined);
			assert.equal(getStarshipCrewMembershipHidden(ship, result.membershipId), true);
		});
	});
});

await testAsync("repeated promote increments existing aggregate; does not duplicate", async () => {
	const npc = makeCrewActor("Actor.npc1", { name: "Trooper", type: "npc" });
	const ship = makeStarship({ crewUuids: [npc.uuid] });
	await withActorResolverAsync(new Map([[npc.uuid, npc]]), async () => {
		await withGameUserAsync(gm, async () => {
			const indivId = toDeterministicIndividualMembershipId(npc.uuid);
			const first = await adjustStarshipCrewMembershipQuantity(ship, indivId, 1);
			assert.equal(first.ok, true);
			const second = await adjustStarshipCrewMembershipQuantity(ship, first.membershipId, 1);
			assert.equal(second.ok, true);
			assert.equal(second.membershipId, first.membershipId);
			assert.equal(second.quantity, 3);
			assert.equal(resolveStarshipCrewMemberships(ship).length, 1);
			assert.equal(resolveStarshipCrewMemberships(ship)[0].quantity, 3);
		});
	});
});

await testAsync("aggregate quantity decrements to min 1 and does not remove", async () => {
	const npc = makeCrewActor("Actor.npc1", { name: "Trooper", type: "npc" });
	const aggId = "agg_test1";
	const ship = makeStarship({
		crewUuids: [npc.uuid],
		memberships: {
			[aggId]: {
				sourceActorUuid: npc.uuid,
				kind: "aggregate",
				quantity: 2,
				roles: ["crew"]
			}
		}
	});
	await withActorResolverAsync(new Map([[npc.uuid, npc]]), async () => {
		await withGameUserAsync(gm, async () => {
			const down = await adjustStarshipCrewMembershipQuantity(ship, aggId, -1);
			assert.equal(down.ok, true);
			assert.equal(down.quantity, 1);
			const stuck = await adjustStarshipCrewMembershipQuantity(ship, aggId, -1);
			assert.equal(stuck.ok, true);
			assert.equal(stuck.quantity, 1);
			assert.equal(findStarshipCrewMembership(ship, aggId)?.quantity, 1);
			assert.ok(ship.flags.sw5e.starship.crewMemberships[aggId]);
		});
	});
});

await testAsync("PC cannot promote", async () => {
	const pc = makeCrewActor("Actor.pc1", { name: "Pilot", type: "character" });
	const ship = makeStarship({ crewUuids: [pc.uuid] });
	await withActorResolverAsync(new Map([[pc.uuid, pc]]), async () => {
		await withGameUserAsync(gm, async () => {
			const result = await adjustStarshipCrewMembershipQuantity(
				ship,
				toDeterministicIndividualMembershipId(pc.uuid),
				1
			);
			assert.equal(result.ok, false);
			assert.equal(result.reason, "pc");
			assert.equal(resolveStarshipCrewMemberships(ship).length, 1);
			assert.equal(resolveStarshipCrewMemberships(ship)[0].kind, "individual");
		});
	});
});

await testAsync("drop/redeploy does not increment or reset aggregate quantity", async () => {
	const npc = makeCrewActor("Actor.npc1", { name: "Trooper", type: "npc" });
	const aggId = "agg_keep";
	const ship = makeStarship({
		crewUuids: [npc.uuid],
		memberships: {
			[aggId]: {
				sourceActorUuid: npc.uuid,
				kind: "aggregate",
				quantity: 5,
				roles: ["crew"]
			}
		}
	});
	await withActorResolverAsync(new Map([[npc.uuid, npc], [ship.uuid, ship]]), async () => {
		await withGameUserAsync(gm, async () => {
			const ok = await deployStarshipCrew(ship, npc, "crew");
			assert.equal(ok, true);
			assert.equal(ship.flags.sw5e.starship.crewMemberships[aggId].quantity, 5);
			assert.equal(resolveStarshipCrewMemberships(ship).length, 1);
			assert.equal(resolveStarshipCrewMemberships(ship)[0].quantity, 5);
		});
	});
});

test("Flight Manifest Σ(quantity): GM includes hidden; non-GM excludes", () => {
	const visible = makeCrewActor("Actor.vis1", { name: "Visible", type: "npc" });
	const hidden = makeCrewActor("Actor.hid1", { name: "Hidden", type: "npc" });
	const ship = makeStarship({
		crewUuids: [visible.uuid, hidden.uuid],
		memberships: {
			agg_vis: {
				sourceActorUuid: visible.uuid,
				kind: "aggregate",
				quantity: 3,
				roles: ["crew"]
			},
			agg_hid: {
				sourceActorUuid: hidden.uuid,
				kind: "aggregate",
				quantity: 4,
				roles: ["crew"]
			}
		},
		profiles: {
			[encodeProfileKey("agg_hid")]: { hidden: true }
		}
	});
	const actors = new Map([[visible.uuid, visible], [hidden.uuid, hidden]]);
	withActorResolver(actors, () => {
		withGameUser(gm, () => {
			const ctx = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			assert.equal(ctx.roster.length, 2);
			assert.equal(ctx.visibleQuantitySum, 7);
		});
		withGameUser(owner, () => {
			const ctx = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			assert.equal(ctx.roster.length, 1);
			assert.equal(ctx.visibleQuantitySum, 3);
		});
	});
});

await testAsync("Remove membership clears UUID from Sets only when no remaining refs", async () => {
	const npc = makeCrewActor("Actor.npc1", { name: "Trooper", type: "npc" });
	const ship = makeStarship({
		crewUuids: [npc.uuid],
		memberships: {
			agg_a: {
				sourceActorUuid: npc.uuid,
				kind: "aggregate",
				quantity: 2,
				roles: ["crew"]
			},
			agg_b: {
				sourceActorUuid: npc.uuid,
				kind: "individual",
				quantity: 1,
				roles: ["crew"]
			}
		}
	});
	await withActorResolverAsync(new Map([[npc.uuid, npc], [ship.uuid, ship]]), async () => {
		await withGameUserAsync(gm, async () => {
			const removed = await undeployStarshipCrewMembership(ship, "agg_a");
			assert.equal(removed, true);
			assert.equal(ship.flags.sw5e.starship.crewMemberships.agg_a, undefined);
			assert.ok(ship.flags.sw5e.starship.crewMemberships.agg_b);
			const crewItems = starshipCrewItems(ship);
			assert.ok(crewItems.includes(npc.uuid), "UUID kept while another membership references it");

			const removedLast = await undeployStarshipCrewMembership(ship, "agg_b");
			assert.equal(removedLast, true);
			assert.equal(starshipCrewItems(ship).includes(npc.uuid), false);
		});
	});
});

function starshipCrewItems(starship) {
	const items = starship.flags.sw5e.legacyStarshipActor.system.attributes.deployment.crew.items;
	return Array.isArray(items) ? items : Array.from(items ?? []);
}

test("UI wiring: quantity commands, Σ count, labels, styles", () => {
	assert.match(CREW_LAYER_HBS, /data-sw5e-crew-command="quantity-inc"/);
	assert.match(CREW_LAYER_HBS, /data-sw5e-crew-command="quantity-dec"/);
	assert.match(CREW_LAYER_HBS, /data-membership-id="\{\{membershipId\}\}"/);
	assert.match(CREW_LAYER_HBS, /\(\{\{crew\.visibleQuantitySum\}\}\)/);
	assert.match(SHEET_SRC, /quantity-inc/);
	assert.match(SHEET_SRC, /quantity-dec/);
	assert.match(SHEET_SRC, /adjustStarshipCrewMembershipQuantity/);
	assert.equal(EN_JSON["SW5E.StarshipCrewQuantityIncrease"], "Increase crew quantity");
	assert.equal(EN_JSON["SW5E.StarshipCrewQuantityDecrease"], "Decrease crew quantity");
	assert.equal(EN_JSON["SW5E.StarshipCrewQuantity"], "Quantity");
	assert.match(CREW_LESS, /sw5e-starship-crew-quantity/);
});

test("partial signature includes membershipId, kind, quantity", () => {
	const base = {
		crew: {
			roster: [{
				uuid: "Actor.npc1",
				membershipId: "agg_1",
				kind: "aggregate",
				quantity: 3,
				name: "Trooper",
				img: "",
				searchText: "",
				assignmentSubtitle: "",
				customRole: "",
				membershipHidden: false,
				active: false,
				isPilot: false,
				isCrew: true,
				isPassenger: false,
				canUndeployPilot: false,
				canSetPilot: false,
				canToggleActive: false,
				canRemove: true,
				canAdjustQuantity: true,
				canQuantityIncrement: true,
				canQuantityDecrement: true
			}],
			visibleQuantitySum: 3
		},
		crewRoleGroups: []
	};
	const a = signaturePayloadCoreCrew(base);
	assert.equal(a.crew.roster[0].membershipId, "agg_1");
	assert.equal(a.crew.roster[0].kind, "aggregate");
	assert.equal(a.crew.roster[0].quantity, 3);
	assert.equal(a.crew.visibleQuantitySum, 3);

	const b = signaturePayloadCoreCrew({
		...base,
		crew: {
			...base.crew,
			roster: [{ ...base.crew.roster[0], quantity: 4 }],
			visibleQuantitySum: 4
		}
	});
	assert.notEqual(stableSignature(a), stableSignature(b));
});

console.log(`\n${passed} passed`);
