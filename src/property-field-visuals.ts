/* v8 ignore file -- Integration behavior depends on Obsidian's live metadata-editor and CodeMirror DOM. */
/* eslint-disable @typescript-eslint/array-type, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/restrict-template-expressions, complexity, import-x/consistent-type-specifier-style, no-magic-numbers, no-restricted-syntax, obsidian-dev-utils/params-options-name-match, obsidian-dev-utils/readonly-params-options-result-members, perfectionist/sort-classes, perfectionist/sort-modules, perfectionist/sort-union-types, unicorn/consistent-boolean-name, unicorn/no-array-callback-reference, unicorn/no-nested-ternary, unicorn/no-unnecessary-nested-ternary, unicorn/prefer-spread -- The component mirrors and traverses Obsidian's cross-window DOM; local callback and ordering rules would obscure the event-flow implementation. */
import type { App } from 'obsidian';

import {
  Component,
  MarkdownView
} from 'obsidian';
import { getAllDomWindows } from 'obsidian-dev-utils/obsidian/workspace';

import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PROPERTY_FIELD_LAYOUT_CHANGE_EVENT } from './property-field-events.ts';
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
const PROPERTY_EDIT_CAPTURE_DELAYS_IN_MILLISECONDS = [0, 40, 120, 240] as const;
const REDO_FALLBACK_DELAY_IN_MILLISECONDS = 40;
const OWNED_VISUAL_SELECTOR = '.np-property-tree-overlay, .np-property-source-overlay, .np-property-breadcrumb-popover';
const METADATA_CONTAINER_SELECTOR = '.metadata-container';
const propertyFieldHitSnapshots = new WeakMap<HTMLElement, PropertyFieldHitSnapshot>();

type ViewMode = 'live-preview' | 'reading' | 'source';

export type BreadcrumbActivationScope = 'field' | 'key' | 'toggle';

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
  hoveredBreadcrumbField: HTMLElement | null;
  hoveredThreadingField: HTMLElement | null;
  lastPropertyEdit: PropertyEditTransaction | null;
  lastPropertyEditorView: MarkdownView | null;
  mutationObserver: MutationObserver | null;
  popover: HTMLElement | null;
  propertyEditCaptureTimer: number | null;
  propertyEditStart: PropertyEditStart | null;
  redoFallbackTimer: number | null;
  renderFrame: number | null;
  renderGeneration: number;
  sourceHighlight: HTMLElement | null;
}

export interface ContainerRenderSnapshot {
  activeElement: HTMLElement | null;
  generation: number;
  height: number;
  width: number;
}

interface PropertyFieldVisualsComponentParams {
  app: App;
  pluginSettingsComponent: PluginSettingsComponent;
}

interface RedoCapableEditor {
  getValue(): string;
  redo(): void;
}

interface TextEditingEditor extends RedoCapableEditor {
  offsetToPos(offset: number): { ch: number; line: number };
  replaceRange(replacement: string, from: { ch: number; line: number }, to?: { ch: number; line: number }): void;
}

interface PropertyEditStart {
  before: string;
  view: MarkdownView;
}

interface PropertyEditTransaction extends PropertyEditStart {
  after: string;
}

export interface TextReplacement {
  end: number;
  replacement: string;
  start: number;
}

interface Point {
  x: number;
  y: number;
}

interface PropertyFieldHitEntry {
  bottom: number;
  element: HTMLElement;
  keyLeft: number;
  keyRight: number;
  top: number;
}

interface PropertyFieldHitSnapshot {
  entries: PropertyFieldHitEntry[];
  height: number;
  width: number;
}

export type CssNumberReader = (variable: string, fallback: number) => number;

interface VisualMutation {
  addedNodes: Iterable<Node>;
  attributeName: string | null;
  oldValue: string | null;
  removedNodes: Iterable<Node>;
  target: Node;
}

