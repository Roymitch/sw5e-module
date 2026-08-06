/**
 * Hard write-root refusal for N2 generator.
 * Allows only approved gitignored sandbox roots.
 */
import path from "node:path";
import { COMMITTED_PACK_SOURCE, ROOT, SANDBOX_AUDIT, SANDBOX_PROTOTYPE } from "./paths.mjs";

const ALLOWED_PREFIXES = [
	path.resolve(SANDBOX_PROTOTYPE),
	path.resolve(SANDBOX_AUDIT)
];

const FORBIDDEN_PREFIXES = [
	path.resolve(COMMITTED_PACK_SOURCE),
	path.resolve(ROOT, "packs/snv-monsters"),
	path.resolve(ROOT, "packs/_source")
];

const PRODUCTION_BATCH_DESCRIPTORS = Object.freeze({
	n3a: Object.freeze({
		batch: "n3a",
		artifactPrefix: "n3a",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:blurrg",
			"snv:Beasts:fyrnock",
			"snv:Beasts:jakrab",
			"snv:Beasts:kath-hound",
			"snv:Beasts:massiff",
			"snv:Beasts:stintaril",
			"snv:Beasts:zalaaca"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/blurrg.yml",
			"packs/_source/snv-monsters/beasts/fyrnock.yml",
			"packs/_source/snv-monsters/beasts/jakrab.yml",
			"packs/_source/snv-monsters/beasts/kath-hound.yml",
			"packs/_source/snv-monsters/beasts/massiff.yml",
			"packs/_source/snv-monsters/beasts/stintaril.yml",
			"packs/_source/snv-monsters/beasts/zalaaca.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/blurrg.yml",
			"packs/_source/snv-monsters/beasts/fyrnock.yml",
			"packs/_source/snv-monsters/beasts/jakrab.yml",
			"packs/_source/snv-monsters/beasts/kath-hound.yml",
			"packs/_source/snv-monsters/beasts/massiff.yml",
			"packs/_source/snv-monsters/beasts/stintaril.yml",
			"packs/_source/snv-monsters/beasts/zalaaca.yml"
		],
		expectedIdentityAdditions: { actors: 7, items: 24, activities: 7, folders: 0 },
		requireWorkingTreeClean: true,
		productionMetadata: {
			outputSelection: "selected-n1-parity",
			productionReadiness: "prototype-validated",
			packPhase: "n3a-tracked"
		}
	}),
	"n3b-p2": Object.freeze({
		batch: "n3b-p2",
		artifactPrefix: "n3b-p2",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:aryx",
			"snv:Beasts:ewok-pony"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/aryx.yml",
			"packs/_source/snv-monsters/beasts/ewok-pony.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/aryx.yml",
			"packs/_source/snv-monsters/beasts/ewok-pony.yml"
		],
		expectedIdentityAdditions: { actors: 2, items: 3, activities: 3, folders: 0 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p2",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p2-tracked"
		}
	}),
	"n3b-p3": Object.freeze({
		batch: "n3b-p3",
		artifactPrefix: "n3b-p3",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:moof"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/moof.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/moof.yml"
		],
		expectedIdentityAdditions: { actors: 1, items: 3, activities: 1 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p3",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p3-tracked"
		}
	}),
	"n3b-p4": Object.freeze({
		batch: "n3b-p4",
		artifactPrefix: "n3b-p4",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:jundland-wastes-womp-rat",
			"snv:Beasts:sibian-hound"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/jundland-wastes-womp-rat.yml",
			"packs/_source/snv-monsters/beasts/sibian-hound.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/jundland-wastes-womp-rat.yml",
			"packs/_source/snv-monsters/beasts/sibian-hound.yml"
		],
		expectedIdentityAdditions: { actors: 2, items: 6, activities: 2 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p4",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p4-tracked"
		}
	}),
	"n3b-p1": Object.freeze({
		batch: "n3b-p1",
		artifactPrefix: "n3b-p1",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:gundark-adolescent",
			"snv:Beasts:rancor-juvenile"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/gundark-adolescent.yml",
			"packs/_source/snv-monsters/beasts/rancor-juvenile.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/gundark-adolescent.yml",
			"packs/_source/snv-monsters/beasts/rancor-juvenile.yml"
		],
		expectedIdentityAdditions: { actors: 2, items: 8, activities: 3 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p1",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p1-tracked"
		}
	}),
	"n3b-p5": Object.freeze({
		batch: "n3b-p5",
		artifactPrefix: "n3b-p5",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:nerf",
			"snv:Beasts:fambaa"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/nerf.yml",
			"packs/_source/snv-monsters/beasts/fambaa.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/nerf.yml",
			"packs/_source/snv-monsters/beasts/fambaa.yml"
		],
		expectedIdentityAdditions: { actors: 2, items: 8, activities: 4 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p5",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p5-tracked"
		}
	}),
	"n3b-p6": Object.freeze({
		batch: "n3b-p6",
		artifactPrefix: "n3b-p6",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:scrange",
			"snv:Beasts:fambaa-howdah"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/scrange.yml",
			"packs/_source/snv-monsters/beasts/fambaa-howdah.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/scrange.yml",
			"packs/_source/snv-monsters/beasts/fambaa-howdah.yml"
		],
		expectedIdentityAdditions: { actors: 2, items: 14, activities: 4 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p6",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p6-tracked"
		}
	}),
	"n3b-p7": Object.freeze({
		batch: "n3b-p7",
		artifactPrefix: "n3b-p7",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:fathier",
			"snv:Beasts:tusk-cat",
			"snv:Beasts:ronto",
			"snv:Beasts:acklay-adolescent",
			"snv:Beasts:bantha-adolescent",
			"snv:Beasts:bantha-adult"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/fathier.yml",
			"packs/_source/snv-monsters/beasts/tusk-cat.yml",
			"packs/_source/snv-monsters/beasts/ronto.yml",
			"packs/_source/snv-monsters/beasts/acklay-adolescent.yml",
			"packs/_source/snv-monsters/beasts/bantha-adolescent.yml",
			"packs/_source/snv-monsters/beasts/bantha-adult.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/fathier.yml",
			"packs/_source/snv-monsters/beasts/tusk-cat.yml",
			"packs/_source/snv-monsters/beasts/ronto.yml",
			"packs/_source/snv-monsters/beasts/acklay-adolescent.yml",
			"packs/_source/snv-monsters/beasts/bantha-adolescent.yml",
			"packs/_source/snv-monsters/beasts/bantha-adult.yml"
		],
		expectedIdentityAdditions: { actors: 6, items: 21, activities: 11 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p7",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p7-tracked"
		}
	}),
	"n3b-p8": Object.freeze({
		batch: "n3b-p8",
		artifactPrefix: "n3b-p8",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:reek-adolescent",
			"snv:Beasts:reek-adult"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/reek-adolescent.yml",
			"packs/_source/snv-monsters/beasts/reek-adult.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/reek-adolescent.yml",
			"packs/_source/snv-monsters/beasts/reek-adult.yml"
		],
		expectedIdentityAdditions: { actors: 2, items: 4, activities: 2 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p8",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p8-tracked"
		}
	}),
	"n3b-p9": Object.freeze({
		batch: "n3b-p9",
		artifactPrefix: "n3b-p9",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:scurrier",
			"snv:Beasts:vornskr"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/scurrier.yml",
			"packs/_source/snv-monsters/beasts/vornskr.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/scurrier.yml",
			"packs/_source/snv-monsters/beasts/vornskr.yml"
		],
		expectedIdentityAdditions: { actors: 2, items: 9, activities: 4 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p9",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p9-tracked"
		}
	}),
	"n3b-p10": Object.freeze({
		batch: "n3b-p10",
		artifactPrefix: "n3b-p10",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: ["snv:Beasts:dianoga-adolescent"],
		approvedYamlRelativePaths: ["packs/_source/snv-monsters/beasts/dianoga-adolescent.yml"],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/dianoga-adolescent.yml"
		],
		expectedIdentityAdditions: { actors: 1, items: 6, activities: 2 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p10",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p10-tracked"
		}
	}),
	"n3b-p11": Object.freeze({
		batch: "n3b-p11",
		artifactPrefix: "n3b-p11",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:kath-hound-horned",
			"snv:Beasts:eopie",
			"snv:Beasts:rancor-adolescent",
			"snv:Beasts:beggars-canyon-womp-rat",
			"snv:Beasts:gundark-alpha",
			"snv:Beasts:gundark-matriarch"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/kath-hound-horned.yml",
			"packs/_source/snv-monsters/beasts/eopie.yml",
			"packs/_source/snv-monsters/beasts/rancor-adolescent.yml",
			"packs/_source/snv-monsters/beasts/beggars-canyon-womp-rat.yml",
			"packs/_source/snv-monsters/beasts/gundark-alpha.yml",
			"packs/_source/snv-monsters/beasts/gundark-matriarch.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/kath-hound-horned.yml",
			"packs/_source/snv-monsters/beasts/eopie.yml",
			"packs/_source/snv-monsters/beasts/rancor-adolescent.yml",
			"packs/_source/snv-monsters/beasts/beggars-canyon-womp-rat.yml",
			"packs/_source/snv-monsters/beasts/gundark-alpha.yml",
			"packs/_source/snv-monsters/beasts/gundark-matriarch.yml"
		],
		expectedIdentityAdditions: { actors: 6, items: 33, activities: 14 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p11",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p11-tracked"
		}
	}),
	"n3b-p12": Object.freeze({
		batch: "n3b-p12",
		artifactPrefix: "n3b-p12",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Beasts:bantha-feral",
			"snv:Beasts:sleen",
			"snv:Beasts:scazz",
			"snv:Beasts:pherin",
			"snv:Beasts:nashtah",
			"snv:Beasts:ghest",
			"snv:Beasts:dianoga-adult",
			"snv:Beasts:rancor-adult"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/beasts/bantha-feral.yml",
			"packs/_source/snv-monsters/beasts/sleen.yml",
			"packs/_source/snv-monsters/beasts/scazz.yml",
			"packs/_source/snv-monsters/beasts/pherin.yml",
			"packs/_source/snv-monsters/beasts/nashtah.yml",
			"packs/_source/snv-monsters/beasts/ghest.yml",
			"packs/_source/snv-monsters/beasts/dianoga-adult.yml",
			"packs/_source/snv-monsters/beasts/rancor-adult.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/beasts/bantha-feral.yml",
			"packs/_source/snv-monsters/beasts/sleen.yml",
			"packs/_source/snv-monsters/beasts/scazz.yml",
			"packs/_source/snv-monsters/beasts/pherin.yml",
			"packs/_source/snv-monsters/beasts/nashtah.yml",
			"packs/_source/snv-monsters/beasts/ghest.yml",
			"packs/_source/snv-monsters/beasts/dianoga-adult.yml",
			"packs/_source/snv-monsters/beasts/rancor-adult.yml"
		],
		expectedIdentityAdditions: { actors: 8, items: 42, activities: 18 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3b-p12",
			productionReadiness: "prototype-validated",
			packPhase: "n3b-p12-tracked"
		}
	}),
	"n3a-p1": Object.freeze({
		batch: "n3a-p1",
		artifactPrefix: "n3a-p1",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Aberrations:ngok",
			"snv:Aberrations:rakghoul",
			"snv:Aberrations:rakghoul-hulking",
			"snv:Aberrations:rakling"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/aberrations/ngok.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-hulking.yml",
			"packs/_source/snv-monsters/aberrations/rakling.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/aberrations/_folder.yml",
			"packs/_source/snv-monsters/aberrations/ngok.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-hulking.yml",
			"packs/_source/snv-monsters/aberrations/rakling.yml"
		],
		expectedIdentityAdditions: { actors: 4, items: 18, activities: 7 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3a-p1",
			productionReadiness: "prototype-validated",
			packPhase: "n3a-p1-aberrations"
		}
	}),
	"n3a-p2": Object.freeze({
		batch: "n3a-p2",
		artifactPrefix: "n3a-p2",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Aberrations:orbalisk",
			"snv:Aberrations:rakghoul-crazed",
			"snv:Aberrations:rakghoul-irradiated"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/aberrations/orbalisk.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-crazed.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-irradiated.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/aberrations/orbalisk.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-crazed.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-irradiated.yml"
		],
		expectedIdentityAdditions: { actors: 3, items: 15, activities: 5 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3a-p2",
			productionReadiness: "prototype-validated",
			packPhase: "n3a-p2-aberrations"
		}
	}),
	"n3a-p3": Object.freeze({
		batch: "n3a-p3",
		artifactPrefix: "n3a-p3",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Aberrations:orbalisk-swarm",
			"snv:Aberrations:rakghoul-vile",
			"snv:Aberrations:rakghoul-fiend",
			"snv:Aberrations:rakghoul-monstrous"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/aberrations/orbalisk-swarm.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-vile.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-fiend.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-monstrous.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/aberrations/orbalisk-swarm.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-vile.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-fiend.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-monstrous.yml"
		],
		expectedIdentityAdditions: { actors: 4, items: 31, activities: 10 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3a-p3",
			productionReadiness: "prototype-validated",
			packPhase: "n3a-p3-aberrations"
		}
	}),
	"n3a-p4": Object.freeze({
		batch: "n3a-p4",
		artifactPrefix: "n3a-p4",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Aberrations:mnggal-mnggal-gray-pudding",
			"snv:Aberrations:mnggal-mnggal-pool-of"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/aberrations/mnggal-mnggal-gray-pudding.yml",
			"packs/_source/snv-monsters/aberrations/mnggal-mnggal-pool-of.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/aberrations/mnggal-mnggal-gray-pudding.yml",
			"packs/_source/snv-monsters/aberrations/mnggal-mnggal-pool-of.yml"
		],
		expectedIdentityAdditions: { actors: 2, items: 20, activities: 2 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3a-p4",
			productionReadiness: "prototype-validated",
			packPhase: "n3a-p4-aberrations"
		}
	}),
	"n3a-p5": Object.freeze({
		batch: "n3a-p5",
		artifactPrefix: "n3a-p5",
		productionRoot: path.resolve(COMMITTED_PACK_SOURCE),
		approvedSemanticKeys: [
			"snv:Aberrations:mnggal-mnggal-lake-of",
			"snv:Aberrations:rakghoul-eyeless",
			"snv:Aberrations:tsalak"
		],
		approvedYamlRelativePaths: [
			"packs/_source/snv-monsters/aberrations/mnggal-mnggal-lake-of.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-eyeless.yml",
			"packs/_source/snv-monsters/aberrations/tsalak.yml"
		],
		allowedTrackedRelativePaths: [
			"utils/snv-monsters/identity.mjs",
			"utils/snv-monsters/generate.mjs",
			"utils/snv-monsters/production-write.mjs",
			"utils/snv-monsters/validate.mjs",
			"utils/snv-monsters/write-guard.mjs",
			"utils/snv-monsters/cli.mjs",
			"utils/snv-monsters/test-unit.mjs",
			"utils/snv-monsters/generate-generalized.mjs",
			"utils/snv-monsters/test-generalized.mjs",
			"utils/snv-monsters/manifests/identity-map.json",
			"packs/_source/snv-monsters/aberrations/mnggal-mnggal-lake-of.yml",
			"packs/_source/snv-monsters/aberrations/rakghoul-eyeless.yml",
			"packs/_source/snv-monsters/aberrations/tsalak.yml"
		],
		expectedIdentityAdditions: { actors: 3, items: 30, activities: 3 },
		requireWorkingTreeClean: false,
		productionMetadata: {
			outputSelection: "selected-n3a-p5",
			productionReadiness: "prototype-validated",
			packPhase: "n3a-p5-aberrations"
		}
	})
});

