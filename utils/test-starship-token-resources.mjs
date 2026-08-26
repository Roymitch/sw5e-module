#!/usr/bin/env node
/**
 * Offline tests: Phase 5 / Bug 10 Starship virtual Token Resources (HUD write-back).
 */
import assert from "node:assert/strict";
import {
	STARSHIP_TOKEN_RESOURCE_FALLBACKS,
	STARSHIP_TOKEN_RESOURCE_HULL,
	STARSHIP_TOKEN_RESOURCE_I18N,
	STARSHIP_TOKEN_RESOURCE_SHIELDS,
	STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS,
	appendStarshipTokenResourceChoices,
	applyStarshipVirtualTokenAttributeUpdate,
	getStarshipTokenResourceRegistrationPlan,
	isStarshipTokenResourceAttribute,
	normalizeStarshipTokenResourceCurrent,
	resolveRequestedBarAttribute,
	resolveStarshipVirtualBarAttribute,
	resolveStarshipVirtualTokenAttributeNext,
	shouldHandleStarshipVirtualTokenAttribute,
	wrapStarshipGetBarAttribute,
	wrapStarshipModifyTokenAttribute
} from "../scripts/starship-token-resources.mjs";
import {
	getStarshipEffectiveHullMax,
	getStarshipEffectiveShieldMax
} from "../scripts/starship-system-damage.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

async function testAsync(name, fn) {
	await fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function starshipActor({
	hullValue = 10,
	hullMax = 56,
	shieldValue = 32,
	shieldMax = 57,
	systemDamage = 0,
	allowUpdate = false
} = {}) {
	const actor = {
		type: "vehicle",
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: {
						attributes: { systemDamage }
					}
				}
			}
		},
		system: {
			attributes: {
				hp: {
					value: hullValue,
					max: hullMax,
					temp: shieldValue,
					tempmax: shieldMax
				},
				systemDamage
			}
		},
		update: async () => {
			throw new Error("Actor.update must not be called during virtual token resource resolution");
		}
	};
	if ( allowUpdate ) {
		actor.update = async (data) => {
			actor._lastUpdate = structuredClone(data);
			for ( const [path, value] of Object.entries(data) ) {
				const parts = path.split(".");
				let cur = actor;
				for ( let i = 0; i < parts.length - 1; i++ ) {
					cur = cur[parts[i]];
				}
				cur[parts[parts.length - 1]] = value;
			}
			return actor;
		};
	}
	return actor;
}

function ordinaryVehicle() {
	return {
		type: "vehicle",
		flags: {},
		system: {
			attributes: {
				hp: { value: 40, max: 40, temp: 5, tempmax: 5 }
			}
		}
	};
}

function characterActor() {
	return {
		type: "character",
		flags: {},
		system: {
			attributes: {
				hp: { value: 20, max: 20, temp: 3, tempmax: 0 }
			}
		}
	};
}

function npcActor() {
	return {
		type: "npc",
		flags: {},
		system: {
			attributes: {
				hp: { value: 30, max: 30, temp: 0, tempmax: 0 }
			}
		}
	};
}

const stockChoices = [
	{ group: "Attribute Bars", value: "attributes.hp", label: "Hit Points" },
	{ group: "Ability Scores", value: "abilities.str.value", label: "Strength Score" },
	{ group: "Consume Charges", value: ".Item.abc123", label: "Torpedo Launcher" }
];

// —— A. Identifier detection ——
test("A: recognizes Starship Hull", () => {
	assert.equal(isStarshipTokenResourceAttribute(STARSHIP_TOKEN_RESOURCE_HULL), true);
});

test("A: recognizes Starship Shields", () => {
	assert.equal(isStarshipTokenResourceAttribute(STARSHIP_TOKEN_RESOURCE_SHIELDS), true);
});

