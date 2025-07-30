import * as assert from 'assert';
import * as vscode from 'vscode';
import { SCSSParser } from '../scssParser';

suite('SCSSParser Tests', () => {
  let parser: SCSSParser;

  setup(() => {
    parser = new SCSSParser();
  });

  suite('Color Value Detection', () => {
    test('should detect hex colors in SCSS', () => {
      const scss = `
        $primary-color: #ff0000;
        $secondary-color: #00ff00;
        .class { color: #0000ff; }
      `;
      
      const matches = parser.findColorValues(scss);
      assert.strictEqual(matches.length, 3);
      assert.strictEqual(matches[0].value, '#ff0000');
      assert.strictEqual(matches[1].value, '#00ff00');
      assert.strictEqual(matches[2].value, '#0000ff');
    });

    test('should detect rgb and hsl colors in SCSS', () => {
      const scss = `
        $color1: rgb(255, 0, 0);
        $color2: rgba(0, 255, 0, 0.5);
        $color3: hsl(240, 100%, 50%);
        $color4: hsla(120, 100%, 50%, 0.8);
      `;
      
      const matches = parser.findColorValues(scss);
      assert.strictEqual(matches.length, 4);
      assert.strictEqual(matches[0].value, 'rgb(255, 0, 0)');
      assert.strictEqual(matches[1].value, 'rgba(0, 255, 0, 0.5)');
      assert.strictEqual(matches[2].value, 'hsl(240, 100%, 50%)');
      assert.strictEqual(matches[3].value, 'hsla(120, 100%, 50%, 0.8)');
    });

    test('should skip colors in SCSS comments', () => {
      const scss = `
        $active-color: #ff0000;
        // $commented-color: #00ff00;
        /* $block-comment-color: #0000ff; */
      `;
      
      const matches = parser.findColorValues(scss);
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].value, '#ff0000');
    });
  });

  suite('SCSS Variable Definition Detection', () => {
    test('should detect SCSS variable definitions', () => {
      const scss = `
        $primary-color: #ff0000;
        $secondary-color: rgb(0, 255, 0);
        $font-size: 16px;
        $line-height: 1.5;
      `;
      
      const definitions = parser.findVariableDefinitions(scss);
      assert.strictEqual(definitions.length, 4);
      
      assert.strictEqual(definitions[0].name, '$primary-color');
      assert.strictEqual(definitions[0].value, '#ff0000');
      assert.strictEqual(definitions[0].type, 'scss-variable');
      
      assert.strictEqual(definitions[1].name, '$secondary-color');
      assert.strictEqual(definitions[1].value, 'rgb(0, 255, 0)');
      
      assert.strictEqual(definitions[2].name, '$font-size');
      assert.strictEqual(definitions[2].value, '16px');
      
      assert.strictEqual(definitions[3].name, '$line-height');
      assert.strictEqual(definitions[3].value, '1.5');
    });

    test('should handle variable names with hyphens and underscores', () => {
      const scss = `
        $primary_color: #ff0000;
        $secondary-color-dark: #800000;
        $color123: #00ff00;
        $_private-var: #0000ff;
      `;
      
      const definitions = parser.findVariableDefinitions(scss);
      assert.strictEqual(definitions.length, 4);
      assert.strictEqual(definitions[0].name, '$primary_color');
      assert.strictEqual(definitions[1].name, '$secondary-color-dark');
      assert.strictEqual(definitions[2].name, '$color123');
      assert.strictEqual(definitions[3].name, '$_private-var');
    });

    test('should provide correct ranges for variable definitions', () => {
      const scss = '  $test-color: #ff0000;';
      const definitions = parser.findVariableDefinitions(scss);
      
      assert.strictEqual(definitions.length, 1);
      const definition = definitions[0];
      assert.strictEqual(definition.range.start.line, 0);
      assert.strictEqual(definition.range.start.character, 2);
    });
  });

  suite('SCSS Variable Usage Detection', () => {
    test('should detect SCSS variable usage', () => {
      const scss = `
        $primary-color: #ff0000;
        $secondary-color: #00ff00;
        
        .header {
          color: $primary-color;
          background: $secondary-color;
        }
      `;
      
      const usages = parser.findVariableUsages(scss);
      assert.strictEqual(usages.length, 2);
      
      assert.strictEqual(usages[0].name, '$primary-color');
      assert.strictEqual(usages[0].type, 'scss-variable');
      
      assert.strictEqual(usages[1].name, '$secondary-color');
      assert.strictEqual(usages[1].type, 'scss-variable');
    });

    test('should not detect variable definitions as usage', () => {
      const scss = `
        $primary-color: #ff0000;
        $secondary-color: $primary-color;
        
        .class {
          color: $primary-color;
        }
      `;
      
      const usages = parser.findVariableUsages(scss);
      // Should find 2 usages: $primary-color in $secondary-color definition and in .class
      assert.strictEqual(usages.length, 2);
      assert.strictEqual(usages[0].name, '$primary-color');
      assert.strictEqual(usages[1].name, '$primary-color');
    });

    test('should handle complex variable usage scenarios', () => {
      const scss = `
        $base-color: #ff0000;
        $hover-color: darken($base-color, 10%);
        
        .button {
          background: $base-color;
          border: 1px solid $base-color;
          
          &:hover {
            background: $hover-color;
          }
        }
      `;
      
      const usages = parser.findVariableUsages(scss);
      assert.ok(usages.length >= 3); // At least 3 variable usages
      
      const baseColorUsages = usages.filter(u => u.name === '$base-color');
      const hoverColorUsages = usages.filter(u => u.name === '$hover-color');
      
      assert.ok(baseColorUsages.length >= 2);
      assert.strictEqual(hoverColorUsages.length, 1);
    });
  });

  suite('SCSS Import Detection', () => {
    test('should detect @import statements', () => {
      const scss = `
        @import 'variables';
        @import "mixins";
        @import 'components/button';
        
        .component {
          color: red;
        }
      `;
      
      const imports = parser.findImports(scss);
      assert.strictEqual(imports.length, 3);
      assert.strictEqual(imports[0].path, 'variables');
      assert.strictEqual(imports[1].path, 'mixins');
      assert.strictEqual(imports[2].path, 'components/button');
    });
  });

  suite('SCSS @use Detection', () => {
    test('should detect @use statements', () => {
      const scss = `
        @use 'sass:math';
        @use 'variables' as vars;
        @use 'mixins' as *;
        
        .component {
          width: math.div(100px, 2);
        }
      `;
      
      const useStatements = parser.findUseStatements(scss);
      assert.strictEqual(useStatements.length, 3);
      
      assert.strictEqual(useStatements[0].path, 'sass:math');
      assert.strictEqual(useStatements[0].alias, undefined);
      
      assert.strictEqual(useStatements[1].path, 'variables');
      assert.strictEqual(useStatements[1].alias, 'vars');
      
      assert.strictEqual(useStatements[2].path, 'mixins');
      assert.strictEqual(useStatements[2].alias, '*');
    });
  });

  suite('SCSS Variable Definitions with Defaults', () => {
    test('should detect variables with !default', () => {
      const scss = `
        $primary-color: #ff0000 !default;
        $secondary-color: #00ff00;
        $font-size: 16px !default;
      `;
      
      const results = parser.findVariableDefinitionsWithDefaults(scss);
      assert.strictEqual(results.length, 3);
      
      assert.strictEqual(results[0].definition.name, '$primary-color');
      assert.strictEqual(results[0].hasDefault, true);
      
      assert.strictEqual(results[1].definition.name, '$secondary-color');
      assert.strictEqual(results[1].hasDefault, false);
      
      assert.strictEqual(results[2].definition.name, '$font-size');
      assert.strictEqual(results[2].hasDefault, true);
    });
  });

  suite('SCSS Variable Value Resolution', () => {
    test('should resolve simple variable values', () => {
      const scss = `
        $primary-color: #ff0000;
        $secondary-color: rgb(0, 255, 0);
        $font-size: 16px;
      `;
      
      const primaryValue = parser.resolveVariableValue('$primary-color', scss);
      const secondaryValue = parser.resolveVariableValue('$secondary-color', scss);
      const fontSizeValue = parser.resolveVariableValue('$font-size', scss);
      const undefinedValue = parser.resolveVariableValue('$undefined', scss);
      
      assert.strictEqual(primaryValue, '#ff0000');
      assert.strictEqual(secondaryValue, 'rgb(0, 255, 0)');
      assert.strictEqual(fontSizeValue, '16px');
      assert.strictEqual(undefinedValue, null);
    });

    test('should resolve nested variable references', () => {
      const scss = `
        $base-color: #ff0000;
        $primary-color: $base-color;
        $accent-color: $primary-color;
      `;
      
      const baseValue = parser.resolveVariableValue('$base-color', scss);
      const primaryValue = parser.resolveVariableValue('$primary-color', scss);
      const accentValue = parser.resolveVariableValue('$accent-color', scss);
      
      assert.strictEqual(baseValue, '#ff0000');
      assert.strictEqual(primaryValue, '#ff0000');
      assert.strictEqual(accentValue, '#ff0000');
    });

    test('should handle !default values in resolution', () => {
      const scss = `
        $base-color: #ff0000 !default;
        $primary-color: $base-color;
      `;
      
      const baseValue = parser.resolveVariableValue('$base-color', scss);
      const primaryValue = parser.resolveVariableValue('$primary-color', scss);
      
      assert.strictEqual(baseValue, '#ff0000');
      assert.strictEqual(primaryValue, '#ff0000');
    });

    test('should prevent circular references', () => {
      const scss = `
        $color-a: $color-b;
        $color-b: $color-a;
      `;
      
      const valueA = parser.resolveVariableValue('$color-a', scss);
      const valueB = parser.resolveVariableValue('$color-b', scss);
      
      assert.strictEqual(valueA, null);
      assert.strictEqual(valueB, null);
    });
  });

  suite('Undefined Variables Detection', () => {
    test('should find undefined variables', () => {
      const scss = `
        $defined-color: #ff0000;
        
        .component {
          color: $defined-color;
          background: $undefined-color;
          border-color: $another-undefined;
        }
      `;
      
      const undefined = parser.findUndefinedVariables(scss);
      assert.strictEqual(undefined.length, 2);
      assert.ok(undefined.includes('$undefined-color'));
      assert.ok(undefined.includes('$another-undefined'));
    });
  });

  suite('Color Extraction from Variables', () => {
    test('should extract colors from SCSS variable values', () => {
      const scss = `
        $primary-color: #ff0000;
        $secondary-color: rgb(0, 255, 0);
        $font-size: 16px;
        $gradient: linear-gradient(45deg, #ff0000, #00ff00);
      `;
      
      const results = parser.extractColorsFromVariables(scss);
      
      // Should find colors in $primary-color, $secondary-color, and $gradient
      assert.ok(results.length >= 3);
      
      const primaryResult = results.find(r => r.variable.name === '$primary-color');
      assert.ok(primaryResult);
      assert.strictEqual(primaryResult.colors.length, 1);
      assert.strictEqual(primaryResult.colors[0].value, '#ff0000');
      
      const gradientResult = results.find(r => r.variable.name === '$gradient');
      assert.ok(gradientResult);
      assert.strictEqual(gradientResult.colors.length, 2); // Two colors in gradient
    });
  });

  suite('Variable Context Analysis', () => {
    test('should determine variable context', () => {
      const scss = `
        $global-color: #ff0000;
        
        @mixin button-theme {
          $local-color: #00ff00;
        }
        
        @function get-color() {
          $function-color: #0000ff;
          @return $function-color;
        }
        
        .component {
          $component-color: #ffff00;
        }
      `;
      
      const definitions = parser.findVariableDefinitions(scss);
      
      const globalDef = definitions.find(d => d.name === '$global-color');
      const localDef = definitions.find(d => d.name === '$local-color');
      const functionDef = definitions.find(d => d.name === '$function-color');
      const componentDef = definitions.find(d => d.name === '$component-color');
      
      assert.ok(globalDef);
      const globalContext = parser.getVariableContext(globalDef, scss);
      assert.strictEqual(globalContext, 'global');
      
      assert.ok(localDef);
      const localContext = parser.getVariableContext(localDef, scss);
      assert.strictEqual(localContext, '@mixin button-theme');
      
      assert.ok(functionDef);
      const functionContext = parser.getVariableContext(functionDef, scss);
      assert.strictEqual(functionContext, '@function get-color');
      
      assert.ok(componentDef);
      const componentContext = parser.getVariableContext(componentDef, scss);
      assert.strictEqual(componentContext, '.component');
    });
  });

  suite('Document Parsing Integration', () => {
    test('should parse complete SCSS document', () => {
      const scss = `
        // Variables
        $primary: #ff0000;
        $secondary: rgb(0, 255, 0);
        
        // Mixins
        @mixin button-style {
          background: $primary;
          color: white;
        }
        
        // Components
        .button {
          @include button-style;
          border: 1px solid $secondary;
        }
        
        .header {
          color: hsl(240, 100%, 50%);
          background: $primary;
        }
      `;
      
      // Create a mock document
      const mockDocument = {
        getText: () => scss
      } as vscode.TextDocument;
      
      const result = parser.parseDocument(mockDocument);
      
      // Should find variable definitions
      assert.strictEqual(result.variableDefinitions.length, 2);
      assert.strictEqual(result.variableDefinitions[0].name, '$primary');
      assert.strictEqual(result.variableDefinitions[1].name, '$secondary');
      
      // Should find variable usages
      assert.ok(result.variableUsages.length >= 2);
      
      // Should find color values
      assert.ok(result.colorValues.length >= 3); // At least the direct color values
    });
  });
});