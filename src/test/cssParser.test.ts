import * as assert from 'assert';
import * as vscode from 'vscode';
import { CSSParser } from '../cssParser';

suite('CSSParser Tests', () => {
  let parser: CSSParser;

  setup(() => {
    parser = new CSSParser();
  });

  suite('Color Value Detection', () => {
    test('should detect hex colors', () => {
      const css = `
        .class1 { color: #ff0000; }
        .class2 { background: #00ff00; }
        .class3 { border-color: #0000ff; }
      `;
      
      const matches = parser.findColorValues(css);
      assert.strictEqual(matches.length, 3);
      assert.strictEqual(matches[0].value, '#ff0000');
      assert.strictEqual(matches[1].value, '#00ff00');
      assert.strictEqual(matches[2].value, '#0000ff');
    });

    test('should detect rgb colors', () => {
      const css = `
        .class1 { color: rgb(255, 0, 0); }
        .class2 { background: rgba(0, 255, 0, 0.5); }
      `;
      
      const matches = parser.findColorValues(css);
      assert.strictEqual(matches.length, 2);
      assert.strictEqual(matches[0].value, 'rgb(255, 0, 0)');
      assert.strictEqual(matches[1].value, 'rgba(0, 255, 0, 0.5)');
    });

    test('should detect hsl colors', () => {
      const css = `
        .class1 { color: hsl(0, 100%, 50%); }
        .class2 { background: hsla(120, 100%, 50%, 0.8); }
      `;
      
      const matches = parser.findColorValues(css);
      assert.strictEqual(matches.length, 2);
      assert.strictEqual(matches[0].value, 'hsl(0, 100%, 50%)');
      assert.strictEqual(matches[1].value, 'hsla(120, 100%, 50%, 0.8)');
    });

    test('should detect named colors', () => {
      const css = `
        .class1 { color: red; }
        .class2 { background: transparent; }
        .class3 { border-color: blue; }
      `;
      
      const matches = parser.findColorValues(css);
      assert.strictEqual(matches.length, 3);
      assert.strictEqual(matches[0].value, 'red');
      assert.strictEqual(matches[1].value, 'transparent');
      assert.strictEqual(matches[2].value, 'blue');
    });

    test('should provide correct ranges for color matches', () => {
      const css = '.test { color: #ff0000; }';
      const matches = parser.findColorValues(css);
      
      assert.strictEqual(matches.length, 1);
      const match = matches[0];
      assert.strictEqual(match.range.start.line, 0);
      assert.strictEqual(match.range.start.character, 15);
      assert.strictEqual(match.range.end.character, 22);
    });
  });

  suite('CSS Variable Definition Detection', () => {
    test('should detect CSS custom property definitions', () => {
      const css = `
        :root {
          --primary-color: #ff0000;
          --secondary-color: rgb(0, 255, 0);
          --accent-color: hsl(240, 100%, 50%);
        }
      `;
      
      const definitions = parser.findVariableDefinitions(css);
      assert.strictEqual(definitions.length, 3);
      
      assert.strictEqual(definitions[0].name, '--primary-color');
      assert.strictEqual(definitions[0].value, '#ff0000');
      assert.strictEqual(definitions[0].type, 'css-custom-property');
      
      assert.strictEqual(definitions[1].name, '--secondary-color');
      assert.strictEqual(definitions[1].value, 'rgb(0, 255, 0)');
      
      assert.strictEqual(definitions[2].name, '--accent-color');
      assert.strictEqual(definitions[2].value, 'hsl(240, 100%, 50%)');
    });

    test('should handle variable names with hyphens and underscores', () => {
      const css = `
        :root {
          --primary_color: #ff0000;
          --secondary-color-dark: #800000;
          --color123: #00ff00;
        }
      `;
      
      const definitions = parser.findVariableDefinitions(css);
      assert.strictEqual(definitions.length, 3);
      assert.strictEqual(definitions[0].name, '--primary_color');
      assert.strictEqual(definitions[1].name, '--secondary-color-dark');
      assert.strictEqual(definitions[2].name, '--color123');
    });

    test('should provide correct ranges for variable definitions', () => {
      const css = '  --test-color: #ff0000;';
      const definitions = parser.findVariableDefinitions(css);
      
      assert.strictEqual(definitions.length, 1);
      const definition = definitions[0];
      assert.strictEqual(definition.range.start.line, 0);
      assert.strictEqual(definition.range.start.character, 2);
    });
  });

  suite('CSS Variable Usage Detection', () => {
    test('should detect var() usage without fallback', () => {
      const css = `
        .class1 { color: var(--primary-color); }
        .class2 { background: var(--secondary-color); }
      `;
      
      const usages = parser.findVariableUsages(css);
      assert.strictEqual(usages.length, 2);
      
      assert.strictEqual(usages[0].name, '--primary-color');
      assert.strictEqual(usages[0].type, 'css-var');
      assert.strictEqual(usages[0].fallbackValue, undefined);
      
      assert.strictEqual(usages[1].name, '--secondary-color');
      assert.strictEqual(usages[1].fallbackValue, undefined);
    });

    test('should detect var() usage with fallback values', () => {
      const css = `
        .class1 { color: var(--primary-color, #ff0000); }
        .class2 { background: var(--secondary-color, rgb(0, 255, 0)); }
        .class3 { border: var(--border-width, 1px) solid var(--border-color, black); }
      `;
      
      const usages = parser.findVariableUsages(css);
      

      
      // We expect 4 usages: --primary-color, --secondary-color, --border-width, --border-color
      assert.strictEqual(usages.length, 4);
      
      const primaryUsage = usages.find(u => u.name === '--primary-color');
      const secondaryUsage = usages.find(u => u.name === '--secondary-color');
      const borderColorUsage = usages.find(u => u.name === '--border-color');
      
      assert.ok(primaryUsage);
      assert.strictEqual(primaryUsage.fallbackValue, '#ff0000');
      
      assert.ok(secondaryUsage);
      assert.strictEqual(secondaryUsage.fallbackValue, 'rgb(0, 255, 0)');
      
      assert.ok(borderColorUsage);
      assert.strictEqual(borderColorUsage.fallbackValue, 'black');
    });

    test('should handle complex fallback values', () => {
      const css = '.test { color: var(--color, var(--fallback, #ff0000)); }';
      const usages = parser.findVariableUsages(css);
      

      
      // We expect to find both the outer var() and the nested var() in the fallback
      assert.ok(usages.length >= 2);
      
      const colorUsage = usages.find(u => u.name === '--color');
      const fallbackUsage = usages.find(u => u.name === '--fallback');
      
      assert.ok(colorUsage);
      assert.strictEqual(colorUsage.fallbackValue, 'var(--fallback, #ff0000)');
      
      assert.ok(fallbackUsage);
      assert.strictEqual(fallbackUsage.fallbackValue, '#ff0000');
    });
  });

  suite('Regular Expression Pattern Validation', () => {
    test('hex pattern should match valid hex colors only', () => {
      const validHex = ['#fff', '#ffffff', '#FF0000', '#12345678'];
      const invalidHex = ['#gg0000', '#12345', 'ffffff', '#', '#1234567'];
      
      const hexPattern = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{8})\b/g;
      
      validHex.forEach(hex => {
        hexPattern.lastIndex = 0;
        assert.strictEqual(hexPattern.test(hex), true, `Should match ${hex}`);
      });
      
      invalidHex.forEach(hex => {
        hexPattern.lastIndex = 0;
        assert.strictEqual(hexPattern.test(hex), false, `Should not match ${hex}`);
      });
    });

    test('rgb pattern should match valid rgb/rgba colors only', () => {
      const validRgb = [
        'rgb(255, 0, 0)',
        'rgba(255, 0, 0, 0.5)',
        'rgb(100%, 0%, 0%)',
        'rgba(100%, 0%, 0%, 50%)'
      ];
      
      const rgbPattern = /rgba?\(\s*([^)]+)\s*\)/g;
      
      validRgb.forEach(rgb => {
        rgbPattern.lastIndex = 0;
        assert.strictEqual(rgbPattern.test(rgb), true, `Should match ${rgb}`);
      });
    });

    test('css variable definition pattern should be precise', () => {
      const validDefs = [
        '--color: #ff0000;',
        '--primary-color: rgb(255, 0, 0);',
        '--color_123: hsl(0, 100%, 50%);'
      ];
      
      const invalidDefs = [
        'color: #ff0000;', // missing --
        '--color #ff0000;', // missing :
        '--color: #ff0000', // missing ;
      ];
      
      const defPattern = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
      
      validDefs.forEach(def => {
        defPattern.lastIndex = 0;
        assert.strictEqual(defPattern.test(def), true, `Should match ${def}`);
      });
      
      invalidDefs.forEach(def => {
        defPattern.lastIndex = 0;
        assert.strictEqual(defPattern.test(def), false, `Should not match ${def}`);
      });
    });

    test('css variable usage pattern should handle various formats', () => {
      const validUsages = [
        'var(--color)',
        'var(--color, #ff0000)',
        'var( --color )',
        'var( --color , #ff0000 )',
        'var(--color, var(--fallback, red))'
      ];
      
      const usagePattern = /var\(\s*(--[a-zA-Z0-9-_]+)(?:\s*,\s*([^)]+))?\s*\)/g;
      
      validUsages.forEach(usage => {
        usagePattern.lastIndex = 0;
        assert.strictEqual(usagePattern.test(usage), true, `Should match ${usage}`);
      });
    });
  });

  suite('Document Parsing Integration', () => {
    test('should parse complete CSS document', () => {
      const css = `
        :root {
          --primary: #ff0000;
          --secondary: rgb(0, 255, 0);
        }
        
        .header {
          color: var(--primary);
          background: var(--secondary, blue);
          border: 1px solid #cccccc;
        }
        
        .footer {
          color: hsl(240, 100%, 50%);
          background: transparent;
        }
      `;
      
      // Create a mock document
      const mockDocument = {
        getText: () => css
      } as vscode.TextDocument;
      
      const result = parser.parseDocument(mockDocument);
      
      // Should find variable definitions
      assert.strictEqual(result.variableDefinitions.length, 2);
      assert.strictEqual(result.variableDefinitions[0].name, '--primary');
      assert.strictEqual(result.variableDefinitions[1].name, '--secondary');
      
      // Should find variable usages
      assert.strictEqual(result.variableUsages.length, 2);
      assert.strictEqual(result.variableUsages[0].name, '--primary');
      assert.strictEqual(result.variableUsages[1].name, '--secondary');
      assert.strictEqual(result.variableUsages[1].fallbackValue, 'blue');
      
      // Should find color values
      assert.ok(result.colorValues.length >= 5); // At least the direct color values
    });
  });
});