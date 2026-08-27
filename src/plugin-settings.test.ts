import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';

describe('PluginSettings', () => {
  it('should default isFullKeyDisplayEnabled to false', () => {
    const settings = new PluginSettings();
    expect(settings.isFullKeyDisplayEnabled).toBe(false);
  });

  it('should use the requested feature defaults', () => {
    expect(new PluginSettings()).toMatchObject({
      isActiveCursorPropertyFieldThreadingEnabled: false,
      isActivePropertyFieldThreadingEnabled: true,
      isActiveRootLevelPropertyFieldThreadingEnabled: true,
      isActiveRootLevelPropertyFieldTreeThreadingEnabled: true,
      isAllBranchesOfActivePropertyFieldTreeThreadingEnabled: false,
      isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled: false,
      isNestedPropertiesMainUiStaticTreeIndentationGuidesEnabled: true,
      isPropertyFieldHoverBreadcrumbEnabled: false,
      isPropertyFieldHoverBreadcrumbInLivePreviewEnabled: true,
      isPropertyFieldHoverBreadcrumbInReadingModeEnabled: true,
      isPropertyFieldHoverBreadcrumbInSourceModeEnabled: true,
      isPropertyFieldHoverBreadcrumbStaticTreeIndentationGuidesEnabled: true,
      isPropertyFieldThreadingEnabled: false,
      isPropertyFieldThreadingInHoverBreadcrumbEnabled: true,
      isPropertyFieldThreadingInMainUiEnabled: true
    });
  });
});
