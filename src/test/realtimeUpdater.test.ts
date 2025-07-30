import * as assert from 'assert';
import * as vscode from 'vscode';
import { RealtimeUpdater } from '../realtimeUpdater';
import { FileWatcher, DecorationProvider, SettingsManager, CacheManager } from '../interfaces';
import { IncrementalAnalyzer } from '../incrementalAnalyzer';
import { VariableResolverImpl } from '../variableResolver';
import { DynamicModeHandlerImpl } from '../dynamicModeHandler';
import { ColorValue } from '../types';

suite('RealtimeUpdater Tests', () => {
  let realtimeUpdater: RealtimeUpdater;
  let mockFileWatcher: MockFileWatcher;
  let mockDecorationProvider: MockDecorationProvider;
  let mockSettingsManager: MockSettingsManager;
  let mockCacheManager: MockCacheManager;
  let mockIncrementalAnalyzer: MockIncrementalAnalyzer;
  let mockVariableResolver: MockVariableResolver;
  let mockDynamicModeHandler: MockDynamicModeHandler;

  setup(() => {
    mockFileWatcher = new MockFileWatcher();
    mockDecorationProvider = new MockDecorationProvider();
    mockSettingsManager = new MockSettingsManager();
    mockCacheManager = new MockCacheManager();
    mockIncrementalAnalyzer = new MockIncrementalAnalyzer();
    mockVariableResolver = new MockVariableResolver();
    mockDynamicModeHandler = new MockDynamicModeHandler();

    realtimeUpdater = new RealtimeUpdater(
      mockFileWatcher,
      mockDecorationProvider,
      mockSettingsManager,
      mockCacheManager,
      mockIncrementalAnalyzer,
      mockVariableResolver as any,
      mockDynamicModeHandler as any
    );
  });

  teardown(() => {
    realtimeUpdater.dispose();
  });

  suite('Basic Functionality', () => {
    test('should start and stop updates', () => {
      assert.strictEqual(realtimeUpdater.getStats().isActive, false);

      realtimeUpdater.start();
      assert.strictEqual(realtimeUpdater.getStats().isActive, true);
      assert.strictEqual(mockFileWatcher.isWatching, true);

      realtimeUpdater.stop();
      assert.strictEqual(realtimeUpdater.getStats().isActive, false);
      assert.strictEqual(mockFileWatcher.isWatching, false);
    });

    test('should not start multiple times', () => {
      realtimeUpdater.start();
      const stats1 = realtimeUpdater.getStats();

      realtimeUpdater.start(); // Should not start again
      const stats2 = realtimeUpdater.getStats();

      assert.strictEqual(stats1.isActive, stats2.isActive);
    });

    test('should handle stop when not started', () => {
      assert.doesNotThrow(() => {
        realtimeUpdater.stop();
      });
    });
  });

  suite('Document Processing', () => {
    test('should process enabled file types', () => {
      mockSettingsManager.enabled = true;
      mockSettingsManager.enabledFileTypes = ['css', 'scss'];

      const cssDocument = createMockDocument('test.css', 'css');
      const jsDocument = createMockDocument('test.js', 'javascript');

      assert.strictEqual((realtimeUpdater as any).shouldProcessDocument(cssDocument), true);
      assert.strictEqual((realtimeUpdater as any).shouldProcessDocument(jsDocument), false);
    });

    test('should not process when disabled', () => {
      mockSettingsManager.enabled = false;

      const cssDocument = createMockDocument('test.css', 'css');

      assert.strictEqual((realtimeUpdater as any).shouldProcessDocument(cssDocument), false);
    });

    test('should force update specific document', () => {
      realtimeUpdater.start();
      
      const document = createMockDocument('test.css', 'css');
      const editor = createMockEditor(document);

      // Mock visible editors
      const originalVisibleTextEditors = vscode.window.visibleTextEditors;
      (vscode.window as any).visibleTextEditors = [editor];

      realtimeUpdater.forceUpdate(document);

      // Should have called decoration provider
      assert.ok(mockDecorationProvider.applyDecorationsCalled);

      // Restore original
      (vscode.window as any).visibleTextEditors = originalVisibleTextEditors;
    });
  });

  suite('Event Handling', () => {
    test('should handle document content changes', () => {
      realtimeUpdater.start();

      const document = createMockDocument('test.css', 'css');
      const editor = createMockEditor(document);

      // Mock visible editors
      const originalVisibleTextEditors = vscode.window.visibleTextEditors;
      (vscode.window as any).visibleTextEditors = [editor];

      const changeEvent = {
        document,
        contentChanges: [{
          range: new vscode.Range(0, 0, 0, 10),
          rangeOffset: 0,
          text: 'color: red;',
          rangeLength: 10
        }],
        reason: undefined
      } as vscode.TextDocumentChangeEvent;

      (realtimeUpdater as any).handleDocumentContentChange(changeEvent);

      // Should have processed incremental change
      assert.ok(mockIncrementalAnalyzer.processIncrementalChangeCalled);

      // Restore original
      (vscode.window as any).visibleTextEditors = originalVisibleTextEditors;
    });

    test('should handle file changes from FileWatcher', () => {
      realtimeUpdater.start();

      const document = createMockDocument('test.css', 'css');
      const editor = createMockEditor(document);

      // Mock visible editors
      const originalVisibleTextEditors = vscode.window.visibleTextEditors;
      (vscode.window as any).visibleTextEditors = [editor];

      // Trigger file change
      mockFileWatcher.triggerFileChange(document.uri);

      // Should have invalidated caches
      assert.ok(mockCacheManager.invalidateCalled);
      assert.ok(mockIncrementalAnalyzer.invalidateDocumentCalled);

      // Restore original
      (vscode.window as any).visibleTextEditors = originalVisibleTextEditors;
    });

    test('should handle settings changes', () => {
      realtimeUpdater.start();

      // Trigger settings change
      mockSettingsManager.triggerSettingsChange();

      // Should have cleared caches
      assert.ok(mockCacheManager.clearCalled);
      assert.ok(mockIncrementalAnalyzer.clearCacheCalled);
      assert.ok(mockDecorationProvider.updateDecorationStylesCalled);
    });
  });

  suite('Statistics and Monitoring', () => {
    test('should provide accurate statistics', () => {
      const stats = realtimeUpdater.getStats();

      assert.strictEqual(typeof stats.isActive, 'boolean');
      assert.strictEqual(typeof stats.pendingUpdates, 'number');
      assert.strictEqual(typeof stats.cachedEditors, 'number');
    });

    test('should track pending updates', async () => {
      realtimeUpdater.start();
      mockSettingsManager.debounceDelay = 100;

      const document = createMockDocument('test.css', 'css');
      const editor = createMockEditor(document);

      // Schedule update
      (realtimeUpdater as any).scheduleUpdate(editor, false);

      const stats = realtimeUpdater.getStats();
      assert.strictEqual(stats.pendingUpdates, 1);

      // Wait for update to complete
      await new Promise(resolve => setTimeout(resolve, 150));

      const statsAfter = realtimeUpdater.getStats();
      assert.strictEqual(statsAfter.pendingUpdates, 0);
    });
  });

  suite('Decoration Creation', () => {
    test('should create decorations for color matches', async () => {
      const document = createMockDocument('test.css', 'css');
      const analysisResult = {
        colorMatches: [{
          value: '#ff0000',
          range: new vscode.Range(0, 0, 0, 7),
          colorValue: { hex: '#ff0000', rgb: { r: 255, g: 0, b: 0 }, hsl: { h: 0, s: 100, l: 50 }, original: '#ff0000', isValid: true }
        }],
        variableDefinitions: [],
        variableUsages: []
      };

      mockSettingsManager._showDirectColors = true;

      const decorations = await (realtimeUpdater as any).createDecorations(document, analysisResult);

      assert.strictEqual(decorations.length, 1);
      assert.ok(mockDecorationProvider.createColorChipCalled);
    });

    test('should create decorations for variable definitions', async () => {
      const document = createMockDocument('test.css', 'css');
      const analysisResult = {
        colorMatches: [],
        variableDefinitions: [{
          name: '--primary',
          value: '#ff0000',
          range: new vscode.Range(0, 0, 0, 20),
          type: 'css-custom-property' as const
        }],
        variableUsages: []
      };

      mockSettingsManager._showVariableDefinitions = true;
      mockDynamicModeHandler.mockResolveResult = { hex: '#ff0000', rgb: { r: 255, g: 0, b: 0 }, hsl: { h: 0, s: 100, l: 50 }, original: '#ff0000', isValid: true };

      const decorations = await (realtimeUpdater as any).createDecorations(document, analysisResult);

      assert.strictEqual(decorations.length, 1);
      assert.ok(mockDecorationProvider.createVariableColorChipCalled);
    });

    test('should create decorations for undefined variables', async () => {
      const document = createMockDocument('test.css', 'css');
      const analysisResult = {
        colorMatches: [],
        variableDefinitions: [],
        variableUsages: [{
          name: '--undefined',
          range: new vscode.Range(0, 0, 0, 15),
          type: 'css-var' as const,
          fallbackValue: '#000000'
        }]
      };

      mockSettingsManager._showVariableUsages = true;
      mockDynamicModeHandler.mockResolveResult = null; // Undefined variable

      const decorations = await (realtimeUpdater as any).createDecorations(document, analysisResult);

      assert.strictEqual(decorations.length, 1);
      assert.ok(mockDecorationProvider.createUndefinedVariableDecorationCalled);
    });
  });

  suite('Error Handling', () => {
    test('should handle update errors gracefully', async () => {
      realtimeUpdater.start();
      mockSettingsManager.enableDebugLogging = () => true;

      const document = createMockDocument('test.css', 'css');
      const editor = createMockEditor(document);

      // Make incremental analyzer throw error
      mockIncrementalAnalyzer.shouldThrow = true;

      assert.doesNotThrow(async () => {
        await (realtimeUpdater as any).updateEditor(editor, true);
      });
    });

    test('should handle dispose multiple times', () => {
      realtimeUpdater.start();

      assert.doesNotThrow(() => {
        realtimeUpdater.dispose();
        realtimeUpdater.dispose(); // Should not throw on second dispose
      });

      assert.strictEqual(realtimeUpdater.getStats().isActive, false);
    });
  });
});

