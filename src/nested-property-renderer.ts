import type {
  MultitextPropertyWidgetComponent,
  PropertyRenderContext,
  PropertyWidget,
  PropertyWidgetComponentBase
} from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';
import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import {
  Component,
  MarkdownView,
  Menu,
  setIcon
} from 'obsidian';
import {
  convertAsyncToSync,
  invokeAsyncSafely
} from 'obsidian-dev-utils/async';
import { getAllDomWindows } from 'obsidian-dev-utils/obsidian/workspace';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { BooleanSettingsKey } from './plugin-setting-tab.ts';

import { FloatingScrollbarComponent } from './floating-scrollbar.ts';
import { MetadataTypeManagerGetTypeInfoPatchComponent } from './patches/metadata-type-manager-get-type-info-patch-component.ts';
import { MultiTextPropertyWidgetPatchComponent } from './patches/multi-text-property-widget-patch-component.ts';
import { UnknownWidgetRenderPatchComponent } from './patches/unknown-widget-render-patch-component.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { dispatchPropertyFieldLayoutChange } from './property-field-events.ts';
import { TypeChangeModal } from './type-change-modal.ts';
import {
  convertValue,
  isComplexValue,
  isLossyConversion,
  isSimpleArray
} from './value-utils.ts';

const LIST_WIDGET_TYPE = 'list';
const OBJECT_WIDGET_TYPE = 'object';
const FULL_KEY_DISPLAY_BODY_CLASS = 'nested-properties-full-key-display';
const GLOBAL_EXPANSION_SETTING_KEYS = new Set<BooleanSettingsKey>(['isGlobalCollapseAllNestedPropertiesEnabled', 'isGlobalExpandAllNestedPropertiesEnabled', 'isGlobalToggleAllNestedPropertiesEnabled']);
const GLOBAL_FULL_KEY_SETTING_KEYS = new Set<BooleanSettingsKey>(['isGlobalCollapseFullKeyNamesEnabled', 'isGlobalExpandFullKeyNamesEnabled', 'isGlobalToggleFullKeyNamesEnabled']);
const MAIN_UI_TOGGLE_DISABLED_CLASS = 'nested-properties-main-ui-toggle-disabled';
const SOURCE_PATH_DATA_KEY = 'nestedPropertiesSourcePath';

interface CreateNestedPropertyKeyInputParams {
  readonly keyEl: HTMLElement;
  readonly label: string;
  readonly onKeyChange: ((newKey: string) => boolean) | null;
}

interface CreateSummaryParams {
  readonly expandedPaths: Set<string>;
  readonly parentEl: HTMLElement;
  readonly path: string;
  readonly propertyEl: HTMLElement;
  readonly value: unknown;
}

interface InjectHeaderButtonsParams {
  readonly isAllNestedPropertiesToggleEnabled: boolean;
  readonly isFullKeyNamesExpanded: boolean;
  readonly isFullKeyNamesToggleEnabled: boolean;
  readonly metadataContainerEl: HTMLElement;
  onAllNestedPropertiesStateChanged(this: void, isExpanded: boolean, metadataContainerEl: HTMLElement): void;
  onToggleFullKeyDisplay(this: void, metadataContainerEl: HTMLElement): void;
}

interface NestedPropertyRendererComponentAddTypeSubmenuParams {
  readonly checkedType: string;
  readonly menu: Menu;
  onValueChange(this: void, newValue: unknown): void;
  readonly title: string;
  readonly typeKey: string;
  readonly value: unknown;
}

interface NestedPropertyRendererComponentChangeTypeParams {
  onValueChange(this: void, newValue: unknown): void;
  readonly typeKey: string;
  readonly value: unknown;
  readonly widget: PropertyWidget;
}

interface NestedPropertyRendererComponentConstructorParams {
  readonly app: App;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

interface NestedPropertyRendererComponentGetWidgetParams {
  readonly label: string;
  readonly path: string;
  readonly value: unknown;
}

interface NestedPropertyRendererComponentRenderArrayParams {
  readonly array: unknown[];
  readonly containerEl: HTMLElement;
  readonly context: PropertyRenderContext;
  onArrayChange(this: void, newValue: unknown): void;
  readonly parentPath: string;
}

interface NestedPropertyRendererComponentRenderComplexWidgetParams {
  readonly context: PropertyRenderContext;
  readonly el: HTMLElement;
  readonly value: unknown;
  readonly widgetType: string;
}

interface NestedPropertyRendererComponentRenderEntryParams {
  readonly containerEl: HTMLElement;
  readonly context: PropertyRenderContext;
  getValue(this: void): unknown;
  readonly label: string;
  onDelete(this: void): void;
  readonly onKeyChange: ((newKey: string) => boolean) | null;
  onValueChange(this: void, newValue: unknown): void;
  readonly parentPath: string;
  readonly value: unknown;
}

interface NestedPropertyRendererComponentRenderKeyElParams {
  getValue(this: void): unknown;
  readonly label: string;
  onDelete(this: void): void;
  readonly onKeyChange: ((newKey: string) => boolean) | null;
  onValueChange(this: void, newValue: unknown): void;
  readonly parentEl: HTMLElement;
  readonly path: string;
  readonly value: unknown;
}

interface NestedPropertyRendererComponentRenderNestedValueParams {
  readonly containerEl: HTMLElement;
  readonly context: PropertyRenderContext;
  onValueChange(this: void, newValue: unknown): void;
  readonly path: string;
  readonly value: unknown;
}

interface NestedPropertyRendererComponentRenderObjectParams {
  readonly $object: GenericObject;
  readonly containerEl: HTMLElement;
  readonly context: PropertyRenderContext;
  onValueChange(this: void, newValue: unknown): void;
  readonly parentPath: string;
}

interface NestedPropertyRendererComponentShowNestedPropertyMenuParams {
  readonly $event: MouseEvent;
  getValue(this: void): unknown;
  readonly label: string;
  onDelete(this: void): void;
  onValueChange(this: void, newValue: unknown): void;
  readonly path: string;
}

interface RenderAddItemButtonParams {
  readonly array: unknown[];
  readonly containerEl: HTMLElement;
  onValueChange(this: void, newValue: unknown): void;
}

interface RenderAddPropertyButtonParams {
  readonly $object: GenericObject;
  readonly containerEl: HTMLElement;
  onValueChange(this: void, newValue: unknown): void;
  setPendingFocusKey(this: void, key: string): void;
}

interface UpdateToggleButtonParams {
  readonly isDisabled: boolean;
  readonly metadataContainerEl: HTMLElement;
  readonly toggleButton: HTMLElement;
}

export class NestedPropertyRendererComponent extends Component {
  private _listWidget?: PropertyWidget<MultitextPropertyWidgetComponent>;
  private _mixedListWidget?: PropertyWidget;
  private _objectWidget?: PropertyWidget;
  private readonly app: App;
  private readonly expandedPaths = new Set<string>();
  private readonly expansionStateByNote = new Map<string, boolean>();
  private floatingScrollbar?: FloatingScrollbarComponent;
  private readonly fullKeyNamesStateByNote = new Map<string, boolean>();
  private readonly initializedExpansionPaths = new Set<string>();
  private lastMenuCloseTime = 0;
  private pendingFocusKey: null | string = null;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  private get listWidget(): PropertyWidget<MultitextPropertyWidgetComponent> {
    return ensureNonNullable(this._listWidget);
  }

