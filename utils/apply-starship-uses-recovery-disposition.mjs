#!/usr/bin/env node
/**
 * Apply approved Starship Uses/Recovery dispositions (Parts A/B).
 * Gate: live census must match locked expected totals before YAML edits.
 *
 * Usage:
 *   node utils/apply-starship-uses-recovery-disposition.mjs
 *   node utils/apply-starship-uses-recovery-disposition.mjs --apply
 *   node utils/apply-starship-uses-recovery-disposition.mjs --validate
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");
const VALIDATE = process.argv.includes("--validate");

const EMPTY_USES = {
	value: null,
	max: "",
	per: null,
	recovery: "",
	prompt: true
};
const EMPTY_RECHARGE = { value: null, charged: false };

const TEMPLATES = {
	"Pinpoint Strike": {
		standaloneId: "5izWUYBCKNHqUTg6",
		max: "@details.tier",
		per: "sr"
	},
	"Evasive Maneuvers": {
		standaloneId: "BsyAajkYG8yoCLvj",
		max: "2*@details.tier",
		per: "lr"
	}
};

const NO_USES = {
	Citadel: { standaloneId: "5o4AwUTPjDfloRjd" },
	"Paragon Dreadnought": { standaloneId: "D7omkkFZv6a0yePr" },
	"Hold Together": { standaloneId: "VyhLdoFj3hgjeqji" },
	"Boost Engines": { standaloneId: "cbGQLqMVWB7K5RI7" },
	"Boost Shields": { standaloneId: "Jmp4QznVg3PSEK86" },
	"Boost Weapons": { standaloneId: "S1bwJL9ZutRSvCxS" },
	Patch: { standaloneId: "o6Bt78NCyV0fYf1k" },
	"Regenerate Shields": { standaloneId: "qpDYc0VtdAwwu94e" },
	Search: { standaloneId: "OmVptlRbP2pvLoGG", missingStandalone: true }
};

/** Approximate plan totals — live census must match exactly. */
const EXPECT = {
	Citadel: { standalone: 1, drake: 0 },
	"Paragon Dreadnought": { standalone: 1, drake: 0 },
	"Hold Together": { standalone: 1, drake: 5 },
	"Boost Engines": { standalone: 1, drake: 103 },
	"Boost Shields": { standalone: 1, drake: 103 },
	"Boost Weapons": { standalone: 1, drake: 103 },
	Patch: { standalone: 1, drake: 103 },
	"Regenerate Shields": { standalone: 1, drake: 103 },
	Search: { standalone: 0, drake: 103 },
	"Pinpoint Strike": { standalone: 1, drake: 42, hasMax: 17, empty: 25 },
	"Evasive Maneuvers": { standalone: 1, drake: 19, hasMax: 13, empty: 6 }
};

function walk(dir, acc = []) {
	if ( !fs.existsSync(dir) ) return acc;
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const full = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walk(full, acc);
		else if ( /\.(yml|yaml)$/i.test(entry.name) ) acc.push(full);
	}
	return acc;
}

function loadDoc(file) {
	return yaml.load(fs.readFileSync(file, "utf8"));
}

function emptyMax(max) {
	return max == null || max === "" || String(max).trim() === "";
}

function provenanceMatches(itemOrRow, standaloneId) {
	const ids = [
		itemOrRow?.flags?.core?.sourceId,
		itemOrRow?._stats?.compendiumSource,
		itemOrRow?.sourceId,
		itemOrRow?.compendiumSource
	].filter(Boolean);
	if ( !ids.length ) return false;
	const needle = `Compendium.sw5e-module.starships.${standaloneId}`;
	return ids.some(s => s === needle || String(s).endsWith(`.${standaloneId}`) || String(s).includes(standaloneId));
}

function isTargetName(name) {
	return name in NO_USES || name in TEMPLATES;
}