// Mock classes and helper functions

class MockFileWatcher implements FileWatcher {
  isWatching = false;
  private callbacks: ((uri: vscode.Uri) => void)[] = [];

  startWatching(): void {
    this.isWatching = true;
  }

  stopWatching(): void {
    this.isWatching = false;
  }

  onFileChanged(callback: (uri: vscode.Uri) => void): void {
    this.callbacks.push(callback);
  }

  triggerFileChange(uri: vscode.Uri): void {
    this.callbacks.forEach(callback => callback(uri));
  }
}

class MockDecorationProvider implements DecorationProvider {
  createColorChipCalled = false;
  createVariableColorChipCalled = false;
  createUndefinedVariableDecorationCalled = false;
  applyDecorationsCalled = false;
  updateDecorationStylesCalled = false;

  createColorChip(): vscode.DecorationOptions {
    this.createColorChipCalled = true;
    return { range: new vscode.Range(0, 0, 0, 0) };
  }

  createVariableColorChip(): vscode.DecorationOptions {
    this.createVariableColorChipCalled = true;
    return { range: new vscode.Range(0, 0, 0, 0) };
  }

  createMultipleColorChips(): vscode.DecorationOptions {
    return { range: new vscode.Range(0, 0, 0, 0) };
  }

  createCompactMultipleChips(): vscode.DecorationOptions[] {
    return [];
  }

