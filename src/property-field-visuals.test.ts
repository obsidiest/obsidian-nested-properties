import {
  describe,
  expect,
  it
} from 'vitest';

import {
  buildRoundedPath,
  getBreadcrumbKeyboardTarget,
  getThreadDepthColorIndex
} from './property-field-visuals.ts';

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
