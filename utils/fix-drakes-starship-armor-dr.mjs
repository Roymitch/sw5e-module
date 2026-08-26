/**
 * Surgical rewrite of Drake's Shipyard embedded starship armor Active Effects.
 *
 * Usage: node ./utils/fix-drakes-starship-armor-dr.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAKES = path.resolve(__dirname, "..", "packs", "_source", "drakes-shipyard");

const ARMORS = [
	["Deflection Armor", 3],
	["Reinforced Armor", 6],
	["Lightweight Armor", null]
];

function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function badChangesPattern(changeIndent, valueFirst = false) {
	const sp = " ".repeat(changeIndent);
	const isp = " ".repeat(changeIndent + 2);
	const entry = value => {
		if ( valueFirst ) {
			return [
				`${sp}- key: system\\.traits\\.dr\\.value\\r?\\n`,
				`${isp}value: ${value}\\r?\\n`,
				`${isp}mode: 2\\r?\\n`,
				`${isp}priority: 20`
			].join("");
		}
		return [
			`${sp}- key: system\\.traits\\.dr\\.value\\r?\\n`,
			`${isp}mode: 2\\r?\\n`,
			`${isp}value: ${value}\\r?\\n`,
			`${isp}priority: 20`
		].join("");
	};
	return [entry("ion"), entry("lightning"), entry("necrotic")].join("\\r?\\n");
}

function flatDrChanges(changeIndent, value, nl) {
	const sp = " ".repeat(changeIndent);
	const isp = " ".repeat(changeIndent + 2);
	return [
		`${sp}- key: flags.sw5e.flatDamageReduction`,
		`${isp}mode: 5`,
		`${isp}value: '${value}'`,
		`${isp}priority: 20`
	].join(nl);
}

function rewriteFile(text) {
	const nl = text.includes("\r\n") ? "\r\n" : "\n";
	let total = 0;
	let out = text;

	for ( const [armorName, dr] of ARMORS ) {
		for ( const [changeIndent, nameIndent] of [[10, 8], [6, 4]] ) {
			for ( const valueFirst of [false, true] ) {
				const bad = badChangesPattern(changeIndent, valueFirst);
				const nameSp = " ".repeat(nameIndent);
				const re = new RegExp(
					`${bad}((?:\\r?\\n(?!\\s{0,${Math.max(0, nameIndent - 2)}}- _id:).*){0,50}?\\r?\\n${nameSp}name: ${escapeRegex(armorName)})`,
					"g"
				);
				out = out.replace(re, (match, rest) => {
					total += 1;
					if ( dr === null ) return rest;
					return `${flatDrChanges(changeIndent, dr, nl)}${rest}`;
				});
			}
		}
	}

	return { text: out, count: total };
}

function main() {
	const files = fs.readdirSync(DRAKES).filter(f => f.endsWith(".yml"));
	let filesUpdated = 0;
	let replacements = 0;
	for ( const file of files ) {
		const full = path.join(DRAKES, file);
		const raw = fs.readFileSync(full, "utf8");
		if ( !raw.includes("system.traits.dr.value") ) continue;
		const { text, count } = rewriteFile(raw);
		if ( !count || text === raw ) continue;
		fs.writeFileSync(full, text, "utf8");
		filesUpdated += 1;
		replacements += count;
		console.log(`${file}: ${count} effect block(s)`);
	}
	console.log(`Done. ${filesUpdated} files, ${replacements} replacements.`);
}

main();
