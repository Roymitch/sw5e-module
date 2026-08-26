#!/usr/bin/env node
/**
 * Offline tests for Phase 0A-D Bug 24 starship initiative display total
 * (scripts/patch/starship-sheet-neutralize.mjs — getStarshipInitiativeDisplayTotal).
 */
import {
	formatStarshipInitiativeTotal,
	getStarshipInitiativeDisplayTotal
} from "../scripts/starship-initiative-display.mjs";

function assertEq(actual, expected, msg) {
	if ( actual !== expected ) {
		throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function fixture(overrides = {}) {
	const base = {
		system: {
			attributes: {
				init: {
					mod: 3,
					bonus: "",
					ability: "dex",
					prof: { hasProficiency: false, flat: 0 },
					total: 7
				},
				quality: { value: 4 }
			},
			abilities: {
				dex: { mod: 3, bonuses: { check: "" } }
			},
			bonuses: { abilities: { check: "" } }
		},
		flags: { dnd5e: {} }
	};
	return foundryMerge(base, overrides);
}

/** Shallow-deep merge for test fixtures only. */
function foundryMerge(target, source) {
	const out = structuredClone(target);
	function walk(dst, src) {
		for ( const [k, v] of Object.entries(src ?? {}) ) {
			if ( v && typeof v === "object" && !Array.isArray(v) ) {
				dst[k] ??= {};
				walk(dst[k], v);
			} else dst[k] = v;
		}
	}
	walk(out, source);
	return out;
}

test("B-wing-like: mod 3, total 7, quality 4 → display 3 (quality ignored)", () => {
	assertEq(getStarshipInitiativeDisplayTotal(fixture()), 3, "display");
});

test("quality absent does not change display", () => {
	const actor = fixture();
	delete actor.system.attributes.quality;
	assertEq(getStarshipInitiativeDisplayTotal(actor), 3, "no quality");
});

test("quality value 99 does not change display", () => {
	assertEq(getStarshipInitiativeDisplayTotal(fixture({
		system: { attributes: { quality: { value: 99 } } }
	})), 3, "quality 99");
});

test("does not use init.total", () => {
	assertEq(getStarshipInitiativeDisplayTotal(fixture({
		system: { attributes: { init: { total: 99, mod: 3, bonus: "" } } }
	})), 3, "ignore total 99");
});

test("finite initiative bonus adds", () => {
	assertEq(getStarshipInitiativeDisplayTotal(fixture({
		system: { attributes: { init: { mod: 3, bonus: "2" } } }
	})), 5, "mod+bonus");
});

test("bonus string 0 contributes 0 (finite)", () => {
	assertEq(getStarshipInitiativeDisplayTotal(fixture({
		system: { attributes: { init: { mod: 3, bonus: "0" } } }
	})), 3, "bonus 0");
});

test("non-finite bonus contributes nothing", () => {
	assertEq(getStarshipInitiativeDisplayTotal(fixture({
		system: { attributes: { init: { mod: 3, bonus: "nope" } } }
	})), 3, "invalid bonus");
});

test("ability check bonus adds when finite", () => {
	assertEq(getStarshipInitiativeDisplayTotal(fixture({
		system: {
			attributes: { init: { mod: 3, bonus: "", ability: "dex" } },
			abilities: { dex: { bonuses: { check: "1" } } }
		}
	})), 4, "ability check bonus");
});

test("global check bonus adds when finite", () => {
	assertEq(getStarshipInitiativeDisplayTotal(fixture({
		system: {
			attributes: { init: { mod: 3, bonus: "" } },
			bonuses: { abilities: { check: "2" } }
		}
	})), 5, "global check");
});

test("proficiency flat adds when proficient", () => {
	assertEq(getStarshipInitiativeDisplayTotal(fixture({
		system: {
			attributes: {
				init: {
					mod: 3,
					bonus: "",
					prof: { hasProficiency: true, flat: 2 }
				}
			}
		}
	})), 5, "prof");
});

test("proficiency ignored when not proficient", () => {
	assertEq(getStarshipInitiativeDisplayTotal(fixture({
		system: {
			attributes: {
				init: {
					mod: 3,
					bonus: "",
					prof: { hasProficiency: false, flat: 2 }
				}
			}
		}
	})), 3, "not proficient");
});

test("higher mod updates display", () => {
	assertEq(getStarshipInitiativeDisplayTotal(fixture({
		system: { attributes: { init: { mod: 5, bonus: "" } } }
	})), 5, "mod 5");
});

test("formatStarshipInitiativeTotal uses rebuilt sum", () => {
	assertEq(formatStarshipInitiativeTotal(fixture()), "+3", "format");
});

test("missing init → null / format +0", () => {
	assertEq(getStarshipInitiativeDisplayTotal({ system: {} }), null, "null");
	assertEq(formatStarshipInitiativeTotal({ system: {} }), "+0", "format fallback");
});

console.log(`\n${passed} tests passed`);
