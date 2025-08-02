import * as assert from 'assert';
import * as vscode from 'vscode';
import { DynamicModeHandlerImpl } from '../dynamicModeHandler';
import { SettingsManager } from '../interfaces';
import { ColorValue, DisplayMode } from '../types';
import { ColorValueImpl } from '../colorValue';

suite('DynamicModeHandler Tests', () => {
  let handler: DynamicModeHandlerImpl;
  let mockSettingsManager: MockSettingsManager;
  let mockDocument: vscode.TextDocument;

  setup(() => {
    mockSettingsManager = new MockSettingsManager();
    handler = new DynamicModeHandlerImpl(mockSettingsManager);
    mockDocument = createMockDocument();
  });

  teardown(() => {
    handler.clearCaches();
  });

  suite('Default Mode', () => {
    test('should return default value in default mode', () => {
      mockSettingsManager.displayMode = 'default';
      const defaultColor = ColorValueImpl.fromString('#ff0000')!;

      const result = handler.resolveVariableColor('--primary', defaultColor, mockDocument);

      assert.strictEqual(result, defaultColor);
    });

    test('should return null when no default value in default mode', () => {
      mockSettingsManager.displayMode = 'default';

      const result = handler.resolveVariableColor('--primary', null, mockDocument);

      assert.strictEqual(result, null);
    });
  });

  suite('Computed Mode', () => {
    test('should return computed value when available', () => {
      mockSettingsManager.displayMode = 'computed';
      const defaultColor = ColorValueImpl.fromString('#ff0000')!;

      // Mock active color theme using Object.defineProperty
      const originalDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'activeColorTheme');
      Object.defineProperty(vscode.window, 'activeColorTheme', {
        value: { kind: vscode.ColorThemeKind.Dark },
        configurable: true
      });

      const result = handler.resolveVariableColor('--primary', defaultColor, mockDocument);

      // Should return computed value for --primary in dark theme
      assert.ok(result);
      assert.strictEqual((result as ColorValue).hex, '#007acc');

      // Restore original property
      if (originalDescriptor) {
        Object.defineProperty(vscode.window, 'activeColorTheme', originalDescriptor);
      }
    });

    test('should fallback to default when computed value not available', () => {
      mockSettingsManager.displayMode = 'computed';
      const defaultColor = ColorValueImpl.fromString('#ff0000')!;

      const result = handler.resolveVariableColor('--unknown-var', defaultColor, mockDocument);

      assert.strictEqual(result, defaultColor);
    });
  });

  suite('Multiple Mode', () => {
    test('should return array of possible values', () => {
      mockSettingsManager.displayMode = 'multiple';
      mockSettingsManager.maxColorsInMultipleMode = 5;
      const defaultColor = ColorValueImpl.fromString('#ff0000')!;

      // Mock active color theme using Object.defineProperty
      const originalDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'activeColorTheme');
      Object.defineProperty(vscode.window, 'activeColorTheme', {
        value: { kind: vscode.ColorThemeKind.Dark },
        configurable: true
      });

      const result = handler.resolveVariableColor('--primary', defaultColor, mockDocument);

      assert.ok(Array.isArray(result));
      assert.ok((result as ColorValue[]).length > 0);
      
      // Should include default color
      const colors = result as ColorValue[];
      assert.ok(colors.some(color => color.hex === defaultColor.hex));

      // Restore original property
      if (originalDescriptor) {
        Object.defineProperty(vscode.window, 'activeColorTheme', originalDescriptor);
      }
    });

    test('should limit colors to max setting', () => {
      mockSettingsManager.displayMode = 'multiple';
      mockSettingsManager.maxColorsInMultipleMode = 2;
      const defaultColor = ColorValueImpl.fromString('#ff0000')!;

      const result = handler.resolveVariableColor('--primary', defaultColor, mockDocument);

      assert.ok(Array.isArray(result));
      assert.ok((result as ColorValue[]).length <= 2);
    });

    test('should deduplicate identical colors', () => {
      mockSettingsManager.displayMode = 'multiple';
      mockSettingsManager.maxColorsInMultipleMode = 5;
      const defaultColor = ColorValueImpl.fromString('#007acc')!; // Same as computed value

      // Mock active color theme to return same color as default
      const originalDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'activeColorTheme');
      Object.defineProperty(vscode.window, 'activeColorTheme', {
        value: { kind: vscode.ColorThemeKind.Dark },
        configurable: true
      });

      const result = handler.resolveVariableColor('--primary', defaultColor, mockDocument);

      assert.ok(Array.isArray(result));
      const colors = result as ColorValue[];
      
      // Should not have duplicates
      const uniqueHexValues = new Set(colors.map(c => c.hex.toLowerCase()));
      assert.strictEqual(colors.length, uniqueHexValues.size);

      // Restore original property
      if (originalDescriptor) {
        Object.defineProperty(vscode.window, 'activeColorTheme', originalDescriptor);
      }
    });
  });

  suite('Theme Variants', () => {
    test('should return empty array when no theme variants found', () => {
      const variants = handler.getThemeVariants('--unknown-variable');

      assert.ok(Array.isArray(variants));
      assert.strictEqual(variants.length, 0);
    });

    test('should handle custom theme paths', () => {
      mockSettingsManager.customThemePaths = ['custom-theme.css'];

      const variants = handler.getThemeVariants('--primary');

      // Should not throw and return array
      assert.ok(Array.isArray(variants));
    });
  });

  suite('Computed Values', () => {
    test('should return computed value for dark theme', () => {
      // Mock active color theme using Object.defineProperty
      const originalDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'activeColorTheme');
      Object.defineProperty(vscode.window, 'activeColorTheme', {
        value: { kind: vscode.ColorThemeKind.Dark },
        configurable: true
      });

      const result = handler.getComputedValue('--primary', mockDocument);

      assert.ok(result);
      assert.strictEqual(result.hex, '#007acc');

      // Restore original property
      if (originalDescriptor) {
        Object.defineProperty(vscode.window, 'activeColorTheme', originalDescriptor);
      }
    });

    test('should return computed value for light theme', () => {
      // Mock active color theme using Object.defineProperty
      const originalDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'activeColorTheme');
      Object.defineProperty(vscode.window, 'activeColorTheme', {
        value: { kind: vscode.ColorThemeKind.Light },
        configurable: true
      });

      const result = handler.getComputedValue('--background', mockDocument);

      assert.ok(result);
      assert.strictEqual(result.hex, '#ffffff');

      // Restore original property
      if (originalDescriptor) {
        Object.defineProperty(vscode.window, 'activeColorTheme', originalDescriptor);
      }
    });

    test('should return computed value for high contrast theme', () => {
      // Mock active color theme using Object.defineProperty
      const originalDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'activeColorTheme');
      Object.defineProperty(vscode.window, 'activeColorTheme', {
        value: { kind: vscode.ColorThemeKind.HighContrast },
        configurable: true
      });

      const result = handler.getComputedValue('--foreground', mockDocument);

      assert.ok(result);
      assert.strictEqual(result.hex, '#ffffff');

      // Restore original property
      if (originalDescriptor) {
        Object.defineProperty(vscode.window, 'activeColorTheme', originalDescriptor);
      }
    });

    test('should return null for unknown variables', () => {
      const result = handler.getComputedValue('--unknown-variable', mockDocument);

      assert.strictEqual(result, null);
    });

    test('should cache computed values', () => {
      // Mock active color theme using Object.defineProperty
      const originalDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'activeColorTheme');
      Object.defineProperty(vscode.window, 'activeColorTheme', {
        value: { kind: vscode.ColorThemeKind.Dark },
        configurable: true
      });

      const result1 = handler.getComputedValue('--primary', mockDocument);
      const result2 = handler.getComputedValue('--primary', mockDocument);

      assert.strictEqual(result1, result2); // Should be same instance due to caching

      // Restore original property
      if (originalDescriptor) {
        Object.defineProperty(vscode.window, 'activeColorTheme', originalDescriptor);
      }
    });
  });

  suite('Cache Management', () => {
    test('should clear all caches', () => {
      // Populate cache
      handler.getComputedValue('--primary', mockDocument);

      handler.clearCaches();

      // Cache should be cleared - this is hard to test directly,
      // but we can verify it doesn't throw
      assert.doesNotThrow(() => {
        handler.clearCaches();
      });
    });

    test('should invalidate document-specific cache', () => {
      const documentUri = mockDocument.uri.toString();

      // Populate cache
      handler.getComputedValue('--primary', mockDocument);

      handler.invalidateDocumentCache(documentUri);

      // Should not throw
      assert.doesNotThrow(() => {
        handler.invalidateDocumentCache(documentUri);
      });
    });
  });

  suite('Error Handling', () => {
    test('should handle invalid theme paths gracefully', () => {
      mockSettingsManager.customThemePaths = ['non-existent-file.css'];

      assert.doesNotThrow(() => {
        handler.getThemeVariants('--primary');
      });
    });

    test('should handle missing workspace folders', () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: undefined,
        configurable: true
      });

      assert.doesNotThrow(() => {
        handler.getThemeVariants('--primary');
      });

      // Restore original property
      if (originalDescriptor) {
        Object.defineProperty(vscode.workspace, 'workspaceFolders', originalDescriptor);
      }
    });
  });
});