test("A: rejects unknown SW5e identifiers", () => {
	assert.equal(isStarshipTokenResourceAttribute("sw5e.unknown"), false);
	assert.equal(isStarshipTokenResourceAttribute("sw5e.starshipHull.extra"), false);
});

test("A: stock attributes are not virtual identifiers", () => {
	assert.equal(isStarshipTokenResourceAttribute("attributes.hp"), false);
	assert.equal(isStarshipTokenResourceAttribute("attributes.hp.temp"), false);
	assert.equal(isStarshipTokenResourceAttribute(".Item.abc"), false);
});

// —— B. Hull contract ——
test("B: Hull 10/56 with Shields 32/57 returns hull-only and editable true", () => {
	const actor = starshipActor();
	const bar = resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_HULL);
	const expectedMax = getStarshipEffectiveHullMax(actor, 56);
	assert.deepEqual(bar, {
		type: "bar",
		attribute: STARSHIP_TOKEN_RESOURCE_HULL,
		value: 10,
		max: expectedMax,
		editable: true
	});
	assert.equal(bar.value, 10);
	assert.notEqual(bar.value, 42);
	assert.notEqual(bar.max, 113);
});

test("B: Hull 0 is preserved", () => {
	const actor = starshipActor({ hullValue: 0 });
	const bar = resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_HULL);
	assert.equal(bar.value, 0);
	assert.equal(bar.editable, true);
});

// —— C. Shield contract ——
test("C: Shields 32/57 with Hull 10/56 returns shield-only and editable true", () => {
	const actor = starshipActor();
	const bar = resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_SHIELDS);
	const expectedMax = getStarshipEffectiveShieldMax(actor, 57);
	assert.deepEqual(bar, {
		type: "bar",
		attribute: STARSHIP_TOKEN_RESOURCE_SHIELDS,
		value: 32,
		max: expectedMax,
		editable: true
	});
	assert.notEqual(bar.value, 10);
	assert.notEqual(bar.max, 56);
});

test("C: Shields 0 is preserved", () => {
	const actor = starshipActor({ shieldValue: 0 });
	const bar = resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_SHIELDS);
	assert.equal(bar.value, 0);
	assert.equal(bar.editable, true);
});

// —— D. Effective caps ——
test("D: virtual maxima match effective helpers; SD≥4 halves; not persisted", () => {
	const actor = starshipActor({ systemDamage: 4 });
	const hull = resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_HULL);
	const shields = resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_SHIELDS);
	assert.equal(hull.max, getStarshipEffectiveHullMax(actor, 56));
	assert.equal(shields.max, getStarshipEffectiveShieldMax(actor, 57));
	assert.equal(hull.max, 28);
	assert.equal(shields.max, 28);
	assert.equal(actor.system.attributes.hp.max, 56);
	assert.equal(actor.system.attributes.hp.tempmax, 57);
});

test("D: SD 0 effective max equals stored max", () => {
	const actor = starshipActor({ systemDamage: 0 });
	assert.equal(resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_HULL).max, 56);
	assert.equal(resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_SHIELDS).max, 57);
});

// —— E. Dropdown choices ——
test("E: Starship receives group + both choices once; stock preserved; no duplicates", () => {
	const actor = starshipActor();
	const choices = structuredClone(stockChoices);
	appendStarshipTokenResourceChoices(choices, actor);
	appendStarshipTokenResourceChoices(choices, actor);

	const hullEntries = choices.filter(c => c.value === STARSHIP_TOKEN_RESOURCE_HULL);
	const shieldEntries = choices.filter(c => c.value === STARSHIP_TOKEN_RESOURCE_SHIELDS);
	assert.equal(hullEntries.length, 1);
	assert.equal(shieldEntries.length, 1);
	assert.equal(hullEntries[0].group, STARSHIP_TOKEN_RESOURCE_FALLBACKS.group);
	assert.equal(shieldEntries[0].group, STARSHIP_TOKEN_RESOURCE_FALLBACKS.group);
	assert.equal(hullEntries[0].label, STARSHIP_TOKEN_RESOURCE_FALLBACKS.hull);
	assert.equal(shieldEntries[0].label, STARSHIP_TOKEN_RESOURCE_FALLBACKS.shields);
	assert.equal(choices[0].value, "attributes.hp");
	assert.equal(choices[2].value, ".Item.abc123");
	assert.equal(choices.length, stockChoices.length + 2);
});

