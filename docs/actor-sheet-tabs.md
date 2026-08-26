# Actor Sheet Tab System

This document explains how Foundry v13 / dnd5e 5.x tab management works, how the SW5E module injects its own tabs into the vehicle sheet, and the rules to follow when writing code that navigates between tabs.

## How Foundry v13 ApplicationV2 Manages Tabs

In Foundry v13, `ApplicationV2`-based sheets manage tab state with two mechanisms:

### 1. CSS visibility — the primary mechanism

```css
.tab[data-tab]:not(.active) { display: none; }
```

Tab panels are shown and hidden by toggling the `.active` class. The `hidden` HTML attribute is **not** the primary visibility control for stock panels — CSS is.

### 2. `app.tabGroups` — the state record

```javascript
app.tabGroups = { primary: "inventory" }
```

`tabGroups` tracks which tab is active per group. It is updated by `app.changeTab()`. **It is not updated automatically when you manipulate classes directly.**

### 3. `app.changeTab(tab, group, options)`

The authoritative API for switching tabs. It:

- Looks up the matching nav element (`.tabs [data-group="${group}"][data-tab="${tab}"]`) — **throws if not found**
- Toggles `.active` on all nav buttons in the group
- Toggles `.active` on all `.tab[data-group="${group}"]` panels
- Updates `tabGroups[group] = tab`

Key option: `{ force: true }` bypasses the early-return guard that does nothing when `tabGroups[group]` already equals `tab`. **Always pass `force: true` when activating a stock tab from custom tab code**, because our custom tab activation does not update `tabGroups`.

## dnd5e 5.x VehicleActorSheet Structure

```
.window-content
├── [data-application-part="sidebarCollapser"]
├── [data-application-part="sidebar"]          — always visible, not a tab
├── [data-application-part="stations"]         — always visible sidebar section (NOT a nav tab)
├── [data-application-part="tabs"]             — renders the primary tab nav
└── #tabs.tab-body
    ├── [data-application-part="inventory"]    tab: "inventory"  (labeled "Cargo")
    ├── [data-application-part="crew"]         tab: "crew"
    ├── [data-application-part="effects"]      tab: "effects"
    └── [data-application-part="description"]  tab: "description"
```

**There is no `"cargo"` tab.** The tab labeled "Cargo" in the UI has `data-tab="inventory"`.

**`stations` is not a nav tab.** It is a sidebar part rendered outside the `#tabs` container. Items that appear in `stations` do not require a tab switch to view — that section is always visible.

The default `tabGroups.primary = "inventory"`.

### Item categorization — what goes where

`VehicleActorSheet._assignItemCategories(item)` determines which part of the stock sheet each item renders in:

```javascript
if ( item.type === "container" )       → inventory tab
if ( item.type === "facility" )        → facilities
if ( item.system.isMountable )         → stations (crew stations list)
if ( "inventorySection" in model )     → inventory tab   ← weapon, equipment, loot, consumable, tool
else                                   → stations (features section)  ← feat, sw5e-module.maneuver
```

**Practical rule for SW5E starship items:**

| Item type | Goes to |
|-----------|---------|
| `feat` (starship actions, features, deployments, ventures) | `stations` sidebar — always visible, no tab switch needed |
| `weapon` (starship weapons) | `inventory` tab |
| `equipment` (reactors, hyperdrives, power couplings) | `inventory` tab |
| `loot` / physical items (modifications) | `inventory` tab |

This matters for "Find in Sheet" navigation: `focusSheetItem` determines the correct tab from the DOM (`.tab[data-group='primary']`). For feat-type items it finds them in `stations` (panel = null → no tab switch, just scroll). For physical items it finds them in the `inventory` panel → switches to the cargo tab then scrolls.

## SW5E Registered Starship Tabs

Starship vehicle sheets now use a **stock PART/TAB** primary-tab model for both Core and Features:

| Tab ID | How it is registered | Panel |
|--------|----------------------|--------|
| `sw5e-starship` (Core) | Registered `VehicleActorSheet` **PART** + **TAB** via `registerStarshipCoreTabPart` | `templates/starship-core-part.hbs` with the stock `.tab` / `data-tab` / `data-group` contract |
| `sw5e-starship-features` (Features) | Registered `VehicleActorSheet` **PART** + **TAB** via `registerStarshipFeaturesTabPart` | Stock dnd5e `systems/dnd5e/templates/actors/tabs/actor-features.hbs` |

`CUSTOM_STARSHIP_TAB_IDS` is now empty because Core no longer has a custom primary-tab owner.

### Primary tab ownership