function collectRows() {
	const rows = [];
	const dirs = [
		path.join(ROOT, "packs/_source/starships/starship-features"),
		path.join(ROOT, "packs/_source/starships/starship-actions")
	];
	for ( const dir of dirs ) {
		for ( const file of walk(dir) ) {
			const doc = loadDoc(file);
			if ( !doc?.name || !isTargetName(doc.name) ) continue;
			if ( String(doc._key || "").includes("folders") ) continue;
			rows.push({
				corpus: "standalone",
				name: doc.name,
				id: doc._id,
				file: path.relative(ROOT, file).replace(/\\/g, "/"),
				abs: file,
				uses: doc.system?.uses ?? null,
				recharge: doc.system?.recharge ?? null,
				sourceId: doc.flags?.core?.sourceId ?? null,
				compendiumSource: doc._stats?.compendiumSource ?? null,
				desc: doc.system?.description?.value ?? "",
				effects: doc.effects ?? [],
				activities: doc.system?.activities ?? null
			});
		}
	}
	for ( const file of walk(path.join(ROOT, "packs/_source/drakes-shipyard")) ) {
		const doc = loadDoc(file);
		if ( !Array.isArray(doc?.items) ) continue;
		for ( const item of doc.items ) {
			if ( !item?.name || !isTargetName(item.name) ) continue;
			rows.push({
				corpus: "drake",
				name: item.name,
				id: item._id,
				file: path.relative(ROOT, file).replace(/\\/g, "/"),
				abs: file,
				parentId: doc._id,
				parentName: doc.name,
				uses: item.system?.uses ?? null,
				recharge: item.system?.recharge ?? null,
				sourceId: item.flags?.core?.sourceId ?? null,
				compendiumSource: item._stats?.compendiumSource ?? null,
				desc: item.system?.description?.value ?? "",
				effects: item.effects ?? [],
				activities: item.system?.activities ?? null
			});
		}
	}
	return rows;
}

function classifyRow(row) {
	if ( row.name in NO_USES ) {
		const cfg = NO_USES[row.name];
		const provenanceOk = row.corpus === "standalone"
			? row.id === cfg.standaloneId || cfg.missingStandalone
			: provenanceMatches(row, cfg.standaloneId);
		const needs = !(
			emptyMax(row.uses?.max)
			&& (row.uses?.per == null || row.uses?.per === "")
			&& (row.recharge?.value == null)
			&& row.recharge?.charged === false
		);
		return {
			action: "noUses",
			provenanceOk,
			correctionRequired: provenanceOk && needs,
			skipReason: provenanceOk ? null : "missing_or_contradictory_provenance",
			expectedMax: "",
			expectedPer: null
		};
	}
	const cfg = TEMPLATES[row.name];
	const provenanceOk = row.corpus === "standalone"
		? row.id === cfg.standaloneId
		: provenanceMatches(row, cfg.standaloneId);
	if ( !provenanceOk ) {
		return {
			action: "limited",
			provenanceOk: false,
			correctionRequired: false,
			skipReason: "missing_or_contradictory_provenance",
			expectedMax: cfg.max,
			expectedPer: cfg.per
		};
	}
	const maxOk = String(row.uses?.max ?? "") === cfg.max;
	const perOk = row.uses?.per === cfg.per;
	const needsRestore = emptyMax(row.uses?.max);
	const correctionRequired = needsRestore || !maxOk || !perOk;
	return {
		action: "limited",
		provenanceOk: true,
		correctionRequired,
		needsRestore,
		skipReason: null,
		expectedMax: cfg.max,
		expectedPer: cfg.per
	};
}

function buildLedger(rows) {
	return rows.map(row => ({ ...row, ...classifyRow(row) }));
}

