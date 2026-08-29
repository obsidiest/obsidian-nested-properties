import type { Plugin as ObsidianPlugin } from 'obsidian';

import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { NestedPropertiesPluginSettingTab } from './plugin-setting-tab.ts';
import { PluginSettings } from './plugin-settings.ts';

interface DisabledTestControl extends TestControl {
  disabled(): boolean;
}

interface SettingTabFixture {
  editAndSave: ReturnType<typeof vi.fn>;
  onSettingsChanged: ReturnType<typeof vi.fn>;
  settings: PluginSettings;
  tab: NestedPropertiesPluginSettingTab;
}

interface TestControl {
  disabled?(): boolean;
  key: keyof PluginSettings;
}

interface TestDefinition {
  items?: TestItem[];
}

interface TestItem {
  aliases?: string[];
  control?: TestControl;
  desc?: string;
  name?: string;
}

function createSettingTab(): SettingTabFixture {
  const settings = new PluginSettings();
  const editAndSave = vi.fn((edit: (value: PluginSettings) => void) => {
    edit(settings);
    return noopAsync();
  });
  const pluginSettingsComponent = castTo<PluginSettingsComponent>({ editAndSave, settings });
  const onSettingsChanged = vi.fn();
  const app = App.createConfigured__().asOriginalType__();
  const tab = new NestedPropertiesPluginSettingTab({
    app,
    onSettingsChanged,
    plugin: castTo<ObsidianPlugin>({}),
    pluginSettingsComponent
  });
  return { editAndSave, onSettingsChanged, settings, tab };
}

function getItems(tab: NestedPropertiesPluginSettingTab): TestItem[] {
  return castTo<TestDefinition[]>(tab.getSettingDefinitions()).flatMap((definition) => definition.items ?? []);
}

