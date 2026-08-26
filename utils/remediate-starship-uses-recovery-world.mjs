#!/usr/bin/env node
/**
 * World remediation for Starship Uses/Recovery dispositions.
 *
 * Modes:
 *   --dry-run   Report proposed changes only
 *   --apply     Mutate world Item documents (requires Foundry stopped + live world path)
 *
 * Required:
 *   --world=<absolute-path>   World directory OR verified offline snapshot
 *
 * Safety:
 *   - Refuses without --world=
 *   - Refuses live Data/worlds path while Foundry is running
 *   - --apply refused while Foundry is running
 *   - --apply only against live world path (not temp snapshots)
 *   - Never matches by name alone
 *
 * Usage:
 *   node utils/remediate-starship-uses-recovery-world.mjs --dry-run --world=C:/path/to/world
 *   node utils/remediate-starship-uses-recovery-world.mjs --dry-run --world=C:/snapshots/world --allow-offline-snapshot
 *   node utils/remediate-starship-uses-recovery-world.mjs --apply --world=C:/Users/.../Data/worlds/vanilla
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";
import { ClassicLevel } from "classic-level";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const ALLOW_SNAPSHOT = process.argv.includes("--allow-offline-snapshot");
const WORLD_ARG = process.argv.find(a => a.startsWith("--world="))?.slice("--world=".length);

/** Disposition ledger (Parts A/B). */
const DISPOSITION = {
	"5o4AwUTPjDfloRjd": { name: "Citadel", action: "noUses", bucket: "disposition" },
	"D7omkkFZv6a0yePr": { name: "Paragon Dreadnought", action: "noUses", bucket: "disposition" },
	"VyhLdoFj3hgjeqji": { name: "Hold Together", action: "noUses", bucket: "disposition" },
	"cbGQLqMVWB7K5RI7": { name: "Boost Engines", action: "noUses", bucket: "disposition" },
	"Jmp4QznVg3PSEK86": { name: "Boost Shields", action: "noUses", bucket: "disposition" },
	"S1bwJL9ZutRSvCxS": { name: "Boost Weapons", action: "noUses", bucket: "disposition" },
	"o6Bt78NCyV0fYf1k": { name: "Patch", action: "noUses", bucket: "disposition" },
	"qpDYc0VtdAwwu94e": { name: "Regenerate Shields", action: "noUses", bucket: "disposition" },
	"OmVptlRbP2pvLoGG": { name: "Search", action: "noUses", bucket: "disposition" },
	"5izWUYBCKNHqUTg6": {
		name: "Pinpoint Strike",
		action: "sr",
		max: "@details.tier",
		bucket: "pinpoint"
	},
	"BsyAajkYG8yoCLvj": {
		name: "Evasive Maneuvers",
		action: "lr",
		max: "2*@details.tier",
		bucket: "evasive"
	}
};

function isFoundryRunning() {
	if ( process.platform === "win32" ) {
		const r = spawnSync("powershell", [
			"-NoProfile",
			"-Command",
			"Get-Process -Name '*Foundry*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName"
		], { encoding: "utf8" });
		return Boolean(r.stdout && r.stdout.trim());
	}
	const r = spawnSync("pgrep", ["-fi", "Foundry"], { encoding: "utf8" });
	return r.status === 0 && Boolean(r.stdout && r.stdout.trim());
}

function looksLikeLiveWorldPath(worldPath) {
	const norm = worldPath.replace(/\\/g, "/").toLowerCase();
	return /\/foundryvtt\/data\/worlds\//.test(norm);
}

function isWorldDirectory(worldPath) {
	return fs.existsSync(path.join(worldPath, "world.json"));
}

function walk(dir, acc = []) {
	if ( !fs.existsSync(dir) ) return acc;
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const full = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walk(full, acc);
		else if ( /\.(yml|yaml)$/i.test(entry.name) ) acc.push(full);
	}
	return acc;
}

