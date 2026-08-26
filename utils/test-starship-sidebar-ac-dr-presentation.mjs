#!/usr/bin/env node
/**
 * Offline tests: Starship sidebar AC suppress (PLAY) + Damage Reduction label/value presentation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isStockVehicleArmorClassPillsGroup } from "../scripts/starship-sidebar-ac-suppress.mjs";
import { signaturePayloadSidebarDamageReduction } from "../scripts/patch/starship-sheet-partial.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function mockPillsGroup({ className, closest = null, query = {} }) {
	return {
		className,
		classList: {
			contains: token => new RegExp(`\\b${token}\\b`).test(className),
			[Symbol.iterator]: function* () {
				yield* className.split(/\s+/).filter(Boolean);
			}
		},
		closest: sel => {
			if ( !closest ) return null;
			if ( String(sel).split(",").some(part => closest.includes(part.trim())) ) return { mock: true };
			return null;
		},
		querySelector: sel => query[sel] ?? null
	};
}

test("PLAY stock AC pills-group matches suppress detector", () => {
	const group = mockPillsGroup({
		className: "pills-group empty",
		query: {
			"h3.icon > i.fa-shield:not(.fa-shield-halved)": { className: "fa-solid fa-shield fa-fw" },
			"h3.icon > span.counter": { textContent: "10" }
		}
	});
	assert.equal(isStockVehicleArmorClassPillsGroup(group), true);
});

test("EDIT stock AC pills-group matches via config button", () => {
	const group = mockPillsGroup({
		className: "pills-group empty",
		query: {
			"[data-action=\"showConfiguration\"][data-config=\"armorClass\"]": { dataset: { config: "armorClass" } }
		}
	});
	assert.equal(isStockVehicleArmorClassPillsGroup(group), true);
});

test("portrait / SW5e / DR groups do not match AC suppress", () => {
	assert.equal(isStockVehicleArmorClassPillsGroup(mockPillsGroup({
		className: "pills-group empty",
		closest: ".portrait",
		query: {
			"h3.icon > i.fa-shield:not(.fa-shield-halved)": {},
			"h3.icon > span.counter": {}
		}
	})), false);

	assert.equal(isStockVehicleArmorClassPillsGroup(mockPillsGroup({
		className: "pills-group empty sw5e-starship-sidebar-damage-reduction",
		query: {
			"h3.icon > i.fa-shield:not(.fa-shield-halved)": {},
			"h3.icon > span.counter": {}
		}
	})), false);

	assert.equal(isStockVehicleArmorClassPillsGroup(mockPillsGroup({
		className: "pills-group empty",
		query: {
			"h3.icon > i.fa-shield:not(.fa-shield-halved)": null,
			"h3.icon > span.counter": { textContent: "6" }
		}
	})), false);
});

test("DR signature uses separate label + value (no colon playDisplay)", () => {
	const payload = signaturePayloadSidebarDamageReduction({
		sheetEditMode: false,
		editable: false,
		showInPlay: true,
		label: "Damage Reduction",
		value: 6,
		ariaLabel: "Damage Reduction 6",
		inputValue: "",
		placeholder: "0"
	});
	assert.equal(payload.label, "Damage Reduction");
	assert.equal(payload.value, 6);
	assert.equal(payload.ariaLabel, "Damage Reduction 6");
	assert.equal("playDisplay" in payload, false);
	assert.equal(String(payload.ariaLabel).includes(":"), false);
});

test("DR PLAY template uses label + counter, not colon playDisplay", () => {
	const tpl = fs.readFileSync(
		path.join(root, "templates/starship-sidebar-damage-reduction.hbs"),
		"utf8"
	);
	assert.match(tpl, /sw5e-starship-sidebar-damage-reduction--play/);
	assert.match(tpl, /<span class="roboto-upper">\{\{label\}\}<\/span>/);
	assert.match(tpl, /<span class="counter">\{\{value\}\}<\/span>/);
	assert.equal(tpl.includes("playDisplay"), false);
	assert.equal(tpl.includes("{{label}}:"), false);
});

console.log(`\n${passed} tests passed`);