function gateLedger(ledger) {
	const failures = [];
	const byName = {};
	for ( const row of ledger ) {
		if ( !byName[row.name] ) byName[row.name] = [];
		byName[row.name].push(row);
	}
	for ( const [name, expect] of Object.entries(EXPECT) ) {
		const all = byName[name] ?? [];
		const standalone = all.filter(r => r.corpus === "standalone");
		const drake = all.filter(r => r.corpus === "drake");
		if ( standalone.length !== expect.standalone ) {
			failures.push(`${name}: standalone ${standalone.length} != ${expect.standalone}`);
		}
		if ( drake.length !== expect.drake ) {
			failures.push(`${name}: drake ${drake.length} != ${expect.drake}`);
		}
		if ( expect.hasMax != null ) {
			const hasMax = drake.filter(r => !emptyMax(r.uses?.max)).length;
			const empty = drake.filter(r => emptyMax(r.uses?.max)).length;
			const alreadyCorrected = all.every(r => !r.correctionRequired && !r.skipReason);
			if ( alreadyCorrected ) {
				// Post-apply: every Drake embed must have the restored max.
				if ( empty !== 0 ) failures.push(`${name}: post-apply empty ${empty} != 0`);
				if ( hasMax !== expect.drake ) failures.push(`${name}: post-apply hasMax ${hasMax} != ${expect.drake}`);
			} else {
				if ( hasMax !== expect.hasMax ) failures.push(`${name}: hasMax ${hasMax} != ${expect.hasMax}`);
				if ( empty !== expect.empty ) failures.push(`${name}: empty ${empty} != ${expect.empty}`);
			}
		}
		for ( const row of all ) {
			if ( row.name in TEMPLATES && row.corpus === "standalone" ) {
				const cfg = TEMPLATES[row.name];
				if ( String(row.uses?.max ?? "") !== cfg.max ) {
					failures.push(`${name} standalone max ${row.uses?.max} != ${cfg.max}`);
				}
			}
			if ( row.name in NO_USES && row.corpus === "standalone" && !NO_USES[row.name].missingStandalone ) {
				if ( row.id !== NO_USES[row.name].standaloneId ) {
					failures.push(`${name} standalone id mismatch`);
				}
			}
		}
		const badProv = all.filter(r => r.corpus === "drake" && !r.provenanceOk);
		if ( badProv.length ) {
			failures.push(`${name}: ${badProv.length} provenance failures`);
		}
	}
	return failures;
}

function findItemRegion(fileText, itemId) {
	const idRe = new RegExp(`(^|\\n)([ \\t]*-?[ \\t]*)_id:[ \\t]*${itemId}\\b`);
	const match = idRe.exec(fileText);
	if ( !match ) throw new Error(`Could not locate _id ${itemId}`);
	const lineStart = match.index + (match[1] ? match[1].length : 0);
	const marker = match[2] ?? "";
	const isListItem = marker.includes("-");
	const start = lineStart;
	const rest = fileText.slice(start);
	let endOffset = rest.length;
	if ( isListItem ) {
		const next = /\n[ \t]*-[ \t]*_id:/.exec(rest.slice(1));
		if ( next ) endOffset = 1 + next.index;
	}
	return { start, end: start + endOffset, isListItem };
}

function indentOfUses(region) {
	const m = /(^|\n)([ \t]*)uses:\s*\n/.exec(region);
	if ( !m ) return null;
	return m[2];
}

function replaceUsesBlock(region, usesObj) {
	const ind = indentOfUses(region);
	if ( ind == null ) throw new Error("uses: block not found");
	const child = `${ind}  `;
	const block = `${ind}uses:\n`
		+ `${child}value: ${usesObj.value === null ? "null" : usesObj.value}\n`
		+ `${child}max: ${formatYamlScalar(usesObj.max)}\n`
		+ `${child}per: ${usesObj.per === null ? "null" : usesObj.per}\n`
		+ `${child}recovery: ${formatYamlScalar(usesObj.recovery ?? "")}\n`
		+ `${child}prompt: ${usesObj.prompt === false ? "false" : "true"}`;
	const re = new RegExp(
		`(^|\\n)([ \\t]*)uses:\\s*\\n`
		+ `(?:[ \\t]+(?:value|max|per|recovery|prompt):[^\\n]*\\n)+`
	);
	if ( !re.test(region) ) throw new Error("could not match uses block");
	return region.replace(re, `$1${block}\n`);
}

