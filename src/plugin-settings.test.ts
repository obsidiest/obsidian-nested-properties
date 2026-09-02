import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';

describe('PluginSettings', () => {
  it('should use the requested feature defaults', () => {
    expect(new PluginSettings()).toMatchObject({
      allNestedPropertiesExpansionStateByNote: {},
      fullKeyNamesExpansionStateByNote: {},
      isActiveCursorPropertyFieldThreadingEnabled: false,
      isActivePropertyFieldThreadingEnabled: true,
      isActiveRootLevelPropertyFieldThreadingEnabled: true,
      isActiveRootLevelPropertyFieldTreeThreadingEnabled: true,
      isAllBranchesOfActivePropertyFieldTreeThreadingEnabled: false,
      isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled: false,
      isFullPropertyFieldNameExpansionInHoverBreadcrumbEnabled: true,
      isFullWidthPropertyFieldHoverActivationEnabled: false,
      isFullWidthPropertyKeyHoverActivationEnabled: true,
      isGlobalCollapseAllNestedPropertiesEnabled: false,
      isGlobalCollapseFullKeyNamesEnabled: false,
      isGlobalExpandAllNestedPropertiesEnabled: true,
      isGlobalExpandFullKeyNamesEnabled: true,
      isGlobalToggleAllNestedPropertiesEnabled: true,
      isGlobalToggleFullKeyNamesEnabled: true,
      isHighlightActivePropertyFieldTreeEnabled: false,
      isNestedPropertiesMainUiStaticTreeIndentationGuidesEnabled: true,
      isNestedPropertiesMainUiStaticTreeIndentationGuidesInLivePreviewEnabled: true,
      isNestedPropertiesMainUiStaticTreeIndentationGuidesInReadingModeEnabled: true,
      isNestedPropertiesMainUiStaticTreeIndentationGuidesInSourceModeEnabled: true,
      isPerNoteToggleAllNestedPropertiesEnabled: true,
      isPerNoteToggleFullKeyNamesEnabled: true,
      isPropertyFieldHoverBreadcrumbEnabled: true,
      isPropertyFieldHoverBreadcrumbInLivePreviewEnabled: true,
      isPropertyFieldHoverBreadcrumbInReadingModeEnabled: true,
      isPropertyFieldHoverBreadcrumbInSourceModeEnabled: true,
      isPropertyFieldHoverBreadcrumbStaticTreeIndentationGuidesEnabled: true,
      isPropertyFieldThreadingEnabled: false,
      isPropertyFieldThreadingInHoverBreadcrumbEnabled: false,
      isPropertyFieldThreadingInLivePreviewEnabled: true,
      isPropertyFieldThreadingInMainUiEnabled: true,
      isPropertyFieldThreadingInReadingModeEnabled: true,
      isPropertyFieldThreadingInSourceModeEnabled: true,
      isRememberAllNestedPropertiesExpansionToggleStateEnabled: true,
      isRememberFullKeyNamesExpansionToggleStateEnabled: true,
      isRememberLastUsedMainUiToggleStatesEnabled: true
    });
  });
});
