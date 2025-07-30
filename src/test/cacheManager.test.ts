import * as assert from 'assert';
import * as vscode from 'vscode';
import { CacheManagerImpl } from '../cacheManager';
import { VariableContext, ParseResult } from '../types';

suite('CacheManager Tests', () => {
  let cacheManager: CacheManagerImpl;

  setup(() => {
    cacheManager = new CacheManagerImpl(5); // Small cache for testing
  });

  teardown(() => {
    cacheManager.dispose();
  });

  suite('Basic Cache Operations', () => {
    test('should store and retrieve data', () => {
      const testData = { test: 'value' };
      const uri = 'test://test.css';

      cacheManager.set(uri, testData);
      const retrieved = cacheManager.get(uri);

      assert.deepStrictEqual(retrieved, testData);
    });

    test('should return null for non-existent entries', () => {
      const result = cacheManager.get('non-existent://uri');
      assert.strictEqual(result, null);
    });

    test('should invalidate specific entries', () => {
      const testData = { test: 'value' };
      const uri = 'test://test.css';

      cacheManager.set(uri, testData);
      assert.ok(cacheManager.get(uri));

      cacheManager.invalidate(uri);
      assert.strictEqual(cacheManager.get(uri), null);
    });

    test('should clear all entries', () => {
      cacheManager.set('test://1.css', { data: 1 });
      cacheManager.set('test://2.css', { data: 2 });

      assert.ok(cacheManager.get('test://1.css'));
      assert.ok(cacheManager.get('test://2.css'));

      cacheManager.clear();

      assert.strictEqual(cacheManager.get('test://1.css'), null);
      assert.strictEqual(cacheManager.get('test://2.css'), null);
    });
  });

  suite('LRU Eviction', () => {
    test('should evict least recently used entries when cache is full', () => {
      // Fill cache to capacity
      for (let i = 0; i < 5; i++) {
        cacheManager.set(`test://${i}.css`, { data: i });
      }

      // All entries should be present
      for (let i = 0; i < 5; i++) {
        assert.ok(cacheManager.get(`test://${i}.css`));
      }

      // Add one more entry, should evict the first one
      cacheManager.set('test://5.css', { data: 5 });

      // First entry should be evicted
      assert.strictEqual(cacheManager.get('test://0.css'), null);
      
      // Others should still be present
      for (let i = 1; i <= 5; i++) {
        assert.ok(cacheManager.get(`test://${i}.css`));
      }
    });

    test('should update access order on get', () => {
      // Fill cache
      for (let i = 0; i < 5; i++) {
        cacheManager.set(`test://${i}.css`, { data: i });
      }

      // Access first entry to make it most recently used
      cacheManager.get('test://0.css');

      // Add new entry
      cacheManager.set('test://5.css', { data: 5 });

      // First entry should still be present (was accessed recently)
      assert.ok(cacheManager.get('test://0.css'));
      
      // Second entry should be evicted instead
      assert.strictEqual(cacheManager.get('test://1.css'), null);
    });
  });

  suite('Cache Statistics', () => {
    test('should provide accurate statistics', () => {
      cacheManager.set('test://1.css', { data: 1 });
      cacheManager.set('test://2.css', { data: 2 });

      const stats = cacheManager.getStats();

      assert.strictEqual(stats.size, 2);
      assert.strictEqual(stats.maxSize, 5);
      assert.strictEqual(stats.entries.length, 2);
      
      // Check entry details
      const entry1 = stats.entries.find(e => e.uri === 'test://1.css');
      const entry2 = stats.entries.find(e => e.uri === 'test://2.css');
      
      assert.ok(entry1);
      assert.ok(entry2);
      assert.strictEqual(entry1.version, 0);
      assert.strictEqual(entry2.version, 0);
    });

    test('should update max size', () => {
      cacheManager.setMaxSize(3);
      
      const stats = cacheManager.getStats();
      assert.strictEqual(stats.maxSize, 3);
    });

    test('should enforce new max size immediately', () => {
      // Fill cache beyond new limit
      for (let i = 0; i < 5; i++) {
        cacheManager.set(`test://${i}.css`, { data: i });
      }

      // Reduce max size
      cacheManager.setMaxSize(3);

      const stats = cacheManager.getStats();
      assert.strictEqual(stats.size, 3);
      assert.strictEqual(stats.maxSize, 3);
    });
  });

  suite('Document Version Tracking', () => {
    test('should detect document changes when no document found', () => {
      const uri = 'test://nonexistent.css';
      
      // Set initial cache
      cacheManager.set(uri, { data: 'initial' });
      
      // Should detect change when document doesn't exist
      assert.strictEqual(cacheManager.isDocumentChanged(uri), true);
    });

    test('should update cache when document not found', () => {
      const uri = 'test://nonexistent.css';
      let callCount = 0;
      
      const dataProvider = () => {
        callCount++;
        return { data: `version-${callCount}` };
      };

      // First call should create cache
      const result1 = cacheManager.updateIfChanged(uri, dataProvider);
      assert.deepStrictEqual(result1, { data: 'version-1' });
      assert.strictEqual(callCount, 1);

      // Second call should also update since document doesn't exist
      const result2 = cacheManager.updateIfChanged(uri, dataProvider);
      assert.deepStrictEqual(result2, { data: 'version-2' });
      assert.strictEqual(callCount, 2);
    });
  });

  suite('Specialized Cache Methods', () => {
    test('should cache variable context', () => {
      const uri = 'test://test.css';
      let callCount = 0;

      const contextProvider = (): VariableContext => {
        callCount++;
        return {
          definitions: new Map(),
          usages: [],
          imports: [],
          scope: 'file'
        };
      };

      // First call should create cache
      const context1 = cacheManager.getVariableContext(uri, contextProvider);
      assert.strictEqual(callCount, 1);
      assert.strictEqual(context1.scope, 'file');

      // Second call should use cache
      const context2 = cacheManager.getVariableContext(uri, contextProvider);
      assert.strictEqual(callCount, 1); // Should not increment
      assert.strictEqual(context1, context2); // Should be same instance
    });

    test('should cache parse results', () => {
      const uri = 'test://test.css';
      let callCount = 0;

      const parseProvider = (): ParseResult => {
        callCount++;
        return {
          colorValues: [],
          variableDefinitions: [],
          variableUsages: []
        };
      };

      // First call should create cache
      const result1 = cacheManager.getParseResult(uri, parseProvider);
      assert.strictEqual(callCount, 1);
      assert.ok(Array.isArray(result1.colorValues));

      // Second call should use cache
      const result2 = cacheManager.getParseResult(uri, parseProvider);
      assert.strictEqual(callCount, 1); // Should not increment
      assert.strictEqual(result1, result2); // Should be same instance
    });
  });

  suite('Cache Maintenance', () => {
    test('should invalidate old entries', async () => {
      const uri = 'test://test.css';
      cacheManager.set(uri, { data: 'test' });

      // Verify entry exists
      assert.ok(cacheManager.get(uri));

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // Invalidate entries older than 5ms
      cacheManager.invalidateOlderThan(5);

      // Entry should be gone
      assert.strictEqual(cacheManager.get(uri), null);
    });

    test('should keep recent entries when invalidating old ones', () => {
      const uri1 = 'test://old.css';
      const uri2 = 'test://new.css';

      cacheManager.set(uri1, { data: 'old' });
      
      // Wait a bit
      setTimeout(() => {
        cacheManager.set(uri2, { data: 'new' });
        
        // Invalidate entries older than 50ms
        cacheManager.invalidateOlderThan(50);
        
        // Old entry should be gone, new should remain
        assert.strictEqual(cacheManager.get(uri1), null);
        assert.ok(cacheManager.get(uri2));
      }, 100);
    });

    test('should invalidate stale entries', () => {
      const uri = 'test://nonexistent.css';
      cacheManager.set(uri, { data: 'test' });

      // Verify entry exists
      assert.ok(cacheManager.get(uri));

      // Since we can't mock textDocuments, this will invalidate entries
      // for documents that don't exist (which is the case for our test URI)
      cacheManager.invalidateStaleEntries();

      // Entry should be gone since the document doesn't exist
      assert.strictEqual(cacheManager.get(uri), null);
    });
  });

  suite('Preloading', () => {
    test('should handle preloading with no visible editors', () => {
      let callCount = 0;
      const dataProvider = (uri: string) => {
        callCount++;
        return { uri, data: 'preloaded' };
      };

      // Since we can't mock visibleTextEditors, test with current state
      cacheManager.preloadVisibleDocuments(dataProvider);

      // Should not throw and should handle gracefully
      assert.doesNotThrow(() => {
        cacheManager.preloadVisibleDocuments(dataProvider);
      });
    });

    test('should handle preloading errors gracefully', () => {
      const dataProvider = () => {
        throw new Error('Preload error');
      };

      // Should not throw
      assert.doesNotThrow(() => {
        cacheManager.preloadVisibleDocuments(dataProvider);
      });
    });
  });

  suite('Error Handling', () => {
    test('should handle invalid URIs gracefully', () => {
      const invalidUri = 'not-a-valid-uri';
      
      assert.doesNotThrow(() => {
        cacheManager.set(invalidUri, { data: 'test' });
      });

      assert.doesNotThrow(() => {
        cacheManager.get(invalidUri);
      });

      assert.doesNotThrow(() => {
        cacheManager.isDocumentChanged(invalidUri);
      });
    });

    test('should handle dispose multiple times', () => {
      cacheManager.set('test://test.css', { data: 'test' });

      assert.doesNotThrow(() => {
        cacheManager.dispose();
        cacheManager.dispose(); // Should not throw on second dispose
      });

      // Cache should be empty after dispose
      assert.strictEqual(cacheManager.get('test://test.css'), null);
    });
  });
});