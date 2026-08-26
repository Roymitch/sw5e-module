/**
 * Embed Force/Tech powers and Superiority maneuvers onto generated Actors.
 */
import crypto from "node:crypto";
import { loadAndCloneCanonicalManeuver, loadAndCloneCanonicalPower } from "./canonical-powers.mjs";
import {
	parseForcecasting,
	parseSuperiorityTrait,
	parseTechcasting
} from "./parse-casting.mjs";
import { resolvePinnedItemIdentity } from "./identity.mjs";

function shortHash(seed) {
	return crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 16);
}

function ensurePowercasting(actor) {
	actor.system.powercasting = actor.system.powercasting || {};
	actor.system.powercasting.force = actor.system.powercasting.force || {
		points: { value: 0, max: null, temp: null, tempmax: null, bonuses: { level: "", overall: "" } },
		schools: {
			lgt: { attr: "wis", dc: null },
			uni: { attr: "", dc: null },
			drk: { attr: "cha", dc: null }
		}
	};
	actor.system.powercasting.tech = actor.system.powercasting.tech || {
		points: { value: 0, max: null, temp: null, tempmax: null, bonuses: { level: "", overall: "" } },
		schools: {
			tec: { attr: "int", dc: null }
		}
	};
	return actor.system.powercasting;
}

function ensureSuperiority(actor) {
	actor.system.superiority = actor.system.superiority || {
		dice: { value: 0, max: null, temp: null, bonuses: { level: "", overall: "" } },
		die: 0,
		types: {
			general: { attr: "", dc: null },
			physical: { attr: "", dc: null },
			mental: { attr: "", dc: null }
		}
	};
	return actor.system.superiority;
}

function applySchoolAbility(powercasting, castType, abilityKey) {
	if ( !abilityKey ) return;
	if ( castType === "force" ) {
		for ( const school of ["lgt", "uni", "drk"] ) {
			powercasting.force.schools[school] = powercasting.force.schools[school] || {};
			powercasting.force.schools[school].attr = abilityKey;
		}
	} else {
		powercasting.tech.schools.tec = powercasting.tech.schools.tec || {};
		powercasting.tech.schools.tec.attr = abilityKey;
	}
}

function resolveEmbeddedId(actorIdentity, itemName, type, semanticKey, nonproduction) {
	if ( actorIdentity ) {
		try {
			return resolvePinnedItemIdentity(actorIdentity, itemName, type).id;
		} catch {
			// fall through to deterministic hash for newly approved pins
		}
	}
	if ( nonproduction ) return shortHash(`sandbox-power:${semanticKey}:${itemName}`);
	return shortHash(`fts-item:${semanticKey}:${itemName}`);
}

function stampPowerFlags(clone, {
	actorId,
	itemId,
	semanticKey,
	castType,
	tier,
	overrides
}) {
	clone._id = itemId;
	clone._key = `!actors.items!${actorId}.${itemId}`;
	clone.folder = null;
	clone.flags = clone.flags || {};
	clone.flags.core = clone.flags.core || {};
	if ( clone.flags.core.sourceId || clone._stats?.compendiumSource ) {
		clone.flags.core.sourceId = clone.flags.core.sourceId
			|| `Compendium.sw5e-module.powers-maneuvers.Item.${clone._stats?.exportSource?.id || clone._id}`;
	}
	const appliedOverrides = [...(overrides || [])];
	clone.flags.sw5e = clone.flags.sw5e || {};
	// Prefer current dnd5e SpellData fields; drop deprecated preparation blob on embed.
	if ( clone.system ) {
		const prep = clone.system.preparation;
		if ( clone.system.method == null && prep?.mode ) {
			clone.system.method = prep.mode === "prepared" || prep.mode === "always"
				? "powerCasting"
				: prep.mode;
		}
		if ( clone.system.prepared == null && typeof prep?.prepared === "boolean" ) {
			clone.system.prepared = prep.prepared;
		}
		if ( Object.prototype.hasOwnProperty.call(clone.system, "preparation") ) {
			delete clone.system.preparation;
			appliedOverrides.push("system.preparation->method/prepared");
		}
		if ( clone.system.method == null ) clone.system.method = "powerCasting";
		if ( clone.system.prepared == null ) clone.system.prepared = true;
	}
	clone.flags.sw5e.snvMonsters = {
		...(clone.flags.sw5e.snvMonsters || {}),
		embeddedFromCanonical: true,
		canonicalCastType: castType,
		canonicalCompendium: "sw5e-module.powers-maneuvers",
		canonicalName: clone.name,
		sourceSemanticKey: semanticKey,
		tierLabel: tier?.label || null,
		tierKind: tier?.kind || null,
		overrides: appliedOverrides
	};
	// Active Effects are packed as sibling LevelDB keys; rewrite to the embedded Item id
	// so clones across Actors do not collide on the canonical Item's effect keys.
	if ( Array.isArray(clone.effects) ) {
		clone.effects = clone.effects.map(effect => {
			const effectId = effect._id || shortHash(`fts-effect:${semanticKey}:${itemId}:${effect.name || "effect"}`);
			return {
				...effect,
				_id: effectId,
				_key: `!actors.items.effects!${actorId}.${itemId}.${effectId}`,
				origin: `Actor.${actorId}.Item.${itemId}`
			};
		});
	}
	return clone;
}

