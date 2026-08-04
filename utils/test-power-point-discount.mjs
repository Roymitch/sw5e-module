/**
 * Offline tests for Force/Tech Point Discount helpers and consumption wrapper contracts.
 */
import assert from "node:assert/strict";
import {
	POWER_POINT_DISCOUNT_APPLIED,
	classifyPowercastingType,
	getActorPowerPointDiscount,
	getActorPowerPointDiscountSource,
	normalizePowerPointDiscount,
	resolvePowerPointCost,
	resolveSelectedCastLevelFromUsage
} from "../scripts/power-point-cost.mjs";
import {
	getPendingOrCurrentAttributeValue,
	getStockAttributeConsumeForTests,
	installPowerPointDiscountAttributeConsume,
	isPowerPointDiscountAttributeConsumeInstalled,
	resetPowerPointDiscountAttributeConsumeForTests,
	resolvePowerPointConsumptionDisplay
} from "../scripts/power-point-discount-consume.mjs";

function stockConsumptionLabels() {
	return { label: "stock-label", hint: "stock-hint-raw", warn: true };
}

globalThis.CONFIG = {
	DND5E: {
		powerCasting: {
			force: {
				schools: {
					lgt: {},
					drk: {},
					uni: {}
				}
			},
			tech: {
				schools: {
					tec: {}
				}
			}
		},
		activityConsumptionTypes: {
			attribute: {
				consume: async function stockConsume() {
					stockConsume.calls += 1;
					return "stock";
				},
				consumptionLabels: stockConsumptionLabels
			}
		}
	}
};
globalThis.CONFIG.DND5E.activityConsumptionTypes.attribute.consume.calls = 0;

globalThis.foundry = {
	utils: {
		getProperty: (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj)
	}
};

globalThis.dnd5e = {
	utils: {
		formatNumber: value => String(value),
		getHumanReadableAttributeLabel: attr => attr
	},
	dataModels: {
		activity: {
			ConsumptionError: class ConsumptionError extends Error {
				constructor(...args) {
					super(...args);
					this.name = "ConsumptionError";
				}
			}
		}
	}
};

globalThis.game = {
	i18n: {
		localize: key => key,
		format: (key, data) => `${key}:${JSON.stringify(data)}`
	}
};

function resetAttributeTypeFixtures() {
	resetPowerPointDiscountAttributeConsumeForTests();
	CONFIG.DND5E.activityConsumptionTypes.attribute.consume = async function stock() {
		stock.calls = (stock.calls ?? 0) + 1;
		return "stock";
	};
	CONFIG.DND5E.activityConsumptionTypes.attribute.consumptionLabels = stockConsumptionLabels;
}

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function forcePower({ level=1, base=2, school="uni" }={}) {
	return {
		type: "spell",
		system: {
			level,
			school,
			method: "powerCasting",
			consume: {
				type: "attribute",
				target: "powercasting.force.points.value",
				amount: base
			},
			activities: {
				a1: {
					consumption: {
						targets: [{
							type: "attribute",
							target: "powercasting.force.points.value",
							value: String(base),
							scaling: { mode: "amount", formula: "" }
						}]
					}
				}
			}
		}
	};
}

function techPower({ level=2, base=3 }={}) {
	return {
		type: "spell",
		system: {
			level,
			school: "tec",
			method: "powerCasting",
			consume: {
				type: "attribute",
				target: "powercasting.tech.points.value",
				amount: base
			},
			activities: {
				a1: {
					consumption: {
						targets: [{
							type: "attribute",
							target: "powercasting.tech.points.value",
							value: String(base),
							scaling: { mode: "amount", formula: "" }
						}]
					}
				}
			}
		}
	};
}

function activityFor(item) {
	return Object.values(item.system.activities)[0];
}

function actorWithDiscounts({ force=0, tech=0, forcePoints=10, techPoints=10 }={}) {
	return {
		flags: {
			sw5e: {
				forcePowerDiscount: force,
				techPowerDiscount: tech
			}
		},
		_source: {
			flags: {
				sw5e: {
					forcePowerDiscount: force,
					techPowerDiscount: tech
				}
			}
		},
		system: {
			powercasting: {
				force: { points: { value: forcePoints } },
				tech: { points: { value: techPoints } }
			}
		}
	};
}

