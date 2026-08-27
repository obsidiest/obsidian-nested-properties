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

    expect(definitions).toHaveLength(4);
    expect(new Set(controls.map((control) => control.key))).toEqual(new Set(Object.keys(new PluginSettings())));
    expect(items.every((item) => item.aliases !== undefined && item.aliases.length > 0 && item.desc !== undefined && item.name !== undefined)).toBe(true);
  });

  it('should enable and disable every subordinate control from current parent states', () => {
    const { settings, tab } = createSettingTab();
    const controls = getItems(tab).map((item) => item.control).filter((control): control is DisabledTestControl => control?.disabled !== undefined);
    const outcomes = new Map<keyof PluginSettings, Set<boolean>>(controls.map((control) => [control.key, new Set<boolean>()]));
    const states = [false, true];

    for (const isBreadcrumbEnabled of states) {
      for (const isThreadingEnabled of states) {
        for (const isRootTreeEnabled of states) {
          for (const isActiveEnabled of states) {
            for (const isAllBranchesEnabled of states) {
              for (const isActiveRootEnabled of states) {
                for (const isAllRootBranchesEnabled of states) {
                  Object.assign(settings, {
                    isActivePropertyFieldThreadingEnabled: isActiveEnabled,
                    isActiveRootLevelPropertyFieldThreadingEnabled: isActiveRootEnabled,
                    isActiveRootLevelPropertyFieldTreeThreadingEnabled: isRootTreeEnabled,
                    isAllBranchesOfActivePropertyFieldTreeThreadingEnabled: isAllBranchesEnabled,
                    isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled: isAllRootBranchesEnabled,
                    isPropertyFieldHoverBreadcrumbEnabled: isBreadcrumbEnabled,
                    isPropertyFieldThreadingEnabled: isThreadingEnabled
                  });
                  for (const control of controls) {
                    outcomes.get(control.key)?.add(control.disabled());
                  }
                }
              }
            }
          }
        }
      }
    }

    expect([...outcomes.values()].every((values) => values.has(false) && values.has(true))).toBe(true);
  });

  it('should read, validate, persist, and refresh control values', async () => {
    const { editAndSave, onSettingsChanged, settings, tab } = createSettingTab();
    const update = vi.spyOn(tab, 'update').mockImplementation(() => undefined);

    expect(tab.getControlValue('isPropertyFieldHoverBreadcrumbEnabled')).toBe(false);
    expect(tab.getControlValue('not-a-setting')).toBeUndefined();

    await tab.setControlValue('not-a-setting', true);
    await tab.setControlValue('isPropertyFieldHoverBreadcrumbEnabled', 'true');
    expect(editAndSave).not.toHaveBeenCalled();

    await tab.setControlValue('isPropertyFieldHoverBreadcrumbEnabled', true);
    expect(settings.isPropertyFieldHoverBreadcrumbEnabled).toBe(true);
    expect(editAndSave).toHaveBeenCalledTimes(1);
    expect(onSettingsChanged).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
