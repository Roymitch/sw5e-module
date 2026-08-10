import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { resolveCanonicalWeapon } from "./canonical.mjs";
import { stripBlockquotes } from "./classify.mjs";
import { embedForceTechPowers, embedSuperiorityManeuvers } from "./embed-casting.mjs";
import { resolvePinnedItemIdentity } from "./identity.mjs";
import { assertSafeFormula } from "./numeric-guards.mjs";
import { ROOT, SOURCE_VISIBLE, COMMITTED_PACK_SOURCE } from "./paths.mjs";
import { applyActorPublicationSource, VGH_PROVENANCE_FLAG } from "./source-provenance.mjs";
import { parseFeatureEntries, parseStatBlock } from "./stat-block.mjs";
import { classifyAttackInstance } from "./weapon-classification.mjs";
import { folderIdForCreatureType, resolveCreatureTypeFolderLabel } from "./creature-type-folders.mjs";

const SIZE_TO_TOKEN_DIMENSIONS = {
	tiny: { width: 1, height: 1 },
	sm: { width: 1, height: 1 },
	med: { width: 1, height: 1 },
	lg: { width: 2, height: 2 },
	huge: { width: 3, height: 3 },
	grg: { width: 4, height: 4 }
};

let SCAFFOLDS = null;

function shortHash(seed) {
	return crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 16);
}

function tempId(seed) {
	return shortHash(`vgh:${seed}`);
}

function deepClone(value) {
	return structuredClone(value);
}

function stripSnvFlags(document) {
	if (!document?.flags) return document;
	const next = deepClone(document);
	if (next.flags?.sw5e?.snvMonsters) delete next.flags.sw5e.snvMonsters;
	return next;
}

function walkYamlFiles(dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) walkYamlFiles(fullPath, out);
		else if (entry.name.endsWith(".yml") && entry.name !== "_folder.yml") out.push(fullPath);
	}
	return out;
}

function loadScaffolds() {
	if (!SCAFFOLDS) {
		const preferredActorPath = path.join(ROOT, "packs/_source/snv-monsters/beast/acklay-gladiator.yml");
		const actorPath = fs.existsSync(preferredActorPath)
			? preferredActorPath
			: walkYamlFiles(path.join(ROOT, "packs/_source/snv-monsters")).find(filePath => filePath.includes(`${path.sep}beast${path.sep}`));
		if (!actorPath) throw new Error("[veshs-galactic-holodex] unable to locate scaffold actor");
		const actor = yaml.load(fs.readFileSync(actorPath, "utf8"));
		const feat = actor.items?.find(item => item.type === "feat");
		const weapon = actor.items?.find(item => item.type === "weapon" && item.system?.activities);
		if (!feat || !weapon) {
			throw new Error("[veshs-galactic-holodex] unable to derive feat/weapon scaffolds from existing source actor");
		}
		SCAFFOLDS = { actor, feat, weapon };
	}
	return {
		actor: deepClone(SCAFFOLDS.actor),
		feat: deepClone(SCAFFOLDS.feat),
		weapon: deepClone(SCAFFOLDS.weapon)
	};
}

function cleanFormula(formula) {
	return String(formula || "").replace(/\s+/g, "");
}

function toHtmlParagraph(text) {
	const normalized = String(text || "")
		.replace(/\s+/g, " ")
		.replace(/\s+\./g, ".")
		.trim();
	return normalized ? `<p>${normalized}</p>` : "";
}

function parseTargetCount(text) {
	const lower = String(text || "").toLowerCase();
	if (/\bone target\b/.test(lower)) return "1";
	if (/\btwo targets\b/.test(lower)) return "2";
	if (/\bthree targets\b/.test(lower)) return "3";
	return "";
}

function parseDamageFormula(hitText) {
	const parenthetical = hitText.match(/\(([^)]+)\)\s+([a-zA-Z]+)\s+damage/i);
	if (parenthetical) return { formula: cleanFormula(parenthetical[1]), type: parenthetical[2].toLowerCase() };
	const dice = hitText.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+([a-zA-Z]+)\s+damage/i);
	if (dice) return { formula: cleanFormula(dice[1]), type: dice[2].toLowerCase() };
	const flat = hitText.match(/(\d+)\s+([a-zA-Z]+)\s+damage/i);
	if (flat) return { formula: flat[1], type: flat[2].toLowerCase() };
	return { formula: "", type: "" };
}