test("E: Character/NPC/ordinary Vehicle do not receive virtual choices", () => {
	for ( const actor of [characterActor(), npcActor(), ordinaryVehicle()] ) {
		const choices = structuredClone(stockChoices);
		appendStarshipTokenResourceChoices(choices, actor);
		assert.deepEqual(choices, stockChoices);
		assert.equal(choices.some(c => isStarshipTokenResourceAttribute(c.value)), false);
	}
});

// —— F. Stock delegation ——
test("F: stock Hit Points / item / unknown / non-Starship return undefined (delegate)", () => {
	const ship = starshipActor();
	assert.equal(resolveStarshipVirtualBarAttribute(ship, "attributes.hp"), undefined);
	assert.equal(resolveStarshipVirtualBarAttribute(ship, ".Item.abc123"), undefined);
	assert.equal(resolveStarshipVirtualBarAttribute(ship, "sw5e.nope"), undefined);
	assert.equal(resolveStarshipVirtualBarAttribute(ordinaryVehicle(), STARSHIP_TOKEN_RESOURCE_HULL), undefined);
	assert.equal(resolveStarshipVirtualBarAttribute(characterActor(), STARSHIP_TOKEN_RESOURCE_SHIELDS), undefined);
	assert.equal(resolveStarshipVirtualBarAttribute(npcActor(), STARSHIP_TOKEN_RESOURCE_HULL), undefined);
});

// —— G. Invalid data ——
test("G: missing HP object returns null without throw or write", () => {
	const actor = starshipActor();
	delete actor.system.attributes.hp;
	assert.equal(resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_HULL), null);
	assert.equal(resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_SHIELDS), null);
});

test("G: missing temp/tempmax does not throw; no NaN", () => {
	const actor = starshipActor();
	delete actor.system.attributes.hp.temp;
	delete actor.system.attributes.hp.tempmax;
	const bar = resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_SHIELDS);
	assert.equal(bar.value, 0);
	assert.equal(Number.isFinite(bar.max), true);
	assert.equal(Number.isNaN(bar.max), false);
});

test("G: non-finite current normalizes to 0; no NaN properties", () => {
	assert.equal(normalizeStarshipTokenResourceCurrent("nope"), 0);
	const actor = starshipActor({ hullValue: "bad", shieldValue: Number.NaN });
	const hull = resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_HULL);
	const shields = resolveStarshipVirtualBarAttribute(actor, STARSHIP_TOKEN_RESOURCE_SHIELDS);
	assert.equal(hull.value, 0);
	assert.equal(shields.value, 0);
	assert.equal(Number.isNaN(hull.max), false);
	assert.equal(Number.isNaN(shields.max), false);
});

// —— H. Registration contract ——
test("H: registration wraps Token Config, getBarAttribute WRAPPER, modifyTokenAttribute MIXED", () => {
	const plan = getStarshipTokenResourceRegistrationPlan();
	assert.deepEqual(plan.wrappers, [
		STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.tokenConfig,
		STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.prototypeTokenConfig,
		STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.getBarAttribute,
		STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.modifyTokenAttribute
	]);
	assert.equal(plan.getBarAttributeType, "WRAPPER");
	assert.equal(plan.modifyTokenAttributeType, "MIXED");
	assert.equal(plan.modifyTokenAttribute, true);
	assert.match(STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.tokenConfig, /TokenConfig5e/);
	assert.match(STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.prototypeTokenConfig, /PrototypeTokenConfig5e/);
	assert.match(STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.getBarAttribute, /TokenDocument5e/);
	assert.match(STARSHIP_TOKEN_RESOURCE_WRAPPER_TARGETS.modifyTokenAttribute, /Actor5e.*modifyTokenAttribute/);
	assert.equal(STARSHIP_TOKEN_RESOURCE_I18N.group, "SW5E.TokenResource.Group");
});

