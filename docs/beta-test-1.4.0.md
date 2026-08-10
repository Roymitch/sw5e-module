# Beta Test Guide — v1.4.0

This guide helps beta testers verify the features added, changed, and fixed in the **SW5e Module 1.4.0 feature set** (prerelease / current `v.next` beta artifact). Use the checkboxes to track progress and report anything that does not match the expected results.

> **Canonical editable copy:** [`docs/beta-test-1.4.0.md`](https://github.com/sw5e-foundry/sw5e-module/blob/v.next/docs/beta-test-1.4.0.md) on branch `v.next`.  
> The published wiki page is a copy for convenience — **edit the repo file first**, then sync the wiki when the checklist changes.

For the full technical changelog, see [`CHANGELOG.md`](https://github.com/sw5e-foundry/sw5e-module/blob/v.next/CHANGELOG.md) section **1.4.0**.

**Related wiki pages:**

- [Compatibility & Limitations](https://github.com/sw5e-foundry/sw5e-module/wiki/Compatibility-&-Limitations)
- [Starship Sheet Guide](https://github.com/sw5e-foundry/sw5e-module/wiki/Starship-Sheet-Guide)
- [Powercasting Configuration and Overrides](https://github.com/sw5e-foundry/sw5e-module/wiki/Powercasting-Configuration-and-Overrides)
- [Attribute and Active Effect Keys](https://github.com/sw5e-foundry/sw5e-module/wiki/Active-Effect-Keys)
- [Themes and Appearance](https://github.com/sw5e-foundry/sw5e-module/wiki/Themes-and-Appearance)

**Historical companion (not the active guide):** [docs/beta-test-1.3.7-1.3.8.md](https://github.com/sw5e-foundry/sw5e-module/blob/v.next/docs/beta-test-1.3.7-1.3.8.md) for older 1.3.8-era regression only.

---

## Purpose

- Cover the **1.4.0 feature set** that beta testers can exercise in Foundry without rebuilding packs.
- Provide checkbox-driven, task-oriented tests with expected results and failure signs.
- Separate ordinary beta testing from contributor-only pack rebuild steps.
- Keep the **repo document canonical**; the wiki mirrors it for published reading.

---

## Target Environment

| Component | Required version |
|-----------|------------------|
| Foundry VTT | **v13.x** |
| dnd5e system | **v5.2.5** |
| lib-wrapper | **Required** (module dependency) |
| SW5e Module | **1.4.0 beta build / prerelease / current `v.next` beta artifact** |

This guide does **not** claim that a stable Manifest release of 1.4.0 is already published. Install from the authorized beta artifact or Pre-release your maintainer provides.

---

## Install and Update

1. Obtain the authorized **1.4.0 beta / prerelease** ZIP (or the current `v.next` beta artifact you were asked to test).
2. Install or update the module in Foundry.
3. **Fully restart Foundry** after installing or updating (not just a browser reload).
4. Prefer a **disposable test world**. Back up any campaign world before updating.
5. Distinguish **fresh** content (new create / Compendium import) from **migrated** older world copies when a test says so.

> Ordinary beta testers should **not** rebuild Compendiums. Pack rebuild steps are contributor-only and are called out separately if mentioned at all.

---

## Before Testing

- Open the browser **developer console** (F12) and keep it visible while testing.
- Prepare suggested fixtures:
  - A **character** with Force and/or Tech casting (or create one and add sample powers).
  - An **NPC** imported from SnV or VGH that has Force/Tech points.
  - A **starship** from Drake’s Shipyard (or an existing SW5E starship Actor).
  - At least one managed **blaster** and compatible ammo.
- Use a disposable Actor folder so temporary imports are easy to delete.
- Record exact steps and capture screenshots/recordings when something fails.
- Do not run destructive tests in a production campaign without a backup.

---

## How to Report a Failure

Include:

- Module version / build / commit (if known)
- Foundry version
- dnd5e version
- Browser
- Fresh vs migrated Actor/Item
- Actor or Item name
- Exact steps
- Expected result
- Actual result
- Relevant console output
- Screenshot or recording where helpful
- Whether it still fails after a **full Foundry restart**

Do **not** send passwords, license keys, or unrelated world data.

---

## Quick Smoke Test

**Prerequisites:** Module enabled; Foundry fully restarted; disposable world preferred.

- [ ] Module loads with no attributable startup console errors.
- [ ] Character sheet opens in Play and Edit.
- [ ] NPC sheet opens.
- [ ] Starship sheet opens with Core | Inventory | Features | Effects | Description.
- [ ] A Force or Tech power Activity can be used without sheet crash.
- [ ] Compendium **Scum and Villainy** (`snv-monsters`) opens under SW5E System Content → Monsters.
- [ ] Compendium **Vesh's Galactic Holodex** (`veshs-galactic-holodex`) opens under Monsters.
- [ ] Legacy **Monsters** pack remains available.
- [ ] A basic weapon Attack from a character works.
- [ ] A basic starship weapon Attack works (or opens the expected crew picker).
- [ ] Retained SW5E branding displays: Pause overlay and lightsaber sheet headers / logos look present (stock Foundry chrome otherwise).

**Expected:** Usable sheets and packs; no crash on open; branding retained without selectable theme modes.

**Failure signs:** Startup errors attributable to the module; missing SnV/VGH packs; missing legacy Monsters; sheets fail to open; selectable Light/Dark/Underworld theme setting present.

**Cleanup:** Delete temporary imported Actors if desired.

---

## Section A — Character Sheets and General UI

### A1. Play vs Edit and localization

**Prerequisites:** Any character; GM or owner.

1. Open the sheet in Play, then Edit.
2. Scan labels for powers, skills, currency, and Special Traits.

- [ ] Play and Edit present usable controls without broken chrome.
- [ ] No raw localization keys (for example `SW5E.…`) appear on primary sheet surfaces.
- [ ] Special Traits open and show SW5E flags such as maneuver critical / encumbrance-related entries without Force/Tech discount flags listed as Special Traits.

**Failure signs:** Raw i18n keys; broken Edit controls; discounts appearing under Special Traits.

### A2. Credits-only currency

**Prerequisites:** Character or NPC with a wallet; any priced Item.

1. Open currency / inventory price UI.
2. Compare to an older Actor that may still have PHB coin leftovers (if available).

- [ ] Wallet and price denomination UIs show **Galactic Credits** (`gc`) only.
- [ ] Stock `pp` / `gp` / `ep` / `sp` / `cp` are not presented as active SW5e currency choices.

**Failure signs:** Multi-denomination PHB coins shown as active currency.

### A3. Appearance (no selectable themes)

**Prerequisites:** Module settings open.

1. Search module settings for theme mode controls.
2. Pause the game; open a character sheet header.
3. If an older world still has a stored theme setting value, confirm it does nothing.

- [ ] No selectable **SW5E Light / SW5E Dark / Underworld Alloy** theme setting is available.
- [ ] Stock Foundry / dnd5e chrome is used for application appearance.
- [ ] Pause branding and lightsaber headers / logos still display.
- [ ] Stale theme setting values do not re-enable removed themes.
- [ ] Advancement Manager / level-up UI is readable without depending on removed theme modes.

**Failure signs:** Theme cycle controls present; Pause/header branding missing unexpectedly; Advancement Manager unreadable solely because of a removed theme assumption.

---

## Section B — Force and Tech Powercasting

### B1. Configure Powercasting

**Prerequisites:** Character (or supported Actor) with Force and/or Tech casting; Edit mode.

1. Open Configure Powercasting from the Powers tab Edit-mode control.
2. Exercise Force Light/Dark/Universal overrides where available.
3. Exercise Tech points-ability override where Tech is available.
4. Save, reopen, and check Play-mode presentation of DCs / attacks.

- [ ] Force overrides can be set and persist after reopen.
- [ ] Tech override controls appear when the Actor uses Tech.
- [ ] Edit-mode configuration is available; Play mode remains usable for casting.
- [ ] Save DC and attack presentation update consistently with the chosen abilities (spot-check one Force and one Tech power if both exist).

**Failure signs:** Dialog missing; Tech options absent on a Tech user; changes do not persist; sheet errors after save.

### B2. Force and Tech point discounts

**Prerequisites:** Caster with Force and/or Tech points; Edit access to Power Point dialogs.

1. Open Force Points configuration; set a whole-number Force discount (for example `2`).
2. Use a leveled Force power whose raw cost is greater than the discount; note preview / Consumption / spend.
3. Set discount equal to or above raw cost; confirm cost floors at `0`.
4. Cancel a dialog change and confirm no write.
5. Attempt spend with insufficient remaining points.
6. Confirm Tech powers do not spend Force (and vice versa).
7. Clear / omit discount and confirm missing discount behaves as `0`.

- [ ] Force discount applies as `finalCost = max(0, rawCost − discount)`.
- [ ] Tech discount works independently the same way.
- [ ] Cost never goes negative.
- [ ] Cancel does not persist partial dialog edits.
- [ ] Insufficient points block or warn as expected without spending the other pool.
- [ ] Missing discount behaves as zero.

**Failure signs:** Wrong pool spent; Item/Activity source cost permanently mutated; negative cost; discount ignored; Special Traits required to set discount.

**Cleanup:** Reset discounts to `0` on the test Actor.

### B3. Starting NPC pools (fresh Compendium import)

**Prerequisites:** GM; fresh import from SnV/VGH; do not rely on old world copies for this subsection.

1. Import a Force-only caster, a Tech-only caster, and (if available) a dual caster.
2. Open each sheet and record Force/Tech points.
3. Spend points from one pool; close and reopen the sheet.
4. Trigger a sheet re-prepare / reopen without resting.

**Concrete check (SnV):** Import **Jedi Sage** (`jedi-knight-sage`).

- [ ] Authored Force max imports with current full (Jedi Sage: **49 / 49**).
- [ ] Authored Tech max imports full when present.
- [ ] Dual casters import both pools full when both are authored.
- [ ] Spending reduces the correct pool only.
- [ ] Closing and reopening preserves the spent value.
- [ ] Preparation / reopen does **not** silently refill current back to max.

**Failure signs:** Current stuck at `0` while max is positive; auto-refill on reopen; wrong pool spent.

**Cleanup:** Delete temporary imported NPCs when finished.

### B4. Powers Known

**Prerequisites:** Fresh non-caster PC; Force/Tech powers from Powers & Maneuvers; at least one Free Learn power if available; one NPC caster from SnV/VGH.

1. Open a non-powercaster PC Powers Known display.
2. Add one ordinary Force power; then one Tech power; then remove them.
3. Add a power that has multiple Activities; confirm it counts once.
4. Add a Free Learn power; confirm it does not increase the Known numerator.
5. On a class caster with a positive class Known max, confirm the maximum remains intact.
6. On an NPC with unspecified Known max, confirm `N / —` presentation.
7. On an NPC caster, confirm the numerator matches qualifying embedded powers (Free Learn excluded).

- [ ] Non-powercaster PC begins `0 / —` (or equivalent empty display) for unused cast types.
- [ ] Adding one ordinary Force power → Force Known `1 / —` (when max unspecified).
- [ ] Adding one ordinary Tech power → Tech Known `1 / —` independently.
- [ ] Removing powers restores prior counts.
- [ ] Multi-Activity power counts once.
- [ ] Free Learn does not count against Powers Known.
- [ ] Class-derived positive maximum remains intact on PCs.
- [ ] NPC unspecified max shows `N / —`.
- [ ] Force and Tech counts remain independent.

**Failure signs:** Free Learn counted; multi-Activity double-count; Force/Tech bleed; max invented as `0` for NPCs that should show `—`.

### B5. Canonical power regression

**Prerequisites:** Fresh Force power; fresh Tech power; discounts optional.

- [ ] Force power Activity resolves.
- [ ] Tech power Activity resolves.
- [ ] At-will / zero-cost power spends `0` points.
- [ ] Leveled power spends the expected (discounted) cost.
- [ ] Correct resource pool decreases.
- [ ] No deprecated preparation warning attributable to the power use.
- [ ] No `DataModelValidationError` on use.

---

## Section C — Superiority and Maneuvers

**Note:** This section tests the **general module superiority system**. SnV/VGH are not assumed to contain superiority creatures.

**Prerequisites:** Character with Superiority or Superiority Style; at least one Maneuver Item.

1. Open Superiority configuration (Powers tab / sidebar cog in Edit).
2. Confirm die size and current/max dice.
3. If testing Superiority Style: grant Style and confirm one die + character-level denomination without requiring class superiority progression.
4. Apply an Active Effect **ADD** to `system.superiority.dice.max` and confirm the pool does not collapse to `0`.
5. Open a Maneuver Item: Details, Effects tab, Description summary.
6. Use a Maneuver heal Activity that should resolve `@mod` via the Maneuver ability contract.
7. Reopen Actor and Item sheets.

- [ ] Superiority configuration controls work in Edit and remain readable in Play.
- [ ] Die size and current/max dice display correctly and persist.
- [ ] Superiority Style grants a die without requiring class superiority progression.
- [ ] ADD against `dice.max` does not zero the pool incorrectly.
- [ ] Maneuver Effects tab is present.
- [ ] Description shows Activation / Range / Target / Duration summary when those labels exist.
- [ ] Heal formulas behave with the current modifier model (`1d@superiority.die + @mod` on corrected content).
- [ ] Values persist after reopen.

**Failure signs:** Max dice collapses to `0` from ADD effects; missing Effects tab; heal always uses `0` mod; Style requires a class progression incorrectly.

---

## Section D — Weapons, Ammunition, and Consumables

**Prerequisites:** Managed blaster + ammo; natural attack / Unarmed Strike example; explosive consumable if available; one SnV/VGH weaponed NPC.

### D1. Managed blaster

1. Attack with remaining magazine shots.
2. Use Burst and Rapid where the weapon supports them.
3. Empty the magazine and attempt Attack / Burst / Rapid.
4. Reload with compatible ammo.
5. Confirm no duplicate consumption and no legacy warning spam.

- [ ] Normal Attack consumes magazine uses as expected.
- [ ] Burst and Rapid consume the expected shot counts when supported.
- [ ] Empty / insufficient magazine stops the activity before resolving and surfaces Reload guidance.
- [ ] Compatible ammo Reload refills as expected.
- [ ] No double-consume; no spam of obsolete warnings.

### D2. Natural attacks and consumables

- [ ] Natural attacks / Unarmed Strike behave as natural where classified.
- [ ] Flat ability-mod damage is not duplicated incorrectly.
- [ ] Explosive consumable destroys / consumes as expected for the item.
- [ ] SnV/VGH monster weapons expose saves/riders on Activities where authored.

**Fresh vs migrated:** Spot-check both a fresh Compendium weapon and an older world copy if available.

**Failure signs:** Double damage mods; Reload never offered; Activities throw; migrated items diverge badly from fresh examples without explanation.

---

## Section E — Starship Sheet and Crew

**Prerequisites:** SW5E starship; at least two Pilot/Crew-capable Actors with Deployment rank ≥ 1 where possible; GM for hidden-crew tests.

1. Open Core → Crew & Passengers.
2. Add multiple Crew via Add Crew multi-select; add one Pilot (exactly one selection).
3. Confirm PC/NPC group headings, `P` / `C` membership pills, and search (`pilot` / `crew` / `passenger`).
4. Compare Play vs Edit: Set Pilot / Remove visibility.
5. Make a starship skill check with two qualified crew aboard (responsible-crew picker).
6. Make a starship weapon attack with multiple candidates (firing-crew picker / PB).
7. Confirm Active Crew removal.
8. As GM, hide a crew member and verify non-GM visibility; test aggregate NPC quantity controls if available.
9. Check Flight Manifest counts and persistence after reopen.

- [ ] PC and NPC crew groups appear as expected.
- [ ] Membership pills and search work.
- [ ] Play vs Edit chrome matches: visible Set Pilot / Remove restricted to Edit; authorized Remove still available via context menu where permitted.
- [ ] Add Crew multi-select deploys multiple distinct Actors; Pilot requires exactly one.
- [ ] Responsible-crew picker appears with 2+ qualified Actors; one qualifies auto; zero rolls without crew PB.
- [ ] Firing-crew proficiency can apply on attacks; public chat stays ship-attributed.
- [ ] **Active Crew was removed. Confirm no Active Crew selector or workflow remains.**
- [ ] Hidden crew visibility follows GM-only rules where applicable.
- [ ] Aggregate NPC quantity promotes/adjusts without cloning Actors (if tested).
- [ ] Flight Manifest counts and assignments persist after reopen.

**Failure signs:** Active Crew UI or selector present; multi-select ignored; picker never appears with multiple candidates; crew vanishes after reopen; non-GM sees hidden members.

**Cleanup:** Remove temporary crew assignments from the test ship.

---

## Section F — Starship Resources and Combat

**Prerequisites:** Starship token on a scene; Role with movement effects preferred; Fuel available for burn tests.

### F1. Hull / Shield token bars

1. Open Token / Prototype Token configuration.
2. Opt into **Starship Hull** and **Starship Shields** resource bars (`sw5e.starshipHull` / `sw5e.starshipShields`).
3. Edit bars from the Token HUD; reopen Actor/token.

- [ ] Hull and Shield resource choices appear for starships only (manual opt-in).
- [ ] Bar values/maxima display sensibly.
- [ ] HUD edits update and persist (Hull ↔ HP value path; Shields ↔ temp path).
- [ ] Existing tokens are not auto-migrated; stock Hit Points remains available.

### F2. Combat, DR, movement, stores

1. Resolve a starship attack with firing crew when applicable.
2. Apply damage affecting Shields then Hull; observe flat DR if enabled.
3. Exercise System Damage / conditions / Slowed / Power Routing as available on the sheet.
4. Confirm Role Override movement on Space/Turn; apply Slowed and Power Routing once each.
5. Check Max Fires/Round informational row.
6. Burn multiple fuel units; cancel a burn; burn at 0.
7. Open Recover Power combined dialog; allocate pools.
8. In Edit, open Ship’s Stores cog; confirm Play hides the cog but keeps bars/actions.
9. In Edit, confirm Space/Travel Speed/Pace numeric counters hide while Turning Speed remains visible.
10. If using space-station variant setting, spot-check station behavior.

- [ ] Starship attack and firing-crew PB behave as in Section E.
- [ ] Hull/Shield damage presentation remains coherent with sheet vitals.
- [ ] Flat Damage Reduction behaves per world automation setting.
- [ ] System Damage / conditions / Slowed / Power Routing do not stack Slowed repeatedly on re-derive.
- [ ] Role movement Active Effects provide Space/Turn baseline.
- [ ] Max Fires/Round is informational only (does not block firing).
- [ ] Multi-burn fuel applies available amount with soft warning when over-requested; Cancel leaves fuel unchanged; Burn at 0 is a no-op.
- [ ] Recover Power combined dialog validates headroom and persists one update.
- [ ] Ship’s Stores cog is Edit-only; modes persist independently; Cancel does not write.
- [ ] Edit-mode movement-counter hiding matches expected behavior.
- [ ] Station variant still supported when enabled (spot-check).

**Failure signs:** Auto-assigned Hull/Shield bars on old tokens; Slowed compounds each reopen; Recover Power double-writes; fuel burns more than available without warning; Active Crew resurfaces; theme-dependent starship chrome required for readability.

---

## Section G — New Monster Compendiums

### G1. Scum and Villainy Monsters (`snv-monsters`)

**Prerequisites:** GM; Compendium browser.

1. Open SW5E System Content → Monsters → Scum and Villainy / `snv-monsters`.
2. Count Actors (expect **508**).
3. Confirm Creature Type folders and sample one Actor from each populated folder.
4. Confirm legacy Monsters pack still present.
5. Confirm incomplete Veerhydra stub is absent.
6. Check source label **SnV** on a sample Actor.
7. Import Jedi Sage and one Tech caster; verify points and Powers Known.
8. Spot artwork load (approved or fallback).

**Folder samples to open when populated:** Aberration, Beast, Construct, Droid, Force Entity, Humanoid, Plant, Undead, Custom Type. Do **not** require Starship when that folder is empty/absent.

- [ ] Pack appears under Monsters.
- [ ] Actor count is **508**.
- [ ] Creature-Type folders organize content.
- [ ] Legacy Monsters remains present.
- [ ] Incomplete Veerhydra stub is absent.
- [ ] Source displays `SnV`.
- [ ] Artwork loads (exact, likely match, provenanced, or marked fallback).
- [ ] Representative natural and manufactured weapons open.
- [ ] Force/Tech creatures embed powers; authored points start full; Powers Known displays correctly.
- [ ] Import + reopen works with no Actor-construction errors.

### G2. Vesh's Galactic Holodex (`veshs-galactic-holodex`)

**Prerequisites:** GM.

1. Open the VGH pack under Monsters.
2. Count Actors (expect **115**).
3. Confirm seven populated Creature-Type folders: Aberration, Beast, Custom Type, Droid, Humanoid, Plant, Undead.
4. Confirm source displays exactly **`Vesh's Galactic Holodex`**.
5. Spot-check named Actors (present in current pack):
   - Acklay, Gladiator
   - GEMINI Conspirator Droid
   - Emperor's Wrath
   - Albek
   - Imperial Cipher Agent
   - Dark Side Spectre
   - Saava
   - Evarrian
6. Import a Force and a Tech caster; verify pools / Known; accept generic artwork fallback where maintainer art is pending.

- [ ] Pack appears under Monsters with **115** Actors.
- [ ] Seven expected folders are populated.
- [ ] Source string is exactly `Vesh's Galactic Holodex`.
- [ ] Named spot-checks open without construction errors.
- [ ] Weapons / Force / Tech / points / Powers Known behave consistently with the SnV embedding approach.
- [ ] Imported Actor persists after reopen.
- [ ] Generic artwork fallback is acceptable where custom art is deferred.

**Cleanup:** Delete temporary imports.

---

## Section H — Currency and Content Authoring (advanced / optional)

**Audience:** Advanced testers / homebrew authors. Ordinary beta testers may skip.

**Prerequisites:** Ability to open [Attribute and Active Effect Keys](https://github.com/sw5e-foundry/sw5e-module/wiki/Active-Effect-Keys).

- [ ] Credits-only wallet and item prices use Galactic Credits.
- [ ] Orphan PHB currency keys are not presented as valid SW5e currency.
- [ ] Attribute page documents Force/Tech point fields, `known.max`, prepared `known.value` (non-AE), discount flags, starship resource IDs, movement keys, and `@sw5eCrewAttackProf`.
- [ ] Distinction between AE targets and prepared/read-only / token resource IDs / roll terms is clear.

**Failure signs:** Guide or UI encourages AE on `known.value`, token resource IDs, or the crew attack roll term.

---

## Section I — Migration and Compatibility

**Source:** `CHANGELOG.md` **1.4.0** Migration subsection; `module.json` `needsMigrationVersion` (**1.3.6**); runtime migration on GM load.

**Prerequisites:** Backup; optional older world copy.

1. Back up the world before first GM load on a build that includes currency fold (**1.3.4**) or Maneuver formula rewrite (**1.3.5**).
2. Load as GM and allow migrations to run.
3. Compare a fresh import vs a migrated Actor for currency and Maneuver heals where relevant.
4. Confirm lib-wrapper is enabled; Foundry v13.x + dnd5e 5.2.5.

- [ ] Full-world backup warning understood before migrating a real campaign.
- [ ] Orphan PHB wallet amounts fold into `gc` on supported builds; price denominations remap to `gc`.
- [ ] Recognized obsolete Maneuver heal formulas rewrite to `1d@superiority.die + @mod` without wiping homebrew unknowns.
- [ ] Fresh vs migrated differences are understandable; some content still needs reimport rather than migration.
- [ ] lib-wrapper required; unsupported configurations documented as limitations.
- [ ] Artwork fallback for SnV/VGH is an accepted limitation where noted.
- [ ] No assumption that the module world-migrates every NPC Compendium Actor without import/rebuild.

**Failure signs:** Silent irreversible wallet merges without backup warning in docs; homebrew Maneuver formulas overwritten incorrectly; migrations require ordinary testers to rebuild packs.

---

## Section J — Console and Error Review

While performing the sections above, watch the browser console for module-attributable issues:

- [ ] No `DataModelValidationError`
- [ ] No unexpected `TypeError` / `ReferenceError` / `SyntaxError`
- [ ] No unresolved StringTerm / `NaN` on power or starship rolls
- [ ] No deprecated preparation warning on canonical power use
- [ ] No failed module asset requests for required icons (fallback art may still 404 only if mis-marked)
- [ ] No missing document errors when opening pack Actors
- [ ] No Activity execution / power-consumption failures on canonical examples
- [ ] No missing localization on primary surfaces
- [ ] No duplicate hook / lib-wrapper registration warnings attributable to this module

Separate unrelated browser/extension noise from module-attributable errors when reporting.

---

## Final Regression Checklist

After a full Foundry restart:

- [ ] Module restart clean
- [ ] Fresh Actor path OK
- [ ] Migrated Actor path OK (if tested)
- [ ] Force casting / discounts / pools
- [ ] Tech casting / discounts / pools
- [ ] Superiority / Maneuvers
- [ ] Managed blaster + Reload
- [ ] Natural attack
- [ ] Consumable spot-check
- [ ] Starship sheet + crew workflow
- [ ] Starship combat / DR / movement
- [ ] Hull/Shield token bars opt-in
- [ ] SnV pack (508) + sample casters
- [ ] VGH pack (115) + sample casters
- [ ] Fallback artwork accepted where deferred
- [ ] Legacy Monsters remains
- [ ] Source labels (`SnV`, `Vesh's Galactic Holodex`)
- [ ] Powers Known behavior
- [ ] No attributable console failure

---

## Test Completion Summary

```text
Tester:
Build/commit:
Foundry version:
dnd5e version:
Browser:
World type: Fresh / Existing / Both

Quick smoke: PASS / PARTIAL / FAIL
Characters and UI:
Powercasting:
Superiority:
Weapons:
Starship sheet:
Starship combat:
SnV:
VGH:
Migration:
Console:

Issue summary:
Reproduction steps:
Expected:
Actual:
Console output:
Screenshots/recording:
Cleanup completed:
```

---

## Contributor-only notes (not required for ordinary beta testers)

- Pack `_source` edits require Foundry fully stopped, then `npm run build:db`, then Foundry restart.
- Ordinary prerelease ZIP testing does **not** require those steps.

---

## Appendix — known limitations (polish)

| Topic | Note |
|-------|------|
| VGH artwork | Generic/canonical icons are acceptable while custom art is deferred. |
| SnV artwork | Some art may be unofficial replacements; fallbacks may be marked for replacement. |
| Theme modes | Selectable SW5E themes are removed; use Foundry appearance settings. |
| Active Crew | Removed; membership Pilot/Crew/Passenger is authoritative. |
| Hull/Shield bars | Manual opt-in only; no auto-migration of existing tokens. |
