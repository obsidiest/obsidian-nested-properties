/* v8 ignore file -- Integration behavior depends on Obsidian's live metadata-editor and CodeMirror DOM. */
/* eslint-disable @typescript-eslint/array-type, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/restrict-template-expressions, complexity, import-x/consistent-type-specifier-style, no-magic-numbers, no-restricted-syntax, obsidian-dev-utils/params-options-name-match, obsidian-dev-utils/readonly-params-options-result-members, perfectionist/sort-classes, perfectionist/sort-modules, perfectionist/sort-union-types, unicorn/consistent-boolean-name, unicorn/no-array-callback-reference, unicorn/no-nested-ternary, unicorn/no-unnecessary-nested-ternary, unicorn/prefer-add-event-listener-options, unicorn/prefer-spread -- The component mirrors and traverses Obsidian's cross-window DOM; local callback and ordering rules would obscure the event-flow implementation. */
import type { App } from 'obsidian';

import {
  Component,
  MarkdownView
} from 'obsidian';
import { getAllDomWindows } from 'obsidian-dev-utils/obsidian/workspace';

import { PluginSettingsComponent } from './plugin-settings-component.ts';
import {
  buildPropertyFieldForest,
  findSourcePropertyNodeAtLine,
  flattenPropertyFieldForest,
  getPropertyFieldAncestors,
  getPropertyFieldRoot,
  parseSourcePropertyFields,
  type PropertyFieldNode,
  type SourcePropertyFieldNode
} from './property-field-tree.ts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const POPOVER_HIDE_DELAY_IN_MILLISECONDS = 120;

type ViewMode = 'live-preview' | 'reading' | 'source';

interface ActiveDomField {
  container: HTMLElement;
  element: HTMLElement;
  kind: 'dom';
}

interface ActiveSourceField {
  kind: 'source';
  line: number;
  roots: SourcePropertyFieldNode[];
  view: MarkdownView;
}

type ActiveField = ActiveDomField | ActiveSourceField;

interface BreadcrumbEntry<T> {
  current: boolean;
  node: T;
  parentIndex: number;
}

interface DocumentState {
  active: ActiveField | null;
  bodyStyleObserver: MutationObserver | null;
  cleanups: Array<() => void>;
  hideTimer: number | null;
  mutationObserver: MutationObserver | null;
  popover: HTMLElement | null;
  renderFrame: number | null;
  sourceHighlight: HTMLElement | null;
}

interface PropertyFieldVisualsComponentParams {
  app: App;
  pluginSettingsComponent: PluginSettingsComponent;
}

interface Point {
  x: number;
  y: number;
}