  private get mixedListWidget(): PropertyWidget {
    return ensureNonNullable(this._mixedListWidget);
  }

  private get objectWidget(): PropertyWidget {
    return ensureNonNullable(this._objectWidget);
  }

  public constructor(params: NestedPropertyRendererComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public override onload(): void {
    super.onload();
    this._mixedListWidget = {
      icon: 'lucide-list-tree',
      name: (): string => 'Mixed list',
      render: (el, value, context): PropertyWidgetComponentBase => this.renderComplexWidget({ context, el, value, widgetType: LIST_WIDGET_TYPE }),
      type: LIST_WIDGET_TYPE,
      validate: (value): boolean => Array.isArray(value)
    };

    this._objectWidget = {
      icon: 'lucide-braces',
      name: (): string => 'Object',
      render: (el, value, context): PropertyWidgetComponentBase => this.renderComplexWidget({ context, el, value, widgetType: OBJECT_WIDGET_TYPE }),
      type: OBJECT_WIDGET_TYPE,
      validate: (value): boolean => value !== null && typeof value === 'object' && !Array.isArray(value)
    };

    this.app.metadataTypeManager.registeredTypeWidgets[LIST_WIDGET_TYPE] = this.mixedListWidget;
    this.app.metadataTypeManager.registeredTypeWidgets[OBJECT_WIDGET_TYPE] = this.objectWidget;
    this._listWidget = this.app.metadataTypeManager.registeredTypeWidgets.multitext;

    this.addChild(new MultiTextPropertyWidgetPatchComponent(this.listWidget));
    this.addChild(
      new MetadataTypeManagerGetTypeInfoPatchComponent({
        listWidget: this.listWidget,
        metadataTypeManager: this.app.metadataTypeManager,
        mixedListWidget: this.mixedListWidget,
        objectWidget: this.objectWidget
      })
    );

    const unknownWidget = this.app.metadataTypeManager.getWidget('unknown');

    this.addChild(
      new UnknownWidgetRenderPatchComponent({
        listWidget: this.listWidget,
        mixedListWidget: this.mixedListWidget,
        objectWidget: this.objectWidget,
        unknownWidget
      })
    );

    this.register(() => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Unregister widget on unload.
      delete this.app.metadataTypeManager.registeredTypeWidgets[LIST_WIDGET_TYPE];
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Unregister widget on unload.
      delete this.app.metadataTypeManager.registeredTypeWidgets[OBJECT_WIDGET_TYPE];
      for (const el of activeDocument.querySelectorAll('.nested-properties-header-actions')) {
        el.remove();
      }
      for (const win of getAllDomWindows(this.app)) {
        for (const container of win.document.querySelectorAll<HTMLElement>('.metadata-container')) {
          container.classList.remove(FULL_KEY_DISPLAY_BODY_CLASS);
        }
      }
      this.reloadAllProperties();
    });

    this.floatingScrollbar = this.addChild(new FloatingScrollbarComponent(this.app));
    this.reloadAllProperties();
  }

  public refreshSettings(changedKey?: BooleanSettingsKey, isEnabled?: boolean): void {
    if (isEnabled === true && changedKey !== undefined && GLOBAL_EXPANSION_SETTING_KEYS.has(changedKey)) {
      this.applyConfiguredGlobalExpansionState();
    }
    if (isEnabled === true && changedKey !== undefined && GLOBAL_FULL_KEY_SETTING_KEYS.has(changedKey)) {
      this.applyConfiguredGlobalFullKeyNamesState();
    }
    this.refreshMainUiControls();
  }

  public toggleFullKeyDisplay(metadataContainerEl?: HTMLElement): void {
    const container = metadataContainerEl ?? this.findActiveMetadataContainer();
    const sourcePath = container?.dataset[SOURCE_PATH_DATA_KEY];
    if (container === undefined || sourcePath === undefined || !this.pluginSettingsComponent.settings.isPerNoteToggleFullKeyNamesEnabled) {
      return;
    }
    const isExpanded = !container.classList.contains(FULL_KEY_DISPLAY_BODY_CLASS);
    this.setFullKeyNamesState(sourcePath, isExpanded);
    this.applyFullKeyNamesStateToNote(sourcePath, isExpanded, container);
  }

  // Add a "Property type" submenu that lists every registered widget and persists the chosen type
  // Under `typeKey`. The `reservedKeys` guard is intentionally omitted so `tags`/`aliases`/`cssclasses`
  // Can be assigned to nested properties (Obsidian's own reserved-key handling for genuine top-level
  // Properties is untouched - this menu only ever renders for nested entries).
  private addTypeSubmenu(params: NestedPropertyRendererComponentAddTypeSubmenuParams): void {
    const { checkedType, menu, onValueChange, title, typeKey, value } = params;
    menu.addItem((item) => {
      item.setTitle(title)
        .setIcon('lucide-info')
        .setSection('type');
      const submenu = item.setSubmenu();
      for (const widget of Object.values(this.app.metadataTypeManager.registeredTypeWidgets)) {
        submenu.addItem((subItem) => {
          subItem.setTitle(widget.name())
            .setIcon(widget.icon)
            .setChecked(widget.type === checkedType)
            .onClick(convertAsyncToSync(async () => {
              await this.changeType({ onValueChange, typeKey, value, widget });
            }));
        });
      }
    });
  }

