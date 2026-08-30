/* eslint-disable func-style, perfectionist/sort-classes -- Declarative setting dependencies are most readable beside their setting definitions. */

import type {
  SettingDefinitionItem,
  SettingGroupItem
} from 'obsidian';

import {
  App,
  Plugin,
  PluginSettingTab
} from 'obsidian';

import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettings } from './plugin-settings.ts';

export type BooleanSettingsKey = BooleanSettingsKeyMap[keyof BooleanSettingsKeyMap];

type BooleanSettingsKeyMap = {
  [Key in keyof PluginSettings]: PluginSettings[Key] extends boolean ? Key : never;
};

const DEFAULT_SETTINGS = new PluginSettings();
const SETTINGS_KEYS = new Set<string>(Object.entries(DEFAULT_SETTINGS).filter(([, value]) => typeof value === 'boolean').map(([key]) => key));

export interface NestedPropertiesPluginSettingTabConstructorParams {
  readonly app: App;
  onSettingsChanged(this: void, key: BooleanSettingsKey, isEnabled: boolean): void;
  readonly plugin: Plugin;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class NestedPropertiesPluginSettingTab extends PluginSettingTab {
  private readonly onSettingsChanged: (key: BooleanSettingsKey, isEnabled: boolean) => void;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: NestedPropertiesPluginSettingTabConstructorParams) {
    super(params.app, params.plugin);
    this.onSettingsChanged = params.onSettingsChanged;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public override getSettingDefinitions(): SettingDefinitionItem<BooleanSettingsKey>[] {
    const settings = this.pluginSettingsComponent.settings;
    const isBreadcrumbOff = (): boolean => !settings.isPropertyFieldHoverBreadcrumbEnabled;
    const isThreadingOff = (): boolean => !settings.isPropertyFieldThreadingEnabled;
    const isMainUiThreadingOff = (): boolean => isThreadingOff() || !settings.isPropertyFieldThreadingInMainUiEnabled;
    const isMainUiStaticGuidesOff = (): boolean => !settings.isNestedPropertiesMainUiStaticTreeIndentationGuidesEnabled;
    const isHoverBreadcrumbThreadingOff = (): boolean => isThreadingOff() || isBreadcrumbOff() || !settings.isPropertyFieldThreadingInHoverBreadcrumbEnabled;
    const isRootThreadingOff = (): boolean => isThreadingOff() || !settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled;

    return [
      this.group('Main UI Toggle States', [
        this.toggle('isRememberLastUsedMainUiToggleStatesEnabled', 'Remember Last Used Main UI Toggle States', 'Remember the last per-note expansion states selected from the Properties header across Obsidian restarts.', ['persist properties header toggles', 'restore nested property ui state']),
        this.toggle('isRememberAllNestedPropertiesExpansionToggleStateEnabled', 'Remember All Nested Properties Expansion Toggle State', 'Remember whether each note last used Expand All or Collapse All for nested properties.', ['persist expand collapse all', 'restore nested tree expansion'], () => !settings.isRememberLastUsedMainUiToggleStatesEnabled),
        this.toggle('isRememberFullKeyNamesExpansionToggleStateEnabled', 'Remember Full Key Names Expansion Toggle State', 'Remember whether each note last expanded or collapsed its full property key names.', ['persist full key names', 'restore key expansion'], () => !settings.isRememberLastUsedMainUiToggleStatesEnabled),
        this.toggle('isGlobalToggleAllNestedPropertiesEnabled', 'Global Toggle All Nested Properties', 'Enable global Expand All and Collapse All controls. Enabling this applies the selected global state over stored per-note states.', ['global nested property expansion', 'all notes expand collapse']),
        this.toggle('isGlobalExpandAllNestedPropertiesEnabled', 'Global Expand All Nested Properties', 'Expand every nested property tree. Enabling this turns off Global Collapse All Nested Properties.', ['expand nested properties in all notes', 'global expand tree'], () => !settings.isGlobalToggleAllNestedPropertiesEnabled),
        this.toggle('isGlobalCollapseAllNestedPropertiesEnabled', 'Global Collapse All Nested Properties', 'Collapse every nested property tree. Enabling this turns off Global Expand All Nested Properties.', ['collapse nested properties in all notes', 'global collapse tree'], () => !settings.isGlobalToggleAllNestedPropertiesEnabled),
        this.toggle('isPerNoteToggleAllNestedPropertiesEnabled', 'Per-Note Toggle All Nested Properties', 'Allow the Expand/Collapse All Nested Properties button in each note. Disabling this leaves the button visible but inaccessible.', ['per note expansion button', 'disable properties header collapse toggle']),
        this.toggle('isGlobalToggleFullKeyNamesEnabled', 'Global Toggle Full Key Names', 'Enable global Expand and Collapse Full Key Names controls. Enabling this applies the selected global state over stored per-note states.', ['global full property keys', 'all notes key expansion']),
        this.toggle('isGlobalExpandFullKeyNamesEnabled', 'Global Expand Full Key Names', 'Expand full property key names in every note. Enabling this turns off Global Collapse Full Key Names.', ['show complete keys in all notes', 'global untruncated keys'], () => !settings.isGlobalToggleFullKeyNamesEnabled),
        this.toggle('isGlobalCollapseFullKeyNamesEnabled', 'Global Collapse Full Key Names', 'Collapse full property key names in every note. Enabling this turns off Global Expand Full Key Names.', ['truncate keys in all notes', 'global collapsed keys'], () => !settings.isGlobalToggleFullKeyNamesEnabled),
        this.toggle('isPerNoteToggleFullKeyNamesEnabled', 'Per-Note Toggle Full Key Names', 'Allow the Expand/Collapse Full Key Names button in each note. Disabling this leaves the button visible but inaccessible.', ['per note full key button', 'disable properties header key toggle'])
      ]),
      this.group('Property Field Hover Breadcrumb', [
        this.toggle('isPropertyFieldHoverBreadcrumbEnabled', 'Property Field Hover Breadcrumb', 'Show a floating, clickable ancestor hierarchy while hovering a property field using the selected activation scope.', ['property ancestry popover', 'hover path', 'field breadcrumb']),
        this.toggle('isPropertyFieldHoverBreadcrumbInLivePreviewEnabled', 'Hover Breadcrumb in Live Preview', 'Show the property-field breadcrumb in Live Preview.', ['live preview popover', 'wysiwyg breadcrumb'], isBreadcrumbOff),
        this.toggle('isPropertyFieldHoverBreadcrumbInSourceModeEnabled', 'Hover Breadcrumb in Source Mode', 'Show the property-field breadcrumb while hovering raw frontmatter in Source mode.', ['raw yaml breadcrumb', 'source popover'], isBreadcrumbOff),
        this.toggle('isPropertyFieldHoverBreadcrumbInReadingModeEnabled', 'Hover Breadcrumb in Reading Mode', 'Show the property-field breadcrumb in Reading mode.', ['rendered properties breadcrumb', 'reading popover'], isBreadcrumbOff),
        this.toggle('isFullPropertyFieldNameExpansionInHoverBreadcrumbEnabled', 'Full Property Field Name Expansion in a Property Field Hover Breadcrumb', 'Wrap long property field names onto additional lines so the complete name remains visible inside the breadcrumb.', ['wrap long breadcrumb names', 'complete property names in popover', 'multiline breadcrumb fields'], isBreadcrumbOff),
        this.subheading('Property Field Hover Breadcrumb Activation Scope', 'Choose whether the breadcrumb activates across the whole field, the whole key, or only the property icon/Source expansion control.'),
        this.toggle('isFullWidthPropertyFieldHoverActivationEnabled', 'Full-Width Property Field Hover Activation', 'Activate the breadcrumb anywhere across the full property row, including its key and value. This scope takes priority over the key-only scope.', ['whole property row breadcrumb', 'key and value hover popover', 'full field activation'], isBreadcrumbOff),
        this.toggle('isFullWidthPropertyKeyHoverActivationEnabled', 'Full-Width Property Key Hover Activation', 'Activate the breadcrumb anywhere across the property key, including its icon or Source-mode expansion toggle. When both scope toggles are off, only that icon or expansion toggle activates it.', ['property key hover popover', 'key width breadcrumb', 'icon fallback activation'], isBreadcrumbOff)
      ]),
      this.group('Static Tree Indentation Guides', [
        this.toggle('isNestedPropertiesMainUiStaticTreeIndentationGuidesEnabled', 'Main UI Static Tree Indentation Guides', 'Show continuous sibling spines and horizontal connectors in the main Properties UI.', ['property tree guides', 'main ui indentation lines', 'static property spines']),
        this.toggle('isNestedPropertiesMainUiStaticTreeIndentationGuidesInLivePreviewEnabled', 'Static Tree Indentation Guides in Live Preview', 'Show the main property-tree guides in Live Preview.', ['live preview property guides', 'wysiwyg static tree lines'], isMainUiStaticGuidesOff),
        this.toggle('isNestedPropertiesMainUiStaticTreeIndentationGuidesInSourceModeEnabled', 'Static Tree Indentation Guides in Source Mode', 'Show property-tree guides alongside raw frontmatter in Source mode.', ['source yaml property guides', 'raw frontmatter static tree lines'], isMainUiStaticGuidesOff),
        this.toggle('isNestedPropertiesMainUiStaticTreeIndentationGuidesInReadingModeEnabled', 'Static Tree Indentation Guides in Reading Mode', 'Show the main property-tree guides in Reading mode.', ['reading property guides', 'rendered static tree lines'], isMainUiStaticGuidesOff),
        this.toggle('isPropertyFieldHoverBreadcrumbStaticTreeIndentationGuidesEnabled', 'Hover Breadcrumb Static Tree Indentation Guides', 'Show continuous sibling spines and branch connectors inside the breadcrumb tree.', ['breadcrumb tree lines', 'popover guides'], isBreadcrumbOff)
      ]),
      this.group('Property Field Threading', [
        this.toggle('isPropertyFieldThreadingEnabled', 'Enable Property Field Threading', 'Globally enable active property-tree path and branch highlighting.', ['logseq property path', 'property tree highlight', 'field threading']),
        this.toggle('isPropertyFieldThreadingInMainUiEnabled', 'Main UI Property Field Threading', 'Render enabled threading modes over the main Properties UI.', ['thread properties editor', 'thread main properties panel'], isThreadingOff),
        this.toggle('isPropertyFieldThreadingInLivePreviewEnabled', 'Property Field Threading in Live Preview', 'Show active property-field threading in Live Preview.', ['live preview property thread', 'wysiwyg active property path'], isMainUiThreadingOff),
        this.toggle('isPropertyFieldThreadingInSourceModeEnabled', 'Property Field Threading in Source Mode', 'Show active property-field threading alongside raw frontmatter in Source mode.', ['source yaml property thread', 'raw frontmatter active path'], isMainUiThreadingOff),
        this.toggle('isPropertyFieldThreadingInReadingModeEnabled', 'Property Field Threading in Reading Mode', 'Show active property-field threading while hovering rendered properties in Reading mode.', ['reading property thread', 'rendered active property path'], isMainUiThreadingOff),
        this.toggle('isPropertyFieldThreadingInHoverBreadcrumbEnabled', 'Hover Breadcrumb Property Field Threading', 'Render enabled threading modes inside the hover breadcrumb.', ['thread breadcrumb', 'thread popover tree'], () => isThreadingOff() || isBreadcrumbOff()),
        this.toggle('isActiveCursorPropertyFieldThreadingEnabled', 'Active Cursor Property Field Threading', 'Use the focused property field instead of pointer hover to activate all enabled regular and root-level threading modes.', ['caret property thread', 'focused field threading', 'cursor activated property path'], isThreadingOff),
        this.toggle('isActivePropertyFieldThreadingEnabled', 'Active Property Field Threading', 'Highlight the complete nested path to the active property key or value.', ['active property path', 'hovered field ancestors'], isThreadingOff),
        this.toggle('isActivePropertyFieldThreadingInMainUiEnabled', 'Active Property Field Threading in Main UI', 'Show the active-field path in the main Properties UI.', ['active path main ui'], () => isMainUiThreadingOff() || !settings.isActivePropertyFieldThreadingEnabled),
        this.toggle('isActivePropertyFieldThreadingInHoverBreadcrumbEnabled', 'Active Property Field Threading in Hover Breadcrumb', 'Show the active-field path in the hover breadcrumb.', ['active path popover'], () => isHoverBreadcrumbThreadingOff() || !settings.isActivePropertyFieldThreadingEnabled),
        this.toggle('isAllBranchesOfActivePropertyFieldTreeThreadingEnabled', 'All Branches of an Active Property Field Tree Threading', 'Highlight every branch in the active root property tree.', ['whole property tree thread', 'all active property branches'], isThreadingOff),
        this.toggle('isAllBranchesOfActivePropertyFieldTreeThreadingInMainUiEnabled', 'All Branches Threading in Main UI', 'Show all branches of the active property tree in the main Properties UI.', ['whole tree main ui'], () => isMainUiThreadingOff() || !settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled),
        this.toggle('isAllBranchesOfActivePropertyFieldTreeThreadingInHoverBreadcrumbEnabled', 'All Branches Threading in Hover Breadcrumb', 'Show all branches of the active property tree in the hover breadcrumb.', ['whole tree popover'], () => isHoverBreadcrumbThreadingOff() || !settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled),
        this.toggle('isActiveRootLevelPropertyFieldTreeThreadingEnabled', 'Active Root-Level Property Field Tree Threading', 'Allow root-level property trees—including a tree with only one field—to participate in threading.', ['root property threading', 'top level field tree'], isThreadingOff),
        this.toggle('isActiveRootLevelPropertyFieldThreadingEnabled', 'Active Root-Level Property Field Threading', 'Highlight the active root-level field and its connection to the current nested path.', ['active root field', 'top-level active path'], isRootThreadingOff),
        this.toggle('isActiveRootLevelPropertyFieldThreadingInMainUiEnabled', 'Active Root-Level Property Field Threading in Main UI', 'Show active root-level threading in the main Properties UI.', ['root path main ui'], () => isRootThreadingOff() || isMainUiThreadingOff() || !settings.isActiveRootLevelPropertyFieldThreadingEnabled),
        this.toggle('isActiveRootLevelPropertyFieldThreadingInHoverBreadcrumbEnabled', 'Active Root-Level Property Field Threading in Hover Breadcrumb', 'Show active root-level threading in the hover breadcrumb.', ['root path popover'], () => isRootThreadingOff() || isHoverBreadcrumbThreadingOff() || !settings.isActiveRootLevelPropertyFieldThreadingEnabled),
        this.toggle('isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled', 'All Branches of an Active Root-Level Property Field Tree Threading', 'Highlight every root-level property tree and each of its nested branches.', ['all root properties', 'whole root-level forest'], isRootThreadingOff),
        this.toggle('isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInMainUiEnabled', 'All Root-Level Branches Threading in Main UI', 'Show every root-level property-tree branch in the main Properties UI.', ['all roots main ui'], () => isRootThreadingOff() || isMainUiThreadingOff() || !settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled),
        this.toggle('isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInHoverBreadcrumbEnabled', 'All Root-Level Branches Threading in Hover Breadcrumb', 'Show every root-level property-tree branch in the hover breadcrumb.', ['all roots popover'], () => isRootThreadingOff() || isHoverBreadcrumbThreadingOff() || !settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled)
      ]),
      this.group('Property Field Highlighting', [
        this.toggle('isHighlightActivePropertyFieldTreeEnabled', 'Highlight Active Property Field Tree', 'Highlight the active property field and its containing nested property tree while a key or value is focused.', ['focused nested property tree', 'active property ancestry highlight'])
      ])
    ];
  }

  public override getControlValue(key: string): unknown {
    if (!SETTINGS_KEYS.has(key)) {
      return undefined;
    }
    return this.pluginSettingsComponent.settings[key as BooleanSettingsKey];
  }

  public override async setControlValue(key: string, value: unknown): Promise<void> {
    if (!SETTINGS_KEYS.has(key) || typeof value !== 'boolean') {
      return;
    }
    await this.pluginSettingsComponent.editAndSave((settings) => {
      const settingsKey = key as BooleanSettingsKey;
      settings[settingsKey] = value;
      if (value) {
        disableMutuallyExclusiveSetting(settings, settingsKey);
      }
    });
    this.onSettingsChanged(key as BooleanSettingsKey, value);
    this.update();
  }

  private group(heading: string, items: SettingGroupItem<BooleanSettingsKey>[]): SettingDefinitionItem<BooleanSettingsKey> {
    return { heading, items, type: 'group' };
  }

  private subheading(name: string, desc: string): SettingGroupItem<BooleanSettingsKey> {
    return {
      aliases: ['breadcrumb activation scope', 'hover activation width'],
      desc,
      name,
      render: (setting): void => {
        setting.setHeading();
      }
    };
  }

  private toggle(key: BooleanSettingsKey, name: string, desc: string, aliases: string[], isDisabled?: () => boolean): SettingGroupItem<BooleanSettingsKey> {
    return {
      aliases,
      control: {
        defaultValue: DEFAULT_SETTINGS[key],
        ...(isDisabled && { disabled: isDisabled }),
        key,
        type: 'toggle'
      },
      desc,
      name
    };
  }
}

function disableMutuallyExclusiveSetting(settings: PluginSettings, key: BooleanSettingsKey): void {
  const counterpartByKey: Partial<Record<BooleanSettingsKey, BooleanSettingsKey>> = {
    isGlobalCollapseAllNestedPropertiesEnabled: 'isGlobalExpandAllNestedPropertiesEnabled',
    isGlobalCollapseFullKeyNamesEnabled: 'isGlobalExpandFullKeyNamesEnabled',
    isGlobalExpandAllNestedPropertiesEnabled: 'isGlobalCollapseAllNestedPropertiesEnabled',
    isGlobalExpandFullKeyNamesEnabled: 'isGlobalCollapseFullKeyNamesEnabled'
  };
  const counterpart = counterpartByKey[key];
  if (counterpart !== undefined) {
    settings[counterpart] = false;
  }
}

/* eslint-enable func-style, perfectionist/sort-classes -- Restore repository ordering rules. */