/**
 * Stock-like getBarAttribute stub: virtual IDs → null; attributes.hp → combined; else marker.
 */
function createStockGetBarAttributeStub(tokenDoc, { onCall } = {}) {
	return function stockGetBarAttribute(barName, options={}) {
		onCall?.(barName, options);
		const attribute = options?.alternative || this?.[barName]?.attribute;
		if ( attribute === "attributes.hp" ) {
			const hp = this.actor?.system?.attributes?.hp ?? {};
			return {
				type: "bar",
				attribute: "attributes.hp",
				value: Number(hp.value || 0) + Number(hp.temp || 0),
				max: Number(hp.max || 0) + Number(hp.tempmax || 0),
				editable: true
			};
		}
		if ( attribute === ".Item.abc123" ) {
			return { type: "bar", attribute, value: 1, max: 2, editable: true };
		}
		return null;
	};
}

function invokeWrapper(tokenDoc, barName, options) {
	let wrappedCalls = 0;
	const wrapped = createStockGetBarAttributeStub(tokenDoc, {
		onCall: () => {
			wrappedCalls += 1;
		}
	});
	const result = wrapStarshipGetBarAttribute.call(tokenDoc, wrapped, barName, options);
	return { result, wrappedCalls };
}

function shipTokenDoc(actorOverrides = {}) {
	const actor = starshipActor(actorOverrides);
	return {
		actor,
		bar1: { attribute: "attributes.hp" },
		bar2: { attribute: null }
	};
}

// —— I. WRAPPER chain: wrapped called exactly once ——
test("I: wrapped called once for non-Starship", () => {
	const tokenDoc = {
		actor: ordinaryVehicle(),
		bar1: { attribute: "attributes.hp" }
	};
	const { result, wrappedCalls } = invokeWrapper(tokenDoc, "bar1", {});
	assert.equal(wrappedCalls, 1);
	assert.equal(result.attribute, "attributes.hp");
	assert.equal(result.value, 45);
});

test("I: wrapped called once for Starship stock Hit Points", () => {
	const tokenDoc = shipTokenDoc();
	const { result, wrappedCalls } = invokeWrapper(tokenDoc, "bar1", {});
	assert.equal(wrappedCalls, 1);
	assert.equal(result.attribute, "attributes.hp");
	assert.equal(result.value, 42);
	assert.equal(result.max, 113);
});

test("I: wrapped called once for Starship unknown attribute", () => {
	const tokenDoc = shipTokenDoc();
	tokenDoc.bar1 = { attribute: "abilities.str.value" };
	const { result, wrappedCalls } = invokeWrapper(tokenDoc, "bar1", {});
	assert.equal(wrappedCalls, 1);
	assert.equal(result, null);
});

test("I: wrapped called once for Starship Hull on bar1", () => {
	const tokenDoc = shipTokenDoc();
	tokenDoc.bar1 = { attribute: STARSHIP_TOKEN_RESOURCE_HULL };
	const { result, wrappedCalls } = invokeWrapper(tokenDoc, "bar1", {});
	assert.equal(wrappedCalls, 1);
	assert.equal(result.attribute, STARSHIP_TOKEN_RESOURCE_HULL);
	assert.equal(result.value, 10);
	assert.equal(result.max, 56);
	assert.equal(result.editable, true);
});