  private applyConfiguredGlobalExpansionState(): void {
    const settings = this.pluginSettingsComponent.settings;
    if (!settings.isGlobalToggleAllNestedPropertiesEnabled) {
      return;
    }
    const isExpanded = resolveGlobalToggleState(settings.isGlobalExpandAllNestedPropertiesEnabled, settings.isGlobalCollapseAllNestedPropertiesEnabled);
    if (isExpanded === null) {
      return;
    }
    this.expansionStateByNote.clear();
    this.expandedPaths.clear();
    this.initializedExpansionPaths.clear();
    const rememberedStates: Record<string, boolean> = {};
    for (const container of this.getMetadataContainers()) {
      const sourcePath = container.dataset[SOURCE_PATH_DATA_KEY];
      if (sourcePath === undefined) {
        continue;
      }
      this.expansionStateByNote.set(sourcePath, isExpanded);
      rememberedStates[sourcePath] = isExpanded;
      this.applyExpansionStateToContainer(container, isExpanded);
    }
    if (settings.isRememberLastUsedMainUiToggleStatesEnabled && settings.isRememberAllNestedPropertiesExpansionToggleStateEnabled) {
      invokeAsyncSafely(() =>
        this.pluginSettingsComponent.editAndSave((value_) => {
          value_.allNestedPropertiesExpansionStateByNote = rememberedStates;
        })
      );
    }
  }

  private applyConfiguredGlobalFullKeyNamesState(): void {
    const settings = this.pluginSettingsComponent.settings;
    if (!settings.isGlobalToggleFullKeyNamesEnabled) {
      return;
    }
    const isExpanded = resolveGlobalToggleState(settings.isGlobalExpandFullKeyNamesEnabled, settings.isGlobalCollapseFullKeyNamesEnabled);
    if (isExpanded === null) {
      return;
    }
    this.fullKeyNamesStateByNote.clear();
    const rememberedStates: Record<string, boolean> = {};
    for (const container of this.getMetadataContainers()) {
      const sourcePath = container.dataset[SOURCE_PATH_DATA_KEY];
      if (sourcePath === undefined) {
        continue;
      }
      this.fullKeyNamesStateByNote.set(sourcePath, isExpanded);
      rememberedStates[sourcePath] = isExpanded;
      container.classList.toggle(FULL_KEY_DISPLAY_BODY_CLASS, isExpanded);
      const button = container.querySelector<HTMLElement>('.nested-properties-full-key-toggle');
      if (button !== null) {
        setFullKeyToggleButtonState(button, isExpanded, !settings.isPerNoteToggleFullKeyNamesEnabled);
      }
    }
    if (settings.isRememberLastUsedMainUiToggleStatesEnabled && settings.isRememberFullKeyNamesExpansionToggleStateEnabled) {
      invokeAsyncSafely(() =>
        this.pluginSettingsComponent.editAndSave((value_) => {
          value_.fullKeyNamesExpansionStateByNote = rememberedStates;
        })
      );
    }
  }

  private applyExpansionStateToContainer(container: HTMLElement, isExpanded: boolean): void {
    const collapsibles = container.querySelectorAll<HTMLElement>('.nested-properties-collapsible');
    if (isExpanded) {
      expandAllIn(collapsibles, this.expandedPaths);
    } else {
      collapseAllIn(collapsibles, this.expandedPaths);
    }
    const button = container.querySelector<HTMLElement>('.nested-properties-all-toggle');
    if (button !== null) {
      setToggleButtonState(button, !isExpanded, !this.pluginSettingsComponent.settings.isPerNoteToggleAllNestedPropertiesEnabled);
    }
    dispatchPropertyFieldLayoutChange(container);
  }

  private applyFullKeyNamesStateToNote(sourcePath: string, isExpanded: boolean, initiatingContainer?: HTMLElement): void {
    const containers = new Set(this.getMetadataContainers(sourcePath));
    if (initiatingContainer !== undefined) {
      containers.add(initiatingContainer);
    }
    for (const container of containers) {
      container.classList.toggle(FULL_KEY_DISPLAY_BODY_CLASS, isExpanded);
      const button = container.querySelector<HTMLElement>('.nested-properties-full-key-toggle');
      if (button !== null) {
        setFullKeyToggleButtonState(button, isExpanded, !this.pluginSettingsComponent.settings.isPerNoteToggleFullKeyNamesEnabled);
      }
    }
  }

  private async changeType(params: NestedPropertyRendererComponentChangeTypeParams): Promise<void> {
    const { onValueChange, typeKey, value, widget } = params;
    if (isLossyConversion({ targetType: widget.type, value })) {
      const modal = new TypeChangeModal(this.app, widget.name());
      modal.open();
      if (!await modal.waitForResult()) {
        return;
      }
    }

    if (activeDocument.activeElement instanceof HTMLElement) {
      activeDocument.activeElement.blur();
    }

    // Persist to Obsidian's native `types.json`. When the chosen type matches what would be inferred
    // From the value anyway, unset the key instead so `types.json` stays free of redundant entries.
    const leaf = typeKey.slice(typeKey.lastIndexOf('.') + 1);
    const inferredType = this.app.metadataTypeManager.getTypeInfo(leaf, value).inferred.type;
    if (widget.type === inferredType) {
      await this.app.metadataTypeManager.unsetType(typeKey);
    } else {
      await this.app.metadataTypeManager.setType(typeKey, widget.type);
    }

    const converted = convertValue({ targetType: widget.type, value });
    if (converted === value) {
      this.reloadAllProperties();
    } else {
      onValueChange(converted);
    }
  }

  private findActiveMetadataContainer(): HTMLElement | undefined {
    const activeElement = activeDocument.activeElement;
    if (activeElement instanceof HTMLElement) {
      const container = activeElement.closest<HTMLElement>('.metadata-container');
      if (container !== null) {
        return container;
      }
    }
    return activeDocument.querySelector<HTMLElement>(':scope .workspace-leaf.mod-active .metadata-container') ?? activeDocument.querySelector<HTMLElement>(':scope .metadata-container') ?? undefined;
  }

  // Resolve the persisted widget for a node, honouring the layered read order:
  // Per-index override (`versions.0.released`) -> collapsed per-field default (`versions.released`).
  // Returns undefined when nothing is assigned so the caller can fall back to value inference.
  private getAssignedWidgetForPath(path: string): PropertyWidget | undefined {
    const metadataTypeManager = this.app.metadataTypeManager;
    const itemType = metadataTypeManager.getAssignedWidget(getItemTypeKey(path));
    const fieldKey = getFieldTypeKey(path);
    const assignedType = itemType ?? (fieldKey ? metadataTypeManager.getAssignedWidget(fieldKey) : null);
    return assignedType ? metadataTypeManager.registeredTypeWidgets[assignedType] : undefined;
  }