function replaceRechargeBlock(region, rechargeObj) {
	const m = /(^|\n)([ \t]*)recharge:\s*\n(?:[ \t]+(?:value|charged):[^\n]*\n)+/.exec(region);
	if ( !m ) {
		// Insert after uses block if missing
		const usesEnd = /(^|\n)([ \t]*)uses:\s*\n(?:[ \t]+(?:value|max|per|recovery|prompt):[^\n]*\n)+/.exec(region);
		if ( !usesEnd ) throw new Error("recharge missing and uses not found");
		const ind = usesEnd[2];
		const insert = `${ind}recharge:\n${ind}  value: ${rechargeObj.value === null ? "null" : rechargeObj.value}\n${ind}  charged: ${rechargeObj.charged ? "true" : "false"}\n`;
		const at = usesEnd.index + usesEnd[0].length;
		return region.slice(0, at) + insert + region.slice(at);
	}
	const ind = m[2];
	const block = `${ind}recharge:\n${ind}  value: ${rechargeObj.value === null ? "null" : rechargeObj.value}\n${ind}  charged: ${rechargeObj.charged ? "true" : "false"}\n`;
	return region.slice(0, m.index) + (m[1] || "") + block + region.slice(m.index + m[0].length);
}

function formatYamlScalar(value) {
	if ( value === null || value === undefined ) return "null";
	if ( value === "" ) return "''";
	const s = String(value);
	if ( /[@*:\n'"#]/.test(s) || s.includes(" ") ) {
		if ( s.includes("'") ) return `"${s.replace(/"/g, '\\"')}"`;
		return `'${s}'`;
	}
	return s;
}

function patchRowInFile(fileText, row) {
	const { start, end } = findItemRegion(fileText, row.id);
	let region = fileText.slice(start, end);

	if ( row.action === "noUses" ) {
		region = replaceUsesBlock(region, { ...EMPTY_USES });
		region = replaceRechargeBlock(region, { ...EMPTY_RECHARGE });
	} else if ( row.action === "limited" ) {
		const nextUses = {
			value: row.uses?.value ?? null,
			max: row.expectedMax,
			per: row.expectedPer,
			recovery: "",
			prompt: row.uses?.prompt !== false
		};
		region = replaceUsesBlock(region, nextUses);
		// Ensure no native recharge leftover on these features
		if ( row.recharge && (row.recharge.value != null || row.recharge.charged) ) {
			region = replaceRechargeBlock(region, { ...EMPTY_RECHARGE });
		}
	} else {
		throw new Error(`unknown action for ${row.id}`);
	}

	return fileText.slice(0, start) + region + fileText.slice(end);
}

function validateAfter(ledger) {
	const failures = [];
	const counts = {
		noUses: {},
		pinpoint: { total: 0, sr: 0, restored: 0 },
		evasive: { total: 0, lr: 0, restored: 0 },
		skipped: []
	};

	for ( const row of ledger ) {
		if ( row.skipReason ) {
			counts.skipped.push({ name: row.name, id: row.id, file: row.file, reason: row.skipReason });
			continue;
		}
		const doc = loadDoc(row.abs);
		let item = doc;
		if ( row.corpus === "drake" ) {
			item = (doc.items || []).find(i => i._id === row.id);
		}
		if ( !item ) {
			failures.push(`missing ${row.id} in ${row.file}`);
			continue;
		}
		if ( item.name !== row.name ) failures.push(`${row.id}: name changed`);
		if ( (item.system?.description?.value ?? "") !== row.desc ) {
			failures.push(`${row.id}: description changed`);
		}

		if ( row.action === "noUses" ) {
			const u = item.system?.uses ?? {};
			const r = item.system?.recharge ?? {};
			if ( !emptyMax(u.max) || u.per != null ) failures.push(`${row.id}: uses not cleared`);
			if ( r.value != null || r.charged ) failures.push(`${row.id}: recharge not cleared`);
			counts.noUses[row.name] = (counts.noUses[row.name] || 0) + 1;
		} else {
			const u = item.system?.uses ?? {};
			if ( String(u.max ?? "") !== row.expectedMax ) {
				failures.push(`${row.id}: max ${u.max} != ${row.expectedMax}`);
			}
			if ( u.per !== row.expectedPer ) {
				failures.push(`${row.id}: per ${u.per} != ${row.expectedPer}`);
			}
			if ( Array.isArray(u.recovery) ) failures.push(`${row.id}: modern recovery[] introduced`);
			if ( row.name === "Pinpoint Strike" ) {
				counts.pinpoint.total += 1;
				if ( u.per === "sr" ) counts.pinpoint.sr += 1;
				if ( row.needsRestore ) counts.pinpoint.restored += 1;
			}
			if ( row.name === "Evasive Maneuvers" ) {
				counts.evasive.total += 1;
				if ( u.per === "lr" ) counts.evasive.lr += 1;
				if ( row.needsRestore ) counts.evasive.restored += 1;
			}
		}
	}
	return { failures, counts };
}

const rows = collectRows();
const ledger = buildLedger(rows);
const gateFailures = gateLedger(ledger);

const summary = {
	totalRows: ledger.length,
	correctionRequired: ledger.filter(r => r.correctionRequired).length,
	skipped: ledger.filter(r => r.skipReason).length,
	byName: Object.fromEntries(
		Object.keys(EXPECT).map(name => {
			const all = ledger.filter(r => r.name === name);
			return [name, {
				total: all.length,
				standalone: all.filter(r => r.corpus === "standalone").length,
				drake: all.filter(r => r.corpus === "drake").length,
				toCorrect: all.filter(r => r.correctionRequired).length,
				skipped: all.filter(r => r.skipReason).length
			}];
		})
	)
};

console.log(JSON.stringify({ summary, gateFailures }, null, 2));

if ( gateFailures.length ) {
	console.error("CENSUS GATE FAILED — refusing to edit YAML");
	for ( const f of gateFailures ) console.error(` - ${f}`);
	process.exit(2);
}

if ( VALIDATE && !APPLY ) {
	const v = validateAfter(ledger);
	if ( v.failures.length ) {
		console.error("VALIDATION FAILED");
		for ( const f of v.failures ) console.error(` - ${f}`);
		process.exit(3);
	}
	console.log(JSON.stringify({ validated: true, counts: v.counts }, null, 2));
	process.exit(0);
}

if ( !APPLY ) {
	console.log("Census gate passed. Re-run with --apply to write YAML.");
	process.exit(0);
}

const targets = ledger.filter(r => r.correctionRequired);
const byFile = new Map();
for ( const row of targets ) {
	if ( !byFile.has(row.abs) ) byFile.set(row.abs, []);
	byFile.get(row.abs).push(row);
}

let filesChanged = 0;
let rowsPatched = 0;
for ( const [abs, fileRows] of byFile ) {
	let text = fs.readFileSync(abs, "utf8");
	for ( const row of fileRows ) {
		text = patchRowInFile(text, row);
		rowsPatched += 1;
	}
	fs.writeFileSync(abs, text);
	filesChanged += 1;
}

const v = validateAfter(ledger);
if ( v.failures.length ) {
	console.error("POST-APPLY VALIDATION FAILED");
	for ( const f of v.failures ) console.error(` - ${f}`);
	process.exit(3);
}

console.log(JSON.stringify({
	applied: true,
	filesChangedThisRun: filesChanged,
	rowsPatchedThisRun: rowsPatched,
	counts: v.counts,
	skipped: v.counts.skipped
}, null, 2));