function applyPerDayUses(clone, usesPerDay) {
	if ( !usesPerDay ) return [];
	const overrides = ["system.uses.max", "system.uses.recovery"];
	clone.system = clone.system || {};
	clone.system.uses = clone.system.uses || {};
	clone.system.uses.value = usesPerDay;
	clone.system.uses.max = String(usesPerDay);
	clone.system.uses.recovery = [{ period: "day", type: "recoverAll", formula: undefined }];
	return overrides;
}

/**
 * Embed Force and/or Tech casting resources + canonical power Items.
 */
export function embedForceTechPowers({
	actor,
	body,
	irEntry,
	actorIdentity = null,
	nonproduction = true
}) {
	const exceptions = [];
	const embedded = [];
	const soft = [];
	const powercasting = ensurePowercasting(actor);
	const semanticKey = irEntry.semanticKey;

	for ( const castType of ["force", "tech"] ) {
		const parsed = castType === "force" ? parseForcecasting(body) : parseTechcasting(body);
		if ( !parsed ) continue;

		if ( castType === "force" ) {
			actor.system.details.powerForceLevel = parsed.level ?? actor.system.details.powerForceLevel ?? 0;
			if ( parsed.points != null ) {
				powercasting.force.points.value = parsed.points;
				powercasting.force.points.max = parsed.points;
				// legacy mirror for older sheet paths
				actor.system.attributes.force = actor.system.attributes.force || { points: {} };
				actor.system.attributes.force.points = {
					...(actor.system.attributes.force.points || {}),
					value: parsed.points,
					max: parsed.points
				};
				actor.system.attributes.forcecasting = parsed.abilityKey || actor.system.attributes.forcecasting;
			}
		} else {
			actor.system.details.powerTechLevel = parsed.level ?? actor.system.details.powerTechLevel ?? 0;
			if ( parsed.points != null ) {
				powercasting.tech.points.value = parsed.points;
				powercasting.tech.points.max = parsed.points;
				actor.system.attributes.tech = actor.system.attributes.tech || { points: {} };
				actor.system.attributes.tech.points = {
					...(actor.system.attributes.tech.points || {}),
					value: parsed.points,
					max: parsed.points
				};
				actor.system.attributes.techcasting = parsed.abilityKey || actor.system.attributes.techcasting;
			}
		}
		applySchoolAbility(powercasting, castType, parsed.abilityKey);

		const featName = parsed.mode === "innate" || /innate/i.test(parsed.raw || "")
			? (castType === "force" ? "Innate Forcecasting" : "Innate Techcasting")
			: (castType === "force" ? "Forcecasting" : "Techcasting");
		const featId = resolveEmbeddedId(actorIdentity, featName, "feat", semanticKey, nonproduction);
		const feat = {
			_id: featId,
			_key: `!actors.items!${actor._id}.${featId}`,
			name: featName,
			type: "feat",
			img: castType === "force"
				? "systems/dnd5e/icons/svg/items/feature.svg"
				: "systems/dnd5e/icons/svg/items/feature.svg",
			system: {
				description: { value: `<p>${String(parsed.raw || "").replace(/\n/g, "<br>")}</p>`, chat: "" },
				source: { custom: "SnV" },
				activation: { type: "", cost: null, condition: "" },
				duration: { value: "", units: "" },
				cover: null,
				crewed: false,
				target: { value: "", width: null, units: "", type: "", prompt: true },
				range: { value: null, long: null, units: "" },
				uses: { value: null, max: "", per: null, recovery: "", prompt: true },
				consume: { type: "", target: "", amount: null, scale: false },
				ability: null,
				actionType: "",
				chatFlavor: "",
				critical: { threshold: null, damage: "" },
				damage: { parts: [], versatile: "" },
				formula: "",
				save: { ability: "", dc: null, scaling: "spell" },
				type: { value: "", subtype: "" },
				requirements: "",
				recharge: { value: null, charged: false }
			},
			effects: [],
			folder: null,
			flags: {
				sw5e: {
					snvMonsters: {
						castingTrait: true,
						castType,
						parsedLevel: parsed.level,
						parsedPoints: parsed.points,
						parsedAbility: parsed.abilityKey,
						parsedSaveDc: parsed.saveDc,
						parsedAttackBonus: parsed.attackBonus
					}
				}
			}
		};
		actor.items.push(feat);
		embedded.push({ kind: "casting-feat", name: featName, id: featId, castType });

		const seen = new Set();
		for ( const tier of parsed.tiers || [] ) {
			for ( const powerName of tier.powers || [] ) {
				const dedupe = normalizeDedupe(powerName);
				if ( seen.has(dedupe) ) continue;
				seen.add(dedupe);
				const loaded = loadAndCloneCanonicalPower(powerName, castType);
				if ( !loaded.ok ) {
					exceptions.push({
						type: "canonical-match-missing",
						mechanic: `${castType}-power-missing`,
						powerName,
						castType,
						reason: loaded.resolved.reason
					});
					continue;
				}
				const clone = loaded.clone;
				const originalId = loaded.resolved.canonical.id;
				const itemId = resolveEmbeddedId(actorIdentity, clone.name, "spell", semanticKey, nonproduction);
				const overrides = [];
				if ( tier.kind === "per-day" ) overrides.push(...applyPerDayUses(clone, tier.usesPerDay));
				stampPowerFlags(clone, {
					actorId: actor._id,
					itemId,
					semanticKey,
					castType,
					tier,
					overrides
				});
				clone.flags.core = clone.flags.core || {};
				clone.flags.core.sourceId = `Compendium.sw5e-module.powers-maneuvers.Item.${originalId}`;
				clone._stats = clone._stats || {};
				clone._stats.compendiumSource = `Compendium.sw5e-module.powers-maneuvers.Item.${originalId}`;
				if ( !clone.system?.activities || !Object.keys(clone.system.activities).length ) {
					exceptions.push({
						type: "activities-missing",
						mechanic: `${castType}-power-activities-missing`,
						powerName: clone.name,
						castType
					});
				}
				actor.items.push(clone);
				embedded.push({
					kind: "power",
					name: clone.name,
					id: itemId,
					castType,
					canonicalId: originalId,
					activityCount: Object.keys(clone.system?.activities || {}).length,
					consumeTarget: clone.system?.consume?.target || null
				});
			}
		}
	}

	return { exceptions, embedded, soft };
}

