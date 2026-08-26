/**
 * Fail-closed production scan for Force/Tech authored pools and visible sources.
 *
 * Usage:
 *   node utils/validate-force-tech-pools.mjs
 *   node utils/validate-force-tech-pools.mjs snv-monsters
 *   node utils/validate-force-tech-pools.mjs veshs-galactic-holodex
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { validateActorForceTechPools } from "../scripts/force-tech-pool-validate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PACKS = {
	"snv-monsters": {
		root: path.join(ROOT, "packs/_source/snv-monsters"),
		expectedVisibleSource: "SnV"
	},
	"veshs-galactic-holodex": {
		root: path.join(ROOT, "packs/_source/veshs-galactic-holodex"),
		expectedVisibleSource: "Vesh's Galactic Holodex"
	}
};

function walk(dir, acc = []) {
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const full = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walk(full, acc);
		else if ( entry.name.endsWith(".yml") && entry.name !== "_folder.yml" ) acc.push(full);
	}
	return acc;
}

function validatePack(packName) {
	const cfg = PACKS[packName];
	if ( !cfg ) throw new Error(`Unknown pack ${packName}`);
	const failures = [];
	let actors = 0;
	for ( const yamlPath of walk(cfg.root) ) {
		const actor = yaml.load(fs.readFileSync(yamlPath, "utf8"));
		actors += 1;
		failures.push(...validateActorForceTechPools(actor, {
			pack: packName,
			yamlPath,
			expectedVisibleSource: cfg.expectedVisibleSource,
			owningGenerationStage: "production-pack-source"
		}));
	}
	return { pack: packName, actors, failures };
}

const requested = process.argv.slice(2);
const packs = requested.length ? requested : Object.keys(PACKS);
const reports = packs.map(validatePack);
const totalFailures = reports.reduce((n, r) => n + r.failures.length, 0);

for ( const report of reports ) {
	console.log(`${report.pack}: actors=${report.actors} failures=${report.failures.length}`);
	for ( const failure of report.failures.slice(0, 30) ) {
		console.log(`  - ${failure.actor} ${failure.field}: expected ${JSON.stringify(failure.expected)} actual ${JSON.stringify(failure.actual)}`);
	}
	if ( report.failures.length > 30 ) console.log(`  ... ${report.failures.length - 30} more`);
}

if ( totalFailures ) {
	console.error(`\nFAIL: ${totalFailures} Force/Tech pool validation issue(s)`);
	process.exitCode = 1;
} else {
	console.log("\nPASS: Force/Tech pool validation clean");
}
