import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  enhanceStyleSettingsColorControls,
  enhanceStyleSettingsNumberControls,
  normalizeHexColor,
  parseCompleteInRangeNumber
} from './style-settings-precision.ts';

function createStyleSettingRow(id: string, control: HTMLInputElement): HTMLElement {
  const row = document.body.createDiv();
  row.className = 'setting-item';
  row.dataset['id'] = id;
  const name = row.createDiv();
  name.className = 'setting-item-name';
  name.textContent = 'Test value';
  const controls = row.createDiv();
  controls.className = 'setting-item-control';
  controls.append(control);
  row.append(name, controls);
  return row;
}

describe('parseCompleteInRangeNumber', () => {
  it('should preserve valid precise and exponent values', () => {
    expect(parseCompleteInRangeNumber(' 1.2345 ', '0', '2')).toBe('1.2345');
    expect(parseCompleteInRangeNumber('1e-3', '0', '2')).toBe('1e-3');
    expect(parseCompleteInRangeNumber('-.25', '-1', '1')).toBe('-.25');
  });

  it('should reject incomplete, non-finite, and out-of-range values', () => {
    expect(parseCompleteInRangeNumber('', '0', '2')).toBeNull();
    expect(parseCompleteInRangeNumber('1.', '0', '2')).toBeNull();
    expect(parseCompleteInRangeNumber('Infinity', '0', '2')).toBeNull();
    expect(parseCompleteInRangeNumber('3', '0', '2')).toBeNull();
  });
});

describe('normalizeHexColor', () => {
  it('should normalize short and full hexadecimal colors', () => {
    expect(normalizeHexColor(' #AbC ')).toBe('#aabbcc');
    expect(normalizeHexColor('#12A4ef')).toBe('#12a4ef');
  });

  it('should reject unsupported color syntax', () => {
    expect(normalizeHexColor('red')).toBeNull();
    expect(normalizeHexColor('#abcd')).toBeNull();
  });
});

describe('Style Settings precision controls', () => {
  it('should synchronize an exact numeric entry with its slider', () => {
    const slider = document.body.createEl('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '10';
    slider.step = '1';
    slider.value = '3';
    const row = createStyleSettingRow('np-thread-thickness', slider);
    document.body.append(row);
    const inputListener = vi.fn();
    const changeListener = vi.fn();
    slider.addEventListener('input', inputListener);
    slider.addEventListener('change', changeListener);

    expect(enhanceStyleSettingsNumberControls(document)).toBe(1);
    const precise = row.querySelector<HTMLInputElement>('.np-style-settings-number-input');
    if (precise === null) {
      throw new Error('Expected a synchronized precise number input');
    }
    precise.value = '3.14159';
    precise.dispatchEvent(new Event('change', { bubbles: true }));

    expect(slider.value).toBe('3.14159');
    expect(slider.step).toBe('1');
    expect(inputListener).toHaveBeenCalledTimes(1);
    expect(changeListener).toHaveBeenCalledTimes(1);
    expect(enhanceStyleSettingsNumberControls(document)).toBe(0);
    row.remove();
  });

  it('should add and synchronize a native color picker for themed fallbacks', () => {
    const textInput = document.body.createEl('input');
    textInput.type = 'text';
    textInput.value = '#abc';
    const row = createStyleSettingRow('np-thread-fallback-color-light', textInput);
    document.body.append(row);
    const changeListener = vi.fn();
    textInput.addEventListener('change', changeListener);

    expect(enhanceStyleSettingsColorControls(document)).toBe(1);
    const picker = row.querySelector<HTMLInputElement>('.np-style-settings-color-input');
    if (picker === null) {
      throw new Error('Expected a synchronized color picker');
    }
    expect(picker.value).toBe('#aabbcc');
    picker.value = '#123456';
    picker.dispatchEvent(new Event('change', { bubbles: true }));

    expect(textInput.value).toBe('#123456');
    expect(changeListener).toHaveBeenCalledTimes(1);
    row.remove();
  });
});
