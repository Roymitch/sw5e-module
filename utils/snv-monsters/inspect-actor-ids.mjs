import yaml from "js-yaml";
import fs from "fs";
import path from "path";
import { ROOT } from "./paths.mjs";

const target = process.argv[2] || "packs/_source/snv-monsters/humanoid/chemist.yml";
const d = yaml.load(fs.readFileSync(path.join(ROOT, target), "utf8"));
const ids = new Map();
const effectIds = new Map();
for ( const item of d.items || [] ) {
	if ( ids.has(item._id) ) console.log("DUP ITEM", item._id, ids.get(item._id), "vs", item.name);
	ids.set(item._id, item.name);
	for ( const eff of item.effects || [] ) {
		const prev = effectIds.get(eff._id);
		if ( prev && prev.itemId !== item._id ) {
			console.log("SHARED EFFECT ID", eff._id, prev.name, "->", item.name);
		}
		effectIds.set(eff._id, { name: item.name, itemId: item._id });
		if ( !eff._key ) console.log("missing effect key", item.name, eff._id);
		else if ( !eff._key.includes(item._id) ) {
			console.log("effect key item mismatch", item.name, item._id, eff._key);
		}
	}
}
console.log({
	actor: d.name,
	items: d.items.length,
	spells: d.items.filter(i => i.type === "spell").length,
	uniqueItemIds: ids.size,
	effects: effectIds.size
});
const bad = (d.items || []).filter(i => i._id === "lkj9xq3JVc4MW1wG"
	|| (i.effects || []).some(e => e._id === "yY0Ae2TbZ7mQK8Lp"));
for ( const item of bad ) {
	console.log(item.name, item._id, (item.effects || []).map(e => ({ id: e._id, key: e._key })));
}
