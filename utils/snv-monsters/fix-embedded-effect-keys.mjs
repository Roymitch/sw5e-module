/**
 * Rewrite embedded Active Effect keys on snv-monsters Actors so cloned canonical
 * powers do not collide on pack LevelDB keys.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ROOT } from "./paths.mjs";

const DUMP = { lineWidth: 120, noRefs: true, quotingType: "\"" };
const PACK = path.join(ROOT, "packs/_source/snv-monsters");

function walkYml(dir, out = []) {
	for ( const ent of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const p = path.join(dir, ent.name);
		if ( ent.isDirectory() ) walkYml(p, out);
		else if ( ent.name.endsWith(".yml") && ent.name !== "_folder.yml" ) out.push(p);
	}
	return out;
}

let fixedActors = 0;
let fixedEffects = 0;
for ( const file of walkYml(PACK) ) {
	const doc = yaml.load(fs.readFileSync(file, "utf8"));
	if ( doc.type !== "npc" && doc.type !== "character" && doc.type !== "vehicle" ) continue;
	let changed = false;
	for ( const item of doc.items || [] ) {
		if ( !Array.isArray(item.effects) || !item.effects.length ) continue;
		item.effects = item.effects.map(effect => {
			const effectId = effect._id;
			const expected = `!actors.items.effects!${doc._id}.${item._id}.${effectId}`;
			if ( effect._key === expected && String(effect.origin || "").includes(item._id) ) {
				return effect;
			}
			changed = true;
			fixedEffects += 1;
			return {
				...effect,
				_id: effectId,
				_key: expected,
				origin: `Actor.${doc._id}.Item.${item._id}`
			};
		});
	}
	if ( changed ) {
		fs.writeFileSync(file, `${yaml.dump(doc, DUMP)}\n`);
		fixedActors += 1;
	}
}
console.log(JSON.stringify({ fixedActors, fixedEffects }, null, 2));
