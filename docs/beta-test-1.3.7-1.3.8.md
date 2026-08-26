# SW5e Module Beta Test Guide — v1.3.7 & v1.3.8

This guide helps beta testers verify the features added, changed, and fixed in **SW5e Module v1.3.7** and **v1.3.8**. Use the checkboxes to track your progress and report anything that does not match the expected results.

For the full technical changelog, see [CHANGELOG.md](../CHANGELOG.md).

---

## Target environment

| Component | Required version |
|-----------|------------------|
| Foundry VTT | **v13.x** |
| dnd5e system | **v5.2.5** |
| lib-wrapper | **Required** (module dependency) |
| SW5e Module | **1.3.7** and/or **1.3.8** pre-release |

## Install

1. Go to [GitHub Releases — Pre-releases](https://github.com/sw5e-foundry/sw5e-module/releases).
2. Download and install the latest **Pre-release** (likely labeled **1.3.8**, which includes all work since 1.3.6).
3. Review the release notes for that build before updating a live campaign world.
4. **Fully restart Foundry** after installing or updating (not just a browser reload).

> **Note:** A single pre-release may contain both 1.3.7 and 1.3.8 changes. Section A covers 1.3.7-specific items; Section B covers the larger 1.3.8 pass. Complete Section A first if you are doing a full regression.

## Migration

- On first world load after updating, the module bumps `needsMigrationVersion` to **0.38**.
- This migration is **non-destructive** — no actor or item data is rewritten.
- Starship sheet, conditions, System Damage, and token icon behavior apply at runtime on existing starship actors.
- Older world-copied blasters may need refresh or re-import to pick up new reload/use configuration.

---

## Before you test

### Backup

Use a **disposable test world** or back up your campaign before updating.

### Fresh vs migrated content

When possible, test **both**:

- A **freshly created or imported** actor, item, or starship (from Drake's Shipyard compendiums).
- An **older or migrated** copy from an existing world.

Many bugs only appear on legacy data shapes.

### Suggested test actors

Prepare these before starting:

| Actor / item | Purpose |
|--------------|---------|
| PC or NPC with force and tech powers | Powercasting, themes, Configure Powercasting |
| Maneuver item (or character with maneuvers) | Maneuver sheet, superiority |
| PC or NPC with a supported blaster | Reload and ammo UX |
| Starship from Drake's Shipyard (e.g. B-wing) | Starship sheet, combat, weapon activities |
| Non-starship vehicle (optional) | Verify Space/Turn fields do not appear incorrectly |
| Character with Mastery-tier skills (optional) | Mastery reroll automation |
| Character with installed chassis modifications (optional) | Chassis panel and mod effects |

### Compendium rebuild (contributors only)

Beta testers installing published pre-release zips can skip this.

If you are testing from a local `v.next` checkout with compendium changes:

1. Stop Foundry completely.
2. Run `npm run build:db`.
3. Restart Foundry.

Compendium Active Effects and blaster Activity `itemUses` data require this rebuild to appear in packed compendiums.

---

## Quick smoke test (~10 minutes)

Complete this before deep testing. If any item fails, note it before continuing.

- [ ] **Module loads:** Open your world as GM. No red errors in the browser console (F12 → Console) related to `sw5e-module`.
- [ ] **Character sheet:** Open a PC or NPC sheet. Tabs render; no blank or broken layout.
- [ ] **Item sheet:** Open any item (weapon, equipment, or power). Sheet opens normally.
- [ ] **Starship sheet:** Open a vehicle-backed starship. Sheet opens with the new tab layout.
- [ ] **Theme cycle:** In **Configure Settings → SW5E**, switch **Theme** through **SW5E Light → SW5E Dark → Underworld Alloy → Off**. Each mode applies without breaking sheet layout.
- [ ] **One roll each:** Cast or roll one power, one maneuver (if available), and one starship weapon attack.

**Failure signs:** Console errors on load, sheets that fail to render, theme that leaves controls unreadable, rolls that throw errors.

---

## Section A — v1.3.7 tests (~30 minutes)

These items shipped in **v1.3.7** (2026-06-04). They are included here for completeness even if you install a combined 1.3.8 pre-release.

### A1. Maneuver type dropdown

**Steps:**

1. Open a **maneuver** item sheet (from compendium or world).
2. Go to the **Details** tab.
3. Change the **maneuver type** using the dropdown.
4. Save and close the sheet.
5. Reopen the maneuver and confirm the type persisted.

- [ ] Dropdown opens and lists maneuver types.
- [ ] Selected type saves and persists after reload.

**Expected:** Maneuver type can be changed and saved without errors.

**Failure signs:** Dropdown does not open, selection does not save, console error on change.

---

### A2. Pause icon layering

**Steps:**

1. As GM, click **Pause** (or use the pause hotkey).
2. Observe the pause overlay on the canvas.

- [ ] Spinning pause icon appears **behind** the pause text, not overlapping it badly.

**Expected:** Icon and text are legible; icon does not cover the word "Paused."

**Failure signs:** Icon renders on top of text or obscures it.

---

### A3. New species languages

Eleven languages were added: **Dowuta, Gank, Gormak, Houkese, Kall, Mandaba, Mikkian, Nikto, Tiss'shar, Tognath, Zilkin**.

**Steps:**

1. Create or open a character whose species grants one of the new languages (or add the language manually in Edit mode).
2. Open language selection or the character's language list.

- [ ] New languages appear in the language list.
- [ ] Language can be selected and saved.

**Expected:** All eleven languages are available where species or manual language selection applies.

**Failure signs:** Language missing from list, untranslated key shown instead of label.

---

### A4. Common and rare language grouping

**Steps:**

1. Open language configuration (character sheet languages, species setup, or CONFIG-driven language UI).
2. Review how languages are presented.

- [ ] Languages are grouped into **common** and **rare** categories per SW5e site designation.

**Expected:** Clear grouping; common languages separated from rare languages.

**Failure signs:** Flat ungrouped list where grouping is expected, or languages in wrong group.

---

### A5. Powercasting school icons

**Steps:**

1. Browse force or tech powers in a compendium or on a character sheet.
2. Look for school icons where powers are filtered or listed by school.

- [ ] School icons appear for force/tech powercasting schools where the UI shows school metadata.

**Expected:** SVG school icons visible in appropriate power lists and CONFIG-driven surfaces.

**Failure signs:** Broken image placeholders, missing icons across all schools.

---

### A6. Maneuver type icons (known limitation)

**Steps:**

1. Open a maneuver item sheet.
2. Look for maneuver type icons.

- [ ] **Known limitation — not a bug:** Icons are assigned in module CONFIG for maneuver types, but **maneuver sheets do not yet display these icons**. Do not file a bug unless icons are broken elsewhere.

---

### A7. Localization spot-check (optional)

**Steps:**

1. Change Foundry's core language to **de**, **es**, **fr**, or **it** (if available).
2. Open language lists or species with new languages.

- [ ] No flood of missing localization keys in the console.
- [ ] Language grouping still works.

**Expected:** Updated locale files apply without major untranslated-key spam.

**Failure signs:** Console flooded with `missing translation` errors for `SW5E.*` language keys.

---

## Section B — v1.3.8 tests (~2–4 hours)

These items shipped in **v1.3.8** (2026-06-24). Work through each subsection and check off items as you pass them.

---

### B1. Themes and appearance

**Steps:**

1. Open **Configure Settings → SW5E → Theme**.
2. Test each mode: **SW5E Light**, **SW5E Dark**, **Underworld Alloy**, **Off**.
3. For each theme, open these surfaces:
   - PC or NPC **actor sheet**
   - **Item sheet** (weapon, equipment, or power)
   - **Starship sheet**
   - A **chat / roll card** (make any roll)
   - **Short Rest** or **Long Rest** dialog
   - **Cast Power** or **Save** activity usage dialog (if available)
   - A **compendium browser** (powers, equipment, or starships)
   - **Cybernetic Augmentations** manager (if character has augmentations)

- [ ] SW5E Light: readable controls on all tested surfaces.
- [ ] SW5E Dark: readable controls on all tested surfaces.
- [ ] Underworld Alloy: new theme applies globally; dialogs and sheets themed.
- [ ] Off: stock Foundry/dnd5e appearance returns.
- [ ] Checkboxes render correctly (not invisible or misaligned).
- [ ] Dropdowns and `<select>` elements are readable (contrast, borders).
- [ ] Icon-only controls have visible hit targets.
- [ ] Cybernetic Augmentations dialog: installed cards, install area, buttons, and scrollbars readable in SW5E Light.
- [ ] Journal / datapad surfaces respect theme (spot-check one journal entry if available).
- [ ] Class advancement or level-up config app respects theme (if you level a character during testing).

**Expected:** Consistent theming across sheets, dialogs, chat cards, and browsers. No unreadable text or invisible form controls.

**Failure signs:** White-on-white text, missing checkbox visuals, dialogs that ignore the selected theme, Cybernetics dialog that fails to theme in SW5E Light.

---

### B2. Starship sheet layout

Open a **vehicle-backed starship** from Drake's Shipyard (B-wing recommended).

**Tab bar**

- [ ] Primary tabs are **Core | Inventory | Features | Effects | Description** (in that order).
- [ ] No legacy **Crew** tab.
- [ ] No **Starship Sheet V2** preview shell or setting.

**Core tab**

- [ ] Ability scores and skills display with character-style ability cards.
- [ ] **Recharge**, **Refitting**, and **Regen** repair buttons are present.
- [ ] **Crew & Passengers**, **Fuel**, and **Power Die Allocation** panels are collapsible.
- [ ] Crew Management, Power Routing, and Fuel controls are on Core (not a separate Crew tab).
- [ ] Ability config cog opens configuration.
- [ ] Skill and save-tab rolls work from the sheet.

**Inventory tab**

- [ ] Sections include **Weapons**, **Equipment**, **Modifications**, and stock **Loot/Cargo**.
- [ ] Modifications section header shows **Mod Slots** and **Suites** usage stats.
- [ ] Advanced ordnance (e.g. Proton Torpedo) appears under the correct section.

**Features tab**

- [ ] **Starship Actions** and **Systems** sections present.
- [ ] **Modifications** section is **not** on Features (it belongs on Inventory).

**Effects tab**

- [ ] Starship condition grid is present (see B4).
- [ ] Display-only sync Active Effects (Used, Slowed, System Damage icons) do **not** appear in the generic **Active Effects** list below the grid.

**Description tab**

- [ ] Stock description content renders.

**Sidebar**

- [ ] Hull and Shield points/dice display.
- [ ] System Damage pips display when SD > 0.
- [ ] Destruction Saves tray appears when Hull is 0.
- [ ] Speed and Travel Speed display.
- [ ] **No** legacy sidebar **Mod Slots / Suites** summary card.
- [ ] Shield meter fill and vital meter placement look correct.

**Removed / changed**

- [ ] Stock vehicle **Features** tab is hidden in favor of the dedicated Starship Features tab.
- [ ] **Patch** and **Regenerate Shields** use stock item use behavior (no custom compact recovery dialog).

**Expected:** Complete starship workflow on the new five-tab layout without legacy Crew tab or V2 preview.

**Failure signs:** Wrong tab labels, Modifications on Features tab, sync effects cluttering Active Effects list, sidebar Mod Slots card still visible, save-tab roll markup overlap.

---

### B3. Starship movement

**Steps:**

1. Open a starship sheet. Note **Space Speed** and **Turning Speed**.
2. Open the stock dnd5e **Movement** configuration dialog from the sheet or token.
3. Use **Use Derived** to reset movement if available.
4. Place the starship token on a scene and drag it to move.

- [ ] Space Speed and Turning Speed visible on starship actors.
- [ ] Movement dialog integrates with starship movement modes.
- [ ] **Use Derived** reset works.
- [ ] Token movement on the map uses **Space** movement (not air or land incorrectly).
- [ ] Open a **non-starship vehicle** (if available): Space/Turn fields do **not** appear.

**Expected:** Starships use Space and Turning movement; ordinary vehicles are unaffected.

**Failure signs:** Starship token moves as air/land, movement dialog errors, Space/Turn fields on non-starships, console errors about movement type registration on startup.

---

### B4. System Damage, Destruction Saves, and conditions

#### System Damage (levels 1–6)

**Steps:**

1. On a test starship, increment System Damage (SD) from 0 through 6 using sheet controls or GM tools.
2. At each level, note mechanical effects.

- [ ] **SD 1+:** Disadvantage on starship skill and ability checks.
- [ ] **SD 2+:** Slowed movement contribution applies.
- [ ] **SD 3+:** Outgoing attack/save disadvantage.
- [ ] **SD 4+:** Effective Hull/Shield/Regen caps apply; Recharge/Refitting restore targets capped at effective max.
- [ ] **SD 5+:** **Used** condition latches.
- [ ] **SD 6:** Catastrophic helper state (verify per your table's expectations).
- [ ] Sidebar SD pips update with level.
- [ ] Token HUD shows System Damage icon when SD > 0; icon clears at SD 0.

**Expected:** RAW-aligned SD effects at each threshold; sidebar and token reflect current level.

**Failure signs:** Effects not applying, pips out of sync, token icon stuck after SD cleared.

#### Destruction Saves

**Steps:**

1. Reduce starship Hull to **0**.
2. Confirm the **Destruction Saves** tray appears in the sidebar.
3. Roll a Destruction Save.

- [ ] Tray appears at Hull 0.
- [ ] Roll formula is a **single 1d20** (not `1d20 + 1d20` or double d20).
- [ ] Failure increments System Damage; natural 1 increments SD.
- [ ] Natural 20 restores Hull to 1 and resets counters.
- [ ] Three successes stabilize the ship.
- [ ] No stale "three failures destroy" wording in the UI.

**Expected:** Stock dnd5e D20 roll configuration dialog; single d20 roll.

**Failure signs:** Double d20 in formula, tray missing at Hull 0, counters not updating.

#### Condition grid (Effects tab)

- [ ] Condition grid shows starship conditions: Blinded, Disabled, Ionized, Invisible, Shocked, Slowed, Stalled, Stunned, Tractored, Used.
- [ ] **Slowed** has explicit level buttons **1, 2, 3, 4**.
- [ ] **Used** toggle works.
- [ ] RAW tooltips appear on hover.
- [ ] System Damage is **not** in the condition grid (it is tracked separately).
- [ ] Condition hover styling is readable.

**Expected:** Full starship condition grid with Slowed levels and Used control.

**Failure signs:** Missing conditions, Slowed without level buttons, System Damage incorrectly in grid.

#### Token HUD and icon sync

- [ ] Starship token HUD shows starship-only conditions (Used, Slowed 1–4, Cover, System Damage display).
- [ ] Creature-only conditions (e.g. stock `slowed`) do **not** appear on starship tokens.
- [ ] Toggling Slowed 1 → 2 → 3 → 4 updates the token icon (allow ~1 second between toggles).
- [ ] Toggling Used updates token icon.
- [ ] No console error: `Cannot add property parent, object is not extensible` when toggling statuses.
- [ ] Character token HUD does **not** show starship-only entries.

**Expected:** Token icons sync from flags/SD; no sync crash on toggle.

**Failure signs:** Console extensibility error, wrong icon for Slowed level, starship conditions on character tokens.

---

### B5. Starship roll modifiers

**Steps:**

1. Apply **Ionized**, **Blinded**, and **Invisible** to a starship. Roll an outgoing attack or save.
2. Attack a starship that is **Blinded**, **Stalled**, **Stunned**, or **Invisible**. Note incoming attack advantage/disadvantage defaults.
3. Apply **Stalled** or **Stunned**. Roll STR or DEX save (not a Destruction Save).

- [ ] Ionized / Blinded / Invisible apply default outgoing disadvantage or advantage as appropriate.
- [ ] Incoming attacks vs Blinded/Stalled/Stunned/Invisible starships get correct default advantage/disadvantage.
- [ ] Stalled/Stunned: STR and DEX saves auto-fail.
- [ ] Destruction Saves are **not** affected by Stalled/Stunned auto-fail.

**Expected:** Roll dialogs pre-select correct advantage/disadvantage; auto-fail only on appropriate saves.

**Failure signs:** No modifier applied, wrong advantage state, Destruction Saves incorrectly auto-failing.

---

### B6. Starship repair workflows

**Steps:**

1. Damage a starship (reduce Hull/Shields, add SD if needed).
2. Use **Recharge**, **Refitting**, and **Regen** from the Core tab.

- [ ] Recharge dialog opens and applies restore.
- [ ] Refitting dialog opens; optional **Reduce System Damage** applies before restore calculation.
- [ ] Regen dialog opens and applies.
- [ ] **Recharge** resets Destruction Save counters.
- [ ] **Refitting** resets Destruction Save counters.
- [ ] **Regen** does **not** reset Destruction Saves.
- [ ] At **SD 4+**, Recharge and Refitting restore targets are capped at effective max.

**Expected:** Three distinct repair workflows with correct SD and Destruction Save interactions.

**Failure signs:** Dialog fails to open, restore ignores SD caps, wrong Destruction Save reset behavior.

---

### B7. Weapon Activities (starship weapons)

**Steps:**

1. On a starship with primary/secondary weapons, roll an **Attack** from a weapon row or activity.
2. Adjust **Power Routing** and roll again; confirm damage scales.
3. Fire **Proton Torpedo** or **Concussion Missile** (Dex save, half on save).
4. Use a template weapon (e.g. burst laser) and a single-target weapon.

- [ ] Primary/secondary weapon Attack Activities roll successfully.
- [ ] Default attack ability is **Wisdom** when none is set on the weapon.
- [ ] Power Routing damage scaling applies through stock dnd5e damage rolls.
- [ ] Proton Torpedo / Concussion Missile use Dexterity saves; half damage on successful save.
- [ ] Launcher shells remain utility/gating items (no fake 0d0 Attack Activities).
- [ ] Template weapons still prompt for measured template placement.
- [ ] Single-target weapons do **not** spuriously prompt for measured templates.

**Expected:** Stock dnd5e Attack and Save Activities on starship weapons with correct defaults.

**Failure signs:** Roll errors, wrong save ability, templates prompted on every weapon, Power Routing ignored.

#### Out of scope — do not file as missing features

The following are **deferred** to a later starship weapon rollout:

- Launcher selection UI
- Launcher reload workflow
- Ammo consumption for ordnance
- Bombs, mines, and cluster munitions
- Migration of existing world actor embedded weapons

---

### B8. Blaster reload and ammo

Use a **supported managed blaster** on a PC or NPC (from Drake's Shipyard or a world copy with reload support).

**Steps:**

1. Confirm the weapon row shows a **Reload** control.
2. Set magazine to **0** ammo (or empty `system.uses`).
3. Use **Attack** activity.
4. Use **Rapid** or **Burst** with **partial** ammo (fewer shots than required).
5. Perform a successful **Reload** with a compatible **Power Cell** or **Slug Cartridge** in inventory.
6. Fire a normal attack at full ammo and confirm consumption.

- [ ] Reload control visible on supported blaster weapon row.
- [ ] Attack at 0 ammo: private Reload whisper to owner + GM and Reload chat card.
- [ ] Rapid/Burst with insufficient ammo: "not enough ammo" path (whisper + card).
- [ ] Reload consumes compatible inventory ammo and refills the magazine.
- [ ] Successful Attack/Rapid/Burst consumes correct `itemUses` shots (including alternate-fire costs).
- [ ] Legacy world blaster with `flags.sw5e.reload.types` still detected as managed blaster.
- [ ] Reload labels and messages are localized (not raw i18n keys).

**Expected:** Magazine-style `system.uses` tracking with inventory-based reload.

**Failure signs:** No reload button on supported blaster, reload does not consume ammo, shots not consumed on fire, raw key strings in chat.

---

### B9. Chassis and modifications

Use a character with a **modification chassis** (armor, weapon, focus generator, etc.).

**Steps:**

1. Open the item sheet and locate the **Modification Chassis** panel.
2. Expand/collapse the panel.
3. Open the **install picker** (Enhanced Items → Item Modifications browser).
4. Install a mod via picker and via drag/drop from compendium or world item.
5. Click an installed modification name.
6. Make a roll that should benefit from an installed mod's effects.

- [ ] Chassis panel is compact and collapsible with slot cards.
- [ ] Footer icon actions and tooltips work.
- [ ] Install picker opens without developer/debug metadata on normal rows.
- [ ] Compatibility badges and issue messaging are clear (Valid / Warning / Blocked).
- [ ] Drag/drop install from compendium and world items works.
- [ ] Clicking installed mod name opens the **source item sheet**.
- [ ] Installed mod name styling does not look like a full-width button slab.
- [ ] Installed-mod effects contribute at roll time (attack bonus, DC bonus, etc.).
- [ ] Homebrew slot overflow (e.g. 22/20 slots) shows a warning but does **not** hard-block (per homebrew flexibility).

**Expected:** Full chassis install workflow with roll-time effect aggregation.

**Failure signs:** Install picker crash, drag/drop silent failure, mod effects not applied on rolls, hard block on over-slot homebrew values.

---

### B10. Powercasting and Active Effects

#### Configure Powercasting

**Steps:**

1. Open a character with force powers in **Edit** mode.
2. On the **Powers** tab, click the **Configure Powercasting** cog.
3. Set per-school overrides, Light/Dark casting ability overrides, and Universal mode.
4. Click **Save Changes**.

- [ ] Cog is **hidden in Play mode**; visible only in **Edit** mode.
- [ ] Configure Powercasting dialog opens.
- [ ] Per-school forcecasting ability overrides save correctly.
- [ ] Light/Dark casting ability and max force point ability overrides work.
- [ ] Universal **Highest Effective Light/Dark** mode works; **Fixed Ability** option available.
- [ ] **Save Changes** saves and closes the dialog (no extra header/helper clutter).
- [ ] Universal default compares effective Light/Dark abilities after overrides (not raw WIS/CHA only).

**Expected:** Full override dialog with clean UX.

**Failure signs:** Cog visible in Play mode, dialog does not save, overrides ignored on rolls.

#### Power attack and save DC bonuses

Test with items or Active Effects that grant bonuses (e.g. Focus Generator, Wristpad, Fadecasting/Rendcasting/Withercasting mods).

- [ ] Force power attack bonus applies on force power attacks.
- [ ] Tech power attack bonus applies on tech power attacks.
- [ ] Broad power save DC bonus applies.
- [ ] Ability-specific or save-target DC bonus applies.
- [ ] Melee/ranged power attack bonuses (`mpak`/`rpak`) apply from relevant modifications.

**Expected:** Save DC preparation consumes supported bonus keys; bonuses appear on rolls.

**Failure signs:** Bonuses missing on roll dialog or chat card, DC not updated.

#### Mastery and Superiority

- [ ] **Mastery / High Mastery / Grand Mastery:** advantage, double proficiency, and chat-card rerolls work.
- [ ] Mastery proficiency config dialog opens and renders without localization errors.
- [ ] Mastery reroll does **not** always return 20.
- [ ] **Superiority Dice:** Active Effect changes to `system.superiority.dice.max` persist through data preparation; formula bonuses apply.

**Expected:** Skill-tier automation with working reroll UX.

**Failure signs:** Reroll always 20, superiority max reverted after sheet close.

#### Active Effects UI

- [ ] Dropdown/select fields in Active Effects render correctly in SW5E Light, SW5E Dark, and Underworld Alloy.

**Failure signs:** Broken select styling, invisible options.

---

### B11. Other 1.3.8 changes

#### Equipment attunement

- [ ] Open attunable SW5e equipment **without** the dnd5e magic property.
- [ ] Attunement controls appear and work (derived magic during preparation).

**Failure signs:** Attunement missing on attunable equipment.

#### Currency

- [ ] Actor wallet shows currency correctly.
- [ ] Custom currency **settings UI is removed** (simplified currency handling).
- [ ] Item price denomination still works.

**Failure signs:** Wallet broken, missing currency display.

#### Class feature advancements

- [ ] Base **class** (not subclass) feature advancements and effects work on level-up or sheet display.

**Note:** Subclass advancements are not in scope for this release.

#### Character sheet tabs (SW5E Light)

- [ ] Vertical tab backing on character sheet is **readable** in SW5E Light (not transparent/broken).

**Failure signs:** Invisible or unreadable tab labels in SW5E Light.

#### Trigger activities

- [ ] Trigger activity configuration constrains targets to the **same actor** (no invalid cross-actor targeting).

**Failure signs:** Trigger can target wrong actor.

#### Journal AppV2

- [ ] Open a journal entry with Underworld Alloy theme active.
- [ ] Journal content respects theme scoping.

**Failure signs:** Journal ignores theme or has contrast issues.

#### Startup / compatibility (passive)

On world load, confirm no console errors for:

- [ ] libWrapper / starship movement registration
- [ ] Space/Turn movement type pre-localization
- [ ] Mastery proficiency config localization

**Failure signs:** Red errors on first load related to the above.

---

## Bug reporting

When something fails, please include as much context as possible. Copy this template:

```
Foundry version:
dnd5e version:
SW5e Module version:
Content type: fresh / migrated / compendium / world copy
Actor or item name (if relevant):

Steps to reproduce:
1.
2.
3.

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
| Maneuver type icons | Assigned in CONFIG; maneuver sheets do not display them yet (1.3.7). |
| Modifications header density | May show compact text like `Mod Slots22/20Suites0/3` — functional, cosmetic polish deferred. |
| Homebrew mod slot overflow | Values above RAW cap (e.g. 22/20) are allowed with warning, not hard-blocked. |
| Weapon activity deferred work | Launcher selection, reload, ammo consumption, bombs/mines, world actor migration — not in 1.3.8. |
| Older world blasters | May need refresh or re-import for new reload/`itemUses` configuration. |
| Compendium Active Effects | Require `npm run build:db` + Foundry restart in dev environments. |
| Theme visual pass | Subjective readability feedback welcome; not every surface has automated coverage. |
| Slowed icon sync timing | Rapid toggles without pause may briefly show stale icons; wait ~1s between level changes when testing. |
| Legacy sync effect IDs | Brief duplicate System Damage display effect possible on SD apply; usually resolves within ~1.5s. |
| SD Used latch | Latches through sheet/API paths; direct flag editing may not trigger latch. |
| Subclass class features | Base class advancements/effects only; subclasses not automated in this release. |
| PHB / EC / WH journal packs | If present in your build, spot-check import and navigation only. |

---

## Optional deep regression

For a comprehensive 28-section GM/QA checklist covering startup, CONFIG, compendia, migrations, and homebrew paths, see the internal document:

- [`ai/rules-research/runtime-verification-checklist.md`](../ai/rules-research/runtime-verification-checklist.md)

That checklist is optional and intended for power users or maintainers doing a full regression pass.

---

## Changelog cross-reference

This guide maps to [CHANGELOG.md](../CHANGELOG.md) sections `[1.3.7]` and `[1.3.8]`. If you are unsure whether a behavior is intentional, check the changelog **Added**, **Changed**, **Fixed**, **Weapon Activities**, and **Migration** subsections for your version.

**Thank you for beta testing!**
