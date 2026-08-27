---
project:
  identity:
    name: Nested Properties
    version: 1.5.0
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

1. Open **Settings → Nested Properties** and enable **Property Field Hover Breadcrumb**.
2. Hover a property key or value above this note in Live Preview, switch to Source mode and hover its raw frontmatter, then open Reading mode and hover it again.
3. Move through the breadcrumb with the arrow, Home, and End keys. Click a row to focus that field.
4. Enable **Property Field Threading**. Compare active-field, all-branches, root-level, and cursor activation while moving between `project`, `contributors`, and their descendants.
5. Install and enable **Style Settings**, then open **Nested Properties** there to adjust guide lines, depth colors, breadcrumb sizing, typography, and spacing. Every numerical slider has a synchronized precise text box.

Static main-UI and breadcrumb guides are enabled by default. The hover breadcrumb and threading master switches are disabled by default, so enabling this note's demonstrations is deliberate.

## Settings coverage

The plugin's searchable settings page exposes every persisted switch below. Child switches are disabled until their parent switch is enabled.

- `isFullKeyDisplayEnabled`
- `isPropertyFieldHoverBreadcrumbEnabled`
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
