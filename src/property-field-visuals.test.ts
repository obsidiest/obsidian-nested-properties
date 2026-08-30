import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PropertyFieldNode } from './property-field-tree.ts';

import { PluginSettings } from './plugin-settings.ts';
import {
  applyRecordedPropertyEditRedo,
  applyRedoFallback,
  buildRoundedPath,
  computeTextReplacement,
  createCssNumberReader,
  findElementAtClientY,
  flattenVisiblePropertyFieldForest,
  getBreadcrumbKeyboardTarget,
  getPropertyFieldMutationContainers,
  getShownMetadataContainers,
  getShownSourceViews,
  getSourceKeyCharacterRange,
  getThreadDepthColorIndex,
  hideSourceViewOverlay,
  isContainerRenderCurrent,
  isPropertyFieldMutation,
  isPropertyVisualStyleMutation,
  isRedoShortcut,
  isSourceEditorMutation,
  isSourceViewModeMutation,
  isUndoShortcut,
  PropertyFieldVisualsComponent,
  removeMetadataContainerVisualArtifacts,
  removeSourceViewVisualArtifacts,
  resolveBreadcrumbActivationScope,
  resolveDomBreadcrumbPropertyAtPointer,
  resolveDomPropertyAtPointer,
  resolveSourceBreadcrumbLineAtPointer,
  resolveSourceLine,
  resolveSourceLineElementAtPointer,
  shouldUsePropertyRedoFallback
} from './property-field-visuals.ts';

interface TestActiveField {
  element: HTMLElement;
  kind: string;
}

interface TestDocumentState {
  active: null | TestActiveField;
  bodyStyleObserver: null;
  cleanups: (() => void)[];
  hideTimer: null;
  hoveredBreadcrumbField: HTMLElement | null;
  hoveredThreadingField: HTMLElement | null;
  isPropertyRedoArmed: boolean;
  lastPropertyEdit: unknown;
  lastPropertyEditorView: unknown;
  mutationObserver: null;
  pendingPropertyRedo: unknown;
  popover: HTMLElement | null;
  propertyEditCaptureTimer: null;
  propertyEditStart: unknown;
  redoFallbackTimer: null;
  renderedContainers: Set<HTMLElement>;
  renderedSourceViews: Set<HTMLElement>;
  renderFrame: null;
  renderGeneration: number;
  sourceHighlight: null;
  sourceModeObservers: Map<HTMLElement, MutationObserver>;
}

interface TestEditorPosition {
  ch: number;
  line: number;
}

interface TestPropertyFieldVisualsComponent {
  documentStates: Map<Document, TestDocumentState>;
  findMarkdownView(ownerDocument: Document, target: EventTarget | null): unknown;
  onKeyDown(ownerDocument: Document, event: KeyboardEvent): void;
  onPointerMove(ownerDocument: Document, event: PointerEvent): void;
}

type VisualMutation = Parameters<typeof isPropertyFieldMutation>[0];

function createAttributeMutation(target: Element, attributeName: 'class' | 'style', oldValue: string): VisualMutation {
  return {
    addedNodes: [],
    attributeName,
    oldValue,
    removedNodes: [],
    target
  };
}

function createMutation(target: Node, addedNodes: Node[] = [], removedNodes: Node[] = []): VisualMutation {
  return {
    addedNodes,
    attributeName: null,
    oldValue: null,
    removedNodes,
    target
  };
}

describe('buildRoundedPath', () => {
  it('should produce a rounded vertical-to-horizontal connector', () => {
    expect(buildRoundedPath({ endX: 40, endY: 30, radius: 6, startX: 10, startY: 0 })).toBe('M 10 0 V 24 Q 10 30 16 30 H 40');
  });

  it('should clamp radius to the available distance', () => {
    expect(buildRoundedPath({ endX: 13, endY: 2, radius: 20, startX: 10, startY: 0 })).toBe('M 10 0 V 0 Q 10 2 12 2 H 13');
  });

  it('should use a straight connector for a zero radius or level endpoints', () => {
    expect(buildRoundedPath({ endX: 40, endY: 30, radius: 0, startX: 10, startY: 0 })).toBe('M 10 0 V 30 H 40');
    expect(buildRoundedPath({ endX: 40, endY: 30, radius: 6, startX: 10, startY: 30 })).toBe('M 10 30 V 30 H 40');
  });
});