// ——— Normalization ———

check("missing and invalid discounts normalize to 0", () => {
	assert.equal(normalizePowerPointDiscount(undefined), 0);
	assert.equal(normalizePowerPointDiscount(null), 0);
	assert.equal(normalizePowerPointDiscount(""), 0);
	assert.equal(normalizePowerPointDiscount("   "), 0);
	assert.equal(normalizePowerPointDiscount(NaN), 0);
	assert.equal(normalizePowerPointDiscount(Infinity), 0);
	assert.equal(normalizePowerPointDiscount(-1), 0);
	assert.equal(normalizePowerPointDiscount("nope"), 0);
	assert.equal(normalizePowerPointDiscount({}), 0);
});

check("exact non-negative integers are preserved", () => {
	assert.equal(normalizePowerPointDiscount(0), 0);
	assert.equal(normalizePowerPointDiscount(2), 2);
	assert.equal(normalizePowerPointDiscount("2"), 2);
	assert.equal(normalizePowerPointDiscount(2.0), 2);
	assert.equal(normalizePowerPointDiscount("2.0"), 2);
});

check("fractional numbers and strings normalize to 0", () => {
	assert.equal(normalizePowerPointDiscount(2.7), 0);
	assert.equal(normalizePowerPointDiscount("2.7"), 0);
});

check("valid zero is not replaced", () => {
	assert.equal(normalizePowerPointDiscount(0), 0);
	assert.equal(getActorPowerPointDiscount({ flags: { sw5e: { forcePowerDiscount: 0 } } }, "force"), 0);
});

// ——— Classification ———

check("force power classifies as force", () => {
	const item = forcePower();
	assert.equal(classifyPowercastingType(item, activityFor(item)), "force");
});

check("tech power classifies as tech", () => {
	const item = techPower();
	assert.equal(classifyPowercastingType(item, activityFor(item)), "tech");
});

check("unknown item with no recognized target returns null", () => {
	assert.equal(classifyPowercastingType({ type: "loot", system: {} }), null);
});

check("ordinary spell remains null", () => {
	assert.equal(classifyPowercastingType({
		type: "spell",
		system: { school: "abj", method: "spell", level: 1 }
	}), null);
});

check("maneuver remains null", () => {
	assert.equal(classifyPowercastingType({
		type: "maneuver",
		system: { school: "tec" }
	}), null);
});

check("ordinary item with misleading field remains null", () => {
	assert.equal(classifyPowercastingType({
		type: "feat",
		system: { forcePowerDiscount: 5, school: "force" }
	}), null);
});

check("metadata and consume target disagreement returns null", () => {
	const item = {
		type: "spell",
		system: {
			school: "uni",
			method: "powerCasting",
			level: 1,
			consume: {
				type: "attribute",
				target: "powercasting.tech.points.value",
				amount: 2
			},
			activities: {
				a1: {
					consumption: {
						targets: [{
							type: "attribute",
							target: "powercasting.tech.points.value",
							value: "2"
						}]
					}
				}
			}
		}
	};
	assert.equal(classifyPowercastingType(item, activityFor(item)), null);
});

check("legacy spell with exact FP target and no school metadata classifies force", () => {
	const item = {
		type: "spell",
		system: {
			method: "powerCasting",
			level: 1,
			consume: {
				type: "attribute",
				target: "powercasting.force.points.value",
				amount: 2
			}
		}
	};
	assert.equal(classifyPowercastingType(item), "force");
});

// ——— Cost calculation ———

check("base cost 1 discount 0 normal cast", () => {
	const item = forcePower({ base: 1, level: 1 });
	const actor = actorWithDiscounts({ force: 0 });
	const resolved = resolvePowerPointCost({
		actor,
		item,
		activity: activityFor(item),
		castLevel: 1
	});
	assert.equal(resolved.rawCost, 1);
	assert.equal(resolved.finalCost, 1);
	assert.equal(resolved.discount, 0);
});

check("base cost 1 discount 1 final cost 0", () => {
	const item = forcePower({ base: 1, level: 1 });
	const actor = actorWithDiscounts({ force: 1 });
	const resolved = resolvePowerPointCost({
		actor,
		item,
		activity: activityFor(item),
		castLevel: 1
	});
	assert.equal(resolved.finalCost, 0);
});