export class PropertyFieldVisualsComponent extends Component {
  private readonly app: App;
  private readonly documentStates = new Map<Document, DocumentState>();
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: PropertyFieldVisualsComponentParams) {
    super();
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public override onload(): void {
    super.onload();
    this.observeAllDocuments();
    this.registerEvent(this.app.workspace.on('layout-change', () => {
      this.observeAllDocuments();
      this.refresh();
    }));
    this.registerEvent(this.app.workspace.on('css-change', () => this.refresh()));
    this.registerEvent(this.app.workspace.on('window-open', (_workspaceWindow, openedWindow) => {
      this.observeDocument(openedWindow.document);
      this.scheduleRender(openedWindow.document);
    }));
    this.app.workspace.onLayoutReady(() => {
      this.observeAllDocuments();
      this.refresh();
    });
  }

  public override onunload(): void {
    for (const [ownerDocument, state] of this.documentStates) {
      state.mutationObserver?.disconnect();
      state.bodyStyleObserver?.disconnect();
      for (const cleanup of state.cleanups) {
        cleanup();
      }
      if (state.renderFrame !== null) {
        ownerDocument.defaultView?.cancelAnimationFrame(state.renderFrame);
      }
      state.popover?.remove();
      state.sourceHighlight?.classList.remove('np-property-field-source-highlight');
      removeVisualArtifacts(ownerDocument);
    }
    this.documentStates.clear();
    super.onunload();
  }

  public refresh(): void {
    this.observeAllDocuments();
    for (const [ownerDocument, state] of this.documentStates) {
      if (!this.isMainThreadingEnabled()) {
        state.active = null;
        state.sourceHighlight?.classList.remove('np-property-field-source-highlight');
        state.sourceHighlight = null;
      }
      state.popover?.remove();
      state.popover = null;
      this.applyBodyClasses(ownerDocument);
      this.scheduleRender(ownerDocument);
    }
  }

  private applyBodyClasses(ownerDocument: Document): void {
    const settings = this.pluginSettingsComponent.settings;
    ownerDocument.body.classList.toggle('np-main-static-guides-enabled', settings.isNestedPropertiesMainUiStaticTreeIndentationGuidesEnabled);
    ownerDocument.body.classList.toggle('np-property-threading-enabled', settings.isPropertyFieldThreadingEnabled);
  }

  private observeAllDocuments(): void {
    for (const win of getAllDomWindows(this.app)) {
      this.observeDocument(win.document);
    }
  }

  private observeDocument(ownerDocument: Document): void {
    if (this.documentStates.has(ownerDocument) || ownerDocument.body === null) {
      return;
    }
    const state: DocumentState = {
      active: null,
      bodyStyleObserver: null,
      cleanups: [],
      hideTimer: null,
      mutationObserver: null,
      popover: null,
      renderFrame: null,
      sourceHighlight: null
    };
    this.documentStates.set(ownerDocument, state);
    this.applyBodyClasses(ownerDocument);

    this.listen(ownerDocument, state, 'pointerover', (event) => this.onPointerOver(ownerDocument, event));
    this.listen(ownerDocument, state, 'pointerout', (event) => this.onPointerOut(ownerDocument, event));
    this.listen(ownerDocument, state, 'focusin', (event) => this.onFocusIn(ownerDocument, event));
    this.listen(ownerDocument, state, 'focusout', (event) => this.onFocusOut(ownerDocument, event));
    this.listen(ownerDocument, state, 'input', () => this.scheduleRender(ownerDocument));
    this.listen(ownerDocument, state, 'change', () => this.scheduleRender(ownerDocument));
    this.listen(ownerDocument, state, 'keyup', () => this.onEditorCursorChanged(ownerDocument));
    this.listen(ownerDocument, state, 'mouseup', () => this.onEditorCursorChanged(ownerDocument));
    const win = ownerDocument.defaultView;
    if (win !== null) {
      const schedule = (): void => this.scheduleRender(ownerDocument);
      win.addEventListener('resize', schedule);
      ownerDocument.addEventListener('scroll', schedule, true);
      state.cleanups.push(() => {
        win.removeEventListener('resize', schedule);
        ownerDocument.removeEventListener('scroll', schedule, true);
      });
    }

    const Observer = ownerDocument.defaultView?.MutationObserver;
    if (Observer !== undefined) {
      state.mutationObserver = new Observer((mutations) => {
        if (mutations.some(isRelevantMutation)) {
          this.scheduleRender(ownerDocument);
        }
      });
      state.mutationObserver.observe(ownerDocument.body, { childList: true, subtree: true });
      state.bodyStyleObserver = new Observer(() => this.scheduleRender(ownerDocument));
      state.bodyStyleObserver.observe(ownerDocument.body, { attributeFilter: ['class', 'style'], attributes: true });
      state.bodyStyleObserver.observe(ownerDocument.documentElement, { attributeFilter: ['class', 'style'], attributes: true });
    }
    this.scheduleRender(ownerDocument);
  }

  private listen<K extends keyof DocumentEventMap>(ownerDocument: Document, state: DocumentState, type: K, listener: (event: DocumentEventMap[K]) => void): void {
    ownerDocument.addEventListener(type, listener);
    state.cleanups.push(() => ownerDocument.removeEventListener(type, listener));
  }

  private onPointerOver(ownerDocument: Document, event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof ownerDocument.defaultView!.Element)) {
      return;
    }
    const state = this.documentStates.get(ownerDocument);
    if (state === undefined) {
      return;
    }
    if (target.closest('.np-property-breadcrumb-popover') !== null) {
      this.cancelPopoverHide(ownerDocument);
      return;
    }

    const fieldTarget = target.closest<HTMLElement>('.metadata-property-key, .metadata-property-value');
    const propertyElement = fieldTarget?.closest<HTMLElement>('.metadata-property') ?? null;
    const metadataContainer = propertyElement?.closest<HTMLElement>('.metadata-container') ?? null;
    if (propertyElement !== null && metadataContainer !== null) {
      const roots = buildPropertyFieldForest(metadataContainer);
      const node = flattenPropertyFieldForest(roots).find((candidate) => candidate.element === propertyElement);
      if (node === undefined) {
        return;
      }
      const mode = detectViewMode(propertyElement);
      if (this.isBreadcrumbEnabled(mode)) {
        this.showDomBreadcrumb(ownerDocument, roots, node, fieldTarget ?? propertyElement);
      }
      if (this.isMainThreadingEnabled() && !this.pluginSettingsComponent.settings.isActiveCursorPropertyFieldThreadingEnabled) {
        state.active = { container: metadataContainer, element: propertyElement, kind: 'dom' };
        this.scheduleRender(ownerDocument);
      }
      return;
    }

    const sourceLine = target.closest<HTMLElement>('.cm-line');
    if (sourceLine === null || detectViewMode(sourceLine) !== 'source') {
      return;
    }
    const sourceTarget = this.resolveSourceTarget(sourceLine);
    if (sourceTarget === null) {
      return;
    }
    if (this.isBreadcrumbEnabled('source')) {
      this.showSourceBreadcrumb(ownerDocument, sourceTarget.roots, sourceTarget.node, sourceLine, sourceTarget.view);
    }
    if (this.pluginSettingsComponent.settings.isPropertyFieldThreadingEnabled && !this.pluginSettingsComponent.settings.isActiveCursorPropertyFieldThreadingEnabled) {
      state.active = { kind: 'source', line: sourceTarget.node.line, roots: sourceTarget.roots, view: sourceTarget.view };
      this.highlightSourceLine(ownerDocument, sourceLine);
    }
  }

  private onPointerOut(ownerDocument: Document, event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof ownerDocument.defaultView!.Element)) {
      return;
    }
    const related = event.relatedTarget;
    if (related instanceof ownerDocument.defaultView!.Node && (target.contains(related) || (related.instanceOf(ownerDocument.defaultView!.Element) && related.closest('.np-property-breadcrumb-popover') !== null))) {
      return;
    }
    if (target.closest('.metadata-property-key, .metadata-property-value, .cm-line, .np-property-breadcrumb-popover') !== null) {
      this.schedulePopoverHide(ownerDocument);
      if (!this.pluginSettingsComponent.settings.isActiveCursorPropertyFieldThreadingEnabled) {
        const state = this.documentStates.get(ownerDocument);
        if (state !== undefined) {
          state.active = null;
          state.sourceHighlight?.classList.remove('np-property-field-source-highlight');
          state.sourceHighlight = null;
          this.scheduleRender(ownerDocument);
        }
      }
    }
  }

  private onFocusIn(ownerDocument: Document, event: FocusEvent): void {
    if (!this.pluginSettingsComponent.settings.isActiveCursorPropertyFieldThreadingEnabled || !this.isMainThreadingEnabled()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof ownerDocument.defaultView!.Element)) {
      return;
    }
    const propertyElement = target.closest<HTMLElement>('.metadata-property');
    const metadataContainer = propertyElement?.closest<HTMLElement>('.metadata-container') ?? null;
    const state = this.documentStates.get(ownerDocument);
    if (propertyElement !== null && metadataContainer !== null && state !== undefined) {
      state.active = { container: metadataContainer, element: propertyElement, kind: 'dom' };
      this.scheduleRender(ownerDocument);
    }
  }

  private onFocusOut(ownerDocument: Document, event: FocusEvent): void {
    if (!this.pluginSettingsComponent.settings.isActiveCursorPropertyFieldThreadingEnabled) {
      return;
    }
    const related = event.relatedTarget;
    if (related instanceof ownerDocument.defaultView!.Element && related.closest('.metadata-property') !== null) {
      return;
    }
    const state = this.documentStates.get(ownerDocument);
    if (state?.active?.kind === 'dom') {
      state.active = null;
      this.scheduleRender(ownerDocument);
    }
  }

  private onEditorCursorChanged(ownerDocument: Document): void {
    const settings = this.pluginSettingsComponent.settings;
    if (!settings.isPropertyFieldThreadingEnabled || !settings.isActiveCursorPropertyFieldThreadingEnabled) {
      return;
    }
    const view = this.findMarkdownView(ownerDocument, ownerDocument.activeElement);
    const sourceView = view?.containerEl.querySelector<HTMLElement>('.markdown-source-view') ?? null;
    if (view === null || sourceView === null || detectViewMode(sourceView) !== 'source') {
      return;
    }
    const roots = parseSourcePropertyFields(view.editor.getValue());
    const cursor = view.editor.getCursor();
    const node = findSourcePropertyNodeAtLine(roots, cursor.line);
    const state = this.documentStates.get(ownerDocument);
    if (state === undefined) {
      return;
    }
    state.active = node === null ? null : { kind: 'source', line: node.line, roots, view };
    if (state.popover !== null && node !== null) {
      this.showSourceBreadcrumb(ownerDocument, roots, node, ownerDocument.activeElement instanceof HTMLElement ? ownerDocument.activeElement : view.containerEl, view);
    }
  }

  private scheduleRender(ownerDocument: Document): void {
    const state = this.documentStates.get(ownerDocument);
    const win = ownerDocument.defaultView;
    if (state === undefined || win === null || state.renderFrame !== null) {
      return;
    }
    state.renderFrame = win.requestAnimationFrame(() => {
      state.renderFrame = null;
      this.renderDocument(ownerDocument);
    });
  }

  private renderDocument(ownerDocument: Document): void {
    const state = this.documentStates.get(ownerDocument);
    if (state === undefined) {
      return;
    }
    const containers = Array.from(ownerDocument.querySelectorAll<HTMLElement>('.metadata-container'));
    for (const container of containers) {
      this.renderContainer(container, state.active?.kind === 'dom' && state.active.container === container ? state.active : null);
    }
    for (const overlay of ownerDocument.querySelectorAll<HTMLElement>('.np-property-tree-overlay')) {
      if (!containers.includes(overlay.parentElement as HTMLElement)) {
        overlay.remove();
      }
    }
  }

  private renderContainer(container: HTMLElement, active: ActiveDomField | null): void {
    container.querySelector(':scope > .np-property-tree-overlay')?.remove();
    for (const element of container.querySelectorAll<HTMLElement>('.np-property-field-active')) {
      element.classList.remove('np-property-field-active');
    }
    const roots = buildPropertyFieldForest(container);
    const nodes = flattenPropertyFieldForest(roots);
    for (const node of nodes) {
      node.element.classList.add('np-property-tree-node');
      node.element.style.setProperty('--np-property-depth', String(node.depth));
    }
    const settings = this.pluginSettingsComponent.settings;
    const showStatic = settings.isNestedPropertiesMainUiStaticTreeIndentationGuidesEnabled;
    const showThreads = active !== null && this.isMainThreadingEnabled();
    if (nodes.length === 0 || (!showStatic && !showThreads)) {
      return;
    }

    const svg = container.ownerDocument.createElementNS(SVG_NAMESPACE, 'svg');
    svg.classList.add('np-property-tree-overlay');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', String(Math.max(container.scrollWidth, container.clientWidth)));
    svg.setAttribute('height', String(Math.max(container.scrollHeight, container.clientHeight)));
    container.prepend(svg);
    const metrics = createNodeMetrics(container, nodes);
    if (showStatic) {
      this.drawForest(svg, roots, metrics, 'np-property-guide-static');
    }
    if (!showThreads || active === null) {
      return;
    }
    const activeNode = nodes.find((node) => node.element === active.element);
    if (activeNode === undefined) {
      return;
    }
    activeNode.keyElement.classList.add('np-property-field-active');
    const activeRoot = getPropertyFieldRoot(activeNode);

    if (settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInMainUiEnabled && settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled) {
      this.drawForest(svg, roots, metrics, 'np-property-thread-root-all');
    } else if (settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActivePropertyFieldTreeThreadingInMainUiEnabled) {
      this.drawForest(svg, [activeRoot], metrics, 'np-property-thread-all');
    }

    if (settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isActiveRootLevelPropertyFieldThreadingEnabled && settings.isActiveRootLevelPropertyFieldThreadingInMainUiEnabled) {
      this.drawRootPath(svg, roots, activeRoot, metrics);
    }
    if (settings.isActivePropertyFieldThreadingEnabled && settings.isActivePropertyFieldThreadingInMainUiEnabled) {
      this.drawActivePath(svg, activeNode, metrics);
    }
  }

  private drawForest<T extends { children: T[]; depth: number }>(svg: SVGSVGElement, roots: T[], metrics: Map<T, Point>, className: string): void {
    const visit = (siblings: T[]): void => {
      if (siblings.length === 0) {
        return;
      }
      this.drawSiblingGroup(svg, siblings, metrics, className);
      for (const sibling of siblings) {
        visit(sibling.children);
      }
    };
    visit(roots);
  }

  private drawSiblingGroup<T extends { depth: number }>(svg: SVGSVGElement, siblings: T[], metrics: Map<T, Point>, className: string): void {
    const isThread = className.startsWith('np-property-thread-');
    const isBreadcrumb = svg.classList.contains('np-property-breadcrumb-guides');
    const fieldGap = readCssNumber(svg, isThread ? '--np-thread-field-gap' : '--np-guide-field-gap', 4);
    const verticalOffset = readCssNumber(svg, isThread ? '--np-thread-vertical-offset' : '--np-guide-vertical-offset', 0);
    const points = siblings
      .map((node) => metrics.get(node))
      .filter((point): point is Point => point !== undefined)
      .map((point) => ({ x: point.x - fieldGap, y: point.y + verticalOffset }));
    if (points.length === 0) {
      return;
    }
    const connectorLength = readCssNumber(svg, isBreadcrumb ? '--np-breadcrumb-connector-length' : isThread ? '--np-thread-connector-length' : '--np-guide-connector-length', 18);
    const firstRise = readCssNumber(svg, '--np-guide-first-branch-rise', 10);
    const spineX = Math.min(...points.map((point) => point.x)) - connectorLength;
    const firstY = points[0]?.y ?? 0;
    const lastY = points.at(-1)?.y ?? firstY;
    appendPath(svg, `M ${spineX} ${firstY - firstRise} V ${lastY}`, className, siblings[0]?.depth ?? 0);
    for (const point of points) {
      appendPath(svg, `M ${spineX} ${point.y} H ${point.x}`, className, siblings[0]?.depth ?? 0);
    }
  }

  private drawActivePath(svg: SVGSVGElement, activeNode: PropertyFieldNode, metrics: Map<PropertyFieldNode, Point>): void {
    const ancestors = getPropertyFieldAncestors(activeNode);
    const connectorLength = readCssNumber(svg, '--np-thread-connector-length', 28);
    const fieldGap = readCssNumber(svg, '--np-thread-field-gap', 4);
    const radius = readCssNumber(svg, '--np-thread-corner-radius', 8);
    const verticalOffset = readCssNumber(svg, '--np-thread-vertical-offset', 0);
    for (const [index, node] of ancestors.entries()) {
      const rawPoint = metrics.get(node);
      if (rawPoint === undefined) {
        continue;
      }
      const point = { x: rawPoint.x - fieldGap, y: rawPoint.y + verticalOffset };
      const parent = index === 0 ? null : ancestors[index - 1] ?? null;
      const rawParentPoint = parent === null ? null : metrics.get(parent) ?? null;
      const parentPoint = rawParentPoint === null ? null : { x: rawParentPoint.x - fieldGap, y: rawParentPoint.y + verticalOffset };
      const spineX = point.x - connectorLength;
      const startY = parentPoint?.y ?? point.y - readCssNumber(svg, '--np-guide-first-branch-rise', 10);
      appendPath(svg, buildRoundedPath({ endX: point.x, endY: point.y, radius, startX: spineX, startY }), 'np-property-thread-active', node.depth);
    }
  }

  private drawRootPath(svg: SVGSVGElement, roots: PropertyFieldNode[], activeRoot: PropertyFieldNode, metrics: Map<PropertyFieldNode, Point>): void {
    const rawActivePoint = metrics.get(activeRoot);
    const rawFirstPoint = roots[0] === undefined ? undefined : metrics.get(roots[0]);
    if (rawActivePoint === undefined || rawFirstPoint === undefined) {
      return;
    }
    const connectorLength = readCssNumber(svg, '--np-thread-connector-length', 28);
    const fieldGap = readCssNumber(svg, '--np-thread-field-gap', 4);
    const radius = readCssNumber(svg, '--np-thread-corner-radius', 8);
    const verticalOffset = readCssNumber(svg, '--np-thread-vertical-offset', 0);
    const activePoint = { x: rawActivePoint.x - fieldGap, y: rawActivePoint.y + verticalOffset };
    const firstPoint = { x: rawFirstPoint.x - fieldGap, y: rawFirstPoint.y + verticalOffset };
    appendPath(
      svg,
      buildRoundedPath({
        endX: activePoint.x,
        endY: activePoint.y,
        radius,
        startX: Math.min(...roots.map((root) => (metrics.get(root)?.x ?? rawActivePoint.x) - fieldGap)) - connectorLength,
        startY: firstPoint.y - readCssNumber(svg, '--np-guide-first-branch-rise', 10)
      }),
      'np-property-thread-root-active',
      0
    );
  }

  private showDomBreadcrumb(ownerDocument: Document, roots: PropertyFieldNode[], current: PropertyFieldNode, anchor: HTMLElement): void {
    const settings = this.pluginSettingsComponent.settings;
    const root = getPropertyFieldRoot(current);
    const nodes = settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInHoverBreadcrumbEnabled
      ? flattenPropertyFieldForest(roots)
      : settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActivePropertyFieldTreeThreadingInHoverBreadcrumbEnabled
      ? flattenPropertyFieldForest([root])
      : getPropertyFieldAncestors(current);
    const entries = createBreadcrumbEntries(nodes, current);
    this.showBreadcrumb(ownerDocument, entries, anchor, (node) => {
      node.keyElement.scrollIntoView({ block: 'center', inline: 'nearest' });
      const focusTarget = node.keyElement.querySelector<HTMLElement>('input, [contenteditable], button') ?? node.valueElement?.querySelector<HTMLElement>('input, textarea, [contenteditable]') ?? node.keyElement;
      focusTarget.focus({ preventScroll: true });
    }, (node) => {
      for (const element of ownerDocument.querySelectorAll('.np-property-field-popover-highlight')) {
        element.classList.remove('np-property-field-popover-highlight');
      }
      node.keyElement.classList.add('np-property-field-popover-highlight');
      if (!settings.isActiveCursorPropertyFieldThreadingEnabled && this.isMainThreadingEnabled()) {
        const state = this.documentStates.get(ownerDocument);
        const container = node.element.closest<HTMLElement>('.metadata-container');
        if (state !== undefined && container !== null) {
          state.active = { container, element: node.element, kind: 'dom' };
          this.scheduleRender(ownerDocument);
        }
      }
    });
  }

  private showSourceBreadcrumb(ownerDocument: Document, roots: SourcePropertyFieldNode[], current: SourcePropertyFieldNode, anchor: HTMLElement, view: MarkdownView): void {
    const settings = this.pluginSettingsComponent.settings;
    const root = getPropertyFieldRoot(current);
    const nodes = settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInHoverBreadcrumbEnabled
      ? flattenPropertyFieldForest(roots)
      : settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActivePropertyFieldTreeThreadingInHoverBreadcrumbEnabled
      ? flattenPropertyFieldForest([root])
      : getPropertyFieldAncestors(current);
    this.showBreadcrumb(ownerDocument, createBreadcrumbEntries(nodes, current), anchor, (node) => {
      view.editor.setCursor({ ch: node.column, line: node.line });
      view.editor.focus();
    }, (node) => {
      if (!settings.isActiveCursorPropertyFieldThreadingEnabled && settings.isPropertyFieldThreadingEnabled) {
        const state = this.documentStates.get(ownerDocument);
        if (state !== undefined) {
          state.active = { kind: 'source', line: node.line, roots, view };
        }
      }
      this.highlightVisibleSourceLine(ownerDocument, view, node.line);
    });
  }

  private showBreadcrumb<T extends { children: T[]; depth: number; key: string; parent: null | T }>(ownerDocument: Document, entries: Array<BreadcrumbEntry<T>>, anchor: HTMLElement, onNavigate: (node: T) => void, onHighlight: (node: T) => void): void {
    const state = this.documentStates.get(ownerDocument);
    if (state === undefined) {
      return;
    }
    this.cancelPopoverHide(ownerDocument);
    state.popover?.remove();
    const popover = ownerDocument.win.createDiv();
    popover.className = 'np-property-breadcrumb-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Property field hierarchy');
    const title = popover.createDiv({ cls: 'np-property-breadcrumb-title', text: 'Property field hierarchy' });
    title.setAttribute('aria-hidden', 'true');
    const tree = popover.createDiv({ cls: 'np-property-breadcrumb-tree' });
    tree.setAttribute('role', 'tree');
    const rowElements: HTMLElement[] = [];
    for (const [index, entry] of entries.entries()) {
      const row = tree.createDiv({ cls: ['np-property-breadcrumb-row', ...(entry.current ? ['is-current'] : [])] });
      row.dataset['index'] = String(index);
      row.dataset['parentIndex'] = String(entry.parentIndex);
      row.style.setProperty('--np-breadcrumb-depth', String(entry.node.depth));
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-current', entry.current ? 'true' : 'false');
      const button = row.createEl('button', { cls: 'np-property-breadcrumb-key', text: entry.node.key, type: 'button' });
      button.addEventListener('click', () => onNavigate(entry.node));
      button.addEventListener('mouseenter', () => {
        button.focus({ preventScroll: true });
        onHighlight(entry.node);
      });
      button.addEventListener('focus', () => onHighlight(entry.node));
      rowElements.push(row);
    }
    tree.addEventListener('keydown', (event) => {
      const activeIndex = rowElements.findIndex((row) => row.contains(ownerDocument.activeElement));
      const targetIndex = getBreadcrumbKeyboardTarget(event.key, activeIndex, rowElements.length);
      if (targetIndex === null) {
        return;
      }
      event.preventDefault();
      rowElements[targetIndex]?.querySelector<HTMLElement>('button')?.focus();
    });
    ownerDocument.body.append(popover);
    state.popover = popover;
    this.positionPopover(popover, anchor.getBoundingClientRect());
    this.drawBreadcrumbGuides(tree, entries, rowElements);
    const currentIndex = entries.findIndex((entry) => entry.current);
    rowElements[currentIndex]?.scrollIntoView({ block: 'nearest' });
    popover.addEventListener('pointerenter', () => this.cancelPopoverHide(ownerDocument));
    popover.addEventListener('pointerleave', () => this.schedulePopoverHide(ownerDocument));
  }

  private drawBreadcrumbGuides<T extends { children: T[]; depth: number; parent: null | T }>(tree: HTMLElement, entries: Array<BreadcrumbEntry<T>>, rows: HTMLElement[]): void {
    const settings = this.pluginSettingsComponent.settings;
    const isStaticEnabled = settings.isPropertyFieldHoverBreadcrumbStaticTreeIndentationGuidesEnabled;
    const isThreadingEnabled = settings.isPropertyFieldThreadingEnabled && settings.isPropertyFieldThreadingInHoverBreadcrumbEnabled;
    if (!isStaticEnabled && !isThreadingEnabled) {
      return;
    }
    const svg = tree.ownerDocument.createElementNS(SVG_NAMESPACE, 'svg');
    svg.classList.add('np-property-breadcrumb-guides');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', String(tree.scrollWidth));
    svg.setAttribute('height', String(tree.scrollHeight));
    tree.prepend(svg);
    const metrics = new Map<T, Point>();
    for (const [index, entry] of entries.entries()) {
      const row = rows[index];
      if (row === undefined) {
        continue;
      }
      const depth = entry.node.depth;
      metrics.set(entry.node, {
        x: readCssNumber(tree, '--np-breadcrumb-indent', 18) * depth + readCssNumber(tree, '--np-breadcrumb-connector-length', 12) + 4,
        y: row.offsetTop + row.offsetHeight / 2
      });
    }
    const entrySet = new Set(entries.map((entry) => entry.node));
    const roots = entries.filter((entry) => entry.node.parent === null || !entrySet.has(entry.node.parent)).map((entry) => entry.node);
    if (isStaticEnabled) {
      this.drawForest(svg, roots, metrics, 'np-property-guide-breadcrumb');
    }
    if (!isThreadingEnabled) {
      return;
    }
    const current = entries.find((entry) => entry.current)?.node;
    if (current === undefined) {
      return;
    }
    const currentRoot = getPropertyFieldRoot(current);
    if (settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInHoverBreadcrumbEnabled) {
      this.drawForest(svg, roots, metrics, 'np-property-thread-root-all');
    } else if (settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActivePropertyFieldTreeThreadingInHoverBreadcrumbEnabled) {
      this.drawForest(svg, [currentRoot], metrics, 'np-property-thread-all');
    }
    if (settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isActiveRootLevelPropertyFieldThreadingEnabled && settings.isActiveRootLevelPropertyFieldThreadingInHoverBreadcrumbEnabled) {
      this.drawGenericBreadcrumbPath(svg, [currentRoot], metrics, 'np-property-thread-root-active');
    }
    if (settings.isActivePropertyFieldThreadingEnabled && settings.isActivePropertyFieldThreadingInHoverBreadcrumbEnabled) {
      this.drawGenericBreadcrumbPath(svg, getPropertyFieldAncestors(current), metrics, 'np-property-thread-active');
    }
  }

  private drawGenericBreadcrumbPath<T extends { depth: number }>(svg: SVGSVGElement, nodes: T[], metrics: Map<T, Point>, className: string): void {
    const connectorLength = readCssNumber(svg, '--np-breadcrumb-connector-length', 12);
    const fieldGap = readCssNumber(svg, '--np-thread-field-gap', 4);
    const radius = readCssNumber(svg, '--np-thread-corner-radius', 8);
    const verticalOffset = readCssNumber(svg, '--np-thread-vertical-offset', 0);
    for (const [index, node] of nodes.entries()) {
      const rawPoint = metrics.get(node);
      if (rawPoint === undefined) {
        continue;
      }
      const point = { x: rawPoint.x - fieldGap, y: rawPoint.y + verticalOffset };
      const previousNode = nodes[index - 1];
      const rawParentPoint = previousNode === undefined ? null : metrics.get(previousNode) ?? null;
      const parentPoint = rawParentPoint === null ? null : { x: rawParentPoint.x - fieldGap, y: rawParentPoint.y + verticalOffset };
      appendPath(
        svg,
        buildRoundedPath({
          endX: point.x,
          endY: point.y,
          radius,
          startX: point.x - connectorLength,
          startY: parentPoint?.y ?? point.y - readCssNumber(svg, '--np-guide-first-branch-rise', 10)
        }),
        className,
        node.depth
      );
    }
  }

  private positionPopover(popover: HTMLElement, anchorRect: DOMRect): void {
    const win = popover.ownerDocument.defaultView;
    if (win === null) {
      return;
    }
    const anchorGap = readCssNumber(popover, '--np-breadcrumb-anchor-gap', 8);
    const viewportGap = readCssNumber(popover, '--np-breadcrumb-viewport-gap', 8);
    const left = Math.min(Math.max(viewportGap, anchorRect.left), Math.max(viewportGap, win.innerWidth - popover.offsetWidth - viewportGap));
    let top = anchorRect.bottom + anchorGap;
    if (top + popover.offsetHeight > win.innerHeight - viewportGap) {
      top = Math.max(viewportGap, anchorRect.top - popover.offsetHeight - anchorGap);
    }
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  private schedulePopoverHide(ownerDocument: Document): void {
    const state = this.documentStates.get(ownerDocument);
    const win = ownerDocument.defaultView;
    if (state === undefined || win === null) {
      return;
    }
    this.cancelPopoverHide(ownerDocument);
    state.hideTimer = win.setTimeout(() => {
      state.popover?.remove();
      state.popover = null;
      state.hideTimer = null;
      for (const element of ownerDocument.querySelectorAll('.np-property-field-popover-highlight')) {
        element.classList.remove('np-property-field-popover-highlight');
      }
    }, POPOVER_HIDE_DELAY_IN_MILLISECONDS);
  }

  private cancelPopoverHide(ownerDocument: Document): void {
    const state = this.documentStates.get(ownerDocument);
    const win = ownerDocument.defaultView;
    if (state?.hideTimer !== null && state?.hideTimer !== undefined && win !== null) {
      win.clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
  }

  private isBreadcrumbEnabled(mode: ViewMode): boolean {
    const settings = this.pluginSettingsComponent.settings;
    return settings.isPropertyFieldHoverBreadcrumbEnabled && (mode === 'live-preview'
      ? settings.isPropertyFieldHoverBreadcrumbInLivePreviewEnabled
      : mode === 'source'
      ? settings.isPropertyFieldHoverBreadcrumbInSourceModeEnabled
      : settings.isPropertyFieldHoverBreadcrumbInReadingModeEnabled);
  }

  private isMainThreadingEnabled(): boolean {
    const settings = this.pluginSettingsComponent.settings;
    return settings.isPropertyFieldThreadingEnabled && settings.isPropertyFieldThreadingInMainUiEnabled;
  }

  private resolveSourceTarget(lineElement: HTMLElement): null | { node: SourcePropertyFieldNode; roots: SourcePropertyFieldNode[]; view: MarkdownView } {
    const view = this.findMarkdownView(lineElement.ownerDocument, lineElement);
    if (view === null) {
      return null;
    }
    const source = view.editor.getValue();
    const roots = parseSourcePropertyFields(source);
    const line = resolveSourceLine(lineElement, source, view.editor.getCursor().line);
    const node = findSourcePropertyNodeAtLine(roots, line);
    return node === null ? null : { node, roots, view };
  }

  private findMarkdownView(ownerDocument: Document, target: EventTarget | null): MarkdownView | null {
    const targetNode = target instanceof ownerDocument.defaultView!.Node ? target : null;
    let found: MarkdownView | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (found === null && leaf.view instanceof MarkdownView && leaf.view.containerEl.ownerDocument === ownerDocument && (targetNode === null || leaf.view.containerEl.contains(targetNode))) {
        found = leaf.view;
      }
    });
    return found;
  }

  private highlightSourceLine(ownerDocument: Document, line: HTMLElement): void {
    const state = this.documentStates.get(ownerDocument);
    state?.sourceHighlight?.classList.remove('np-property-field-source-highlight');
    line.classList.add('np-property-field-source-highlight');
    if (state !== undefined) {
      state.sourceHighlight = line;
    }
  }

  private highlightVisibleSourceLine(ownerDocument: Document, view: MarkdownView, lineNumber: number): void {
    const sourceLine = Array.from(view.containerEl.querySelectorAll<HTMLElement>('.cm-line')).find((line) => resolveSourceLine(line, view.editor.getValue(), lineNumber) === lineNumber);
    if (sourceLine !== undefined) {
      this.highlightSourceLine(ownerDocument, sourceLine);
    }
  }
}

