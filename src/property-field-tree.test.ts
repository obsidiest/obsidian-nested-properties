import {
  describe,
  expect,
  it
} from 'vitest';

import {
  buildPropertyFieldForest,
  findSourcePropertyNodeAtLine,
  flattenPropertyFieldForest,
  getPropertyFieldAncestors,
  getPropertyFieldRoot,
  parseSourcePropertyFields
} from './property-field-tree.ts';

function createProperty(key: string): HTMLElement {
  const property = document.body.createDiv();
  property.className = 'metadata-property';
  const keyElement = property.createDiv();
  keyElement.className = 'metadata-property-key';
  const keyInput = keyElement.createEl('input');
  keyInput.className = 'metadata-property-key-input';
  keyInput.value = key;
  keyElement.append(keyInput);
  const valueElement = property.createDiv();
  valueElement.className = 'metadata-property-value';
  property.append(keyElement, valueElement);
  return property;
}

describe('property field DOM tree', () => {
  it('should preserve parents, depth, and document order', () => {
    const container = document.body.createDiv();
    container.className = 'metadata-container';
    const root = createProperty('root');
    const childContainer = document.body.createDiv();
    const child = createProperty('child');
    const grandchild = createProperty('grandchild');
    const grandchildContainer = document.body.createDiv();

    grandchildContainer.append(grandchild);
    child.append(grandchildContainer);
    childContainer.append(child);
    root.append(childContainer);
    container.append(root, createProperty('sibling'));

    const roots = buildPropertyFieldForest(container);
    const nodes = flattenPropertyFieldForest(roots);
    const grandchildNode = nodes[2];
    if (grandchildNode === undefined) {
      throw new Error('Expected the grandchild property node');
    }

    expect(roots.map((node) => node.key)).toEqual(['root', 'sibling']);
    expect(nodes.map((node) => [node.key, node.depth])).toEqual([
      ['root', 0],
      ['child', 1],
      ['grandchild', 2],
      ['sibling', 0]
    ]);
    expect(getPropertyFieldAncestors(grandchildNode)).toEqual(nodes.slice(0, 3));
    expect(getPropertyFieldRoot(grandchildNode)).toBe(nodes[0]);
  });

  it('should skip invalid rows and use text and fallback labels', () => {
    const container = document.body.createDiv();
    container.className = 'metadata-container';
    const missingKey = document.body.createDiv();
    missingKey.className = 'metadata-property';
    const textProperty = document.body.createDiv();
    textProperty.className = 'metadata-property';
    const textKey = textProperty.createDiv();
    textKey.className = 'metadata-property-key';
    textKey.textContent = 'Text key';
    textProperty.append(textKey);
    const blankProperty = document.body.createDiv();
    blankProperty.className = 'metadata-property';
    const blankKey = blankProperty.createDiv();
    blankKey.className = 'metadata-property-key';
    blankProperty.append(blankKey);
    container.append(missingKey, textProperty, blankProperty);

    expect(buildPropertyFieldForest(container).map((node) => node.key)).toEqual(['Text key', 'Property']);
  });

  it('should treat a child of an invalid property wrapper as a root', () => {
    const container = document.body.createDiv();
    container.className = 'metadata-container';
    const invalidParent = document.body.createDiv();
    invalidParent.className = 'metadata-property';
    invalidParent.append(createProperty('child'));
    container.append(invalidParent);

    const roots = buildPropertyFieldForest(container);
    expect(roots.map((node) => node.key)).toEqual(['child']);
    expect(roots[0]?.parent).toBeNull();
  });
});

describe('source property field tree', () => {
  it('should parse nested mappings only from frontmatter', () => {
    const roots = parseSourcePropertyFields(`---
root:
  child:
    leaf: value
sibling: true
---
body: is not frontmatter`);
    const nodes = flattenPropertyFieldForest(roots);
    const leafNode = nodes[2];
    if (leafNode === undefined) {
      throw new Error('Expected the nested source property node');
    }

    expect(nodes.map((node) => [node.key, node.depth, node.line, node.column])).toEqual([
      ['root', 0, 1, 0],
      ['child', 1, 2, 2],
      ['leaf', 2, 3, 4],
      ['sibling', 0, 4, 0]
    ]);
    expect(getPropertyFieldAncestors(leafNode).map((node) => node.key)).toEqual(['root', 'child', 'leaf']);
  });

  it('should parse sequence items and mappings inside sequence items', () => {
    const roots = parseSourcePropertyFields(`---
people:
  - name: Ada
    role: engineer
  -
    name: Grace
---`);
    const nodes = flattenPropertyFieldForest(roots);

    expect(nodes.map((node) => [node.key, node.depth])).toEqual([
      ['people', 0],
      ['0', 1],
      ['name', 2],
      ['role', 2],
      ['1', 1],
      ['name', 2]
    ]);
  });

  it('should handle a BOM, quoted keys, and colons inside flow values', () => {
    const roots = parseSourcePropertyFields('\u{FEFF}---\n"quoted:key": { nested: true }\nflow: ["a:b"]\n---');

    expect(roots.map((node) => node.key)).toEqual(['quoted:key', 'flow']);
    expect(roots.every((node) => node.children.length === 0)).toBe(true);
  });

  it('should find the deepest property represented on a source line', () => {
    const roots = parseSourcePropertyFields('---\npeople:\n  - name: Ada\n---');

    expect(findSourcePropertyNodeAtLine(roots, 2)?.key).toBe('name');
    expect(findSourcePropertyNodeAtLine(roots, 99)).toBeNull();
  });

  it('should return an empty forest without frontmatter', () => {
    expect(parseSourcePropertyFields('root:\n  child: value')).toEqual([]);
  });

  it('should skip comments, blank lines, malformed mappings, and block scalar contents', () => {
    const roots = parseSourcePropertyFields(`---
# comment

description: |-
  text: is not a property
after: value
not a mapping
: missing-key
...`);

    expect(roots.map((node) => node.key)).toEqual(['description', 'after']);
  });

  it('should parse nested and empty sequence containers while ignoring scalar item contents', () => {
    const roots = parseSourcePropertyFields(`---
items:
  - nested:
      leaf: value
  -
    child: value
  - scalar
  - >
    fake: property
after: value
---`);
    const nodes = flattenPropertyFieldForest(roots);

    expect(nodes.map((node) => [node.key, node.depth])).toEqual([
      ['items', 0],
      ['0', 1],
      ['nested', 2],
      ['leaf', 3],
      ['1', 1],
      ['child', 2],
      ['2', 1],
      ['3', 1],
      ['after', 0]
    ]);
  });

  it('should support tabs, single-quoted keys, and bracketed key fragments', () => {
    const roots = parseSourcePropertyFields('---\n\t\'tabbed\': value\nflow[key:part]: value\nflow{key:part}: value\n---');

    expect(roots.map((node) => [node.key, node.column])).toEqual([
      ['tabbed', 2],
      ['flow[key:part]', 0],
      ['flow{key:part}', 0]
    ]);
  });

  it('should skip block scalar contents attached to a sequence mapping', () => {
    const roots = parseSourcePropertyFields(`---
items:
  - description: >-
      fake: property
after: value
---`);

    expect(flattenPropertyFieldForest(roots).map((node) => node.key)).toEqual(['items', '0', 'description', 'after']);
  });
});