  createStackedColorChips(): vscode.DecorationOptions {
    return { range: new vscode.Range(0, 0, 0, 0) };
  }

  createUndefinedVariableDecoration(): vscode.DecorationOptions {
    this.createUndefinedVariableDecorationCalled = true;
    return { range: new vscode.Range(0, 0, 0, 0) };
  }

  applyDecorations(): void {
    this.applyDecorationsCalled = true;
  }

  clearDecorations(): void {}

  updateDecorationStyles(): void {
    this.updateDecorationStylesCalled = true;
  }

  dispose(): void {}
}

class MockSettingsManager implements SettingsManager {
  enabled = true;
  enabledFileTypes = ['css', 'scss'];
  debounceDelay = 300;
  _showDirectColors = true;
  _showVariableDefinitions = true;
  _showVariableUsages = true;
  private callbacks: (() => void)[] = [];

  getDisplayMode() { return 'default' as const; }
  getEnabledFileTypes() { return this.enabledFileTypes; }
  getVariableResolutionScope() { return 'workspace' as const; }
  getChipSize() { return 'medium' as const; }
  isEnabled() { return this.enabled; }
  showVariableDefinitions() { return this._showVariableDefinitions; }
  showVariableUsages() { return this._showVariableUsages; }
  showDirectColors() { return this._showDirectColors; }
  getMaxColorsInMultipleMode() { return 5; }
  enableHoverInfo() { return true; }
  enableDebugLogging() { return false; }
  getCacheSizeLimit() { return 100; }
  getDebounceDelay() { return this.debounceDelay; }
  getCustomThemePaths() { return []; }
  