function plainDesc(system) {
	const d = system?.description?.value ?? system?.description ?? "";
	return String(d).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function classifyPeriodWording(text) {
	const t = text.toLowerCase();
	const roll = (
		/recharge\s*\d|recharge\s*[5-6]|recharge\s*5\s*[–-]\s*6|recharge \[/.test(t)
		|| (/roll a d6/.test(t) && /recharge|regain/.test(t))
		|| /regains this use on a roll|on a recharge of/.test(t)
	) && !/undergoes recharging|when the ship recharges|until the ship recharges|ship undergoes recharging|undergoes refitting|ship is refitted/.test(t);
	const shipRe = /undergoes recharging|when the ship recharges|until the ship recharges|after the ship recharges|when the ship undergoes recharging|regained when the ship undergoes recharging|all expended uses are regained when the ship recharges/.test(t)
		|| (/\brecharges\b/.test(t) && /(expended|use|uses|regain|can't be used|cannot be used)/.test(t));
	const shipRf = /undergoes refitting|until the ship undergoes refitting|when the ship undergoes refitting|when the ship is refitted|until the ship is refitted|after the ship refits|all expended uses are regained when the ship is refitted/.test(t);
	if ( roll ) return null;
	if ( shipRe ) return "sr";
	if ( shipRf ) return "lr";
	return null;
}

/**
 * Prior approved 103 remaps: standalone feature IDs whose source is now sr/lr
 * from ship-rest wording (excludes disposition noUses / pinpoint / evasive handled above).
 */
function buildPriorPeriodLedger() {
	const map = {};
	for ( const file of walk(path.join(ROOT, "packs/_source/starships/starship-features")) ) {
		const doc = yaml.load(fs.readFileSync(file, "utf8"));
		if ( !doc?._id || doc.type !== "feat" ) continue;
		if ( DISPOSITION[doc._id] ) continue;
		const expected = classifyPeriodWording(plainDesc(doc.system));
		const per = doc.system?.uses?.per ?? null;
		if ( !expected || per !== expected ) continue;
		map[doc._id] = {
			name: doc.name,
			action: expected,
			max: doc.system?.uses?.max ?? null,
			bucket: "prior_period"
		};
	}
	return map;
}

const PRIOR_PERIOD = buildPriorPeriodLedger();

function ledgerForStandaloneId(id) {
	return DISPOSITION[id] ?? PRIOR_PERIOD[id] ?? null;
}

function extractStandaloneId(sourceRef, itemId) {
	if ( itemId && ledgerForStandaloneId(itemId) ) return itemId;
	if ( !sourceRef ) return null;
	const s = String(sourceRef);
	const candidates = [...Object.keys(DISPOSITION), ...Object.keys(PRIOR_PERIOD)];
	for ( const id of candidates ) {
		if ( s.includes(id) ) return id;
	}
	return null;
}

function emptyMax(max) {
	return max == null || max === "" || String(max).trim() === "";
}

function isStarshipActor(actor) {
	if ( actor?.type !== "vehicle" ) return false;
	const flags = actor.flags?.["sw5e-module"] ?? actor.flags?.sw5e ?? {};
	return flags?.legacyStarshipActor?.type === "starship"
		|| flags?.starship === true
		|| actor.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

function currentRecovery(item) {
	const uses = item.system?.uses ?? {};
	const recovery = uses.recovery;
	let period = uses.per ?? null;
	let formula = null;
	if ( Array.isArray(recovery) && recovery.length ) {
		period = recovery[0]?.period ?? period;
		formula = recovery[0]?.formula ?? null;
	}
	const recharge = item.system?.recharge ?? {};
	return {
		max: uses.max ?? null,
		spent: uses.spent ?? uses.value ?? null,
		period,
		formula,
		rechargeValue: recharge.value ?? null,
		rechargeCharged: recharge.charged ?? null,
		rawRecovery: recovery ?? null
	};
}

function classifyItem(actor, item) {
	const sourceId = item.flags?.core?.sourceId ?? item._stats?.compendiumSource ?? null;
	const standaloneId = extractStandaloneId(sourceId, item._id);
	const ledger = standaloneId ? ledgerForStandaloneId(standaloneId) : null;
	const cur = currentRecovery(item);

	const base = {
		actorName: actor.name,
		actorId: actor._id,
		itemName: item.name,
		itemId: item._id,
		sourceId,
		standaloneId,
		currentMax: cur.max,
		currentSpent: cur.spent,
		currentPeriod: cur.period,
		currentFormula: cur.formula,
		currentRecharge: { value: cur.rechargeValue, charged: cur.rechargeCharged },
		matchEvidence: [],
		confidence: "low",
		ledgerBucket: ledger?.bucket ?? null
	};

	if ( !isStarshipActor(actor) ) {
		return { ...base, category: "skipped", proposed: "No change", reason: "parent_not_starship", confidence: "high" };
	}
	base.matchEvidence.push("parent_starship");

	if ( !ledger ) {
		return {
			...base,
			category: "ambiguous_homebrew_skipped",
			proposed: "No change",
			reason: "no_verified_provenance",
			confidence: "high"
		};
	}

	base.matchEvidence.push(item._id === standaloneId ? "item_id_ledger" : `sourceId→${standaloneId}`);
	base.matchEvidence.push(`ledger:${ledger.action}:${ledger.bucket}`);
	base.confidence = "high";

	if ( ledger.action === "noUses" ) {
		const already = emptyMax(cur.max)
			&& (cur.period == null || cur.period === "")
			&& cur.rechargeValue == null
			&& !cur.rechargeCharged
			&& !(Array.isArray(cur.rawRecovery) && cur.rawRecovery.length);
		if ( already ) {
			return { ...base, category: "already_correct", proposed: "No change" };
		}
		return {
			...base,
			category: "remove_uses_recovery",
			proposed: "Clear Item-level uses + recharge to proven no-Uses shape"
		};
	}

	if ( ledger.action === "sr" || ledger.action === "lr" ) {
		const requireMax = ledger.max != null && ledger.max !== "";
		const maxOk = !requireMax || String(cur.max ?? "") === String(ledger.max);
		const periodOk = cur.period === ledger.action;
		const noNativeFormula = !(cur.formula != null && String(cur.formula) !== "" && cur.period === "recharge");
		// Native recharge formula present when period is still recharge
		const stillNativeRecharge = cur.period === "recharge";
		if ( maxOk && periodOk && !stillNativeRecharge ) {
			return { ...base, category: "already_correct", proposed: "No change" };
		}
		const category = ledger.bucket === "pinpoint"
			? "restore_pinpoint_sr"
			: ledger.bucket === "evasive"
				? "restore_evasive_lr"
				: (ledger.action === "sr" ? "prior_set_sr" : "prior_set_lr");
		return {
			...base,
			category,
			proposed: requireMax && !maxOk
				? `Restore max to ${ledger.max}; set period to ${ledger.action}; preserve spent`
				: `Set recovery period to ${ledger.action}; preserve max/spent`
		};
	}

	return { ...base, category: "skipped", proposed: "No change", reason: "unhandled" };
}

async function loadActorsFromLevelDB(dbPath) {
	const db = new ClassicLevel(dbPath, {
		keyEncoding: "utf8",
		valueEncoding: "json",
		createIfMissing: false
	});
	const actorsById = new Map();

	for await (const [key, value] of db.iterator()) {
		if ( typeof key === "string" && key.startsWith("!actors!") && !key.startsWith("!actors.items!") ) {
			actorsById.set(value._id, { ...value, items: [] });
		}
	}
	for await (const [key, value] of db.iterator()) {
		if ( typeof key !== "string" || !key.startsWith("!actors.items!") ) continue;
		const rest = key.slice("!actors.items!".length);
		const dot = rest.indexOf(".");
		if ( dot < 0 ) continue;
		const actorId = rest.slice(0, dot);
		const actor = actorsById.get(actorId);
		if ( actor ) {
			value.__dbKey = key;
			actor.items.push(value);
		}
	}
	await db.close();
	return [...actorsById.values()];
}

function actorsDbPath(worldPath) {
	const candidates = [
		path.join(worldPath, "data", "actors"),
		path.join(worldPath, "actors")
	];
	for ( const dbPath of candidates ) {
		if ( !fs.existsSync(dbPath) ) continue;
		const hasLevel = fs.existsSync(path.join(dbPath, "CURRENT"))
			|| fs.readdirSync(dbPath).some(f => f.endsWith(".ldb") || f.endsWith(".log"));
		if ( hasLevel ) return dbPath;
	}
	return null;
}

async function loadActorsFromWorld(worldPath) {
	const dbPath = actorsDbPath(worldPath);
	if ( dbPath ) return loadActorsFromLevelDB(dbPath);

	const candidates = [
		path.join(worldPath, "data", "actors"),
		path.join(worldPath, "actors")
	];
	for ( const dir of candidates ) {
		if ( !fs.existsSync(dir) ) continue;
		const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
		const actors = [];
		for ( const f of files ) {
			try {
				actors.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
			} catch { /* skip */ }
		}
		if ( actors.length ) return actors;
	}
	const actorsJson = path.join(worldPath, "actors.json");
	if ( fs.existsSync(actorsJson) ) {
		const raw = JSON.parse(fs.readFileSync(actorsJson, "utf8"));
		if ( Array.isArray(raw) ) return raw;
	}
	return [];
}

/**
 * Apply approved mutation to a world Item document (modern dnd5e recovery[] shape).
 * Preserves spent when limited uses remain; clears Uses/Recharge for noUses.
 */
function mutateItemDocument(item, ledger, category) {
	if ( !item.system ) item.system = {};
	const uses = item.system.uses ?? {};
	const spent = uses.spent ?? uses.value ?? 0;

	if ( category === "remove_uses_recovery" ) {
		item.system.uses = {
			...uses,
			value: null,
			max: "",
			spent: 0,
			per: null,
			recovery: [],
			prompt: uses.prompt !== false
		};
		item.system.recharge = { value: null, charged: false };
		return item;
	}

	if ( category === "restore_pinpoint_sr"
		|| category === "restore_evasive_lr"
		|| category === "prior_set_sr"
		|| category === "prior_set_lr" ) {
		const max = (ledger.max != null && ledger.max !== "")
			? ledger.max
			: (uses.max ?? "");
		item.system.uses = {
			...uses,
			max,
			spent,
			value: uses.value ?? null,
			per: null,
			recovery: [{ period: ledger.action, type: "recoverAll" }],
			prompt: uses.prompt !== false
		};
		delete item.system.uses.formula;
		if ( item.system.recharge ) {
			item.system.recharge = { value: null, charged: false };
		}
		return item;
	}
	return item;
}

async function applyProposals(worldPath, proposed) {
	const dbPath = actorsDbPath(worldPath);
	if ( !dbPath ) throw new Error("No LevelDB actors database found for apply");

	const db = new ClassicLevel(dbPath, {
		keyEncoding: "utf8",
		valueEncoding: "json",
		createIfMissing: false
	});

	const updatedActors = new Set();
	const updatedItems = [];
	const failures = [];

	for ( const row of proposed ) {
		const key = `!actors.items!${row.actorId}.${row.itemId}`;
		let item;
		try {
			item = await db.get(key);
		} catch ( err ) {
			failures.push({ key, error: `missing: ${err.message}`, row });
			continue;
		}

		// Re-validate identity before write
		const sourceId = item.flags?.core?.sourceId ?? item._stats?.compendiumSource ?? null;
		const standaloneId = extractStandaloneId(sourceId, item._id);
		const ledger = standaloneId ? ledgerForStandaloneId(standaloneId) : null;
		if ( !ledger || standaloneId !== row.standaloneId ) {
			failures.push({ key, error: "identity mismatch on apply", row });
			continue;
		}
		const reclass = classifyItem({
			_id: row.actorId,
			name: row.actorName,
			type: "vehicle",
			flags: { sw5e: { legacyStarshipActor: { type: "starship" } } },
			items: [item]
		}, item);
		if ( reclass.category !== row.category ) {
			failures.push({
				key,
				error: `category drift ${reclass.category} != ${row.category}`,
				row
			});
			continue;
		}

		const beforeId = item._id;
		const mutated = mutateItemDocument(item, ledger, row.category);
		if ( mutated._id !== beforeId ) {
			failures.push({ key, error: "item id changed", row });
			continue;
		}
		await db.put(key, mutated);
		updatedActors.add(row.actorId);
		updatedItems.push({
			actorId: row.actorId,
			actorName: row.actorName,
			itemId: row.itemId,
			itemName: row.itemName,
			category: row.category
		});
	}

	await db.close();
	return {
		actorsUpdated: updatedActors.size,
		itemsUpdated: updatedItems.length,
		updatedItems,
		failures
	};
}

function summarizeReports(reports) {
	const proposed = reports.filter(r => ![
		"already_correct",
		"ambiguous_homebrew_skipped",
		"skipped"
	].includes(r.category));
	const totals = {
		actorsScanned: null,
		remove_uses_recovery: reports.filter(r => r.category === "remove_uses_recovery").length,
		restore_pinpoint_sr: reports.filter(r => r.category === "restore_pinpoint_sr").length,
		restore_evasive_lr: reports.filter(r => r.category === "restore_evasive_lr").length,
		prior_set_sr: reports.filter(r => r.category === "prior_set_sr").length,
		prior_set_lr: reports.filter(r => r.category === "prior_set_lr").length,
		already_correct: reports.filter(r => r.category === "already_correct").length,
		ambiguous_homebrew_skipped: reports.filter(r => r.category === "ambiguous_homebrew_skipped").length,
		proposedTotal: proposed.length,
		priorPeriodLedgerSize: Object.keys(PRIOR_PERIOD).length
	};
	return { proposed, totals };
}

async function collectReports(actors) {
	const reports = [];
	for ( const actor of actors ) {
		for ( const item of actor.items ?? [] ) {
			const row = classifyItem(actor, item);
			if ( row.category === "skipped" && row.reason === "parent_not_starship" ) continue;
			if ( row.category === "ambiguous_homebrew_skipped" ) {
				const knownNames = new Set([
					...Object.values(DISPOSITION).map(v => v.name),
					...Object.values(PRIOR_PERIOD).map(v => v.name)
				]);
				if ( !knownNames.has(item.name) ) continue;
			}
			reports.push(row);
		}
	}
	return reports;
}

async function main() {
	if ( !WORLD_ARG ) {
		console.error("Refusing: --world=<absolute-path> is required.");
		process.exit(2);
	}

	const worldPath = path.resolve(WORLD_ARG);
	if ( !fs.existsSync(worldPath) ) {
		console.error(`Refusing: world path does not exist: ${worldPath}`);
		process.exit(2);
	}
	if ( !isWorldDirectory(worldPath) ) {
		console.error("Refusing: path is not a Foundry world directory (missing world.json).");
		process.exit(2);
	}

	const worldMeta = JSON.parse(fs.readFileSync(path.join(worldPath, "world.json"), "utf8"));
	const foundryRunning = isFoundryRunning();
	const livePath = looksLikeLiveWorldPath(worldPath);
	const inModuleWorkspace = worldPath.replace(/\\/g, "/").toLowerCase().includes("/sw5e-module/");
	const looksLikePack = /\/packs(\/|$)/i.test(worldPath.replace(/\\/g, "/"));

	if ( inModuleWorkspace ) {
		console.error("Refusing: path is inside the module workspace.");
		process.exit(2);
	}
	if ( looksLikePack ) {
		console.error("Refusing: path looks like a pack path, not a world.");
		process.exit(2);
	}

	if ( APPLY ) {
		if ( foundryRunning ) {
			console.error("Refusing --apply: FoundryVTT is still running. Stop Foundry fully first.");
			process.exit(2);
		}
		if ( !livePath ) {
			console.error("Refusing --apply: must target the live Foundry Data/worlds path, not a temp snapshot.");
			process.exit(2);
		}
		if ( ALLOW_SNAPSHOT ) {
			console.error("Refusing --apply with --allow-offline-snapshot.");
			process.exit(2);
		}
	} else {
		if ( foundryRunning && livePath && !ALLOW_SNAPSHOT ) {
			console.error("Refusing: Foundry appears to be running and --world= looks like a live Data/worlds path.");
			process.exit(2);
		}
		if ( foundryRunning && livePath && ALLOW_SNAPSHOT ) {
			console.error("Refusing: --allow-offline-snapshot cannot target a live Data/worlds path while Foundry is running.");
			process.exit(2);
		}
		if ( foundryRunning && !livePath && !ALLOW_SNAPSHOT ) {
			console.error("Refusing: Foundry is running; offline snapshot dry-runs require --allow-offline-snapshot.");
			process.exit(2);
		}
	}

	const actors = await loadActorsFromWorld(worldPath);
	const reports = await collectReports(actors);
	const { proposed, totals } = summarizeReports(reports);
	totals.actorsScanned = actors.filter(isStarshipActor).length;

	if ( DRY_RUN ) {
		console.log(JSON.stringify({
			mode: "dry-run",
			applyPresent: false,
			worldMutation: false,
			worldPath,
			worldId: worldMeta.id,
			worldTitle: worldMeta.title,
			foundryRunning,
			allowOfflineSnapshot: ALLOW_SNAPSHOT,
			usedOfflineSnapshot: ALLOW_SNAPSHOT && !livePath,
			priorPeriodLedgerSize: Object.keys(PRIOR_PERIOD).length,
			totals,
			proposedChanges: proposed,
			alreadyCorrectSample: reports.filter(r => r.category === "already_correct").slice(0, 20),
			ambiguousSkipped: reports.filter(r => r.category === "ambiguous_homebrew_skipped")
		}, null, 2));
		return;
	}

	// APPLY
	const expected = {
		remove_uses_recovery: 56,
		restore_pinpoint_sr: 5,
		restore_evasive_lr: 2,
		prior_set_sr: 6,
		prior_set_lr: 0,
		proposedTotal: 69,
		ambiguous_homebrew_skipped: 0
	};
	const mismatch = [];
	for ( const [k, v] of Object.entries(expected) ) {
		if ( totals[k] !== v ) mismatch.push(`${k}: ${totals[k]} != ${v}`);
	}
	if ( mismatch.length ) {
		console.error("APPLY GATE FAILED — dry-run totals differ from approved 69:");
		for ( const m of mismatch ) console.error(` - ${m}`);
		console.log(JSON.stringify({ mode: "apply-aborted", totals, mismatch }, null, 2));
		process.exit(3);
	}

	const result = await applyProposals(worldPath, proposed);
	console.log(JSON.stringify({
		mode: "apply",
		applyPresent: true,
		worldMutation: true,
		worldPath,
		worldId: worldMeta.id,
		worldTitle: worldMeta.title,
		foundryRunning: false,
		preApplyTotals: totals,
		actorsUpdated: result.actorsUpdated,
		itemsUpdated: result.itemsUpdated,
		failures: result.failures,
		updatedItems: result.updatedItems
	}, null, 2));

	if ( result.failures.length || result.itemsUpdated !== 69 ) {
		process.exit(4);
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