function activityDamageParts(formula, damageType) {
	if (!formula || !damageType) return [];
	const match = formula.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
	if (match) {
		return [{
			number: Number(match[1]),
			denomination: Number(match[2]),
			bonus: match[3] || "",
			types: [damageType],
			custom: { enabled: false, formula: "" },
			scaling: { mode: "", number: null, formula: "" }
		}];
	}
	return [{
		number: null,
		denomination: null,
		bonus: formula,
		types: [damageType],
		custom: { enabled: false, formula: "" },
		scaling: { mode: "", number: null, formula: "" }
	}];
}

function parseAttackEntry(entry) {
	const withHit = entry.text.match(
		/\*?(Melee(?:\s+or\s+Ranged)?|Ranged) Weapon Attack:\*?\s*([+-]\d+)(?:\s*to hit)?,\s*(.*?)\.\s*\*?Hit:?\*?\s*([^]+)$/i
	);
	const withoutHit = withHit ? null : entry.text.match(
		/\*?(Melee(?:\s+or\s+Ranged)?|Ranged) Weapon Attack:\*?\s*([+-]\d+)(?:\s*to hit)?,\s*(.*?)\.\s*(.+)$/i
	);
	const rapidOrSave = (withHit || withoutHit) ? null : entry.text.match(
		/\*?(Melee(?:\s+or\s+Ranged)?|Ranged) Weapon Attack:\*?\s*(?:Rapid\s+\d+\s*,\s*)?(.*?)\.\s*(.+)$/i
	);
	const attackMatch = withHit || withoutHit;
	if (!attackMatch && !rapidOrSave) return null;
	const kindSource = attackMatch ? attackMatch[1] : rapidOrSave[1];
	const targetingClause = (attackMatch ? attackMatch[3] : rapidOrSave[2]).trim();
	const hitText = ((attackMatch ? attackMatch[4] : rapidOrSave[3]) || "").replace(/\s+/g, " ").trim().replace(/\.*$/, "");
	const reachMatch = targetingClause.match(/reach\s+(\d+)\s*ft\.?/i);
	const rangeMatch = targetingClause.match(/(?:range\s+|or\s+)(\d+)(?:\/(\d+))?\s*ft\.?/i);
	const dualMode = /melee\s+or\s+ranged/i.test(kindSource);
	const kind = dualMode ? "ranged" : kindSource.toLowerCase();
	const damage = parseDamageFormula(hitText);
	const bonus = attackMatch ? attackMatch[2] : "+0";
	return {
		name: entry.name,
		section: entry.section,
		description: entry.text,
		kind,
		dualMode,
		bonus,
		flatBonus: String(bonus).replace(/^\+/, ""),
		reach: reachMatch ? Number(reachMatch[1]) : null,
		range: rangeMatch ? Number(rangeMatch[1]) : null,
		long: rangeMatch?.[2] ? Number(rangeMatch[2]) : null,
		targetCount: parseTargetCount(targetingClause),
		targetType: /target/i.test(targetingClause) ? "creature" : "",
		hit: hitText,
		damageFormula: damage.formula || "",
		damageType: damage.type || "kinetic"
	};
}

function parseAttacks(text) {
	const entries = parseFeatureEntries(text)
		.filter(entry => entry.section === "actions")
		.map(parseAttackEntry)
		.filter(Boolean);
	if (entries.length) return entries;
	return [];
}