check("base cost 1 discount greater than cost final cost 0", () => {
	const item = forcePower({ base: 1, level: 1 });
	const actor = actorWithDiscounts({ force: 3 });
	const resolved = resolvePowerPointCost({
		actor,
		item,
		activity: activityFor(item),
		castLevel: 1
	});
	assert.equal(resolved.rawCost, 1);
	assert.equal(resolved.finalCost, 0);
});

check("upcast by two levels then discount once", () => {
	const item = forcePower({ base: 2, level: 1 });
	const actor = actorWithDiscounts({ force: 1 });
	const resolved = resolvePowerPointCost({
		actor,
		item,
		activity: activityFor(item),
		castLevel: 3
	});
	assert.equal(resolved.baseCost, 2);
	assert.equal(resolved.scalingCost, 2);
	assert.equal(resolved.rawCost, 4);
	assert.equal(resolved.discount, 1);
	assert.equal(resolved.finalCost, 3);
});

check("upcast cost is not charged twice by resolver", () => {
	const item = forcePower({ base: 2, level: 1 });
	const actor = actorWithDiscounts({ force: 0 });
	const resolved = resolvePowerPointCost({
		actor,
		item,
		activity: activityFor(item),
		castLevel: 3
	});
	assert.equal(resolved.rawCost, 4);
	assert.equal(resolved.scalingCost, 2);
});

check("force discount does not affect tech", () => {
	const item = techPower({ base: 3, level: 2 });
	const actor = actorWithDiscounts({ force: 9, tech: 0 });
	const resolved = resolvePowerPointCost({
		actor,
		item,
		activity: activityFor(item),
		castLevel: 2
	});
	assert.equal(resolved.powercastingType, "tech");
	assert.equal(resolved.discount, 0);
	assert.equal(resolved.finalCost, 3);
});

check("tech discount does not affect force", () => {
	const item = forcePower({ base: 2, level: 1 });
	const actor = actorWithDiscounts({ force: 0, tech: 9 });
	const resolved = resolvePowerPointCost({
		actor,
		item,
		activity: activityFor(item),
		castLevel: 1
	});
	assert.equal(resolved.powercastingType, "force");
	assert.equal(resolved.discount, 0);
	assert.equal(resolved.finalCost, 2);
});

check("at-will raw cost 0 remains 0 with discount", () => {
	const item = forcePower({ base: 0, level: 0 });
	const actor = actorWithDiscounts({ force: 2 });
	const resolved = resolvePowerPointCost({
		actor,
		item,
		activity: activityFor(item),
		castLevel: 0
	});
	assert.equal(resolved.rawCost, 0);
	assert.equal(resolved.finalCost, 0);
});

check("missing actor discount behaves as 0", () => {
	const item = forcePower({ base: 2, level: 1 });
	const resolved = resolvePowerPointCost({
		actor: null,
		item,
		activity: activityFor(item),
		castLevel: 1
	});
	assert.equal(resolved.discount, 0);
	assert.equal(resolved.finalCost, 2);
});

check("repeated resolution is pure and identical", () => {
	const item = forcePower({ base: 5, level: 1 });
	const activity = activityFor(item);
	const actor = actorWithDiscounts({ force: 1 });
	const a = resolvePowerPointCost({ actor, item, activity, castLevel: 1 });
	const b = resolvePowerPointCost({ actor, item, activity, castLevel: 1 });
	const c = resolvePowerPointCost({ actor, item, activity, castLevel: 1 });
	assert.deepEqual(a, b);
	assert.deepEqual(b, c);
	assert.equal(a.finalCost, 4);
	assert.equal(item.system.consume.amount, 5);
	assert.equal(activity.consumption.targets[0].value, "5");
});

check("usageConfig.scaling only supports selectedLevel derivation", () => {
	const item = forcePower({ base: 2, level: 1 });
	assert.equal(resolveSelectedCastLevelFromUsage(item, { scaling: 2 }), 3);
	assert.equal(resolveSelectedCastLevelFromUsage(item, { spell: { slot: 4 }, scaling: 99 }), 4);
});