describe('getBreadcrumbKeyboardTarget', () => {
  it('should move within the available breadcrumb rows', () => {
    expect(getBreadcrumbKeyboardTarget('ArrowDown', 1, 4)).toBe(2);
    expect(getBreadcrumbKeyboardTarget('ArrowDown', 3, 4)).toBe(3);
    expect(getBreadcrumbKeyboardTarget('ArrowUp', 1, 4)).toBe(0);
    expect(getBreadcrumbKeyboardTarget('ArrowUp', 0, 4)).toBe(0);
  });

  it('should support first and last row shortcuts', () => {
    expect(getBreadcrumbKeyboardTarget('Home', 2, 4)).toBe(0);
    expect(getBreadcrumbKeyboardTarget('End', 1, 4)).toBe(3);
  });

  it('should ignore unsupported keys and empty breadcrumbs', () => {
    expect(getBreadcrumbKeyboardTarget('Enter', 1, 4)).toBeNull();
    expect(getBreadcrumbKeyboardTarget('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('getThreadDepthColorIndex', () => {
  it('should assign colors by depth and keep the eighth color for deeper fields', () => {
    expect(getThreadDepthColorIndex(0)).toBe(1);
    expect(getThreadDepthColorIndex(6)).toBe(7);
    expect(getThreadDepthColorIndex(7)).toBe(8);
    expect(getThreadDepthColorIndex(20)).toBe(8);
    expect(getThreadDepthColorIndex(-2)).toBe(1);
  });
});

describe('property field visual render guards', () => {
  it('should prioritize full-field then full-key then toggle-only breadcrumb activation', () => {
    expect(resolveBreadcrumbActivationScope(true, true)).toBe('field');
    expect(resolveBreadcrumbActivationScope(false, true)).toBe('key');
    expect(resolveBreadcrumbActivationScope(false, false)).toBe('toggle');
  });

  it('should resolve the full horizontal field from its vertical row band', () => {
    const first = document.body.createDiv();
    const second = document.body.createDiv();
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue({ bottom: 30, height: 20, top: 10 } as DOMRect);
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue({ bottom: 60, height: 20, top: 40 } as DOMRect);

    expect(findElementAtClientY([first, second], 20)).toBe(first);
    expect(findElementAtClientY([first, second], 50)).toBe(second);
    expect(findElementAtClientY([first, second], 35)).toBeNull();
    first.remove();
    second.remove();
  });

  it('should resolve a rendered property from its key, value, or blank row width', () => {
    const container = document.body.createDiv({ cls: 'metadata-container' });
    const property = container.createDiv({ cls: 'metadata-property' });
    const key = property.createDiv({ cls: 'metadata-property-key', text: 'Key' });
    const value = property.createDiv({ cls: 'metadata-property-value', text: 'Value' });
    vi.spyOn(key, 'getBoundingClientRect').mockReturnValue({ bottom: 40, height: 20, left: 10, right: 250, top: 20, width: 240 } as DOMRect);
    vi.spyOn(value, 'getBoundingClientRect').mockReturnValue({ bottom: 40, height: 20, left: 250, right: 900, top: 20, width: 650 } as DOMRect);

    expect(resolveDomPropertyAtPointer(key, 20, 30)).toBe(property);
    expect(resolveDomPropertyAtPointer(value, 500, 30)).toBe(property);
    expect(resolveDomPropertyAtPointer(container, 800, 30)).toBe(property);
    expect(resolveDomPropertyAtPointer(container, 800, 50)).toBeNull();
    container.remove();
  });

  it('should activate both a Live Preview breadcrumb and threading from a full key-width pointer event', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const settings = new PluginSettings();
    settings.isPropertyFieldThreadingEnabled = true;
    const component = castTo<TestPropertyFieldVisualsComponent>(
      new PropertyFieldVisualsComponent(castTo<ConstructorParameters<typeof PropertyFieldVisualsComponent>[0]>({
        app: { workspace: { layoutReady: false } },
        pluginSettingsComponent: { settings }
      }))
    );
    const state: TestDocumentState = {
      active: null,
      bodyStyleObserver: null,
      cleanups: [],
      hideTimer: null,
      hoveredBreadcrumbField: null,
      hoveredThreadingField: null,
      isPropertyRedoArmed: false,
      lastPropertyEdit: null,
      lastPropertyEditorView: null,
      mutationObserver: null,
      pendingPropertyRedo: null,
      popover: null,
      propertyEditCaptureTimer: null,
      propertyEditStart: null,
      redoFallbackTimer: null,
      renderedContainers: new Set(),
      renderedSourceViews: new Set(),
      renderFrame: null,
      renderGeneration: 0,
      sourceHighlight: null,
      sourceModeObservers: new Map()
    };
    component.documentStates.set(document, state);
    const sourceView = document.body.createDiv({ cls: ['markdown-source-view', 'is-live-preview'] });
    const container = sourceView.createDiv({ cls: 'metadata-container' });
    const property = container.createDiv({ cls: 'metadata-property' });
    const key = property.createDiv({ cls: 'metadata-property-key', text: 'Key' });
    const value = property.createDiv({ cls: 'metadata-property-value', text: 'Value' });
    vi.spyOn(key, 'getBoundingClientRect').mockReturnValue({ bottom: 40, height: 20, left: 10, right: 300, top: 20, width: 290 } as DOMRect);
    vi.spyOn(value, 'getBoundingClientRect').mockReturnValue({ bottom: 40, height: 20, left: 300, right: 900, top: 20, width: 600 } as DOMRect);

    component.onPointerMove(document, castTo<PointerEvent>({ clientX: 250, clientY: 30, target: key }));

    expect(state.active).toMatchObject({ element: property, kind: 'dom' });
    expect(state.hoveredBreadcrumbField).toBe(property);
    expect(state.popover?.classList.contains('np-property-breadcrumb-popover')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    state.popover?.remove();
    sourceView.remove();
    component.documentStates.delete(document);
    Reflect.deleteProperty(window.HTMLElement.prototype, 'scrollIntoView');
  });

  it('should keep key-only property rows pointer-safe when Obsidian has not mounted a value yet', () => {
    const container = document.body.createDiv({ cls: 'metadata-container' });
    const property = container.createDiv({ cls: 'metadata-property' });
    const key = property.createDiv({ cls: 'metadata-property-key', text: 'Key' });
    vi.spyOn(key, 'getBoundingClientRect').mockReturnValue({ bottom: 40, height: 20, left: 10, right: 250, top: 20, width: 240 } as DOMRect);

    expect(resolveDomPropertyAtPointer(key, 20, 30)).toBe(property);
    container.remove();
  });

  it('should activate Source breadcrumb and threading for a flattened root property across its full row', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const settings = new PluginSettings();
    settings.isFullWidthPropertyFieldHoverActivationEnabled = true;
    settings.isPropertyFieldThreadingEnabled = true;
    const component = castTo<TestPropertyFieldVisualsComponent>(
      new PropertyFieldVisualsComponent(castTo<ConstructorParameters<typeof PropertyFieldVisualsComponent>[0]>({
        app: { workspace: { layoutReady: false } },
        pluginSettingsComponent: { settings }
      }))
    );
    const state = castTo<TestDocumentState>({
      active: null,
      bodyStyleObserver: null,
      cleanups: [],
      hideTimer: null,
      hoveredBreadcrumbField: null,
      hoveredThreadingField: null,
      isPropertyRedoArmed: false,
      lastPropertyEdit: null,
      lastPropertyEditorView: null,
      mutationObserver: null,
      pendingPropertyRedo: null,
      popover: null,
      propertyEditCaptureTimer: null,
      propertyEditStart: null,
      redoFallbackTimer: null,
      renderedContainers: new Set(),
      renderedSourceViews: new Set(),
      renderFrame: null,
      renderGeneration: 0,
      sourceHighlight: null,
      sourceModeObservers: new Map()
    });
    component.documentStates.set(document, state);
    const sourceView = document.body.createDiv({ cls: 'markdown-source-view mod-cm6' });
    const content = sourceView.createDiv({ cls: 'cm-content' });
    const line = content.createDiv({ cls: 'cm-line', text: 'root.child: value' });
    vi.spyOn(sourceView, 'getBoundingClientRect').mockReturnValue({ bottom: 500, height: 500, left: 0, right: 1000, top: 0, width: 1000 } as DOMRect);
    vi.spyOn(line, 'getBoundingClientRect').mockReturnValue({ bottom: 40, height: 20, left: 20, right: 900, top: 20, width: 880 } as DOMRect);
    const source = '---\nroot.child: value\n---';
    const view = {
      containerEl: sourceView,
      editor: {
        getCursor: (): TestEditorPosition => ({ ch: 0, line: 1 }),
        getValue: (): string => source
      }
    };
    component.findMarkdownView = (): unknown => view;

    component.onPointerMove(document, castTo<PointerEvent>({ clientX: 800, clientY: 30, target: content }));

    expect(state.active).toMatchObject({ kind: 'source', line: 1 });
    expect(state.hoveredBreadcrumbField).toBe(line);
    expect(state.hoveredThreadingField).toBe(line);
    expect(state.popover?.classList.contains('np-property-breadcrumb-popover')).toBe(true);
    expect(line.classList.contains('np-property-field-source-highlight')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    state.popover?.remove();
    sourceView.remove();
    component.documentStates.delete(document);
    Reflect.deleteProperty(window.HTMLElement.prototype, 'scrollIntoView');
  });

  it('should apply field, key, and icon activation scopes without changing full-row resolution', () => {
    const container = document.body.createDiv({ cls: 'metadata-container' });
    const property = container.createDiv({ cls: 'metadata-property' });
    const key = property.createDiv({ cls: 'metadata-property-key' });
    const icon = key.createDiv({ cls: 'metadata-property-icon' });
    const collapse = key.createDiv({ cls: 'nested-properties-collapse-btn' });
    const value = property.createDiv({ cls: 'metadata-property-value' });
    vi.spyOn(key, 'getBoundingClientRect').mockReturnValue({ bottom: 40, height: 20, left: 10, right: 250, top: 20, width: 240 } as DOMRect);
    vi.spyOn(value, 'getBoundingClientRect').mockReturnValue({ bottom: 40, height: 20, left: 250, right: 900, top: 20, width: 650 } as DOMRect);

    expect(resolveDomBreadcrumbPropertyAtPointer(value, 800, 30, 'field')).toBe(property);
    expect(resolveDomBreadcrumbPropertyAtPointer(value, 200, 30, 'key')).toBe(property);
    expect(resolveDomBreadcrumbPropertyAtPointer(key, 300, 30, 'key')).toBeNull();
    expect(resolveDomBreadcrumbPropertyAtPointer(icon, 20, 30, 'toggle')).toBe(property);
    expect(resolveDomBreadcrumbPropertyAtPointer(collapse, 20, 30, 'toggle')).toBe(property);
    expect(resolveDomBreadcrumbPropertyAtPointer(key, 20, 30, 'toggle')).toBeNull();
    expect(resolveDomPropertyAtPointer(value, 800, 30)).toBe(property);
    container.remove();
  });

  it('should resolve a Source-mode property line across its full editor width', () => {
    const sourceView = document.body.createDiv({ cls: 'markdown-source-view mod-cm6' });
    const line = sourceView.createDiv({ cls: 'cm-line', text: 'root: value' });
    vi.spyOn(line, 'getBoundingClientRect').mockReturnValue({ bottom: 40, height: 20, top: 20 } as DOMRect);

    expect(resolveSourceLineElementAtPointer(line, 40, 30)).toBe(line);
    expect(resolveSourceLineElementAtPointer(sourceView, 500, 30)).toBe(line);
    expect(resolveSourceLineElementAtPointer(sourceView, 500, 50)).toBeNull();
    expect(resolveSourceLineElementAtPointer(document.body, 500, 30)).toBeNull();
    sourceView.remove();
  });

  it('should identify Source-mode YAML key character ranges', () => {
    expect(getSourceKeyCharacterRange('  root: value')).toEqual({ end: 7, start: 2 });
    expect(getSourceKeyCharacterRange('  - name: Ada')).toEqual({ end: 9, start: 4 });
    expect(getSourceKeyCharacterRange('  - scalar')).toEqual({ end: 3, start: 2 });
    expect(getSourceKeyCharacterRange('  "quoted:key": value')).toEqual({ end: 15, start: 2 });
    expect(getSourceKeyCharacterRange('flow[key:part]: value')).toEqual({ end: 15, start: 0 });
    expect(getSourceKeyCharacterRange('not a mapping')).toBeNull();
  });

  it('should apply full-field, key-range, and fold-toggle Source activation scopes', () => {
    const sourceView = document.body.createDiv({ cls: 'markdown-source-view mod-cm6' });
    const content = sourceView.createDiv({ cls: 'cm-content' });
    const line = content.createDiv({ cls: 'cm-line', text: 'root: value' });
    const foldGutter = sourceView.createDiv({ cls: 'cm-foldGutter' });
    const foldToggle = foldGutter.createDiv({ cls: 'cm-gutterElement', text: '⌄' });
    const emptyGutter = foldGutter.createDiv({ cls: 'cm-gutterElement' });
    vi.spyOn(line, 'getBoundingClientRect').mockReturnValue({ bottom: 40, height: 20, left: 10, right: 800, top: 20, width: 790 } as DOMRect);
    const createRange = vi.spyOn(document, 'createRange').mockReturnValue(castTo<Range>({
      getBoundingClientRect: () => ({ left: 10, right: 70, width: 60 }),
      getClientRects: () => [],
      setEnd: vi.fn(),
      setStart: vi.fn()
    }));

    expect(resolveSourceBreadcrumbLineAtPointer(sourceView, 500, 30, 'field')).toBe(line);
    expect(resolveSourceBreadcrumbLineAtPointer(line, 40, 30, 'key')).toBe(line);
    expect(resolveSourceBreadcrumbLineAtPointer(line, 90, 30, 'key')).toBeNull();
    expect(resolveSourceBreadcrumbLineAtPointer(foldToggle, 500, 30, 'toggle')).toBe(line);
    expect(resolveSourceBreadcrumbLineAtPointer(emptyGutter, 500, 30, 'toggle')).toBeNull();
    expect(resolveSourceBreadcrumbLineAtPointer(line, 40, 30, 'toggle')).toBeNull();
    createRange.mockRestore();
    sourceView.remove();
  });

  it('should recognize only the Windows Ctrl+Y redo shortcut', () => {
    expect(isRedoShortcut({ altKey: false, ctrlKey: true, key: 'y', metaKey: false, shiftKey: false })).toBe(true);
    expect(isRedoShortcut({ altKey: false, ctrlKey: true, key: 'Y', metaKey: false, shiftKey: false })).toBe(true);
    expect(isRedoShortcut({ altKey: false, ctrlKey: true, key: 'y', metaKey: false, shiftKey: true })).toBe(false);
    expect(isRedoShortcut({ altKey: false, ctrlKey: false, key: 'y', metaKey: true, shiftKey: false })).toBe(false);
  });

  it('should recognize only the Windows Ctrl+Z undo shortcut', () => {
    expect(isUndoShortcut({ altKey: false, ctrlKey: true, key: 'z', metaKey: false, shiftKey: false })).toBe(true);
    expect(isUndoShortcut({ altKey: false, ctrlKey: true, key: 'Z', metaKey: false, shiftKey: false })).toBe(true);
    expect(isUndoShortcut({ altKey: false, ctrlKey: true, key: 'z', metaKey: false, shiftKey: true })).toBe(false);
    expect(isUndoShortcut({ altKey: false, ctrlKey: false, key: 'z', metaKey: true, shiftKey: false })).toBe(false);
  });

  it('should hide and fully remove Source-owned visuals without removing Live Preview tree overlays', () => {
    const sourceView = document.body.createDiv({ cls: ['markdown-source-view', 'np-property-source-overlay-host'] });
    const sourceOverlay = sourceView.createSvg('svg', { cls: 'np-property-source-overlay' });
    const sourceLine = sourceView.createDiv({ cls: 'np-property-field-source-highlight' });
    const metadata = sourceView.createDiv({ cls: 'metadata-container' });
    const metadataOverlay = metadata.createSvg('svg', { cls: 'np-property-tree-overlay' });

    hideSourceViewOverlay(sourceView);
    expect(sourceOverlay.classList.contains('np-property-source-overlay-hidden')).toBe(true);
    removeSourceViewVisualArtifacts(sourceView);
    expect(sourceOverlay.isConnected).toBe(false);
    expect(sourceLine.classList.contains('np-property-field-source-highlight')).toBe(false);
    expect(sourceView.classList.contains('np-property-source-overlay-host')).toBe(false);
    expect(metadataOverlay.isConnected).toBe(true);

    const node = metadata.createDiv({ cls: ['metadata-property', 'np-property-tree-node', 'np-property-field-active'] });
    node.setCssProps({ '--np-property-depth': '2' });
    removeMetadataContainerVisualArtifacts(metadata);
    expect(metadataOverlay.isConnected).toBe(false);
    expect(node.classList.contains('np-property-tree-node')).toBe(false);
    expect(node.classList.contains('np-property-field-active')).toBe(false);
    expect(node.style.getPropertyValue('--np-property-depth')).toBe('');
    sourceView.remove();
  });

  it('should preserve native editing history except after leaving a Live Preview property editor', () => {
    const input = document.body.createEl('input');
    const sourceView = document.body.createDiv({ cls: 'markdown-source-view' });
    const sourceContent = sourceView.createDiv({ attr: { contenteditable: 'true' }, cls: 'cm-content' });
    const livePreviewView = document.body.createDiv({ cls: ['markdown-source-view', 'is-live-preview'] });
    const livePreviewContent = livePreviewView.createDiv({ attr: { contenteditable: 'true' }, cls: 'cm-content' });
    const metadataContainer = livePreviewContent.createDiv({ cls: 'metadata-container' });
    const propertyEditor = metadataContainer.createDiv({ attr: { contenteditable: 'true' } });

    expect(shouldUsePropertyRedoFallback(document.body)).toBe(true);
    expect(shouldUsePropertyRedoFallback(input)).toBe(false);
    expect(shouldUsePropertyRedoFallback(sourceContent)).toBe(false);
    expect(shouldUsePropertyRedoFallback(livePreviewContent)).toBe(true);
    expect(shouldUsePropertyRedoFallback(propertyEditor)).toBe(false);

    input.remove();
    sourceView.remove();
    livePreviewView.remove();
  });

  it('should invoke the redo fallback only when Obsidian did not already handle the shortcut', () => {
    const redo = vi.fn();
    expect(applyRedoFallback({ getValue: () => 'unchanged', redo }, 'unchanged')).toBe(true);
    expect(redo).toHaveBeenCalledTimes(1);

    expect(applyRedoFallback({ getValue: () => 'native redo result', redo }, 'before redo')).toBe(false);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('should replay an exact captured Properties edit after Ctrl+Z when native redo is empty', () => {
    let value = '---\nroot: before\n---';
    const replaceRange = vi.fn((replacement: string, from: TestEditorPosition, to: TestEditorPosition): void => {
      value = value.slice(0, from.ch) + replacement + value.slice(to.ch);
    });
    const editor = {
      getValue: (): string => value,
      offsetToPos: (offset: number): TestEditorPosition => ({ ch: offset, line: 0 }),
      redo: vi.fn(),
      replaceRange
    };

    expect(computeTextReplacement(value, '---\nroot: after\n---')).toEqual({ end: 16, replacement: 'after', start: 10 });
    expect(applyRecordedPropertyEditRedo(editor, { after: '---\nroot: after\n---', before: value })).toBe(true);
    expect(value).toBe('---\nroot: after\n---');
    expect(replaceRange).toHaveBeenCalledTimes(1);
    expect(applyRecordedPropertyEditRedo(editor, { after: 'different', before: 'unrelated' })).toBe(false);
    expect(computeTextReplacement(value, value)).toBeNull();
  });

  it('should freeze the Live Preview property transaction at Ctrl+Z and replay it after an empty Ctrl+Y', () => {
    vi.useFakeTimers();
    const settings = new PluginSettings();
    const component = castTo<TestPropertyFieldVisualsComponent>(
      new PropertyFieldVisualsComponent(castTo<ConstructorParameters<typeof PropertyFieldVisualsComponent>[0]>({
        app: { workspace: { layoutReady: false } },
        pluginSettingsComponent: { settings }
      }))
    );
    const before = '---\nroot: before\n---';
    const after = '---\nroot: after\n---';
    let value = after;
    const containerEl = document.body.createDiv();
    const replaceRange = vi.fn((replacement: string, from: TestEditorPosition, to: TestEditorPosition): void => {
      value = value.slice(0, from.ch) + replacement + value.slice(to.ch);
    });
    const view = {
      containerEl,
      editor: {
        getValue: (): string => value,
        offsetToPos: (offset: number): TestEditorPosition => ({ ch: offset, line: 0 }),
        redo: vi.fn(),
        replaceRange
      }
    };
    const state = castTo<TestDocumentState>({
      active: null,
      bodyStyleObserver: null,
      cleanups: [],
      hideTimer: null,
      hoveredBreadcrumbField: null,
      hoveredThreadingField: null,
      isPropertyRedoArmed: true,
      lastPropertyEdit: null,
      lastPropertyEditorView: view,
      mutationObserver: null,
      pendingPropertyRedo: null,
      popover: null,
      propertyEditCaptureTimer: null,
      propertyEditStart: { before, view },
      redoFallbackTimer: null,
      renderedContainers: new Set(),
      renderedSourceViews: new Set(),
      renderFrame: null,
      renderGeneration: 0,
      sourceHighlight: null,
      sourceModeObservers: new Map()
    });
    component.documentStates.set(document, state);

    component.onKeyDown(document, castTo<KeyboardEvent>({ altKey: false, ctrlKey: true, key: 'z', metaKey: false, repeat: false, shiftKey: false }));
    value = before;
    component.onKeyDown(document, castTo<KeyboardEvent>({ altKey: false, ctrlKey: true, key: 'y', metaKey: false, repeat: false, shiftKey: false }));
    vi.runAllTimers();

    expect(view.editor.redo).toHaveBeenCalledTimes(1);
    expect(replaceRange).toHaveBeenCalledTimes(1);
    expect(value).toBe(after);
    expect(state.pendingPropertyRedo).toBeNull();
    component.documentStates.delete(document);
    containerEl.remove();
    vi.useRealTimers();
  });

  it('should disambiguate duplicate Source-mode keys from surrounding visible YAML lines', () => {
    const source = ['---', 'Retail Prices:', '  Worldwide:', '    "1":', '      Date:', '      Price:', 'Other:', '  Price:', '---'].join('\n');
    const content = document.body.createDiv({ cls: 'cm-content' });
    const lines = source.split('\n').slice(1, 8).map((text) => content.createDiv({ cls: 'cm-line', text }));
    const nestedPrice = lines[4];
    if (nestedPrice === undefined) {
      throw new Error('Expected the nested Price line');
    }

    expect(resolveSourceLine(nestedPrice, source, 7)).toBe(5);
    nestedPrice.dataset['line'] = '12';
    expect(resolveSourceLine(nestedPrice, source, 7)).toBe(12);
    content.remove();
  });

  it('should resolve computed Style Settings variables once per tree render', () => {
    const element = document.body.createDiv();
    element.setCssProps({ '--np-first': '12.5px' });
    const computedStyleSpy = vi.spyOn(window, 'getComputedStyle');

    const readNumber = createCssNumberReader(element);

    expect(readNumber('--np-first', 1)).toBe(12.5);
    expect(readNumber('--np-first', 2)).toBe(12.5);
    expect(readNumber('--np-missing', 7)).toBe(7);
    expect(readNumber('--np-missing', 8)).toBe(8);
    expect(computedStyleSpy).toHaveBeenCalledTimes(1);
    computedStyleSpy.mockRestore();
    element.remove();
  });

  it('should prune descendants of collapsed property fields', () => {
    const rootElement = document.body.createDiv({ cls: 'metadata-property is-collapsed' });
    const childElement = document.body.createDiv({ cls: 'metadata-property' });
    const siblingElement = document.body.createDiv({ cls: 'metadata-property' });
    function createNode(element: HTMLElement, key: string): PropertyFieldNode {
      return {
        children: [],
        depth: 0,
        element,
        key,
        keyElement: element,
        parent: null,
        valueElement: null
      };
    }
    const root = createNode(rootElement, 'root');
    const child = createNode(childElement, 'child');
    const sibling = createNode(siblingElement, 'sibling');
    child.depth = 1;
    child.parent = root;
    root.children.push(child);

    expect(flattenVisiblePropertyFieldForest([root, sibling])).toEqual([root, sibling]);
    rootElement.classList.remove('is-collapsed');
    expect(flattenVisiblePropertyFieldForest([root, sibling])).toEqual([root, child, sibling]);
    rootElement.remove();
    childElement.remove();
    siblingElement.remove();
  });

  it('should render only shown metadata containers', () => {
    const shown = document.body.createDiv({ cls: 'metadata-container' });
    const hiddenParent = document.body.createDiv();
    hiddenParent.hide();
    const hidden = hiddenParent.createDiv({ cls: 'metadata-container' });
    vi.spyOn(shown, 'isShown').mockReturnValue(true);
    vi.spyOn(hidden, 'isShown').mockReturnValue(false);

    expect(getShownMetadataContainers(document)).toContain(shown);
    expect(getShownMetadataContainers(document)).not.toContain(hidden);
    shown.remove();
    hiddenParent.remove();
  });

  it('should render only shown full Source-mode editor views', () => {
    const source = document.body.createDiv({ cls: 'markdown-source-view mod-cm6' });
    const livePreview = document.body.createDiv({ cls: 'markdown-source-view mod-cm6 is-live-preview' });
    const hidden = document.body.createDiv({ cls: 'markdown-source-view mod-cm6' });
    vi.spyOn(source, 'isShown').mockReturnValue(true);
    vi.spyOn(hidden, 'isShown').mockReturnValue(false);

    expect(getShownSourceViews(document)).toEqual([source]);
    source.remove();
    livePreview.remove();
    hidden.remove();
  });

  it('should reuse a container render until its generation, dimensions, or active field changes', () => {
    const activeElement = document.body.createDiv();
    const snapshot = { activeElement, generation: 4, height: 200, width: 300 };

    expect(isContainerRenderCurrent(snapshot, 4, 300, 200, activeElement)).toBe(true);
    expect(isContainerRenderCurrent(snapshot, 5, 300, 200, activeElement)).toBe(false);
    expect(isContainerRenderCurrent(snapshot, 4, 301, 200, activeElement)).toBe(false);
    expect(isContainerRenderCurrent(snapshot, 4, 300, 201, activeElement)).toBe(false);
    expect(isContainerRenderCurrent(snapshot, 4, 300, 200, null)).toBe(false);
    expect(isContainerRenderCurrent(undefined, 4, 300, 200, null)).toBe(false);
    activeElement.remove();
  });
});

describe('property field visual mutation filters', () => {
  it('should ignore unrelated Live Preview churn and visual-owned mutations', () => {
    const editor = document.body.createDiv();
    editor.className = 'cm-content';
    const line = editor.createDiv();
    line.className = 'cm-line';
    expect(isPropertyFieldMutation(createMutation(editor, [line]))).toBe(false);

    const metadata = document.body.createDiv();
    metadata.className = 'metadata-container';
    const overlay = createSvg('svg');
    overlay.classList.add('np-property-tree-overlay');
    expect(isPropertyFieldMutation(createMutation(metadata, [overlay]))).toBe(false);
    const path = overlay.createSvg('path');
    expect(isPropertyFieldMutation(createMutation(overlay, [path]))).toBe(false);
    const headerActions = metadata.createDiv({ cls: 'nested-properties-header-actions' });
    const headerIcon = headerActions.createSvg('svg');
    expect(isPropertyFieldMutation(createMutation(headerActions, [headerIcon]))).toBe(false);
    editor.remove();
    metadata.remove();
  });

  it('should render for metadata edits, additions, and removals', () => {
    const metadata = document.body.createDiv();
    metadata.className = 'metadata-container';
    const property = metadata.createDiv();
    property.className = 'metadata-property';
    const value = document.createTextNode('changed');
    property.append(value);
    expect(isPropertyFieldMutation(createMutation(property, [value]))).toBe(true);
    expect(isPropertyFieldMutation(createMutation(document.body, [metadata]))).toBe(true);
    expect(isPropertyFieldMutation(createMutation(document.body, [], [metadata]))).toBe(true);
    expect(getPropertyFieldMutationContainers(createMutation(property, [value]))).toEqual([metadata]);
    const leaf = document.body.createDiv();
    leaf.append(metadata);
    expect(getPropertyFieldMutationContainers(createMutation(document.body, [leaf]))).toEqual([]);
    metadata.remove();
    leaf.remove();
  });

  it('should redraw Source overlays for visible CodeMirror line changes but ignore Live Preview churn', () => {
    const sourceView = document.body.createDiv({ cls: 'markdown-source-view mod-cm6' });
    const sourceContent = sourceView.createDiv({ cls: 'cm-content' });
    const sourceLine = sourceContent.createDiv({ cls: 'cm-line' });
    const liveView = document.body.createDiv({ cls: 'markdown-source-view mod-cm6 is-live-preview' });
    const liveContent = liveView.createDiv({ cls: 'cm-content' });
    const liveLine = liveContent.createDiv({ cls: 'cm-line' });
    const overlay = sourceView.createSvg('svg');
    overlay.classList.add('np-property-source-overlay');

    expect(isSourceEditorMutation(createMutation(sourceContent, [sourceLine]))).toBe(true);
    expect(isSourceEditorMutation(createMutation(document.body, [liveView]))).toBe(true);
    expect(isSourceEditorMutation(createMutation(liveContent, [liveLine]))).toBe(false);
    expect(isSourceEditorMutation(createMutation(overlay, [overlay.createSvg('path')]))).toBe(false);
    sourceView.remove();
    liveView.remove();
  });

  it('should invalidate only actual Source and Live Preview mode transitions', () => {
    const sourceView = document.body.createDiv({ cls: 'markdown-source-view mod-cm6' });
    const modeChange = createAttributeMutation(sourceView, 'class', 'markdown-source-view mod-cm6 is-live-preview');
    expect(isSourceViewModeMutation(modeChange)).toBe(true);

    const oldValue = sourceView.className;
    sourceView.classList.add('np-property-source-overlay-host');
    expect(isSourceViewModeMutation(createAttributeMutation(sourceView, 'class', oldValue))).toBe(false);
    expect(isSourceViewModeMutation(createAttributeMutation(document.body, 'class', 'theme-dark'))).toBe(false);
    sourceView.remove();
  });

  it('should redraw only for plugin-owned body classes and style variables', () => {
    const target = document.body.createDiv();
    target.className = 'theme-dark workspace-tab-header-container';
    expect(isPropertyVisualStyleMutation(createAttributeMutation(target, 'class', 'theme-dark'))).toBe(false);
    target.classList.add('np-guide-line-dashed');
    expect(isPropertyVisualStyleMutation(createAttributeMutation(target, 'class', 'theme-dark workspace-tab-header-container'))).toBe(true);

    target.setCssProps({ color: 'red' });
    expect(isPropertyVisualStyleMutation(createAttributeMutation(target, 'style', ''))).toBe(false);
    const oldStyle = target.getAttribute('style') ?? '';
    target.setCssProps({ '--np-guide-connector-length': '22px' });
    expect(isPropertyVisualStyleMutation(createAttributeMutation(target, 'style', oldStyle))).toBe(true);
    target.remove();
  });
});
