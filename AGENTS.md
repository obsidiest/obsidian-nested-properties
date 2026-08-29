# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Nested Properties Advanced is an Obsidian plugin that lets you view and edit nested frontmatter properties, rendering nested YAML objects and arrays as a collapsible tree inside the Properties editor with property guides, threading, hover breadcrumbs, context menus, add/cut/copy/paste/remove, and horizontal scrolling. It is built on `obsidian-dev-utils`.

## Commands

| Task              | Command                    |
|-------------------|----------------------------|
| TypeScript check  | `npm run build:compile`    |
| Build             | `npm run build`            |
| Dev (watch)       | `npm run dev`              |
| Lint              | `npm run lint`             |
| Lint (fix)        | `npm run lint:fix`         |
| Format            | `npm run format`           |
| Format (check)    | `npm run format:check`     |
| Spellcheck        | `npm run spellcheck`       |
| Markdown lint     | `npm run lint:md`          |
| Markdown lint fix | `npm run lint:md:fix`      |
| Unit tests        | `npm test`                 |
| Coverage          | `npm run test:coverage`    |
| Integration tests | `npm run test:integration` |
| Commit (wizard)   | `npm run commit`           |

## Architecture

- **Root config files** are thin re-exports — actual logic lives in `scripts/` (`eslint.config.mts` → `scripts/eslint-config.ts`, etc.).
- **`src/`** — plugin source:
  - `main.ts` — Obsidian entry point (default export of `Plugin`); imports the global stylesheet.
  - `plugin.ts` — `Plugin` extends `obsidian-dev-utils`' `PluginBase`; `onloadImpl()` wires settings persistence and the searchable `NestedPropertiesPluginSettingTab`, adds the nested renderer and `PropertyFieldVisualsComponent`, enhances Style Settings controls with precise numerical inputs, registers the full-key-display and vault-operation commands, and adds native-search support.
  - `plugin-settings.ts` / `plugin-settings-component.ts` / `plugin-setting-tab.ts` — persisted feature switches and a declarative Obsidian 1.13 settings tab. The tab groups hover breadcrumbs, static main-UI guides, and property-field threading; subordinate controls remain searchable but disabled until their parent feature is enabled.
  - `nested-property-renderer.ts` — `NestedPropertyRendererComponent` (Obsidian `Component`); the core renderer that wires up the property widgets, patches, context menus, expand/collapse state, and the floating scrollbar. `toggleFullKeyDisplay()` flips a `nested-properties-full-key-display` body class across all windows (via `AllWindowsEventComponent` + `getAllDomWindows`), which the stylesheet uses to show full (untruncated) keys — both **top-level** object property keys and **nested** keys — and persists the new state via the injected `PluginSettingsComponent` (read back on load to restore it). Because key text is rendered in `<input>` elements, full display works by widening (`width: auto`) rather than wrapping; each input's `size` is set to its value length (`renderComplexWidget` does this for the native top-level key input, `renderKeyEl`/`renderEntry` for nested ones) so `width: auto` can expand it — the `size` stays inert while the toggle is off because Obsidian's default input width wins. The same toggle is exposed as an inline `clickable-icon` button (`.nested-properties-full-key-toggle`) injected into the Properties header actions by `injectHeaderButtons`; its active appearance is driven purely by the body class (no per-button state sync).
  - `value-utils.ts` — pure helpers for converting frontmatter values between property types and value-shape type guards (`convertValue`, `isComplexValue`, `isSimpleArray`, `isLossyConversion`, etc.).
  - `type-change-modal.ts` — `TypeChangeModal` (Obsidian `Modal`) confirming a potentially lossy property-type change before applying it.
  - `floating-scrollbar.ts` — `FloatingScrollbarComponent` (Obsidian `Component`) providing a floating horizontal scrollbar for deeply nested property containers.
  - `property-field-tree.ts` — builds the live metadata-editor property forest and parses source-mode YAML frontmatter into the same parent/child shape used by breadcrumbs and threading.
  - `property-field-visuals.ts` — cross-window overlays for continuous static guide spines/connectors, active-path and all-branch threading, root-level threading, cursor activation, and clickable/scrollable/keyboard-navigable hover breadcrumbs in Live Preview, Source, and Reading modes.
  - `style-settings-precision.ts` — augments the external Style Settings plugin's generated controls with synchronized exact-value inputs for every numerical slider and native pickers for fallback/override colors.
  - `patches/` — `MonkeyAroundComponent`-based runtime patches of Obsidian internals:
    - `metadata-type-manager-get-type-info-patch-component.ts` — patches `MetadataTypeManager.getTypeInfo` to route nested/complex values to the list, mixed-list, and object widgets.
    - `multi-text-property-widget-patch-component.ts` — patches the multitext property widget's `validate` to accept nested array values.
    - `unknown-widget-render-patch-component.ts` — patches the unknown-widget renderer to display nested objects/arrays.
    - `nested-property-search-patch-component.ts` — teaches Obsidian's **native global search** to match nested frontmatter (issue #1). Patches the internal property-matcher node's `match` to call the original first (top-level behavior untouched) then *add* matches for dotted nested paths (`[book.author: value]`), so nested queries work in the real search bar and compose with every other operator — no separate command. Bootstraps off the search view's first `startSearch` to reach the `SearchQuery` constructor, compiles a throwaway probe query to grab the shared property-matcher prototype, and structurally feature-detects that shape before patching (no-ops to native behavior if Obsidian's internals ever change). **Deviation (G51/G66):** Obsidian exposes no public API for search operators and `obsidian-typings` has no `SearchView`/`SearchQuery`/matcher types, so the component declares minimal best-effort internal interfaces reverse-engineered from the 1.13.3 build; these should be reported upstream to `obsidian-typings`. Verified end-to-end against real Obsidian by `nested-property-search-shared.integration.test.ts`, on both the latest public / min-supported **1.12.7** and catalyst **1.13.3** (G99 — the internal seam is version-sensitive, so both channels were run).
  - `styles/` — `main.scss` contains both plugin styles and the preserved Style Settings metadata schema for guide geometry, patterns, thread depth colors, and breadcrumb appearance; `scss.d.ts` is the style-import type declaration.
- **`main` field** points to `src/main.ts` (Obsidian plugin source entry). The canonical production artifacts are written to `dist/build/`; `npm run build` also mirrors fresh `main.js` and `styles.css` to the repository root for flat-layout local deployment scripts, while `npm run build:clean` removes those ignored mirrors.
