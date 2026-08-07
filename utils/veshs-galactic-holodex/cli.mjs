import { loadIdentityMap, summarizeIdentityMap } from "./identity.mjs";
import { validateIdentityMap, validateWriteGuard } from "./validate.mjs";

const command = process.argv[2] || "summary";

switch ( command ) {
	case "summary":
		console.log(JSON.stringify({
			identity: summarizeIdentityMap(loadIdentityMap()),
			writeGuard: validateWriteGuard(),
			identityValidation: validateIdentityMap()
		}, null, 2));
		break;
	case "validate":
		console.log(JSON.stringify({
			writeGuard: validateWriteGuard(),
			identityValidation: validateIdentityMap()
		}, null, 2));
		break;
	default:
		console.error(`[veshs-galactic-holodex] unknown command: ${command}`);
		process.exit(1);
}