  onSettingsChanged(callback: () => void): void {
    this.callbacks.push(callback);
  }

  triggerSettingsChange(): void {
    this.callbacks.forEach(callback => callback());
  }

  async updateSetting() {}
  async resetToDefaults() {}
  getAllSettings() { return {}; }
  validateSettings() { return []; }
  dispose() {}
}

class MockCacheManager implements CacheManager {
  invalidateCalled = false;
  clearCalled = false;

  get(): any | null { return null; }
  set(): void {}
  
  invalidate(): void {
    this.invalidateCalled = true;
  }
  
  clear(): void {
    this.clearCalled = true;
  }
}

class MockIncrementalAnalyzer extends IncrementalAnalyzer {
  processIncrementalChangeCalled = false;
  invalidateDocumentCalled = false;
  clearCacheCalled = false;
  shouldThrow = false;

  constructor() {
    super(null as any, null as any);
  }

  analyzeVisibleRegions(): any {
    if (this.shouldThrow) {
      throw new Error('Mock analyzer error');
    }
    return {
      colorMatches: [],
      variableDefinitions: [],
      variableUsages: []
    };
  }

  processIncrementalChange(): any {
    this.processIncrementalChangeCalled = true;
    return {};
  }

  getAnalysisResult(): any {
    return null;
  }

  invalidateDocument(): void {
    this.invalidateDocumentCalled = true;
  }

  clearCache(): void {
    this.clearCacheCalled = true;
  }
}

class MockVariableResolver {
  resolveCSSVariable(): ColorValue | null {
    return null;
  }

  resolveSCSSVariable(): ColorValue | null {
    return null;
  }
}

class MockDynamicModeHandler {
  mockResolveResult: ColorValue | ColorValue[] | null = null;

  resolveVariableColor(): ColorValue | ColorValue[] | null {
    return this.mockResolveResult;
  }

  invalidateDocumentCache(): void {}
  clearCaches(): void {}
}

function createMockDocument(fileName: string, languageId: string): vscode.TextDocument {
  return {
    uri: vscode.Uri.file(`/test/${fileName}`),
    fileName,
    languageId,
    version: 1,
    getText: () => '.test { color: #ff0000; }',
    lineCount: 1
  } as vscode.TextDocument;
}

function createMockEditor(document: vscode.TextDocument): vscode.TextEditor {
  return {
    document,
    selection: new vscode.Selection(0, 0, 0, 0),
    selections: [new vscode.Selection(0, 0, 0, 0)],
    visibleRanges: [new vscode.Range(0, 0, 0, 21)],
    options: {
      cursorStyle: vscode.TextEditorCursorStyle.Line,
      insertSpaces: true,
      lineNumbers: vscode.TextEditorLineNumbersStyle.On,
      tabSize: 2
    },
    viewColumn: vscode.ViewColumn.One,
    edit: async () => true,
    insertSnippet: async () => true,
    setDecorations: () => {},
    revealRange: () => {},
    show: () => {},
    hide: () => {}
  } as vscode.TextEditor;
}