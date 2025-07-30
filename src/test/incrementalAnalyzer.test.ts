import * as assert from 'assert';
import * as vscode from 'vscode';
import { IncrementalAnalyzer, AnalysisRegion, IncrementalChange } from '../incrementalAnalyzer';
import { Parser } from '../interfaces';
import { ParseResult, ColorMatch, VariableDefinition, VariableUsage } from '../types';
import { ColorValueImpl } from '../colorValue';

suite('IncrementalAnalyzer Tests', () => {
  let analyzer: IncrementalAnalyzer;
  let mockCSSParser: MockParser;
  let mockSCSSParser: MockParser;
  let mockDocument: vscode.TextDocument;

  setup(() => {
    mockCSSParser = new MockParser('css');
    mockSCSSParser = new MockParser('scss');
    analyzer = new IncrementalAnalyzer(mockCSSParser, mockSCSSParser);
    mockDocument = createMockDocument();
  });

  teardown(() => {
    analyzer.dispose();
  });

  suite('Visible Region Analysis', () => {
    test('should analyze visible regions with high priority', () => {
      const visibleRanges = [
        new vscode.Range(0, 0, 5, 0),
        new vscode.Range(10, 0, 15, 0)
      ];

      const result = analyzer.analyzeVisibleRegions(mockDocument, visibleRanges);

      assert.ok(result);
      assert.ok(Array.isArray(result.colorMatches));
      assert.ok(Array.isArray(result.variableDefinitions));
      assert.ok(Array.isArray(result.variableUsages));
      assert.strictEqual(result.analyzedRegions.length, 2);
      assert.strictEqual(result.analyzedRegions[0].priority, 'high');
    });

    test('should cache analysis results', () => {
      const visibleRanges = [new vscode.Range(0, 0, 5, 0)];

      const result1 = analyzer.analyzeVisibleRegions(mockDocument, visibleRanges);
      const result2 = analyzer.getAnalysisResult(mockDocument.uri.toString());

      assert.ok(result2);
      assert.strictEqual(result1.colorMatches.length, result2.colorMatches.length);
    });

    test('should handle empty visible ranges', () => {
      const result = analyzer.analyzeVisibleRegions(mockDocument, []);

      assert.ok(result);
      assert.strictEqual(result.colorMatches.length, 0);
      assert.strictEqual(result.analyzedRegions.length, 0);
    });
  });

  suite('Incremental Changes', () => {
    test('should process incremental changes', () => {
      const changes: IncrementalChange[] = [{
        range: new vscode.Range(2, 0, 2, 10),
        text: 'color: #ff0000;',
        rangeLength: 10
      }];

      const result = analyzer.processIncrementalChange(mockDocument, changes);

      assert.ok(result);
      assert.ok(Array.isArray(result.colorMatches));
      assert.ok(result.analyzedRegions.length > 0);
    });

    test('should calculate affected regions with buffer', () => {
      const changes: IncrementalChange[] = [{
        range: new vscode.Range(10, 0, 10, 5),
        text: 'new text',
        rangeLength: 5
      }];

      const result = analyzer.processIncrementalChange(mockDocument, changes);

      // Should analyze region around line 10 with buffer
      const affectedRegion = result.analyzedRegions.find(r => 
        r.startLine <= 10 && r.endLine >= 10
      );
      assert.ok(affectedRegion);
      assert.strictEqual(affectedRegion.priority, 'high');
    });

    test('should merge overlapping affected regions', () => {
      const changes: IncrementalChange[] = [
        {
          range: new vscode.Range(5, 0, 5, 5),
          text: 'change1',
          rangeLength: 5
        },
        {
          range: new vscode.Range(7, 0, 7, 5),
          text: 'change2',
          rangeLength: 5
        }
      ];

      const result = analyzer.processIncrementalChange(mockDocument, changes);

      // Should merge overlapping regions
      assert.ok(result.analyzedRegions.length > 0);
    });
  });

  suite('Cache Management', () => {
    test('should invalidate document cache', () => {
      const visibleRanges = [new vscode.Range(0, 0, 5, 0)];
      
      analyzer.analyzeVisibleRegions(mockDocument, visibleRanges);
      assert.ok(analyzer.getAnalysisResult(mockDocument.uri.toString()));

      analyzer.invalidateDocument(mockDocument.uri.toString());
      assert.strictEqual(analyzer.getAnalysisResult(mockDocument.uri.toString()), null);
    });

    test('should clear all caches', () => {
      const visibleRanges = [new vscode.Range(0, 0, 5, 0)];
      
      analyzer.analyzeVisibleRegions(mockDocument, visibleRanges);
      assert.ok(analyzer.getAnalysisResult(mockDocument.uri.toString()));

      analyzer.clearCache();
      assert.strictEqual(analyzer.getAnalysisResult(mockDocument.uri.toString()), null);
    });

    test('should provide analysis statistics', () => {
      const visibleRanges = [new vscode.Range(0, 0, 5, 0)];
      
      analyzer.analyzeVisibleRegions(mockDocument, visibleRanges);
      
      const stats = analyzer.getStats();
      assert.strictEqual(stats.cachedDocuments, 1);
      assert.strictEqual(typeof stats.pendingAnalysis, 'number');
      assert.strictEqual(typeof stats.inProgress, 'number');
    });
  });

  suite('Parser Selection', () => {
    test('should use SCSS parser for SCSS documents', () => {
      const scssDocument = {
        ...mockDocument,
        languageId: 'scss'
      } as vscode.TextDocument;

      const visibleRanges = [new vscode.Range(0, 0, 5, 0)];
      analyzer.analyzeVisibleRegions(scssDocument, visibleRanges);

      // Verify SCSS parser was used
      assert.ok(mockSCSSParser.parseDocumentCalled);
    });

    test('should use CSS parser for CSS documents', () => {
      const cssDocument = {
        ...mockDocument,
        languageId: 'css'
      } as vscode.TextDocument;

      const visibleRanges = [new vscode.Range(0, 0, 5, 0)];
      analyzer.analyzeVisibleRegions(cssDocument, visibleRanges);

      // Verify CSS parser was used
      assert.ok(mockCSSParser.parseDocumentCalled);
    });
  });

  suite('Region Processing', () => {
    test('should handle large documents efficiently', () => {
      const largeDocument = createMockDocument(1000); // 1000 lines
      const visibleRanges = [new vscode.Range(0, 0, 50, 0)];

      const startTime = Date.now();
      const result = analyzer.analyzeVisibleRegions(largeDocument, visibleRanges);
      const endTime = Date.now();

      assert.ok(result);
      assert.ok(endTime - startTime < 1000); // Should complete within 1 second
    });

    test('should adjust line numbers correctly for regions', () => {
      const visibleRanges = [new vscode.Range(10, 0, 15, 0)];

      const result = analyzer.analyzeVisibleRegions(mockDocument, visibleRanges);

      // Check that line numbers are adjusted for the region offset
      if (result.colorMatches.length > 0) {
        const match = result.colorMatches[0];
        assert.ok(match.range.start.line >= 10);
      }
    });
  });

  suite('Background Analysis', () => {
    test('should schedule background analysis for remaining regions', async () => {
      const visibleRanges = [new vscode.Range(0, 0, 5, 0)];

      analyzer.analyzeVisibleRegions(mockDocument, visibleRanges);

      // Wait for background analysis to potentially start
      await new Promise(resolve => setTimeout(resolve, 150));

      const stats = analyzer.getStats();
      // Background analysis might be in progress or completed
      assert.ok(stats.cachedDocuments >= 1);
    });
  });

  suite('Error Handling', () => {
    test('should handle parser errors gracefully', () => {
      const errorParser = new MockParser('css', true); // Will throw errors
      const errorAnalyzer = new IncrementalAnalyzer(errorParser, mockSCSSParser);

      const visibleRanges = [new vscode.Range(0, 0, 5, 0)];

      assert.doesNotThrow(() => {
        errorAnalyzer.analyzeVisibleRegions(mockDocument, visibleRanges);
      });

      errorAnalyzer.dispose();
    });

    test('should handle invalid ranges gracefully', () => {
      const invalidRanges = [
        new vscode.Range(100, 0, 200, 0) // Beyond document length
      ];

      assert.doesNotThrow(() => {
        analyzer.analyzeVisibleRegions(mockDocument, invalidRanges);
      });
    });

    test('should handle dispose multiple times', () => {
      assert.doesNotThrow(() => {
        analyzer.dispose();
        analyzer.dispose(); // Should not throw on second dispose
      });
    });
  });
});

