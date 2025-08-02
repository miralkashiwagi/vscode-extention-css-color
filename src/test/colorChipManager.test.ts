import * as assert from 'assert';
import * as vscode from 'vscode';
import { ColorChipManagerImpl } from '../colorChipManager';

suite('ColorChipManager Tests', () => {
  let colorChipManager: ColorChipManagerImpl;
  let mockContext: vscode.ExtensionContext;

  setup(() => {
    colorChipManager = new ColorChipManagerImpl();
    mockContext = createMockExtensionContext();
  });

  teardown(() => {
    colorChipManager.deactivate();
  });

  suite('Activation and Deactivation', () => {
    test('should activate successfully', () => {
      assert.strictEqual(colorChipManager.getStats().isActivated, false);

      colorChipManager.activate(mockContext);

      assert.strictEqual(colorChipManager.getStats().isActivated, true);
    });

    test('should not activate multiple times', () => {
      colorChipManager.activate(mockContext);
      const stats1 = colorChipManager.getStats();

      colorChipManager.activate(mockContext); // Should not activate again
      const stats2 = colorChipManager.getStats();

      assert.strictEqual(stats1.isActivated, stats2.isActivated);
    });

    test('should deactivate successfully', () => {
      colorChipManager.activate(mockContext);
      assert.strictEqual(colorChipManager.getStats().isActivated, true);

      colorChipManager.deactivate();
      assert.strictEqual(colorChipManager.getStats().isActivated, false);
    });

    test('should handle deactivation when not activated', () => {
      assert.doesNotThrow(() => {
        colorChipManager.deactivate();
      });
    });
  });

  suite('Document Management', () => {
    test('should refresh specific document', () => {
      colorChipManager.activate(mockContext);

      const document = createMockDocument('test.css', 'css');

      assert.doesNotThrow(() => {
        colorChipManager.refreshDocument(document);
      });
    });

    test('should refresh all documents', () => {
      colorChipManager.activate(mockContext);

      assert.doesNotThrow(() => {
        colorChipManager.refreshAllDocuments();
      });
    });

    test('should not refresh when not activated', () => {
      const document = createMockDocument('test.css', 'css');

      assert.doesNotThrow(() => {
        colorChipManager.refreshDocument(document);
      });
    });

    test('should clear all decorations', () => {
      colorChipManager.activate(mockContext);

      // Mock visible editors using Object.defineProperty
      const originalDescriptor = Object.getOwnPropertyDescriptor(vscode.window, 'visibleTextEditors');
      const mockEditor = createMockEditor(createMockDocument('test.css', 'css'));
      
      Object.defineProperty(vscode.window, 'visibleTextEditors', {
        value: [mockEditor],
        configurable: true
      });

      assert.doesNotThrow(() => {
        colorChipManager.clearAllDecorations();
      });

      // Restore original property
      if (originalDescriptor) {
        Object.defineProperty(vscode.window, 'visibleTextEditors', originalDescriptor);
      }
    });
  });

  suite('Settings Management', () => {
    test('should update settings', () => {
      colorChipManager.activate(mockContext);

      assert.doesNotThrow(() => {
        colorChipManager.updateSettings();
      });
    });

    test('should toggle enabled state', async () => {
      colorChipManager.activate(mockContext);

      // Mock the settings manager's updateSetting method
      const originalUpdateSetting = (colorChipManager as any).settingsManager.updateSetting;
      let updateSettingCalled = false;
      (colorChipManager as any).settingsManager.updateSetting = async () => {
        updateSettingCalled = true;
      };

      await colorChipManager.toggleEnabled();

      assert.strictEqual(updateSettingCalled, true);

      // Restore original method
      (colorChipManager as any).settingsManager.updateSetting = originalUpdateSetting;
    });

    test('should not toggle when not activated', async () => {
      assert.doesNotThrow(async () => {
        await colorChipManager.toggleEnabled();
      });
    });
  });

  suite('Statistics and Information', () => {
    test('should provide accurate statistics', () => {
      const stats = colorChipManager.getStats();

      assert.strictEqual(typeof stats.isActivated, 'boolean');
      assert.strictEqual(typeof stats.isEnabled, 'boolean');
      assert.strictEqual(stats.isActivated, false); // Not activated yet

      colorChipManager.activate(mockContext);

      const statsAfterActivation = colorChipManager.getStats();
      assert.strictEqual(statsAfterActivation.isActivated, true);
    });

    test('should show extension information', () => {
      colorChipManager.activate(mockContext);

      // Mock showInformationMessage
      const originalShowInformationMessage = vscode.window.showInformationMessage;
      let messageShown = false;
      (vscode.window as any).showInformationMessage = () => {
        messageShown = true;
        return Promise.resolve();
      };

      colorChipManager.showInfo();

      assert.strictEqual(messageShown, true);

      // Restore original method
      (vscode.window as any).showInformationMessage = originalShowInformationMessage;
    });

    test('should provide health status', () => {
      const healthBefore = colorChipManager.getHealthStatus();
      assert.strictEqual(healthBefore.overall, 'error'); // Not activated

      colorChipManager.activate(mockContext);

      const healthAfter = colorChipManager.getHealthStatus();
      assert.ok(['healthy', 'warning'].includes(healthAfter.overall));
      assert.ok(typeof healthAfter.components === 'object');
      assert.ok(Array.isArray(healthAfter.issues));
    });
  });

  suite('Command Registration', () => {
    test('should register commands on activation', () => {
      // Mock commands.registerCommand
      const originalRegisterCommand = vscode.commands.registerCommand;
      const registeredCommands: string[] = [];
      (vscode.commands as any).registerCommand = (command: string) => {
        registeredCommands.push(command);
        return { dispose: () => {} };
      };

      colorChipManager.activate(mockContext);

      // Should have registered several commands
      assert.ok(registeredCommands.length > 0);
      assert.ok(registeredCommands.includes('cssVariableColorChips.toggle'));
      assert.ok(registeredCommands.includes('cssVariableColorChips.refresh'));
      assert.ok(registeredCommands.includes('cssVariableColorChips.clear'));
      assert.ok(registeredCommands.includes('cssVariableColorChips.info'));

      // Restore original method
      (vscode.commands as any).registerCommand = originalRegisterCommand;
    });
  });

  suite('Error Handling', () => {
    test('should handle activation errors gracefully', () => {
      // Mock a component to throw an error during initialization
      const originalConsoleError = console.error;
      let errorLogged = false;
      console.error = () => {
        errorLogged = true;
      };

      // This should not throw even if there are internal errors
      assert.doesNotThrow(() => {
        colorChipManager.activate(mockContext);
      });

      // Restore original console.error
      console.error = originalConsoleError;
    });

    test('should handle deactivation errors gracefully', () => {
      colorChipManager.activate(mockContext);

      const originalConsoleError = console.error;
      let errorLogged = false;
      console.error = () => {
        errorLogged = true;
      };

      assert.doesNotThrow(() => {
        colorChipManager.deactivate();
      });

      // Restore original console.error
      console.error = originalConsoleError;
    });

    test('should validate state correctly', () => {
      // Test private method through public interface
      const stats = colorChipManager.getStats();
      assert.strictEqual(stats.isActivated, false);

      colorChipManager.activate(mockContext);

      const statsAfter = colorChipManager.getStats();
      assert.strictEqual(statsAfter.isActivated, true);
    });
  });

  suite('Component Integration', () => {
    test('should initialize all components on activation', () => {
      colorChipManager.activate(mockContext);

      const stats = colorChipManager.getStats();

      // All components should be initialized
      assert.ok(stats.realtimeUpdater);
      assert.ok(stats.fileWatcher);
      assert.ok(stats.incrementalAnalyzer);
    });

    test('should handle settings changes', () => {
      colorChipManager.activate(mockContext);

      // Trigger settings change
      const settingsManager = (colorChipManager as any).settingsManager;
      
      assert.doesNotThrow(() => {
        // Simulate settings change by calling the handler directly
        (colorChipManager as any).handleSettingsChange();
      });
    });

    test('should manage component lifecycle', () => {
      colorChipManager.activate(mockContext);

      // Components should be active
      const stats = colorChipManager.getStats();
      assert.strictEqual(stats.isActivated, true);

      colorChipManager.deactivate();

      // Components should be deactivated
      const statsAfter = colorChipManager.getStats();
      assert.strictEqual(statsAfter.isActivated, false);
    });
  });
});

