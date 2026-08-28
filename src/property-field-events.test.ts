import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  dispatchPropertyFieldLayoutChange,
  PROPERTY_FIELD_LAYOUT_CHANGE_EVENT
} from './property-field-events.ts';

describe('property field layout changes', () => {
  it('should dispatch one bubbling layout-change event', () => {
    const container = document.body.createDiv();
    const property = container.createDiv();
    const listener = vi.fn();
    container.addEventListener(PROPERTY_FIELD_LAYOUT_CHANGE_EVENT, listener);

    dispatchPropertyFieldLayoutChange(property);

    expect(listener).toHaveBeenCalledTimes(1);
    container.remove();
  });

  it('should tolerate renderer test doubles without an owner document', () => {
    expect(() => {
      dispatchPropertyFieldLayoutChange(castTo<HTMLElement>({}));
    }).not.toThrow();
  });
});
