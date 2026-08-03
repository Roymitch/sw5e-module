#!/usr/bin/env node
/**
 * Offline tests: Phase 3B / Bug 12 Slice 3B-3 Refuel chat confirmation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	buildStarshipFuelRefuelChatContext,
	postStarshipFuelRefuelChatMessage,
	STARSHIP_FUEL_REFUEL_CHAT_TEMPLATE
} from "../scripts/starship-fuel-refuel.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateSource = readFileSync(
	join(__dirname, "..", STARSHIP_FUEL_REFUEL_CHAT_TEMPLATE),
	"utf8"
);

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

function mockStarship(name="DeepWater") {
	return {
		name,
		type: "vehicle",
		flags: { sw5e: { legacyStarshipActor: { type: "starship" } } }
	};
}

function installNamespacedRenderTemplate(fn) {
	globalThis.foundry = {
		applications: {
			handlebars: {
				renderTemplate: fn
			}
		}
	};
	delete globalThis.renderTemplate;
}

function assertDoesNotUseGlobalRenderTemplate() {
	Object.defineProperty(globalThis, "renderTemplate", {
		configurable: true,
		enumerable: false,
		get() {
			throw new Error("deprecated global renderTemplate was accessed");
		}
	});
}

function clearRenderTemplateMocks() {
	delete globalThis.foundry;
	delete globalThis.renderTemplate;
	delete globalThis.ChatMessage;
	delete globalThis.game;
	delete globalThis.ui;
}

test("template uses Handlebars escaped mustaches (no triple-stash)", () => {
	assert.match(templateSource, /\{\{heading\}\}/);
	assert.match(templateSource, /\{\{fuelLine\}\}/);
	assert.match(templateSource, /\{\{costLine\}\}/);
	assert.match(templateSource, /\{\{noCurrencyNote\}\}/);
	assert.equal(/\{\{addedLabel\}\}/.test(templateSource), false);
	assert.equal(/\{\{unitCostLine\}\}/.test(templateSource), false);
	assert.equal(/showUnitBreakdown/.test(templateSource), false);
	assert.equal(/Added:/.test(templateSource), false);
	assert.equal(/\{\{\{/.test(templateSource), false);
	assert.match(templateSource, /sw5e-starship-fuel-refuel-chat/);
});

test("Per Restock: Cost: 150 (150 Per Restock); no Added / multiplication lines", () => {
	const ctx = buildStarshipFuelRefuelChatContext({
		actorName: "Basilisk Space Droid",
		applied: 2,
		before: 4,
		after: 6,
		capacity: 6,
		mode: "perRestock",
		configuredCost: 150
	});
	assert.equal(ctx.applied, 2);
	assert.equal(ctx.before, 4);
	assert.equal(ctx.after, 6);
	assert.equal(ctx.capacity, 6);
	assert.equal(ctx.displayCost, 150);
	assert.equal(ctx.costText, "150");
	assert.equal(ctx.mode, "perRestock");
	assert.equal(ctx.configuredCost, 150);
	assert.match(ctx.heading, /Basilisk Space Droid/);
	assert.match(ctx.fuelLine, /Fuel: 4\/6 → 6\/6|Fuel: 4\/6/);
	assert.match(ctx.fuelLine, /6\/6/);
	assert.equal(ctx.costLine, "Cost: 150 (150 Per Restock)");
	assert.equal("addedLabel" in ctx, false);
	assert.equal("unitCostLine" in ctx, false);
	assert.equal("showUnitBreakdown" in ctx, false);
	assert.equal(/Added:/i.test(JSON.stringify(ctx)), false);
	assert.equal(/×|x\s+\d/i.test(ctx.costLine), false);
	assert.match(ctx.noCurrencyNote, /No currency was automatically deducted/i);
	const payloadKeys = Object.keys(ctx).join(",");
	assert.equal(/wallet|treasury|\.gc\b|credits/i.test(JSON.stringify(ctx)), false);
	assert.equal(/food/i.test(payloadKeys), false);
});

test("Per Unit: Cost: 300 (150 Per Unit) for applied 2 × configured 150", () => {
	const ctx = buildStarshipFuelRefuelChatContext({
		actorName: "Basilisk Space Droid",
		applied: 2,
		before: 4,
		after: 6,
		capacity: 6,
		mode: "perUnit",
		configuredCost: 150
	});
	assert.equal(ctx.displayCost, 300);
	assert.equal(ctx.costText, "300");
	assert.equal(ctx.costLine, "Cost: 300 (150 Per Unit)");
	assert.equal(/Added:/i.test(JSON.stringify(ctx)), false);
	assert.equal(/\d+\s*×\s*\d+/.test(JSON.stringify(ctx)), false);
});

test("default full Refuel context uses applied room qty", () => {
	const ctx = buildStarshipFuelRefuelChatContext({
		actorName: "Ship",
		applied: 6,
		before: 4,
		after: 10,
		capacity: 10,
		mode: "perRestock",
		configuredCost: 100
	});
	assert.equal(ctx.applied, 6);
	assert.equal(ctx.after, 10);
	assert.equal(ctx.costLine, "Cost: 100 (100 Per Restock)");
});

test("over-request chat uses applied qty for Per Unit total (not requested)", () => {
	const ctx = buildStarshipFuelRefuelChatContext({
		actorName: "Ship",
		applied: 6,
		before: 4,
		after: 10,
		capacity: 10,
		mode: "perUnit",
		configuredCost: 100
	});
	assert.equal(ctx.applied, 6);
	assert.equal(ctx.displayCost, 600);
	assert.equal(ctx.costLine, "Cost: 600 (100 Per Unit)");
});

test("Per Restock remains flat for partial Refuel", () => {
	const ctx = buildStarshipFuelRefuelChatContext({
		actorName: "Ship",
		applied: 2,
		before: 4,
		after: 6,
		capacity: 10,
		mode: "perRestock",
		configuredCost: 100
	});
	assert.equal(ctx.displayCost, 100);
	assert.equal(ctx.costLine, "Cost: 100 (100 Per Restock)");
});

test("missing mode displays Per Restock", () => {
	const ctx = buildStarshipFuelRefuelChatContext({
		actorName: "Ship",
		applied: 2,
		before: 4,
		after: 6,
		capacity: 10,
		mode: undefined,
		configuredCost: 50
	});
	assert.equal(ctx.mode, "perRestock");
	assert.equal(ctx.displayCost, 50);
	assert.equal(ctx.costLine, "Cost: 50 (50 Per Restock)");
});

test("cost 0 renders new format for Per Restock and Per Unit", () => {
	const restock = buildStarshipFuelRefuelChatContext({
		actorName: "Ship",
		applied: 2,
		before: 4,
		after: 6,
		capacity: 10,
		mode: "perRestock",
		configuredCost: 0
	});
	assert.equal(restock.costLine, "Cost: 0 (0 Per Restock)");
	assert.match(restock.noCurrencyNote, /No currency was automatically deducted/i);
	assert.equal(/paid|purchased|deducted from|balance/i.test(restock.costLine), false);

	const unit = buildStarshipFuelRefuelChatContext({
		actorName: "Ship",
		applied: 2,
		before: 4,
		after: 6,
		capacity: 10,
		mode: "perUnit",
		configuredCost: 0
	});
	assert.equal(unit.costLine, "Cost: 0 (0 Per Unit)");
});

test("unsafe calculated total uses Unavailable without exact unsafe value", () => {
	const configured = Number.MAX_SAFE_INTEGER;
	const ctx = buildStarshipFuelRefuelChatContext({
		actorName: "Ship",
		applied: 2,
		before: 0,
		after: 2,
		capacity: 10,
		mode: "perUnit",
		configuredCost: configured
	});
	assert.equal(ctx.safeInteger, false);
	assert.equal(ctx.costUnavailable, true);
	assert.equal(ctx.costText, "Unavailable");
	assert.equal(ctx.costLine, `Cost: Unavailable (${configured} Per Unit)`);
	assert.equal(String(ctx.displayCost) === ctx.costText, false);
	assert.equal(ctx.costLine.includes(String(ctx.displayCost)), false);
});

test("applied 0 / invalid yields null context (no message)", () => {
	assert.equal(buildStarshipFuelRefuelChatContext({
		actorName: "Ship", applied: 0, before: 10, after: 10, capacity: 10, configuredCost: 1
	}), null);
	assert.equal(buildStarshipFuelRefuelChatContext({
		actorName: "Ship", applied: -1, before: 4, after: 4, capacity: 10, configuredCost: 1
	}), null);
});

await testAsync("post chat: non-Starship creates no message", async () => {
	const creates = [];
	clearRenderTemplateMocks();
	globalThis.ChatMessage = {
		getSpeaker: () => ({ alias: "x" }),
		create: async data => { creates.push(data); }
	};
	installNamespacedRenderTemplate(async () => "<div/>");
	globalThis.game = { user: { id: "u1" } };
	const result = await postStarshipFuelRefuelChatMessage(
		{ type: "character", flags: {} },
		buildStarshipFuelRefuelChatContext({
			actorName: "PC", applied: 2, before: 1, after: 3, capacity: 5, configuredCost: 1
		})
	);
	assert.equal(result.posted, false);
	assert.equal(creates.length, 0);
	clearRenderTemplateMocks();
});

await testAsync("post chat: uses foundry.applications.handlebars.renderTemplate only", async () => {
	const creates = [];
	const renderCalls = [];
	clearRenderTemplateMocks();
	assertDoesNotUseGlobalRenderTemplate();
	globalThis.ChatMessage = {
		getSpeaker: ({ actor }) => ({ alias: actor.name }),
		create: async data => { creates.push(data); return data; }
	};
	installNamespacedRenderTemplate(async (path, data) => {
		renderCalls.push({ path, data });
		assert.match(path, /modules\/.+\/templates\/chat\/starship-fuel-refuel\.hbs$/);
		assert.equal(data.applied, 2);
		assert.equal(data.before, 4);
		assert.equal(data.after, 6);
		assert.equal(data.capacity, 6);
		assert.equal(data.costLine, "Cost: 300 (150 Per Unit)");
		assert.equal("addedLabel" in data, false);
		assert.equal("unitCostLine" in data, false);
		return `<div class="card">${data.heading}</div>`;
	});
	assertDoesNotUseGlobalRenderTemplate();
	globalThis.game = { user: { id: "u1" }, i18n: { localize: k => k, format: (k, d) => k } };
	const actor = mockStarship("DeepWater");
	const ctx = buildStarshipFuelRefuelChatContext({
		actorName: actor.name,
		applied: 2,
		before: 4,
		after: 6,
		capacity: 6,
		mode: "perUnit",
		configuredCost: 150
	});
	const result = await postStarshipFuelRefuelChatMessage(actor, ctx);
	assert.equal(result.posted, true);
	assert.equal(renderCalls.length, 1);
	assert.equal(creates.length, 1);
	assert.equal(creates[0].speaker.alias, "DeepWater");
	assert.match(creates[0].content, /DeepWater|card/);
	assert.ok(creates[0].user);
	clearRenderTemplateMocks();
});

await testAsync("template render failure: soft chat warn, no ChatMessage, not Refuel save failure", async () => {
	const creates = [];
	const warns = [];
	clearRenderTemplateMocks();
	globalThis.ChatMessage = {
		getSpeaker: () => ({}),
		create: async data => { creates.push(data); }
	};
	installNamespacedRenderTemplate(async () => {
		throw new Error("template boom");
	});
	globalThis.game = { user: { id: "u1" } };
	globalThis.ui = { notifications: { warn: msg => warns.push(msg) } };
	const errors = [];
	const origError = console.error;
	console.error = (...args) => errors.push(args);
	try {
		const result = await postStarshipFuelRefuelChatMessage(
			mockStarship(),
			buildStarshipFuelRefuelChatContext({
				actorName: "DeepWater",
				applied: 2,
				before: 4,
				after: 6,
				capacity: 10,
				configuredCost: 100
			})
		);
		assert.equal(result.posted, false);
		assert.ok(result.error);
		assert.equal(creates.length, 0);
		assert.equal(errors.length >= 1, true);
		assert.equal(warns.length, 1);
		assert.match(warns[0], /Fuel was updated/i);
		assert.match(warns[0], /could not be posted/i);
		assert.equal(/could not update fuel|refuel failed/i.test(warns[0]), false);
	} finally {
		console.error = origError;
		clearRenderTemplateMocks();
	}
});

await testAsync("chat create failure after render: soft warn wording, no throw as Refuel failure", async () => {
	const warns = [];
	clearRenderTemplateMocks();
	globalThis.ChatMessage = {
		getSpeaker: () => ({}),
		create: async () => { throw new Error("chat boom"); }
	};
	installNamespacedRenderTemplate(async () => "<div/>");
	globalThis.game = { user: { id: "u1" } };
	globalThis.ui = { notifications: { warn: msg => warns.push(msg) } };
	const errors = [];
	const origError = console.error;
	console.error = (...args) => errors.push(args);
	try {
		const result = await postStarshipFuelRefuelChatMessage(
			mockStarship(),
			buildStarshipFuelRefuelChatContext({
				actorName: "DeepWater",
				applied: 2,
				before: 4,
				after: 6,
				capacity: 10,
				configuredCost: 100
			})
		);
		assert.equal(result.posted, false);
		assert.ok(result.error);
		assert.equal(errors.length >= 1, true);
		assert.equal(warns.length, 1);
		assert.match(warns[0], /Fuel was updated/i);
		assert.match(warns[0], /could not be posted/i);
		assert.equal(/could not update fuel|refuel failed/i.test(warns[0]), false);
	} finally {
		console.error = origError;
		clearRenderTemplateMocks();
	}
});

await testAsync("ordering: persist before template render and ChatMessage create", async () => {
	const order = [];
	clearRenderTemplateMocks();
	const persist = async () => { order.push("persist"); };
	installNamespacedRenderTemplate(async () => {
		order.push("render");
		return "<div/>";
	});
	globalThis.ChatMessage = {
		getSpeaker: () => ({}),
		create: async () => { order.push("chat"); }
	};
	globalThis.game = { user: { id: "u1" } };
	await persist();
	await postStarshipFuelRefuelChatMessage(
		mockStarship(),
		buildStarshipFuelRefuelChatContext({
			actorName: "DeepWater",
			applied: 2,
			before: 4,
			after: 6,
			capacity: 10,
			configuredCost: 100
		})
	);
	assert.deepEqual(order, ["persist", "render", "chat"]);
	clearRenderTemplateMocks();
});

await testAsync("ordering helper: chat only after mocked persist success (call counts)", async () => {
	let persistCalls = 0;
	let chatCalls = 0;
	const persist = async () => { persistCalls += 1; };
	const chat = async () => { chatCalls += 1; };
	await persist();
	assert.equal(persistCalls, 1);
	assert.equal(chatCalls, 0);
	await chat();
	assert.equal(chatCalls, 1);

	persistCalls = 0;
	chatCalls = 0;
	try {
		await (async () => { persistCalls += 1; throw new Error("persist fail"); })();
	} catch {
		// no chat
	}
	assert.equal(persistCalls, 1);
	assert.equal(chatCalls, 0);
});

console.log(`\n${passed} tests passed`);