  private getInitialExpansionState(sourcePath: string): boolean {
    const sessionState = this.expansionStateByNote.get(sourcePath);
    if (sessionState !== undefined) {
      return sessionState;
    }
    const settings = this.pluginSettingsComponent.settings;
    const rememberedState = settings.allNestedPropertiesExpansionStateByNote[sourcePath];
    const isExpanded = settings.isRememberLastUsedMainUiToggleStatesEnabled && settings.isRememberAllNestedPropertiesExpansionToggleStateEnabled && typeof rememberedState === 'boolean'
      ? rememberedState
      : (settings.isGlobalToggleAllNestedPropertiesEnabled
        ? resolveGlobalToggleState(settings.isGlobalExpandAllNestedPropertiesEnabled, settings.isGlobalCollapseAllNestedPropertiesEnabled) ?? false
        : false);
    this.expansionStateByNote.set(sourcePath, isExpanded);
    return isExpanded;
  }

  private getInitialFullKeyNamesState(sourcePath: string): boolean {
    const sessionState = this.fullKeyNamesStateByNote.get(sourcePath);
    if (sessionState !== undefined) {
      return sessionState;
    }
    const settings = this.pluginSettingsComponent.settings;
    const rememberedState = settings.fullKeyNamesExpansionStateByNote[sourcePath];
    const isExpanded = settings.isRememberLastUsedMainUiToggleStatesEnabled && settings.isRememberFullKeyNamesExpansionToggleStateEnabled && typeof rememberedState === 'boolean'
      ? rememberedState
      : (settings.isGlobalToggleFullKeyNamesEnabled
        ? resolveGlobalToggleState(settings.isGlobalExpandFullKeyNamesEnabled, settings.isGlobalCollapseFullKeyNamesEnabled) ?? false
        : false);
    this.fullKeyNamesStateByNote.set(sourcePath, isExpanded);
    return isExpanded;
  }

  private getMetadataContainers(sourcePath?: string): HTMLElement[] {
    const containers: HTMLElement[] = [];
    for (const win of getAllDomWindows(this.app)) {
      for (const container of win.document.querySelectorAll<HTMLElement>('.metadata-container')) {
        if (sourcePath === undefined || container.dataset[SOURCE_PATH_DATA_KEY] === sourcePath) {
          containers.push(container);
        }
      }
    }
    return containers;
  }

  private getWidget(params: NestedPropertyRendererComponentGetWidgetParams): PropertyWidget {
    const { label, path, value } = params;
    // Keep the inference fallback keyed on the leaf `label` (not the dotted key): `.inferred` is
    // Value-based and flows through the `getTypeInfo` patch, and it avoids a top-level property named
    // E.g. `released` bleeding its assigned type onto every nested `*.released`.
    return this.getAssignedWidgetForPath(path) ?? this.app.metadataTypeManager.getTypeInfo(label, value).inferred;
  }

  private initializeExpansionPath(path: string, sourcePath: string): void {
    if (this.initializedExpansionPaths.has(path)) {
      return;
    }
    this.initializedExpansionPaths.add(path);
    if (this.getInitialExpansionState(sourcePath)) {
      this.expandedPaths.add(path);
    } else {
      this.expandedPaths.delete(path);
    }
  }

  private refreshMainUiControls(): void {
    const settings = this.pluginSettingsComponent.settings;
    for (const container of this.getMetadataContainers()) {
      const sourcePath = container.dataset[SOURCE_PATH_DATA_KEY];
      if (sourcePath === undefined) {
        continue;
      }
      const isFullKeyNamesExpanded = this.getInitialFullKeyNamesState(sourcePath);
      container.classList.toggle(FULL_KEY_DISPLAY_BODY_CLASS, isFullKeyNamesExpanded);
      const expansionButton = container.querySelector<HTMLElement>('.nested-properties-all-toggle');
      if (expansionButton !== null) {
        updateToggleButton({ isDisabled: !settings.isPerNoteToggleAllNestedPropertiesEnabled, metadataContainerEl: container, toggleButton: expansionButton });
      }
      const fullKeyButton = container.querySelector<HTMLElement>('.nested-properties-full-key-toggle');
      if (fullKeyButton !== null) {
        setFullKeyToggleButtonState(fullKeyButton, isFullKeyNamesExpanded, !settings.isPerNoteToggleFullKeyNamesEnabled);
      }
    }
  }

  private reloadAllProperties(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (!(leaf.view instanceof MarkdownView)) {
        continue;
      }

      const data = leaf.view.metadataEditor.serialize();
      leaf.view.metadataEditor.synchronize({});
      leaf.view.metadataEditor.synchronize(data);
    }
  }

  private renderArray(params: NestedPropertyRendererComponentRenderArrayParams): void {
    const { array, containerEl, context, onArrayChange, parentPath } = params;
    for (const [index, item] of array.entries()) {
      this.renderEntry({
        containerEl,
        context,
        getValue: () => array[index],
        label: String(index),
        onDelete: () => {
          const newArray = array.filter((_, index_) => index_ !== index);
          onArrayChange(newArray);
        },
        onKeyChange: null,
        onValueChange: (newValue: unknown) => {
          array[index] = newValue;
          onArrayChange([...array]);
        },
        parentPath,
        value: item
      });
    }
    renderAddItemButton({ array, containerEl, onValueChange: onArrayChange });
  }

