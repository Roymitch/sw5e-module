#!/usr/bin/env node
/**
 * Offline tests: Skills/Flight Manifest top alignment + Power Routing collapsible cleanup.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signaturePayloadCoreSystemsRouting, stableSignature } from "../scripts/patch/starship-sheet-partial.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EN = JSON.parse(fs.readFileSync(path.join(ROOT, "languages/en.json"), "utf8"));
const LAYER = fs.readFileSync(path.join(ROOT, "templates/starship-sheet-layer.hbs"), "utf8");
const VITALS = fs.readFileSync(path.join(ROOT, "templates/starship-sidebar-vitals.hbs"), "utf8");
const CONTEXT = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet-core-context.mjs"), "utf8");
const DELEGATES = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet-delegates.mjs"), "utf8");
const CORE_PANELS = fs.readFileSync(path.join(ROOT, "styles/less/starship-core-panels.less"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

test("Skills/Flight Manifest alignment uses zero panel margin-top (no transform offset)", () => {
	const panelRule = CORE_PANELS.match(
		/\.dnd5e2\.sheet\.actor\.sw5e-starship-sheet \.sw5e-starship-tab :is\(\s*\.sw5e-starship-core-advanced-power-panel,[\s\S]*?\.sw5e-starship-crew-panel\s*\)\s*\{([\s\S]*?)\}/
	)?.[1];
	assert.ok(panelRule, "expected shared Core collapsible panel layout rule");
	assert.match(panelRule, /margin-top:\s*0;/);
	assert.doesNotMatch(panelRule, /margin-top:\s*0\.65rem/);
	assert.doesNotMatch(CORE_PANELS, /sw5e-starship-overview-operations[\s\S]{0,200}transform:\s*translateY\(/);
	assert.doesNotMatch(CORE_PANELS, /sw5e-starship-crew-panel[\s\S]{0,120}position:\s*relative;\s*top:\s*-/);
	assert.match(LAYER, /sw5e-starship-overview-skills/);
	assert.match(LAYER, /sw5e-starship-overview-operations/);
	assert.match(LAYER, /sw5e-starship-crew-panel/);
});

test("Power Routing is a single standard collapsible Core section", () => {
	const routingInline = LAYER.match(
		/\{\{#\*inline "sw5e-starship-core-routing"\}\}[\s\S]*?\{\{\/inline\}\}/
	)?.[0];
	assert.ok(routingInline);
	assert.match(routingInline, /data-sw5e-core-panel="routing"/);
	assert.match(routingInline, /sw5e-starship-core-routing-collapse/);
	assert.match(routingInline, /data-core-panel="routing"/);
	assert.match(routingInline, /sw5e-starship-core-collapsible-body/);
	assert.match(routingInline, /id="sw5e-core-routing"/);
	assert.match(routingInline, /name="system\.attributes\.power\.routing"/);
	assert.match(routingInline, /aria-labelledby="sw5e-core-routing-heading"/);
	assert.equal((routingInline.match(/systemsCore\.labels\.powerRouting/g) ?? []).length, 2);
	assert.doesNotMatch(routingInline, /sw5e-starship-systems-routing-hint/);
	assert.doesNotMatch(routingInline, /sw5e-starship-systems-routing-badge/);
	assert.doesNotMatch(routingInline, /powerRoutingLegacyBadge|powerRoutingHint/);
	assert.doesNotMatch(routingInline, /systems-field--routing-primary/);
});

test("Collapse persistence uses flags.sw5e.starship.ui.routingCollapsed; default expanded", () => {
	assert.match(CONTEXT, /routing:\s*starshipUi\.routingCollapsed === true/);
	assert.match(DELEGATES, /routingCollapsed/);
	assert.match(DELEGATES, /panelKey === "routing"/);
	assert.equal(EN["SW5E.PowerRouting"], "Power Routing");
	assert.equal(EN["SW5E.StarshipSheet.CoreRoutingExpand"], "Expand Power Routing");
	assert.equal(EN["SW5E.StarshipSheet.CoreRoutingCollapse"], "Collapse Power Routing");
});

test("Core systems signature dirties when routing collapse flips", () => {
	const base = {
		showPowerRouting: true,
		systemsCore: {
			labels: { powerRouting: "Power Routing", fuel: "Fuel" },
			routingOptions: [{ value: "none", label: "None", selected: true }],
			coreCollapse: { routing: false, fuel: false },
			coreCollapseLabels: {
				routing: { expand: "Expand Power Routing", collapse: "Collapse Power Routing" },
				fuel: { expand: "Expand Fuel", collapse: "Collapse Fuel" }
			},
			advancedPower: { collapsed: false, slots: [] }
		}
	};
	const collapsed = {
		...base,
		systemsCore: {
			...base.systemsCore,
			coreCollapse: { routing: true, fuel: false }
		}
	};
	assert.equal(signaturePayloadCoreSystemsRouting(base).systemsCore.coreCollapse.routing, false);
	assert.equal(signaturePayloadCoreSystemsRouting(collapsed).systemsCore.coreCollapse.routing, true);
	assert.notEqual(
		stableSignature(signaturePayloadCoreSystemsRouting(base)),
		stableSignature(signaturePayloadCoreSystemsRouting(collapsed))
	);
	assert.equal(
		"powerRoutingHint" in signaturePayloadCoreSystemsRouting(base).systemsCore,
		false
	);
	assert.equal(
		"powerRoutingLegacyBadge" in signaturePayloadCoreSystemsRouting(base).systemsCore,
		false
	);
});

test("Flight Manifest, Power Die Allocation, Fuel, and sidebar repair controls remain", () => {
	assert.match(LAYER, /SW5E\.StarshipCrewPanelTitle/);
	assert.match(LAYER, /sw5e-starship-crew-panel-count/);
	assert.match(LAYER, /data-sw5e-core-panel="advancedPower"/);
	assert.match(LAYER, /data-sw5e-core-panel="fuel"/);
	assert.match(VITALS, /data-sw5e-repair-action="recharge"/);
	assert.match(VITALS, /data-sw5e-repair-action="refitting"/);
	assert.match(VITALS, /data-sw5e-repair-action="regen"/);
	assert.match(LAYER, /sw5e-crew-row--membership-hidden/);
});

test("Show Power Routing visibility gate remains separate from collapse", () => {
	assert.match(LAYER, /\{\{#if showPowerRouting\}\}/);
	assert.match(DELEGATES, /data-sw5e-legacy-power-routing-toggle/);
	assert.equal(EN["SW5E.StarshipSheet.ShowLegacyPowerRouting"], "Show Power Routing");
});

console.log(`\n${passed} tests passed`);
