/**
 * Bounded N2 edge-case selection (source-authentic names).
 * Temporary sandbox identities only — not production pins.
 */
export const EDGE_CASE_SELECTION = [
	{
		name: "Legendary HK-Series Droid, HK-47",
		categories: ["legendary", "reactions", "limited-uses"]
	},
	{
		name: "Clodhopper Swarm",
		categories: ["swarm-squad"]
	},
	{
		name: "Imperial Knight",
		categories: ["force-user-incomplete", "reactions"]
	},
	{
		name: "Ambush Master",
		categories: ["tech-user-incomplete", "canonical-or-source-weapon"]
	},
	{
		name: "Destroyer Droideka",
		categories: ["recharge", "qualified-defense", "unusual-senses-movement"]
	},
	{
		name: "DRK-1 Tracker Droid",
		categories: ["unusual-senses-movement"]
	},
	{
		name: "B2 Series, B2-HA",
		categories: ["limited-uses", "source-specific-weapon", "recharge"]
	}
];

export function edgeCaseNameSet() {
	return new Set(EDGE_CASE_SELECTION.map(e => e.name.toLowerCase().normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[''`]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()));
}

export function categoryCoverage() {
	const map = {};
	for ( const e of EDGE_CASE_SELECTION ) {
		for ( const c of e.categories ) {
			map[c] = map[c] || [];
			map[c].push(e.name);
		}
	}
	return map;
}
