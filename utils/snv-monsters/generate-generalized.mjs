/**
 * Generalized IR → minimal Actor YAML (data-driven; not N1-name branched).
 * Emits sandbox-only documents with temporary nonproduction IDs when unpinned.
 */
import crypto from "node:crypto";
import { loadAndCloneCanonicalWeapon } from "./canonical.mjs";
import { stripBlockquotes } from "./classify.mjs";

function tempId(seed) {
	return crypto.createHash("sha256").update(`n2-sandbox:${seed}`).digest("hex").slice(0, 16);
}

function parseAttacks(text) {
	const attacks = [];
	const patterns = [
		/\*\*\*([^*]+)\.\*\*\*\s*\*(Melee|Ranged) Weapon Attack:\*\s*([+-]\d+)\s*to hit[\s\S]*?\*Hit:\*\s*([^.]+)\./gi,
		/\*\*([^*]+)\.\*\*\s*\*(Melee|Ranged) Weapon Attack:\*\s*([+-]\d+)\s*to hit[\s\S]*?\*Hit:\*\s*([^.]+)\./gi,
		/\*{0,3}([^*\n]+?)\.\*{0,3}\s*\*(Melee|Ranged) Weapon Attack:\*\s*([+-]\d+)\s*to hit[\s\S]*?\*Hit:\*\s*([^.]+)\./gi,
		/([A-Z][^.\n]+)\.\s*(Melee|Ranged) Weapon Attack:\s*([+-]\d+)\s*to hit[\s\S]*?Hit:\s*([^.]+)\./g
	];
	for ( const re of patterns ) {
		let m;
		while ( (m = re.exec(text)) ) {
			const name = m[1].replace(/\*+/g, "").trim();
			if ( attacks.some(a => a.name.toLowerCase() === name.toLowerCase()) ) continue;
			attacks.push({
				name,
				kind: m[2].toLowerCase(),
				bonus: m[3],
				hit: m[4].trim()
			});
		}
	}
	return attacks;
}

function parseHp(text) {
	const m = text.match(/Hit Points\s+(\d+)/i);
	return m ? Number(m[1]) : 1;
}

function parseAc(text) {
	const m = text.match(/Armor Class\s+(\d+)/i);
	return m ? Number(m[1]) : 10;
}

function parseCr(text) {
	const m = text.match(/Challenge\s+([0-9/]+)/i);
	return m ? m[1] : "0";
}

/**
 * Build a minimal NPC actor from IR + raw body text.
 */
export function generateGeneralizedActor({
	irEntry,
	body,
	actorId = null,
	nonproduction = true
}) {
	const text = stripBlockquotes(body);
	const id = actorId || tempId(irEntry.semanticKey || irEntry.sourceName);
	const attacks = parseAttacks(text);
	const items = [];
	const exceptions = [];

	for ( const atk of attacks ) {
		const itemId = tempId(`${id}:${atk.name}`);
		const activityId = tempId(`${itemId}:attack`);
		const isNatural = /bite|claw|slam|tentacle|gore|sting/i.test(atk.name);
		let img = "icons/svg/sword.svg";
		let systemType = isNatural
			? { value: "natural", subtype: "", baseItem: "" }
			: { value: "simpleM", subtype: "", baseItem: "" };

		const canon = !isNatural ? loadAndCloneCanonicalWeapon(atk.name) : { ok: false };
		let weaponDoc;
		if ( canon.ok ) {
			weaponDoc = canon.clone;
			weaponDoc._id = itemId;
			weaponDoc.name = atk.name;
			weaponDoc._key = `!actors.items!${id}.${itemId}`;
			// preserve full cloned system; override attack presentation lightly
			weaponDoc.flags = weaponDoc.flags || {};
			weaponDoc.flags.sw5e = {
				...(weaponDoc.flags.sw5e || {}),
				snvMonsters: {
					classification: "manufactured",
					kind: "weaponCarried",
					canonicalMatch: canon.resolved.canonical.path,
					ammoModel: "itemUses",
					sandboxTemp: nonproduction
				}
			};
			exceptions.push({
				type: "canonical-clone-with-overrides",
				weapon: atk.name,
				canonical: canon.resolved.canonical.path
			});
		} else {
			if ( !isNatural ) {
				exceptions.push({
					type: "canonical-item-match-absent",
					weapon: atk.name,
					reason: canon.resolved?.reason || "no-match"
				});
			}
			const parts = [];
			const dmg = atk.hit.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(\w+)/i);
			if ( dmg ) parts.push([dmg[1].replace(/\s+/g, ""), dmg[2].toLowerCase()]);
			weaponDoc = {
				_id: itemId,
				_key: `!actors.items!${id}.${itemId}`,
				name: atk.name,
				type: "weapon",
				img,
				system: {
					type: systemType,
					damage: { parts, versatile: "" },
					range: atk.kind === "ranged" ? { value: 30, long: 120, units: "ft" } : { value: null, long: null, units: "" },
					uses: { value: null, max: "", per: null, recovery: "", prompt: true },
					activities: {
						[activityId]: {
							_id: activityId,
							type: "attack",
							activation: { type: "action", value: 1 },
							attack: {
								ability: "",
								bonus: String(atk.bonus).replace(/^\+/, ""),
								flat: true,
								type: { value: atk.kind, classification: "weapon" }
							},
							damage: { parts: parts.map(p => ({ number: null, denomination: null, bonus: p[0], types: [p[1]] })) },
							consumption: { targets: [], scaling: { allowed: false }, spellSlot: true }
						}
					}
				},
				flags: {
					sw5e: {
						snvMonsters: {
							classification: isNatural ? "natural" : "source-specific",
							kind: isNatural ? "weaponNatural" : "weaponSourceSpecific",
							sandboxTemp: nonproduction
						}
					}
				}
			};
		}
		items.push(weaponDoc);
	}

	if ( irEntry.features?.hasSave && !attacks.length ) {
		exceptions.push({ type: "save-only-action-not-fully-emitted", note: "save text detected; skeleton actor scalars only" });
	}
	for ( const mech of irEntry.unsupportedMechanics || [] ) {
		exceptions.push({ type: "unsupported-mechanic", mechanic: mech });
	}

	const actor = {
		_id: id,
		_key: `!actors!${id}`,
		name: irEntry.sourceName,
		type: "npc",
		img: "icons/svg/mystery-man.svg",
		items,
		system: {
			details: {
				source: { custom: "SnV" },
				cr: parseCr(text),
				type: { value: "custom", custom: irEntry.section }
			},
			attributes: {
				ac: { flat: parseAc(text), calc: "flat" },
				hp: { value: parseHp(text), max: parseHp(text) }
			}
		},
		flags: {
			sw5e: {
				snvMonsters: {
					semanticKey: irEntry.semanticKey,
					sourceSection: irEntry.section,
					sourceHash: irEntry.rawSourceHash,
					generatorVersion: irEntry.generatorVersion,
					schemaVersion: irEntry.schemaVersion,
					parseStatus: irEntry.parseStatus,
					capabilityStatus: irEntry.capabilityStatus,
					outputSelection: irEntry.outputSelection,
					productionReadiness: irEntry.productionReadiness,
					nonproduction: nonproduction,
					sandboxTemp: nonproduction,
					unsupportedMechanics: irEntry.unsupportedMechanics || []
				}
			}
		}
	};

	return { actor, exceptions, attacksParsed: attacks.length };
}
