/* v8 ignore file -- Runs against the separately installed Style Settings plugin's live settings DOM. */
/* eslint-disable @typescript-eslint/method-signature-style, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unnecessary-condition, func-style, no-magic-numbers, no-restricted-syntax, perfectionist/sort-classes, perfectionist/sort-maps, perfectionist/sort-modules, prefer-named-capture-group, unicorn/consistent-boolean-name, unicorn/dom-node-dataset, unicorn/no-incorrect-query-selector, unicorn/prefer-modern-dom-apis, unicorn/prefer-spread -- Style Settings supplies an external, mutation-driven DOM whose controls must be enhanced in place while preserving its native events. */
const MARKER_SELECTOR = '[data-id^="np-"], [data-id^="nested-properties@@np-"], [data-id*="@@np-"]';
const SECTION_SELECTOR = '.style-settings-heading[data-id="nested-properties"], .style-settings-heading[data-id$="@@nested-properties"]';
const NUMBER_INPUT_CLASS = 'np-style-settings-number-input';
const COLOR_INPUT_CLASS = 'np-style-settings-color-input';
const COLOR_DEFAULTS = new Map<string, string>([
  ['np-thread-fallback-color-light', '#777777'],
  ['np-thread-fallback-color-dark', '#888888'],
  ['np-thread-override-color-light', '#777777'],
  ['np-thread-override-color-dark', '#888888']
]);

type QueryableNode = ParentNode & { matches?: (selector: string) => boolean };

export class StyleSettingsPrecisionControls {
  private readonly observers = new Map<Document, MutationObserver>();

  public start(documents?: Iterable<Document>): void {
    for (const ownerDocument of documents ?? (typeof document === 'undefined' ? [] : [document])) {
      this.observeDocument(ownerDocument);
    }
  }

  public observeDocument(ownerDocument: Document | null | undefined): void {
    if (ownerDocument?.body === null || ownerDocument?.body === undefined || this.observers.has(ownerDocument)) {
      return;
    }
    enhanceStyleSettingsControls(ownerDocument);
    const Observer = ownerDocument.defaultView?.MutationObserver;
    if (Observer === undefined) {
      return;
    }
    const observer = new Observer((mutations) => {
      if (mutations.some((mutation) => mutation.type === 'childList' || mutation.attributeName === 'data-id')) {
        enhanceStyleSettingsControls(ownerDocument);
      }
    });
    observer.observe(ownerDocument.body, { attributeFilter: ['data-id'], attributes: true, childList: true, subtree: true });
    this.observers.set(ownerDocument, observer);
  }

  public stop(): void {
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();
  }
}

export function enhanceStyleSettingsNumberControls(root: ParentNode): number {
  let enhanced = 0;
  for (const row of findRows(root, 'input[type="range"]')) {
    const control = row.querySelector<HTMLElement>('.setting-item-control');
    const slider = row.querySelector<HTMLInputElement>('input[type="range"]');
    if (control === null || slider === null || control.querySelector(`.${NUMBER_INPUT_CLASS}`) !== null) {
      continue;
    }
    const numberInput = slider.ownerDocument.win.createEl('input');
    numberInput.type = 'text';
    numberInput.inputMode = 'decimal';
    numberInput.className = NUMBER_INPUT_CLASS;
    numberInput.value = slider.value;
    numberInput.min = slider.min;
    numberInput.max = slider.max;
    numberInput.step = 'any';
    const settingName = row.querySelector('.setting-item-name')?.textContent?.trim();
    numberInput.setAttribute('aria-label', settingName === undefined || settingName === '' ? 'Precise slider value' : `${settingName} precise value`);
    numberInput.title = 'Enter a precise value';
    let syncingFromNumberInput = false;

    const syncFromSlider = (): void => {
      if (!syncingFromNumberInput) {
        numberInput.value = slider.value;
      }
    };
    const syncToSlider = (eventType: 'change' | 'input'): boolean => {
      const value = parseCompleteInRangeNumber(numberInput.value, slider.min, slider.max);
      if (value === null) {
        return false;
      }
      const originalStep = slider.step;
      syncingFromNumberInput = true;
      try {
        slider.step = 'any';
        const changed = slider.value !== value;
        slider.value = value;
        const EventConstructor = slider.ownerDocument.defaultView?.Event ?? Event;
        if (eventType === 'change' && changed) {
          slider.dispatchEvent(new EventConstructor('input', { bubbles: true }));
        }
        slider.dispatchEvent(new EventConstructor(eventType, { bubbles: true }));
      } finally {
        slider.step = originalStep;
        syncingFromNumberInput = false;
      }
      return true;
    };

    slider.addEventListener('input', syncFromSlider);
    slider.addEventListener('change', syncFromSlider);
    numberInput.addEventListener('input', () => syncToSlider('input'));
    numberInput.addEventListener('change', () => {
      if (!syncToSlider('change')) {
        syncFromSlider();
      }
    });
    numberInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      if (syncToSlider('change')) {
        numberInput.blur();
      } else {
        syncFromSlider();
      }
    });
    const resetButton = control.querySelector<HTMLElement>('.clickable-icon');
    resetButton?.addEventListener('click', () => {
      (slider.ownerDocument.defaultView?.setTimeout ?? setTimeout)(syncFromSlider, 0);
    });
    control.insertBefore(numberInput, resetButton);
    enhanced += 1;
  }
  return enhanced;
}

