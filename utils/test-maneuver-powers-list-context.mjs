/**
 * Offline tests for Bug 25 Maneuver Powers-tab list-row context + column resolution.
 */
import {
	STOCK_SPELLBOOK_COLUMN_MAP_INPUT,
	enrichManeuverListRowContext,
	resolveManeuverSpellbookColumns
} from "../scripts/maneuver-powers-list-context.mjs";

let passed = 0;
let failed = 0;

function assert(condition, message) {
	if ( condition ) {
		passed++;
		return;
	}
	failed++;
	console.error("FAIL:", message);
}

function deepEqual(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

// Minimal game / CONFIG stubs matching dnd5e shape used by enrichment.
globalThis.game = {
	i18n: {
		localize(key) {
			return ({
				"DND5E.ActionAbbr": "A",
				"DND5E.BonusActionAbbr": "B",
				"DND5E.ReactionAbbr": "R"
			})[key] ?? key;
		}
	}
};

globalThis.CONFIG = {
	DND5E: {
		movementUnits: {
			ft: { abbreviation: "ft" },
			m: { abbreviation: "m" }
		}
	}
};

globalThis.dnd5e = {
	utils: {
		formatLength(value, unit, { parts } = {}) {
			if ( parts ) return `<span>${value}</span><span>${unit}</span>`;
			return `${value} ${unit}`;
		}
	}
};

assert(
	STOCK_SPELLBOOK_COLUMN_MAP_INPUT[0] === "school"
	&& STOCK_SPELLBOOK_COLUMN_MAP_INPUT.includes("time")
	&& STOCK_SPELLBOOK_COLUMN_MAP_INPUT.includes("controls")
	&& STOCK_SPELLBOOK_COLUMN_MAP_INPUT.some(c => c?.id === "uses" && c.order === 650 && c.priority === 300)
	&& STOCK_SPELLBOOK_COLUMN_MAP_INPUT.some(c => c?.id === "formula" && c.priority === 200),
	"STOCK_SPELLBOOK_COLUMN_MAP_INPUT matches dnd5e _prepareSpellbook input"
);

const reused = [{ id: "time", template: "x" }];
assert(
	resolveManeuverSpellbookColumns(reused, {}) === reused,
	"resolveManeuverSpellbookColumns reuses non-empty Force/Tech columns"
);

const mapped = [];
globalThis.customElements = {
	get(tag) {
		assert(tag === "dnd5e-inventory" || tag === "custom-inv", `expected inventory tag, got ${tag}`);
		return {
			mapColumns(input) {
				assert(
					deepEqual(input, [...STOCK_SPELLBOOK_COLUMN_MAP_INPUT]),
					"mapColumns receives exact stock spellbook input"
				);
				mapped.push(...input.map(c => (typeof c === "string"
					? { id: c, template: `systems/dnd5e/templates/inventory/columns/${c}.hbs` }
					: { id: c.id, order: c.order, priority: c.priority, template: `t-${c.id}` })));
				return mapped;
			}
		};
	}
};

const fallback = resolveManeuverSpellbookColumns([], { options: { elements: { inventory: "dnd5e-inventory" } } });
assert(Array.isArray(fallback) && fallback.length >= 5, "empty columns fall back via mapColumns");
assert(fallback.some(c => c.id === "time"), "fallback includes time descriptor");
assert(fallback.some(c => c.id === "range"), "fallback includes range descriptor");

const ctxBonus = {};
enrichManeuverListRowContext({
	system: { activation: { type: "bonus", value: 1 }, range: { units: "" } },
	labels: { activation: "1 Bonus Action" }
}, ctxBonus);
assert(ctxBonus.activation === "1B", "bonus activation uses cost+abbr string shape");
assert(ctxBonus.range === undefined, "blank/empty range units leave ctx.range unset");

const ctxFt = {};
enrichManeuverListRowContext({
	system: { activation: { type: "action", value: 1 }, range: { value: 60, units: "ft" } },
	labels: { activation: "1 Action", range: "60 feet" }
}, ctxFt);
assert(ctxFt.activation === "1A", "action activation abbr string");
assert(ctxFt.range?.distance === true, "ft range uses distance:true object");
assert(ctxFt.range?.value === 60 && ctxFt.range?.unit === "ft", "ft range value/unit");
assert(typeof ctxFt.range?.parts === "string" && ctxFt.range.parts.includes("60"), "ft range includes formatLength parts");

const ctxSelf = {};
enrichManeuverListRowContext({
	system: { activation: { type: "reaction", value: 1 }, range: { units: "self" } },
	labels: { activation: "1 Reaction", range: "Self" }
}, ctxSelf);
assert(ctxSelf.activation === "1R", "reaction activation abbr");
assert(deepEqual(ctxSelf.range, { distance: false }), "self range uses { distance: false }");

const ctxFallbackLabel = {};
enrichManeuverListRowContext({
	system: { activation: { type: "special", value: "" }, range: { units: "none" } },
	labels: { activation: "Special" }
}, ctxFallbackLabel);
assert(ctxFallbackLabel.activation === "Special", "unknown activation type uses item.labels.activation");
assert(ctxFallbackLabel.range === undefined, "units none leaves range unset");

console.log(`Bug 25 list context tests: ${passed} passed, ${failed} failed`);
if ( failed ) process.exit(1);
