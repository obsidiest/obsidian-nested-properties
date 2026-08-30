# CHANGELOG

## 2.0.0

- breaking: rename the plugin, manifest ID, command namespace, release assets, and installation folder to Nested Properties Advanced (`nested-properties-advanced`)
- fix: restore Ctrl+Y after an escaped Live Preview property edit by preserving native handling first, then replaying the exact captured metadata transaction only when both native redo paths remain unchanged
- fix: use geometric property-row hit testing so threading and hover-breadcrumb scopes cover their configured full widths
- fix: map Source-mode hover targets through editor coordinates so root, flattened, repeated, and nested fields resolve reliably
- fix: suppress the native ancestor-tree focus background while Highlight Active Property Field Tree is disabled
- feat: add default-enabled Live Preview, Source, and Reading-mode visibility switches for main-UI property threading and static tree indentation guides
- feat: render static guides and active property threading alongside raw Source-mode frontmatter
- feat: wrap complete hover-breadcrumb property names by default behind a searchable expansion switch
- fix: widen the default hover breadcrumb and inset its root guide so long names wrap legibly and the top-level spine is not clipped
- feat: add separate themed Style Settings controls for active-tree background and outline colors, with neutral gray and black defaults
- fix: make nested object keys editable in Live Preview while keeping structural array indices read-only
- fix: activate property threading across the full property key/value row, including Source-mode root and flattened fields
- feat: add selectable full-field, full-key, and icon/expansion-toggle hover-breadcrumb activation scopes
- fix: disambiguate repeated Source-mode YAML keys by their visible editor line so breadcrumbs retain the complete ancestry
- fix: render enabled static guides and threading above hover-breadcrumb rows
- feat: remember per-note Expand/Collapse All Nested Properties and full-key-name states across restarts
- feat: add global and per-note controls for nested-property expansion and full key names, including disabled header-button states
- feat: rename the full-key header action dynamically to Expand Full Key Names or Collapse Full Key Names
- feat: add optional active property-tree highlighting with Style Settings controls
- fix: render property visuals only after layout readiness and only for shown metadata editors, reusing unchanged tab renders and invalidating only the editor that changed
- fix: build guide overlays off-DOM, prune collapsed descendants, cache computed Style Settings values, and batch expand/collapse-all redraws
- fix: keep Style Settings precision controls dormant while their section is closed and remove the synchronous whole-workspace Style Settings parse during startup
- fix: isolate property visuals and Style Settings observers from unrelated Live Preview DOM churn
- fix: mirror fresh production `main.js` and `styles.css` artifacts to the repository root for flat-layout local deployment scripts
- feat: add searchable settings for property hover breadcrumbs, static tree guides, and property-field threading
- feat: add clickable, keyboard-navigable property ancestry breadcrumbs in Live Preview, Source, and Reading modes
- feat: add main-UI and breadcrumb tree guides with active-path, all-branch, root-level, and cursor-activated threading modes
- feat: add comprehensive Style Settings controls with synchronized precise numeric inputs and themed thread colors
- test: cover property trees, source frontmatter parsing, breadcrumb navigation, guide geometry, settings defaults, and release configuration
- build: attest every published release asset with GitHub artifact attestations

## 1.4.4

- docs(readme): render the same in Obsidian's plugin page as on GitHub
- chore: update libs
- chore: update obsidian-dev-utils to 94.6.1
- chore: update obsidian-dev-utils to 94.6.0
- fix: override deepmerge-ts to clear GHSA-ggr8-5vv4-36mx
- test: gate the demo vault by clicking every code button
- chore: teach cspell the advisory wording
- chore: update libs
- docs(demo-vault): give the cumulative walkthrough a reset
- docs: capture the community-store screenshot set

## 1.4.3

- docs: make the demo vault the documentation, in the standard layout
- feat(demo-vault): migrate to obsidian-dev-utils 93.3.1 and adopt the authoring convention

## 1.4.2

- chore: update libs and adopt obsidian-integration-testing 10

## 1.4.1

- test: cover the expanded-path bookkeeping of expand/collapse all
- fix: await the settings load before the renderer that reads them
- chore: update libs
- refactor(test): collapse the shared integration suites per G47
- chore: update libs
- chore(vitest): adopt the shared Obsidian plugin vitest configuration
- chore: update libs and clear the npm audit
- docs: fix the demo vault download instructions

## 1.4.0

- feat: re #1
- docs: demo nested-property commands in demo vault (re #6, re #1)
- test: add behavioral integration tests for nested-property commands (re #6, re #1)
- feat: re #1
- feat: re #6

## 1.3.1

- fix: re #7
- chore: update libs

## 1.3.0

- test: reach 100% unit-test coverage
- chore: spellcheck
- feat: re #8

## 1.2.16

- fix: expand long key

## 1.2.15

- chore: update libs

## 1.2.14

- chore: update libs
- chore(demo-vault): drop committed Invocables placeholder
- fix(demo-vault): export invoke() from startup script; add Invocables folder

## 1.2.13

- docs: standardize demo-vault README
- docs: drop per-plugin demo-vault setup notes (bootstrap covered by ODU harness)
- docs: unnumber demo-vault setup notes
- Merge branch 'T119-renumber': number ONP demo vault example notes (S2)
- Merge branch 'T119': adopt ODU 87.x demo-vault helpers + coverage suite (S2)

## 1.2.12

- fix: re #9
- feat: demo-vault

## 1.2.11

- feat: re #9

## 1.2.10

- chore: update libs
- chore: update obsidian-dev-utils to 85.0.0
- refactor: pass params objects to nested property renderer
- build: lock typescript to 6.0.3
- test: wire integration-testing vitest-setup into integration projects
- chore: update libs
- chore: clean up tsconfig

## 1.2.9

- refactor: new template

## 1.2.8

- refactor: new template

## 1.2.7

- chore: update libs

## 1.2.6

- chore: update libs
- chore: upgrade dependencies and green up all checks

## 1.2.5

- chore: update template

## 1.2.4

- refactor: new template

## 1.2.3

- refactor: new template

## 1.2.2

- chore: update libs

## 1.2.1

- tests: add 100% coverage
- refactor: new template

## 1.2.0

- Style improvements: use native cursor, center chevrons, fit-content add property buttons (#5 by @davidvkimball)
- feat: add mixed list type

## 1.1.0

- test: add unit tests
- fix: hide wrong type warning
- feat: allow scrolling with keyboard
- feat: add floating scrollbar
- fix: `add item` button to lists re #3 #4

## 1.0.0

- feat: initial