Primary tab state for starship sheets is owned by stock `app.tabGroups.primary`.

- Core active: `tabGroups.primary === "sw5e-starship"`
- Features active: `tabGroups.primary === "sw5e-starship-features"`
- Inventory active: `tabGroups.primary === "inventory"`

The old hybrid `_sw5eStarshipActiveTab` owner is retired and should not be used for new primary-tab logic.

### Core render ownership

Permanent Core ownership now uses a **pre-render owner decision**:

- If the current starship update is a patchable Core case, SW5E excludes `sw5e-starship` from the requested PART set before Foundry renders parts.
- Foundry renders the other requested PARTS normally.
- The existing marked live Core PART root stays mounted.
- After the other PARTS render, SW5E generates one updated Core inner HTML payload, applies strict validated section patches to the preserved Core root, and keeps the stock PART root identity intact.

If the current update is not patchable, SW5E allows normal stock Core PART rendering and replacement, then restamps Core section ownership and records the new baseline. This means:

- ordinary patchable cases should not trigger a stock Core PART replacement
- expected full-render cases should not trigger a second redundant late full Core assignment
- `sw5eCoreHtml` is still the source for stock Core PART rendering and is not retired in this phase

## Rules for Tab Navigation Code

### Activating any primary stock tab (`activateSheetTab` in `starship-sheet-tabs.mjs`)

Call `app.changeTab(tabId, "primary", { force: true, updatePosition: false })`.

`activatePrimaryTab(root, tabId)` remains only as a narrow fallback if `changeTab` throws or is unavailable.

### Why `force: true` still matters

Even with permanent stock ownership, callers can still attempt to re-activate the already-recorded tab after custom navigation or rerender work. Passing `{ force: true }` guarantees Foundry re-applies `.active` classes and avoids no-op edge cases that can leave the visible panel desynced.

Wrap in try/catch: if `tabId` is not a registered nav tab (for example `"stations"`), `changeTab` will throw. The catch block should fall back to `activatePrimaryTab(root, tabId)` or do nothing.

### "Find in Sheet" navigation

When navigating from Core content to show an item in the stock sheet:

1. Search for `[data-item-id="${itemId}"]` elements **outside** `.sw5e-starship-tab` panels
2. Check if the found element is inside a `.tab[data-group='primary']` panel
3. If yes → call `activateSheetTab` with `panel.dataset.tab`
4. If no (e.g., item is in the `stations` sidebar section) → **skip tab navigation** and just scroll to the item; the `stations` section is always visible

Do **not** use `data-application-part` as a fallback tab ID. `data-application-part` values like `"stations"` are part IDs, not nav tab IDs, and passing them to `changeTab` throws.

```javascript
// Correct pattern:
const panel = target.closest(".tab[data-group='primary']");
if ( panel?.dataset.tab ) activateSheetTab(root, app, panel.dataset.tab);
target.scrollIntoView({ behavior: "smooth", block: "center" });
```

### Click events in Core panels

Core panel click handlers (delegated on the panel element) should use `event.preventDefault()` for action buttons. Do **not** add `event.stopPropagation()` unless you have a specific reason — stopping propagation can interfere with navigation actions that depend on the event reaching ancestor handlers.

### Tab buttons inside Core content

Do not put `data-action="tab"` on non-nav elements (e.g., action buttons) even if they have a `data-tab` attribute. Foundry's `_onClickTab` handler reads `data-action="tab"` to detect tab switches. A button with only `data-tab` (no `data-action`) will not trigger Foundry's tab system.

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Sheet goes blank after tab switch | `changeTab` called without `force: true`; `tabGroups` already matches target tab, so it exits early and never restores `.active` on the target panel | Pass `{ force: true }` |
| Features tab blanks out after "Find in Sheet" | `data-application-part` fallback resolves to `"stations"` (not a nav tab); `changeTab` throws; catch falls to `activatePrimaryTab` which deactivates all panels | Only resolve tab ID from `.tab[data-group='primary']`, not `data-application-part` |
| Core nav state desyncs after a rerender | tab state was manipulated outside `app.changeTab`, so `.active` classes and `tabGroups.primary` drifted apart | Route primary-tab activation through `app.changeTab` |
| Stock tab button click dispatched as a synthetic event | `changeTab` exits early (same reasons above); using `dispatchEvent` bypasses the `force` option | Use `app.changeTab` directly instead of synthesizing click events |
| `scrollIntoView` on a tab panel item does nothing | Panel was `display:none` when `scrollIntoView` was called; browser has not yet painted the `display:block` change | Wrap `scrollIntoView` in `window.requestAnimationFrame(...)` after `activateSheetTab` |
