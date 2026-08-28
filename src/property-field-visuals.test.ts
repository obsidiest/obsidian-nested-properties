import {
  describe,
  expect,
  it
} from 'vitest';

import {
  buildRoundedPath,
  getBreadcrumbKeyboardTarget,
  getThreadDepthColorIndex,
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
    metadata.remove();
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
