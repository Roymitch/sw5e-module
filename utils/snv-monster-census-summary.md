# SnV Monster Census Summary

```text
Date: 2026-08-03
Branch: cursor/snv-monster-parity-aaed
SHA: 9c52bb348
Authorization: Investigation only (Slice 0) — AUTHORITATIVE authentic SnV_Final.md rerun
Pack mutations: none
Note: Supersedes the provisional 346-creature recovered-source census as input authority.
```

## Provenance

- SnV source file: `ai/SnV_Final.md` (authentic maintainer-local; gitignored)
- SnV heading count: **509**
- Pack NPC count: **272**
- Authentic markers verified: `SNVcover`, 000 Series `lawful dark` / `natural armor` / `23 tech points`
## Classification counts

| Class | Count |
|---|---:|
| exact-match | 236 |
| alias-match | 24 |
| missing | 244 |
| ambiguous | 5 |
| pack-only | 12 |
| matched with zero diffs | 0 |
| matched with diffs | 260 |

## Missing by section

- Humanoids: 96
- Humanoids (Force Users): 61
- Beasts: 44
- Aberrations: 22
- Droids: 10
- Constructs/Vehicles: 7
- Undead: 3
- YUUZHAN VONG: 1

## Top mismatched matched actors

- Imperial Guard Champion ↔ Imperial Guard Champion: 43 diffs
- Cyborg Khagan ↔ Cyborg Khagan: 28 diffs
- Mistryl Prime ↔ Mistryl Prime: 28 diffs
- Emperor's Hand ↔ Emperor's Hand: 26 diffs
- Mistryl Master ↔ Mistryl Master: 24 diffs
- AT-ST ↔ AT-ST: 23 diffs
- Hutt Crime Lord ↔ Hutt Crime Lord: 23 diffs
- AT-AT ↔ AT-AT: 22 diffs
- Sarlacc, Adult ↔ Sarlacc, Adult: 22 diffs
- Imperial Shadow Guard ↔ Imperial Shadow Guard: 22 diffs
- Krayt Dragon, Greater ↔ Krayt Dragon, Greater: 21 diffs
- Flesh Raider Berserker ↔ Flesh Raider Berserker: 21 diffs
- Grand Admiral ↔ Grand Admiral: 21 diffs
- Dark Lord Spirit ↔ Dark Lord Spirit: 21 diffs
- Manifestation of Abeloth ↔ Manifestation of Abeloth: 21 diffs
- IG-100 Magnaguard ↔ IG-100 Series: 20 diffs
- AT-TE ↔ AT-TE: 19 diffs
- Imperial Guard Sentinel ↔ Imperial Guard Sentinel: 19 diffs
- Imperial Royal Guard ↔ Imperial Royal Guard: 19 diffs
- Acklay, Adult ↔ Acklay, Adult: 18 diffs
- Inquisitor, Grand ↔ Inquisitor, Grand: 18 diffs
- Inquisitor, Knight ↔ Inquisitor, Knight: 18 diffs
- Vessel of Abeloth ↔ Vessel of Abeloth: 18 diffs
- DSD1 Dwarf Spider Droid ↔ DSD1 Dwarf Spider Droid: 17 diffs
- KX-Series Security Droid ↔ KX-Series Security Droid: 17 diffs

## Spot checks

### 000 Series Protocol Droid

- Classification: exact-match
- Pack: 000 Series Protocol Droid
- Diff count: 10
- `abilities.int`: expected `16`, actual `14`
- `cr`: expected `"1"`, actual `2`
- `techPoints`: expected `23`, actual `22`
- `techLevel`: expected `5`, actual `2`
- `skills.ins`: expected `3`, actual `1`
- `skills.itm`: expected `4`, actual `2`
- `skills.lor`: expected `5`, actual `null`
- `items.trait`: expected `"Circuitry"`, actual `null`

### Gonk Droid

- Classification: exact-match
- Pack: Gonk Droid
- Diff count: 8
- `abilities.int`: expected `8`, actual `9`
- `abilities.wis`: expected `6`, actual `7`
- `cr`: expected `"1/2"`, actual `0`
- `senses.darkvision`: expected `60`, actual `null`
- `damageVulnerabilities`: expected `["ion"]`, actual `["ion","lightning"]`
- `items.trait`: expected `"Explosive Retribution"`, actual `null`
- `items.actions`: expected `"Self-Destruct"`, actual `null`
- `items.actions`: expected `"Charging Port (2/Day)"`, actual `null`

### Acklay, Adolescent

- Classification: exact-match
- Pack: Acklay, Adolescent
- Diff count: 15
- `abilities.str`: expected `18`, actual `22`
- `abilities.dex`: expected `8`, actual `9`
- `abilities.con`: expected `16`, actual `17`
- `abilities.int`: expected `2`, actual `3`
- `abilities.wis`: expected `10`, actual `11`
- `abilities.cha`: expected `4`, actual `5`
- `speed.swim`: expected `40`, actual `0`
- `cr`: expected `"3"`, actual `5`

### B'omarr BT-16 Brain Walker

- Classification: alias-match
- Pack: B'omarr Brain Walker
- Diff count: 16
- `abilities.str`: expected `2`, actual `1`
- `abilities.dex`: expected `10`, actual `11`
- `abilities.con`: expected `14`, actual `15`
- `hp.average`: expected `52`, actual `54`
- `skills.dec`: expected `5`, actual `null`
- `skills.lor`: expected `5`, actual `null`
- `skills.prc`: expected `3`, actual `null`
- `skills.per`: expected `5`, actual `null`

### 3P0 Series Droid

- Classification: alias-match
- Pack: 3P0 Series
- Diff count: 6
- `abilities.con`: expected `10`, actual `11`
- `abilities.cha`: expected `10`, actual `11`
- `skills.lor`: expected `4`, actual `null`
- `skills.per`: expected `2`, actual `0`
- `damageVulnerabilities`: expected `["ion"]`, actual `["ion","lightning"]`
- `items.trait`: expected `"Circuitry"`, actual `null`

### Bantha, Adult

- Classification: exact-match
- Pack: Bantha, Adult
- Diff count: 10
- `abilities.str`: expected `22`, actual `24`
- `abilities.dex`: expected `8`, actual `9`
- `abilities.con`: expected `16`, actual `21`
- `abilities.int`: expected `2`, actual `3`
- `abilities.wis`: expected `10`, actual `11`
- `ac.value`: expected `12`, actual `13`
- `hp.average`: expected `76`, actual `126`
- `hp.formula`: expected `"8d12+24"`, actual `"11d12+55"`

## Next authorization gate

```text
Source-data correction authorized — Slice 1 matched-actor alignment
```

Then separately:

```text
Source-data correction authorized — Slice 2 missing-actor creation
Pack rebuild authorized
```