function normalizeDedupe(name) {
	return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function embedSuperiorityManeuvers({
	actor,
	body,
	irEntry,
	actorIdentity = null,
	nonproduction = true
}) {
	const exceptions = [];
	const embedded = [];
	const parsed = parseSuperiorityTrait(body);
	if ( !parsed ) return { exceptions, embedded, parsed: null };

	const superiority = ensureSuperiority(actor);
	if ( parsed.dice != null ) {
		superiority.dice.value = parsed.dice;
		superiority.dice.max = parsed.dice;
	}
	if ( parsed.die ) {
		const dieNum = Number(String(parsed.die).replace(/^d/i, ""));
		superiority.die = Number.isFinite(dieNum) ? dieNum : superiority.die;
	}
	actor.system.details.superiorityLevel = actor.system.details.superiorityLevel || parsed.dice || 0;
	if ( parsed.abilityKey ) {
		for ( const key of ["general", "physical", "mental"] ) {
			superiority.types[key] = superiority.types[key] || {};
			superiority.types[key].attr = parsed.abilityKey;
		}
	}

	for ( const maneuverName of parsed.maneuvers || [] ) {
		const loaded = loadAndCloneCanonicalManeuver(maneuverName);
		if ( !loaded.ok ) {
			exceptions.push({
				type: "canonical-match-missing",
				mechanic: "maneuver-missing",
				maneuverName,
				reason: loaded.resolved.reason
			});
			continue;
		}
		const clone = loaded.clone;
		const originalId = loaded.resolved.canonical.id;
		const itemId = resolveEmbeddedId(actorIdentity, clone.name, clone.type, irEntry.semanticKey, nonproduction);
		clone._id = itemId;
		clone._key = `!actors.items!${actor._id}.${itemId}`;
		clone.folder = null;
		clone.flags = clone.flags || {};
		clone.flags.core = { ...(clone.flags.core || {}), sourceId: `Compendium.sw5e-module.powers-maneuvers.Item.${originalId}` };
		clone.flags.sw5e = clone.flags.sw5e || {};
		clone.flags.sw5e.snvMonsters = {
			embeddedFromCanonical: true,
			canonicalCompendium: "sw5e-module.powers-maneuvers",
			canonicalName: clone.name,
			sourceSemanticKey: irEntry.semanticKey
		};
		if ( !Object.keys(clone.system?.activities || {}).length ) {
			exceptions.push({
				type: "activities-missing",
				mechanic: "maneuver-activities-missing",
				maneuverName: clone.name
			});
		}
		actor.items.push(clone);
		embedded.push({ kind: "maneuver", name: clone.name, id: itemId, canonicalId: originalId });
	}

	return { exceptions, embedded, parsed };
}
