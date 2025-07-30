import * as assert from 'assert';
import * as vscode from 'vscode';
import { VariableResolverImpl } from '../variableResolver';
import { ErrorHandlerImpl } from '../errorHandler';

suite('VariableResolver Tests', () => {
  let resolver: VariableResolverImpl;
  let errorHandler: ErrorHandlerImpl;

  setup(() => {
    errorHandler = new ErrorHandlerImpl();
    resolver = new VariableResolverImpl(errorHandler);
  });

  suite('CSS Variable Resolution', () => {
    test('should resolve CSS custom property to color', () => {
      const css = `
        :root {
          --primary-color: #ff0000;
          --secondary-color: rgb(0, 255, 0);
        }
      `;
      
      const mockDocument = createMockDocument(css, 'css');
      
      const primaryColor = resolver.resolveCSSVariable('--primary-color', mockDocument);
      const secondaryColor = resolver.resolveCSSVariable('--secondary-color', mockDocument);
      const undefinedColor = resolver.resolveCSSVariable('--undefined', mockDocument);
      
      assert.ok(primaryColor);
      assert.strictEqual(primaryColor.hex, '#ff0000');
      
      assert.ok(secondaryColor);
      assert.strictEqual(secondaryColor.rgb.r, 0);
      assert.strictEqual(secondaryColor.rgb.g, 255);
      assert.strictEqual(secondaryColor.rgb.b, 0);
      
      assert.strictEqual(undefinedColor, null);
    });

    test('should resolve CSS variable chains', () => {
      const css = `
        :root {
          --base-color: #ff0000;
          --primary-color: var(--base-color);
          --accent-color: var(--primary-color);
        }
      `;
      
      const mockDocument = createMockDocument(css, 'css');
      
      const baseColor = resolver.resolveCSSVariable('--base-color', mockDocument);
      const primaryColor = resolver.resolveCSSVariable('--primary-color', mockDocument);
      const accentColor = resolver.resolveCSSVariable('--accent-color', mockDocument);
      
      assert.ok(baseColor);
      assert.strictEqual(baseColor.hex, '#ff0000');
      
      assert.ok(primaryColor);
      assert.strictEqual(primaryColor.hex, '#ff0000');
      
      assert.ok(accentColor);
      assert.strictEqual(accentColor.hex, '#ff0000');
    });

    test('should handle CSS variable fallbacks', () => {
      const css = `
        :root {
          --defined-color: #ff0000;
        }
        
        .component {
          color: var(--undefined-color, #00ff00);
          background: var(--defined-color, #0000ff);
        }
      `;
      
      const mockDocument = createMockDocument(css, 'css');
      
      // Test fallback resolution
      const fallbackResult = resolver.resolveVariableWithFallback('--undefined-color', '#00ff00', mockDocument);
      const definedResult = resolver.resolveVariableWithFallback('--defined-color', '#0000ff', mockDocument);
      
      assert.ok(fallbackResult);
      assert.strictEqual(fallbackResult.hex, '#00ff00');
      
      assert.ok(definedResult);
      assert.strictEqual(definedResult.hex, '#ff0000'); // Should use defined value, not fallback
    });
  });

  suite('SCSS Variable Resolution', () => {
    test('should resolve SCSS variables to colors', () => {
      const scss = `
        $primary-color: #ff0000;
        $secondary-color: rgb(0, 255, 0);
        $font-size: 16px; // Not a color
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      
      const primaryColor = resolver.resolveSCSSVariable('$primary-color', mockDocument);
      const secondaryColor = resolver.resolveSCSSVariable('$secondary-color', mockDocument);
      const fontSize = resolver.resolveSCSSVariable('$font-size', mockDocument);
      const undefinedVar = resolver.resolveSCSSVariable('$undefined', mockDocument);
      
      assert.ok(primaryColor);
      assert.strictEqual(primaryColor.hex, '#ff0000');
      
      assert.ok(secondaryColor);
      assert.strictEqual(secondaryColor.rgb.g, 255);
      
      assert.strictEqual(fontSize, null); // Not a color
      assert.strictEqual(undefinedVar, null);
    });

    test('should resolve SCSS variable chains', () => {
      const scss = `
        $base-color: #ff0000;
        $primary-color: $base-color;
        $accent-color: $primary-color;
        $hover-color: darken($accent-color, 10%);
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      
      const baseColor = resolver.resolveSCSSVariable('$base-color', mockDocument);
      const primaryColor = resolver.resolveSCSSVariable('$primary-color', mockDocument);
      const accentColor = resolver.resolveSCSSVariable('$accent-color', mockDocument);
      
      assert.ok(baseColor);
      assert.strictEqual(baseColor.hex, '#ff0000');
      
      assert.ok(primaryColor);
      assert.strictEqual(primaryColor.hex, '#ff0000');
      
      assert.ok(accentColor);
      assert.strictEqual(accentColor.hex, '#ff0000');
      
      // Note: darken() function resolution would require SCSS compilation
      // For now, we test that the variable chain resolves correctly
    });
  });

  suite('Variable Definition and Usage Detection', () => {
    test('should find variable definitions in CSS', () => {
      const css = `
        :root {
          --primary-color: #ff0000;
          --secondary-color: #00ff00;
        }
        
        .theme-dark {
          --primary-color: #800000;
        }
      `;
      
      const mockDocument = createMockDocument(css, 'css');
      const definitions = resolver.findVariableDefinitions(mockDocument);
      
      assert.strictEqual(definitions.length, 3);
      
      const primaryDefs = definitions.filter(def => def.name === '--primary-color');
      assert.strictEqual(primaryDefs.length, 2); // Defined twice
      
      const secondaryDefs = definitions.filter(def => def.name === '--secondary-color');
      assert.strictEqual(secondaryDefs.length, 1);
    });

    test('should find variable definitions in SCSS', () => {
      const scss = `
        $primary-color: #ff0000;
        $secondary-color: #00ff00;
        
        @mixin button-theme {
          $local-color: #0000ff;
        }
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      const definitions = resolver.findVariableDefinitions(mockDocument);
      
      assert.strictEqual(definitions.length, 3);
      assert.ok(definitions.some(def => def.name === '$primary-color'));
      assert.ok(definitions.some(def => def.name === '$secondary-color'));
      assert.ok(definitions.some(def => def.name === '$local-color'));
    });

    test('should find variable usages', () => {
      const css = `
        :root {
          --primary-color: #ff0000;
        }
        
        .button {
          color: var(--primary-color);
          background: var(--secondary-color, #00ff00);
        }
      `;
      
      const mockDocument = createMockDocument(css, 'css');
      const usages = resolver.findVariableUsages(mockDocument);
      
      assert.ok(usages.length >= 2);
      
      const primaryUsages = usages.filter(usage => usage.name === '--primary-color');
      const secondaryUsages = usages.filter(usage => usage.name === '--secondary-color');
      
      assert.strictEqual(primaryUsages.length, 1);
      assert.strictEqual(secondaryUsages.length, 1);
      assert.strictEqual(secondaryUsages[0].fallbackValue, '#00ff00');
    });
  });

  suite('Variable Context Building', () => {
    test('should build variable context for CSS document', () => {
      const css = `
        :root {
          --primary-color: #ff0000;
          --secondary-color: #00ff00;
        }
        
        .component {
          color: var(--primary-color);
          background: var(--undefined-color, #0000ff);
        }
      `;
      
      const mockDocument = createMockDocument(css, 'css');
      const context = resolver.buildVariableContext(mockDocument);
      
      assert.strictEqual(context.definitions.size, 2);
      assert.ok(context.definitions.has('--primary-color'));
      assert.ok(context.definitions.has('--secondary-color'));
      
      assert.ok(context.usages.length >= 2);
      assert.strictEqual(context.scope, 'file');
    });

    test('should build variable context for SCSS document', () => {
      const scss = `
        @import 'variables';
        @use 'theme' as theme;
        
        $local-color: #ff0000;
        
        .component {
          color: $local-color;
          background: theme.$bg-color;
        }
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      const context = resolver.buildVariableContext(mockDocument);
      
      assert.strictEqual(context.definitions.size, 1);
      assert.ok(context.definitions.has('$local-color'));
      
      assert.ok(context.usages.length >= 1);
      assert.strictEqual(context.imports.length, 2); // @import and @use
      assert.strictEqual(context.scope, 'file');
    });
  });

  suite('Variable Dependencies and References', () => {
    test('should find variable references', () => {
      const css = `
        :root {
          --primary-color: #ff0000;
        }
        
        .button {
          color: var(--primary-color);
        }
        
        .card {
          background: var(--primary-color);
        }
      `;
      
      const mockDocument = createMockDocument(css, 'css');
      const references = resolver.findVariableReferences('--primary-color', mockDocument);
      
      assert.strictEqual(references.length, 2); // Used in .button and .card
      assert.ok(references.every(ref => ref.name === '--primary-color'));
    });

    test('should find variable dependencies', () => {
      const scss = `
        $base-color: #ff0000;
        $primary-color: $base-color;
        $secondary-color: darken($base-color, 20%);
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      
      const primaryDeps = resolver.findVariableDependencies('$primary-color', mockDocument);
      const secondaryDeps = resolver.findVariableDependencies('$secondary-color', mockDocument);
      const baseDeps = resolver.findVariableDependencies('$base-color', mockDocument);
      
      assert.deepStrictEqual(primaryDeps, ['$base-color']);
      assert.ok(secondaryDeps.includes('$base-color'));
      assert.strictEqual(baseDeps.length, 0); // No dependencies
    });
  });

  suite('Variable Validation', () => {
    test('should validate variable usage', () => {
      const css = `
        :root {
          --defined-color: #ff0000;
        }
        
        .component {
          color: var(--defined-color);
          background: var(--undefined-color);
        }
      `;
      
      const mockDocument = createMockDocument(css, 'css');
      const validation = resolver.validateVariableUsage(mockDocument);
      
      assert.strictEqual(validation.length, 2);
      
      const definedValidation = validation.find(v => v.usage.name === '--defined-color');
      const undefinedValidation = validation.find(v => v.usage.name === '--undefined-color');
      
      assert.ok(definedValidation);
      assert.strictEqual(definedValidation.isValid, true);
      assert.strictEqual(definedValidation.error, undefined);
      
      assert.ok(undefinedValidation);
      assert.strictEqual(undefinedValidation.isValid, false);
      assert.ok(undefinedValidation.error?.includes('not defined'));
    });

    test('should check if variable is defined', () => {
      const scss = `
        $defined-var: #ff0000;
      `;
      
      const mockDocument = createMockDocument(scss, 'scss');
      
      assert.strictEqual(resolver.isVariableDefined('$defined-var', mockDocument), true);
      assert.strictEqual(resolver.isVariableDefined('$undefined-var', mockDocument), false);
    });
  });

  suite('Color Extraction', () => {
    test('should extract colors from variables', () => {
      const mixed = `
        :root {
          --css-color: #ff0000;
          --css-size: 16px;
        }
        
        $scss-color: rgb(0, 255, 0);
        $scss-font: 'Arial';
      `;
      
      const mockDocument = createMockDocument(mixed, 'css'); // Mixed content
      const colorResults = resolver.extractColorsFromVariables(mockDocument);
      

      
      assert.ok(colorResults.length >= 1); // At least one color should be found
      
      // Check if we found any color variables
      const hasColorVariable = colorResults.some(r => 
        r.variable.name === '--css-color' || r.variable.name === '$scss-color'
      );
      assert.ok(hasColorVariable, 'Should find at least one color variable');
    });
  });

  suite('Caching', () => {
    test('should cache variable context', () => {
      const css = `
        :root {
          --primary-color: #ff0000;
        }
      `;
      
      const mockDocument = createMockDocument(css, 'css');
      
      const context1 = resolver.getVariableContext(mockDocument);
      const context2 = resolver.getVariableContext(mockDocument);
      
      // Should return the same cached instance
      assert.strictEqual(context1, context2);
      
      resolver.clearCache();
      const context3 = resolver.getVariableContext(mockDocument);
      
      // Should create new instance after cache clear
      assert.notStrictEqual(context1, context3);
      assert.strictEqual(context1.definitions.size, context3.definitions.size);
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