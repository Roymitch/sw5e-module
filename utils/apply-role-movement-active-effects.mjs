#!/usr/bin/env node
/**
 * One-shot: add Role movement OVERRIDE AEs + sync attributes.speed; fix Courier.
 * Preserves surrounding YAML formatting where possible.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES = path.join(ROOT, "packs/_source/starships/starship-features");

const MATRIX = {
	tiny: {
		"role-droid.yml": [450, 200],
		"role-munition.yml": [450, 200],
		"role-predator.yml": [350, 100],
		"role-probe.yml": [400, 150],
		"role-satellite.yml": [400, 150],
		"role-worker.yml": [350, 100]
	},
	small: {
		"role-attack-fighter.yml": [350, 100],
		"role-bomber.yml": [450, 200],
		"role-scout.yml": [450, 200],
		"role-scrambler.yml": [400, 150],
		"role-shuttle.yml": [350, 100],
		"role-superiority-fighter.yml": [400, 150]
	},
	medium: {
		"role-courier.yml": [400, 250],
		"role-freighter.yml": [300, 150],
		"role-gunship.yml": [300, 150],
		"role-missile-boat.yml": [400, 250],
		"role-navigator.yml": [350, 200],
		"role-yacht.yml": [350, 200]
	},
	large: {
		"role-ambassador.yml": [350, 250],
		"role-corvette.yml": [400, 300],
		"role-cruiser.yml": [400, 300],
		"role-explorer.yml": [350, 250],
		"role-picket-ship.yml": [300, 200],
		"role-ships-tender.yml": [300, 200]
	},
	huge: {
		"role-battleship.yml": [200, 400],
		"role-carrier.yml": [300, 500],
		"role-colonizer.yml": [400, 600],
		"role-command-ship.yml": [300, 500],
		"role-interdictor.yml": [200, 400],
		"role-juggernaut.yml": [400, 600]
	},
	gargantuan: {
		"role-blockade-ship.yml": [100, 400],
		"role-flagship.yml": [200, 500],
		"role-industrial-center.yml": [300, 600],
		"role-mobile-metropolis.yml": [300, 600],
		"role-researcher.yml": [100, 400],
		"role-warship.yml": [200, 500]
	}
};

const MOVEMENT_BLOCK = (space, turn) =>
	`      - key: system.attributes.movement.space
        mode: 5
        value: '${space}'
        priority: 20
      - key: system.attributes.movement.turn
        mode: 5
        value: '${turn}'
        priority: 20
`;

function stripExistingMovementChanges(changesBlock) {
	// Remove any prior movement.* change entries (space/turn/turning).
	return changesBlock.replace(
		/\n      - key: (?:system\.)?attributes\.movement\.(?:space|turn|turning)\n(?:        .*\n)*/g,
		"\n"
	);
}

function applyFile(full, space, turn) {
	let text = fs.readFileSync(full, "utf8");

	// Sync attributes.speed
	if ( /attributes:\s*\n\s*speed:\s*\n\s*space:\s*\d+\s*\n\s*turn:\s*\d+/.test(text) ) {
		text = text.replace(
			/(attributes:\s*\n\s*speed:\s*\n\s*)space:\s*\d+(\s*\n\s*)turn:\s*\d+/,
			`$1space: ${space}$2turn: ${turn}`
		);
	} else {
		throw new Error(`Could not find attributes.speed block in ${full}`);
	}

	const changesMatch = text.match(/(\n    changes:\n)([\s\S]*?)(\n    disabled:)/);
	if ( !changesMatch ) throw new Error(`Could not find effects changes in ${full}`);

	let body = stripExistingMovementChanges(changesMatch[2]);
	if ( !body.endsWith("\n") ) body += "\n";
	body += MOVEMENT_BLOCK(space, turn);

	text = text.slice(0, changesMatch.index)
		+ changesMatch[1]
		+ body
		+ changesMatch[3]
		+ text.slice(changesMatch.index + changesMatch[0].length);

	fs.writeFileSync(full, text, "utf8");
}

let updated = 0;
for ( const [size, files] of Object.entries(MATRIX) ) {
	for ( const [file, [space, turn]] of Object.entries(files) ) {
		const full = path.join(FEATURES, size, file);
		applyFile(full, space, turn);
		updated += 1;
		console.log(`updated ${size}/${file} → ${space}/${turn}`);
	}
}
console.log(`\n${updated} Role records updated`);