export const N3A_ALLOWED_TRACKED_RELATIVE_PATHS = [...PRODUCTION_BATCH_DESCRIPTORS.n3a.allowedTrackedRelativePaths];
export const N3A_ALLOWED_PRODUCTION_YAMLS = PRODUCTION_BATCH_DESCRIPTORS.n3a.approvedYamlRelativePaths
	.map(relativePath => path.resolve(ROOT, relativePath));

function isUnder(parent, child) {
	const rel = path.relative(parent, child);
	return child === parent || (rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

function isExactAllowedTrackedPath(candidate) {
	const relative = path.relative(ROOT, candidate).split(path.sep).join("/");
	return N3A_ALLOWED_TRACKED_RELATIVE_PATHS.includes(relative);
}

export function toRepoRelative(candidate) {
	return path.relative(ROOT, candidate).split(path.sep).join("/");
}

export function isAllowedN3aTrackedPath(candidate) {
	return isExactAllowedTrackedPath(path.resolve(ROOT, candidate));
}

export function getProductionBatchDescriptor(batch) {
	const descriptor = PRODUCTION_BATCH_DESCRIPTORS[batch];
	if ( !descriptor ) throw new Error(`[snv-monsters] unsupported production batch: ${batch}`);
	return descriptor;
}

export function listApprovedProductionBatches() {
	return Object.keys(PRODUCTION_BATCH_DESCRIPTORS);
}

export function getAllowedTrackedRelativePaths(batch) {
	return [...getProductionBatchDescriptor(batch).allowedTrackedRelativePaths];
}

export function getApprovedProductionYamlRelativePaths(batch) {
	return [...getProductionBatchDescriptor(batch).approvedYamlRelativePaths];
}

/**
 * @param {string} outputRoot
 * @param {{ allowProductionWrite?: boolean }} [opts]
 * @returns {string} resolved absolute path
 */
export function assertAllowedOutputRoot(outputRoot, opts = {}) {
	if ( !outputRoot || typeof outputRoot !== "string" ) {
		throw new Error("[snv-monsters] output root is required");
	}
	const resolved = path.resolve(ROOT, outputRoot);

	for ( const forbidden of FORBIDDEN_PREFIXES ) {
		if ( isUnder(forbidden, resolved) ) {
			if ( opts.allowProductionWrite === true ) {
				if ( !opts.batch ) {
					throw new Error("[snv-monsters] production pack/source write requires an explicit approved batch name.");
				}
				const descriptor = getProductionBatchDescriptor(opts.batch);
				if ( resolved === descriptor.productionRoot ) return resolved;
				throw new Error(`[snv-monsters] production pack/source write is only authorized for the exact ${descriptor.batch} pack source root.`);
			}
			throw new Error(
				`[snv-monsters] REFUSED: cannot write under ${path.relative(ROOT, forbidden) || forbidden} during N2. `
				+ "Use ai/prototypes/snv-monsters/n2/ or ai/audits/snv-monsters-compendium/n2/."
			);
		}
	}

	const allowed = ALLOWED_PREFIXES.some(prefix => isUnder(prefix, resolved));
	if ( !allowed ) {
		throw new Error(
			`[snv-monsters] REFUSED: output root not in allowed N2 sandbox paths: ${resolved}`
		);
	}

	return resolved;
}

export function isCommittedPackPath(candidate) {
	const resolved = path.resolve(ROOT, candidate);
	return isUnder(path.resolve(COMMITTED_PACK_SOURCE), resolved)
		|| isUnder(path.resolve(ROOT, "packs/snv-monsters"), resolved);
}

export function assertApprovedProductionYamlPath(candidate, batch) {
	const resolved = path.resolve(ROOT, candidate);
	const allowed = getApprovedProductionYamlRelativePaths(batch)
		.map(relativePath => path.resolve(ROOT, relativePath));
	if ( !allowed.includes(resolved) ) {
		throw new Error(`[snv-monsters] REFUSED: non-approved ${batch} YAML path ${toRepoRelative(resolved)}`);
	}
	return resolved;
}

export function assertApprovedN3aYamlPath(candidate) {
	return assertApprovedProductionYamlPath(candidate, "n3a");
}