  private renderComplexWidget(params: NestedPropertyRendererComponentRenderComplexWidgetParams): PropertyWidgetComponentBase {
    const { context, el, widgetType } = params;
    let value = params.value;
    if (widgetType === LIST_WIDGET_TYPE && !Array.isArray(value)) {
      value = [];
    } else if (widgetType === OBJECT_WIDGET_TYPE && (!isComplexValue(value) || Array.isArray(value))) {
      value = {};
    }

    // Own a private, deeply-cloned mutable model. Obsidian re-renders this widget only on structural
    // Changes (add/remove key), NOT on in-place scalar edits, so the per-entry handlers below mutate
    // This shared model in place; a later structural write then spreads current values rather than a
    // Stale render-time snapshot (issue #7). `structuredClone` (not JSON) preserves `Date`/`null`.
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- structuredClone is a Web/Electron API available in Obsidian's renderer; the rule wrongly flags it against the Node engines range.
    value = structuredClone(value);

    const rootPath = `${context.sourcePath}:${context.key}`;
    this.initializeExpansionPath(rootPath, context.sourcePath);

    const propertyEl = el.closest('.metadata-property');
    if (propertyEl instanceof HTMLElement) {
      const isExpanded = this.expandedPaths.has(rootPath);
      propertyEl.classList.add('nested-properties-collapsible');
      propertyEl.dataset['path'] = rootPath;
      if (!isExpanded) {
        propertyEl.classList.add('is-collapsed');
      }

      const existingIcon = propertyEl.querySelector(':scope .metadata-property-key .metadata-property-icon');
      if (existingIcon instanceof HTMLElement) {
        setIcon(existingIcon, widgetType === LIST_WIDGET_TYPE ? 'lucide-list-tree' : 'lucide-braces');
      }

      const keyEl = propertyEl.querySelector(':scope .metadata-property-key');
      if (keyEl && !keyEl.querySelector('.nested-properties-collapse-btn')) {
        const collapseButton = createDiv('nested-properties-collapse-btn');
        setIcon(collapseButton, 'right-triangle');
        keyEl.insertBefore(collapseButton, keyEl.firstChild);
        collapseButton.addEventListener('click', ($event) => {
          $event.stopPropagation();
          $event.preventDefault();
          const isCollapsed = propertyEl.hasClass('is-collapsed');
          propertyEl.toggleClass('is-collapsed', !isCollapsed);
          if (isCollapsed) {
            this.expandedPaths.add(rootPath);
          } else {
            this.expandedPaths.delete(rootPath);
          }
          dispatchPropertyFieldLayoutChange(propertyEl);
          this.floatingScrollbar?.update();
        });
      }

      // Size the native key input to its content so the full-key-display toggle (`width: auto`) can
      // Expand it. Obsidian's default input width overrides `size` while the toggle is off, so this is
      // Inert until the body class is present — mirroring the nested inputs in `renderKeyEl`.
      const keyInputEl = keyEl?.querySelector(':scope .metadata-property-key-input');
      if (keyInputEl instanceof HTMLInputElement) {
        keyInputEl.size = Math.max(1, keyInputEl.value.length);
      }
    }

    if (propertyEl instanceof HTMLElement) {
      createSummary({ expandedPaths: this.expandedPaths, parentEl: el, path: rootPath, propertyEl, value });
    }

    const containerEl = el.createDiv({ cls: 'nested-properties-container' });
    this.renderNestedValue({
      containerEl,
      context,
      onValueChange: (newValue: unknown) => {
        context.onChange(newValue);
      },
      path: rootPath,
      value
    });

    window.setTimeout(() => {
      const metadataContainerEl = containerEl.closest('.metadata-container');
      if (metadataContainerEl instanceof HTMLElement) {
        metadataContainerEl.dataset[SOURCE_PATH_DATA_KEY] = context.sourcePath;
        const isFullKeyNamesExpanded = this.getInitialFullKeyNamesState(context.sourcePath);
        metadataContainerEl.classList.toggle(FULL_KEY_DISPLAY_BODY_CLASS, isFullKeyNamesExpanded);
        injectHeaderButtons({
          isAllNestedPropertiesToggleEnabled: this.pluginSettingsComponent.settings.isPerNoteToggleAllNestedPropertiesEnabled,
          isFullKeyNamesExpanded,
          isFullKeyNamesToggleEnabled: this.pluginSettingsComponent.settings.isPerNoteToggleFullKeyNamesEnabled,
          metadataContainerEl,
          onAllNestedPropertiesStateChanged: (isExpanded, container) => {
            this.setAllNestedPropertiesState(context.sourcePath, isExpanded, container);
          },
          onToggleFullKeyDisplay: (container) => {
            this.toggleFullKeyDisplay(container);
          }
        });
        sizeTopLevelKeyInputs(metadataContainerEl);
      }

      if (this.pendingFocusKey) {
        const key = this.pendingFocusKey;
        this.pendingFocusKey = null;
        for (const input of containerEl.querySelectorAll(':scope .metadata-property-key-input')) {
          if (input.instanceOf(HTMLInputElement) && input.value === key) {
            const property = input.closest('.metadata-property');
            const valueEl = property?.querySelector(':scope > .metadata-property-value');
            if (valueEl instanceof HTMLElement) {
              const focusTargetEl = valueEl.querySelector('input, textarea, [contenteditable]');
              if (focusTargetEl instanceof HTMLElement) {
                focusTargetEl.focus();
              } else {
                valueEl.click();
              }
            }
            break;
          }
        }
      }
      this.floatingScrollbar?.update();
    }, 0);

    return {
      focus: (): void => {
        containerEl.focus();
      },
      type: widgetType
    };
  }

  private renderEntry(params: NestedPropertyRendererComponentRenderEntryParams): void {
    const { containerEl, context, getValue, label, onDelete, onKeyChange, onValueChange, parentPath, value } = params;
    const path = `${parentPath}.${label}`;
    const assignedWidget = this.getAssignedWidgetForPath(path);
    const isComplex = assignedWidget?.type === LIST_WIDGET_TYPE || assignedWidget?.type === OBJECT_WIDGET_TYPE
      || (isComplexValue(value) && !isSimpleArray(value));

    if (isComplex) {
      this.initializeExpansionPath(path, context.sourcePath);
      const isExpanded = this.expandedPaths.has(path);
      const propertyEl = containerEl.createDiv({
        attr: { 'data-path': path },
        cls: ['metadata-property', 'nested-properties-collapsible', ...(isExpanded ? [] : ['is-collapsed'])]
      });
      propertyEl.addEventListener('contextmenu', ($event) => {
        $event.stopPropagation();
        this.showNestedPropertyMenu({ $event, getValue, label, onDelete, onValueChange, path });
      });

      const keyEl = propertyEl.createDiv({ cls: 'metadata-property-key' });

      const collapseButton = keyEl.createDiv({ cls: 'nested-properties-collapse-btn' });
      setIcon(collapseButton, 'right-triangle');
      collapseButton.addEventListener('click', ($event) => {
        $event.stopPropagation();
        $event.preventDefault();
        const isCollapsed = propertyEl.hasClass('is-collapsed');
        propertyEl.toggleClass('is-collapsed', !isCollapsed);
        if (isCollapsed) {
          this.expandedPaths.add(path);
        } else {
          this.expandedPaths.delete(path);
        }
        dispatchPropertyFieldLayoutChange(propertyEl);
      });

      const complexWidget = this.getWidget({ label, path, value });
      const iconEl = keyEl.createSpan({ cls: 'metadata-property-icon' });
      setIcon(iconEl, complexWidget.icon);
      iconEl.addEventListener('click', ($event) => {
        $event.stopPropagation();
        this.showNestedPropertyMenu({ $event, getValue, label, onDelete, onValueChange, path });
      });
      createNestedPropertyKeyInput({ keyEl, label, onKeyChange });

      const valueEl = propertyEl.createDiv({ cls: 'metadata-property-value' });
      createSummary({ expandedPaths: this.expandedPaths, parentEl: valueEl, path, propertyEl, value });
      const nestedContainer = valueEl.createDiv({ cls: 'nested-properties-container' });
      this.renderNestedValue({ containerEl: nestedContainer, context, onValueChange, path, value });
      return;
    }
    const propertyEl = containerEl.createDiv({ attr: { 'data-path': path }, cls: 'metadata-property' });
    propertyEl.addEventListener('contextmenu', ($event) => {
      $event.stopPropagation();
      this.showNestedPropertyMenu({ $event, getValue, label, onDelete, onValueChange, path });
    });
    this.renderKeyEl({ getValue, label, onDelete, onKeyChange, onValueChange, parentEl: propertyEl, path, value });

    const widget = this.getWidget({ label, path, value });
    const valueEl = propertyEl.createDiv({ cls: 'metadata-property-value' });
    valueEl.setAttr('data-property-type', widget.type);
    widget.render(valueEl, value, {
      app: context.app,
      blur: context.blur.bind(context),
      key: label,
      onChange: onValueChange,
      sourcePath: context.sourcePath
    });
  }

