export const PROPERTY_FIELD_LAYOUT_CHANGE_EVENT = 'nested-properties-advanced:property-field-layout-change';

export function dispatchPropertyFieldLayoutChange(target: HTMLElement): void {
  const ownerDocument = (target as Partial<HTMLElement>).ownerDocument;
  const EventConstructor = ownerDocument?.defaultView?.Event;
  if (EventConstructor !== undefined) {
    target.dispatchEvent(new EventConstructor(PROPERTY_FIELD_LAYOUT_CHANGE_EVENT, { bubbles: true }));
  }
}