export function buildRoundedPath(params: { endX: number; endY: number; radius: number; startX: number; startY: number }): string {
  const { endX, endY, startX, startY } = params;
  const horizontalDistance = Math.abs(endX - startX);
  const verticalDistance = Math.abs(endY - startY);
  const radius = Math.max(0, Math.min(params.radius, horizontalDistance, verticalDistance));
  if (radius === 0 || startY === endY) {
    return `M ${startX} ${startY} V ${endY} H ${endX}`;
  }
  const horizontalDirection = endX >= startX ? 1 : -1;
  const verticalDirection = endY >= startY ? 1 : -1;
  return `M ${startX} ${startY} V ${endY - verticalDirection * radius} Q ${startX} ${endY} ${startX + horizontalDirection * radius} ${endY} H ${endX}`;
}

export function getBreadcrumbKeyboardTarget(key: string, activeIndex: number, length: number): number | null {
  if (length <= 0) {
    return null;
  }
  if (key === 'ArrowDown') {
    return Math.min(length - 1, Math.max(0, activeIndex + 1));
  }
  if (key === 'ArrowUp') {
    return Math.max(0, activeIndex <= 0 ? 0 : activeIndex - 1);
  }
  if (key === 'Home') {
    return 0;
  }
  if (key === 'End') {
    return length - 1;
  }
  return null;
}