  private renderKeyEl(params: NestedPropertyRendererComponentRenderKeyElParams): void {
    const { getValue, label, onDelete, onKeyChange, onValueChange, parentEl, path, value } = params;
    const keyEl = parentEl.createDiv({ cls: 'metadata-property-key' });

    const widget = this.getWidget({ label, path, value });
    const iconEl = keyEl.createSpan({ cls: 'metadata-property-icon' });
    setIcon(iconEl, widget.icon);
    iconEl.addEventListener('click', ($event) => {
      $event.stopPropagation();
      this.showNestedPropertyMenu({ $event, getValue, label, onDelete, onValueChange, path });
    });

    createNestedPropertyKeyInput({ keyEl, label, onKeyChange });
  }

  private renderNestedValue(params: NestedPropertyRendererComponentRenderNestedValueParams): void {
    const { containerEl, context, onValueChange, path, value } = params;
    if (Array.isArray(value)) {
      this.renderArray({ array: value, containerEl, context, onArrayChange: onValueChange, parentPath: path });
    } else {
      this.renderObject({ $object: value as GenericObject, containerEl, context, onValueChange, parentPath: path });
    }
  }

  private renderObject(params: NestedPropertyRendererComponentRenderObjectParams): void {
    const { $object, containerEl, context, onValueChange, parentPath } = params;
    for (const [key, value] of Object.entries($object)) {
      this.renderEntry({
        containerEl,
        context,
        getValue: () => $object[key],
        label: key,
        onDelete: () => {
          const newObject = { ...$object };
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Need to delete the key.
          delete newObject[key];
          onValueChange(newObject);
        },
        onKeyChange: (newKey) => {
          const renamedObject = renameObjectKey($object, key, newKey);
          if (renamedObject === null) {
            return false;
          }
          onValueChange(renamedObject);
          return true;
        },
        onValueChange: (newValue: unknown) => {
          $object[key] = newValue;
          onValueChange({ ...$object });
        },
        parentPath,
        value
      });
    }
    renderAddPropertyButton({
      $object,
      containerEl,
      onValueChange,
      setPendingFocusKey: (key) => {
        this.pendingFocusKey = key;
      }
    });
  }

  private setAllNestedPropertiesState(sourcePath: string, isExpanded: boolean, initiatingContainer?: HTMLElement): void {
    this.expansionStateByNote.set(sourcePath, isExpanded);
    const containers = new Set(this.getMetadataContainers(sourcePath));
    if (initiatingContainer !== undefined) {
      containers.add(initiatingContainer);
    }
    for (const container of containers) {
      this.applyExpansionStateToContainer(container, isExpanded);
    }
    const settings = this.pluginSettingsComponent.settings;
    if (settings.isRememberLastUsedMainUiToggleStatesEnabled && settings.isRememberAllNestedPropertiesExpansionToggleStateEnabled) {
      invokeAsyncSafely(() =>
        this.pluginSettingsComponent.editAndSave((value) => {
          value.allNestedPropertiesExpansionStateByNote = { ...value.allNestedPropertiesExpansionStateByNote, [sourcePath]: isExpanded };
        })
      );
    }
  }

  private setFullKeyNamesState(sourcePath: string, isExpanded: boolean): void {
    this.fullKeyNamesStateByNote.set(sourcePath, isExpanded);
    const settings = this.pluginSettingsComponent.settings;
    if (settings.isRememberLastUsedMainUiToggleStatesEnabled && settings.isRememberFullKeyNamesExpansionToggleStateEnabled) {
      invokeAsyncSafely(() =>
        this.pluginSettingsComponent.editAndSave((value) => {
          value.fullKeyNamesExpansionStateByNote = { ...value.fullKeyNamesExpansionStateByNote, [sourcePath]: isExpanded };
        })
      );
    }
  }

