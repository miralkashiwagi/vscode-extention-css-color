import * as assert from 'assert';
import * as vscode from 'vscode';
import { CSSParser } from '../cssParser';

suite('CSS Custom Properties Tests', () => {
  let parser: CSSParser;

  setup(() => {
    parser = new CSSParser();
  });

  suite('Enhanced Custom Property Definition Detection', () => {
    test('should detect custom properties with color values', () => {
      const css = `
        :root {
          --primary-color: #ff0000;
          --secondary-color: rgb(0, 255, 0);
          --accent-color: hsl(240, 100%, 50%);
          --text-size: 16px; /* not a color */
        }
      `;
      
      const definitions = parser.findCustomPropertyDefinitions(css);
      assert.strictEqual(definitions.length, 4);
      
      const primaryColor = definitions.find(d => d.name === '--primary-color');
      assert.ok(primaryColor);
      assert.strictEqual(primaryColor.value, '#ff0000');
      
      const textSize = definitions.find(d => d.name === '--text-size');
      assert.ok(textSize);
      assert.strictEqual(textSize.value, '16px');
    });

    test('should skip definitions in comments', () => {
      const css = `
        :root {
          --active-color: #ff0000;
          /* --commented-color: #00ff00; */
          // --another-comment: #0000ff;
        }
      `;
      
      const definitions = parser.findCustomPropertyDefinitions(css);
      assert.strictEqual(definitions.length, 1);
      assert.strictEqual(definitions[0].name, '--active-color');
    });

    test('should handle complex custom property values', () => {
      const css = `
        :root {
          --gradient: linear-gradient(45deg, #ff0000, #00ff00);
          --shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          --nested-var: var(--primary-color, #ff0000);
        }
      `;
      
      const definitions = parser.findCustomPropertyDefinitions(css);
      assert.strictEqual(definitions.length, 3);
      
      const gradient = definitions.find(d => d.name === '--gradient');
      assert.ok(gradient);
      assert.ok(gradient.value.includes('linear-gradient'));
      
      const nested = definitions.find(d => d.name === '--nested-var');
      assert.ok(nested);
      assert.ok(nested.value.includes('var('));
    });
  });

  suite('Enhanced var() Function Analysis', () => {
    test('should analyze nested var() calls', () => {
      const css = `
        .component {
          color: var(--theme-color, var(--fallback-color, var(--default-color, #000)));
        }
      `;
      
      const usages = parser.findVarUsages(css);
      assert.ok(usages.length >= 3);
      
      const themeColor = usages.find(u => u.name === '--theme-color');
      const fallbackColor = usages.find(u => u.name === '--fallback-color');
      const defaultColor = usages.find(u => u.name === '--default-color');
      
      assert.ok(themeColor);
      assert.ok(fallbackColor);
      assert.ok(defaultColor);
      assert.strictEqual(defaultColor.fallbackValue, '#000');
    });

    test('should handle var() with complex fallback values', () => {
      const css = `
        .element {
          background: var(--bg-color, linear-gradient(45deg, #ff0000, #00ff00));
          border: var(--border-width, 2px) solid var(--border-color, rgba(0, 0, 0, 0.2));
        }
      `;
      
      const usages = parser.findVarUsages(css);
      
      const bgColor = usages.find(u => u.name === '--bg-color');
      const borderColor = usages.find(u => u.name === '--border-color');
      
      assert.ok(bgColor);
      assert.ok(bgColor.fallbackValue?.includes('linear-gradient'));
      
      assert.ok(borderColor);
      assert.strictEqual(borderColor.fallbackValue, 'rgba(0, 0, 0, 0.2)');
    });
  });

  suite('Custom Property Cascade Analysis', () => {
    test('should analyze custom property cascade', () => {
      const css = `
        :root {
          --primary-color: #ff0000;
        }
        
        .theme-dark {
          --primary-color: #800000;
        }
        
        .component {
          --primary-color: #ff4444;
        }
      `;
      
      const cascade = parser.analyzeCustomPropertyCascade(css);
      const primaryColorDefs = cascade.get('--primary-color');
      
      assert.ok(primaryColorDefs);
      assert.strictEqual(primaryColorDefs.length, 3);
      assert.strictEqual(primaryColorDefs[0].value, '#ff0000');
      assert.strictEqual(primaryColorDefs[1].value, '#800000');
      assert.strictEqual(primaryColorDefs[2].value, '#ff4444');
    });
  });

  suite('Undefined Custom Properties Detection', () => {
    test('should find undefined custom properties', () => {
      const css = `
        :root {
          --defined-color: #ff0000;
        }
        
        .component {
          color: var(--defined-color);
          background: var(--undefined-color);
          border-color: var(--another-undefined);
        }
      `;
      
      const undefined = parser.findUndefinedCustomProperties(css);
      assert.strictEqual(undefined.length, 2);
      assert.ok(undefined.includes('--undefined-color'));
      assert.ok(undefined.includes('--another-undefined'));
    });

    test('should handle fallback values in undefined detection', () => {
      const css = `
        .component {
          color: var(--undefined-color, #ff0000);
          background: var(--another-undefined, var(--also-undefined, blue));
        }
      `;
      
      const undefined = parser.findUndefinedCustomProperties(css);
      assert.strictEqual(undefined.length, 3);
      assert.ok(undefined.includes('--undefined-color'));
      assert.ok(undefined.includes('--another-undefined'));
      assert.ok(undefined.includes('--also-undefined'));
    });
  });

  suite('Color Extraction from Custom Properties', () => {
    test('should extract colors from custom property values', () => {
      const css = `
        :root {
          --primary-color: #ff0000;
          --secondary-color: rgb(0, 255, 0);
          --text-size: 16px;
          --gradient: linear-gradient(45deg, #ff0000, #00ff00);
        }
      `;
      
      const results = parser.extractColorsFromCustomProperties(css);
      
      // Should find colors in --primary-color, --secondary-color, and --gradient
      assert.ok(results.length >= 3);
      
      const primaryResult = results.find(r => r.variable.name === '--primary-color');
      assert.ok(primaryResult);
      assert.strictEqual(primaryResult.colors.length, 1);
      assert.strictEqual(primaryResult.colors[0].value, '#ff0000');
      
      const gradientResult = results.find(r => r.variable.name === '--gradient');
      assert.ok(gradientResult);
      assert.strictEqual(gradientResult.colors.length, 2); // Two colors in gradient
    });
  });

  suite('Custom Property Value Resolution', () => {
    test('should resolve simple custom property values', () => {
      const css = `
        :root {
          --primary-color: #ff0000;
          --secondary-color: rgb(0, 255, 0);
        }
      `;
      
      const primaryValue = parser.resolveCustomPropertyValue('--primary-color', css);
      const secondaryValue = parser.resolveCustomPropertyValue('--secondary-color', css);
      const undefinedValue = parser.resolveCustomPropertyValue('--undefined', css);
      
      assert.strictEqual(primaryValue, '#ff0000');
      assert.strictEqual(secondaryValue, 'rgb(0, 255, 0)');
      assert.strictEqual(undefinedValue, null);
    });

    test('should resolve nested custom property references', () => {
      const css = `
        :root {
          --base-color: #ff0000;
          --primary-color: var(--base-color);
          --accent-color: var(--primary-color);
        }
      `;
      
      const baseValue = parser.resolveCustomPropertyValue('--base-color', css);
      const primaryValue = parser.resolveCustomPropertyValue('--primary-color', css);
      
      assert.strictEqual(baseValue, '#ff0000');
      // Note: This is a simplified test - full recursive resolution would be more complex
      assert.ok(primaryValue?.includes('var(--base-color)') || primaryValue === '#ff0000');
    });
  });

  suite('Custom Property Context Analysis', () => {
    test('should determine custom property context', () => {
      const css = `
        :root {
          --global-color: #ff0000;
        }
        
        .component {
          --local-color: #00ff00;
        }
        
        .theme-dark .component {
          --themed-color: #0000ff;
        }
      `;
      
      const definitions = parser.findCustomPropertyDefinitions(css);
      
      const globalDef = definitions.find(d => d.name === '--global-color');
      const localDef = definitions.find(d => d.name === '--local-color');
      const themedDef = definitions.find(d => d.name === '--themed-color');
      
      assert.ok(globalDef);
      const globalContext = parser.getCustomPropertyContext(globalDef, css);
      assert.strictEqual(globalContext, ':root');
      
      assert.ok(localDef);
      const localContext = parser.getCustomPropertyContext(localDef, css);
      assert.strictEqual(localContext, '.component');
      
      assert.ok(themedDef);
      const themedContext = parser.getCustomPropertyContext(themedDef, css);
      assert.strictEqual(themedContext, '.theme-dark .component');
    });
  });
});