check("affordability contract: cost 5 points 4 discount 1 becomes available", () => {
	const item = forcePower({ base: 5, level: 1 });
	const actor = actorWithDiscounts({ force: 1, forcePoints: 4 });
	const resolved = resolvePowerPointCost({
		actor,
		item,
		activity: activityFor(item),
		castLevel: 1
	});
	assert.equal(resolved.finalCost, 4);
	assert.equal(resolved.finalCost <= actor.system.powercasting.force.points.value, true);
});

// ——— Pending update aggregation ———

check("existing pending resource update is respected", () => {
	const actor = { system: { powercasting: { force: { points: { value: 10 } } } } };
	const updates = { actor: { "system.powercasting.force.points.value": 7 } };
	assert.equal(
		getPendingOrCurrentAttributeValue(actor, updates, "system.powercasting.force.points.value"),
		7
	);
	assert.equal(
		getPendingOrCurrentAttributeValue(actor, { actor: {} }, "system.powercasting.force.points.value"),
		10
	);
});

// ——— Active Effect source vs prepared ———

check("config source discount ignores prepared overlay", () => {
	const actor = {
		flags: { sw5e: { forcePowerDiscount: 3 } },
		_source: { flags: { sw5e: { forcePowerDiscount: 1 } } }
	};
	assert.equal(getActorPowerPointDiscount(actor, "force"), 3);
	assert.equal(getActorPowerPointDiscountSource(actor, "force"), 1);
});

// ——— Wrapper install / consume contracts ———

check("wrapper installation is idempotent", () => {
	resetAttributeTypeFixtures();
	const first = installPowerPointDiscountAttributeConsume();
	const wrappedConsume = CONFIG.DND5E.activityConsumptionTypes.attribute.consume;
	const wrappedLabels = CONFIG.DND5E.activityConsumptionTypes.attribute.consumptionLabels;
	const second = installPowerPointDiscountAttributeConsume();
	assert.equal(first, true);
	assert.equal(second, true);
	assert.equal(CONFIG.DND5E.activityConsumptionTypes.attribute.consume, wrappedConsume);
	assert.equal(CONFIG.DND5E.activityConsumptionTypes.attribute.consumptionLabels, wrappedLabels);
	assert.equal(isPowerPointDiscountAttributeConsumeInstalled(), true);
	assert.ok(getStockAttributeConsumeForTests());
});

check("non-FP/TP attribute targets delegate to the exact stock consumer", async () => {
	resetAttributeTypeFixtures();
	let stockCalls = 0;
	CONFIG.DND5E.activityConsumptionTypes.attribute.consume = async function stock() {
		stockCalls += 1;
		return "stock-hit";
	};
	CONFIG.DND5E.activityConsumptionTypes.attribute.consumptionLabels = stockConsumptionLabels;
	installPowerPointDiscountAttributeConsume();
	const consume = CONFIG.DND5E.activityConsumptionTypes.attribute.consume;
	const result = await consume.call(
		{ target: "attributes.hp.value", item: forcePower(), activity: null, actor: actorWithDiscounts() },
		{},
		{ actor: {} }
	);
	assert.equal(result, "stock-hit");
	assert.equal(stockCalls, 1);
});

check("discounted consume applies finalCost once and marks usage", async () => {
	resetAttributeTypeFixtures();
	CONFIG.DND5E.activityConsumptionTypes.attribute.consume = async function stock() {
		throw new Error("stock should not run for classified FP target");
	};
	installPowerPointDiscountAttributeConsume();
	const item = forcePower({ base: 5, level: 1 });
	const activity = activityFor(item);
	const actor = actorWithDiscounts({ force: 1, forcePoints: 10 });
	const config = { spell: { slot: 1 } };
	const updates = { actor: {} };
	const consume = CONFIG.DND5E.activityConsumptionTypes.attribute.consume;
	await consume.call(
		{
			target: "powercasting.force.points.value",
			item,
			activity,
			actor
		},
		config,
		updates
	);
	assert.equal(updates.actor["system.powercasting.force.points.value"], 6);
	assert.equal(config[POWER_POINT_DISCOUNT_APPLIED], true);
	assert.equal(item.system.consume.amount, 5);
	assert.equal(activity.consumption.targets[0].value, "5");
});