test("I: wrapped called once for Starship Shields on bar2", () => {
	const tokenDoc = shipTokenDoc();
	tokenDoc.bar2 = { attribute: STARSHIP_TOKEN_RESOURCE_SHIELDS };
	const { result, wrappedCalls } = invokeWrapper(tokenDoc, "bar2", {});
	assert.equal(wrappedCalls, 1);
	assert.equal(result.attribute, STARSHIP_TOKEN_RESOURCE_SHIELDS);
	assert.equal(result.value, 32);
	assert.equal(result.max, 57);
	assert.equal(result.editable, true);
});

test("I: wrapped called once for alternative Starship Hull", () => {
	const tokenDoc = shipTokenDoc();
	const { result, wrappedCalls } = invokeWrapper(tokenDoc, "", { alternative: STARSHIP_TOKEN_RESOURCE_HULL });
	assert.equal(wrappedCalls, 1);
	assert.equal(result.value, 10);
	assert.equal(result.max, 56);
});

test("I: wrapped called once for alternative Starship Shields", () => {
	const tokenDoc = shipTokenDoc();
	const { result, wrappedCalls } = invokeWrapper(tokenDoc, "", { alternative: STARSHIP_TOKEN_RESOURCE_SHIELDS });
	assert.equal(wrappedCalls, 1);
	assert.equal(result.value, 32);
	assert.equal(result.max, 57);
});

// —— J. Return behavior after chain ——
test("J: non-Starship / stock HP / unknown return wrapped result unchanged", () => {
	const vehicle = {
		actor: ordinaryVehicle(),
		bar1: { attribute: "attributes.hp" }
	};
	assert.equal(invokeWrapper(vehicle, "bar1", {}).result.value, 45);

	const shipHp = shipTokenDoc();
	assert.deepEqual(invokeWrapper(shipHp, "bar1", {}).result.attribute, "attributes.hp");

	const shipUnknown = shipTokenDoc();
	shipUnknown.bar1 = { attribute: "sw5e.nope" };
	assert.equal(invokeWrapper(shipUnknown, "bar1", {}).result, null);
});

test("J: Hull/Shields replace null stock result after wrapped call", () => {
	const tokenDoc = shipTokenDoc();
	tokenDoc.bar1 = { attribute: STARSHIP_TOKEN_RESOURCE_HULL };
	const hull = invokeWrapper(tokenDoc, "bar1", {}).result;
	assert.notEqual(hull, null);
	assert.equal(hull.type, "bar");
	assert.equal(hull.editable, true);

	tokenDoc.bar2 = { attribute: STARSHIP_TOKEN_RESOURCE_SHIELDS };
	const shields = invokeWrapper(tokenDoc, "bar2", {}).result;
	assert.equal(shields.value, 32);
	assert.equal(shields.editable, true);
});

// —— K. Alternative preview ——
test("K: alternative preview prefers options.alternative over bar storage", () => {
	const tokenDoc = shipTokenDoc();
	tokenDoc.bar1 = { attribute: "attributes.hp" };
	assert.equal(
		resolveRequestedBarAttribute(tokenDoc, "bar1", { alternative: STARSHIP_TOKEN_RESOURCE_HULL }),
		STARSHIP_TOKEN_RESOURCE_HULL
	);
	assert.equal(resolveRequestedBarAttribute(tokenDoc, "", { alternative: STARSHIP_TOKEN_RESOURCE_SHIELDS }), STARSHIP_TOKEN_RESOURCE_SHIELDS);
	assert.equal(resolveRequestedBarAttribute(tokenDoc, "bar1", {}), "attributes.hp");

	const { result } = invokeWrapper(tokenDoc, "", { alternative: STARSHIP_TOKEN_RESOURCE_HULL });
	assert.equal(result.attribute, STARSHIP_TOKEN_RESOURCE_HULL);
	assert.equal(result.value, 10);

	const stockAlt = invokeWrapper(tokenDoc, "", { alternative: "attributes.hp" }).result;
	assert.equal(stockAlt.attribute, "attributes.hp");
	assert.equal(stockAlt.value, 42);
});

