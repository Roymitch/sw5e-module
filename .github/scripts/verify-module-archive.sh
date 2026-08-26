#!/usr/bin/env bash
# Verify release module.zip contains required runtime assets and excludes
# development / source trees. Languages and packs are derived from module.json.
set -euo pipefail

ARCHIVE="${1:-./module.zip}"
MANIFEST="${2:-./module.json}"

fail() {
  local msg="$1"
  echo "::error::${msg}"
  echo "ERROR: ${msg}" >&2
  exit 1
}

require_exact() {
  local path="$1"
  if ! grep -Fxq -- "${path}" <<<"${INVENTORY}"; then
    fail "Required archive path missing: ${path}"
  fi
}

if [[ ! -f "${ARCHIVE}" ]]; then
  fail "Module archive not found: ${ARCHIVE}"
fi

if [[ ! -f "${MANIFEST}" ]]; then
  fail "Module manifest not found: ${MANIFEST}"
fi

INVENTORY="$(unzip -Z1 "${ARCHIVE}")"
if [[ -z "${INVENTORY}" ]]; then
  fail "Module archive inventory is empty: ${ARCHIVE}"
fi

# Core runtime files (explicit; not derived from a second language/pack list).
CORE_REQUIRED=(
  "module.json"
  "README.md"
  "LICENSE"
  "scripts/module.mjs"
  "styles/module.css"
  "assets/ui/SW5e-logo2.svg"
  "assets/ui/pause-inner.svg"
  "assets/ui/pause-outer.svg"
)

for path in "${CORE_REQUIRED[@]}"; do
  require_exact "${path}"
done

# Derive language and pack paths from the release-substituted module.json.
mapfile -t LANGUAGE_PATHS < <(
  node -e '
    const fs = require("fs");
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const languages = Array.isArray(manifest.languages) ? manifest.languages : [];
    for (const entry of languages) {
      if (!entry || typeof entry.path !== "string" || !entry.path.trim()) {
        console.error("Invalid languages[].path in module.json");
        process.exit(1);
      }
      console.log(entry.path);
    }
  ' "${MANIFEST}"
)

mapfile -t PACK_PATHS < <(
  node -e '
    const fs = require("fs");
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const packs = Array.isArray(manifest.packs) ? manifest.packs : [];
    for (const entry of packs) {
      if (!entry || typeof entry.path !== "string" || !entry.path.trim()) {
        console.error("Invalid packs[].path in module.json");
        process.exit(1);
      }
      console.log(entry.path.replace(/\/+$/, ""));
    }
  ' "${MANIFEST}"
)

if [[ ${#LANGUAGE_PATHS[@]} -eq 0 ]]; then
  fail "module.json declares no languages[].path entries"
fi

if [[ ${#PACK_PATHS[@]} -eq 0 ]]; then
  fail "module.json declares no packs[].path entries"
fi

for path in "${LANGUAGE_PATHS[@]}"; do
  require_exact "${path}"
done

for pack_path in "${PACK_PATHS[@]}"; do
  # Compiled pack root must appear (directory entry and/or nested files).
  pack_root_found=0
  while IFS= read -r entry; do
    [[ -z "${entry}" ]] && continue
    if [[ "${entry}" == "${pack_path}" || "${entry}" == "${pack_path}/" || "${entry}" == "${pack_path}/"* ]]; then
      pack_root_found=1
      break
    fi
  done <<<"${INVENTORY}"
  if [[ "${pack_root_found}" -ne 1 ]]; then
    fail "Required compiled pack root missing from archive: ${pack_path}"
  fi
  require_exact "${pack_path}/CURRENT"
done

FORBIDDEN_PREFIXES=(
  "packs/_source/"
  "utils/"
  "ai/"
  ".cursor/"
  ".github/"
)

while IFS= read -r entry; do
  [[ -z "${entry}" ]] && continue
  for prefix in "${FORBIDDEN_PREFIXES[@]}"; do
    if [[ "${entry}" == "${prefix}"* ]]; then
      fail "Unexpected development path in archive: ${entry}"
    fi
  done
done <<<"${INVENTORY}"

echo "Module archive verification passed (${ARCHIVE})."
