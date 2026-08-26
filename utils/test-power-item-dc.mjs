/**
 * Offline tests for Bug 21 B1 Force/Tech getPreparedPowerDc / resolvePowerItemDc.
 */
import assert from "node:assert/strict";

globalThis.foundry = {
	data: { fields: { SchemaField: class SchemaField {} } },
	utils: {
		getProperty: (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj),
		mergeObject: (a, b) => ({ ...a, ...b })
	}
};
globalThis.dnd5e = {
	utils: {
		simplifyBonus: (value) => {
			const n = Number(value);
			return Number.isFinite(n) ? n : 0;
		}
	}
};
globalThis.CONFIG = {
	DND5E: {
		powerCasting: {
			force: {
				schools: {
					lgt: { attr: ["wis", "cha"] },
					drk: { attr: ["cha"] },
					uni: { attr: ["wis", "cha"] }
				}
			},
			tech: {
				schools: {
					tec: { attr: ["int"] }
				}
			}
		},
		abilities: {
			str: { label: "Strength" },
			dex: { label: "Dexterity" },
			con: { label: "Constitution" },
			int: { label: "Intelligence" },
			wis: { label: "Wisdom" },
			cha: { label: "Charisma" }
		}
	}
};
globalThis.game = { settings: { get: () => false } };

const {
	getPreparedPowerDc,
	resolvePowerItemDc,
	getPowerDcBonus
} = await import("../scripts/patch/power-bonuses.mjs");
const { resolveSchoolPowerDc } = await import("../scripts/powercasting-overrides.mjs");

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function makeActor({ forceDc = null, techDc = null, prof = 2, bonuses = {}, sourceForceDc, sourceTechDc } = {}) {
	return {
		system: {
			attributes: { prof },
			abilities: {
				str: { mod: 1 },
				dex: { mod: 2 },
				con: { mod: 1 },
				int: { mod: 4 },
				wis: { mod: 5 },
				cha: { mod: 2 }
			},
			powercasting: {
				force: {
					schools: {
						lgt: { attr: "wis", dc: forceDc?.lgt ?? null },
						drk: { attr: "cha", dc: forceDc?.drk ?? null },
						uni: { attr: "wis", dc: forceDc?.uni ?? null }
					}
				},
				tech: {
					schools: {
						tec: { attr: "int", dc: techDc ?? null }
					}
				}
			},
			bonuses
		},
		_source: {
			system: {
				powercasting: {
					force: {
						schools: {
							lgt: { attr: null, dc: sourceForceDc?.lgt ?? null },
							drk: { attr: null, dc: sourceForceDc?.drk ?? null },
							uni: { attr: null, dc: sourceForceDc?.uni ?? null }
						}
					},
					tech: {
						schools: {
							tec: { attr: null, dc: sourceTechDc ?? null }
						}
					}
				}
			}
		},
		flags: { sw5e: {} }
	};
}

function makeItem({ school, ability = null, method = "powerCasting" } = {}) {
	return {
		type: "spell",
		system: { school, ability, method }
	};
}

check("Force null school DC is absent from getPreparedPowerDc", () => {
	const actor = makeActor({ forceDc: { uni: null } });
	const item = makeItem({ school: "uni" });
	assert.equal(getPreparedPowerDc(actor, item), null);
});

check("Force undefined/missing school DC is absent", () => {
	const actor = makeActor();
	delete actor.system.powercasting.force.schools.uni.dc;
	const item = makeItem({ school: "uni" });
	assert.equal(getPreparedPowerDc(actor, item), null);
});

check("Force empty/whitespace school DC is absent", () => {
	const actor = makeActor({ forceDc: { uni: "" } });
	assert.equal(getPreparedPowerDc(actor, makeItem({ school: "uni" })), null);
	actor.system.powercasting.force.schools.uni.dc = "  ";
	assert.equal(getPreparedPowerDc(actor, makeItem({ school: "uni" })), null);
});

check("Force prepared finite school DC is used", () => {
	const actor = makeActor({ forceDc: { uni: 15, drk: 12 } });
	assert.equal(getPreparedPowerDc(actor, makeItem({ school: "uni" })), 15);
	assert.equal(getPreparedPowerDc(actor, makeItem({ school: "drk" })), 12);
});

check("Force explicit prepared zero is preserved", () => {
	const actor = makeActor({ forceDc: { drk: 0 } });
	assert.equal(getPreparedPowerDc(actor, makeItem({ school: "drk" })), 0);
});

check("Force absent prepared DC falls back to resolveSchoolPowerDc formula", () => {
	const actor = makeActor({ forceDc: { uni: null }, prof: 2 });
	const item = makeItem({ school: "uni" });
	// uni highest of lgt(wis5)/drk(cha2) => wis 5; 8+2+5=15
	assert.equal(resolvePowerItemDc(actor, item, {}), 15);
});

check("Tech absent prepared DC falls back to INT formula", () => {
	const actor = makeActor({ techDc: null, prof: 1 });
	const item = makeItem({ school: "tec" });
	// 8+1+4=13
	assert.equal(resolvePowerItemDc(actor, item, {}), 13);
});

check("Tech prepared finite school DC is used", () => {
	const actor = makeActor({ techDc: 14 });
	assert.equal(resolvePowerItemDc(actor, makeItem({ school: "tec" }), {}), 14);
});

check("Force item ability override uses ability path", () => {
	const actor = makeActor({ forceDc: { uni: 15 }, prof: 2 });
	const item = makeItem({ school: "uni", ability: "cha" });
	// 8+2+2=12
	assert.equal(resolvePowerItemDc(actor, item, {}), 12);
});

check("Force DC bonus is included in fallback calculation", () => {
	const actor = makeActor({
		forceDc: { uni: null },
		prof: 2,
		bonuses: { force: { dc: 1 } }
	});
	assert.equal(getPowerDcBonus(actor, "force", "uni", "wis", {}), 1);
	assert.equal(resolvePowerItemDc(actor, makeItem({ school: "uni" }), {}), 16);
});

check("resolveSchoolPowerDc preserves explicit source zero", () => {
	const actor = makeActor({ sourceForceDc: { uni: 0 }, prof: 2 });
	assert.equal(resolveSchoolPowerDc(actor, "force", "uni", 10, {}), 0);
});

check("resolveSchoolPowerDc ignores absent source and calculates", () => {
	const actor = makeActor({ sourceForceDc: { uni: null }, prof: 2 });
	assert.equal(resolveSchoolPowerDc(actor, "force", "uni", 10, {}), 15);
});

console.log(`\n${passed} tests passed`);