// Mock classes and helper functions

class MockSettingsManager implements SettingsManager {
  displayMode: DisplayMode = 'default';
  enabledFileTypes: string[] = ['css', 'scss'];
  variableResolutionScope: 'file' | 'workspace' = 'workspace';
  enabled: boolean = true;
  _showVariableDefinitions: boolean = true;
  _showVariableUsages: boolean = true;

  maxColorsInMultipleMode: number = 5;
  _enableHoverInfo: boolean = true;
  _enableDebugLogging: boolean = false;
  cacheSizeLimit: number = 100;
  debounceDelay: number = 300;
  customThemePaths: string[] = [];

  getDisplayMode() { return this.displayMode; }
  getEnabledFileTypes() { return this.enabledFileTypes; }
  getVariableResolutionScope() { return this.variableResolutionScope; }
  isEnabled() { return this.enabled; }
  showVariableDefinitions() { return this._showVariableDefinitions; }
  showVariableUsages() { return this._showVariableUsages; }
  getMaxColorsInMultipleMode() { return this.maxColorsInMultipleMode; }
  enableHoverInfo() { return this._enableHoverInfo; }
  enableDebugLogging() { return this._enableDebugLogging; }
  getCacheSizeLimit() { return this.cacheSizeLimit; }
  getDebounceDelay() { return this.debounceDelay; }
  getCustomThemePaths() { return this.customThemePaths; }
  onSettingsChanged() {}
  async updateSetting() {}
  async resetToDefaults() {}
  getAllSettings() { return {}; }
  validateSettings() { return []; }
  dispose() {}
}

function createMockDocument(): vscode.TextDocument {
  return {
    uri: vscode.Uri.parse('test://test.css'),
    fileName: 'test.css',
    languageId: 'css',
    version: 1,
    getText: () => ':root { --primary: #ff0000; }',
    lineCount: 1
  } as vscode.TextDocument;
}