// —— L. Result shape / zeros / no writes on resolve ——
test("L: virtual result shape and zero preservation; no Actor.update on resolve", () => {
	const tokenDoc = shipTokenDoc({ hullValue: 0, shieldValue: 0 });
	tokenDoc.bar1 = { attribute: STARSHIP_TOKEN_RESOURCE_HULL };
	tokenDoc.bar2 = { attribute: STARSHIP_TOKEN_RESOURCE_SHIELDS };
	const hull = invokeWrapper(tokenDoc, "bar1", {}).result;
	const shields = invokeWrapper(tokenDoc, "bar2", {}).result;
	for ( const bar of [hull, shields] ) {
		assert.equal(bar.type, "bar");
		assert.equal(typeof bar.attribute, "string");
		assert.equal(typeof bar.value, "number");
		assert.equal(typeof bar.max, "number");
		assert.equal(bar.editable, true);
		assert.equal(Number.isNaN(bar.value), false);
		assert.equal(Number.isNaN(bar.max), false);
	}
	assert.equal(hull.value, 0);
	assert.equal(shields.value, 0);
});

// —— M. Arithmetic / clamp helpers (HUD already parses +N / -N / =N / %) ——
test("M: absolute and delta next-value math clamp to effective max", () => {
	assert.equal(resolveStarshipVirtualTokenAttributeNext(10, 56, 20, false), 20);
	assert.equal(resolveStarshipVirtualTokenAttributeNext(10, 56, 5, true), 15);
	assert.equal(resolveStarshipVirtualTokenAttributeNext(10, 56, -3, true), 7);
	assert.equal(resolveStarshipVirtualTokenAttributeNext(10, 56, 100, false), 56);
	assert.equal(resolveStarshipVirtualTokenAttributeNext(10, 56, 50, true), 56);
	assert.equal(resolveStarshipVirtualTokenAttributeNext(10, 56, -20, true), 0);
	assert.equal(resolveStarshipVirtualTokenAttributeNext(10, 28, 40, false), 28);
});

test("M: shouldHandle only Starship + virtual IDs", () => {
	assert.equal(shouldHandleStarshipVirtualTokenAttribute(starshipActor(), STARSHIP_TOKEN_RESOURCE_HULL), true);
	assert.equal(shouldHandleStarshipVirtualTokenAttribute(starshipActor(), STARSHIP_TOKEN_RESOURCE_SHIELDS), true);
	assert.equal(shouldHandleStarshipVirtualTokenAttribute(starshipActor(), "attributes.hp"), false);
	assert.equal(shouldHandleStarshipVirtualTokenAttribute(ordinaryVehicle(), STARSHIP_TOKEN_RESOURCE_HULL), false);
	assert.equal(shouldHandleStarshipVirtualTokenAttribute(characterActor(), STARSHIP_TOKEN_RESOURCE_SHIELDS), false);
});

await testAsync("N: Hull absolute write → hp.value only", async () => {
	const actor = starshipActor({ allowUpdate: true });
	await applyStarshipVirtualTokenAttributeUpdate(actor, STARSHIP_TOKEN_RESOURCE_HULL, 18, false);
	assert.deepEqual(actor._lastUpdate, { "system.attributes.hp.value": 18 });
	assert.equal(actor.system.attributes.hp.value, 18);
	assert.equal(actor.system.attributes.hp.temp, 32);
});

await testAsync("N: Hull delta write (+5 / -3) → hp.value only", async () => {
	const actor = starshipActor({ allowUpdate: true });
	await applyStarshipVirtualTokenAttributeUpdate(actor, STARSHIP_TOKEN_RESOURCE_HULL, 5, true);
	assert.equal(actor.system.attributes.hp.value, 15);
	await applyStarshipVirtualTokenAttributeUpdate(actor, STARSHIP_TOKEN_RESOURCE_HULL, -3, true);
	assert.equal(actor.system.attributes.hp.value, 12);
	assert.equal(actor.system.attributes.hp.temp, 32);
});

