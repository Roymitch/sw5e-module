/**
 * Remediates natural weapons incorrectly flagged as manufactured (Unarmed Strike cohort).
 * Surgical text edits only — does not re-dump whole Actor YAML.
 * Usage: node utils/snv-monsters/remediate-natural-classification.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ROOT } from "./paths.mjs";

const PACK = path.join(ROOT, "packs/_source/snv-monsters");
const WRITE = process.argv.includes("--write");

function walkYml(dir, out = []) {
	for ( const ent of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const p = path.join(dir, ent.name);
		if ( ent.isDirectory() ) walkYml(p, out);
		else if ( ent.name.endsWith(".yml") && ent.name !== "_folder.yml" ) out.push(p);
	}
	return out;
}

/**
 * Find item block starting at name line; flags usually precede trailing _id.
 */
function patchItemBlock(raw, weaponName) {
	const patterns = [
		`\n  - name: ${weaponName}\n`,
		`\n  - name: '${weaponName}'\n`,
		`\n  - name: "${weaponName}"\n`
	];
	let start = -1;
	for ( const pat of patterns ) {
		start = raw.indexOf(pat);
		if ( start >= 0 ) {
			start += 1; // keep leading newline ownership clean; work from '- name'
			start = raw.indexOf("- name:", start);
			break;
		}
	}
	if ( start < 0 ) return { text: raw, changed: false };

	// End at next sibling item or end of items list (document-level keys after items)
	const rest = raw.slice(start + 1);
	const nextItem = rest.search(/\n  - name: /);
	const end = nextItem >= 0 ? start + 1 + nextItem : raw.length;
	const block = raw.slice(start, end);
	if ( !/classification:\s*manufactured/.test(block) ) return { text: raw, changed: false };
	if ( !/type:\s*\n\s+value:\s*natural|baseItem:\s*unarmedstrike|canonicalMatch:.*natural-weapons/.test(block) ) {
		// Still allow if weapon name is Unarmed Strike
		if ( weaponName !== "Unarmed Strike" ) return { text: raw, changed: false };
	}

	const patched = block
		.replace(/classification:\s*manufactured/, "classification: natural")
		.replace(/kind:\s*weaponCarried/, "kind: weaponNatural")
		.replace(/ammoModel:\s*itemUses/, "ammoModel: null");

	if ( patched === block ) return { text: raw, changed: false };
	return { text: raw.slice(0, start) + patched + raw.slice(end), changed: true };
}

const changes = [];
for ( const file of walkYml(PACK) ) {
	const raw = fs.readFileSync(file, "utf8");
	const doc = yaml.load(raw);
	if ( !doc?.items ) continue;
	let text = raw;
	let fileChanged = false;
	for ( const item of doc.items ) {
		if ( item.type !== "weapon" ) continue;
		const snv = item.flags?.sw5e?.snvMonsters;
		if ( !snv || snv.classification !== "manufactured" ) continue;
		const typeValue = item.system?.type?.value;
		const canonPath = String(snv.canonicalMatch || "").replace(/\\/g, "/");
		if ( !(typeValue === "natural" || canonPath.includes("/natural-weapons/")) ) continue;
		const result = patchItemBlock(text, item.name);
		if ( result.changed ) {
			text = result.text;
			fileChanged = true;
			changes.push({
				actor: doc.name,
				weapon: item.name,
				path: path.relative(ROOT, file).split(path.sep).join("/"),
				id: item._id
			});
		}
	}
	if ( fileChanged && WRITE ) fs.writeFileSync(file, text, "utf8");
}

const outDir = path.join(ROOT, "ai/audits/snv-monsters-compendium/n3/release-readiness");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
	path.join(outDir, "natural-classification-remediation.json"),
	`${JSON.stringify({ write: WRITE, count: changes.length, changes }, null, 2)}\n`,
	"utf8"
);
console.log(JSON.stringify({ write: WRITE, count: changes.length, changes }, null, 2));
if ( !WRITE && changes.length ) process.exitCode = 3;
