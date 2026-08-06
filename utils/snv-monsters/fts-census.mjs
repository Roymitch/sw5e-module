/**
 * Census Force/Tech/Superiority creatures vs production embeds on disk.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ROOT } from "./paths.mjs";
import { detectFeatures } from "./classify.mjs";
import { slugifyName } from "./parse-helpers.mjs";
import { loadProductionIdentityMap } from "./identity.mjs";
import { loadAuthoritativeSnVSource, splitCreatureBlocks } from "./parse.mjs";

const PACK = path.join(ROOT, "packs/_source/snv-monsters");

function loadBodies() {
	const { markdown } = loadAuthoritativeSnVSource();
	const bodies = new Map();
	for ( const block of splitCreatureBlocks(markdown) ) {
		bodies.set(block.name, { section: block.section, body: block.lines.join("\n") });
	}
	return bodies;
}

function findYaml(name) {
	const slug = slugifyName(name);
	if ( !fs.existsSync(PACK) ) return null;
	for ( const ent of fs.readdirSync(PACK, { withFileTypes: true }) ) {
		if ( !ent.isDirectory() ) continue;
		const p = path.join(PACK, ent.name, `${slug}.yml`);
		if ( fs.existsSync(p) ) return p;
	}
	return null;
}

function embedStatus(name) {
	const p = findYaml(name);
	if ( !p ) return { onDisk: false };
	const doc = yaml.load(fs.readFileSync(p, "utf8"));
	const spells = (doc.items || []).filter(i => i.type === "spell");
	const maneuvers = (doc.items || []).filter(
		i => i.type === "sw5e-module.maneuver" || i.type === "maneuver"
	);
	const missing = doc.flags?.sw5e?.snvMonsters?.forceTechEmbedding?.missingCanonical
		|| doc.flags?.sw5e?.snvMonsters?.forceTechEmbed?.exceptions?.filter(e => e.type === "canonical-match-missing")
		|| [];
	const emptyActs = spells.filter(s => !Object.keys(s.system?.activities || {}).length).map(s => s.name);
	return {
		onDisk: true,
		path: path.relative(ROOT, p).split(path.sep).join("/"),
		id: doc._id,
		spellCount: spells.length,
		maneuverCount: maneuvers.length,
		forcePts: doc.system?.powercasting?.force?.points?.max ?? null,
		techPts: doc.system?.powercasting?.tech?.points?.max ?? null,
		missingCanonical: missing.map(e => e.powerName || e.name || e),
		emptyActivityPowers: emptyActs
	};
}

const bodies = loadBodies();
const map = loadProductionIdentityMap(path.join(ROOT, "utils/snv-monsters/manifests/identity-map.json"));
const force = [];
const tech = [];
const both = [];
const superi = [];
for ( const [name, entry] of bodies ) {
	const f = detectFeatures(entry.body);
	if ( f.hasForce ) force.push(name);
	if ( f.hasTech ) tech.push(name);
	if ( f.hasForce && f.hasTech ) both.push(name);
	if ( f.hasSuperiority ) superi.push(name);
}

function classifyList(names, system) {
	const remaining = [];
	const complete = [];
	const limited = [];
	const blocked = [];
	const resourcesOnly = [];
	for ( const name of names ) {
		const st = embedStatus(name);
		const pinned = Object.values(map.actors || {}).some(a => a.name === name);
		if ( !st.onDisk ) {
			remaining.push({ name, pinned, section: bodies.get(name)?.section });
			continue;
		}
		if ( st.emptyActivityPowers?.length ) {
			blocked.push({ name, reason: "empty-activities", ...st });
			continue;
		}
		if ( st.missingCanonical?.length ) {
			limited.push({ name, ...st });
			continue;
		}
		const hasPool = system === "force" ? st.forcePts != null : system === "tech" ? st.techPts != null : true;
		const hasItems = st.spellCount > 0 || st.maneuverCount > 0;
		// Innate casters may have spells without a point pool
		if ( hasItems || hasPool ) complete.push({ name, ...st });
		else resourcesOnly.push({ name, ...st });
	}
	return { remaining, complete, limited, blocked, resourcesOnly };
}

const forceClass = classifyList(force, "force");
const techClass = classifyList(tech, "tech");

const out = {
	totals: {
		force: force.length,
		tech: tech.length,
		forceAndTech: both.length,
		superiority: superi.length,
		overlapNames: both
	},
	force: {
		complete: forceClass.complete.length,
		limited: forceClass.limited.length,
		blocked: forceClass.blocked.length,
		remaining: forceClass.remaining.length,
		remainingNames: forceClass.remaining.map(r => r.name),
		limitedEntries: forceClass.limited,
		blockedEntries: forceClass.blocked
	},
	tech: {
		complete: techClass.complete.length,
		limited: techClass.limited.length,
		blocked: techClass.blocked.length,
		remaining: techClass.remaining.length,
		remainingNames: techClass.remaining.map(r => r.name),
		limitedEntries: techClass.limited,
		blockedEntries: techClass.blocked
	},
	superiority: { names: superi }
};

const auditDir = path.join(ROOT, "ai/audits/snv-monsters-compendium/n3/fts-embedding");
fs.mkdirSync(auditDir, { recursive: true });
fs.writeFileSync(path.join(auditDir, "fts-remaining-census.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({
	totals: out.totals,
	force: {
		complete: out.force.complete,
		limited: out.force.limited,
		blocked: out.force.blocked,
		remaining: out.force.remaining
	},
	tech: {
		complete: out.tech.complete,
		limited: out.tech.limited,
		blocked: out.tech.blocked,
		remaining: out.tech.remaining
	},
	forceRemaining: out.force.remainingNames,
	techRemaining: out.tech.remainingNames,
	forceLimited: out.force.limitedEntries.map(e => ({ name: e.name, missing: e.missingCanonical })),
	techLimited: out.tech.limitedEntries.map(e => ({ name: e.name, missing: e.missingCanonical })),
	forceBlocked: out.force.blockedEntries.map(e => ({ name: e.name, empty: e.emptyActivityPowers })),
	techBlocked: out.tech.blockedEntries.map(e => ({ name: e.name, empty: e.emptyActivityPowers }))
}, null, 2));
