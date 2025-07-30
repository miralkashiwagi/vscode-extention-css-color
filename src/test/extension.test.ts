import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Integration Tests', () => {
  test('Extension module should be loadable', () => {
    // Test that the extension module can be loaded without errors
    assert.doesNotThrow(() => {
      const extensionModule = require('../extension');
      assert.ok(extensionModule, 'Extension module should be loaded');
    }, 'Extension module should be loadable');
  });

  test('Extension should have basic structure', () => {
    const extensionModule = require('../extension');
    
    // Check that required functions exist
    assert.ok(typeof extensionModule.activate === 'function', 'activate function should exist');
    assert.ok(typeof extensionModule.deactivate === 'function', 'deactivate function should exist');
  });

  test('Extension should handle activation lifecycle', () => {
    const extensionModule = require('../extension');
    const mockContext = createMockExtensionContext();
    
    // Test activation
    assert.doesNotThrow(() => {
      extensionModule.activate(mockContext);
    }, 'Extension activation should not throw');
    
    // Test deactivation
    assert.doesNotThrow(() => {
      extensionModule.deactivate();
    }, 'Extension deactivation should not throw');
  });
});

// Helper functions

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