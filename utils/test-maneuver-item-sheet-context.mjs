/**
 * Offline tests for Bug 26 Maneuver Item-sheet context helpers.
 */
import {
	buildManeuverActivationTypes,
	buildManeuverDescriptionSummary,
	buildManeuverDurationUnits,
	buildManeuverRangeTypes,
	buildManeuverSourceClassOptions,
	isMeaningfulSummaryLabel,
	isPoisonedSourceClass
} from "../scripts/maneuver-item-sheet-context.mjs";


let passed = 0;
let failed = 0;

function assert(condition, message) {
	if ( condition ) {
		passed++;
		return;
	}
	failed++;
	console.error("FAIL:", message);
}

const config = {
	activityActivationTypes: {
		action: { label: "DND5E.Action", group: "DND5E.ActivationCost" },
		bonus: { label: "DND5E.BonusAction", group: "DND5E.ActivationCost" },
		reaction: { label: "DND5E.Reaction", group: "DND5E.ActivationCost" }
	},
	specialTimePeriods: {
		inst: "DND5E.TimeInst",
		perm: "DND5E.TimePerm"
	},
	scalarTimePeriods: {
		turn: "DND5E.TimeTurn",
		round: "DND5E.TimeRound",
		minute: "DND5E.TimeMinute"
	},
	permanentTimePeriods: {
		disp: "DND5E.TimeDisp",
		dstr: "DND5E.TimeDispTrigger"
	},
	rangeTypes: {
		self: "DND5E.DistSelf",
		touch: "DND5E.DistTouch",
		spec: "DND5E.Special",
		any: "DND5E.DistAny"
	},
	movementUnits: {
		ft: { label: "DND5E.DistFt" },
		mi: { label: "DND5E.DistMi" },
		m: { label: "DND5E.DistM" },
		km: { label: "DND5E.DistKm" }
	}
};

// --- Source Class options -------------------------------------------------

const fighter = { name: "Fighter", id: "ClsFighter" };
const scholar = { name: "Scholar", id: "ClsScholar" };
const options = buildManeuverSourceClassOptions({
	fighter,
	scholar,
	broken: null,
	nolabel: { name: "" },
	objname: { name: { bad: true } },
	arrayish: []
});

assert(options.length === 2, "source class options omit malformed entries only");
assert(options[0].value === "fighter" && options[0].label === "Fighter", "first option value=key label=name");
assert(options[1].value === "scholar" && options[1].label === "Scholar", "second option value=key label=name");
assert(
	!options.some(o => o.value === "[object Object]" || o.label === "[object Object]"),
	"poison string is never an option value/label"
);
assert(
	!options.some(o => typeof o.value !== "string" || typeof o.label !== "string"),
	"all options have string value and label"
);

// Round-trip: saved identifier matches an option value
const saved = "fighter";
assert(
	options.some(o => o.value === saved),
	"saved sourceClass identifier remains selectable (round-trip)"
);

// Empty / undefined map
assert(buildManeuverSourceClassOptions(undefined).length === 0, "undefined classes → empty options");
assert(buildManeuverSourceClassOptions(null).length === 0, "null classes → empty options");
assert(buildManeuverSourceClassOptions({}).length === 0, "empty classes → empty options");

// Poison detection (migrate / sheet acceptance helper)
assert(isPoisonedSourceClass("[object Object]") === true, "detects poison string");
assert(isPoisonedSourceClass("fighter") === false, "valid identifier is not poison");
assert(isPoisonedSourceClass("") === false, "blank is not poison");
assert(isPoisonedSourceClass(null) === false, "null is not poison");

// --- Activation / duration / range shapes ---------------------------------

const activationTypes = buildManeuverActivationTypes(config);
assert(
	activationTypes.some(o => o.value === "bonus" && o.label === "DND5E.BonusAction"),
	"activationTypes includes bonus with localization key label"
);
assert(
	activationTypes.some(o => o.value === "" && o.label === "DND5E.NoneActionLabel"),
	"activationTypes includes blank None option"
);
assert(
	activationTypes.find(o => o.value === "action")?.group === "DND5E.ActivationCost",
	"activationTypes preserve group keys"
);

const durationUnits = buildManeuverDurationUnits(config);
assert(
	durationUnits.some(o => o.value === "inst" && o.label === "DND5E.TimeInst"),
	"durationUnits includes inst"
);
assert(
	durationUnits.find(o => o.value === "minute")?.group === "DND5E.DurationTime",
	"scalar duration units grouped as DurationTime"
);
assert(
	durationUnits.find(o => o.value === "disp")?.group === "DND5E.DurationPermanent",
	"permanent duration units grouped as DurationPermanent"
);

const rangeTypes = buildManeuverRangeTypes(config);
assert(
	rangeTypes.some(o => o.value === "self" && o.label === "DND5E.DistSelf"),
	"rangeTypes includes self"
);
assert(
	rangeTypes.find(o => o.value === "ft")?.group === "DND5E.RangeDistance"
	&& rangeTypes.find(o => o.value === "ft")?.label === "DND5E.DistFt",
	"movement units grouped as RangeDistance with label keys"
);

// Empty CONFIG tables do not throw
assert(buildManeuverActivationTypes({}).some(o => o.value === ""), "empty activation config still has None");
assert(Array.isArray(buildManeuverDurationUnits({})), "empty duration config → array");
assert(Array.isArray(buildManeuverRangeTypes({})), "empty range config → array");

// --- Description summary rows --------------------------------------------

assert(isMeaningfulSummaryLabel("Bonus Action") === true, "meaningful label accepted");
assert(isMeaningfulSummaryLabel("") === false, "empty string omitted");
assert(isMeaningfulSummaryLabel("   ") === false, "whitespace-only omitted");
assert(isMeaningfulSummaryLabel(null) === false, "null omitted");
assert(isMeaningfulSummaryLabel(undefined) === false, "undefined omitted");

const summaryItem = {
	labels: {
		ritualActivation: "Bonus Action",
		activation: "Bonus Action",
		range: "Self",
		target: "",
		duration: "Instantaneous",
		concentrationDuration: "Instantaneous"
	},
	system: { uses: { label: "" } }
};
const summary = buildManeuverDescriptionSummary(summaryItem);
assert(
	summary.some(r => r.label === "SW5E.Maneuver.ActivationTime" && r.value === "Bonus Action"),
	"summary includes Activation Time from prepared label"
);
assert(
	summary.some(r => r.label === "DND5E.Range" && r.value === "Self"),
	"summary includes Range"
);
assert(
	!summary.some(r => r.label === "DND5E.Target"),
	"empty Target omitted"
);
assert(
	summary.some(r => r.label === "DND5E.Duration" && r.value === "Instantaneous"),
	"summary includes Duration"
);
assert(
	!summary.some(r => r.label === "DND5E.Uses"),
	"empty Item uses omitted"
);
assert(
	!summary.some(r => ["bonus", "self", "inst"].includes(r.value)),
	"summary does not use raw canonical enums"
);

const withUses = buildManeuverDescriptionSummary({
	labels: { activation: "Action", range: "30 feet", duration: "1 minute" },
	system: { uses: { label: "1/Day" } }
});
assert(
	withUses.some(r => r.label === "DND5E.Uses" && r.value === "1/Day"),
	"Item-local uses included when prepared label exists"
);
assert(
	buildManeuverDescriptionSummary(null).length === 0,
	"null item → empty summary"
);

console.log(`maneuver-item-sheet-context: ${passed} passed, ${failed} failed`);
if ( failed ) process.exit(1);
