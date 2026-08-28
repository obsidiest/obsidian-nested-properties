import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PropertyFieldNode } from './property-field-tree.ts';

import {
  buildRoundedPath,
  createCssNumberReader,
  flattenVisiblePropertyFieldForest,
  getBreadcrumbKeyboardTarget,
  getPropertyFieldMutationContainers,
  getShownMetadataContainers,
  getThreadDepthColorIndex,
  isContainerRenderCurrent,
  isPropertyFieldMutation,
  isPropertyVisualStyleMutation
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
