#!/usr/bin/env node
/**
 * Offline tests for Phase 1A′ GM Alt-drop → hidden crew membership.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	deployStarshipCrew,
	getStarshipCrewMembershipHidden,
	isStarshipCrewMemberUuid
} from "../scripts/starship-character.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DROP_SRC = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet.mjs"), "utf8");

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
	const profiles = starship.flags.sw5e.starship.crewProfiles;
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
		if ( key.startsWith("flags.sw5e.starship.crewProfiles.") && !key.includes(".-=") && !key.includes(".Actor.") ) {
			const storageKey = key.slice("flags.sw5e.starship.crewProfiles.".length);
			if ( storageKey.startsWith("-=") ) {
				delete profiles[storageKey.slice(2)];
			} else {
				profiles[storageKey] = value;
			}
		}
	}
}

function makeCrewActor(uuid, name="Crew") {
	return {
		documentName: "Actor",
		type: "character",
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

function makeStarship({ crewUuids=[] }={}) {
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
								pilot: { value: null, active: false },
								crew: { items: [...crewUuids], active: false },
								passenger: { items: [], active: false },
								active: { value: null }
							}
						}
					}
				},
				starship: { crewProfiles: {} }
			}
		},
		canUserModify() { return true; },
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

test("drop wrapper passes hidden intent without writing crewProfiles paths", () => {
	const start = DROP_SRC.indexOf("function registerStarshipCrewDropWrapper");
	const end = DROP_SRC.indexOf("\nasync function renderStarshipLayer", start);
	assert.ok(start >= 0 && end > start, "drop wrapper region located");
	const region = DROP_SRC.slice(start, end);
	assert.match(region, /hiddenIntent/);
	assert.match(region, /hidden:\s*true/);
	assert.match(region, /event\?\.altKey/);
	assert.doesNotMatch(region, /crewProfiles/);
	assert.doesNotMatch(region, /flags\.sw5e\.starship\.crewProfiles/);
});

await testAsync("GM deploy with hidden:true writes membership + profile in one starship.update", async () => {
	const crew = makeCrewActor("Actor.crewNew");
	const starship = makeStarship();
	await withGameUserAsync({ id: "gm", isGM: true }, async () => {
		const ok = await deployStarshipCrew(starship, crew, "crew", { hidden: true });
		assert.equal(ok, true);
		assert.equal(isStarshipCrewMemberUuid(starship, crew.uuid), true);
		assert.equal(getStarshipCrewMembershipHidden(starship, crew.uuid), true);
		assert.equal(starship.updates.length, 1, "prefer single starship update");
		const payload = starship.updates[0];
		const profileKey = `flags.sw5e.starship.crewProfiles.${encodeProfileKey(crew.uuid)}`;
		assert.ok(payload["flags.sw5e.legacyStarshipActor.system.attributes.deployment.crew.items"]);
		assert.deepEqual(payload[profileKey], { hidden: true });
	});
});

await testAsync("GM deploy hidden on already-deployed member hides without duplicate membership", async () => {
	const crew = makeCrewActor("Actor.crewExisting");
	const starship = makeStarship({ crewUuids: [crew.uuid] });
	await withGameUserAsync({ id: "gm", isGM: true }, async () => {
		const ok = await deployStarshipCrew(starship, crew, "crew", { hidden: true });
		assert.equal(ok, true);
		const items = starship.flags.sw5e.legacyStarshipActor.system.attributes.deployment.crew.items;
		assert.equal(items.filter(u => u === crew.uuid).length, 1);
		assert.equal(getStarshipCrewMembershipHidden(starship, crew.uuid), true);
	});
});

await testAsync("non-GM hidden option is ignored (visible deploy)", async () => {
	const crew = makeCrewActor("Actor.crewPlayer");
	const starship = makeStarship();
	await withGameUserAsync({ id: "p1", isGM: false }, async () => {
		const ok = await deployStarshipCrew(starship, crew, "crew", { hidden: true });
		assert.equal(ok, true);
		assert.equal(isStarshipCrewMemberUuid(starship, crew.uuid), true);
		assert.equal(getStarshipCrewMembershipHidden(starship, crew.uuid), false);
		const payload = starship.updates[0];
		const profileKey = `flags.sw5e.starship.crewProfiles.${encodeProfileKey(crew.uuid)}`;
		assert.equal(payload[profileKey], undefined);
	});
});

await testAsync("plain deploy without options leaves membership visible", async () => {
	const crew = makeCrewActor("Actor.crewPlain");
	const starship = makeStarship();
	await withGameUserAsync({ id: "gm", isGM: true }, async () => {
		const ok = await deployStarshipCrew(starship, crew, "crew");
		assert.equal(ok, true);
		assert.equal(getStarshipCrewMembershipHidden(starship, crew.uuid), false);
	});
});

console.log(`\n${passed} passed`);