describe('NestedPropertiesPluginSettingTab', () => {
  it('should expose every persisted setting with searchable metadata', () => {
    const { tab } = createSettingTab();
    const definitions = castTo<TestDefinition[]>(tab.getSettingDefinitions());
    const items = getItems(tab);
    const controls = items.map((item) => item.control).filter((control): control is TestControl => control !== undefined);

    const booleanKeys = Object.entries(new PluginSettings()).filter(([, value]) => typeof value === 'boolean').map(([key]) => key);
    expect(definitions).toHaveLength(5);
    expect(new Set(controls.map((control) => control.key))).toEqual(new Set(booleanKeys));
    expect(items.every((item) => item.aliases !== undefined && item.aliases.length > 0 && item.desc !== undefined && item.name !== undefined)).toBe(true);
  });

  it('should make surface, feature, global, and remember controls genuinely superordinate', () => {
    const { settings, tab } = createSettingTab();
    const controls = new Map(getItems(tab).map((item) => item.control).filter((control): control is DisabledTestControl => control?.disabled !== undefined).map((control) => [control.key, control]));
    function isDisabled(key: keyof PluginSettings): boolean {
      return controls.get(key)?.disabled() ?? false;
    }

    settings.isPropertyFieldThreadingEnabled = true;
    settings.isPropertyFieldHoverBreadcrumbEnabled = true;
    settings.isActivePropertyFieldThreadingEnabled = true;
    settings.isPropertyFieldThreadingInMainUiEnabled = false;
    settings.isPropertyFieldThreadingInHoverBreadcrumbEnabled = false;
    expect(isDisabled('isActivePropertyFieldThreadingInMainUiEnabled')).toBe(true);
    expect(isDisabled('isActivePropertyFieldThreadingInHoverBreadcrumbEnabled')).toBe(true);
    settings.isPropertyFieldThreadingInMainUiEnabled = true;
    settings.isPropertyFieldThreadingInHoverBreadcrumbEnabled = true;
    expect(isDisabled('isActivePropertyFieldThreadingInMainUiEnabled')).toBe(false);
    expect(isDisabled('isActivePropertyFieldThreadingInHoverBreadcrumbEnabled')).toBe(false);

    settings.isRememberLastUsedMainUiToggleStatesEnabled = false;
    settings.isGlobalToggleAllNestedPropertiesEnabled = false;
    settings.isGlobalToggleFullKeyNamesEnabled = false;
    expect(isDisabled('isRememberAllNestedPropertiesExpansionToggleStateEnabled')).toBe(true);
    expect(isDisabled('isGlobalExpandAllNestedPropertiesEnabled')).toBe(true);
    expect(isDisabled('isGlobalExpandFullKeyNamesEnabled')).toBe(true);
  });

  it('should evaluate every subordinate dependency in enabled and disabled states', () => {
    const { settings, tab } = createSettingTab();
    const controls = new Map(getItems(tab).map((item) => item.control).filter((control): control is DisabledTestControl => control?.disabled !== undefined).map((control) => [control.key, control]));
    function isDisabled(key: keyof PluginSettings): boolean {
      return controls.get(key)?.disabled() ?? false;
    }

    settings.isRememberLastUsedMainUiToggleStatesEnabled = false;
    expect(isDisabled('isRememberAllNestedPropertiesExpansionToggleStateEnabled')).toBe(true);
    expect(isDisabled('isRememberFullKeyNamesExpansionToggleStateEnabled')).toBe(true);
    settings.isRememberLastUsedMainUiToggleStatesEnabled = true;
    expect(isDisabled('isRememberAllNestedPropertiesExpansionToggleStateEnabled')).toBe(false);
    expect(isDisabled('isRememberFullKeyNamesExpansionToggleStateEnabled')).toBe(false);

    settings.isGlobalToggleAllNestedPropertiesEnabled = false;
    expect(isDisabled('isGlobalExpandAllNestedPropertiesEnabled')).toBe(true);
    expect(isDisabled('isGlobalCollapseAllNestedPropertiesEnabled')).toBe(true);
    settings.isGlobalToggleAllNestedPropertiesEnabled = true;
    expect(isDisabled('isGlobalExpandAllNestedPropertiesEnabled')).toBe(false);
    expect(isDisabled('isGlobalCollapseAllNestedPropertiesEnabled')).toBe(false);
    settings.isGlobalToggleFullKeyNamesEnabled = false;
    expect(isDisabled('isGlobalExpandFullKeyNamesEnabled')).toBe(true);
    expect(isDisabled('isGlobalCollapseFullKeyNamesEnabled')).toBe(true);
    settings.isGlobalToggleFullKeyNamesEnabled = true;
    expect(isDisabled('isGlobalExpandFullKeyNamesEnabled')).toBe(false);
    expect(isDisabled('isGlobalCollapseFullKeyNamesEnabled')).toBe(false);

    settings.isPropertyFieldHoverBreadcrumbEnabled = false;
    for (
      const key of [
        'isPropertyFieldHoverBreadcrumbInLivePreviewEnabled',
        'isPropertyFieldHoverBreadcrumbInSourceModeEnabled',
        'isPropertyFieldHoverBreadcrumbInReadingModeEnabled',
        'isPropertyFieldHoverBreadcrumbStaticTreeIndentationGuidesEnabled',
        'isFullWidthPropertyFieldHoverActivationEnabled',
        'isFullWidthPropertyKeyHoverActivationEnabled'
      ] as const
    ) {
      expect(isDisabled(key)).toBe(true);
    }
    settings.isPropertyFieldHoverBreadcrumbEnabled = true;
    for (
      const key of [
        'isPropertyFieldHoverBreadcrumbInLivePreviewEnabled',
        'isPropertyFieldHoverBreadcrumbInSourceModeEnabled',
        'isPropertyFieldHoverBreadcrumbInReadingModeEnabled',
        'isPropertyFieldHoverBreadcrumbStaticTreeIndentationGuidesEnabled',
        'isFullWidthPropertyFieldHoverActivationEnabled',
        'isFullWidthPropertyKeyHoverActivationEnabled'
      ] as const
    ) {
      expect(isDisabled(key)).toBe(false);
    }

    settings.isPropertyFieldThreadingEnabled = false;
    expect(isDisabled('isPropertyFieldThreadingInMainUiEnabled')).toBe(true);
    expect(isDisabled('isPropertyFieldThreadingInHoverBreadcrumbEnabled')).toBe(true);
    expect(isDisabled('isActiveRootLevelPropertyFieldThreadingEnabled')).toBe(true);
    settings.isPropertyFieldThreadingEnabled = true;
    settings.isPropertyFieldHoverBreadcrumbEnabled = false;
    expect(isDisabled('isPropertyFieldThreadingInHoverBreadcrumbEnabled')).toBe(true);
    settings.isPropertyFieldHoverBreadcrumbEnabled = true;
    expect(isDisabled('isPropertyFieldThreadingInHoverBreadcrumbEnabled')).toBe(false);

    settings.isPropertyFieldThreadingInMainUiEnabled = false;
    expect(isDisabled('isActivePropertyFieldThreadingInMainUiEnabled')).toBe(true);
    settings.isPropertyFieldThreadingInMainUiEnabled = true;
    settings.isActivePropertyFieldThreadingEnabled = false;
    expect(isDisabled('isActivePropertyFieldThreadingInMainUiEnabled')).toBe(true);
    settings.isActivePropertyFieldThreadingEnabled = true;
    expect(isDisabled('isActivePropertyFieldThreadingInMainUiEnabled')).toBe(false);

    settings.isPropertyFieldThreadingInHoverBreadcrumbEnabled = false;
    expect(isDisabled('isActivePropertyFieldThreadingInHoverBreadcrumbEnabled')).toBe(true);
    settings.isPropertyFieldThreadingInHoverBreadcrumbEnabled = true;
    settings.isActivePropertyFieldThreadingEnabled = false;
    expect(isDisabled('isActivePropertyFieldThreadingInHoverBreadcrumbEnabled')).toBe(true);
    settings.isActivePropertyFieldThreadingEnabled = true;
    expect(isDisabled('isActivePropertyFieldThreadingInHoverBreadcrumbEnabled')).toBe(false);

    settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled = false;
    expect(isDisabled('isAllBranchesOfActivePropertyFieldTreeThreadingInMainUiEnabled')).toBe(true);
    expect(isDisabled('isAllBranchesOfActivePropertyFieldTreeThreadingInHoverBreadcrumbEnabled')).toBe(true);
    settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled = true;
    expect(isDisabled('isAllBranchesOfActivePropertyFieldTreeThreadingInMainUiEnabled')).toBe(false);
    expect(isDisabled('isAllBranchesOfActivePropertyFieldTreeThreadingInHoverBreadcrumbEnabled')).toBe(false);

    settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled = false;
    expect(isDisabled('isActiveRootLevelPropertyFieldThreadingEnabled')).toBe(true);
    expect(isDisabled('isActiveRootLevelPropertyFieldThreadingInMainUiEnabled')).toBe(true);
    expect(isDisabled('isActiveRootLevelPropertyFieldThreadingInHoverBreadcrumbEnabled')).toBe(true);
    settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled = true;
    settings.isActiveRootLevelPropertyFieldThreadingEnabled = false;
    expect(isDisabled('isActiveRootLevelPropertyFieldThreadingInMainUiEnabled')).toBe(true);
    expect(isDisabled('isActiveRootLevelPropertyFieldThreadingInHoverBreadcrumbEnabled')).toBe(true);
    settings.isActiveRootLevelPropertyFieldThreadingEnabled = true;
    expect(isDisabled('isActiveRootLevelPropertyFieldThreadingEnabled')).toBe(false);
    expect(isDisabled('isActiveRootLevelPropertyFieldThreadingInMainUiEnabled')).toBe(false);
    expect(isDisabled('isActiveRootLevelPropertyFieldThreadingInHoverBreadcrumbEnabled')).toBe(false);

    settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled = false;
    expect(isDisabled('isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInMainUiEnabled')).toBe(true);
    expect(isDisabled('isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInHoverBreadcrumbEnabled')).toBe(true);
    settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled = true;
    expect(isDisabled('isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInMainUiEnabled')).toBe(false);
    expect(isDisabled('isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInHoverBreadcrumbEnabled')).toBe(false);
  });

  it('should read, validate, persist, and refresh control values', async () => {
    const { editAndSave, onSettingsChanged, settings, tab } = createSettingTab();
    const update = vi.spyOn(tab, 'update').mockImplementation(() => undefined);

    expect(tab.getControlValue('isPropertyFieldHoverBreadcrumbEnabled')).toBe(true);
    expect(tab.getControlValue('not-a-setting')).toBeUndefined();

    await tab.setControlValue('not-a-setting', true);
    await tab.setControlValue('isPropertyFieldHoverBreadcrumbEnabled', 'true');
    expect(editAndSave).not.toHaveBeenCalled();

    await tab.setControlValue('isPropertyFieldHoverBreadcrumbEnabled', false);
    expect(settings.isPropertyFieldHoverBreadcrumbEnabled).toBe(false);
    expect(editAndSave).toHaveBeenCalledTimes(1);
    expect(onSettingsChanged).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('should turn off only the mutually exclusive global counterpart when a state is enabled', async () => {
    const { settings, tab } = createSettingTab();
    settings.isGlobalCollapseAllNestedPropertiesEnabled = true;
    await tab.setControlValue('isGlobalExpandAllNestedPropertiesEnabled', true);
    expect(settings.isGlobalExpandAllNestedPropertiesEnabled).toBe(true);
    expect(settings.isGlobalCollapseAllNestedPropertiesEnabled).toBe(false);

    await tab.setControlValue('isGlobalExpandAllNestedPropertiesEnabled', false);
    expect(settings.isGlobalCollapseAllNestedPropertiesEnabled).toBe(false);

    settings.isGlobalExpandAllNestedPropertiesEnabled = true;
    await tab.setControlValue('isGlobalCollapseAllNestedPropertiesEnabled', true);
    expect(settings.isGlobalExpandAllNestedPropertiesEnabled).toBe(false);

    settings.isGlobalExpandFullKeyNamesEnabled = true;
    await tab.setControlValue('isGlobalCollapseFullKeyNamesEnabled', true);
    expect(settings.isGlobalCollapseFullKeyNamesEnabled).toBe(true);
    expect(settings.isGlobalExpandFullKeyNamesEnabled).toBe(false);

    settings.isGlobalCollapseFullKeyNamesEnabled = true;
    await tab.setControlValue('isGlobalExpandFullKeyNamesEnabled', true);
    expect(settings.isGlobalCollapseFullKeyNamesEnabled).toBe(false);

    await tab.setControlValue('isHighlightActivePropertyFieldTreeEnabled', true);
    expect(settings.isHighlightActivePropertyFieldTreeEnabled).toBe(true);
  });
});
