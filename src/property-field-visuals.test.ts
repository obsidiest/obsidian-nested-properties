import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PropertyFieldNode } from './property-field-tree.ts';

import {
  applyRedoFallback,
  buildRoundedPath,
  createCssNumberReader,
  findElementAtClientY,
  flattenVisiblePropertyFieldForest,
  getBreadcrumbKeyboardTarget,
  getPropertyFieldMutationContainers,
  getShownMetadataContainers,
  getSourceKeyCharacterRange,
  getThreadDepthColorIndex,
  isContainerRenderCurrent,
  isPropertyFieldMutation,
  isPropertyVisualStyleMutation,
  isRedoShortcut,
  resolveBreadcrumbActivationScope,
  resolveDomBreadcrumbPropertyAtPointer,
  resolveDomPropertyAtPointer,
  resolveSourceBreadcrumbLineAtPointer,
  resolveSourceLine,
  resolveSourceLineElementAtPointer
} from './property-field-visuals.ts';

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

  it('should invoke the redo fallback only when Obsidian did not already handle the shortcut', () => {
    const redo = vi.fn();
    expect(applyRedoFallback({ getValue: () => 'unchanged', redo }, 'unchanged')).toBe(true);
    expect(redo).toHaveBeenCalledTimes(1);

    expect(applyRedoFallback({ getValue: () => 'native redo result', redo }, 'before redo')).toBe(false);
    expect(redo).toHaveBeenCalledTimes(1);
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
