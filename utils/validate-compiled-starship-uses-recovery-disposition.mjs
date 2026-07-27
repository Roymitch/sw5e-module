#!/usr/bin/env node
/**
 * Read-only compiled-pack census for Starship Uses/Recovery dispositions.
 *
 * Prefer a filesystem snapshot when Foundry holds live pack LOCKs:
 *   node utils/validate-compiled-starship-uses-recovery-disposition.mjs --pack-root=<snapshot>
 *
 * Default --pack-root is ./packs (may fail if Foundry has packs open).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK_ROOT = process.argv.find(a => a.startsWith("--pack-root="))?.slice("--pack-root=".length)
	?? path.join(ROOT, "packs");

const NO_USES = new Set([
	"Citadel",
	"Paragon Dreadnought",
	"Hold Together",
	"Boost Engines",
	"Boost Shields",
	"Boost Weapons",
	"Patch",
	"Regenerate Shields",
	"Search"
]);

const EXPECT = {
	Citadel: 1,
	"Paragon Dreadnought": 1,
	"Hold Together": 6,
	"Boost Engines": 104,
	"Boost Shields": 104,
	"Boost Weapons": 104,
	Patch: 104,
	"Regenerate Shields": 104,
	Search: 103,
	"Pinpoint Strike": 43,
	"Evasive Maneuvers": 20
};

const PINPOINT_IDS = { standalone: "5izWUYBCKNHqUTg6" };
const EVASIVE_IDS = { standalone: "BsyAajkYG8yoCLvj" };
const SEARCH_SOURCE = "OmVptlRbP2pvLoGG";

function emptyMax(max) {
	return max == null || max === "" || String(max).trim() === "";
}

function isNoUsesShape(uses, recharge) {
	const recoveryOk = uses?.recovery === "" || uses?.recovery == null
		|| (Array.isArray(uses?.recovery) && uses.recovery.length === 0);
	return emptyMax(uses?.max)
		&& (uses?.per == null || uses?.per === "")
		&& recoveryOk
		&& (recharge?.value == null)
		&& !recharge?.charged;
}

function evalTierMax(formula, tier) {
	const expr = String(formula).replaceAll("@details.tier", String(tier));
	// eslint-disable-next-line no-new-func
	return Function(`"use strict"; return (${expr});`)();
}

async function scanPack(packName, buckets) {
	const dbPath = path.join(PACK_ROOT, packName);
	const db = new ClassicLevel(dbPath, {
		keyEncoding: "utf8",
		valueEncoding: "json",
		createIfMissing: false
	});

	let docs = 0;
	let searchStandalone = 0;
	const syntheticHits = [];

	for await (const [key, value] of db.iterator()) {
		docs += 1;
		if ( value?.name === "nativeRecharge001" || value?._id === "nativeRecharge001" ) {
			syntheticHits.push({ pack: packName, key });
		}

		const consider = (item, corpus, actor) => {
			if ( !item?.name || !(item.name in EXPECT) ) return;
			const row = {
				pack: packName,
				corpus,
				key,
				id: item._id,
				name: item.name,
				actorId: actor?._id ?? null,
				actorName: actor?.name ?? null,
				uses: item.system?.uses ?? null,
				recharge: item.system?.recharge ?? null,
				sourceId: item.flags?.core?.sourceId ?? item._stats?.compendiumSource ?? null,
				hasActivities: !!(item.system?.activities && Object.keys(item.system.activities).length),
				effectsCount: Array.isArray(item.effects) ? item.effects.length : 0,
				descLen: String(item.system?.description?.value ?? "").length
			};
			buckets[item.name].rows.push(row);

			if ( item.name === "Search" && corpus === "standalone" ) searchStandalone += 1;
		};

		// Foundry LevelDB key shapes:
		//   !items!<id>              standalone Item
		//   !actors.items!<a>.<i>    embedded Item document
		//   !actors!<id>             Actor (may also nest items[])
		if ( typeof key === "string" && key.startsWith("!actors.items!") ) {
			consider(value, "embedded", { _id: key.split("!")[2]?.split(".")[0] ?? null });
			continue;
		}
		if ( typeof key === "string" && key.startsWith("!items!") ) {
			consider(value, "standalone", null);
			continue;
		}
		if ( Array.isArray(value?.items) && typeof key === "string" && key.startsWith("!actors!") ) {
			// Prefer !actors.items! rows; skip nested to avoid double-count.
			continue;
		}
	}

	await db.close();
	return { docs, searchStandalone, syntheticHits };
}

function classifyBuckets(buckets) {
	const report = {};
	const failures = [];

	for ( const [name, expectTotal] of Object.entries(EXPECT) ) {
		const rows = buckets[name].rows;
		const entry = {
			total: rows.length,
			expect: expectTotal,
			standalone: rows.filter(r => r.corpus === "standalone").length,
			embedded: rows.filter(r => r.corpus === "embedded").length,
			ok: 0,
			bad: []
		};

		for ( const row of rows ) {
			if ( NO_USES.has(name) ) {
				if ( isNoUsesShape(row.uses, row.recharge) ) entry.ok += 1;
				else entry.bad.push({
					id: row.id,
					actorId: row.actorId,
					uses: row.uses,
					recharge: row.recharge
				});
			} else if ( name === "Pinpoint Strike" ) {
				const ok = String(row.uses?.max ?? "") === "@details.tier"
					&& row.uses?.per === "sr"
					&& !Array.isArray(row.uses?.recovery);
				if ( ok ) entry.ok += 1;
				else entry.bad.push({ id: row.id, max: row.uses?.max, per: row.uses?.per, recovery: row.uses?.recovery });
			} else if ( name === "Evasive Maneuvers" ) {
				const ok = String(row.uses?.max ?? "") === "2*@details.tier"
					&& row.uses?.per === "lr"
					&& !Array.isArray(row.uses?.recovery);
				if ( ok ) entry.ok += 1;
				else entry.bad.push({ id: row.id, max: row.uses?.max, per: row.uses?.per, recovery: row.uses?.recovery });
			}
		}

		if ( entry.total !== expectTotal ) {
			failures.push(`${name}: total ${entry.total} != ${expectTotal}`);
		}
		if ( entry.ok !== entry.total ) {
			failures.push(`${name}: shape ok ${entry.ok}/${entry.total}`);
		}
		report[name] = entry;
	}

	return { report, failures };
}

const buckets = Object.fromEntries(Object.keys(EXPECT).map(n => [n, { rows: [] }]));
const packMeta = {};
for ( const pack of ["starships", "drakes-shipyard"] ) {
	packMeta[pack] = await scanPack(pack, buckets);
}

const { report, failures } = classifyBuckets(buckets);

// Tier-zero / prepared max checks against formulas (offline, no Foundry prep)
const tierChecks = {
	pinpoint: {
		formula: "@details.tier",
		t0: evalTierMax("@details.tier", 0),
		t1: evalTierMax("@details.tier", 1),
		t3: evalTierMax("@details.tier", 3)
	},
	evasive: {
		formula: "2*@details.tier",
		t0: evalTierMax("2*@details.tier", 0),
		t1: evalTierMax("2*@details.tier", 1),
		t3: evalTierMax("2*@details.tier", 3)
	}
};
if ( tierChecks.pinpoint.t0 !== 0 || tierChecks.pinpoint.t1 !== 1 || tierChecks.pinpoint.t3 !== 3 ) {
	failures.push("Pinpoint tier evaluation mismatch");
}
if ( tierChecks.evasive.t0 !== 0 || tierChecks.evasive.t1 !== 2 || tierChecks.evasive.t3 !== 6 ) {
	failures.push("Evasive tier evaluation mismatch");
}

const searchStandalone = (packMeta.starships.searchStandalone ?? 0)
	+ (packMeta["drakes-shipyard"].searchStandalone ?? 0);
if ( searchStandalone !== 0 ) failures.push(`Search standalone unexpectedly present: ${searchStandalone}`);

const synthetic = [
	...(packMeta.starships.syntheticHits ?? []),
	...(packMeta["drakes-shipyard"].syntheticHits ?? [])
];
if ( synthetic.length ) failures.push(`synthetic nativeRecharge001 found in packs: ${synthetic.length}`);

// Spot-check known standalone IDs present
const citadel = buckets.Citadel.rows.find(r => r.id === "5o4AwUTPjDfloRjd");
const pinpoint = buckets["Pinpoint Strike"].rows.find(r => r.id === PINPOINT_IDS.standalone);
const evasive = buckets["Evasive Maneuvers"].rows.find(r => r.id === EVASIVE_IDS.standalone);
if ( !citadel ) failures.push("Citadel standalone id missing from compiled packs");
if ( !pinpoint ) failures.push("Pinpoint standalone id missing");
if ( !evasive ) failures.push("Evasive standalone id missing");

const passed = failures.length === 0;
console.log(JSON.stringify({
	packRoot: PACK_ROOT,
	passed,
	failures,
	packMeta: {
		starships: { docs: packMeta.starships.docs },
		"drakes-shipyard": { docs: packMeta["drakes-shipyard"].docs }
	},
	counts: Object.fromEntries(Object.entries(report).map(([k, v]) => [k, {
		total: v.total,
		expect: v.expect,
		standalone: v.standalone,
		embedded: v.embedded,
		ok: v.ok,
		bad: v.bad.length
	}])),
	tierChecks,
	searchStandalone,
	syntheticInPacks: synthetic.length,
	spot: {
		citadelUses: citadel?.uses ?? null,
		citadelRecharge: citadel?.recharge ?? null,
		pinpointUses: pinpoint?.uses ?? null,
		evasiveUses: evasive?.uses ?? null
	}
}, null, 2));

process.exit(passed ? 0 : 3);
