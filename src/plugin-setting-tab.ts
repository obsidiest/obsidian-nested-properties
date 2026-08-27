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

type SettingsKey = keyof PluginSettings;

const SETTINGS_KEYS = new Set<string>(Object.keys(new PluginSettings()));

export interface NestedPropertiesPluginSettingTabConstructorParams {
  readonly app: App;
  onSettingsChanged(this: void): void;
  readonly plugin: Plugin;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class NestedPropertiesPluginSettingTab extends PluginSettingTab {
  private readonly onSettingsChanged: () => void;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: NestedPropertiesPluginSettingTabConstructorParams) {
    super(params.app, params.plugin);
    this.onSettingsChanged = params.onSettingsChanged;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public override getSettingDefinitions(): SettingDefinitionItem<SettingsKey>[] {
    const settings = this.pluginSettingsComponent.settings;
    const isBreadcrumbOff = (): boolean => !settings.isPropertyFieldHoverBreadcrumbEnabled;
    const isThreadingOff = (): boolean => !settings.isPropertyFieldThreadingEnabled;
    const isRootThreadingOff = (): boolean => isThreadingOff() || !settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled;

    return [
      this.group('General', [
        this.toggle('isFullKeyDisplayEnabled', 'Full key display', 'Show complete nested property keys instead of truncating them.', ['untruncated property keys', 'wide key inputs'])
      ]),
      this.group('Property Field Hover Breadcrumb', [
        this.toggle('isPropertyFieldHoverBreadcrumbEnabled', 'Enable Property Field Hover Breadcrumb', 'Show a floating, clickable ancestor hierarchy while hovering a property key or value.', ['property ancestry popover', 'hover path', 'field breadcrumb']),
        this.toggle('isPropertyFieldHoverBreadcrumbInLivePreviewEnabled', 'Hover Breadcrumb in Live Preview', 'Show the property-field breadcrumb in Live Preview.', ['live preview popover', 'wysiwyg breadcrumb'], isBreadcrumbOff),
        this.toggle('isPropertyFieldHoverBreadcrumbInSourceModeEnabled', 'Hover Breadcrumb in Source Mode', 'Show the property-field breadcrumb while hovering raw frontmatter in Source mode.', ['raw yaml breadcrumb', 'source popover'], isBreadcrumbOff),
        this.toggle('isPropertyFieldHoverBreadcrumbInReadingModeEnabled', 'Hover Breadcrumb in Reading Mode', 'Show the property-field breadcrumb in Reading mode.', ['rendered properties breadcrumb', 'reading popover'], isBreadcrumbOff),
        this.toggle('isPropertyFieldHoverBreadcrumbStaticTreeIndentationGuidesEnabled', 'Static Tree Indentation Guides in Hover Breadcrumb', 'Show continuous sibling spines and branch connectors inside the breadcrumb tree.', ['breadcrumb tree lines', 'popover guides'], isBreadcrumbOff)
      ]),
      this.group('Nested Properties Main UI Static Tree Indentation Guides', [
        this.toggle('isNestedPropertiesMainUiStaticTreeIndentationGuidesEnabled', 'Enable Main UI Static Tree Indentation Guides', 'Show continuous sibling spines and horizontal connectors in the main Properties UI.', ['property tree guides', 'main ui indentation lines', 'static property spines'])
      ]),
      this.group('Property Field Threading', [
        this.toggle('isPropertyFieldThreadingEnabled', 'Enable Property Field Threading', 'Globally enable active property-tree path and branch highlighting.', ['logseq property path', 'property tree highlight', 'field threading']),
        this.toggle('isPropertyFieldThreadingInMainUiEnabled', 'Property Field Threading in Main UI', 'Render enabled threading modes over the main Properties UI.', ['thread properties editor', 'thread main properties panel'], isThreadingOff),
        this.toggle('isPropertyFieldThreadingInHoverBreadcrumbEnabled', 'Property Field Threading in Hover Popover Breadcrumb', 'Render enabled threading modes inside the hover breadcrumb.', ['thread breadcrumb', 'thread popover tree'], () => isThreadingOff() || isBreadcrumbOff()),
        this.toggle('isActiveCursorPropertyFieldThreadingEnabled', 'Active Cursor Property Field Threading', 'Use the focused property field instead of pointer hover to activate all enabled regular and root-level threading modes.', ['caret property thread', 'focused field threading', 'cursor activated property path'], isThreadingOff),
        this.toggle('isActivePropertyFieldThreadingEnabled', 'Active Property Field Threading', 'Highlight the complete nested path to the active property key or value.', ['active property path', 'hovered field ancestors'], isThreadingOff),
        this.toggle('isActivePropertyFieldThreadingInMainUiEnabled', 'Active Property Field Threading in Main UI', 'Show the active-field path in the main Properties UI.', ['active path main ui'], () => isThreadingOff() || !settings.isActivePropertyFieldThreadingEnabled),
        this.toggle('isActivePropertyFieldThreadingInHoverBreadcrumbEnabled', 'Active Property Field Threading in Hover Breadcrumb', 'Show the active-field path in the hover breadcrumb.', ['active path popover'], () => isThreadingOff() || isBreadcrumbOff() || !settings.isActivePropertyFieldThreadingEnabled),
        this.toggle('isAllBranchesOfActivePropertyFieldTreeThreadingEnabled', 'All Branches of an Active Property Field Tree Threading', 'Highlight every branch in the active root property tree.', ['whole property tree thread', 'all active property branches'], isThreadingOff),
        this.toggle('isAllBranchesOfActivePropertyFieldTreeThreadingInMainUiEnabled', 'All Branches Threading in Main UI', 'Show all branches of the active property tree in the main Properties UI.', ['whole tree main ui'], () => isThreadingOff() || !settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled),
        this.toggle('isAllBranchesOfActivePropertyFieldTreeThreadingInHoverBreadcrumbEnabled', 'All Branches Threading in Hover Breadcrumb', 'Show all branches of the active property tree in the hover breadcrumb.', ['whole tree popover'], () => isThreadingOff() || isBreadcrumbOff() || !settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled),
        this.toggle('isActiveRootLevelPropertyFieldTreeThreadingEnabled', 'Active Root-Level Property Field Tree Threading', 'Allow root-level property trees—including a tree with only one field—to participate in threading.', ['root property threading', 'top level field tree'], isThreadingOff),
        this.toggle('isActiveRootLevelPropertyFieldThreadingEnabled', 'Active Root-Level Property Field Threading', 'Highlight the active root-level field and its connection to the current nested path.', ['active root field', 'top-level active path'], isRootThreadingOff),
        this.toggle('isActiveRootLevelPropertyFieldThreadingInMainUiEnabled', 'Active Root-Level Property Field Threading in Main UI', 'Show active root-level threading in the main Properties UI.', ['root path main ui'], () => isRootThreadingOff() || !settings.isActiveRootLevelPropertyFieldThreadingEnabled),
        this.toggle('isActiveRootLevelPropertyFieldThreadingInHoverBreadcrumbEnabled', 'Active Root-Level Property Field Threading in Hover Breadcrumb', 'Show active root-level threading in the hover breadcrumb.', ['root path popover'], () => isRootThreadingOff() || isBreadcrumbOff() || !settings.isActiveRootLevelPropertyFieldThreadingEnabled),
        this.toggle('isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled', 'All Branches of an Active Root-Level Property Field Tree Threading', 'Highlight every root-level property tree and each of its nested branches.', ['all root properties', 'whole root-level forest'], isRootThreadingOff),
        this.toggle('isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInMainUiEnabled', 'All Root-Level Branches Threading in Main UI', 'Show every root-level property-tree branch in the main Properties UI.', ['all roots main ui'], () => isRootThreadingOff() || !settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled),
        this.toggle('isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInHoverBreadcrumbEnabled', 'All Root-Level Branches Threading in Hover Breadcrumb', 'Show every root-level property-tree branch in the hover breadcrumb.', ['all roots popover'], () => isRootThreadingOff() || isBreadcrumbOff() || !settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled)
      ])
    ];
  }

  public override getControlValue(key: string): unknown {
    if (!SETTINGS_KEYS.has(key)) {
      return undefined;
    }
    return this.pluginSettingsComponent.settings[key as SettingsKey];
  }

  public override async setControlValue(key: string, value: unknown): Promise<void> {
    if (!SETTINGS_KEYS.has(key) || typeof value !== 'boolean') {
      return;
    }
    await this.pluginSettingsComponent.editAndSave((settings) => {
      settings[key as SettingsKey] = value;
    });
    this.onSettingsChanged();
    this.update();
  }

  private group(heading: string, items: SettingGroupItem<SettingsKey>[]): SettingDefinitionItem<SettingsKey> {
    return { heading, items, type: 'group' };
  }

  private toggle(key: SettingsKey, name: string, desc: string, aliases: string[], isDisabled?: () => boolean): SettingGroupItem<SettingsKey> {
    return {
      aliases,
      control: {
        defaultValue: new PluginSettings()[key],
        ...(isDisabled && { disabled: isDisabled }),
        key,
        type: 'toggle'
      },
      desc,
      name
    };
  }
}

/* eslint-enable func-style, perfectionist/sort-classes -- Restore repository ordering rules. */