  private showNestedPropertyMenu(params: NestedPropertyRendererComponentShowNestedPropertyMenuParams): void {
    const { $event, getValue, label, onDelete, onValueChange, path } = params;
    const MENU_DELAY_IN_MILLISECONDS = 200;
    if (Date.now() - this.lastMenuCloseTime < MENU_DELAY_IN_MILLISECONDS) {
      return;
    }
    // Read the live value at menu-open time. In-place scalar edits do not re-render this widget, so the
    // Render-time captured value would be stale for the Cut/Copy payload and the type submenu (issue #7).
    const value = getValue();
    const menu = new Menu();
    menu.onHide(() => {
      this.lastMenuCloseTime = Date.now();
    });
    menu.addSections(['type', 'action', '', 'danger']);
    const itemKey = getItemTypeKey(path);
    const fieldKey = getFieldTypeKey(path);
    const effectiveType = this.getWidget({ label, path, value }).type;
    if (fieldKey !== null && fieldKey !== itemKey) {
      // Array-item field: offer both the shared per-field default and a per-item override.
      const inferredType = this.app.metadataTypeManager.getTypeInfo(label, value).inferred.type;
      const fieldAssignedType = this.app.metadataTypeManager.getAssignedWidget(fieldKey);
      this.addTypeSubmenu({
        checkedType: fieldAssignedType ?? inferredType,
        menu,
        onValueChange,
        title: 'Property type (all items)',
        typeKey: fieldKey,
        value
      });
      this.addTypeSubmenu({
        checkedType: effectiveType,
        menu,
        onValueChange,
        title: 'Property type (this item only)',
        typeKey: itemKey,
        value
      });
    } else {
      this.addTypeSubmenu({
        checkedType: effectiveType,
        menu,
        onValueChange,
        title: 'Property type',
        typeKey: itemKey,
        value
      });
    }
    menu.addItem((item) => {
      item.setTitle('Cut')
        .setIcon('lucide-scissors')
        .setSection('action')
        .onClick(convertAsyncToSync(async () => {
          // eslint-disable-next-line n/no-unsupported-features/node-builtins -- navigator.clipboard is the Web Clipboard API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
          await navigator.clipboard.writeText(JSON.stringify({ [label]: value }));
          onDelete();
        }));
    });
    menu.addItem((item) => {
      item.setTitle('Copy')
        .setIcon('lucide-copy')
        .setSection('action')
        .onClick(convertAsyncToSync(async () => {
          // eslint-disable-next-line n/no-unsupported-features/node-builtins -- navigator.clipboard is the Web Clipboard API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
          await navigator.clipboard.writeText(JSON.stringify({ [label]: value }));
        }));
    });
    menu.addItem((item) => {
      item.setTitle('Paste')
        .setIcon('lucide-clipboard-paste')
        .setSection('action')
        .onClick(convertAsyncToSync(async () => {
          try {
            // eslint-disable-next-line n/no-unsupported-features/node-builtins -- navigator.clipboard is the Web Clipboard API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
            const text = await navigator.clipboard.readText();
            const parsed = JSON.parse(text);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const firstValue = Object.values(parsed as GenericObject)[0];
              if (firstValue !== undefined) {
                onValueChange(firstValue);
              }
            }
          } catch (error) {
            console.error(error);
          }
        }));
    });
    menu.addItem((item) => {
      item.dom.addClass('is-warning');
      item.setTitle('Remove')
        .setIcon('lucide-trash-2')
        .setSection('danger')
        .onClick(onDelete);
    });
    menu.showAtMouseEvent($event);
  }
}

export function renameObjectKey($object: GenericObject, oldKey: string, requestedKey: string): GenericObject | null {
  const newKey = requestedKey.trim();
  if (newKey === '' || newKey === oldKey || Object.keys($object).includes(newKey) || !Object.keys($object).includes(oldKey)) {
    return null;
  }
  return Object.fromEntries(Object.entries($object).map(([key, value]) => [key === oldKey ? newKey : key, value]));
}

export function resolveGlobalToggleState(isExpandEnabled: boolean, isCollapseEnabled: boolean): boolean | null {
  return isCollapseEnabled ? false : (isExpandEnabled ? true : null);
}

function collapseAllIn(collapsibles: Iterable<HTMLElement>, expandedPaths: Set<string>): void {
  for (const el of collapsibles) {
    el.classList.add('is-collapsed');
    const path = el.dataset['path'];
    if (path) {
      expandedPaths.delete(path);
    }
  }
}

function createNestedPropertyKeyInput(params: CreateNestedPropertyKeyInputParams): HTMLInputElement {
  const { keyEl, label, onKeyChange } = params;
  const keyInput = keyEl.createEl('input', {
    attr: onKeyChange === null
      ? { readonly: '', tabindex: '-1' }
      : { 'aria-label': `Edit nested property key ${label}`, 'spellcheck': 'false', 'type': 'text' },
    cls: 'metadata-property-key-input',
    value: label
  });
  keyInput.size = Math.max(1, label.length);
  if (onKeyChange === null) {
    return keyInput;
  }

  function restore(): void {
    keyInput.value = label;
    keyInput.size = Math.max(1, label.length);
  }
  keyInput.addEventListener('input', () => {
    keyInput.size = Math.max(1, keyInput.value.length);
  });
  keyInput.addEventListener('keydown', ($event) => {
    $event.stopPropagation();
    if ($event.key === 'Enter') {
      $event.preventDefault();
      keyInput.blur();
    } else if ($event.key === 'Escape') {
      $event.preventDefault();
      restore();
      keyInput.blur();
    }
  });
  keyInput.addEventListener('blur', () => {
    const newKey = keyInput.value.trim();
    if (newKey === label) {
      restore();
      return;
    }
    if (newKey === '' || !onKeyChange(newKey)) {
      restore();
    }
  });
  return keyInput;
}

function createSummary(params: CreateSummaryParams): void {
  const { expandedPaths, parentEl, path, propertyEl, value } = params;
  const summary = parentEl.createSpan({ cls: 'nested-properties-summary', text: Array.isArray(value) ? '[ ... ]' : '{ ... }' });
  summary.addEventListener('click', ($event) => {
    $event.stopPropagation();
    $event.preventDefault();
    propertyEl.classList.remove('is-collapsed');
    expandedPaths.add(path);
    dispatchPropertyFieldLayoutChange(propertyEl);
  });
}

function expandAllIn(collapsibles: Iterable<HTMLElement>, expandedPaths: Set<string>): void {
  for (const el of collapsibles) {
    el.classList.remove('is-collapsed');
    const path = el.dataset['path'];
    if (path) {
      expandedPaths.add(path);
    }
  }
}

// The collapsed per-field key: array indices are removed so a field's type applies to every item
// (e.g. `versions.0.released` and `versions.1.released` share `versions.released`). Returns null when
// The LAST segment is itself an index (the array-item node) - collapsing it would collide with the
// Parent array's own key and make an item render with the array's type.
function getFieldTypeKey(path: string): null | string {
  const itemKey = getItemTypeKey(path);
  const lastSegment = itemKey.slice(itemKey.lastIndexOf('.') + 1);
  if (/^\d+$/.test(lastSegment)) {
    return null;
  }
  return itemKey.split('.').filter((segment) => !/^\d+$/.test(segment)).join('.');
}

// The persisted type key for an exact node: the plugin's dotted `path` with the leading
// `sourcePath:` dropped so the key is vault-global (matching Obsidian's flat `types.json`).
// `context.sourcePath` is vault-relative and never contains a colon, so the first `:` is safe to split on.
function getItemTypeKey(path: string): string {
  return path.slice(path.indexOf(':') + 1);
}