function appendPath(svg: SVGSVGElement, data: string, className: string, depth: number): void {
  const path = svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('d', data);
  path.classList.add('np-property-guide', className);
  if (className.startsWith('np-property-thread-')) {
    path.classList.add(`np-property-thread-depth-${getThreadDepthColorIndex(depth)}`);
  }
  svg.append(path);
}

export function getThreadDepthColorIndex(depth: number): number {
  return Math.min(8, Math.max(1, Math.trunc(depth) + 1));
}

function createBreadcrumbEntries<T extends { parent: null | T }>(nodes: T[], current: T): Array<BreadcrumbEntry<T>> {
  const indexByNode = new Map<T, number>();
  const entries = nodes.map((node, index) => {
    indexByNode.set(node, index);
    return { current: node === current, node, parentIndex: -1 };
  });
  for (const entry of entries) {
    entry.parentIndex = entry.node.parent === null ? -1 : indexByNode.get(entry.node.parent) ?? -1;
  }
  return entries;
}

function createNodeMetrics(container: HTMLElement, nodes: PropertyFieldNode[]): Map<PropertyFieldNode, Point> {
  const containerRect = container.getBoundingClientRect();
  const metrics = new Map<PropertyFieldNode, Point>();
  for (const node of nodes) {
    const rect = node.keyElement.getBoundingClientRect();
    metrics.set(node, {
      x: rect.left - containerRect.left + container.scrollLeft,
      y: rect.top - containerRect.top + container.scrollTop + rect.height / 2
    });
  }
  return metrics;
}

