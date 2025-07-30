import * as assert from 'assert';
import * as vscode from 'vscode';
import { SCSSParser } from '../scssParser';

suite('SCSS Variable Usage Analysis Tests', () => {
  let parser: SCSSParser;

  setup(() => {
    parser = new SCSSParser();
  });

  suite('Enhanced Variable Usage Detection', () => {
    test('should detect variable usages with context', () => {
      const scss = `
        $primary-color: #ff0000;
        $secondary-color: #00ff00;
        
        .button {
          color: $primary-color;
          background: darken($secondary-color, 10%);
          border: 1px solid $primary-color;
        }
      `;
      
      const usages = parser.findVariableUsagesEnhanced(scss);
      assert.ok(usages.length >= 3);
      
      const primaryUsages = usages.filter(u => u.name === '$primary-color');
      const secondaryUsages = usages.filter(u => u.name === '$secondary-color');
      
      assert.strictEqual(primaryUsages.length, 2); // color and border
      assert.strictEqual(secondaryUsages.length, 1); // in darken function
    });

    test('should distinguish between definitions and usages', () => {
      const scss = `
        $base-color: #ff0000;
        $primary-color: $base-color;
        $secondary-color: darken($base-color, 20%);
        
        .component {
          color: $primary-color;
          background: $secondary-color;
        }
      `;
      
      const usages = parser.findVariableUsagesEnhanced(scss);
      const definitions = parser.findVariableDefinitions(scss);
      
      // Should have 3 definitions
      assert.strictEqual(definitions.length, 3);
      
      // Should have 4 usages: $base-color in $primary-color and $secondary-color definitions,
      // plus $primary-color and $secondary-color in .component
      assert.ok(usages.length >= 4);
    });
  });

  suite('Variable Reference Chain Analysis', () => {
    test('should analyze variable reference chains', () => {
      const scss = `
        $base-color: #ff0000;
        $primary-color: $base-color;
        $accent-color: $primary-color;
        $hover-color: darken($accent-color, 10%);
      `;
      
      const references = parser.analyzeVariableReferences(scss);
      
      assert.strictEqual(references.get('$base-color')?.length, 0);
      assert.deepStrictEqual(references.get('$primary-color'), ['$base-color']);
      assert.deepStrictEqual(references.get('$accent-color'), ['$primary-color']);
      assert.deepStrictEqual(references.get('$hover-color'), ['$accent-color']);
    });

    test('should build variable dependency tree', () => {
      const scss = `
        $base-color: #ff0000;
        $primary-color: $base-color;
        $secondary-color: $base-color;
        $accent-color: $primary-color;
      `;
      
      const tree = parser.buildVariableDependencyTree(scss);
      
      const baseDependents = tree.get('$base-color');
      assert.ok(baseDependents);
      assert.ok(baseDependents.has('$primary-color'));
      assert.ok(baseDependents.has('$secondary-color'));
      
      const primaryDependents = tree.get('$primary-color');
      assert.ok(primaryDependents);
      assert.ok(primaryDependents.has('$accent-color'));
    });

    test('should find dependent variables', () => {
      const scss = `
        $base-color: #ff0000;
        $primary-color: $base-color;
        $secondary-color: $base-color;
        $accent-color: $primary-color;
        $hover-color: $accent-color;
      `;
      
      const baseDependents = parser.findDependentVariables('$base-color', scss);
      assert.ok(baseDependents.includes('$primary-color'));
      assert.ok(baseDependents.includes('$secondary-color'));
      assert.ok(baseDependents.includes('$accent-color'));
      assert.ok(baseDependents.includes('$hover-color'));
      
      const primaryDependents = parser.findDependentVariables('$primary-color', scss);
      assert.ok(primaryDependents.includes('$accent-color'));
      assert.ok(primaryDependents.includes('$hover-color'));
      assert.ok(!primaryDependents.includes('$secondary-color'));
    });
  });

  suite('Context-Specific Variable Usage', () => {
    test('should find variables in mixins', () => {
      const scss = `
        $primary-color: #ff0000;
        $secondary-color: #00ff00;
        
        @mixin button-theme($bg-color: $primary-color) {
          background: $bg-color;
          color: $secondary-color;
          border: 1px solid darken($bg-color, 10%);
        }
        
        @mixin card-theme {
          background: $primary-color;
        }
      `;
      
      const mixinVariables = parser.findVariablesInContext(scss, 'mixin');
      assert.strictEqual(mixinVariables.length, 2);
      
      const buttonTheme = mixinVariables.find(m => m.context === 'button-theme');
      const cardTheme = mixinVariables.find(m => m.context === 'card-theme');
      
      assert.ok(buttonTheme);
      assert.ok(buttonTheme.variables.length >= 2); // $bg-color, $secondary-color
      
      assert.ok(cardTheme);
      assert.strictEqual(cardTheme.variables.length, 1); // $primary-color
    });

    test('should find variables in functions', () => {
      const scss = `
        $base-size: 16px;
        $scale-factor: 1.2;
        
        @function scale-size($size: $base-size, $factor: $scale-factor) {
          @return $size * $factor;
        }
        
        @function get-color($opacity: 1) {
          @return rgba($base-size, 0, 0, $opacity);
        }
      `;
      
      const functionVariables = parser.findVariablesInContext(scss, 'function');
      assert.strictEqual(functionVariables.length, 2);
      
      const scaleSize = functionVariables.find(f => f.context === 'scale-size');
      const getColor = functionVariables.find(f => f.context === 'get-color');
      
      assert.ok(scaleSize);
      assert.ok(scaleSize.variables.length >= 2); // $size, $factor
      
      assert.ok(getColor);
      assert.ok(getColor.variables.length >= 1); // $base-size
    });

    test('should find variables in selectors', () => {
      const scss = `
        $primary-color: #ff0000;
        $font-size: 16px;
        
        .button {
          color: $primary-color;
          font-size: $font-size;
        }
        
        .card {
          background: $primary-color;
        }
      `;
      
      const selectorVariables = parser.findVariablesInContext(scss, 'selector');
      assert.strictEqual(selectorVariables.length, 2);
      
      const button = selectorVariables.find(s => s.context === '.button');
      const card = selectorVariables.find(s => s.context === '.card');
      
      assert.ok(button);
      assert.strictEqual(button.variables.length, 2); // $primary-color, $font-size
      
      assert.ok(card);
      assert.strictEqual(card.variables.length, 1); // $primary-color
    });
  });

  suite('Interpolated Variables', () => {
    test('should find variables in interpolation', () => {
      const scss = `
        $prefix: 'btn';
        $size: 'large';
        $property: 'color';
        
        .#{$prefix}-#{$size} {
          #{$property}: red;
          background-image: url('images/#{$prefix}.png');
        }
      `;
      
      const interpolatedVars = parser.findInterpolatedVariables(scss);
      assert.strictEqual(interpolatedVars.length, 4);
      
      const prefixUsages = interpolatedVars.filter(v => v.name === '$prefix');
      const sizeUsages = interpolatedVars.filter(v => v.name === '$size');
      const propertyUsages = interpolatedVars.filter(v => v.name === '$property');
      
      assert.strictEqual(prefixUsages.length, 2); // In selector and URL
      assert.strictEqual(sizeUsages.length, 1); // In selector
      assert.strictEqual(propertyUsages.length, 1); // As property name
    });
  });

  suite('Variables in Expressions', () => {
    test('should find variables in mathematical expressions', () => {
      const scss = `
        $base-size: 16px;
        $scale: 1.5;
        $margin: 10px;
        
        .component {
          font-size: $base-size * $scale;
          padding: $margin + 5px;
          width: calc(100% - $margin * 2);
          height: $base-size / 2 + $margin;
        }
      `;
      
      const expressions = parser.findVariablesInExpressions(scss);
      assert.ok(expressions.length >= 3);
      
      // Check that variables are found in expressions
      const allVariables = expressions.flatMap(expr => expr.variables);
      const baseSizeUsages = allVariables.filter(v => v.name === '$base-size');
      const scaleUsages = allVariables.filter(v => v.name === '$scale');
      const marginUsages = allVariables.filter(v => v.name === '$margin');
      
      assert.ok(baseSizeUsages.length >= 2);
      assert.ok(scaleUsages.length >= 1);
      assert.ok(marginUsages.length >= 3);
    });
  });

  suite('Variable Resolution with Imports', () => {
    test('should resolve variables with import context', () => {
      const mainScss = `
        @import 'variables';
        @use 'theme' as theme;
        
        .component {
          color: $primary-color;
          background: theme.$bg-color;
        }
      `;
      
      const variablesScss = `
        $primary-color: #ff0000;
        $secondary-color: #00ff00;
      `;
      
      const themeScss = `
        $bg-color: #f0f0f0;
        $text-color: #333;
      `;
      
      const importResolver = (path: string): string | null => {
        if (path === 'variables') {return variablesScss;}
        if (path === 'theme') {return themeScss;}
        return null;
      };
      
      const primaryValue = parser.resolveVariableValueWithImports('$primary-color', mainScss, importResolver);
      const bgValue = parser.resolveVariableValueWithImports('$bg-color', themeScss);
      
      assert.strictEqual(primaryValue, '#ff0000');
      assert.strictEqual(bgValue, '#f0f0f0');
    });
  });

  suite('Variable Scope Analysis', () => {
    test('should analyze variable scopes', () => {
      const scss = `
        $global-color: #ff0000;
        
        @mixin button-mixin {
          $mixin-color: #00ff00;
          color: $mixin-color;
        }
        
        @function get-size() {
          $function-size: 16px;
          @return $function-size;
        }
        
        .component {
          $local-color: #0000ff;
          background: $local-color;
        }
      `;
      
      const scopes = parser.analyzeVariableScopes(scss);
      assert.ok(scopes.length >= 4); // global, mixin, function, selector
      
      const globalScope = scopes.find(s => s.scope === 'global');
      const mixinScope = scopes.find(s => s.scope === '@mixin button-mixin');
      const functionScope = scopes.find(s => s.scope === '@function get-size');
      const selectorScope = scopes.find(s => s.scope === '.component');
      
      assert.ok(globalScope);
      assert.strictEqual(globalScope.variables.length, 1); // $global-color
      
      assert.ok(mixinScope);
      assert.strictEqual(mixinScope.variables.length, 1); // $mixin-color
      
      assert.ok(functionScope);
      assert.strictEqual(functionScope.variables.length, 1); // $function-size
      
      assert.ok(selectorScope);
      assert.strictEqual(selectorScope.variables.length, 1); // $local-color
    });
  });

  suite('Complex Variable Usage Scenarios', () => {
    test('should handle nested variable references in complex expressions', () => {
      const scss = `
        $base-color: #ff0000;
        $primary-color: $base-color;
        $hover-color: darken($primary-color, 10%);
        $active-color: lighten($hover-color, 5%);
        
        .button {
          color: $primary-color;
          
          &:hover {
            color: $hover-color;
          }
          
          &:active {
            color: $active-color;
          }
        }
      `;
      
      const usages = parser.findVariableUsagesEnhanced(scss);
      const references = parser.analyzeVariableReferences(scss);
      const dependents = parser.findDependentVariables('$base-color', scss);
      
      // Should find all variable usages
      assert.ok(usages.length >= 6);
      
      // Should track reference chain
      assert.deepStrictEqual(references.get('$primary-color'), ['$base-color']);
      assert.deepStrictEqual(references.get('$hover-color'), ['$primary-color']);
      assert.deepStrictEqual(references.get('$active-color'), ['$hover-color']);
      
      // Should find all dependents of base color
      assert.ok(dependents.includes('$primary-color'));
      assert.ok(dependents.includes('$hover-color'));
      assert.ok(dependents.includes('$active-color'));
    });
  });
});