function resolveFeatureImage(name, type, actorImg) {
	if (type === "weapon") {
		if (/bite/i.test(name)) return "modules/sw5e-module/icons/packs/Naturals/Teeth.webp";
		if (/claw/i.test(name)) return "modules/sw5e-module/icons/packs/Naturals/Claws.webp";
		return actorImg || "icons/svg/sword.svg";
	}
	const exactTrait = `modules/sw5e-module/icons/packs/Monster Traits/${name}.webp`;
	const exactTraitPath = path.join(ROOT, exactTrait.replace("modules/sw5e-module/", "").replace(/\//g, path.sep));
	if (fs.existsSync(exactTraitPath)) return exactTrait;
	return actorImg || "icons/svg/mystery-man.svg";
}

function activationTypeForFeature(section, text) {
	if (section === "actions") return "action";
	if (section === "reactions") return "reaction";
	if (section === "bonus-actions") return "bonus";
	if (section === "legendary-actions") return "legendary";
	if (/bonus action/i.test(text)) return "bonus";
	if (/\breaction\b/i.test(text)) return "reaction";
	return "";
}

function buildFeatItem({ featScaffold, actorId, itemId, name, description, img, sourceSection, semanticKey }) {
	const item = stripSnvFlags(featScaffold);
	item._id = itemId;
	item._key = `!actors.items!${actorId}.${itemId}`;
	item.name = name;
	item.img = img;
	item.effects = [];
	item.folder = null;
	item.flags = { sw5e: {
		[VGH_PROVENANCE_FLAG]: {
			embeddedFromSource: true,
			classification: "non-weapon",
			kind: sourceSection === "actions" ? "featAction" : "featPassiveOrRider",
			sourceSection,
			sourceSemanticKey: semanticKey
		}
	} };
	const activationType = activationTypeForFeature(sourceSection, description);
	item.system.description.value = toHtmlParagraph(description);
	item.system.description.chat = "";
	item.system.source.custom = SOURCE_VISIBLE;
	item.system.activation.type = activationType;
	item.system.activation.cost = activationType ? 1 : null;
	item.system.activation.condition = "";
	item.system.damage.parts = [];
	item.system.damage.versatile = "";
	item.system.formula = "";
	item.system.uses.value = null;
	item.system.uses.max = "";
	item.system.uses.per = null;
	item.system.uses.recovery = "";
	item.system.uses.prompt = true;
	item.system.consume.type = "";
	item.system.consume.target = null;
	item.system.consume.amount = null;
	item.system.consume.scale = false;
	item.system.ability = "";
	item.system.actionType = "";
	item.system.chatFlavor = "";
	item.system.save.ability = "";
	item.system.save.dc = null;
	item.system.save.scaling = "spell";
	item.system.recharge.value = null;
	item.system.recharge.charged = false;
	item.system.attack.bonus = "";
	item.system.attack.flat = false;
	item.system.properties = [];
	const usesMatch = String(name || "").match(/\((\d+)\s*\/\s*Day\)/i);
	if (usesMatch) {
		const max = Number(usesMatch[1]);
		item.system.uses.value = max;
		item.system.uses.max = String(max);
		item.system.uses.per = "day";
	}
	const rechargeMatch = String(name || "").match(/\(Recharge\s+(\d+)(?:\s*-\s*(\d+))?\)/i);
	if (rechargeMatch) {
		item.system.recharge.value = Number(rechargeMatch[1]);
		item.system.recharge.charged = true;
	}
	return item;
}

function buildSourceSpecificWeaponItem({ weaponScaffold, actorId, itemId, activityId, attack, description, img, classification, semanticKey }) {
	const item = stripSnvFlags(weaponScaffold);
	const activityTemplate = deepClone(Object.values(weaponScaffold.system.activities || {})[0]);
	item._id = itemId;
	item._key = `!actors.items!${actorId}.${itemId}`;
	item.name = attack.name;
	item.img = img;
	item.effects = [];
	item.folder = null;
	item.flags = { sw5e: {
		[VGH_PROVENANCE_FLAG]: {
			embeddedFromSource: true,
			classification,
			kind: classification === "validated-natural-weapon" ? "weaponNatural" : "weaponSourceSpecific",
			sourceActionNames: [attack.name],
			sourceSemanticKey: semanticKey
		}
	} };
	item.system.description.value = toHtmlParagraph(description);
	item.system.description.chat = "";
	item.system.source.custom = SOURCE_VISIBLE;
	item.system.activation.type = "action";
	item.system.activation.cost = 1;
	item.system.activation.condition = "";
	item.system.range.value = attack.kind === "ranged"
		? (attack.range ?? attack.reach)
		: (attack.reach ?? attack.range);
	item.system.range.long = attack.long ?? null;
	item.system.range.units = attack.reach || attack.range ? "ft" : "";
	item.system.uses.value = null;
	item.system.uses.max = "";
	item.system.uses.per = null;
	item.system.uses.recovery = "";
	item.system.uses.prompt = true;
	item.system.consume.type = "";
	item.system.consume.target = null;
	item.system.consume.amount = null;
	item.system.consume.scale = false;
	item.system.ability = attack.kind === "ranged" ? "dex" : "str";
	item.system.actionType = attack.kind === "ranged" ? "rwak" : "mwak";
	item.system.chatFlavor = "";
	item.system.damage.parts = attack.damageFormula && attack.damageType ? [[attack.damageFormula, attack.damageType]] : [];
	item.system.damage.versatile = "";
	item.system.formula = "";
	item.system.save.ability = "";
	item.system.save.dc = null;
	item.system.save.scaling = "spell";
	item.system.ammo.target = null;
	item.system.ammo.value = null;
	item.system.ammo.use = null;
	item.system.ammo.types = [];
	item.system.properties = [];
	item.system.proficient = 1;
	item.system.type.value = classification === "validated-natural-weapon" ? "natural" : "simpleM";
	item.system.type.subtype = "";
	item.system.type.baseItem = "";
	item.system.attackBonus = attack.flatBonus;
	item.system.attack.bonus = "";
	item.system.attack.flat = false;
	item.system.activities = {
		[activityId]: {
			...activityTemplate,
			_id: activityId,
			type: "attack",
			activation: {
				type: "action",
				value: 1,
				condition: "",
				override: false
			},
			attack: {
				...(activityTemplate.attack || {}),
				ability: "",
				bonus: attack.flatBonus,
				flat: true,
				type: {
					classification: "weapon",
					value: attack.kind
				},
				critical: {}
			},
			damage: {
				...(activityTemplate.damage || {}),
				critical: {},
				includeBase: false,
				parts: activityDamageParts(attack.damageFormula, attack.damageType)
			},
			range: {
				override: false,
				units: attack.reach || attack.range ? "ft" : "",
				value: attack.reach ? String(attack.reach) : (attack.range ? String(attack.range) : "")
			},
			target: {
				...(activityTemplate.target || {}),
				affects: {
					...((activityTemplate.target || {}).affects || {}),
					type: attack.targetType,
					count: attack.targetCount
				},
				override: false,
				prompt: true
			}
		}
	};
	return item;
}

function retargetCanonicalWeapon({ actorId, itemId, activityId, attack, semanticKey, description, weaponDoc }) {
	const clone = stripSnvFlags(weaponDoc);
	const oldActivity = Object.values(clone.system?.activities || {})[0] || {};
	clone._id = itemId;
	clone.name = attack.name;
	clone._key = `!actors.items!${actorId}.${itemId}`;
	clone.folder = null;
	clone.flags = clone.flags || {};
	clone.flags.core = {
		...(clone.flags.core || {}),
		sourceId: weaponDoc?._id ? `Compendium.sw5e-module.equipment.Item.${weaponDoc._id}` : clone.flags.core?.sourceId
	};
	clone.flags.sw5e = clone.flags.sw5e || {};
	clone.flags.sw5e[VGH_PROVENANCE_FLAG] = {
		...(clone.flags.sw5e[VGH_PROVENANCE_FLAG] || {}),
		classification: "canonical-manufactured-weapon",
		embeddedFromCanonical: true,
		sourceActionNames: [attack.name],
		sourceSemanticKey: semanticKey
	};
	clone.system.description = clone.system.description || {};
	clone.system.description.value = toHtmlParagraph(description);
	if (attack.range != null || attack.long != null) {
		clone.system.range = clone.system.range || {};
		if (attack.range != null) clone.system.range.value = attack.range;
		if (attack.long != null) clone.system.range.long = attack.long;
		clone.system.range.units = "ft";
	}
	if (attack.damageFormula && attack.damageType) {
		clone.system.damage = clone.system.damage || {};
		clone.system.damage.parts = [[attack.damageFormula, attack.damageType]];
	}
	if (attack.flatBonus != null && attack.flatBonus !== "") {
		clone.system.attack = clone.system.attack || {};
		clone.system.attack.bonus = String(attack.flatBonus);
		clone.system.attack.flat = true;
		clone.system.attackBonus = attack.flatBonus;
	}
	clone.system.activities = {
		[activityId]: {
			...oldActivity,
			_id: activityId,
			attack: {
				...(oldActivity.attack || {}),
				bonus: attack.flatBonus != null && attack.flatBonus !== "" ? String(attack.flatBonus) : (oldActivity.attack?.bonus || ""),
				flat: attack.flatBonus != null && attack.flatBonus !== ""
			},
			damage: {
				...(oldActivity.damage || {}),
				parts: attack.damageFormula && attack.damageType
					? activityDamageParts(attack.damageFormula, attack.damageType)
					: (oldActivity.damage?.parts || [])
			}
		}
	};
	for (const effect of clone.effects || []) {
		effect._key = `!actors.items.effects!${actorId}.${itemId}.${effect._id}`;
		effect.origin = `Actor.${actorId}.Item.${itemId}`;
	}
	return clone;
}

function buildActorFromScaffold(actorScaffold, { irEntry, actorId, parsed, artwork = null }) {
	const actor = deepClone(actorScaffold);
	const tokenDimensions = SIZE_TO_TOKEN_DIMENSIONS[parsed.descriptor.size] || SIZE_TO_TOKEN_DIMENSIONS.med;
	actor._id = actorId;
	actor._key = `!actors!${actorId}`;
	actor.name = irEntry.sourceName;
	actor.type = "npc";
	actor.img = artwork?.avatarPath || "systems/dnd5e/icons/svg/actors/npc.svg";
	const typeForFolder = {
		value: parsed.descriptor.type,
		subtype: parsed.descriptor.subtype || "",
		swarm: parsed.descriptor.swarm || "",
		custom: parsed.descriptor.custom || ""
	};
	const folderResolution = resolveCreatureTypeFolderLabel(typeForFolder);
	actor.folder = folderResolution.unresolved ? null : folderIdForCreatureType(typeForFolder);
	actor.effects = [];
	actor.items = [];
	actor.prototypeToken.name = irEntry.sourceName;
	actor.prototypeToken.width = tokenDimensions.width;
	actor.prototypeToken.height = tokenDimensions.height;
	actor.prototypeToken.texture.src = actor.img;
	actor.system.abilities.str.value = parsed.abilities.str;
	actor.system.abilities.dex.value = parsed.abilities.dex;
	actor.system.abilities.con.value = parsed.abilities.con;
	actor.system.abilities.int.value = parsed.abilities.int;
	actor.system.abilities.wis.value = parsed.abilities.wis;
	actor.system.abilities.cha.value = parsed.abilities.cha;
	actor.system.attributes.ac.flat = parsed.ac.value;
	actor.system.attributes.ac.calc = parsed.ac.calc;
	actor.system.attributes.ac.formula = "";
	actor.system.attributes.hp.value = parsed.hp.value;
	actor.system.attributes.hp.max = parsed.hp.value;
	actor.system.attributes.hp.temp = 0;
	actor.system.attributes.hp.tempmax = 0;
	actor.system.attributes.hp.formula = parsed.hp.formula;
	actor.system.attributes.movement.burrow = parsed.movement.burrow;
	actor.system.attributes.movement.climb = parsed.movement.climb;
	actor.system.attributes.movement.fly = parsed.movement.fly;
	actor.system.attributes.movement.swim = parsed.movement.swim;
	actor.system.attributes.movement.walk = parsed.movement.walk;
	actor.system.attributes.movement.units = parsed.movement.units;
	actor.system.attributes.movement.hover = parsed.movement.hover;
	actor.system.attributes.senses.darkvision = parsed.senses.darkvision;
	actor.system.attributes.senses.blindsight = parsed.senses.blindsight;
	actor.system.attributes.senses.tremorsense = parsed.senses.tremorsense;
	actor.system.attributes.senses.truesight = parsed.senses.truesight;
	actor.system.attributes.senses.units = parsed.senses.units;
	actor.system.attributes.senses.special = parsed.senses.special;
	actor.system.details.biography.value = "";
	actor.system.details.biography.public = "";
	actor.system.details.alignment = parsed.descriptor.alignment;
	actor.system.details.type.value = parsed.descriptor.type;
	actor.system.details.type.subtype = parsed.descriptor.subtype || "";
	actor.system.details.type.swarm = parsed.descriptor.swarm || "";
	actor.system.details.type.custom = parsed.descriptor.custom || "";
	actor.system.details.cr = parsed.cr;
	actor.system.details.powerForceLevel = 0;
	actor.system.details.powerTechLevel = 0;
	actor.system.details.superiorityLevel = 0;
	actor.system.traits.size = parsed.descriptor.size;
	actor.system.traits.languages.value = [];
	actor.system.traits.languages.custom = "-";
	for (const skill of Object.values(actor.system.skills || {})) {
		skill.value = 0;
		skill.bonuses.check = "";
		skill.bonuses.passive = "";
	}
	for (const [skillKey, config] of Object.entries(parsed.skills)) {
		if (!actor.system.skills?.[skillKey]) continue;
		actor.system.skills[skillKey].value = config.value;
		if (config.ability) actor.system.skills[skillKey].ability = config.ability;
		actor.system.skills[skillKey].bonuses.check = assertSafeFormula(
			config.checkBonus ?? "",
			`actor.system.skills.${skillKey}.bonuses.check`,
			{ sourceName: irEntry.sourceName, skillKey }
		);
		actor.system.skills[skillKey].bonuses.passive = "";
	}
	actor.flags = { sw5e: {} };
	const sourced = applyActorPublicationSource(actor, {
		sourceEntry: irEntry.sourceName,
		sourceSection: irEntry.section,
		sourceHash: irEntry.rawSourceHash,
		semanticKey: irEntry.semanticKey,
		generatorVersion: irEntry.generatorVersion
	});
	sourced.flags.sw5e[VGH_PROVENANCE_FLAG] = {
		...sourced.flags.sw5e[VGH_PROVENANCE_FLAG],
		parseStatus: irEntry.parseStatus,
		capabilityStatus: irEntry.capabilityStatus,
		outputSelection: irEntry.outputSelection,
		productionReadiness: irEntry.productionReadiness,
		unsupportedMechanics: irEntry.unsupportedMechanics || [],
		generatedStatus: "production",
		creatureTypeFolder: folderResolution.unresolved ? null : folderResolution.label
	};
	return sourced;
}

export function generateGeneralizedActor({ irEntry, body, actorId = null, productionContext = null }) {
	const text = stripBlockquotes(body);
	const id = actorId || tempId(irEntry.semanticKey || irEntry.sourceName);
	const parsed = parseStatBlock(text, { sourceName: irEntry.sourceName });
	const entriesByName = new Map(parsed.featureEntries.map(entry => [entry.name, entry]));
	const attacks = parseAttacks(text);
	const attacksByName = new Map(attacks.map(attack => [attack.name, attack]));
	const { actor: actorScaffold, feat: featScaffold, weapon: weaponScaffold } = loadScaffolds();
	const actor = buildActorFromScaffold(actorScaffold, {
		irEntry,
		actorId: id,
		parsed,
		artwork: productionContext?.artwork || null
	});
	const items = [];
	const exceptions = [];
	const exactFeatures = productionContext?.exactFeatures || null;
	const identityActor = productionContext?.identityActor || null;
	const emittedFeatNames = new Set();

	const addFeat = (name, sourceSection) => {
		if (emittedFeatNames.has(name)) return;
		let entry = parsed.featureEntries.find(feature =>
			feature.name === name && feature.section === sourceSection
		) || parsed.featureEntries.find(feature => feature.name === name) || null;
		if (!entry && name === "Legendary Actions") {
			const match = text.match(/###\s+Legendary Actions\b([\s\S]*?)(?=###\s+|\\pagebreakNum|$)/i);
			if (match) {
				entry = {
					name,
					section: "legendary-actions",
					text: match[1].replace(/\s+/g, " ").trim()
				};
			}
		}
		if (!entry) return;
		let itemIdentity = null;
		if (identityActor) {
			try {
				itemIdentity = resolvePinnedItemIdentity(identityActor, name, "feat");
			} catch {
				itemIdentity = Object.values(identityActor.items || {}).find(item => item.name === name) || null;
			}
		}
		items.push(buildFeatItem({
			featScaffold,
			actorId: id,
			itemId: itemIdentity?.id || tempId(`${id}:${name}`),
			name,
			description: entry.text,
			img: resolveFeatureImage(name, "feat", actor.img),
			sourceSection: entry.section || sourceSection,
			semanticKey: irEntry.semanticKey
		}));
		emittedFeatNames.add(name);
	};

	const addWeapon = attack => {
		const classification = classifyAttackInstance({
			actorName: irEntry.sourceName,
			attackName: attack.name,
			creatureType: parsed.descriptor.type,
			sourceSection: irEntry.section
		}).classification;
		const itemIdentity = identityActor
			? resolvePinnedItemIdentity(identityActor, attack.name, "weapon")
			: null;
		const activityId = itemIdentity ? Object.values(itemIdentity.activities || {})[0]?.id : tempId(`${id}:${attack.name}:attack`);
		if (classification === "canonical-manufactured-weapon") {
			const resolved = resolveCanonicalWeapon(attack.name);
			const fullPath = path.join(ROOT, resolved.canonical.path);
			const weaponDoc = yaml.load(fs.readFileSync(fullPath, "utf8"));
			items.push(retargetCanonicalWeapon({
				actorId: id,
				itemId: itemIdentity?.id || tempId(`${id}:${attack.name}`),
				activityId,
				attack,
				semanticKey: irEntry.semanticKey,
				description: entriesByName.get(attack.name)?.text || attack.description || attack.hit,
				weaponDoc
			}));
			return;
		}
		items.push(buildSourceSpecificWeaponItem({
			weaponScaffold,
			actorId: id,
			itemId: itemIdentity?.id || tempId(`${id}:${attack.name}`),
			activityId,
			attack,
			description: entriesByName.get(attack.name)?.text || attack.description || attack.hit,
			img: resolveFeatureImage(attack.name, "weapon", actor.img),
			classification,
			semanticKey: irEntry.semanticKey
		}));
	};

	if (exactFeatures) {
		for (const name of exactFeatures.passives || []) addFeat(name, "traits");
		for (const name of exactFeatures.nonAttackActions || []) {
			const entry = entriesByName.get(name);
			addFeat(name, entry?.section || "actions");
		}
		for (const name of exactFeatures.weaponAttacks || []) {
			const attack = attacksByName.get(name);
			if (!attack) {
				exceptions.push({
					type: "source-attack-parse-miss",
					weapon: name,
					reason: "classified-as-attack-but-parseAttackEntry-returned-null"
				});
				addFeat(name, "actions");
				continue;
			}
			addWeapon(attack);
		}
	} else {
		for (const attack of attacks) addWeapon(attack);
	}

	actor.items = items;
	const forceTechEmbed = embedForceTechPowers({
		actor,
		body: text,
		irEntry,
		actorIdentity: identityActor,
		nonproduction: false
	});
	exceptions.push(...forceTechEmbed.exceptions);
	const superiorityEmbed = embedSuperiorityManeuvers({
		actor,
		body: text,
		irEntry,
		actorIdentity: identityActor,
		nonproduction: false
	});
	exceptions.push(...superiorityEmbed.exceptions);
	actor.flags.sw5e[VGH_PROVENANCE_FLAG].forceTechEmbedding = {
		forcePowers: forceTechEmbed.embedded.filter(entry => entry.castType === "force"),
		techPowers: forceTechEmbed.embedded.filter(entry => entry.castType === "tech"),
		missingCanonical: forceTechEmbed.exceptions.filter(entry => entry.type === "canonical-match-missing")
	};
	actor.flags.sw5e[VGH_PROVENANCE_FLAG].superiorityEmbedding = {
		maneuvers: superiorityEmbed.embedded,
		missingCanonical: superiorityEmbed.exceptions.filter(entry => entry.type === "canonical-match-missing")
	};

	return {
		actor,
		exceptions,
		attacksParsed: attacks.length,
		parsedStatBlock: {
			ac: parsed.ac.value,
			hp: parsed.hp.value,
			cr: parsed.cr,
			size: parsed.descriptor.size
		},
		forceTechEmbed,
		superiorityEmbed
	};
}