function detectViewMode(element: Element): ViewMode {
  if (element.closest('.markdown-preview-view, .markdown-reading-view') !== null) {
    return 'reading';
  }
  const sourceView = element.closest('.markdown-source-view');
  return sourceView?.classList.contains('is-live-preview') === true ? 'live-preview' : sourceView === null ? 'live-preview' : 'source';
}

function isRelevantMutation(mutation: MutationRecord): boolean {
  const target = mutation.target.instanceOf(Element) ? mutation.target : mutation.target.parentElement;
  if (target?.closest('.np-property-tree-overlay, .np-property-breadcrumb-popover') !== null) {
    return false;
  }
  const changed = [...mutation.addedNodes, ...mutation.removedNodes];
  return changed.some((node) => !(node.instanceOf(Element)) || !node.matches('.np-property-tree-overlay, .np-property-breadcrumb-popover'));
}

function readCssNumber(element: Element, variable: string, fallback: number): number {
  const value = element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue(variable).trim() ?? '';
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function removeVisualArtifacts(ownerDocument: Document): void {
  for (const element of ownerDocument.querySelectorAll('.np-property-tree-overlay, .np-property-breadcrumb-popover')) {
    element.remove();
  }
  for (const element of ownerDocument.querySelectorAll<HTMLElement>('.np-property-tree-node, .np-property-field-active, .np-property-field-popover-highlight, .np-property-field-source-highlight')) {
    element.classList.remove('np-property-tree-node', 'np-property-field-active', 'np-property-field-popover-highlight', 'np-property-field-source-highlight');
    element.style.removeProperty('--np-property-depth');
  }
}

function resolveSourceLine(lineElement: HTMLElement, source: string, preferredLine: number): number {
  const explicitLine = Number(lineElement.dataset['line']);
  if (Number.isSafeInteger(explicitLine) && explicitLine >= 0) {
    return explicitLine;
  }
  const text = lineElement.textContent ?? '';
  const sourceLines = source.split(/\r?\n/u);
  const candidates: number[] = [];
  for (const [index, line] of sourceLines.entries()) {
    if (line === text || line.trim() === text.trim()) {
      candidates.push(index);
    }
  }
  return candidates.sort((left, right) => Math.abs(left - preferredLine) - Math.abs(right - preferredLine))[0] ?? preferredLine;
}

/* eslint-enable @typescript-eslint/array-type, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/restrict-template-expressions, complexity, import-x/consistent-type-specifier-style, no-magic-numbers, no-restricted-syntax, obsidian-dev-utils/params-options-name-match, obsidian-dev-utils/readonly-params-options-result-members, perfectionist/sort-classes, perfectionist/sort-modules, perfectionist/sort-union-types, unicorn/consistent-boolean-name, unicorn/no-array-callback-reference, unicorn/no-nested-ternary, unicorn/no-unnecessary-nested-ternary, unicorn/prefer-add-event-listener-options, unicorn/prefer-spread -- Restore repository DOM rules. */