check("second consume on same usage does not apply again", async () => {
	resetAttributeTypeFixtures();
	CONFIG.DND5E.activityConsumptionTypes.attribute.consume = async function stock() {
		throw new Error("stock should not run");
	};
	installPowerPointDiscountAttributeConsume();
	const item = forcePower({ base: 5, level: 1 });
	const activity = activityFor(item);
	const actor = actorWithDiscounts({ force: 1, forcePoints: 10 });
	const config = { spell: { slot: 1 } };
	const updates = { actor: {} };
	const consume = CONFIG.DND5E.activityConsumptionTypes.attribute.consume;
	const ctx = { target: "powercasting.force.points.value", item, activity, actor };
	await consume.call(ctx, config, updates);
	await consume.call(ctx, config, updates);
	assert.equal(updates.actor["system.powercasting.force.points.value"], 6);
});

check("classified mismatch delegates to stock", async () => {
	resetAttributeTypeFixtures();
	let stockCalls = 0;
	CONFIG.DND5E.activityConsumptionTypes.attribute.consume = async function stock() {
		stockCalls += 1;
		return "delegated";
	};
	installPowerPointDiscountAttributeConsume();
	const item = forcePower();
	const consume = CONFIG.DND5E.activityConsumptionTypes.attribute.consume;
	const result = await consume.call(
		{
			target: "powercasting.tech.points.value",
			item,
			activity: activityFor(item),
			actor: actorWithDiscounts()
		},
		{},
		{ actor: {} }
	);
	assert.equal(result, "delegated");
	assert.equal(stockCalls, 1);
});

check("item and activity snapshots unchanged after mocked success path", async () => {
	resetAttributeTypeFixtures();
	CONFIG.DND5E.activityConsumptionTypes.attribute.consume = async function stock() {};
	installPowerPointDiscountAttributeConsume();
	const item = forcePower({ base: 5, level: 1 });
	const activity = activityFor(item);
	const beforeItem = structuredClone(item);
	const beforeActivity = structuredClone(activity);
	const actor = actorWithDiscounts({ force: 1, forcePoints: 10 });
	const config = { spell: { slot: 1 } };
	const updates = { actor: {} };
	await CONFIG.DND5E.activityConsumptionTypes.attribute.consume.call(
		{ target: "powercasting.force.points.value", item, activity, actor },
		config,
		updates
	);
	assert.deepEqual(item, beforeItem);
	assert.deepEqual(activity, beforeActivity);
});

// ——— Dialog Consumption display (Foundry Gates B/C/D/F remediation) ———

check("prepared Force Consumption display uses finalCost", () => {
	const item = forcePower({ base: 4, level: 1 });
	const actor = actorWithDiscounts({ force: 1, forcePoints: 15 });
	const display = resolvePowerPointConsumptionDisplay({
		actor,
		item,
		activity: activityFor(item),
		target: "powercasting.force.points.value",
		config: { spell: { slot: 1 } }
	});
	assert.equal(display.applies, true);
	assert.equal(display.rawCost, 4);
	assert.equal(display.finalCost, 3);
	assert.equal(display.cost, "3");
	assert.equal(display.warn, false);
});

check("prepared Tech Consumption display uses finalCost", () => {
	const item = techPower({ base: 4, level: 2 });
	const actor = actorWithDiscounts({ tech: 2, techPoints: 12 });
	const display = resolvePowerPointConsumptionDisplay({
		actor,
		item,
		activity: activityFor(item),
		target: "powercasting.tech.points.value",
		config: { spell: { slot: 2 } }
	});
	assert.equal(display.finalCost, 2);
	assert.equal(display.cost, "2");
	assert.equal(display.warn, false);
});

check("discount-enabled affordability has no false warning", () => {
	const item = techPower({ base: 5, level: 2 });
	const actor = actorWithDiscounts({ tech: 2, techPoints: 4 });
	const display = resolvePowerPointConsumptionDisplay({
		actor,
		item,
		activity: activityFor(item),
		target: "powercasting.tech.points.value",
		config: { spell: { slot: 2 } }
	});
	assert.equal(display.rawCost, 5);
	assert.equal(display.finalCost, 3);
	assert.equal(display.warn, false);
});

