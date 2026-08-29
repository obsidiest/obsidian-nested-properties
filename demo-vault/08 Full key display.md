---
aVeryLongPropertyKeyNameThatGetsTruncatedWithATrailingEllipsisByDefault: value
metadata:
  anotherRatherLongNestedKeyThatAlsoGetsTruncatedWhenSpaceIsTight: value
  short: ok
---
# Full key names

Long keys can either be expanded to their full text or collapsed with a trailing ellipsis to save space. This applies to both plain top-level keys and nested keys. Full key names are expanded by default.

## Try it

1. Look at the long keys above; they are expanded by default.
2. Click **Collapse Full Key Names** in the Properties header (the wrap-text icon next to the collapse/expand-all button), or run the **Toggle full key names** command.
3. The keys truncate; the same button is now named **Expand Full Key Names**. Toggle again to restore the full text.

With **Remember Last Used Main UI Toggle States** and **Remember Full Key Names Expansion Toggle State** enabled, the per-note choice is saved in `fullKeyNamesExpansionStateByNote` and survives restarts. The global and per-note controls can be configured independently in the plugin settings.

## Switch it with a button

The block below toggles full key names for you. Manual equivalent: use the header button or the command palette as described above.

```code-button
---
caption: Toggle full key names
---
require('/demoSetup.ts').toggleFullKeyDisplay(app);
```
