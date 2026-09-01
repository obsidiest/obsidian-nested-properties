import type {
  MarkdownView,
  Plugin
} from 'obsidian';

import {
  ContextId,
  evalInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const TEST_NOTE_PATH = 'property-field-visuals.md';
const ROOT_KEY_BEFORE = 'historyRoot';
const vault = getTemporaryVault();

interface Context {
  markdownView: MarkdownView;
}

interface PropertyVisualSettings {
  isActiveCursorPropertyFieldThreadingEnabled: boolean;
  isActivePropertyFieldThreadingEnabled: boolean;
  isActivePropertyFieldThreadingInMainUiEnabled: boolean;
  isFullWidthPropertyFieldHoverActivationEnabled: boolean;
  isFullWidthPropertyKeyHoverActivationEnabled: boolean;
  isPropertyFieldHoverBreadcrumbEnabled: boolean;
  isPropertyFieldHoverBreadcrumbInLivePreviewEnabled: boolean;
  isPropertyFieldHoverBreadcrumbInSourceModeEnabled: boolean;
  isPropertyFieldThreadingEnabled: boolean;
  isPropertyFieldThreadingInLivePreviewEnabled: boolean;
  isPropertyFieldThreadingInMainUiEnabled: boolean;
  isPropertyFieldThreadingInSourceModeEnabled: boolean;
}

interface TestPlugin extends Plugin {
  pluginSettingsComponent: TestPluginSettingsComponent;
}

interface TestPluginSettingsComponent {
  editAndSave(editor: (settings: PropertyVisualSettings) => void): Promise<void>;
}

const contextId = new ContextId<Context>();

function createLongFrontmatter(): string {
  const filler = Array.from({ length: 70 }, (_value, index) => `filler${String(index).padStart(2, '0')}: value`).join('\n');
  return `---
${ROOT_KEY_BEFORE}: original
flat.object: flattened
nested:
  child:
    leaf: value
${filler}
---

Body
`;
}

beforeAll(async () => {
  vault.populate({
    [TEST_NOTE_PATH]: createLongFrontmatter()
  });
  await evalInObsidian({
    callback: async ({ app, context, lib: { waitUntil } }) => {
      const file = app.vault.getFileByPath('property-field-visuals.md');
      if (file === null) {
        throw new Error('Property visuals fixture was not found');
      }
      const leaf = app.workspace.getLeaf(true);
      await leaf.setViewState({
        state: {
          file: file.path,
          mode: 'source',
          source: false
        },
        type: 'markdown'
      });
      const markdownView = app.workspace.getActiveFileView();
      if (markdownView?.getViewType() !== 'markdown') {
        throw new Error('Markdown view did not open');
      }
      context.markdownView = markdownView as MarkdownView;
      await waitUntil({
        message: 'Live Preview Properties editor did not render',
        predicate: () => markdownView.containerEl.querySelector(':scope .metadata-container .metadata-property-key-input') !== null,
        timeoutInMilliseconds: 15_000
      });
    },
    contextId,
    vaultPath: vault.path
  });
});

afterAll(async () => {
  await contextId.dispose();
});

describe('property-field visuals in real Obsidian', () => {
  it('owns escaped Live Preview property undo and redo without changing scroll', async () => {
    const result = await evalInObsidian({
      callback: async ({ context: { markdownView }, lib: { clickElement, pressKey, waitUntil } }) => {
        const ownerDocument = markdownView.containerEl.ownerDocument;
        const sourceView = markdownView.containerEl.querySelector<HTMLElement>('.markdown-source-view.is-live-preview');
        const inputs = [...markdownView.containerEl.querySelectorAll<HTMLInputElement>('.metadata-property-key-input')];
        const input = inputs.find((candidate) => candidate.value === 'historyRoot');
        if (sourceView === null || input === undefined) {
          throw new Error('Live Preview history fixture did not render');
        }
        const scroller = sourceView.querySelector<HTMLElement>('.cm-scroller');
        if (scroller === null) {
          throw new Error('Live Preview scroller was not found');
        }

        scroller.scrollTop = 0;
        clickElement({ element: input });
        pressKey({ key: 'a', modifiers: ['Ctrl'] });
        for (const character of 'historyRootRenamed') {
          pressKey({ key: character });
        }
        pressKey({ key: 'Escape' });
        await waitUntil({
          message: 'Property-key edit did not commit after Escape',
          predicate: () => markdownView.editor.getValue().includes('historyRootRenamed: original')
        });
        const scrollTopBeforeHistory = scroller.scrollTop;

        pressKey({ key: 'z', modifiers: ['Ctrl'] });
        await waitUntil({
          message: 'Ctrl+Z did not undo the escaped property edit',
          predicate: () => markdownView.editor.getValue().includes('historyRoot: original')
        });
        const scrollTopAfterUndo = scroller.scrollTop;

        pressKey({ key: 'y', modifiers: ['Ctrl'] });
        await waitUntil({
          message: 'Ctrl+Y did not redo the escaped property edit',
          predicate: () => markdownView.editor.getValue().includes('historyRootRenamed: original')
        });
        const scrollTopAfterRedo = scroller.scrollTop;

        return {
          activeElementClass: ownerDocument.activeElement?.className ?? '',
          scrollTopAfterRedo,
          scrollTopAfterUndo,
          scrollTopBeforeHistory
        };
      },
      contextId,
      vaultPath: vault.path
    });

    expect(Math.abs(result.scrollTopAfterUndo - result.scrollTopBeforeHistory)).toBeLessThanOrEqual(2);
    expect(Math.abs(result.scrollTopAfterRedo - result.scrollTopBeforeHistory)).toBeLessThanOrEqual(2);
  });

  it('activates threading and each breadcrumb scope on its exact Live Preview surface', async () => {
    const result = await evalInObsidian({
      callback: async ({ app, context: { markdownView }, lib: { moveMouse, waitUntil } }) => {
        const plugin = app.plugins.getPlugin('nested-properties-advanced');
        if (plugin === null) {
          throw new Error('Nested Properties Advanced is not enabled');
        }
        const testPlugin = plugin as TestPlugin;
        async function setScope(isFieldScopeEnabled: boolean, isKeyScopeEnabled: boolean): Promise<void> {
          await testPlugin.pluginSettingsComponent.editAndSave((settings) => {
            settings.isActiveCursorPropertyFieldThreadingEnabled = false;
            settings.isActivePropertyFieldThreadingEnabled = true;
            settings.isActivePropertyFieldThreadingInMainUiEnabled = true;
            settings.isFullWidthPropertyFieldHoverActivationEnabled = isFieldScopeEnabled;
            settings.isFullWidthPropertyKeyHoverActivationEnabled = isKeyScopeEnabled;
            settings.isPropertyFieldHoverBreadcrumbEnabled = true;
            settings.isPropertyFieldHoverBreadcrumbInLivePreviewEnabled = true;
            settings.isPropertyFieldThreadingEnabled = true;
            settings.isPropertyFieldThreadingInLivePreviewEnabled = true;
            settings.isPropertyFieldThreadingInMainUiEnabled = true;
          });
        }
        const ownerDocument = markdownView.containerEl.ownerDocument;
        const sourceView = markdownView.containerEl.querySelector<HTMLElement>('.markdown-source-view.is-live-preview');
        const propertyRows = [...markdownView.containerEl.querySelectorAll<HTMLElement>('.metadata-property')];
        const property = propertyRows.find((row) => row.querySelector<HTMLInputElement>(':scope > .metadata-property-key .metadata-property-key-input')?.value === 'flat.object');
        const keyElement = property?.querySelector<HTMLElement>(':scope > .metadata-property-key');
        const icon = keyElement?.querySelector<HTMLElement>('.metadata-property-icon');
        if (sourceView === null || property === undefined || keyElement === null || keyElement === undefined || icon === null || icon === undefined) {
          throw new Error('Live Preview pointer fixture did not render');
        }
        const rowRect = keyElement.getBoundingClientRect();
        const sourceRect = sourceView.getBoundingClientRect();
        const farRightX = sourceRect.right - 24;
        const rowY = (rowRect.top + rowRect.bottom) / 2;
        function isPopoverVisible(): boolean {
          return ownerDocument.querySelector('.np-property-breadcrumb-popover') !== null;
        }
        function isThreadActive(): boolean {
          return ownerDocument.querySelector('.np-property-thread-active, .np-property-thread-all, .np-property-thread-root-active, .np-property-thread-root-all') !== null;
        }
        async function waitForPopover(message: string): Promise<void> {
          await waitUntil({ message, predicate: isPopoverVisible });
        }
        async function waitForPopoverToHide(message: string): Promise<void> {
          await waitUntil({ message, predicate: () => !isPopoverVisible() });
        }

        await setScope(true, false);
        moveMouse({ x: farRightX, y: rowY });
        await waitForPopover('Full-field hover did not show its breadcrumb');
        await waitUntil({ message: 'Full-row hover did not activate property threading', predicate: isThreadActive });
        const isFullFieldActivated = isPopoverVisible() && isThreadActive();

        moveMouse({ x: sourceRect.right - 24, y: Math.min(sourceRect.bottom - 12, rowRect.bottom + 60) });
        await waitForPopoverToHide('Full-field breadcrumb did not deactivate after leaving its row');

        await setScope(false, true);
        const keyRect = keyElement.getBoundingClientRect();
        moveMouse({ x: (keyRect.left + keyRect.right) / 2, y: rowY });
        await waitForPopover('Full-key hover did not show its breadcrumb');
        const isFullKeyActivated = isPopoverVisible();
        moveMouse({ x: Math.min(sourceRect.right - 24, keyRect.right + 80), y: rowY });
        await waitForPopoverToHide('Full-key breadcrumb remained active outside the property key');
        const isFullKeyDeactivated = !isPopoverVisible();

        await setScope(false, false);
        const iconRect = (icon.querySelector('svg') ?? icon).getBoundingClientRect();
        moveMouse({ x: (iconRect.left + iconRect.right) / 2, y: (iconRect.top + iconRect.bottom) / 2 });
        await waitForPopover('Icon-only hover did not show its breadcrumb');
        const isIconActivated = isPopoverVisible();
        moveMouse({ x: Math.min(sourceRect.right - 24, iconRect.right + 60), y: rowY });
        await waitForPopoverToHide('Icon-only breadcrumb remained active outside the property icon');
        const isIconDeactivated = !isPopoverVisible();

        return {
          fullFieldActivated: isFullFieldActivated,
          fullKeyActivated: isFullKeyActivated,
          fullKeyDeactivated: isFullKeyDeactivated,
          iconActivated: isIconActivated,
          iconDeactivated: isIconDeactivated
        };
      },
      contextId,
      vaultPath: vault.path
    });

    expect(result).toEqual({
      fullFieldActivated: true,
      fullKeyActivated: true,
      fullKeyDeactivated: true,
      iconActivated: true,
      iconDeactivated: true
    });
  });

  it('activates root and flattened Source fields across the editor width', async () => {
    const result = await evalInObsidian({
      callback: async ({ app, context: { markdownView }, lib: { moveMouse, waitUntil } }) => {
        const plugin = app.plugins.getPlugin('nested-properties-advanced');
        if (plugin === null) {
          throw new Error('Nested Properties Advanced is not enabled');
        }
        const testPlugin = plugin as TestPlugin;
        await testPlugin.pluginSettingsComponent.editAndSave((settings) => {
          settings.isActiveCursorPropertyFieldThreadingEnabled = false;
          settings.isFullWidthPropertyFieldHoverActivationEnabled = true;
          settings.isFullWidthPropertyKeyHoverActivationEnabled = false;
          settings.isPropertyFieldHoverBreadcrumbEnabled = true;
          settings.isPropertyFieldHoverBreadcrumbInSourceModeEnabled = true;
          settings.isPropertyFieldThreadingEnabled = true;
          settings.isPropertyFieldThreadingInMainUiEnabled = true;
          settings.isPropertyFieldThreadingInSourceModeEnabled = true;
        });
        const leaf = markdownView.leaf;
        await leaf.setViewState({
          state: {
            file: markdownView.file?.path,
            mode: 'source',
            source: true
          },
          type: 'markdown'
        });
        await waitUntil({
          message: 'Source mode did not render',
          predicate: () => markdownView.containerEl.querySelector(':scope .markdown-source-view:not(.is-live-preview) .cm-line') !== null
        });
        const ownerDocument = markdownView.containerEl.ownerDocument;
        const sourceView = markdownView.containerEl.querySelector<HTMLElement>('.markdown-source-view:not(.is-live-preview)');
        if (sourceView === null) {
          throw new Error('Source view was not found');
        }
        const activeSourceView = sourceView;
        const sourceRect = sourceView.getBoundingClientRect();
        async function isLineActivated(text: string, expectedBreadcrumbText: string): Promise<boolean> {
          const line = [...activeSourceView.querySelectorAll<HTMLElement>('.cm-line')].find((candidate) => candidate.textContent.includes(text));
          if (line === undefined) {
            throw new Error(`Source line was not found: ${text}`);
          }
          const rect = line.getBoundingClientRect();
          moveMouse({ x: sourceRect.right - 24, y: (rect.top + rect.bottom) / 2 });
          await waitUntil({
            message: `Source breadcrumb did not activate for ${text}`,
            predicate: () => ownerDocument.querySelector<HTMLElement>('.np-property-breadcrumb-popover')?.textContent.includes(expectedBreadcrumbText) === true
          });
          return ownerDocument.querySelector('.np-property-field-source-highlight') === line;
        }

        const rootKey = markdownView.editor.getValue().includes('historyRootRenamed:') ? 'historyRootRenamed' : 'historyRoot';

        return {
          flattened: await isLineActivated('flat.object:', 'flat.object'),
          root: await isLineActivated(`${rootKey}:`, rootKey)
        };
      },
      contextId,
      vaultPath: vault.path
    });

    expect(result).toEqual({ flattened: true, root: true });
  });
});
