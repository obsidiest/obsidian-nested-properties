---
project:
  identity:
    name: Nested Properties Advanced
    version: 2.0.0
  release:
    channel: beta
    artifacts:
      - main.js
      - manifest.json
      - styles.css
contributors:
  - name: Ada
    role: design
  - name: Grace
    role: engineering
---

# Property field guides, breadcrumbs, and threading

This note's own properties form several nested branches. Use them to try the visual hierarchy features without changing another note.

1. Open **Settings → Nested Properties Advanced**. **Property Field Hover Breadcrumb** is enabled by default and can be switched off globally or by view mode.
2. By default, hover anywhere across a property key. Enable **Full-Width Property Field Hover Activation** to include the value and the rest of the row, or disable both activation-scope switches to require the property icon in Live Preview/Reading mode or the left-side expansion toggle in Source mode.
3. Try the selected activation scope above this note in Live Preview, then switch to Source and Reading modes.
4. Move through the breadcrumb with the arrow, Home, and End keys. Click a row to focus that field.
5. Enable **Property Field Threading**. Compare active-field, all-branches, root-level, and cursor activation while moving between `project`, `contributors`, and their descendants.
6. Install and enable **Style Settings**, then open **Nested Properties Advanced** there to adjust guide lines, depth colors, breadcrumb sizing, typography, and spacing. Every numerical slider has a synchronized precise text box.

Static main-UI and breadcrumb guides and the hover breadcrumb are enabled by default. The threading master switch remains disabled by default, so threading is opt-in. **Highlight Active Property Field Tree** is also opt-in and has its own Style Settings controls.

## Settings coverage

The plugin's searchable settings page exposes every persisted switch below. Child switches are disabled until their parent switch is enabled.

- `allNestedPropertiesExpansionStateByNote`
- `fullKeyNamesExpansionStateByNote`
- `isRememberLastUsedMainUiToggleStatesEnabled`
- `isRememberAllNestedPropertiesExpansionToggleStateEnabled`
- `isRememberFullKeyNamesExpansionToggleStateEnabled`
- `isGlobalToggleAllNestedPropertiesEnabled`
- `isGlobalExpandAllNestedPropertiesEnabled`
- `isGlobalCollapseAllNestedPropertiesEnabled`
- `isPerNoteToggleAllNestedPropertiesEnabled`
- `isGlobalToggleFullKeyNamesEnabled`
- `isGlobalExpandFullKeyNamesEnabled`
- `isGlobalCollapseFullKeyNamesEnabled`
- `isPerNoteToggleFullKeyNamesEnabled`
- `isHighlightActivePropertyFieldTreeEnabled`
- `isPropertyFieldHoverBreadcrumbEnabled`
- `isFullWidthPropertyFieldHoverActivationEnabled`
- `isFullWidthPropertyKeyHoverActivationEnabled`
- `isPropertyFieldHoverBreadcrumbInLivePreviewEnabled`
- `isPropertyFieldHoverBreadcrumbInSourceModeEnabled`
- `isPropertyFieldHoverBreadcrumbInReadingModeEnabled`
- `isPropertyFieldHoverBreadcrumbStaticTreeIndentationGuidesEnabled`
- `isNestedPropertiesMainUiStaticTreeIndentationGuidesEnabled`
- `isPropertyFieldThreadingEnabled`
- `isPropertyFieldThreadingInMainUiEnabled`
- `isPropertyFieldThreadingInHoverBreadcrumbEnabled`
- `isActiveCursorPropertyFieldThreadingEnabled`
- `isActivePropertyFieldThreadingEnabled`
- `isActivePropertyFieldThreadingInMainUiEnabled`
- `isActivePropertyFieldThreadingInHoverBreadcrumbEnabled`
- `isAllBranchesOfActivePropertyFieldTreeThreadingEnabled`
- `isAllBranchesOfActivePropertyFieldTreeThreadingInMainUiEnabled`
- `isAllBranchesOfActivePropertyFieldTreeThreadingInHoverBreadcrumbEnabled`
- `isActiveRootLevelPropertyFieldTreeThreadingEnabled`
- `isActiveRootLevelPropertyFieldThreadingEnabled`
- `isActiveRootLevelPropertyFieldThreadingInMainUiEnabled`
- `isActiveRootLevelPropertyFieldThreadingInHoverBreadcrumbEnabled`
- `isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled`
- `isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInMainUiEnabled`
- `isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInHoverBreadcrumbEnabled`

The master **Active Cursor Property Field Threading** switch changes activation from hover to focus/caret while preserving whichever regular and root-level threading submodes are enabled.