function injectHeaderButtons(params: InjectHeaderButtonsParams): void {
  const { isAllNestedPropertiesToggleEnabled, isFullKeyNamesExpanded, isFullKeyNamesToggleEnabled, metadataContainerEl, onAllNestedPropertiesStateChanged, onToggleFullKeyDisplay } = params;
  if (metadataContainerEl.querySelector('.nested-properties-header-actions')) {
    return;
  }

  if (!metadataContainerEl.querySelector('.nested-properties-collapsible')) {
    return;
  }

  const headingEl = metadataContainerEl.querySelector('.metadata-properties-heading');
  if (!headingEl) {
    return;
  }

  const actionsEl = metadataContainerEl.createDiv({ cls: 'nested-properties-header-actions' });
  headingEl.after(actionsEl);

  const toggleButton = actionsEl.createDiv({ cls: 'clickable-icon nested-properties-all-toggle' });
  updateToggleButton({ isDisabled: !isAllNestedPropertiesToggleEnabled, metadataContainerEl, toggleButton });

  toggleButton.addEventListener('click', ($event) => {
    $event.stopPropagation();
    $event.preventDefault();
    if (toggleButton.classList.contains(MAIN_UI_TOGGLE_DISABLED_CLASS)) {
      return;
    }
    const allCollapsibles = metadataContainerEl.querySelectorAll<HTMLElement>('.nested-properties-collapsible');
    const isAllCollapsed = allCollapsibles.length > 0 && [...allCollapsibles].every((el) => el.classList.contains('is-collapsed'));
    onAllNestedPropertiesStateChanged(isAllCollapsed, metadataContainerEl);
  });

  const fullKeyToggleButton = actionsEl.createDiv({ cls: 'clickable-icon nested-properties-full-key-toggle' });
  setIcon(fullKeyToggleButton, 'lucide-wrap-text');
  setFullKeyToggleButtonState(fullKeyToggleButton, isFullKeyNamesExpanded, !isFullKeyNamesToggleEnabled);
  fullKeyToggleButton.addEventListener('click', ($event) => {
    $event.stopPropagation();
    $event.preventDefault();
    if (!fullKeyToggleButton.classList.contains(MAIN_UI_TOGGLE_DISABLED_CLASS)) {
      onToggleFullKeyDisplay(metadataContainerEl);
    }
  });
}

function renderAddItemButton(params: RenderAddItemButtonParams): void {
  const { array, containerEl, onValueChange } = params;
  const newItemButtonEl = containerEl.createDiv({ cls: 'nested-properties-add-item' });
  setIcon(newItemButtonEl, 'plus');
  newItemButtonEl.createSpan({ text: 'Add item' });
  newItemButtonEl.addEventListener('click', ($event) => {
    $event.stopPropagation();
    $event.preventDefault();
    onValueChange([...array, '']);
  });
}

function renderAddPropertyButton(params: RenderAddPropertyButtonParams): void {
  const { $object, containerEl, onValueChange, setPendingFocusKey } = params;
  const newPropertyButtonEl = containerEl.createDiv({ cls: 'nested-properties-add-property' });
  setIcon(newPropertyButtonEl, 'plus');
  newPropertyButtonEl.createSpan({ text: 'Add property' });
  newPropertyButtonEl.addEventListener('click', ($event) => {
    $event.stopPropagation();
    $event.preventDefault();

    newPropertyButtonEl.empty();
    const input = newPropertyButtonEl.createEl('input', {
      attr: { placeholder: 'Property name', type: 'text' },
      cls: 'nested-properties-add-property-input'
    });
    input.focus();

    function restoreButton(): void {
      newPropertyButtonEl.empty();
      setIcon(newPropertyButtonEl, 'plus');
      newPropertyButtonEl.createSpan({ text: 'Add property' });
    }

    function addKey(shouldFocusValue: boolean): void {
      const key = input.value.trim();
      // `Object.keys` rather than `hasOwn`: the latter is a type guard, and its false branch narrows
      // `$object` to something the spread below can no longer accept.
      if (key && !Object.keys($object).includes(key)) {
        if (shouldFocusValue) {
          setPendingFocusKey(key);
        }
        onValueChange({ ...$object, [key]: '' });
      } else {
        restoreButton();
      }
    }

    input.addEventListener('keydown', (ke) => {
      ke.stopPropagation();
      if (ke.key === 'Enter' || ke.key === 'Tab') {
        ke.preventDefault();
        try {
          input.remove();
        } catch {
          /*
          Already removed by blur
          */
        }
        addKey(ke.key === 'Tab');
        return;
      }
      if (ke.key === 'Escape') {
        ke.preventDefault();
        restoreButton();
      }
    });
    input.addEventListener('blur', () => {
      if (input.isConnected) {
        addKey(false);
      }
    });
  });
}

function setFullKeyToggleButtonState(toggleButton: HTMLElement, isExpanded: boolean, isDisabled: boolean): void {
  toggleButton.setAttribute('aria-label', isExpanded ? 'Collapse Full Key Names' : 'Expand Full Key Names');
  setMainUiToggleDisabled(toggleButton, isDisabled);
}

function setMainUiToggleDisabled(toggleButton: HTMLElement, isDisabled: boolean): void {
  toggleButton.classList.toggle(MAIN_UI_TOGGLE_DISABLED_CLASS, isDisabled);
  toggleButton.setAttribute('aria-disabled', String(isDisabled));
  toggleButton.setAttribute('tabindex', isDisabled ? '-1' : '0');
}

function setToggleButtonState(toggleButton: HTMLElement, isAllCollapsed: boolean, isDisabled: boolean): void {
  toggleButton.setAttribute('aria-label', isAllCollapsed ? 'Expand All Nested Properties' : 'Collapse All Nested Properties');
  toggleButton.empty();
  setIcon(toggleButton, isAllCollapsed ? 'chevrons-up-down' : 'chevrons-down-up');
  setMainUiToggleDisabled(toggleButton, isDisabled);
}

function sizeTopLevelKeyInputs(metadataContainerEl: HTMLElement): void {
  // Size the native key input of every top-level property to its content so the full-key-display
  // Toggle (`width: auto`) can expand it. Obsidian renders plain scalar properties itself, so unlike
  // The object/list keys and nested keys the plugin never set their `size` - without this they stay
  // Truncated even when full key display is on. The `size` is inert while the toggle is off, because
  // Obsidian's default input width overrides it until the body class switches to `width: auto`.
  for (const input of metadataContainerEl.querySelectorAll(':scope .metadata-property-key-input')) {
    if (input.instanceOf(HTMLInputElement) && !input.closest('.nested-properties-container')) {
      input.size = Math.max(1, input.value.length);
    }
  }
}

function updateToggleButton(params: UpdateToggleButtonParams): void {
  const { isDisabled, metadataContainerEl, toggleButton } = params;
  const allCollapsibles = metadataContainerEl.querySelectorAll('.nested-properties-collapsible');
  const isAllCollapsed = allCollapsibles.length > 0 && [...allCollapsibles].every((el) => el.classList.contains('is-collapsed'));

  setToggleButtonState(toggleButton, isAllCollapsed, isDisabled);
}
