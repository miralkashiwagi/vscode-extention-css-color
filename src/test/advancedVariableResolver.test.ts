import * as assert from 'assert';
import * as vscode from 'vscode';
import { VariableResolverImpl } from '../variableResolver';
import { ErrorHandlerImpl } from '../errorHandler';

suite('Advanced VariableResolver Tests', () => {
  let resolver: VariableResolverImpl;
  let errorHandler: ErrorHandlerImpl;

  setup(() => {
    errorHandler = new ErrorHandlerImpl();
    resolver = new VariableResolverImpl(errorHandler);
  });

  suite('Circular Reference Detection', () => {
    test('should detect simple circular references', () => {
      const scss = `
        $color-a: $color-b;
        $color-b: $color-a;
        $color-c: #ff0000;
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      const cycles = resolver.detectCircularReferences(mockDocument);
      
      assert.strictEqual(cycles.length, 1);
      assert.ok(cycles[0].cycle.includes('$color-a'));
      assert.ok(cycles[0].cycle.includes('$color-b'));
      assert.strictEqual(cycles[0].variables.length, 2);
    });

    test('should detect complex circular references', () => {
      const scss = `
        $color-a: $color-b;
        $color-b: $color-c;
        $color-c: $color-a;
        $color-d: #ff0000;
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      const cycles = resolver.detectCircularReferences(mockDocument);
      
      assert.strictEqual(cycles.length, 1);
      assert.strictEqual(cycles[0].cycle.length, 3);
      assert.ok(cycles[0].cycle.includes('$color-a'));
      assert.ok(cycles[0].cycle.includes('$color-b'));
      assert.ok(cycles[0].cycle.includes('$color-c'));
    });

    test('should not detect false positives', () => {
      const scss = `
        $base-color: #ff0000;
        $primary-color: $base-color;
        $secondary-color: $base-color;
        $accent-color: $primary-color;
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      const cycles = resolver.detectCircularReferences(mockDocument);
      
      assert.strictEqual(cycles.length, 0);
    });
  });

  suite('Affected Variables Analysis', () => {
    test('should find variables affected by changes', () => {
      const scss = `
        $base-color: #ff0000;
        $primary-color: $base-color;
        $secondary-color: $base-color;
        $accent-color: $primary-color;
        $hover-color: darken($accent-color, 10%);
        $unrelated-color: #00ff00;
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      const affected = resolver.findAffectedVariables('$base-color', mockDocument);
      
      assert.ok(affected.length >= 4); // primary, secondary, accent, hover
      
      const affectedNames = affected.map(a => a.variable.name);
      assert.ok(affectedNames.includes('$primary-color'));
      assert.ok(affectedNames.includes('$secondary-color'));
      assert.ok(affectedNames.includes('$accent-color'));
      assert.ok(affectedNames.includes('$hover-color'));
      assert.ok(!affectedNames.includes('$unrelated-color'));
    });

    test('should provide dependency chains', () => {
      const scss = `
        $base-color: #ff0000;
        $primary-color: $base-color;
        $accent-color: $primary-color;
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      const affected = resolver.findAffectedVariables('$base-color', mockDocument);
      
      const accentAffected = affected.find(a => a.variable.name === '$accent-color');
      assert.ok(accentAffected);
      assert.ok(accentAffected.dependencyChain.includes('$accent-color'));
    });
  });

  suite('Theme Context Resolution', () => {
    test('should resolve theme-specific variables', () => {
      const css = `
        :root {
          --color: #ff0000;
          --light-color: #ff6666;
          --dark-color: #cc0000;
        }
      `;
      
      const mockDocument = createMockDocument(css, 'css');
      
      const defaultColor = resolver.resolveVariableWithTheme('--color', mockDocument);
      const lightColor = resolver.resolveVariableWithTheme('--color', mockDocument, 'light');
      const darkColor = resolver.resolveVariableWithTheme('--color', mockDocument, 'dark');
      
      assert.ok(defaultColor);
      assert.strictEqual(defaultColor.hex, '#ff0000');
      
      assert.ok(lightColor);
      assert.strictEqual(lightColor.hex, '#ff6666');
      
      assert.ok(darkColor);
      assert.strictEqual(darkColor.hex, '#cc0000');
    });

    test('should fallback to default when theme variant not found', () => {
      const scss = `
        $color: #ff0000;
        $light-color: #ff6666;
        // No dark variant
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      
      const lightColor = resolver.resolveVariableWithTheme('$color', mockDocument, 'light');
      const darkColor = resolver.resolveVariableWithTheme('$color', mockDocument, 'dark');
      
      assert.ok(lightColor);
      assert.strictEqual(lightColor.hex, '#ff6666');
      
      assert.ok(darkColor);
      assert.strictEqual(darkColor.hex, '#ff0000'); // Falls back to default
    });
  });

  suite('Variable Validation', () => {
    test('should validate variable definitions', () => {
      const scss = `
        $valid-color: #ff0000;
        $circular-a: $circular-b;
        $circular-b: $circular-a;
        $undefined-dep: $nonexistent;
        $invalid-color: #gggggg;
        $BadNaming: #00ff00;
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      const validation = resolver.validateVariableDefinitions(mockDocument);
      
      assert.ok(validation.length >= 3); // At least circular, undefined, and naming issues
      
      const circularIssue = validation.find(v => 
        v.variable.name === '$circular-a' && 
        v.issues.some(i => i.type === 'circular-reference')
      );
      assert.ok(circularIssue);
      
      const undefinedIssue = validation.find(v => 
        v.variable.name === '$undefined-dep' && 
        v.issues.some(i => i.type === 'undefined-dependency')
      );
      assert.ok(undefinedIssue);
      
      const namingIssue = validation.find(v => 
        v.variable.name === '$BadNaming' && 
        v.issues.some(i => i.type === 'naming-convention')
      );
      assert.ok(namingIssue);
    });
  });

  suite('Usage Report Generation', () => {
    test('should generate comprehensive usage report', () => {
      const scss = `
        $used-once: #ff0000;
        $used-multiple: #00ff00;
        $unused: #0000ff;
        $color-var: rgb(255, 0, 0);
        
        .component1 {
          color: $used-once;
          background: $used-multiple;
        }
        
        .component2 {
          border-color: $used-multiple;
        }
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      const report = resolver.generateUsageReport(mockDocument);
      
      assert.strictEqual(report.totalVariables, 4);
      assert.strictEqual(report.usedVariables, 2); // used-once, used-multiple
      assert.strictEqual(report.unusedVariables.length, 2); // unused, color-var
      
      assert.ok(report.unusedVariables.some(v => v.name === '$unused'));
      assert.ok(report.mostUsedVariables.some(v => v.variable.name === '$used-multiple'));
      
      const multipleUsedVar = report.mostUsedVariables.find(v => v.variable.name === '$used-multiple');
      assert.ok(multipleUsedVar);
      assert.strictEqual(multipleUsedVar.usageCount, 2);
    });
  });

  suite('Variable Optimization', () => {
    test('should suggest optimizations', () => {
      const scss = `
        $unused-var: #ff0000;
        $used-once: #00ff00;
        $used-multiple: #0000ff;
        
        .component1 {
          color: $used-once;
          background: $used-multiple;
        }
        
        .component2 {
          border-color: $used-multiple;
        }
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      const optimizations = resolver.optimizeVariables(mockDocument);
      
      assert.ok(optimizations.length >= 2);
      
      const removeOptimization = optimizations.find(o => 
        o.action === 'remove' && o.variable.name === '$unused-var'
      );
      assert.ok(removeOptimization);
      
      const inlineOptimization = optimizations.find(o => 
        o.action === 'inline' && o.variable.name === '$used-once'
      );
      assert.ok(inlineOptimization);
    });
  });

  suite('Import Path Resolution', () => {
    test('should handle relative import paths', () => {
      // Note: This test would require actual file system operations
      // For now, we test the path resolution logic conceptually
      const scss = `
        @import './variables';
        @import '../theme/colors';
        @use 'sass:math';
        
        $local-color: #ff0000;
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      const context = resolver.buildVariableContext(mockDocument);
      
      assert.strictEqual(context.imports.length, 3);
      assert.ok(context.imports.some(imp => imp.path === './variables'));
      assert.ok(context.imports.some(imp => imp.path === '../theme/colors'));
      assert.ok(context.imports.some(imp => imp.path === 'sass:math'));
    });
  });

  suite('Complex Dependency Analysis', () => {
    test('should handle complex variable dependency scenarios', () => {
      const scss = `
        // Base colors
        $red: #ff0000;
        $green: #00ff00;
        $blue: #0000ff;
        
        // Primary palette
        $primary: $red;
        $secondary: $green;
        
        // Derived colors
        $primary-light: lighten($primary, 20%);
        $primary-dark: darken($primary, 20%);
        $secondary-light: lighten($secondary, 20%);
        
        // Component colors
        $button-bg: $primary;
        $button-hover: $primary-dark;
        $button-text: white;
        
        // Complex dependencies
        $theme-primary: $button-bg;
        $theme-accent: mix($primary, $secondary, 50%);
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      
      // Test dependency tracking
      const redDependencies = resolver.findAffectedVariables('$red', mockDocument);
      const redAffectedNames = redDependencies.map(d => d.variable.name);
      
      assert.ok(redAffectedNames.includes('$primary'));
      assert.ok(redAffectedNames.includes('$primary-light'));
      assert.ok(redAffectedNames.includes('$primary-dark'));
      assert.ok(redAffectedNames.includes('$button-bg'));
      assert.ok(redAffectedNames.includes('$button-hover'));
      assert.ok(redAffectedNames.includes('$theme-primary'));
      assert.ok(redAffectedNames.includes('$theme-accent'));
      
      // Should not include unrelated variables
      assert.ok(!redAffectedNames.includes('$green'));
      assert.ok(!redAffectedNames.includes('$blue'));
      assert.ok(!redAffectedNames.includes('$button-text'));
    });
  });

  suite('Error Handling and Edge Cases', () => {
    test('should handle malformed variable definitions gracefully', () => {
      const malformedScss = `
        $valid-var: #ff0000;
        $incomplete-var: 
        $another-valid: #00ff00;
        $: #0000ff; // Invalid name
        --css-var: #ffff00;
      `;
      
      const mockDocument = createMockDocument(malformedScss, 'scss');
      
      // Should not throw errors
      assert.doesNotThrow(() => {
        const definitions = resolver.findVariableDefinitions(mockDocument);
        const usages = resolver.findVariableUsages(mockDocument);
        const validation = resolver.validateVariableDefinitions(mockDocument);
        const report = resolver.generateUsageReport(mockDocument);
      });
    });

    test('should handle empty documents', () => {
      const emptyDocument = createMockDocument('', 'scss');
      
      const definitions = resolver.findVariableDefinitions(emptyDocument);
      const usages = resolver.findVariableUsages(emptyDocument);
      const cycles = resolver.detectCircularReferences(emptyDocument);
      const report = resolver.generateUsageReport(emptyDocument);
      
      assert.strictEqual(definitions.length, 0);
      assert.strictEqual(usages.length, 0);
      assert.strictEqual(cycles.length, 0);
      assert.strictEqual(report.totalVariables, 0);
    });
  });
});

// Helper function to create mock VSCode document
function createMockDocument(content: string, languageId: string): vscode.TextDocument {
  return {
    getText: () => content,
    languageId,
    uri: vscode.Uri.parse(`test://test.${languageId}`),
    version: 1,
    fileName: `test.${languageId}`,
    isUntitled: false,
    isDirty: false,
    isClosed: false,
    save: async () => true,
    eol: vscode.EndOfLine.LF,
    encoding: 'utf8',
    lineCount: content.split('\n').length,
    lineAt: (line: number) => ({
      lineNumber: line,
      text: content.split('\n')[line] || '',
      range: new vscode.Range(line, 0, line, content.split('\n')[line]?.length || 0),
      rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
      firstNonWhitespaceCharacterIndex: 0,
      isEmptyOrWhitespace: false
    }),
    offsetAt: (position: vscode.Position) => 0,
    positionAt: (offset: number) => new vscode.Position(0, 0),
    getWordRangeAtPosition: () => undefined,
    validateRange: (range: vscode.Range) => range,
    validatePosition: (position: vscode.Position) => position
  } as unknown as vscode.TextDocument;
}