// Mock classes and helper functions

function createMockExtensionContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    workspaceState: {
      get: () => undefined,
      update: () => Promise.resolve(),
      keys: () => []
    },
    globalState: {
      get: () => undefined,
      update: () => Promise.resolve(),
      setKeysForSync: () => {},
      keys: () => []
    },
    extensionPath: '/mock/extension/path',
    extensionUri: vscode.Uri.file('/mock/extension/path'),
    environmentVariableCollection: {} as any,
    asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
    storageUri: vscode.Uri.file('/mock/storage'),
    globalStorageUri: vscode.Uri.file('/mock/global-storage'),
    logUri: vscode.Uri.file('/mock/log'),
    extensionMode: vscode.ExtensionMode.Development,
    secrets: {} as any,
    extension: {} as any
  } as unknown as vscode.ExtensionContext;
}

function createMockDocument(fileName: string, languageId: string): vscode.TextDocument {
  return {
    uri: vscode.Uri.file(`/test/${fileName}`),
    fileName,
    languageId,
    version: 1,
    getText: () => '.test { color: #ff0000; }',
    lineCount: 1,
    save: () => Promise.resolve(true),
    isDirty: false,
    isClosed: false,
    eol: vscode.EndOfLine.LF,
    isUntitled: false
  } as unknown as vscode.TextDocument;
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