export class PropertyFieldVisualsComponent extends Component {
  private readonly app: App;
  private readonly containerRenderSnapshots = new WeakMap<HTMLElement, ContainerRenderSnapshot>();
  private readonly documentStates = new Map<Document, DocumentState>();
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: PropertyFieldVisualsComponentParams) {
    super();
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public override onload(): void {
    super.onload();
    this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
      if (!this.app.workspace.layoutReady) {
        return;
      }
      const ownerDocument = leaf?.view.containerEl.ownerDocument;
      if (ownerDocument === undefined) {
        return;
      }
      this.observeDocument(ownerDocument);
      for (const state of this.documentStates.values()) {
        if (state.active?.kind !== 'dom' || state.active.container.isShown()) {
          continue;
        }
        state.active.element.querySelector('.np-property-field-active')?.classList.remove('np-property-field-active');
        state.active = null;
      }
      this.scheduleRender(ownerDocument);
    }));
    this.registerEvent(this.app.workspace.on('css-change', () => this.refresh()));
    this.registerEvent(this.app.workspace.on('window-open', (_workspaceWindow, openedWindow) => {
      if (!this.app.workspace.layoutReady) {
        return;
      }
      this.observeDocument(openedWindow.document);
      this.invalidateDocument(openedWindow.document);
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
      if (state.redoFallbackTimer !== null) {
        ownerDocument.defaultView?.clearTimeout(state.redoFallbackTimer);
      }
      if (state.propertyEditCaptureTimer !== null) {
        ownerDocument.defaultView?.clearTimeout(state.propertyEditCaptureTimer);
      }
      state.popover?.remove();
      state.sourceHighlight?.classList.remove('np-property-field-source-highlight');
      removeVisualArtifacts(ownerDocument);
    }
    this.documentStates.clear();
    super.onunload();
  }

  public refresh(): void {
    if (!this.app.workspace.layoutReady) {
      return;
    }
    this.observeAllDocuments();
    for (const [ownerDocument, state] of this.documentStates) {
      if (state.active !== null && !this.isMainThreadingEnabled(state.active.kind === 'source' ? 'source' : detectViewMode(state.active.element))) {
        state.active = null;
        state.sourceHighlight?.classList.remove('np-property-field-source-highlight');
        state.sourceHighlight = null;
      }
      state.popover?.remove();
      state.popover = null;
      this.applyBodyClasses(ownerDocument);
      this.invalidateDocument(ownerDocument);
    }
  }

  private applyBodyClasses(ownerDocument: Document): void {
    const settings = this.pluginSettingsComponent.settings;
    ownerDocument.body.classList.toggle('np-highlight-active-property-field-tree-enabled', settings.isHighlightActivePropertyFieldTreeEnabled);
    ownerDocument.body.classList.toggle('np-full-property-field-name-expansion-enabled', settings.isFullPropertyFieldNameExpansionInHoverBreadcrumbEnabled);
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
      hoveredBreadcrumbField: null,
      hoveredThreadingField: null,
      lastPropertyEdit: null,
      lastPropertyEditorView: null,
      mutationObserver: null,
      popover: null,
      propertyEditCaptureTimer: null,
      propertyEditStart: null,
      redoFallbackTimer: null,
      renderFrame: null,
      renderGeneration: 0,
      sourceHighlight: null
    };
    this.documentStates.set(ownerDocument, state);
    this.applyBodyClasses(ownerDocument);

    this.listen(ownerDocument, state, 'pointermove', (event) => this.onPointerMove(ownerDocument, event));
    this.listen(ownerDocument, state, 'pointerout', (event) => this.onPointerOut(ownerDocument, event));
    this.listen(ownerDocument, state, 'focusin', (event) => this.onFocusIn(ownerDocument, event));
    this.listen(ownerDocument, state, 'focusout', (event) => this.onFocusOut(ownerDocument, event));
    this.listen(ownerDocument, state, 'input', (event) => this.onPropertyEditorChanged(ownerDocument, event));
    this.listen(ownerDocument, state, 'change', (event) => this.onPropertyEditorChanged(ownerDocument, event));
    const keyDownListener = (event: KeyboardEvent): void => this.onKeyDown(ownerDocument, event);
    ownerDocument.addEventListener('keydown', keyDownListener, { capture: true });
    state.cleanups.push(() => ownerDocument.removeEventListener('keydown', keyDownListener, { capture: true }));
    this.listen(ownerDocument, state, 'keyup', () => this.onEditorCursorChanged(ownerDocument));
    this.listen(ownerDocument, state, 'mouseup', () => this.onEditorCursorChanged(ownerDocument));
    const scrollListener = (event: Event): void => {
      const target = event.target;
      const container = target instanceof ownerDocument.defaultView!.Node ? asElement(target)?.closest<HTMLElement>(METADATA_CONTAINER_SELECTOR) ?? null : null;
      if (container !== null) {
        this.invalidateContainer(container);
      } else if (target instanceof ownerDocument.defaultView!.Node && asElement(target)?.closest('.markdown-source-view:not(.is-live-preview)') !== null) {
        this.invalidateDocument(ownerDocument);
      }
    };
    ownerDocument.addEventListener('scroll', scrollListener, { capture: true });
    state.cleanups.push(() => ownerDocument.removeEventListener('scroll', scrollListener, { capture: true }));
    const layoutChangeListener = (event: Event): void => {
      const target = event.target;
      const container = target instanceof ownerDocument.defaultView!.Node ? asElement(target)?.closest<HTMLElement>(METADATA_CONTAINER_SELECTOR) ?? null : null;
      if (container === null) {
        this.invalidateDocument(ownerDocument);
      } else {
        this.invalidateContainer(container);
      }
    };
    ownerDocument.addEventListener(PROPERTY_FIELD_LAYOUT_CHANGE_EVENT, layoutChangeListener);
    state.cleanups.push(() => ownerDocument.removeEventListener(PROPERTY_FIELD_LAYOUT_CHANGE_EVENT, layoutChangeListener));
    const win = ownerDocument.defaultView;
    if (win !== null) {
      const invalidate = (): void => this.invalidateDocument(ownerDocument);
      win.addEventListener('resize', invalidate);
      state.cleanups.push(() => {
        win.removeEventListener('resize', invalidate);
      });
    }

    const Observer = ownerDocument.defaultView?.MutationObserver;
    if (Observer !== undefined) {
      state.mutationObserver = new Observer((mutations) => {
        // CodeMirror continuously replaces unrelated Live Preview nodes. Only metadata-editor
        // Structure changes can invalidate an overlay's measured property geometry.
        let shouldRender = false;
        for (const mutation of mutations) {
          if (!isPropertyFieldMutation(mutation)) {
            if (isSourceEditorMutation(mutation)) {
              shouldRender = true;
            }
            continue;
          }
          shouldRender = true;
          for (const container of getPropertyFieldMutationContainers(mutation)) {
            this.containerRenderSnapshots.delete(container);
            propertyFieldHitSnapshots.delete(container);
          }
        }
        if (shouldRender) {
          this.scheduleRender(ownerDocument);
        }
      });
      state.mutationObserver.observe(ownerDocument.body, { childList: true, subtree: true });
      state.bodyStyleObserver = new Observer((mutations) => {
        if (mutations.some(isPropertyVisualStyleMutation)) {
          this.invalidateDocument(ownerDocument);
        }
      });
      state.bodyStyleObserver.observe(ownerDocument.body, { attributeFilter: ['class', 'style'], attributeOldValue: true, attributes: true });
    }
  }

  private invalidateDocument(ownerDocument: Document): void {
    const state = this.documentStates.get(ownerDocument);
    if (state === undefined) {
      return;
    }
    for (const container of getShownMetadataContainers(ownerDocument)) {
      propertyFieldHitSnapshots.delete(container);
    }
    state.renderGeneration += 1;
    this.scheduleRender(ownerDocument);
  }

  private invalidateContainer(container: HTMLElement): void {
    this.containerRenderSnapshots.delete(container);
    propertyFieldHitSnapshots.delete(container);
    this.scheduleRender(container.ownerDocument);
  }

  private listen<K extends keyof DocumentEventMap>(ownerDocument: Document, state: DocumentState, type: K, listener: (event: DocumentEventMap[K]) => void): void {
    ownerDocument.addEventListener(type, listener);
    state.cleanups.push(() => ownerDocument.removeEventListener(type, listener));
  }

  private onPointerMove(ownerDocument: Document, event: PointerEvent): void {
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

    const propertyElement = resolveDomPropertyAtPointer(target, event.clientX, event.clientY);
    const metadataContainer = propertyElement?.closest<HTMLElement>(METADATA_CONTAINER_SELECTOR) ?? null;
    if (propertyElement !== null && metadataContainer !== null) {
      const mode = detectViewMode(propertyElement);
      const isBreadcrumbEnabled = this.isBreadcrumbEnabled(mode);
      const isHoverThreadingEnabled = this.isMainThreadingEnabled(mode) && !this.pluginSettingsComponent.settings.isActiveCursorPropertyFieldThreadingEnabled;
      const breadcrumbElement = isBreadcrumbEnabled ? resolveDomBreadcrumbPropertyAtPointer(target, event.clientX, event.clientY, this.getBreadcrumbActivationScope()) : null;
      this.updateDomPointerActivation(ownerDocument, state, metadataContainer, breadcrumbElement, isHoverThreadingEnabled ? propertyElement : null);
      return;
    }

    const sourceLine = resolveSourceLineElementAtPointer(target, event.clientX, event.clientY);
    if (sourceLine === null || detectViewMode(sourceLine) !== 'source') {
      this.clearPointerActivation(ownerDocument);
      return;
    }
    const isBreadcrumbEnabled = this.isBreadcrumbEnabled('source');
    const isHoverThreadingEnabled = this.isMainThreadingEnabled('source') && !this.pluginSettingsComponent.settings.isActiveCursorPropertyFieldThreadingEnabled;
    if (!isBreadcrumbEnabled && !isHoverThreadingEnabled) {
      this.clearPointerActivation(ownerDocument);
      return;
    }
    const breadcrumbLine = isBreadcrumbEnabled ? resolveSourceBreadcrumbLineAtPointer(target, event.clientX, event.clientY, this.getBreadcrumbActivationScope()) : null;
    const threadingLine = isHoverThreadingEnabled ? sourceLine : null;
    if (breadcrumbLine === null && threadingLine === null) {
      this.clearPointerActivation(ownerDocument);
      return;
    }
    const isBreadcrumbStable = state.hoveredBreadcrumbField === breadcrumbLine && (breadcrumbLine === null || state.popover !== null);
    const isThreadingStable = state.hoveredThreadingField === threadingLine && (threadingLine === null || state.active?.kind === 'source');
    if (isBreadcrumbStable && isThreadingStable) {
      if (breadcrumbLine !== null) {
        this.cancelPopoverHide(ownerDocument);
      }
      return;
    }
    const sourceTarget = this.resolveSourceTarget(sourceLine, event.clientX, event.clientY);
    if (sourceTarget === null) {
      this.clearPointerActivation(ownerDocument);
      return;
    }
    this.updateSourcePointerActivation(ownerDocument, state, sourceTarget, breadcrumbLine, threadingLine);
  }

  private onPointerOut(ownerDocument: Document, event: PointerEvent): void {
    const related = event.relatedTarget;
    if (related instanceof ownerDocument.defaultView!.Node) {
      return;
    }
    this.clearPointerActivation(ownerDocument);
  }

  private clearPointerActivation(ownerDocument: Document): void {
    const state = this.documentStates.get(ownerDocument);
    if (state === undefined) {
      return;
    }
    const hadBreadcrumbTarget = state.hoveredBreadcrumbField !== null;
    state.hoveredBreadcrumbField = null;
    if (hadBreadcrumbTarget && state.popover !== null) {
      this.schedulePopoverHide(ownerDocument);
    }
    this.clearHoverThreading(ownerDocument, state);
  }

  private clearHoverThreading(ownerDocument: Document, state: DocumentState): void {
    state.hoveredThreadingField = null;
    if (this.pluginSettingsComponent.settings.isActiveCursorPropertyFieldThreadingEnabled || state.active === null) {
      return;
    }
    state.active = null;
    state.sourceHighlight?.classList.remove('np-property-field-source-highlight');
    state.sourceHighlight = null;
    this.scheduleRender(ownerDocument);
  }

  private updateDomPointerActivation(ownerDocument: Document, state: DocumentState, metadataContainer: HTMLElement, breadcrumbElement: HTMLElement | null, threadingElement: HTMLElement | null): void {
    const isBreadcrumbChanged = state.hoveredBreadcrumbField !== breadcrumbElement;
    const isThreadingChanged = state.hoveredThreadingField !== threadingElement || (threadingElement !== null && (state.active?.kind !== 'dom' || state.active.element !== threadingElement));
    const needsBreadcrumb = breadcrumbElement !== null && (isBreadcrumbChanged || state.popover === null);
    const needsTree = needsBreadcrumb || (threadingElement !== null && isThreadingChanged);
    const roots = needsTree ? buildPropertyFieldForest(metadataContainer) : [];
    const nodes = needsTree ? flattenPropertyFieldForest(roots) : [];
    const breadcrumbNode = breadcrumbElement === null ? undefined : nodes.find((candidate) => candidate.element === breadcrumbElement);
    const threadingNode = threadingElement === null ? undefined : nodes.find((candidate) => candidate.element === threadingElement);

    if (isBreadcrumbChanged) {
      state.hoveredBreadcrumbField = breadcrumbNode === undefined ? null : breadcrumbElement;
      if (breadcrumbNode === undefined) {
        if (state.popover !== null) {
          this.schedulePopoverHide(ownerDocument);
        }
      } else if (breadcrumbElement !== null) {
        const anchor = breadcrumbElement.querySelector<HTMLElement>(':scope > .metadata-property-key') ?? breadcrumbElement;
        this.showDomBreadcrumb(ownerDocument, roots, breadcrumbNode, anchor);
      }
    } else if (needsBreadcrumb && breadcrumbNode !== undefined && breadcrumbElement !== null) {
      const anchor = breadcrumbElement.querySelector<HTMLElement>(':scope > .metadata-property-key') ?? breadcrumbElement;
      this.showDomBreadcrumb(ownerDocument, roots, breadcrumbNode, anchor);
    } else if (breadcrumbElement !== null) {
      this.cancelPopoverHide(ownerDocument);
    }

    if (threadingElement === null) {
      if (state.hoveredThreadingField !== null) {
        this.clearHoverThreading(ownerDocument, state);
      }
      return;
    }
    if (!isThreadingChanged) {
      return;
    }
    if (threadingNode === undefined) {
      this.clearHoverThreading(ownerDocument, state);
      return;
    }
    state.hoveredThreadingField = threadingElement;
    state.sourceHighlight?.classList.remove('np-property-field-source-highlight');
    state.sourceHighlight = null;
    state.active = { container: metadataContainer, element: threadingElement, kind: 'dom' };
    this.scheduleRender(ownerDocument);
  }

  private updateSourcePointerActivation(
    ownerDocument: Document,
    state: DocumentState,
    sourceTarget: { node: SourcePropertyFieldNode; roots: SourcePropertyFieldNode[]; view: MarkdownView },
    breadcrumbLine: HTMLElement | null,
    threadingLine: HTMLElement | null
  ): void {
    const isBreadcrumbChanged = state.hoveredBreadcrumbField !== breadcrumbLine;
    if (isBreadcrumbChanged) {
      state.hoveredBreadcrumbField = breadcrumbLine;
      if (breadcrumbLine === null) {
        if (state.popover !== null) {
          this.schedulePopoverHide(ownerDocument);
        }
      } else {
        this.showSourceBreadcrumb(ownerDocument, sourceTarget.roots, sourceTarget.node, breadcrumbLine, sourceTarget.view);
      }
    } else if (breadcrumbLine !== null && state.popover === null) {
      this.showSourceBreadcrumb(ownerDocument, sourceTarget.roots, sourceTarget.node, breadcrumbLine, sourceTarget.view);
    } else if (breadcrumbLine !== null) {
      this.cancelPopoverHide(ownerDocument);
    }

    if (threadingLine === null) {
      if (state.hoveredThreadingField !== null) {
        this.clearHoverThreading(ownerDocument, state);
      }
      return;
    }
    const isThreadingChanged = state.hoveredThreadingField !== threadingLine || state.active?.kind !== 'source' || state.active.line !== sourceTarget.node.line;
    if (isThreadingChanged) {
      state.hoveredThreadingField = threadingLine;
      state.active = { kind: 'source', line: sourceTarget.node.line, roots: sourceTarget.roots, view: sourceTarget.view };
      this.highlightSourceLine(ownerDocument, threadingLine);
      this.scheduleRender(ownerDocument);
    }
  }

  private onPropertyEditorChanged(ownerDocument: Document, event: Event): void {
    const target = event.target;
    if (target instanceof ownerDocument.defaultView!.Element) {
      const container = target.closest<HTMLElement>(METADATA_CONTAINER_SELECTOR);
      if (container !== null) {
        const state = this.documentStates.get(ownerDocument);
        if (state !== undefined) {
          const view = this.findMarkdownView(ownerDocument, container);
          state.lastPropertyEditorView = view;
          if (view !== null && state.propertyEditStart === null && isPropertyEditorTarget(target)) {
            state.propertyEditStart = { before: view.editor.getValue(), view };
          }
          this.schedulePropertyEditCapture(ownerDocument, state);
        }
        this.invalidateContainer(container);
      }
    }
  }

  private onFocusIn(ownerDocument: Document, event: FocusEvent): void {
    const target = event.target;
    if (!(target instanceof ownerDocument.defaultView!.Element)) {
      return;
    }
    const propertyElement = target.closest<HTMLElement>('.metadata-property');
    const metadataContainer = propertyElement?.closest<HTMLElement>('.metadata-container') ?? null;
    const state = this.documentStates.get(ownerDocument);
    if (metadataContainer !== null && state !== undefined) {
      const view = this.findMarkdownView(ownerDocument, metadataContainer);
      state.lastPropertyEditorView = view;
      if (view !== null && isPropertyEditorTarget(target)) {
        state.propertyEditStart = { before: view.editor.getValue(), view };
      }
    }
    if (!this.pluginSettingsComponent.settings.isActiveCursorPropertyFieldThreadingEnabled || propertyElement === null || !this.isMainThreadingEnabled(detectViewMode(propertyElement))) {
      return;
    }
    if (propertyElement !== null && metadataContainer !== null && state !== undefined) {
      state.active = { container: metadataContainer, element: propertyElement, kind: 'dom' };
      this.scheduleRender(ownerDocument);
    }
  }

  private onKeyDown(ownerDocument: Document, event: KeyboardEvent): void {
    if (!isRedoShortcut(event) || event.repeat) {
      return;
    }
    const activeElement = ownerDocument.activeElement;
    if (activeElement instanceof ownerDocument.defaultView!.Element && !shouldUsePropertyRedoFallback(activeElement)) {
      return;
    }
    const state = this.documentStates.get(ownerDocument);
    const view = state?.lastPropertyEditorView;
    const win = ownerDocument.defaultView;
    if (state === undefined || view === null || view === undefined || win === null || !view.containerEl.isConnected) {
      return;
    }
    const beforeRedo = view.editor.getValue();
    if (state.redoFallbackTimer !== null) {
      win.clearTimeout(state.redoFallbackTimer);
    }
    // Let Obsidian's own Ctrl+Y command run first. If its metadata-field history bridge did not
    // Mutate the document, try the Markdown editor and finally replay the exact captured edit.
    state.redoFallbackTimer = win.setTimeout(() => {
      if (!applyRedoFallback(view.editor, beforeRedo)) {
        state.redoFallbackTimer = null;
        return;
      }
      state.redoFallbackTimer = win.setTimeout(() => {
        state.redoFallbackTimer = null;
        if (view.editor.getValue() === beforeRedo && state.lastPropertyEdit?.view === view) {
          applyRecordedPropertyEditRedo(view.editor, state.lastPropertyEdit);
        }
      }, REDO_FALLBACK_DELAY_IN_MILLISECONDS);
    }, REDO_FALLBACK_DELAY_IN_MILLISECONDS);
  }

  private onFocusOut(ownerDocument: Document, event: FocusEvent): void {
    const target = event.target;
    const state = this.documentStates.get(ownerDocument);
    if (target instanceof ownerDocument.defaultView!.Element && target.closest(METADATA_CONTAINER_SELECTOR) !== null && state !== undefined) {
      this.schedulePropertyEditCapture(ownerDocument, state);
    }
    if (!this.pluginSettingsComponent.settings.isActiveCursorPropertyFieldThreadingEnabled) {
      return;
    }
    const related = event.relatedTarget;
    if (related instanceof ownerDocument.defaultView!.Element && related.closest('.metadata-property') !== null) {
      return;
    }
    if (state?.active?.kind === 'dom') {
      state.active = null;
      this.scheduleRender(ownerDocument);
    }
  }

  private onEditorCursorChanged(ownerDocument: Document): void {
    const settings = this.pluginSettingsComponent.settings;
    if (!this.isMainThreadingEnabled('source') || !settings.isActiveCursorPropertyFieldThreadingEnabled) {
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
    if (node === null) {
      state.sourceHighlight?.classList.remove('np-property-field-source-highlight');
      state.sourceHighlight = null;
    } else {
      this.highlightVisibleSourceLine(ownerDocument, view, node.line);
    }
    if (state.popover !== null && node !== null) {
      this.showSourceBreadcrumb(ownerDocument, roots, node, ownerDocument.activeElement instanceof HTMLElement ? ownerDocument.activeElement : view.containerEl, view);
    }
    this.scheduleRender(ownerDocument);
  }

  private schedulePropertyEditCapture(ownerDocument: Document, state: DocumentState, attempt = 0): void {
    const editStart = state.propertyEditStart;
    const win = ownerDocument.defaultView;
    if (editStart === null || win === null) {
      return;
    }
    if (state.propertyEditCaptureTimer !== null) {
      win.clearTimeout(state.propertyEditCaptureTimer);
    }
    const delay = PROPERTY_EDIT_CAPTURE_DELAYS_IN_MILLISECONDS[attempt] ?? PROPERTY_EDIT_CAPTURE_DELAYS_IN_MILLISECONDS.at(-1)!;
    state.propertyEditCaptureTimer = win.setTimeout(() => {
      state.propertyEditCaptureTimer = null;
      if (state.propertyEditStart !== editStart || !editStart.view.containerEl.isConnected) {
        return;
      }
      const after = editStart.view.editor.getValue();
      if (after !== editStart.before) {
        state.lastPropertyEdit = { ...editStart, after };
        return;
      }
      if (attempt + 1 < PROPERTY_EDIT_CAPTURE_DELAYS_IN_MILLISECONDS.length) {
        this.schedulePropertyEditCapture(ownerDocument, state, attempt + 1);
      }
    }, delay);
  }

  private scheduleRender(ownerDocument: Document): void {
    const state = this.documentStates.get(ownerDocument);
    const win = ownerDocument.defaultView;
    if (!this.app.workspace.layoutReady || state === undefined || win === null || state.renderFrame !== null) {
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
    for (const container of getShownMetadataContainers(ownerDocument)) {
      const active = state.active?.kind === 'dom' && state.active.container === container ? state.active : null;
      const activeElement = active?.element ?? null;
      const mode = detectViewMode(container);
      const width = Math.max(container.scrollWidth, container.clientWidth);
      const height = Math.max(container.scrollHeight, container.clientHeight);
      const snapshot = this.containerRenderSnapshots.get(container);
      if (isContainerRenderCurrent(snapshot, state.renderGeneration, width, height, activeElement)) {
        continue;
      }
      this.renderContainer(container, active, width, height, mode);
      this.containerRenderSnapshots.set(container, {
        activeElement,
        generation: state.renderGeneration,
        height,
        width
      });
    }
    for (const sourceView of getShownSourceViews(ownerDocument)) {
      this.renderSourceView(sourceView, state);
    }
  }

  private renderContainer(container: HTMLElement, active: ActiveDomField | null, width: number, height: number, mode: ViewMode): void {
    const existingOverlay = container.querySelector(':scope > .np-property-tree-overlay');
    for (const element of container.querySelectorAll<HTMLElement>('.np-property-field-active')) {
      element.classList.remove('np-property-field-active');
    }
    const roots = buildPropertyFieldForest(container);
    const nodes = flattenVisiblePropertyFieldForest(roots);
    for (const node of nodes) {
      if (!node.element.classList.contains('np-property-tree-node')) {
        node.element.classList.add('np-property-tree-node');
      }
      const depth = String(node.depth);
      if (node.element.style.getPropertyValue('--np-property-depth') !== depth) {
        node.element.style.setProperty('--np-property-depth', depth);
      }
    }
    const settings = this.pluginSettingsComponent.settings;
    const showStatic = this.isMainStaticGuidesEnabled(mode);
    const showThreads = active !== null && this.isMainThreadingEnabled(mode);
    if (nodes.length === 0 || (!showStatic && !showThreads)) {
      existingOverlay?.remove();
      return;
    }

    const svg = container.ownerDocument.createElementNS(SVG_NAMESPACE, 'svg');
    svg.classList.add('np-property-tree-overlay');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    function commitOverlay(): void {
      if (existingOverlay === null) {
        container.prepend(svg);
      } else {
        existingOverlay.replaceWith(svg);
      }
    }
    const metrics = createNodeMetrics(container, nodes);
    const readNumber = createCssNumberReader(container);
    if (showStatic) {
      this.drawForest(svg, roots, metrics, 'np-property-guide-static', readNumber);
    }
    if (!showThreads || active === null) {
      commitOverlay();
      return;
    }
    const activeNode = nodes.find((node) => node.element === active.element);
    if (activeNode === undefined) {
      commitOverlay();
      return;
    }
    activeNode.keyElement.classList.add('np-property-field-active');
    const activeRoot = getPropertyFieldRoot(activeNode);

    if (settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInMainUiEnabled && settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled) {
      this.drawForest(svg, roots, metrics, 'np-property-thread-root-all', readNumber);
    } else if (settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActivePropertyFieldTreeThreadingInMainUiEnabled) {
      this.drawForest(svg, [activeRoot], metrics, 'np-property-thread-all', readNumber);
    }

    if (settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isActiveRootLevelPropertyFieldThreadingEnabled && settings.isActiveRootLevelPropertyFieldThreadingInMainUiEnabled) {
      this.drawRootPath(svg, roots, activeRoot, metrics, readNumber);
    }
    if (settings.isActivePropertyFieldThreadingEnabled && settings.isActivePropertyFieldThreadingInMainUiEnabled) {
      this.drawActivePath(svg, activeNode, metrics, readNumber);
    }
    commitOverlay();
  }

  private renderSourceView(sourceView: HTMLElement, state: DocumentState): void {
    const existingOverlay = sourceView.querySelector(':scope > .np-property-source-overlay');
    const showStatic = this.isMainStaticGuidesEnabled('source');
    const showThreads = state.active?.kind === 'source' && this.isMainThreadingEnabled('source');
    if (!showStatic && !showThreads) {
      existingOverlay?.remove();
      sourceView.classList.remove('np-property-source-overlay-host');
      return;
    }
    const view = this.findMarkdownView(sourceView.ownerDocument, sourceView);
    if (view === null) {
      existingOverlay?.remove();
      sourceView.classList.remove('np-property-source-overlay-host');
      return;
    }
    const source = view.editor.getValue();
    const roots = parseSourcePropertyFields(source);
    const nodes = flattenPropertyFieldForest(roots);
    const metrics = createSourceNodeMetrics(sourceView, view, source, nodes);
    if (metrics.size === 0) {
      existingOverlay?.remove();
      sourceView.classList.remove('np-property-source-overlay-host');
      return;
    }

    sourceView.classList.add('np-property-source-overlay-host');
    const svg = sourceView.ownerDocument.createElementNS(SVG_NAMESPACE, 'svg');
    svg.classList.add('np-property-source-overlay');
    svg.setAttribute('aria-hidden', 'true');
    const width = sourceView.clientWidth;
    const height = sourceView.clientHeight;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${String(width)} ${String(height)}`);
    const readNumber = createCssNumberReader(sourceView);
    if (showStatic) {
      this.drawForest(svg, roots, metrics, 'np-property-guide-static', readNumber);
    }
    const active = showThreads && state.active?.kind === 'source' && state.active.view === view
      ? findSourcePropertyNodeAtLine(roots, state.active.line)
      : null;
    if (active !== null) {
      const settings = this.pluginSettingsComponent.settings;
      const activeRoot = getPropertyFieldRoot(active);
      if (settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInMainUiEnabled && settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled) {
        this.drawForest(svg, roots, metrics, 'np-property-thread-root-all', readNumber);
      } else if (settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActivePropertyFieldTreeThreadingInMainUiEnabled) {
        this.drawForest(svg, [activeRoot], metrics, 'np-property-thread-all', readNumber);
      }
      if (settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isActiveRootLevelPropertyFieldThreadingEnabled && settings.isActiveRootLevelPropertyFieldThreadingInMainUiEnabled) {
        this.drawRootPath(svg, roots, activeRoot, metrics, readNumber);
      }
      if (settings.isActivePropertyFieldThreadingEnabled && settings.isActivePropertyFieldThreadingInMainUiEnabled) {
        this.drawActivePath(svg, active, metrics, readNumber);
      }
    }
    if (existingOverlay === null) {
      sourceView.append(svg);
    } else {
      existingOverlay.replaceWith(svg);
    }
  }

  private drawForest<T extends { children: T[]; depth: number }>(svg: SVGSVGElement, roots: T[], metrics: Map<T, Point>, className: string, readNumber: CssNumberReader): void {
    const visit = (siblings: T[]): void => {
      const visibleSiblings = siblings.filter((sibling) => metrics.has(sibling));
      if (visibleSiblings.length > 0) {
        this.drawSiblingGroup(svg, visibleSiblings, metrics, className, readNumber);
      }
      for (const sibling of siblings) {
        visit(sibling.children);
      }
    };
    visit(roots);
  }

  private drawSiblingGroup<T extends { depth: number }>(svg: SVGSVGElement, siblings: T[], metrics: Map<T, Point>, className: string, readNumber: CssNumberReader): void {
    const isThread = className.startsWith('np-property-thread-');
    const isBreadcrumb = svg.classList.contains('np-property-breadcrumb-guides');
    const fieldGap = readNumber(isThread ? '--np-thread-field-gap' : '--np-guide-field-gap', 4);
    const verticalOffset = readNumber(isThread ? '--np-thread-vertical-offset' : '--np-guide-vertical-offset', 0);
    const points = siblings
      .map((node) => metrics.get(node))
      .filter((point): point is Point => point !== undefined)
      .map((point) => ({ x: point.x - fieldGap, y: point.y + verticalOffset }));
    if (points.length === 0) {
      return;
    }
    const connectorLength = readNumber(isBreadcrumb ? '--np-breadcrumb-connector-length' : isThread ? '--np-thread-connector-length' : '--np-guide-connector-length', 18);
    const firstRise = readNumber('--np-guide-first-branch-rise', 10);
    const spineX = Math.min(...points.map((point) => point.x)) - connectorLength;
    const firstY = points[0]?.y ?? 0;
    const lastY = points.at(-1)?.y ?? firstY;
    appendPath(svg, `M ${spineX} ${firstY - firstRise} V ${lastY}`, className, siblings[0]?.depth ?? 0);
    for (const point of points) {
      appendPath(svg, `M ${spineX} ${point.y} H ${point.x}`, className, siblings[0]?.depth ?? 0);
    }
  }

  private drawActivePath<T extends { depth: number; parent: null | T }>(svg: SVGSVGElement, activeNode: T, metrics: Map<T, Point>, readNumber: CssNumberReader): void {
    const ancestors = getPropertyFieldAncestors(activeNode);
    const connectorLength = readNumber('--np-thread-connector-length', 28);
    const fieldGap = readNumber('--np-thread-field-gap', 4);
    const radius = readNumber('--np-thread-corner-radius', 8);
    const verticalOffset = readNumber('--np-thread-vertical-offset', 0);
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
      const startY = parentPoint?.y ?? point.y - readNumber('--np-guide-first-branch-rise', 10);
      appendPath(svg, buildRoundedPath({ endX: point.x, endY: point.y, radius, startX: spineX, startY }), 'np-property-thread-active', node.depth);
    }
  }

  private drawRootPath<T extends { depth: number }>(svg: SVGSVGElement, roots: T[], activeRoot: T, metrics: Map<T, Point>, readNumber: CssNumberReader): void {
    const rawActivePoint = metrics.get(activeRoot);
    const rawFirstPoint = roots[0] === undefined ? undefined : metrics.get(roots[0]);
    if (rawActivePoint === undefined || rawFirstPoint === undefined) {
      return;
    }
    const connectorLength = readNumber('--np-thread-connector-length', 28);
    const fieldGap = readNumber('--np-thread-field-gap', 4);
    const radius = readNumber('--np-thread-corner-radius', 8);
    const verticalOffset = readNumber('--np-thread-vertical-offset', 0);
    const activePoint = { x: rawActivePoint.x - fieldGap, y: rawActivePoint.y + verticalOffset };
    const firstPoint = { x: rawFirstPoint.x - fieldGap, y: rawFirstPoint.y + verticalOffset };
    appendPath(
      svg,
      buildRoundedPath({
        endX: activePoint.x,
        endY: activePoint.y,
        radius,
        startX: Math.min(...roots.map((root) => (metrics.get(root)?.x ?? rawActivePoint.x) - fieldGap)) - connectorLength,
        startY: firstPoint.y - readNumber('--np-guide-first-branch-rise', 10)
      }),
      'np-property-thread-root-active',
      0
    );
  }

  private showDomBreadcrumb(ownerDocument: Document, roots: PropertyFieldNode[], current: PropertyFieldNode, anchor: HTMLElement): void {
    const settings = this.pluginSettingsComponent.settings;
    const isBreadcrumbThreadingEnabled = settings.isPropertyFieldThreadingEnabled && settings.isPropertyFieldThreadingInHoverBreadcrumbEnabled;
    const root = getPropertyFieldRoot(current);
    const nodes = isBreadcrumbThreadingEnabled && settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInHoverBreadcrumbEnabled
      ? flattenPropertyFieldForest(roots)
      : isBreadcrumbThreadingEnabled && settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActivePropertyFieldTreeThreadingInHoverBreadcrumbEnabled
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
      if (!settings.isActiveCursorPropertyFieldThreadingEnabled && this.isMainThreadingEnabled(detectViewMode(node.element))) {
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
    const isBreadcrumbThreadingEnabled = settings.isPropertyFieldThreadingEnabled && settings.isPropertyFieldThreadingInHoverBreadcrumbEnabled;
    const root = getPropertyFieldRoot(current);
    const nodes = isBreadcrumbThreadingEnabled && settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInHoverBreadcrumbEnabled
      ? flattenPropertyFieldForest(roots)
      : isBreadcrumbThreadingEnabled && settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActivePropertyFieldTreeThreadingInHoverBreadcrumbEnabled
      ? flattenPropertyFieldForest([root])
      : getPropertyFieldAncestors(current);
    this.showBreadcrumb(ownerDocument, createBreadcrumbEntries(nodes, current), anchor, (node) => {
      view.editor.setCursor({ ch: node.column, line: node.line });
      view.editor.focus();
    }, (node) => {
      if (!settings.isActiveCursorPropertyFieldThreadingEnabled && this.isMainThreadingEnabled('source')) {
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
    svg.setAttribute('viewBox', `0 0 ${String(tree.scrollWidth)} ${String(tree.scrollHeight)}`);
    tree.prepend(svg);
    const metrics = new Map<T, Point>();
    const readNumber = createCssNumberReader(tree);
    for (const [index, entry] of entries.entries()) {
      const row = rows[index];
      if (row === undefined) {
        continue;
      }
      const depth = entry.node.depth;
      const guideInset = Math.max(readNumber('--np-guide-field-gap', 4), readNumber('--np-thread-field-gap', 4)) + 4;
      metrics.set(entry.node, {
        x: readNumber('--np-breadcrumb-indent', 18) * depth + readNumber('--np-breadcrumb-connector-length', 12) + guideInset,
        y: row.offsetTop + row.offsetHeight / 2
      });
    }
    const entrySet = new Set(entries.map((entry) => entry.node));
    const roots = entries.filter((entry) => entry.node.parent === null || !entrySet.has(entry.node.parent)).map((entry) => entry.node);
    if (isStaticEnabled) {
      this.drawForest(svg, roots, metrics, 'np-property-guide-breadcrumb', readNumber);
    }
    if (!isThreadingEnabled) {
      return;
    }
    const current = entries.find((entry) => entry.current)?.node;
    if (current === undefined) {
      return;
    }
    const currentRoot = getPropertyFieldRoot(current);
    if (settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActiveRootLevelPropertyFieldTreeThreadingInHoverBreadcrumbEnabled) {
      this.drawForest(svg, roots, metrics, 'np-property-thread-root-all', readNumber);
    } else if (settings.isAllBranchesOfActivePropertyFieldTreeThreadingEnabled && settings.isAllBranchesOfActivePropertyFieldTreeThreadingInHoverBreadcrumbEnabled) {
      this.drawForest(svg, [currentRoot], metrics, 'np-property-thread-all', readNumber);
    }
    if (settings.isActiveRootLevelPropertyFieldTreeThreadingEnabled && settings.isActiveRootLevelPropertyFieldThreadingEnabled && settings.isActiveRootLevelPropertyFieldThreadingInHoverBreadcrumbEnabled) {
      this.drawGenericBreadcrumbPath(svg, [currentRoot], metrics, 'np-property-thread-root-active', readNumber);
    }
    if (settings.isActivePropertyFieldThreadingEnabled && settings.isActivePropertyFieldThreadingInHoverBreadcrumbEnabled) {
      this.drawGenericBreadcrumbPath(svg, getPropertyFieldAncestors(current), metrics, 'np-property-thread-active', readNumber);
    }
  }

  private drawGenericBreadcrumbPath<T extends { depth: number }>(svg: SVGSVGElement, nodes: T[], metrics: Map<T, Point>, className: string, readNumber: CssNumberReader): void {
    const connectorLength = readNumber('--np-breadcrumb-connector-length', 12);
    const fieldGap = readNumber('--np-thread-field-gap', 4);
    const radius = readNumber('--np-thread-corner-radius', 8);
    const verticalOffset = readNumber('--np-thread-vertical-offset', 0);
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
          startY: parentPoint?.y ?? point.y - readNumber('--np-guide-first-branch-rise', 10)
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
    const readNumber = createCssNumberReader(popover);
    const anchorGap = readNumber('--np-breadcrumb-anchor-gap', 8);
    const viewportGap = readNumber('--np-breadcrumb-viewport-gap', 8);
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
    if (state === undefined || win === null || state.popover === null) {
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

  private getBreadcrumbActivationScope(): BreadcrumbActivationScope {
    const settings = this.pluginSettingsComponent.settings;
    return resolveBreadcrumbActivationScope(settings.isFullWidthPropertyFieldHoverActivationEnabled, settings.isFullWidthPropertyKeyHoverActivationEnabled);
  }

  private isMainStaticGuidesEnabled(mode: ViewMode): boolean {
    const settings = this.pluginSettingsComponent.settings;
    return settings.isNestedPropertiesMainUiStaticTreeIndentationGuidesEnabled && (mode === 'live-preview'
      ? settings.isNestedPropertiesMainUiStaticTreeIndentationGuidesInLivePreviewEnabled
      : mode === 'source'
      ? settings.isNestedPropertiesMainUiStaticTreeIndentationGuidesInSourceModeEnabled
      : settings.isNestedPropertiesMainUiStaticTreeIndentationGuidesInReadingModeEnabled);
  }

  private isMainThreadingEnabled(mode: ViewMode): boolean {
    const settings = this.pluginSettingsComponent.settings;
    return settings.isPropertyFieldThreadingEnabled && settings.isPropertyFieldThreadingInMainUiEnabled && (mode === 'live-preview'
      ? settings.isPropertyFieldThreadingInLivePreviewEnabled
      : mode === 'source'
      ? settings.isPropertyFieldThreadingInSourceModeEnabled
      : settings.isPropertyFieldThreadingInReadingModeEnabled);
  }

  private resolveSourceTarget(lineElement: HTMLElement, clientX: number, clientY: number): null | { node: SourcePropertyFieldNode; roots: SourcePropertyFieldNode[]; view: MarkdownView } {
    const view = this.findMarkdownView(lineElement.ownerDocument, lineElement);
    if (view === null) {
      return null;
    }
    const source = view.editor.getValue();
    const roots = parseSourcePropertyFields(source);
    const line = resolveSourceDocumentLineAtPointer(view, lineElement, clientX, clientY, source);
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
    const source = view.editor.getValue();
    const sourceLine = Array.from(view.containerEl.querySelectorAll<HTMLElement>('.cm-line')).find((line) => resolveSourceLine(line, source, lineNumber) === lineNumber);
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

export function isRedoShortcut(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>): boolean {
  return event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'y';
}

export function shouldUsePropertyRedoFallback(activeElement: Element | null): boolean {
  if (activeElement === null) {
    return true;
  }
  if (activeElement.matches('input, textarea')) {
    return false;
  }
  const editable = activeElement.closest<HTMLElement>('[contenteditable="true"]');
  if (editable === null) {
    return true;
  }
  return editable.classList.contains('cm-content') && editable.closest('.markdown-source-view.is-live-preview') !== null;
}

export function applyRedoFallback(editor: RedoCapableEditor, beforeRedo: string): boolean {
  if (editor.getValue() !== beforeRedo) {
    return false;
  }
  editor.redo();
  return true;
}

export function computeTextReplacement(before: string, after: string): TextReplacement | null {
  if (before === after) {
    return null;
  }
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }
  let suffixLength = 0;
  while (
    suffixLength < before.length - start
    && suffixLength < after.length - start
    && before[before.length - suffixLength - 1] === after[after.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }
  return {
    end: before.length - suffixLength,
    replacement: after.slice(start, after.length - suffixLength),
    start
  };
}

export function applyRecordedPropertyEditRedo(editor: TextEditingEditor, edit: Pick<PropertyEditTransaction, 'after' | 'before'>): boolean {
  if (editor.getValue() !== edit.before) {
    return false;
  }
  const replacement = computeTextReplacement(edit.before, edit.after);
  if (replacement === null) {
    return false;
  }
  editor.replaceRange(replacement.replacement, editor.offsetToPos(replacement.start), editor.offsetToPos(replacement.end));
  return true;
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

function createSourceNodeMetrics(sourceView: HTMLElement, view: MarkdownView, source: string, nodes: SourcePropertyFieldNode[]): Map<SourcePropertyFieldNode, Point> {
  const sourceViewRect = sourceView.getBoundingClientRect();
  const nodesByLine = new Map<number, SourcePropertyFieldNode[]>();
  for (const node of nodes) {
    const lineNodes = nodesByLine.get(node.line) ?? [];
    lineNodes.push(node);
    nodesByLine.set(node.line, lineNodes);
  }
  const metrics = new Map<SourcePropertyFieldNode, Point>();
  for (const lineElement of sourceView.querySelectorAll<HTMLElement>('.cm-line')) {
    const lineRect = lineElement.getBoundingClientRect();
    if (lineRect.height <= 0 || lineRect.bottom < sourceViewRect.top || lineRect.top > sourceViewRect.bottom) {
      continue;
    }
    const documentLine = resolveSourceDocumentLine(view, lineElement, source, view.editor.getCursor().line);
    for (const node of nodesByLine.get(documentLine) ?? []) {
      const range = createTextRange(lineElement, node.column, Math.min((lineElement.textContent ?? '').length, node.column + Math.max(1, node.key.length)));
      const rangeRect = range?.getBoundingClientRect();
      metrics.set(node, {
        x: (rangeRect?.width ?? 0) > 0 ? rangeRect!.left - sourceViewRect.left : lineRect.left - sourceViewRect.left + node.column * 8,
        y: lineRect.top - sourceViewRect.top + lineRect.height / 2
      });
    }
  }
  return metrics;
}

export function createCssNumberReader(element: Element): CssNumberReader {
  const styles = element.ownerDocument.defaultView?.getComputedStyle(element);
  const values = new Map<string, number>();
  function readNumber(variable: string, fallback: number): number {
    const cached = values.get(variable);
    if (cached !== undefined) {
      return Number.isFinite(cached) ? cached : fallback;
    }
    const parsed = Number.parseFloat(styles?.getPropertyValue(variable).trim() ?? '');
    values.set(variable, parsed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return readNumber;
}

export function flattenVisiblePropertyFieldForest(roots: PropertyFieldNode[]): PropertyFieldNode[] {
  const nodes: PropertyFieldNode[] = [];
  function visit(items: PropertyFieldNode[]): void {
    for (const item of items) {
      nodes.push(item);
      if (!item.element.classList.contains('is-collapsed')) {
        visit(item.children);
      }
    }
  }
  visit(roots);
  return nodes;
}

export function getShownMetadataContainers(ownerDocument: Document): HTMLElement[] {
  return Array.from(ownerDocument.querySelectorAll<HTMLElement>(METADATA_CONTAINER_SELECTOR)).filter((container) => container.isShown());
}

export function getShownSourceViews(ownerDocument: Document): HTMLElement[] {
  return Array.from(ownerDocument.querySelectorAll<HTMLElement>('.markdown-source-view:not(.is-live-preview)')).filter((view) => view.isShown());
}

export function isContainerRenderCurrent(snapshot: ContainerRenderSnapshot | undefined, generation: number, width: number, height: number, activeElement: HTMLElement | null): boolean {
  return snapshot?.generation === generation && snapshot.width === width && snapshot.height === height && snapshot.activeElement === activeElement;
}

function detectViewMode(element: Element): ViewMode {
  if (element.closest('.markdown-preview-view, .markdown-reading-view') !== null) {
    return 'reading';
  }
  const sourceView = element.closest('.markdown-source-view');
  return sourceView?.classList.contains('is-live-preview') === true ? 'live-preview' : sourceView === null ? 'live-preview' : 'source';
}

export function isPropertyFieldMutation(mutation: VisualMutation): boolean {
  const target = asElement(mutation.target);
  if (target?.closest(`${OWNED_VISUAL_SELECTOR}, .nested-properties-header-actions`) !== null) {
    return false;
  }
  const changed = [...mutation.addedNodes, ...mutation.removedNodes];
  const externalChanges = changed.filter((node) => !isOwnedVisualNode(node));
  if (changed.length > 0 && externalChanges.length === 0) {
    return false;
  }
  if (target?.closest(METADATA_CONTAINER_SELECTOR) !== null) {
    return true;
  }
  return externalChanges.some(touchesMetadataContainer);
}

export function isSourceEditorMutation(mutation: VisualMutation): boolean {
  const target = asElement(mutation.target);
  if (target?.closest(OWNED_VISUAL_SELECTOR) !== null) {
    return false;
  }
  if (target?.closest('.markdown-source-view:not(.is-live-preview) .cm-content') !== null) {
    return true;
  }
  return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
    const element = asElement(node);
    return element?.matches('.markdown-source-view:not(.is-live-preview), .markdown-source-view:not(.is-live-preview) .cm-line') === true
      || element?.querySelector(':scope .markdown-source-view:not(.is-live-preview), :scope .markdown-source-view:not(.is-live-preview) .cm-line') !== null;
  });
}

export function getPropertyFieldMutationContainers(mutation: VisualMutation): HTMLElement[] {
  const container = asElement(mutation.target)?.closest<HTMLElement>(METADATA_CONTAINER_SELECTOR) ?? null;
  return container === null ? [] : [container];
}

export function isPropertyVisualStyleMutation(mutation: VisualMutation): boolean {
  if (mutation.attributeName !== 'class' && mutation.attributeName !== 'style') {
    return false;
  }
  const target = asElement(mutation.target);
  if (target === null) {
    return false;
  }
  const currentValue = target.getAttribute(mutation.attributeName) ?? '';
  return getRelevantStyleAttributePart(mutation.attributeName, mutation.oldValue ?? '') !== getRelevantStyleAttributePart(mutation.attributeName, currentValue);
}

function asElement(node: Node): Element | null {
  return node.nodeType === node.ELEMENT_NODE ? node as Element : node.parentElement;
}

function isPropertyEditorTarget(target: Element): boolean {
  return target.matches('input, textarea, [contenteditable="true"]') || target.closest('[contenteditable="true"]') !== null;
}

function getRelevantStyleAttributePart(attributeName: 'class' | 'style', value: string): string {
  const separator = attributeName === 'class' ? /\s+/u : ';';
  const prefix = attributeName === 'class' ? 'np-' : '--np-';
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix))
    .sort()
    .join(';');
}

function isOwnedVisualNode(node: Node): boolean {
  const element = asElement(node);
  return element?.matches(OWNED_VISUAL_SELECTOR) === true || element?.closest(OWNED_VISUAL_SELECTOR) !== null;
}

function touchesMetadataContainer(node: Node): boolean {
  const element = asElement(node);
  return element?.matches(METADATA_CONTAINER_SELECTOR) === true || element?.closest(METADATA_CONTAINER_SELECTOR) !== null || element?.querySelector(METADATA_CONTAINER_SELECTOR) !== null;
}

function removeVisualArtifacts(ownerDocument: Document): void {
  for (const element of ownerDocument.querySelectorAll('.np-property-tree-overlay, .np-property-source-overlay, .np-property-breadcrumb-popover')) {
    element.remove();
  }
  for (const element of ownerDocument.querySelectorAll<HTMLElement>('.np-property-tree-node, .np-property-field-active, .np-property-field-popover-highlight, .np-property-field-source-highlight')) {
    element.classList.remove('np-property-tree-node', 'np-property-field-active', 'np-property-field-popover-highlight', 'np-property-field-source-highlight');
    element.style.removeProperty('--np-property-depth');
  }
  for (const element of ownerDocument.querySelectorAll('.np-property-source-overlay-host')) {
    element.classList.remove('np-property-source-overlay-host');
  }
}

export function resolveDomPropertyAtPointer(target: Element, clientX: number, clientY: number): HTMLElement | null {
  const container = resolveMetadataContainerAtPointer(target, clientX, clientY);
  if (container === null) {
    return null;
  }
  const directProperty = target.closest<HTMLElement>('.metadata-property');
  if (directProperty !== null && directProperty.closest(METADATA_CONTAINER_SELECTOR) === container) {
    const directRect = getDomPropertyDirectHitRect(directProperty);
    if (directRect !== null && clientY >= directRect.top && clientY <= directRect.bottom) {
      return directProperty;
    }
  }
  return findPropertyFieldHitEntryAtPointer(container, clientY)?.element ?? null;
}

export function resolveBreadcrumbActivationScope(isFullFieldEnabled: boolean, isFullKeyEnabled: boolean): BreadcrumbActivationScope {
  if (isFullFieldEnabled) {
    return 'field';
  }
  return isFullKeyEnabled ? 'key' : 'toggle';
}

export function resolveDomBreadcrumbPropertyAtPointer(target: Element, clientX: number, clientY: number, scope: BreadcrumbActivationScope): HTMLElement | null {
  if (scope === 'field') {
    return resolveDomPropertyAtPointer(target, clientX, clientY);
  }
  if (scope === 'toggle') {
    return target.closest<HTMLElement>('.metadata-property-icon, .nested-properties-collapse-btn')?.closest<HTMLElement>('.metadata-property') ?? null;
  }
  const directKey = target.closest<HTMLElement>('.metadata-property-key');
  const directProperty = directKey?.closest<HTMLElement>('.metadata-property') ?? null;
  if (directKey !== null && directProperty !== null && isClientPointWithinRect(directKey.getBoundingClientRect(), clientX, clientY)) {
    return directProperty;
  }
  const container = resolveMetadataContainerAtPointer(target, clientX, clientY);
  if (container === null) {
    return null;
  }
  const entry = findPropertyFieldHitEntryAtPointer(container, clientY);
  if (entry === null) {
    return null;
  }
  const containerRect = container.getBoundingClientRect();
  const relativeClientX = clientX - containerRect.left;
  return relativeClientX >= entry.keyLeft && relativeClientX <= entry.keyRight ? entry.element : null;
}

export function resolveSourceLineElementAtPointer(target: Element, clientX: number, clientY: number): HTMLElement | null {
  const directLine = target.closest<HTMLElement>('.cm-line');
  if (directLine !== null) {
    return directLine;
  }
  const sourceView = resolveSourceViewAtPointer(target, clientX, clientY);
  return sourceView === null ? null : findElementAtClientY(Array.from(sourceView.querySelectorAll<HTMLElement>('.cm-line')), clientY);
}

export function resolveSourceBreadcrumbLineAtPointer(target: Element, clientX: number, clientY: number, scope: BreadcrumbActivationScope): HTMLElement | null {
  if (scope === 'field') {
    return resolveSourceLineElementAtPointer(target, clientX, clientY);
  }
  if (scope === 'toggle') {
    return resolveSourceFoldToggleLineAtPointer(target, clientX, clientY);
  }
  const toggleLine = resolveSourceFoldToggleLineAtPointer(target, clientX, clientY);
  if (toggleLine !== null) {
    return toggleLine;
  }
  const line = resolveSourceLineElementAtPointer(target, clientX, clientY);
  return line !== null && isClientXWithinSourceKeyColumn(line, clientX) ? line : null;
}

export function getSourceKeyCharacterRange(text: string): null | { end: number; start: number } {
  let start = 0;
  while (/\s/u.test(text[start] ?? '')) {
    start += 1;
  }
  if (text[start] === '-') {
    const sequenceStart = start;
    start += 1;
    while (/\s/u.test(text[start] ?? '')) {
      start += 1;
    }
    if (start >= text.length) {
      return { end: sequenceStart + 1, start: sequenceStart };
    }
    const mappingColon = findYamlMappingColon(text, start);
    return mappingColon === -1 ? { end: sequenceStart + 1, start: sequenceStart } : { end: mappingColon + 1, start };
  }
  const mappingColon = findYamlMappingColon(text, start);
  return mappingColon === -1 ? null : { end: mappingColon + 1, start };
}

function findYamlMappingColon(text: string, start: number): number {
  let bracketDepth = 0;
  let quote: '"' | '\'' | null = null;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (quote !== null) {
      if (character === quote && (quote === '\'' || text[index - 1] !== '\\')) {
        quote = null;
      }
      continue;
    }
    switch (character) {
      case ':': {
        if (bracketDepth === 0) {
          return index;
        }
        break;
      }
      case '\'':
      case '"': {
        quote = character;
        break;
      }
      case '[':
      case '{': {
        bracketDepth += 1;
        break;
      }
      case ']':
      case '}': {
        bracketDepth = Math.max(0, bracketDepth - 1);
        break;
      }
      default: {
        break;
      }
    }
  }
  return -1;
}

function isClientXWithinSourceKeyColumn(line: HTMLElement, clientX: number): boolean {
  const characterRange = getSourceKeyCharacterRange(line.textContent ?? '');
  if (characterRange === null) {
    return false;
  }
  const range = createTextRange(line, characterRange.start, characterRange.end);
  if (range === null) {
    return false;
  }
  const rects = typeof range.getClientRects === 'function' ? Array.from(range.getClientRects()) : [];
  if (rects.length > 0) {
    const keyRight = Math.max(...rects.filter((rect) => rect.width > 0).map((rect) => rect.right));
    return Number.isFinite(keyRight) && clientX >= line.getBoundingClientRect().left && clientX <= keyRight;
  }
  const rect = range.getBoundingClientRect();
  return rect.width > 0 && clientX >= line.getBoundingClientRect().left && clientX <= rect.right;
}

function createTextRange(element: HTMLElement, start: number, end: number): Range | null {
  const range = element.ownerDocument.createRange();
  const win = element.ownerDocument.defaultView;
  if (win === null) {
    return null;
  }
  const walker = element.ownerDocument.createTreeWalker(element, win.NodeFilter.SHOW_TEXT);
  let characterOffset = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (startNode === null && start <= characterOffset + length) {
      startNode = node;
      startOffset = Math.max(0, start - characterOffset);
    }
    if (end <= characterOffset + length) {
      endNode = node;
      endOffset = Math.max(0, end - characterOffset);
      break;
    }
    characterOffset += length;
  }
  if (startNode === null || endNode === null) {
    return null;
  }
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function resolveSourceFoldToggleLineAtPointer(target: Element, clientX: number, clientY: number): HTMLElement | null {
  const directToggle = target.closest<HTMLElement>('.collapse-indicator, .cm-foldMarker, .cm-fold-indicator, [aria-label*="fold" i]');
  if (directToggle !== null) {
    return resolveSourceLineElementAtPointer(directToggle, clientX, clientY);
  }
  const gutterElement = target.closest<HTMLElement>('.cm-foldGutter .cm-gutterElement');
  if (gutterElement === null || (gutterElement.childNodes.length === 0 && gutterElement.textContent?.trim() === '')) {
    return null;
  }
  return resolveSourceLineElementAtPointer(gutterElement, clientX, clientY);
}

function resolveMetadataContainerAtPointer(target: Element, clientX: number, clientY: number): HTMLElement | null {
  const directContainer = target.closest<HTMLElement>(METADATA_CONTAINER_SELECTOR);
  if (directContainer !== null) {
    return directContainer;
  }
  return getShownMetadataContainers(target.ownerDocument)
    .filter((container) => isClientPointWithinRect(container.getBoundingClientRect(), clientX, clientY))
    .sort((left, right) => left.getBoundingClientRect().height - right.getBoundingClientRect().height)[0] ?? null;
}

function resolveSourceViewAtPointer(target: Element, clientX: number, clientY: number): HTMLElement | null {
  const directView = target.closest<HTMLElement>('.markdown-source-view');
  if (directView !== null) {
    return directView;
  }
  return Array.from(target.ownerDocument.querySelectorAll<HTMLElement>('.markdown-source-view'))
    .filter((view) => view.isShown() && isClientPointWithinRect(view.getBoundingClientRect(), clientX, clientY))
    .sort((left, right) => left.getBoundingClientRect().height - right.getBoundingClientRect().height)[0] ?? null;
}

function findPropertyFieldHitEntryAtPointer(container: HTMLElement, clientY: number): PropertyFieldHitEntry | null {
  const containerRect = container.getBoundingClientRect();
  const snapshot = getPropertyFieldHitSnapshot(container, containerRect);
  const relativeClientY = clientY - containerRect.top;
  return snapshot.entries.find((entry) => relativeClientY >= entry.top && relativeClientY <= entry.bottom) ?? null;
}

function getPropertyFieldHitSnapshot(container: HTMLElement, containerRect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>): PropertyFieldHitSnapshot {
  const cached = propertyFieldHitSnapshots.get(container);
  if (cached?.width === containerRect.width && cached.height === containerRect.height) {
    return cached;
  }
  const entries = flattenVisiblePropertyFieldForest(buildPropertyFieldForest(container))
    .map((node) => {
      const rect = getPropertyFieldHitRect(node);
      const keyRect = node.keyElement.getBoundingClientRect();
      return {
        bottom: rect.bottom - containerRect.top,
        depth: node.depth,
        element: node.element,
        height: rect.height,
        keyLeft: keyRect.left - containerRect.left,
        keyRight: keyRect.right - containerRect.left,
        top: rect.top - containerRect.top
      };
    })
    .filter((entry) => entry.height > 0)
    .sort((left, right) => left.height - right.height || right.depth - left.depth)
    .map(({ depth: _depth, height: _height, ...entry }) => entry);
  const snapshot = { entries, height: containerRect.height, width: containerRect.width };
  propertyFieldHitSnapshots.set(container, snapshot);
  return snapshot;
}

function getPropertyFieldHitRect(node: PropertyFieldNode): Pick<DOMRect, 'bottom' | 'height' | 'top'> {
  const keyRect = node.keyElement.getBoundingClientRect();
  if (node.children.length > 0 || node.valueElement === null) {
    return keyRect;
  }
  const valueRect = node.valueElement.getBoundingClientRect();
  const top = Math.min(keyRect.top, valueRect.top);
  const bottom = Math.max(keyRect.bottom, valueRect.bottom);
  return { bottom, height: bottom - top, top };
}

function getDomPropertyDirectHitRect(property: HTMLElement): Pick<DOMRect, 'bottom' | 'height' | 'top'> | null {
  const key = property.querySelector<HTMLElement>(':scope > .metadata-property-key');
  if (key === null) {
    return null;
  }
  const keyRect = key.getBoundingClientRect();
  const value = property.querySelector<HTMLElement>(':scope > .metadata-property-value');
  if (value?.querySelector(':scope .metadata-property') !== null) {
    return keyRect;
  }
  const valueRect = value.getBoundingClientRect();
  const top = Math.min(keyRect.top, valueRect.top);
  const bottom = Math.max(keyRect.bottom, valueRect.bottom);
  return { bottom, height: bottom - top, top };
}

function isClientPointWithinRect(rect: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>, clientX: number, clientY: number): boolean {
  return Number.isFinite(clientX) && Number.isFinite(clientY) && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

export function findElementAtClientY(elements: readonly HTMLElement[], clientY: number): HTMLElement | null {
  const candidates = elements
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.height > 0 && clientY >= rect.top && clientY <= rect.bottom)
    .sort((left, right) => left.rect.height - right.rect.height);
  return candidates[0]?.element ?? null;
}

export function resolveSourceLine(lineElement: HTMLElement, source: string, preferredLine: number): number {
  const explicitLine = Number(lineElement.dataset['line']);
  if (Number.isSafeInteger(explicitLine) && explicitLine >= 0) {
    return explicitLine;
  }
  const text = lineElement.textContent ?? '';
  const sourceLines = source.split(/\r?\n/u);
  const candidates: number[] = [];
  for (const [index, line] of sourceLines.entries()) {
    if (getSourceLineMatchScore(line, text) > 0) {
      candidates.push(index);
    }
  }
  if (candidates.length <= 1) {
    return candidates[0] ?? preferredLine;
  }
  const content = lineElement.closest('.cm-content');
  const visibleLines = content === null ? [lineElement] : Array.from(content.querySelectorAll<HTMLElement>('.cm-line'));
  const targetIndex = visibleLines.indexOf(lineElement);
  const scoredCandidates = candidates.map((candidate) => {
    let score = 0;
    for (let offset = -6; offset <= 6; offset++) {
      const visibleLine = visibleLines[targetIndex + offset];
      const sourceLine = sourceLines[candidate + offset];
      if (visibleLine === undefined || sourceLine === undefined) {
        continue;
      }
      const distanceWeight = 7 - Math.abs(offset);
      score += getSourceLineMatchScore(sourceLine, visibleLine.textContent ?? '') * distanceWeight;
    }
    return { candidate, score };
  });
  scoredCandidates.sort((left, right) => right.score - left.score || Math.abs(left.candidate - preferredLine) - Math.abs(right.candidate - preferredLine));
  return scoredCandidates[0]?.candidate ?? preferredLine;
}

function resolveSourceDocumentLineAtPointer(view: MarkdownView, lineElement: HTMLElement, clientX: number, clientY: number, source: string): number {
  const codeMirror = (view.editor as typeof view.editor & {
    cm?: {
      posAtCoords(point: Point, precise?: boolean): number | null;
      posAtDOM(node: Node, offset?: number): number;
    };
  }).cm;
  if (codeMirror !== undefined) {
    try {
      const offset = codeMirror.posAtDOM(lineElement, 0);
      if (Number.isSafeInteger(offset) && offset >= 0) {
        return view.editor.offsetToPos(offset).line;
      }
    } catch {
      // CodeMirror may replace a line between the pointer event and this lookup.
    }
    const rect = lineElement.getBoundingClientRect();
    const horizontalInset = Math.min(1, Math.max(0, rect.width / 2));
    const verticalInset = Math.min(1, Math.max(0, rect.height / 2));
    const x = Math.min(Math.max(clientX, rect.left + horizontalInset), rect.right - horizontalInset);
    const y = Math.min(Math.max(clientY, rect.top + verticalInset), rect.bottom - verticalInset);
    const offset = codeMirror.posAtCoords({ x, y }, false);
    if (offset !== null && Number.isSafeInteger(offset) && offset >= 0) {
      return view.editor.offsetToPos(offset).line;
    }
  }
  return resolveSourceLine(lineElement, source, view.editor.getCursor().line);
}

function resolveSourceDocumentLine(view: MarkdownView, lineElement: HTMLElement, source: string, preferredLine: number): number {
  const codeMirror = (view.editor as typeof view.editor & {
    cm?: {
      posAtDOM(node: Node, offset?: number): number;
    };
  }).cm;
  if (codeMirror !== undefined) {
    try {
      const offset = codeMirror.posAtDOM(lineElement, 0);
      if (Number.isSafeInteger(offset) && offset >= 0) {
        return view.editor.offsetToPos(offset).line;
      }
    } catch {
      // Fall back to visible-line matching if CodeMirror just replaced this DOM line.
    }
  }
  return resolveSourceLine(lineElement, source, preferredLine);
}

function getSourceLineMatchScore(sourceLine: string, visibleLine: string): number {
  if (sourceLine === visibleLine) {
    return 3;
  }
  return sourceLine.trim() === visibleLine.trim() ? 1 : 0;
}

/* eslint-enable @typescript-eslint/array-type, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/restrict-template-expressions, complexity, import-x/consistent-type-specifier-style, no-magic-numbers, no-restricted-syntax, obsidian-dev-utils/params-options-name-match, obsidian-dev-utils/readonly-params-options-result-members, perfectionist/sort-classes, perfectionist/sort-modules, perfectionist/sort-union-types, unicorn/consistent-boolean-name, unicorn/no-array-callback-reference, unicorn/no-nested-ternary, unicorn/no-unnecessary-nested-ternary, unicorn/prefer-spread -- Restore repository DOM rules. */