// Mock classes and helper functions

class MockParser implements Parser {
  parseDocumentCalled = false;

  constructor(
    private type: 'css' | 'scss',
    private shouldThrow = false
  ) {}

  parseDocument(document: vscode.TextDocument): ParseResult {
    this.parseDocumentCalled = true;

    if (this.shouldThrow) {
      throw new Error('Mock parser error');
    }

    // Return mock results based on document content
    const text = document.getText();
    const lines = text.split('\n');

    const colorValues: ColorMatch[] = [];
    const variableDefinitions: VariableDefinition[] = [];
    const variableUsages: VariableUsage[] = [];

    lines.forEach((line, index) => {
      // Mock color detection
      if (line.includes('#')) {
        colorValues.push({
          value: '#ff0000',
          range: new vscode.Range(index, 0, index, 7),
          colorValue: ColorValueImpl.fromString('#ff0000')!
        });
      }

      // Mock variable detection
      if (this.type === 'css' && line.includes('--')) {
        variableDefinitions.push({
          name: '--test-var',
          value: '#ff0000',
          range: new vscode.Range(index, 0, index, 20),
          type: 'css-custom-property'
        });
      } else if (this.type === 'scss' && line.includes('$')) {
        variableDefinitions.push({
          name: '$test-var',
          value: '#ff0000',
          range: new vscode.Range(index, 0, index, 20),
          type: 'scss-variable'
        });
      }
    });

    return {
      colorValues,
      variableDefinitions,
      variableUsages
    };
  }

  findColorValues(): ColorMatch[] {
    return [];
  }

  findVariableDefinitions(): VariableDefinition[] {
    return [];
  }

  findVariableUsages(): VariableUsage[] {
    return [];
  }
}

function createMockDocument(lineCount = 20): vscode.TextDocument {
  const lines = Array.from({ length: lineCount }, (_, i) => 
    i % 5 === 0 ? `/* Line ${i} with #ff0000 color */` : `/* Line ${i} */`
  );

  return {
    uri: vscode.Uri.parse('test://test.css'),
    fileName: 'test.css',
    languageId: 'css',
    version: 1,
    lineCount,
    getText: (range?: vscode.Range) => {
      if (!range) {
        return lines.join('\n');
      }
      return lines.slice(range.start.line, range.end.line + 1).join('\n');
    },
    lineAt: (line: number) => ({
      text: lines[line] || '',
      lineNumber: line,
      range: new vscode.Range(line, 0, line, (lines[line] || '').length),
      rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
      firstNonWhitespaceCharacterIndex: 0,
      isEmptyOrWhitespace: false
    })
  } as vscode.TextDocument;
}