await testAsync("N: Shields absolute/delta write → hp.temp only", async () => {
	const actor = starshipActor({ allowUpdate: true });
	await applyStarshipVirtualTokenAttributeUpdate(actor, STARSHIP_TOKEN_RESOURCE_SHIELDS, 40, false);
	assert.deepEqual(actor._lastUpdate, { "system.attributes.hp.temp": 40 });
	assert.equal(actor.system.attributes.hp.value, 10);
	await applyStarshipVirtualTokenAttributeUpdate(actor, STARSHIP_TOKEN_RESOURCE_SHIELDS, -5, true);
	assert.equal(actor.system.attributes.hp.temp, 35);
	assert.equal(actor.system.attributes.hp.value, 10);
});

await testAsync("N: writes clamp to effective max (SD≥4)", async () => {
	const actor = starshipActor({ systemDamage: 4, allowUpdate: true });
	await applyStarshipVirtualTokenAttributeUpdate(actor, STARSHIP_TOKEN_RESOURCE_HULL, 100, false);
	assert.equal(actor.system.attributes.hp.value, 28);
	await applyStarshipVirtualTokenAttributeUpdate(actor, STARSHIP_TOKEN_RESOURCE_SHIELDS, 100, false);
	assert.equal(actor.system.attributes.hp.temp, 28);
});

await testAsync("N: no-op when value unchanged skips update", async () => {
	const actor = starshipActor({ allowUpdate: true });
	actor._lastUpdate = null;
	await applyStarshipVirtualTokenAttributeUpdate(actor, STARSHIP_TOKEN_RESOURCE_HULL, 10, false);
	assert.equal(actor._lastUpdate, null);
});

await testAsync("O: MIXED wrapper handles virtual without calling stock", async () => {
	const actor = starshipActor({ allowUpdate: true });
	let stockCalls = 0;
	const wrapped = async function() {
		stockCalls += 1;
		throw new Error("stock modifyTokenAttribute must not run for virtual IDs");
	};
	await wrapStarshipModifyTokenAttribute.call(actor, wrapped, STARSHIP_TOKEN_RESOURCE_HULL, 22, false, true);
	assert.equal(stockCalls, 0);
	assert.equal(actor.system.attributes.hp.value, 22);
	await wrapStarshipModifyTokenAttribute.call(actor, wrapped, STARSHIP_TOKEN_RESOURCE_SHIELDS, -2, true, true);
	assert.equal(stockCalls, 0);
	assert.equal(actor.system.attributes.hp.temp, 30);
});

await testAsync("O: MIXED wrapper delegates attributes.hp (shield-first path preserved)", async () => {
	const actor = starshipActor({ allowUpdate: true });
	let stockCalls = 0;
	let lastArgs = null;
	const wrapped = async function(attribute, value, isDelta, isBar) {
		stockCalls += 1;
		lastArgs = { attribute, value, isDelta, isBar, thisActor: this };
		return this;
	};
	await wrapStarshipModifyTokenAttribute.call(actor, wrapped, "attributes.hp", 5, true, true);
	assert.equal(stockCalls, 1);
	assert.deepEqual(lastArgs, {
		attribute: "attributes.hp",
		value: 5,
		isDelta: true,
		isBar: true,
		thisActor: actor
	});
	assert.equal(actor.system.attributes.hp.value, 10);
	assert.equal(actor.system.attributes.hp.temp, 32);
});

await testAsync("O: MIXED wrapper does not handle non-Starship virtual IDs", async () => {
	const actor = ordinaryVehicle();
	let stockCalls = 0;
	const wrapped = async function() {
		stockCalls += 1;
		return this;
	};
	await wrapStarshipModifyTokenAttribute.call(actor, wrapped, STARSHIP_TOKEN_RESOURCE_HULL, 1, false, true);
	assert.equal(stockCalls, 1);
});

console.log(`\n${passed} tests passed`);
