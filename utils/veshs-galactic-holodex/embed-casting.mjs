import crypto from "node:crypto";
import { loadAndCloneCanonicalManeuver, loadAndCloneCanonicalPower } from "./canonical-powers.mjs";
import {
	parseForcecasting,
	parseSuperiorityTrait,
	parseTechcasting
} from "./parse-casting.mjs";
import { resolvePinnedItemIdentity } from "./identity.mjs";
import { SOURCE_VISIBLE } from "./paths.mjs";
import { VGH_PROVENANCE_FLAG } from "./source-provenance.mjs";

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
	if (!abilityKey) return;
	if (castType === "force") {
		for (const school of ["lgt", "uni", "drk"]) {
			powercasting.force.schools[school] = powercasting.force.schools[school] || {};
			powercasting.force.schools[school].attr = abilityKey;
		}
	} else {
		powercasting.tech.schools.tec = powercasting.tech.schools.tec || {};
		powercasting.tech.schools.tec.attr = abilityKey;
	}
}

function resolveEmbeddedId(actorIdentity, itemName, type, semanticKey, nonproduction) {
	if (actorIdentity) {
		try {
			return resolvePinnedItemIdentity(actorIdentity, itemName, type).id;
		} catch {
			// Fall back to deterministic hashing for items not pinned in the identity map.
		}
	}
	return shortHash(`${nonproduction ? "vgh-sandbox" : "vgh-prod"}:${semanticKey}:${type}:${itemName}`);
}

function stampCanonicalItem(clone, { actorId, itemId, semanticKey, family, castType = null, tier = null }) {
	const canonicalName = clone.name;
	clone._id = itemId;
	clone._key = `!actors.items!${actorId}.${itemId}`;
	clone.folder = null;
	clone.flags = clone.flags || {};
	clone.flags.sw5e = clone.flags.sw5e || {};
	clone.flags.sw5e[VGH_PROVENANCE_FLAG] = {
		...(clone.flags.sw5e[VGH_PROVENANCE_FLAG] || {}),
		embeddedFromCanonical: true,
		family,
		canonicalName,
		castType,
		sourceSemanticKey: semanticKey,
		tierLabel: tier?.label || null,
		tierKind: tier?.kind || null
	};
	if (Array.isArray(clone.effects)) {
		clone.effects = clone.effects.map(effect => {
			const effectId = effect._id || shortHash(`vgh-effect:${semanticKey}:${itemId}:${effect.name || "effect"}`);
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
	if (!usesPerDay) return;
	clone.system = clone.system || {};
	clone.system.uses = clone.system.uses || {};
	clone.system.uses.value = usesPerDay;
	clone.system.uses.max = String(usesPerDay);
	clone.system.uses.recovery = [{ period: "day", type: "recoverAll", formula: "" }];
}

export function embedForceTechPowers({
	actor,
	body,
	irEntry,
	actorIdentity = null,
	nonproduction = true
}) {
	const exceptions = [];
	const embedded = [];
	const powercasting = ensurePowercasting(actor);
	const semanticKey = irEntry.semanticKey;

	for (const castType of ["force", "tech"]) {
		const parsed = castType === "force" ? parseForcecasting(body) : parseTechcasting(body);
		if (!parsed) continue;

		if (castType === "force") {
			actor.system.details.powerForceLevel = parsed.level ?? actor.system.details.powerForceLevel ?? 0;
			if (parsed.points != null) {
				powercasting.force.points.value = parsed.points;
				powercasting.force.points.max = parsed.points;
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
			if (parsed.points != null) {
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
		actor.items.push({
			_id: featId,
			_key: `!actors.items!${actor._id}.${featId}`,
			name: featName,
			type: "feat",
			img: "systems/dnd5e/icons/svg/items/feature.svg",
			system: {
				description: { value: `<p>${String(parsed.raw || "").replace(/\n/g, "<br>")}</p>`, chat: "" },
				source: { custom: SOURCE_VISIBLE },
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
					[VGH_PROVENANCE_FLAG]: {
						castingTrait: true,
						castType,
						parsedLevel: parsed.level,
						parsedPoints: parsed.points,
						parsedAbility: parsed.abilityKey,
						parsedSaveDc: parsed.saveDc,
						parsedAttackBonus: parsed.attackBonus,
						sourceSemanticKey: semanticKey
					}
				}
			}
		});
		embedded.push({ kind: "casting-feat", name: featName, id: featId, castType });

		const seen = new Set();
		for (const tier of parsed.tiers || []) {
			for (const powerName of tier.powers || []) {
				const dedupe = String(powerName || "").trim().toLowerCase();
				if (seen.has(dedupe)) continue;
				seen.add(dedupe);
				const loaded = loadAndCloneCanonicalPower(powerName, castType);
				if (!loaded.ok) {
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
				applyPerDayUses(clone, tier.usesPerDay);
				stampCanonicalItem(clone, {
					actorId: actor._id,
					itemId,
					semanticKey,
					family: "power",
					castType,
					tier
				});
				clone.flags.core = clone.flags.core || {};
				clone.flags.core.sourceId = `Compendium.sw5e-module.powers-maneuvers.Item.${originalId}`;
				clone._stats = clone._stats || {};
				clone._stats.compendiumSource = `Compendium.sw5e-module.powers-maneuvers.Item.${originalId}`;
				if (!clone.system?.activities || !Object.keys(clone.system.activities).length) {
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
					canonicalId: originalId
				});
			}
		}
	}

	return { exceptions, embedded };
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
	if (!parsed) return { exceptions, embedded, parsed: null };

	const superiority = ensureSuperiority(actor);
	if (parsed.dice != null) {
		superiority.dice.value = parsed.dice;
		superiority.dice.max = parsed.dice;
	}
	if (parsed.die) {
		const dieNum = Number(String(parsed.die).replace(/^d/i, ""));
		superiority.die = Number.isFinite(dieNum) ? dieNum : superiority.die;
	}
	actor.system.details.superiorityLevel = actor.system.details.superiorityLevel || parsed.dice || 0;
	if (parsed.abilityKey) {
		for (const key of ["general", "physical", "mental"]) {
			superiority.types[key] = superiority.types[key] || {};
			superiority.types[key].attr = parsed.abilityKey;
		}
	}

	for (const maneuverName of parsed.maneuvers || []) {
		const loaded = loadAndCloneCanonicalManeuver(maneuverName);
		if (!loaded.ok) {
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
		stampCanonicalItem(clone, {
			actorId: actor._id,
			itemId,
			semanticKey: irEntry.semanticKey,
			family: "maneuver"
		});
		clone.flags.core = { ...(clone.flags.core || {}), sourceId: `Compendium.sw5e-module.powers-maneuvers.Item.${originalId}` };
		if (!Object.keys(clone.system?.activities || {}).length) {
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
