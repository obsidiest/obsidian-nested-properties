/* eslint-disable @typescript-eslint/array-type, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing, complexity, func-style, no-magic-numbers, no-restricted-syntax, perfectionist/sort-modules, perfectionist/sort-union-types, prefer-named-capture-group, unicorn/prefer-single-call, unicorn/prefer-spread -- YAML property trees require ordered stack mutations and compact parser result shapes; these local exceptions keep that algorithm legible. */

export interface PropertyFieldNode {
  children: PropertyFieldNode[];
  depth: number;
  element: HTMLElement;
  key: string;
  keyElement: HTMLElement;
  parent: null | PropertyFieldNode;
  valueElement: HTMLElement | null;
}

export interface SourcePropertyFieldNode {
  children: SourcePropertyFieldNode[];
  column: number;
  depth: number;
  key: string;
  line: number;
  parent: null | SourcePropertyFieldNode;
}

export function buildPropertyFieldForest(metadataContainer: HTMLElement): PropertyFieldNode[] {
  const elements = Array.from(metadataContainer.querySelectorAll<HTMLElement>('.metadata-property'));
  const nodeByElement = new Map<HTMLElement, PropertyFieldNode>();

  for (const element of elements) {
    const keyElement = element.querySelector<HTMLElement>(':scope > .metadata-property-key');
    if (keyElement === null) {
      continue;
    }
    const input = keyElement.querySelector<HTMLInputElement>('.metadata-property-key-input');
    const key = input?.value.trim() || keyElement.textContent?.trim() || 'Property';
    const valueElement = element.querySelector<HTMLElement>(':scope > .metadata-property-value');
    nodeByElement.set(element, {
      children: [],
      depth: 0,
      element,
      key,
      keyElement,
      parent: null,
      valueElement
    });
  }

  const roots: PropertyFieldNode[] = [];
  for (const node of nodeByElement.values()) {
    const parentElement = node.element.parentElement?.closest<HTMLElement>('.metadata-property') ?? null;
    const parent = parentElement === null ? null : nodeByElement.get(parentElement) ?? null;
    node.parent = parent;
    if (parent === null) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }

  const assignDepth = (nodes: PropertyFieldNode[], depth: number): void => {
    for (const node of nodes) {
      node.depth = depth;
      assignDepth(node.children, depth + 1);
    }
  };
  assignDepth(roots, 0);
  return roots;
}

export function flattenPropertyFieldForest<T extends { children: T[] }>(roots: T[]): T[] {
  const nodes: T[] = [];
  const visit = (items: T[]): void => {
    for (const item of items) {
      nodes.push(item);
      visit(item.children);
    }
  };
  visit(roots);
  return nodes;
}

export function getPropertyFieldAncestors<T extends { parent: null | T }>(node: T): T[] {
  const ancestors: T[] = [];
  let current: null | T = node;
  while (current !== null) {
    ancestors.unshift(current);
    current = current.parent;
  }
  return ancestors;
}

export function getPropertyFieldRoot<T extends { parent: null | T }>(node: T): T {
  let root = node;
  while (root.parent !== null) {
    root = root.parent;
  }
  return root;
}