export function enhanceStyleSettingsColorControls(root: ParentNode): number {
  let enhanced = 0;
  for (const row of findRows(root, 'input[type="text"]')) {
    const id = readSettingId(row);
    const fallback = id === null ? undefined : COLOR_DEFAULTS.get(id);
    const control = row.querySelector<HTMLElement>('.setting-item-control');
    const textInput = control?.querySelector<HTMLInputElement>(`input[type="text"]:not(.${NUMBER_INPUT_CLASS})`);
    if (fallback === undefined || control === undefined || control === null || textInput === undefined || textInput === null || control.querySelector(`.${COLOR_INPUT_CLASS}`) !== null) {
      continue;
    }
    const colorInput = textInput.ownerDocument.win.createEl('input');
    colorInput.type = 'color';
    colorInput.className = COLOR_INPUT_CLASS;
    colorInput.value = normalizeHexColor(textInput.value) ?? fallback;
    const settingName = row.querySelector('.setting-item-name')?.textContent?.trim();
    colorInput.setAttribute('aria-label', settingName === undefined || settingName === '' ? 'Choose color' : `${settingName} picker`);
    colorInput.title = 'Choose color';
    const EventConstructor = textInput.ownerDocument.defaultView?.Event ?? Event;
    const commitColor = (commit: boolean): void => {
      textInput.value = colorInput.value.toLowerCase();
      textInput.dispatchEvent(new EventConstructor('input', { bubbles: true }));
      if (commit) {
        textInput.dispatchEvent(new EventConstructor('change', { bubbles: true }));
      }
    };
    const syncFromText = (): void => {
      const normalized = normalizeHexColor(textInput.value);
      if (normalized !== null) {
        colorInput.value = normalized;
      }
    };
    colorInput.addEventListener('input', () => commitColor(false));
    colorInput.addEventListener('change', () => commitColor(true));
    textInput.addEventListener('input', syncFromText);
    textInput.addEventListener('change', syncFromText);
    const resetButton = control.querySelector<HTMLElement>('.clickable-icon');
    resetButton?.addEventListener('click', () => {
      (textInput.ownerDocument.defaultView?.setTimeout ?? setTimeout)(syncFromText, 0);
    });
    control.insertBefore(colorInput, textInput);
    enhanced += 1;
  }
  return enhanced;
}

export function normalizeHexColor(value: string): null | string {
  const normalized = value.trim().toLowerCase();
  const shortMatch = /^#([\da-f])([\da-f])([\da-f])$/u.exec(normalized);
  if (shortMatch !== null) {
    const red = shortMatch[1] ?? '';
    const green = shortMatch[2] ?? '';
    const blue = shortMatch[3] ?? '';
    return `#${red}${red}${green}${green}${blue}${blue}`;
  }
  return /^#[\da-f]{6}$/u.test(normalized) ? normalized : null;
}

export function parseCompleteInRangeNumber(value: string, minimumValue: string, maximumValue: string): null | string {
  const rawValue = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(rawValue)) {
    return null;
  }
  const numericValue = Number(rawValue);
  const minimum = parseFiniteNumber(minimumValue);
  const maximum = parseFiniteNumber(maximumValue);
  if (!Number.isFinite(numericValue) || (minimum !== null && numericValue < minimum) || (maximum !== null && numericValue > maximum)) {
    return null;
  }
  return rawValue;
}

function enhanceStyleSettingsControls(root: ParentNode): void {
  enhanceStyleSettingsNumberControls(root);
  enhanceStyleSettingsColorControls(root);
}

function findRows(root: ParentNode, controlSelector: string): Element[] {
  const rows = new Set<Element>();
  const candidate = root as QueryableNode;
  const addMarker = (marker: Element): void => {
    const row = marker.matches('.setting-item') ? marker : marker.closest('.setting-item');
    if (row?.querySelector(controlSelector) !== null && row?.querySelector(controlSelector) !== undefined) {
      rows.add(row);
    }
  };
  if (candidate.matches?.(MARKER_SELECTOR) === true) {
    addMarker(candidate as unknown as Element);
  }
  for (const marker of root.querySelectorAll(MARKER_SELECTOR)) {
    addMarker(marker);
  }
  const sections = Array.from(root.querySelectorAll(SECTION_SELECTOR));
  if (candidate.matches?.(SECTION_SELECTOR) === true) {
    sections.push(candidate as unknown as Element);
  }
  for (const section of sections) {
    const container = section.nextElementSibling;
    if (container?.matches('.style-settings-container') === true) {
      for (const row of container.querySelectorAll('.setting-item')) {
        if (row.querySelector(controlSelector) !== null) {
          rows.add(row);
        }
      }
    }
  }
  return [...rows];
}

function parseFiniteNumber(value: string): null | number {
  if (value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSettingId(row: Element): null | string {
  const marker = row.matches(MARKER_SELECTOR) ? row : row.querySelector(MARKER_SELECTOR);
  const id = marker?.getAttribute('data-id');
  if (id === null || id === undefined) {
    return null;
  }
  const namespaceSeparatorIndex = id.lastIndexOf('@@');
  return namespaceSeparatorIndex === -1 ? id : id.slice(namespaceSeparatorIndex + 2);
}

/* eslint-enable @typescript-eslint/method-signature-style, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unnecessary-condition, func-style, no-magic-numbers, no-restricted-syntax, perfectionist/sort-classes, perfectionist/sort-maps, perfectionist/sort-modules, prefer-named-capture-group, unicorn/consistent-boolean-name, unicorn/dom-node-dataset, unicorn/no-incorrect-query-selector, unicorn/prefer-modern-dom-apis, unicorn/prefer-spread -- Restore repository DOM rules. */
