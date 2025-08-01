import * as assert from 'assert';
import * as vscode from 'vscode';
import { FileWatcherImpl } from '../fileWatcher';
import { SettingsManager } from '../interfaces';

suite('FileWatcher Tests', () => {
  let fileWatcher: FileWatcherImpl;
  let mockSettingsManager: MockSettingsManager;

  setup(() => {
    mockSettingsManager = new MockSettingsManager();
    fileWatcher = new FileWatcherImpl(mockSettingsManager);
  });

  teardown(() => {
    fileWatcher.dispose();
  });

  suite('Basic Functionality', () => {
    test('should start and stop watching', () => {
      assert.strictEqual(fileWatcher.isCurrentlyWatching(), false);

      fileWatcher.startWatching();
      assert.strictEqual(fileWatcher.isCurrentlyWatching(), true);

      fileWatcher.stopWatching();
      assert.strictEqual(fileWatcher.isCurrentlyWatching(), false);
    });

    test('should not start watching multiple times', () => {
      fileWatcher.startWatching();
      const stats1 = fileWatcher.getWatchStats();

      fileWatcher.startWatching(); // Should not create additional watchers
      const stats2 = fileWatcher.getWatchStats();

      assert.strictEqual(stats1.watchersCount, stats2.watchersCount);
    });

    test('should handle stop watching when not started', () => {
      assert.doesNotThrow(() => {
        fileWatcher.stopWatching();
      });
    });
  });

  suite('Callback Management', () => {
    test('should register and call file change callbacks', () => {
      let callbackCalled = false;
      let receivedUri: vscode.Uri | null = null;

      const callback = (uri: vscode.Uri) => {
        callbackCalled = true;
        receivedUri = uri;
      };

      fileWatcher.onFileChanged(callback);
      
      const testUri = vscode.Uri.parse('test://test.css');
      (fileWatcher as any).notifyFileChange(testUri);

      assert.strictEqual(callbackCalled, true);
      assert.ok(receivedUri);
      assert.strictEqual((receivedUri as vscode.Uri).toString(), testUri.toString());
    });

    test('should remove file change callbacks', () => {
      let callbackCalled = false;

      const callback = () => {
        callbackCalled = true;
      };

      fileWatcher.onFileChanged(callback);
      fileWatcher.removeFileChangeCallback(callback);

      const testUri = vscode.Uri.parse('test://test.css');
      (fileWatcher as any).notifyFileChange(testUri);

      assert.strictEqual(callbackCalled, false);
    });

    test('should handle multiple callbacks', () => {
      let callback1Called = false;
      let callback2Called = false;

      fileWatcher.onFileChanged(() => { callback1Called = true; });
      fileWatcher.onFileChanged(() => { callback2Called = true; });

      const testUri = vscode.Uri.parse('test://test.css');
      (fileWatcher as any).notifyFileChange(testUri);

      assert.strictEqual(callback1Called, true);
      assert.strictEqual(callback2Called, true);
    });

    test('should handle callback errors gracefully', () => {
      const errorCallback = () => {
        throw new Error('Callback error');
      };

      let normalCallbackCalled = false;
      const normalCallback = () => {
        normalCallbackCalled = true;
      };

      fileWatcher.onFileChanged(errorCallback);
      fileWatcher.onFileChanged(normalCallback);

      const testUri = vscode.Uri.parse('test://test.css');

      assert.doesNotThrow(() => {
        (fileWatcher as any).notifyFileChange(testUri);
      });

      assert.strictEqual(normalCallbackCalled, true);
    });
  });

  suite('File Filtering', () => {
    test('should ignore files not in enabled file types', () => {
      mockSettingsManager.enabledFileTypes = ['css', 'scss'];

      const cssUri = vscode.Uri.file('/test/file.css');
      const jsUri = vscode.Uri.file('/test/file.js');

      assert.strictEqual((fileWatcher as any).shouldIgnoreFile(cssUri), false);
      assert.strictEqual((fileWatcher as any).shouldIgnoreFile(jsUri), true);
    });

    test('should ignore files in ignored directories', () => {
      mockSettingsManager.enabledFileTypes = ['css'];

      const normalFile = vscode.Uri.file('/project/styles.css');
      const nodeModulesFile = vscode.Uri.file('/project/node_modules/lib/styles.css');
      const gitFile = vscode.Uri.file('/project/.git/config');

      assert.strictEqual((fileWatcher as any).shouldIgnoreFile(normalFile), false);
      assert.strictEqual((fileWatcher as any).shouldIgnoreFile(nodeModulesFile), true);
      assert.strictEqual((fileWatcher as any).shouldIgnoreFile(gitFile), true);
    });

    test('should ignore untitled documents', () => {
      const untitledDoc = {
        uri: vscode.Uri.parse('untitled:Untitled-1'),
        languageId: 'css'
      } as vscode.TextDocument;

      const fileDoc = {
        uri: vscode.Uri.file('/test/file.css'),
        languageId: 'css'
      } as vscode.TextDocument;

      assert.strictEqual((fileWatcher as any).shouldIgnoreDocument(untitledDoc), true);
      assert.strictEqual((fileWatcher as any).shouldIgnoreDocument(fileDoc), false);
    });

    test('should ignore non-file scheme documents', () => {
      const gitDoc = {
        uri: vscode.Uri.parse('git:/test/file.css'),
        languageId: 'css'
      } as vscode.TextDocument;

      const fileDoc = {
        uri: vscode.Uri.file('/test/file.css'),
        languageId: 'css'
      } as vscode.TextDocument;

      assert.strictEqual((fileWatcher as any).shouldIgnoreDocument(gitDoc), true);
      assert.strictEqual((fileWatcher as any).shouldIgnoreDocument(fileDoc), false);
    });
  });

  suite('Debouncing', () => {
    test('should debounce file changes', async () => {
      mockSettingsManager.debounceDelay = 50;
      
      let callbackCount = 0;
      fileWatcher.onFileChanged(() => { callbackCount++; });

      const testUri = vscode.Uri.parse('test://test.css');

      // Trigger multiple rapid changes
      (fileWatcher as any).debounceFileChange(testUri, 'change');
      (fileWatcher as any).debounceFileChange(testUri, 'change');
      (fileWatcher as any).debounceFileChange(testUri, 'change');

      // Should not have called callback yet
      assert.strictEqual(callbackCount, 0);

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 60));

      // Should have called callback only once
      assert.strictEqual(callbackCount, 1);
    });

    test('should not debounce file deletions', () => {
      mockSettingsManager.enabledFileTypes = ['css'];
      
      let callbackCount = 0;
      fileWatcher.onFileChanged(() => { callbackCount++; });

      const testUri = vscode.Uri.file('/test/file.css');

      (fileWatcher as any).handleFileDelete(testUri);

      // Should call immediately for deletions
      assert.strictEqual(callbackCount, 1);
    });

    test('should clear debounce timers on stop watching', async () => {
      mockSettingsManager.debounceDelay = 100;
      
      let callbackCount = 0;
      fileWatcher.onFileChanged(() => { callbackCount++; });

      fileWatcher.startWatching();

      const testUri = vscode.Uri.parse('test://test.css');
      (fileWatcher as any).debounceFileChange(testUri, 'change');

      // Stop watching before debounce completes
      fileWatcher.stopWatching();

      // Wait longer than debounce delay
      await new Promise(resolve => setTimeout(resolve, 150));

      // Callback should not have been called
      assert.strictEqual(callbackCount, 0);
    });
  });

  suite('Statistics and Monitoring', () => {
    test('should provide accurate watch statistics', () => {
      mockSettingsManager.enabledFileTypes = ['css', 'scss'];

      fileWatcher.startWatching();
      fileWatcher.onFileChanged(() => {});
      fileWatcher.onFileChanged(() => {});

      const stats = fileWatcher.getWatchStats();

      assert.strictEqual(stats.watchersCount, 2); // css and scss
      assert.strictEqual(stats.callbacksCount, 2);
      assert.strictEqual(stats.pendingDebounces, 0);
    });

    test('should track pending debounces', () => {
      mockSettingsManager.debounceDelay = 100;
      
      fileWatcher.onFileChanged(() => {});

      const testUri = vscode.Uri.parse('test://test.css');
      (fileWatcher as any).debounceFileChange(testUri, 'change');

      const stats = fileWatcher.getWatchStats();
      assert.strictEqual(stats.pendingDebounces, 1);
    });

    test('should return watched patterns', () => {
      mockSettingsManager.enabledFileTypes = ['css', 'scss'];

      const patterns = fileWatcher.getWatchedPatterns();

      assert.deepStrictEqual(patterns, [
        '**/*.css',
        '**/*.scss'
      ]);
    });
  });

  suite('Document Event Handling', () => {
    test('should handle document save immediately', () => {
      let callbackCount = 0;
      fileWatcher.onFileChanged(() => { callbackCount++; });

      const mockDocument = {
        uri: vscode.Uri.file('/test/file.css'),
        languageId: 'css'
      } as vscode.TextDocument;

      (fileWatcher as any).handleDocumentSave(mockDocument);

      // Should call immediately on save
      assert.strictEqual(callbackCount, 1);
    });

    test('should handle document open', () => {
      let callbackCount = 0;
      fileWatcher.onFileChanged(() => { callbackCount++; });

      const mockDocument = {
        uri: vscode.Uri.file('/test/file.css'),
        languageId: 'css'
      } as vscode.TextDocument;

      (fileWatcher as any).handleDocumentOpen(mockDocument);

      assert.strictEqual(callbackCount, 1);
    });

    test('should clear debounce on document close', () => {
      mockSettingsManager.debounceDelay = 100;
      
      const mockDocument = {
        uri: vscode.Uri.file('/test/file.css'),
        languageId: 'css'
      } as vscode.TextDocument;

      // Start a debounce
      (fileWatcher as any).debounceFileChange(mockDocument.uri, 'change');
      assert.strictEqual(fileWatcher.getWatchStats().pendingDebounces, 1);

      // Close document should clear debounce
      (fileWatcher as any).handleDocumentClose(mockDocument);
      assert.strictEqual(fileWatcher.getWatchStats().pendingDebounces, 0);
    });
  });

  suite('Utility Functions', () => {
    test('should force refresh all documents', () => {
      let callbackCount = 0;
      fileWatcher.onFileChanged(() => { callbackCount++; });

      // Since we can't mock textDocuments, test with current state
      fileWatcher.forceRefreshAllDocuments();

      // Should not throw and should handle gracefully
      assert.doesNotThrow(() => {
        fileWatcher.forceRefreshAllDocuments();
      });
    });

    test('should watch specific patterns', () => {
      const disposable = fileWatcher.watchSpecificPattern('**/*.theme.css');

      assert.ok(disposable);
      assert.ok(typeof disposable.dispose === 'function');

      disposable.dispose();
    });

    test('should get file extension correctly', () => {
      const getFileExtension = (fileWatcher as any).getFileExtension.bind(fileWatcher);

      assert.strictEqual(getFileExtension('/path/file.css'), 'css');
      assert.strictEqual(getFileExtension('/path/file.scss'), 'scss');
      assert.strictEqual(getFileExtension('/path/file'), '');
      assert.strictEqual(getFileExtension('/path/file.CSS'), 'css'); // Should be lowercase
    });
  });

  suite('Error Handling', () => {
    test('should handle dispose multiple times', () => {
      fileWatcher.startWatching();

      assert.doesNotThrow(() => {
        fileWatcher.dispose();
        fileWatcher.dispose(); // Should not throw on second dispose
      });

      assert.strictEqual(fileWatcher.isCurrentlyWatching(), false);
    });

    test('should handle invalid URIs gracefully', () => {
      let callbackCount = 0;
      fileWatcher.onFileChanged(() => { callbackCount++; });

      // Test with valid but non-matching URIs instead of null/undefined
      const invalidUri = vscode.Uri.parse('invalid://test');

      assert.doesNotThrow(() => {
        (fileWatcher as any).handleFileChange(invalidUri);
        (fileWatcher as any).handleFileCreate(invalidUri);
      });

      assert.strictEqual(callbackCount, 0);
    });
  });
});

// Mock classes and helper functions

class MockSettingsManager implements SettingsManager {
  enabledFileTypes: string[] = ['css', 'scss'];
  debounceDelay: number = 300;

  getDisplayMode() { return 'default' as const; }
  getEnabledFileTypes() { return this.enabledFileTypes; }
  getVariableResolutionScope() { return 'workspace' as const; }
  getChipSize() { return 'medium' as const; }
  isEnabled() { return true; }
  showVariableDefinitions() { return true; }
  showVariableUsages() { return true; }
  getMaxColorsInMultipleMode() { return 5; }
  enableHoverInfo() { return true; }
  enableDebugLogging() { return false; }
  getCacheSizeLimit() { return 100; }
  getDebounceDelay() { return this.debounceDelay; }
  getCustomThemePaths() { return []; }
  onSettingsChanged() {}
  async updateSetting() {}
  async resetToDefaults() {}
  getAllSettings() { return {}; }
  validateSettings() { return []; }
  dispose() {}
}