export function parseSourcePropertyFields(source: string): SourcePropertyFieldNode[] {
  const lines = source.split(/\r?\n/u);
  const startIndex = lines.findIndex((line, index) => index < 2 && line.replace(/^\u{FEFF}/u, '').trim() === '---');
  if (startIndex === -1) {
    return [];
  }

  const roots: SourcePropertyFieldNode[] = [];
  const stack: Array<{ indent: number; node: SourcePropertyFieldNode }> = [];
  const sequenceCounters = new Map<null | SourcePropertyFieldNode, number>();
  let blockScalarIndent: null | number = null;

  for (const [lineIndex, rawLine] of lines.entries()) {
    if (lineIndex <= startIndex) {
      continue;
    }
    if (rawLine.trim() === '---' || rawLine.trim() === '...') {
      break;
    }
    if (blockScalarIndent !== null) {
      if (rawLine.trim() === '' || countIndent(rawLine) > blockScalarIndent) {
        continue;
      }
      blockScalarIndent = null;
    }
    if (rawLine.trim() === '' || rawLine.trimStart().startsWith('#')) {
      continue;
    }

    const indent = countIndent(rawLine);
    const content = rawLine.trimStart();
    while (stack.length > 0 && indent <= stack.at(-1)!.indent) {
      stack.pop();
    }
    const parent = stack.at(-1)?.node ?? null;

    const sequenceMatch = /^-\s*(.*)$/u.exec(content);
    if (sequenceMatch !== null) {
      const index = sequenceCounters.get(parent) ?? 0;
      sequenceCounters.set(parent, index + 1);
      const sequenceNode = createSourceNode(String(index), lineIndex, indent, parent);
      addSourceNode(sequenceNode, roots);

      const remainder = sequenceMatch[1]!;
      const mapping = parseMapping(remainder);
      if (mapping !== null) {
        const mappingColumn = indent + content.indexOf(remainder) + mapping.column;
        const child = createSourceNode(mapping.key, lineIndex, mappingColumn, sequenceNode);
        sequenceNode.children.push(child);
        if (mapping.isBlockScalar) {
          blockScalarIndent = indent;
        } else if (mapping.hasNestedValue) {
          stack.push({ indent, node: sequenceNode });
          stack.push({ indent: mappingColumn, node: child });
        } else {
          stack.push({ indent, node: sequenceNode });
        }
      } else if (remainder === '') {
        stack.push({ indent, node: sequenceNode });
      } else if (isBlockScalarValue(remainder)) {
        blockScalarIndent = indent;
      }
      continue;
    }

    const mapping = parseMapping(content);
    if (mapping === null) {
      continue;
    }
    const node = createSourceNode(mapping.key, lineIndex, indent + mapping.column, parent);
    addSourceNode(node, roots);
    if (mapping.isBlockScalar) {
      blockScalarIndent = indent;
    } else if (mapping.hasNestedValue) {
      stack.push({ indent, node });
    }
  }

  assignSourceDepth(roots, 0);
  return roots;
}

export function findSourcePropertyNodeAtLine(roots: SourcePropertyFieldNode[], line: number): SourcePropertyFieldNode | null {
  const exact = flattenPropertyFieldForest(roots).filter((node) => node.line === line);
  return exact.at(-1) ?? null;
}

function addSourceNode(node: SourcePropertyFieldNode, roots: SourcePropertyFieldNode[]): void {
  if (node.parent === null) {
    roots.push(node);
  } else {
    node.parent.children.push(node);
  }
}

function assignSourceDepth(nodes: SourcePropertyFieldNode[], depth: number): void {
  for (const node of nodes) {
    node.depth = depth;
    assignSourceDepth(node.children, depth + 1);
  }
}

function countIndent(line: string): number {
  let count = 0;
  for (const character of line) {
    if (character === ' ') {
      count += 1;
    } else if (character === '\t') {
      count += 2;
    } else {
      break;
    }
  }
  return count;
}

function createSourceNode(key: string, line: number, column: number, parent: null | SourcePropertyFieldNode): SourcePropertyFieldNode {
  return {
    children: [],
    column,
    depth: 0,
    key,
    line,
    parent
  };
}

function isBlockScalarValue(value: string): boolean {
  return /^[|>]/u.test(value.trim());
}

function parseMapping(content: string): null | { column: number; hasNestedValue: boolean; isBlockScalar: boolean; key: string } {
  let quote: '"' | '\'' | null = null;
  let bracketDepth = 0;
  for (let index = 0; index < content.length; index++) {
    const character = content[index];
    if (quote !== null) {
      if (character === quote && (quote === '\'' || content[index - 1] !== '\\')) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === '\'') {
      quote = character;
      continue;
    }
    if (character === '[' || character === '{') {
      bracketDepth += 1;
      continue;
    }
    if (character === ']' || character === '}') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (character !== ':' || bracketDepth !== 0) {
      continue;
    }
    const rawKey = content.slice(0, index).trim();
    if (rawKey === '') {
      return null;
    }
    const keyColumn = content.indexOf(rawKey);
    const rawValue = content.slice(index + 1).trim();
    return {
      column: keyColumn,
      hasNestedValue: rawValue === '',
      isBlockScalar: isBlockScalarValue(rawValue),
      key: unquote(rawKey)
    };
  }
  return null;
}

function unquote(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))) {
    return value.slice(1, -1);
  }
  return value;
}

/* eslint-enable @typescript-eslint/array-type, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing, complexity, func-style, no-magic-numbers, no-restricted-syntax, perfectionist/sort-modules, perfectionist/sort-union-types, prefer-named-capture-group, unicorn/prefer-single-call, unicorn/prefer-spread -- Restore repository parser rules. */
