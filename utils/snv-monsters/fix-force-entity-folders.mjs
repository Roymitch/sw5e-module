/**
 * Move mis-filed custom-type Force Entity Actors into force-entity/.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import {
	parseCreatureTypeFromDescriptorPart,
	resolveCreatureTypeFolderLabel,
	getCreatureTypeFolder
} from "./creature-type-folders.mjs";
import { stripBlockquotes } from "./classify.mjs";
import { loadProductionIdentityMap } from "./identity.mjs";
import { loadAuthoritativeSnVSource, splitCreatureBlocks } from "./parse.mjs";
import { ROOT } from "./paths.mjs";

const DUMP = { lineWidth: 120, noRefs: true, quotingType: "\"" };
const PACK = path.join(ROOT, "packs/_source/snv-monsters");
const customDir = path.join(PACK, "custom-type");
if ( !fs.existsSync(customDir) ) {
	console.log(JSON.stringify({ moved: [], note: "no custom-type dir" }, null, 2));
	process.exit(0);
}

const mapPath = path.join(ROOT, "utils/snv-monsters/manifests/identity-map.json");
const map = loadProductionIdentityMap(mapPath);
const bodies = new Map(
	splitCreatureBlocks(loadAuthoritativeSnVSource().markdown).map(b => [b.name, b])
);
const moved = [];

for ( const file of fs.readdirSync(customDir).filter(f => f.endsWith(".yml") && f !== "_folder.yml") ) {
	const src = path.join(customDir, file);
	const doc = yaml.load(fs.readFileSync(src, "utf8"));
	const block = bodies.get(doc.name);
	if ( !block ) {
		console.warn("no source for", doc.name);
		continue;
	}
	const text = stripBlockquotes(block.lines.join("\n"));
	const line = text.split("\n").map(l => l.trim()).find(l => /^\*[^*]+\*$/.test(l));
	const descriptor = (line || "").replace(/^\*|\*$/g, "").trim();
	const afterSize = descriptor.replace(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+/i, "");
	const [typePart] = afterSize.split(/\s*,\s*/, 2);
	const typeDetails = parseCreatureTypeFromDescriptorPart(typePart);
	const resolved = resolveCreatureTypeFolderLabel(typeDetails);
	if ( resolved.label === "Custom Type" || resolved.unresolved ) {
		console.log("leave", doc.name, typePart, resolved);
		continue;
	}
	const folder = getCreatureTypeFolder(resolved.label);
	const destDir = path.join(PACK, folder.packSubdir);
	fs.mkdirSync(destDir, { recursive: true });
	const dest = path.join(destDir, file);
	doc.folder = folder.id;
	doc.system.details.type = {
		value: typeDetails.value,
		subtype: typeDetails.subtype || "",
		swarm: typeDetails.swarm || "",
		custom: typeDetails.custom || ""
	};
	if ( doc.flags?.sw5e?.snvMonsters ) {
		doc.flags.sw5e.snvMonsters.folderAssignment = {
			label: folder.label,
			folderId: folder.id,
			folderSemanticKey: folder.semanticKey,
			taxonomy: "foundry-creature-type"
		};
	}
	fs.writeFileSync(dest, `${yaml.dump(doc, DUMP)}\n`);
	fs.unlinkSync(src);
	for ( const actor of Object.values(map.actors || {}) ) {
		if ( actor.name === doc.name ) actor.folderId = folder.id;
	}
	moved.push({ name: doc.name, to: folder.packSubdir, id: doc._id });
}

fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
console.log(JSON.stringify({ moved, left: fs.readdirSync(customDir) }, null, 2));
