import * as assert from 'assert';
import * as vscode from 'vscode';
import { SettingsManagerImpl } from '../settingsManager';
import { ErrorHandlerImpl } from '../errorHandler';

suite('SettingsManager Tests', () => {
  let settingsManager: SettingsManagerImpl;
  let errorHandler: ErrorHandlerImpl;
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;

  setup(() => {
    errorHandler = new ErrorHandlerImpl();
    settingsManager = new SettingsManagerImpl(errorHandler);
    originalGetConfiguration = vscode.workspace.getConfiguration;
  });

  teardown(() => {
    settingsManager.dispose();
    vscode.workspace.getConfiguration = originalGetConfiguration;
  });

  suite('Basic Settings Retrieval', () => {
    test('should return default display mode', () => {
      mockConfiguration({});

      const displayMode = settingsManager.getDisplayMode();
      assert.strictEqual(displayMode, 'default');
    });

    test('should return configured display mode', () => {
      mockConfiguration({ displayMode: 'multiple' });

      const displayMode = settingsManager.getDisplayMode();
      assert.strictEqual(displayMode, 'multiple');
    });

    test('should fallback to default for invalid display mode', () => {
      mockConfiguration({ displayMode: 'invalid' });

      const displayMode = settingsManager.getDisplayMode();
      assert.strictEqual(displayMode, 'default');
    });

    test('should return default enabled file types', () => {
      mockConfiguration({});

      const fileTypes = settingsManager.getEnabledFileTypes();
      assert.deepStrictEqual(fileTypes, ['css', 'scss', 'sass']);
    });

    test('should return configured file types', () => {
      mockConfiguration({ enabledFileTypes: ['css', 'scss'] });

      const fileTypes = settingsManager.getEnabledFileTypes();
      assert.deepStrictEqual(fileTypes, ['css', 'scss']);
    });

    test('should filter invalid file types', () => {
      mockConfiguration({ enabledFileTypes: ['css', '', 'scss', null, 'sass'] });

      const fileTypes = settingsManager.getEnabledFileTypes();
      assert.deepStrictEqual(fileTypes, ['css', 'scss', 'sass']);
    });
  });

  suite('Resolution Scope Settings', () => {
    test('should return default resolution scope', () => {
      mockConfiguration({});

      const scope = settingsManager.getVariableResolutionScope();
      assert.strictEqual(scope, 'workspace');
    });

    test('should return configured resolution scope', () => {
      mockConfiguration({ variableResolutionScope: 'file' });

      const scope = settingsManager.getVariableResolutionScope();
      assert.strictEqual(scope, 'file');
    });

    test('should fallback to workspace for invalid scope', () => {
      mockConfiguration({ variableResolutionScope: 'invalid' });

      const scope = settingsManager.getVariableResolutionScope();
      assert.strictEqual(scope, 'workspace');
    });
  });

  suite('Chip Size Settings', () => {
    test('should return default chip size', () => {
      mockConfiguration({});

      const size = settingsManager.getChipSize();
      assert.strictEqual(size, 'medium');
    });

    test('should return configured chip size', () => {
      mockConfiguration({ chipSize: 'large' });

      const size = settingsManager.getChipSize();
      assert.strictEqual(size, 'large');
    });

    test('should fallback to medium for invalid size', () => {
      mockConfiguration({ chipSize: 'invalid' });

      const size = settingsManager.getChipSize();
      assert.strictEqual(size, 'medium');
    });
  });

  suite('Boolean Settings', () => {
    test('should return default enabled state', () => {
      mockConfiguration({});

      const enabled = settingsManager.isEnabled();
      assert.strictEqual(enabled, true);
    });

    test('should return configured enabled state', () => {
      mockConfiguration({ enabled: false });

      const enabled = settingsManager.isEnabled();
      assert.strictEqual(enabled, false);
    });

    test('should return default show variable definitions', () => {
      mockConfiguration({});

      const show = settingsManager.showVariableDefinitions();
      assert.strictEqual(show, true);
    });

    test('should return configured show variable usages', () => {
      mockConfiguration({ showVariableUsages: false });

      const show = settingsManager.showVariableUsages();
      assert.strictEqual(show, false);
    });

    test('should return default hover info setting', () => {
      mockConfiguration({});

      const enabled = settingsManager.enableHoverInfo();
      assert.strictEqual(enabled, true);
    });

    test('should return configured debug logging', () => {
      mockConfiguration({ enableDebugLogging: true });

      const enabled = settingsManager.enableDebugLogging();
      assert.strictEqual(enabled, true);
    });
  });

  suite('Numeric Settings', () => {
    test('should return default max colors in multiple mode', () => {
      mockConfiguration({});

      const maxColors = settingsManager.getMaxColorsInMultipleMode();
      assert.strictEqual(maxColors, 5);
    });

    test('should return configured max colors', () => {
      mockConfiguration({ maxColorsInMultipleMode: 3 });

      const maxColors = settingsManager.getMaxColorsInMultipleMode();
      assert.strictEqual(maxColors, 3);
    });

    test('should fallback to default for invalid max colors', () => {
      mockConfiguration({ maxColorsInMultipleMode: 15 });

      const maxColors = settingsManager.getMaxColorsInMultipleMode();
      assert.strictEqual(maxColors, 5);
    });

    test('should return default cache size limit', () => {
      mockConfiguration({});

      const cacheSize = settingsManager.getCacheSizeLimit();
      assert.strictEqual(cacheSize, 100);
    });

    test('should return configured cache size', () => {
      mockConfiguration({ cacheSizeLimit: 50 });

      const cacheSize = settingsManager.getCacheSizeLimit();
      assert.strictEqual(cacheSize, 50);
    });

    test('should fallback to default for invalid cache size', () => {
      mockConfiguration({ cacheSizeLimit: 5000 });

      const cacheSize = settingsManager.getCacheSizeLimit();
      assert.strictEqual(cacheSize, 100);
    });

    test('should return default debounce delay', () => {
      mockConfiguration({});

      const delay = settingsManager.getDebounceDelay();
      assert.strictEqual(delay, 300);
    });

    test('should return configured debounce delay', () => {
      mockConfiguration({ debounceDelay: 500 });

      const delay = settingsManager.getDebounceDelay();
      assert.strictEqual(delay, 500);
    });

    test('should fallback to default for invalid debounce delay', () => {
      mockConfiguration({ debounceDelay: 5000 });

      const delay = settingsManager.getDebounceDelay();
      assert.strictEqual(delay, 300);
    });
  });

  suite('Array Settings', () => {
    test('should return default custom theme paths', () => {
      mockConfiguration({});

      const paths = settingsManager.getCustomThemePaths();
      assert.deepStrictEqual(paths, []);
    });

    test('should return configured theme paths', () => {
      mockConfiguration({ customThemePaths: ['theme1.css', 'theme2.css'] });

      const paths = settingsManager.getCustomThemePaths();
      assert.deepStrictEqual(paths, ['theme1.css', 'theme2.css']);
    });

    test('should filter invalid theme paths', () => {
      mockConfiguration({ customThemePaths: ['theme1.css', '', 'theme2.css', null] });

      const paths = settingsManager.getCustomThemePaths();
      assert.deepStrictEqual(paths, ['theme1.css', 'theme2.css']);
    });
  });

  suite('Settings Validation', () => {
    test('should validate correct settings', () => {
      mockConfiguration({
        displayMode: 'multiple',
        variableResolutionScope: 'file',
        chipSize: 'large',
        maxColorsInMultipleMode: 3,
        cacheSizeLimit: 50,
        debounceDelay: 500
      });

      const issues = settingsManager.validateSettings();
      assert.strictEqual(issues.length, 0);
    });

    test('should detect invalid display mode', () => {
      mockConfiguration({ displayMode: 'invalid' });

      const issues = settingsManager.validateSettings();
      assert.ok(issues.some(issue => issue.includes('Invalid display mode')));
    });

    test('should detect invalid numeric ranges', () => {
      mockConfiguration({
        maxColorsInMultipleMode: 15,
        cacheSizeLimit: 5,
        debounceDelay: 5000
      });

      const issues = settingsManager.validateSettings();
      assert.ok(issues.some(issue => issue.includes('maxColorsInMultipleMode')));
      assert.ok(issues.some(issue => issue.includes('cacheSizeLimit')));
      assert.ok(issues.some(issue => issue.includes('debounceDelay')));
    });
  });

  suite('Settings Management', () => {
    test('should get all settings', () => {
      mockConfiguration({
        enabled: true,
        displayMode: 'multiple',
        chipSize: 'large'
      });

      const allSettings = settingsManager.getAllSettings();
      assert.strictEqual(allSettings.enabled, true);
      assert.strictEqual(allSettings.displayMode, 'multiple');
      assert.strictEqual(allSettings.chipSize, 'large');
    });

    test('should handle settings change callbacks', () => {
      let callbackCalled = false;
      settingsManager.onSettingsChanged(() => {
        callbackCalled = true;
      });

      // Simulate configuration change
      const event = {
        affectsConfiguration: (section: string) => section === 'cssVariableColorChips'
      } as vscode.ConfigurationChangeEvent;

      // Access private method for testing
      (settingsManager as any).handleConfigurationChange(event);

      assert.strictEqual(callbackCalled, true);
    });
  });

  // Helper function to mock VSCode configuration
  function mockConfiguration(config: Record<string, any>): void {
    vscode.workspace.getConfiguration = (section?: string) => {
      if (section === 'cssVariableColorChips') {
        return {
          get: <T>(key: string, defaultValue?: T): T => {
            return config[key] !== undefined ? config[key] : (defaultValue as T);
          },
          update: async () => { },
          has: (key: string) => config.hasOwnProperty(key),
          inspect: () => undefined
        } as any;
      }
      return {} as any;
    };
  }
});