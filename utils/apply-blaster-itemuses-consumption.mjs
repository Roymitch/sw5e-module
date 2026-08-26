import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { applyBlasterItemUsesConsumption } from "../scripts/blaster-migration.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEAPONS_DIR = path.join(ROOT, "packs", "_source", "equipment", "weapons");

function walkYamlFiles(dir, out = []) {
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const fullPath = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walkYamlFiles(fullPath, out);
		else if ( entry.name.endsWith(".yml") ) out.push(fullPath);
	}
	return out;
}

function processDocument(doc) {
	const changed = applyBlasterItemUsesConsumption(doc);
	return { changed, reason: changed ? "updated" : "unchanged" };
}

function main() {
	const files = walkYamlFiles(WEAPONS_DIR);
	let updated = 0;
	let skipped = 0;

	for ( const filePath of files ) {
		const doc = yaml.load(fs.readFileSync(filePath, "utf8"));
		const result = processDocument(doc);
		if ( !result.changed ) {
			skipped++;
			continue;
		}

		const out = yaml.dump(doc, {
			lineWidth: -1,
			noRefs: true,
			quotingType: "'",
			forceQuotes: false
		});
		fs.writeFileSync(filePath, out, "utf8");
		updated++;
		console.log(`OK ${path.relative(WEAPONS_DIR, filePath)}`);
	}

	console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${files.length} total`);
}

main();