check("finalCost 0 has no false warning", () => {
	const item = forcePower({ base: 1, level: 1 });
	const actor = actorWithDiscounts({ force: 1, forcePoints: 0 });
	const display = resolvePowerPointConsumptionDisplay({
		actor,
		item,
		activity: activityFor(item),
		target: "powercasting.force.points.value",
		config: { spell: { slot: 1 } }
	});
	assert.equal(display.finalCost, 0);
	assert.equal(display.warn, false);
});

check("finalCost greater than available points remains warned", () => {
	const item = forcePower({ base: 5, level: 1 });
	const actor = actorWithDiscounts({ force: 0, forcePoints: 3 });
	const display = resolvePowerPointConsumptionDisplay({
		actor,
		item,
		activity: activityFor(item),
		target: "powercasting.force.points.value",
		config: { spell: { slot: 1 } }
	});
	assert.equal(display.finalCost, 5);
	assert.equal(display.warn, true);
});

check("discount 0 matches existing raw behavior", () => {
	const item = forcePower({ base: 4, level: 1 });
	const actor = actorWithDiscounts({ force: 0, forcePoints: 15 });
	const display = resolvePowerPointConsumptionDisplay({
		actor,
		item,
		activity: activityFor(item),
		target: "powercasting.force.points.value",
		config: { spell: { slot: 1 } }
	});
	assert.equal(display.finalCost, display.rawCost);
	assert.equal(display.cost, "4");
	assert.equal(display.warn, false);
});

check("upcast display includes scaling once and discount once", () => {
	const item = forcePower({ base: 2, level: 1 });
	const actor = actorWithDiscounts({ force: 1, forcePoints: 20 });
	const display = resolvePowerPointConsumptionDisplay({
		actor,
		item,
		activity: activityFor(item),
		target: "powercasting.force.points.value",
		config: { spell: { slot: 3 } }
	});
	assert.equal(display.rawCost, 4);
	assert.equal(display.finalCost, 3);
	assert.equal(display.cost, "3");
});

check("consumptionLabels wrapper uses finalCost and leaves sources unchanged", () => {
	resetAttributeTypeFixtures();
	installPowerPointDiscountAttributeConsume();
	const item = forcePower({ base: 4, level: 1 });
	const activity = activityFor(item);
	const beforeItem = structuredClone(item);
	const beforeActivity = structuredClone(activity);
	const actor = actorWithDiscounts({ force: 1, forcePoints: 15 });
	const labels = CONFIG.DND5E.activityConsumptionTypes.attribute.consumptionLabels.call(
		{
			target: "powercasting.force.points.value",
			item,
			activity,
			actor
		},
		{ spell: { slot: 1 } },
		true
	);
	assert.match(labels.hint, /"cost":"3"/);
	assert.equal(labels.warn, false);
	assert.deepEqual(item, beforeItem);
	assert.deepEqual(activity, beforeActivity);
});

check("ordinary attribute consumptionLabels remain stock", () => {
	resetAttributeTypeFixtures();
	installPowerPointDiscountAttributeConsume();
	const labels = CONFIG.DND5E.activityConsumptionTypes.attribute.consumptionLabels.call(
		{ target: "attributes.hp.value", item: forcePower(), activity: null, actor: actorWithDiscounts() },
		{},
		true
	);
	assert.equal(labels.hint, "stock-hint-raw");
	assert.equal(labels.warn, true);
});

check("repeated dialog display preparation does not compound", () => {
	const item = forcePower({ base: 4, level: 1 });
	const activity = activityFor(item);
	const actor = actorWithDiscounts({ force: 1, forcePoints: 15 });
	const args = {
		actor,
		item,
		activity,
		target: "powercasting.force.points.value",
		config: { spell: { slot: 1 } }
	};
	const a = resolvePowerPointConsumptionDisplay(args);
	const b = resolvePowerPointConsumptionDisplay(args);
	const c = resolvePowerPointConsumptionDisplay(args);
	assert.deepEqual(a, b);
	assert.deepEqual(b, c);
	assert.equal(a.finalCost, 3);
});

console.log(`\n${passed} tests passed`);
