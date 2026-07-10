# Beta Test Guide — v1.3.9

This guide helps beta testers verify the features added, changed, and fixed in **SW5e Module v1.3.9**. Use the checkboxes to track your progress and report anything that does not match the expected results.

> **Canonical repo copy:** [docs/beta-test-1.3.9.md](https://github.com/sw5e-foundry/sw5e-module/blob/v.next/docs/beta-test-1.3.9.md) on branch `v.next`. Edit the repo file first; sync the wiki page when the checklist changes.

For the full technical changelog, see [CHANGELOG.md](https://github.com/sw5e-foundry/sw5e-module/blob/v.next/CHANGELOG.md).

**Related:**

- Prior release checklist: [docs/beta-test-1.3.7-1.3.8.md](https://github.com/sw5e-foundry/sw5e-module/blob/v.next/docs/beta-test-1.3.7-1.3.8.md) (still useful for full 1.3.8 regression)
- Wiki: [Compatibility & Limitations](https://github.com/sw5e-foundry/sw5e-module/wiki/Compatibility-&-Limitations) · [Starship Sheet Guide](https://github.com/sw5e-foundry/sw5e-module/wiki/Starship-Sheet-Guide) · [Powercasting Configuration and Overrides](https://github.com/sw5e-foundry/sw5e-module/wiki/Powercasting-Configuration-and-Overrides)

---

## Target environment

| Component | Required version |
|-----------|------------------|
| Foundry VTT | **v13.x** |
| dnd5e system | **v5.2.5** |
| lib-wrapper | **Required** (module dependency) |
| SW5e Module | **1.3.9** pre-release |

## Install

1. Go to [GitHub Releases — Pre-releases](https://github.com/sw5e-foundry/sw5e-module/releases).
2. Download and install the latest **Pre-release** labeled **1.3.9** (or the current `v.next` build that includes 1.3.9 work).
3. Review the release notes for that build before updating a live campaign world.
4. **Fully restart Foundry** after installing or updating (not just a browser reload).

> **Note:** This guide covers **1.3.9-only** changes since **1.3.8**. If you also need to re-verify starship System Damage, blaster reload, Underworld Alloy, or chassis workflows from 1.3.8, use [docs/beta-test-1.3.7-1.3.8.md](beta-test-1.3.7-1.3.8.md) as a companion checklist.

## Migration

- On first world load after updating, the module may bump `needsMigrationVersion` through **0.39**, **0.40**, and **0.41**.
- **0.39:** remaps legacy droid class effect image paths.
- **0.40:** clears stale powercasting `known.max` overrides written as `0` when the actor has no active powercasting progression.
- **0.41:** continues managed-blaster migration cleanup and starship tier sync behavior.
- Flat Damage Reduction and space-station variant behavior apply at **runtime**.
- Drake’s Shipyard AC-calc / armor DR **source** updates require a normal compendium rebuild/import path to appear in packed data.
- Older world-copied starships, blasters, and superiority actors may need migration or refresh to pick up new data shapes.

---

## Before you test

### Backup

Use a **disposable test world** or back up your campaign before updating.

### Fresh vs migrated content

When possible, test **both**:

- A **freshly created or imported** actor, item, or starship (from Drake's Shipyard / species / features packs).
- An **older or migrated** copy from an existing world.

Many bugs only appear on legacy data shapes.

### Suggested test actors

Prepare these before starting:

| Actor / item | Purpose |
|--------------|---------|
| PC with Force powers | Configure Powercasting (Force), Powers tab DC, localization |
| PC with Tech powers | Tech casting ability overrides |
| Fighter or Scholar with Superiority Dice | Superiority cogs, progression backfill, migration |
| PC or NPC with a supported blaster | Blaster warning / migration polish |
| Starship from Drake's Shipyard (e.g. B-wing) | Flat DR, AC badge, crew roles, tier, sidebar |
| Starship to convert/create as a **space station** | Space-station variant world setting |
| Character with Special Traits / SW5E skills | Special Traits labels, Lore / Piloting / Technology |
| Species that grants one of the new languages (optional) | Language list coverage |
| Non-starship vehicle (optional) | Confirm starship-only UI does not leak |

### World settings to know

| Setting | What to check |
|---------|----------------|
| Space Station variant | Enables station rules for create/convert workflows |
| Starship flat Damage Reduction | Toggles flat DR automation on attack damage |

### Compendium rebuild (contributors only)

Beta testers installing published pre-release zips can skip this.

If you are testing from a local `v.next` checkout with pack source changes:

1. Stop Foundry completely.
2. Run `npm run build:db`.
3. Restart Foundry.

Flat DR armor/ship source updates and related packed data require this rebuild to appear in packed compendiums.

---

## Quick smoke test (~10 minutes)

Complete this before deep testing. If any item fails, note it before continuing.

- [ ] **Module loads:** Open your world as GM. No red errors in the browser console (F12 → Console) related to `sw5e-module` or duplicate libWrapper registrations.
- [ ] **Character sheet:** Open a PC sheet. Tabs render; Powers / Powerbook wording is localized (not raw `SW5E.*` keys).
- [ ] **Special Traits:** Open Special Traits. Labels are readable (not raw keys).
- [ ] **Starship sheet:** Open a Drake’s Shipyard starship. Core | Inventory | Features | Effects | Description layout still works.
- [ ] **Theme cycle:** In **Configure Settings → SW5E**, switch **Theme** through **SW5E Light → SW5E Dark → Underworld Alloy → Off**. Each mode applies without breaking sheet layout.
- [ ] **Advancement Manager:** Start a level-up on a PC (or open Advancement Manager). Dialog is readable in the current SW5E theme.
- [ ] **One roll each:** Cast or roll one Force or Tech power, and one starship weapon attack.

**Failure signs:** Console errors on load, raw i18n keys on sheets, theme that leaves controls unreadable, Advancement Manager unreadable in Dark/Underworld, rolls that throw errors.

---

## Section A — Character sheet and powercasting (~45 minutes)

### A1. Localization and Special Traits

**Steps:**

1. Open a PC or NPC sheet.
2. Check tab labels and Powers / Powerbook wording.
3. Open **Special Traits**.
4. Check custom skills and weapon proficiency labels if present.
5. In Special Traits / Global Bonuses, look for power bonus fields.

- [ ] Sheet tabs and Powers / Powerbook use SW5E wording (not raw `SW5E.*` keys).
- [ ] Special Traits tab, section labels, and Original Class block are localized.
- [ ] Custom skills show readable names such as **Lore**, **Piloting**, and **Technology** where applicable.
- [ ] SW5E weapon proficiency labels are readable.
- [ ] Global Bonuses power fields show readable labels (not keys like `SW5E.BonusAttack`).

**Expected:** SW5E locale keys load correctly and Special Traits remains the stock dnd5e tab with cleaned SW5E wording.

**Failure signs:** Raw `SW5E.*` strings, blank labels, Special Traits tab missing or replaced by a custom tab.

---

### A2. Configure Powercasting — Force and Tech

**Steps:**

1. Open a character with Force powers in **Edit** mode.
2. On the **Powers** tab, open **Configure Powercasting**.
3. Set Light/Dark/Universal overrides and save.
4. Open a character with Tech powers in **Edit** mode.
5. Confirm Tech casting ability override controls appear and save.
6. Switch to **Play** mode and confirm the cog is hidden.
7. Roll a power that should use the overridden casting ability / save DC.

- [ ] Configure Powercasting cog is **visible in Edit** and **hidden in Play**.
- [ ] Force Light/Dark/Universal overrides still save and apply.
- [ ] Tech casting ability override is available for Tech users.
- [ ] Dialog can show/hide Force and Tech sections based on what the actor uses.
- [ ] Power save DCs honor the configured casting ability / per-item override where applicable.
- [ ] Powers tab roll column shows the correct save DC for `powerCasting` items.

**Expected:** One Configure Powercasting dialog covers Force and Tech overrides without Play-mode clutter.

**Failure signs:** No Tech section for Tech users, overrides ignored on rolls, wrong DC in the Powers tab roll column, cog visible in Play mode.

---

### A3. Superiority sheet controls

**Steps:**

1. Open a Fighter or Scholar (or other superiority user) in **Edit** mode.
2. Find Superiority cogs on the **Powers** tab and the **sidebar tracker**.
3. Open each dialog; adjust type ability overrides and Superiority Dice resource settings.
4. Save, close, reopen.
5. Switch to **Play** mode and confirm configuration cogs are not the primary Play UX.
6. If you have an older migrated Fighter/Scholar, confirm Superiority Dice max/die size look sane after world load.

- [ ] Powers tab Superiority cog opens in Edit mode.
- [ ] Sidebar Superiority cog opens in Edit mode.
- [ ] Type ability overrides persist after reopen.
- [ ] Superiority Dice resource settings persist after reopen.
- [ ] Scholar / Fighter progression backfill looks correct on affected actors.
- [ ] Legacy actors no longer stuck with stale `dice.max = 0` after migration.

**Expected:** Edit-mode Superiority configuration without digging through raw actor data.

**Failure signs:** Missing cogs in Edit, settings do not persist, max dice stuck at 0, wrong die formula on Scholar.

---

### A4. Blaster reload polish

Use a **supported managed blaster** and, if possible, one **legacy** world blaster.

**Steps:**

1. Open a modern managed blaster that already uses `system.uses`.
2. Confirm it does **not** warn solely because `flags.sw5e.reload.types` still exists.
3. Empty the magazine and use Attack / Rapid / Burst.
4. Reload with a compatible Power Cell or Slug Cartridge.
5. On an older world blaster, open the world once after update and confirm migration backfills `system.uses.max` rather than writing obsolete `system.ammo.value`.

- [ ] Modern managed blasters do not spam legacy ammo warnings from compatibility metadata alone.
- [ ] Empty / insufficient ammo still produces the private Reload whisper + card path.
- [ ] Reload still consumes inventory ammo and refills the magazine.
- [ ] World migration backfills `system.uses.max` for managed blasters.
- [ ] Reload labels remain localized.

**Expected:** Narrower warnings, same reload UX, cleaner migration path.

**Failure signs:** False-positive legacy warnings on modern blasters, reload broken, migration writing `system.ammo.value` again.

---

### A5. Consumables and weapon normalization (spot-check)

**Steps:**

1. Use an explosive consumable that should destroy itself on use.
2. On a burst/rapid blaster missing a base Attack activity, confirm a normal Attack activity is present or restored for integrations.
3. On an NPC/monster weapon with flat ability-mod damage, confirm damage is not double-counting the ability mod.

- [ ] Explosives consume and destroy themselves correctly.
- [ ] Burst/rapid blasters regain a usable base Attack activity when missing.
- [ ] NPC/monster weapons do not double-count flat ability-mod damage.

**Expected:** Consumable and weapon normalization fixes from 1.3.9 hold on fresh and older items.

**Failure signs:** Explosive remains after use, missing Attack activity, doubled ability damage on NPC weapons.

---

## Section B — Starships (~60–90 minutes)

### B1. Sidebar: AC badge, Tier, Initiative, Damage Reduction

**Steps:**

1. Open a Drake’s Shipyard starship (e.g. B-wing).
2. Confirm the portrait **AC badge** is visible.
3. In **Edit** mode, change **Tier** from the sidebar; save/reopen.
4. Confirm Initiative and Tier badges have themed backgrounds in Light, Dark, and Underworld.
5. Equip armor/plating that grants flat DR (or use a ship that already has equipment DR).
6. In **Play**, confirm Damage Reduction appears only when effective DR > 0.
7. In **Edit**, set a manual DR override, blur/save, then clear it.

- [ ] AC badge renders on the starship portrait.
- [ ] Tier is editable in Edit mode and prefers `actor.system.details.tier` over size-item tier.
- [ ] Initiative and Tier badges look themed in Light, Dark, and Underworld.
- [ ] Play mode shows Damage Reduction only when effective DR > 0.
- [ ] Edit mode always exposes the DR field; placeholder/equipment DR returns after clearing manual override.
- [ ] Manual override takes precedence over equipment DR while set.

**Expected:** Sidebar shows AC, Tier, and flat DR cleanly without breaking Hull/Shield presentation.

**Failure signs:** Missing AC badge, Tier reverts to size-item value unexpectedly, DR row always hidden or always wrong, theme badges unreadable.

---

### B2. Flat Damage Reduction automation

**Steps:**

1. Enable the world setting for **starship flat Damage Reduction**.
2. Attack a starship that has effective DR > 0.
3. Confirm total damage is reduced by DR, with a **minimum of 1** if DR would reduce damage to 0.
4. Disable the world setting and confirm automation no longer subtracts flat DR.
5. Compare a fresh Drake’s Shipyard ship to an older world copy if available.

- [ ] With automation on, attack damage is reduced by effective DR.
- [ ] Damage cannot be reduced below 1 by DR alone.
- [ ] With automation off, flat DR is not auto-subtracted.
- [ ] Fresh ships use `starship` AC calc / flat DR data rather than the old resistance modeling.
- [ ] Older copied ships may still need refresh/re-import; note any mismatch instead of assuming a runtime bug.

**Expected:** SotG flat DR gated by world setting; equipment or manual override supplies the value.

**Failure signs:** No reduction when enabled, reduction when disabled, damage reduced to 0, old ion/lightning/necrotic resistance still driving the new workflow on fresh ships.

---

### B3. Crew-role groups on Core

**Steps:**

1. Assign one or more PCs with deployments/ventures as crew on a starship.
2. Open the starship **Core** tab.
3. Confirm crew are grouped by deployment/venture roles.
4. Collapse and expand a role group; reload the sheet as the same user.
5. Open a crew-sourced feature if present and confirm source-actor resolution / restricted context actions behave sensibly.

- [ ] Crew appear in role groups rather than only a flat list.
- [ ] Per-user collapse state persists after reopen for that user.
- [ ] Crew-sourced items resolve to the source actor when metadata is available.
- [ ] External/crew-sourced item context actions are restricted appropriately.

**Expected:** Core crew UI organizes deployment/venture features by role.

**Failure signs:** No grouping, collapse state forgotten every reopen, wrong actor ownership actions on external items.

---

### B4. Space station variant

**Steps:**

1. Enable the **Space Station** world setting.
2. Create or convert a starship as a space station.
3. Check movement, suite max, hull, and AC expectations for the station variant.
4. Confirm Role Specialization feats by size for Large / Huge / Gargantuan where applicable.
5. If possible, flag a station below Large and confirm a **soft RAW warning** appears without hard-blocking.
6. Disable the setting and confirm ordinary starships remain usable.

- [ ] Station create/convert applies station-facing rules (fixed movement, doubled suite max, +2 hull per die, AC −2, stock mods as designed).
- [ ] Size-appropriate Role Specialization content is granted or available.
- [ ] Below-Large station shows a soft warning, not a hard block.
- [ ] Ordinary starships still work with the setting off.

**Expected:** Optional station rules behind a world setting, with homebrew-friendly soft validation.

**Failure signs:** Station rules apply with setting off, hard block on small stations, missing role-spec grants, broken ordinary starships.

---

### B5. Starship sheet cleanup regression

**Steps:**

1. Open a starship and confirm there is no orphaned SotG subtab markup or dead Crew tab.
2. Confirm primary tabs remain Core | Inventory | Features | Effects | Description.
3. Spot-check that non-starship vehicles do not gain starship-only Space/Turn fields incorrectly.

- [ ] No orphaned SotG tab UI.
- [ ] Primary tab layout unchanged from 1.3.8 intent.
- [ ] Non-starship vehicles remain free of starship-only movement fields.

**Expected:** Cleanup only; no layout regression.

**Failure signs:** Dead tabs, missing Core/Inventory/Features, starship UI leaking onto normal vehicles.

---

## Section C — Themes, currency, content, and pause (~30 minutes)

### C1. Themes and Advancement Manager

**Steps:**

1. Cycle SW5E Light, Dark, Underworld Alloy, and Off.
2. Open Advancement Manager / level-up wizard in each SW5E theme.
3. Open an Active Effect config dialog and a checkbox-heavy form.
4. Confirm parchment / logo backgrounds load (no 404s in Network tab for theme assets).
5. Spot-check Underworld header watermark and button-icon contrast.

- [ ] Advancement Manager is readable in Light, Dark, and Underworld.
- [ ] Active Effect config and checkbox tokens are scoped/readable.
- [ ] Theme parchment/logo assets load from the packaged module (no 404).
- [ ] Underworld header/button contrast is usable.
- [ ] Light starship sidebar remains readable.

**Expected:** Theme polish without new theme modes; packaged assets present.

**Failure signs:** Unreadable Advancement Manager, missing parchment files, washed-out Underworld icons, Light sidebar unreadable.

---

### C2. Galactic Credit icon

**Steps:**

1. Open a character or sheet surface that shows currency.
2. Confirm Galactic Credits use the module GC icon when available.

- [ ] GC displays with the module SVG/icon rather than a broken image.
- [ ] Fallback still works if the custom asset is unavailable.

**Expected:** Proper SW5E currency icon with safe fallbacks.

**Failure signs:** Broken image icon, missing currency display.

---

### C3. Species languages and icons

**Steps:**

1. Open language / species configuration and look for the newly added languages.
2. Spot-check HoloNet Guide to the Galaxy species icons if that pack is in your build.
3. Open or migrate a droid class species and confirm effect images resolve.

- [ ] New languages are present (Advb, Aingtii, Anomid Sign Language, Anx, Baragwinian, Caamasi, Culisetto, Ho'Din, Notho, Pantoran, Patrolian, Quermian, Ugor, Xextese).
- [ ] HGTTG species icons render correctly where applicable.
- [ ] Droid class effect images use hyphenated paths after migration (no broken URL-encoded image links).

**Expected:** Language list coverage and image path cleanup.

**Failure signs:** Missing languages, broken species icons, droid effect images 404.

---

### C4. Pause overlay

**Steps:**

1. Pause the game in SW5E Light, Dark, and Underworld Alloy.
2. Confirm the custom pause ring appears without crowding chat/sidebar.
3. Unpause and confirm UI returns to normal.

- [ ] Pause overlay renders safely in all three SW5E themes.
- [ ] Root `#pause` container is not oversized / crowding chat.
- [ ] Unpause restores normal layout.

**Expected:** Safe custom pause rings without layout blowouts.

**Failure signs:** Giant pause overlay, unreadable pause art, chat/sidebar covered permanently.

---

## Bug reporting

When something fails, include:

```
Module version:
Foundry version:
dnd5e version:
Theme mode (if relevant):
World setting states (Space Station / Flat DR):
Fresh or migrated content?:

Steps to reproduce:

Expected result:

Actual result:

Console errors (if any):
(paste from F12 → Console)

Screenshot or video:
(link or attach)
```

**Where to report:**

- [GitHub Issues](https://github.com/sw5e-foundry/sw5e-module/issues)
- Project Discord (see README for invite link)

---

## Appendix — known limitations and polish

These are **expected** behaviors or follow-up polish items. Please do not file bugs unless behavior is worse than described.

| Item | Notes |
|------|-------|
| Flat DR on older ships | Older world-copied starships/armor may still use pre-flat-DR data until refresh/re-import. |
| Space station below Large | Soft RAW warning only; homebrew sizes are allowed. |
| Flat DR automation off | Manual table handling is valid when the world setting is disabled. |
| Superiority Play mode | Configuration cogs are Edit-oriented; Play focuses on using the resource. |
| Theme visual pass | Subjective readability feedback welcome; not every Foundry surface is fully restyled. |
| Compendium source updates | Local contributors need `npm run build:db` with Foundry fully stopped. |
| Prior 1.3.8 deferred weapon work | Launcher selection/reload/ammo, bombs/mines, world actor weapon migration remain out of scope unless a later release says otherwise. |

---

## Optional deep regression

For a full 1.3.8 starship / blaster / theme regression, use:

- [`docs/beta-test-1.3.7-1.3.8.md`](beta-test-1.3.7-1.3.8.md)

For maintainers doing a broader internal pass, see:

- [`ai/rules-research/runtime-verification-checklist.md`](../ai/rules-research/runtime-verification-checklist.md)

---

## Changelog cross-reference

This guide maps to [CHANGELOG.md](../CHANGELOG.md) section `[1.3.9]`. If you are unsure whether a behavior is intentional, check the changelog **Added**, **Changed**, **Fixed**, and **Migration** subsections for 1.3.9.

**Thank you for beta testing!**
