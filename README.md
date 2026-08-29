# Nested Properties Advanced

YAML frontmatter nests, but [Obsidian](https://obsidian.md/)'s Properties editor does not. Give a note a nested structure and the panel shows you nothing useful — the values are there in the file, and the only way to read or change them is to edit the raw YAML by hand and hope you get the indentation right.

This plugin renders nested objects and arrays as a collapsible tree in the Properties panel, where you can read them, edit them, change their types, and rename or delete a nested key across the whole vault.

```yaml
---
level1simple: simple1
level1Nested:
  level2simple: simple2
  level2Nested:
    level3simple: simple3
    level3Nested:
      level4simple: simple4
      level4Nested:
        level5simple: simple5
---
```

<!-- markdownlint-disable MD033 -->

<a href="https://github.com/obsidiest/obsidian-nested-properties-advanced/blob/HEAD/images/screenshots/screenshot-desktop-1.png"><img src="images/screenshots/screenshot-desktop-1.png" alt="Without the plugin: nested values have nowhere to go" width="600"></a>

<details>
<summary>More screenshots</summary>

<div>
<a href="https://github.com/obsidiest/obsidian-nested-properties-advanced/blob/HEAD/images/screenshots/screenshot-desktop-2.png"><img src="images/screenshots/screenshot-desktop-2.png" alt="With it: every nested key on its own row" width="600"></a>
<a href="https://github.com/obsidiest/obsidian-nested-properties-advanced/blob/HEAD/images/screenshots/screenshot-desktop-3.png"><img src="images/screenshots/screenshot-desktop-3.png" alt="Arrays nest too, including arrays of objects" width="600"></a>
<a href="https://github.com/obsidiest/obsidian-nested-properties-advanced/blob/HEAD/images/screenshots/screenshot-desktop-4.png"><img src="images/screenshots/screenshot-desktop-4.png" alt="Cut, copy, paste or remove any node" width="600"></a>
<a href="https://github.com/obsidiest/obsidian-nested-properties-advanced/blob/HEAD/images/screenshots/screenshot-desktop-5.png"><img src="images/screenshots/screenshot-desktop-5.png" alt="Rename a nested key in every note at once" width="600"></a>
<a href="https://github.com/obsidiest/obsidian-nested-properties-advanced/blob/HEAD/images/screenshots/screenshot-mobile-1.png"><img src="images/screenshots/screenshot-mobile-1.png" alt="Without the plugin: nested values have nowhere to go" width="270"></a>
<a href="https://github.com/obsidiest/obsidian-nested-properties-advanced/blob/HEAD/images/screenshots/screenshot-mobile-2.png"><img src="images/screenshots/screenshot-mobile-2.png" alt="With it: every nested key on its own row" width="270"></a>
<a href="https://github.com/obsidiest/obsidian-nested-properties-advanced/blob/HEAD/images/screenshots/screenshot-mobile-3.png"><img src="images/screenshots/screenshot-mobile-3.png" alt="Arrays nest too, including arrays of objects" width="270"></a>
<a href="https://github.com/obsidiest/obsidian-nested-properties-advanced/blob/HEAD/images/screenshots/screenshot-mobile-4.png"><img src="images/screenshots/screenshot-mobile-4.png" alt="Cut, copy, paste or remove any node" width="270"></a>
<a href="https://github.com/obsidiest/obsidian-nested-properties-advanced/blob/HEAD/images/screenshots/screenshot-mobile-5.png"><img src="images/screenshots/screenshot-mobile-5.png" alt="Show long keys in full instead of truncated" width="270"></a>
</div>

</details>

<!-- markdownlint-enable MD033 -->

## Demo vault

**The documentation is a demo vault.** Every feature has a note whose own frontmatter demonstrates it — open the note, look at the Properties panel, and you are looking at the feature.

**[Start reading here](<./demo-vault/00 Start.md>)** — it is plain markdown, so it works on GitHub with nothing installed.

A copy of the vault ships with every release. You can access it via any of the following:

1. Running the **Nested Properties Advanced: Open demo vault** command.
2. Downloading `nested-properties-advanced-demo-vault-<version>.zip` (`<version>` is the release version) from the [Releases](https://github.com/obsidiest/obsidian-nested-properties-advanced/releases).
3. Browsing its source in [`demo-vault/`](./demo-vault/README.md) in this repository.

## What it does

- **Nested objects and arrays as a tree** in the Properties panel, collapsible to any depth. [01 Nested objects](<./demo-vault/01 Nested objects.md>) · [02 Nested arrays](<./demo-vault/02 Nested arrays.md>) · [05 Deeply nested and scrolling](<./demo-vault/05 Deeply nested and scrolling.md>)
- **Mixed and complex shapes** — lists holding different types, and arrays of objects. [03 Mixed lists](<./demo-vault/03 Mixed lists.md>) · [04 Array of objects](<./demo-vault/04 Array of objects.md>)
- **Edit in place** — add, rename, remove and reorder entries from the context menu, and change a nested property's type without rewriting the YAML. [06 Context menu actions](<./demo-vault/06 Context menu actions.md>) · [07 Changing property types](<./demo-vault/07 Changing property types.md>)
- **Rename or delete a nested key across the whole vault**, not just in the note you are looking at. [09 Vault-wide rename and delete](<./demo-vault/09 Vault-wide rename and delete.md>)
- **Find them** — search nested properties the way you search anything else. [10 Search nested properties](<./demo-vault/10 Search nested properties.md>)
- **See the full key** of a nested entry when the short name is ambiguous. [08 Full key display](<./demo-vault/08 Full key display.md>)
- **Follow the hierarchy at a glance** with continuous static tree indentation guides in the main Properties UI and hover breadcrumb. [11 Property field guides, breadcrumbs, and threading](<./demo-vault/11 Property field guides, breadcrumbs, and threading.md>)
- **Navigate a field's ancestry** from a clickable, scrollable, keyboard-navigable hover breadcrumb in Live Preview, Source, or Reading mode, with independent full-field, full-key, and icon/expansion-toggle activation scopes.
- **Thread an active property tree** by hovered field or focused cursor, with active-path, all-branches, root-level, Main UI, and Hover Breadcrumb controls adapted from [List Tree Indentation Guides 1.1.0](https://github.com/obsidiest/obsidian-list-tree-indentation-guides/releases/tag/1.1.0).
- **Remember or globally control Main UI toggles** for nested-tree expansion and full key names while keeping per-note controls visible and optionally inaccessible.
- **Style the visual system** through Style Settings, including guide geometry, line patterns, per-depth colors, active-tree highlighting, breadcrumb typography, spacing, borders, and shadows. Every numerical slider receives a synchronized precise numerical input.

The plugin settings page is searchable. Subfeature settings remain visible but inaccessible until their superordinate feature is enabled.

## Installation

The advanced fork uses the plugin ID and installation folder `nested-properties-advanced`.

### BRAT

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat).
2. Add `https://github.com/obsidiest/obsidian-nested-properties-advanced` as a beta plugin.
3. Enable **Nested Properties Advanced** in Obsidian's Community Plugins settings.

### Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the latest release and place them in:

```text
<vault>/.obsidian/plugins/nested-properties-advanced/
```

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command in the `DevTools Console`:

```js
window.DEBUG.enable('nested-properties-advanced');
```

For more details, refer to the [documentation](https://mnaoumov.dev/obsidian-dev-utils/guides/debugging/).

## Attribution

Nested Properties Advanced is maintained by [obsidiest](https://github.com/obsidiest), who directed the advanced feature design, supplied the reference implementations and screenshots, performed iterative Windows/Obsidian testing, and identified the interaction and performance regressions addressed in 2.0.0.

The 2.0.0 work adds property-field breadcrumbs, static tree guides, threading, cursor activation, active-tree highlighting, searchable settings, Style Settings precision controls, per-note/global UI-state controls, performance safeguards, release attestations, and editable nested object keys. Its guide and threading behavior adapts the implementation patterns established in [List Tree Indentation Guides 1.1.0](https://github.com/obsidiest/obsidian-list-tree-indentation-guides/releases/tag/1.1.0).

This project is founded on Michael Naumov's original [Nested Properties](https://github.com/mnaoumov/obsidian-nested-properties) plugin. His renderer, nested-property editing model, search integration, demo vault, and supporting utilities remain the foundation of this advanced fork.

## License

MIT

© 2026 [Michael Naumov](https://github.com/mnaoumov/)

© 2026 [obsidiest](https://github.com/obsidiest)
