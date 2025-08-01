import * as vscode from 'vscode';
import { Parser } from './interfaces';
import { ColorMatch, VariableDefinition, VariableUsage, ParseResult } from './types';
import { ColorValueImpl } from './colorValue';

export class SCSSParser implements Parser {
  // Regular expressions for color detection (same as CSS)
  private static readonly COLOR_PATTERNS = {
    // Hex colors: #RGB, #RRGGBB, #RGBA, #RRGGBBAA
    hex: /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{8})\b/g,
    
    // RGB/RGBA colors: rgb(r, g, b) or rgba(r, g, b, a)
    rgb: /rgba?\(\s*([^)]+)\s*\)/g,
    
    // HSL/HSLA colors: hsl(h, s%, l%) or hsla(h, s%, l%, a)
    hsl: /hsla?\(\s*([^)]+)\s*\)/g,
    
    // Named colors (basic set)
    named: /\b(black|white|red|green|blue|yellow|cyan|magenta|silver|gray|grey|maroon|olive|lime|aqua|teal|navy|fuchsia|purple|orange|transparent)\b/g
  };

  // Regular expressions for SCSS variables
  private static readonly SCSS_VARIABLE_PATTERNS = {
    // SCSS variable definition: $variable-name: value;
    definition: /\$([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g,
    
    // SCSS variable usage: $variable-name
    usage: /\$([a-zA-Z0-9-_]+)\b/g,
    
    // SCSS import statements: @import 'file';
    import: /@import\s+['"]([^'"]+)['"];?/g,
    
    // SCSS use statements: @use 'file';
    use: /@use\s+['"]([^'"]+)['"](?:\s+as\s+([a-zA-Z0-9-_*]+))?;?/g
  };

  parseDocument(document: vscode.TextDocument): ParseResult {
    const text = document.getText();
    
    return {
      colorValues: this.findColorValues(text),
      variableDefinitions: this.findVariableDefinitions(text),
      variableUsages: this.findVariableUsages(text)
    };
  }

  findColorValues(text: string): ColorMatch[] {
    const matches: ColorMatch[] = [];
    const lines = text.split('\n');

    // Find all color matches
    lines.forEach((line, lineIndex) => {
      // Skip SCSS comments
      if (this.isLineInComment(line)) {
        return;
      }

      // Check each color pattern
      Object.entries(SCSSParser.COLOR_PATTERNS).forEach(([, pattern]) => {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;

        while ((match = regex.exec(line)) !== null) {
          const colorString = match[0];
          const colorValue = ColorValueImpl.fromString(colorString);

          if (colorValue.isValid) {
            const startPos = new vscode.Position(lineIndex, match.index);
            const endPos = new vscode.Position(lineIndex, match.index + colorString.length);
            const range = new vscode.Range(startPos, endPos);

            matches.push({
              value: colorString,
              range,
              colorValue
            });
          }
        }
      });
    });

    return matches;
  }

  findVariableDefinitions(text: string): VariableDefinition[] {
    const definitions: VariableDefinition[] = [];
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
      // Skip SCSS comments
      if (this.isLineInComment(line)) {
        return;
      }

      const regex = new RegExp(SCSSParser.SCSS_VARIABLE_PATTERNS.definition.source, 'g');
      let match;

      while ((match = regex.exec(line)) !== null) {
        const variableName = `$${match[1]}`;
        const value = match[2].trim();
        
        const startPos = new vscode.Position(lineIndex, match.index);
        const endPos = new vscode.Position(lineIndex, match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        definitions.push({
          name: variableName,
          value,
          range,
          type: 'scss-variable'
        });
      }
    });

    return definitions;
  }

  findVariableUsages(text: string): VariableUsage[] {
    const usages: VariableUsage[] = [];
    const lines = text.split('\n');
    // const definitions = this.findVariableDefinitions(text);
    // const definedVariables = new Set(definitions.map(def => def.name));

    lines.forEach((line, lineIndex) => {
      // Skip SCSS comments
      if (this.isLineInComment(line)) {
        return;
      }

      const regex = new RegExp(SCSSParser.SCSS_VARIABLE_PATTERNS.usage.source, 'g');
      let match;

      while ((match = regex.exec(line)) !== null) {
        const variableName = `$${match[1]}`;
        
        // Skip if this is a variable definition (not usage)
        if (this.isVariableDefinition(line, match.index)) {
          continue;
        }
        
        const startPos = new vscode.Position(lineIndex, match.index);
        const endPos = new vscode.Position(lineIndex, match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        usages.push({
          name: variableName,
          range,
          type: 'scss-variable'
        });
      }
    });

    return usages;
  }

  // SCSS-specific methods

  /**
   * Find SCSS import statements
   */
  findImports(text: string): Array<{ path: string; range: vscode.Range }> {
    const imports: Array<{ path: string; range: vscode.Range }> = [];
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
      // Skip SCSS comments
      if (this.isLineInComment(line)) {
        return;
      }

      const regex = new RegExp(SCSSParser.SCSS_VARIABLE_PATTERNS.import.source, 'g');
      let match;

      while ((match = regex.exec(line)) !== null) {
        const importPath = match[1];
        const startPos = new vscode.Position(lineIndex, match.index);
        const endPos = new vscode.Position(lineIndex, match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        imports.push({
          path: importPath,
          range
        });
      }
    });

    return imports;
  }

  /**
   * Find SCSS @use statements
   */
  findUseStatements(text: string): Array<{ path: string; alias?: string; range: vscode.Range }> {
    const useStatements: Array<{ path: string; alias?: string; range: vscode.Range }> = [];
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
      // Skip SCSS comments
      if (this.isLineInComment(line)) {
        return;
      }

      const regex = new RegExp(SCSSParser.SCSS_VARIABLE_PATTERNS.use.source, 'g');
      let match;

      while ((match = regex.exec(line)) !== null) {
        const usePath = match[1];
        const alias = match[2];
        const startPos = new vscode.Position(lineIndex, match.index);
        const endPos = new vscode.Position(lineIndex, match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        useStatements.push({
          path: usePath,
          alias,
          range
        });
      }
    });

    return useStatements;
  }

  /**
   * Find SCSS variable definitions with default values
   */
  findVariableDefinitionsWithDefaults(text: string): Array<{ definition: VariableDefinition; hasDefault: boolean }> {
    const definitions = this.findVariableDefinitions(text);
    const results: Array<{ definition: VariableDefinition; hasDefault: boolean }> = [];

    definitions.forEach(def => {
      const hasDefault = def.value.includes('!default');
      results.push({
        definition: def,
        hasDefault
      });
    });

    return results;
  }

  /**
   * Resolve SCSS variable value with variable reference chain
   */
  resolveVariableValue(variableName: string, text: string, visited: Set<string> = new Set()): string | null {
    // Prevent circular references
    if (visited.has(variableName)) {
      return null;
    }
    visited.add(variableName);

    const definitions = this.findVariableDefinitions(text);
    const definition = definitions.find(def => def.name === variableName);
    
    if (!definition) {
      visited.delete(variableName);
      return null;
    }

    let value = definition.value.replace(/\s*!default\s*$/, '').trim();

    // If the value is just another variable reference, resolve it
    const singleVariableMatch = value.match(/^\$([a-zA-Z0-9-_]+)$/);
    if (singleVariableMatch) {
      const referencedVariable = value;
      const referencedValue = this.resolveVariableValue(referencedVariable, text, visited);
      visited.delete(variableName);
      return referencedValue;
    }

    // If the value contains variable references, resolve them
    const variableUsageRegex = /\$([a-zA-Z0-9-_]+)/g;
    let match;
    let resolvedValue = value;
    // Reset regex
    variableUsageRegex.lastIndex = 0;
    
    while ((match = variableUsageRegex.exec(value)) !== null) {
      const referencedVariable = `$${match[1]}`;
      const referencedValue = this.resolveVariableValue(referencedVariable, text, visited);
      
      if (referencedValue !== null) {
        resolvedValue = resolvedValue.replace(match[0], referencedValue);
      } else {
        // If we can't resolve a referenced variable, return null
        visited.delete(variableName);
        return null;
      }
    }

    visited.delete(variableName);
    return resolvedValue;
  }

  /**
   * Find SCSS variables that are used but not defined
   */
  findUndefinedVariables(text: string): string[] {
    const definitions = this.findVariableDefinitions(text);
    const usages = this.findVariableUsages(text);
    
    const definedNames = new Set(definitions.map(def => def.name));
    const usedNames = new Set(usages.map(usage => usage.name));
    
    const undefined: string[] = [];
    usedNames.forEach(name => {
      if (!definedNames.has(name)) {
        undefined.push(name);
      }
    });

    return undefined;
  }

  /**
   * Extract color values from SCSS variable definitions
   */
  extractColorsFromVariables(text: string): Array<{ variable: VariableDefinition; colors: ColorMatch[] }> {
    const definitions = this.findVariableDefinitions(text);
    const results: Array<{ variable: VariableDefinition; colors: ColorMatch[] }> = [];

    definitions.forEach(def => {
      const colors = this.findColorValues(def.value);
      if (colors.length > 0) {
        results.push({ variable: def, colors });
      }
    });

    return results;
  }

  // Utility methods

  private isLineInComment(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || 
           trimmed.startsWith('/*') || 
           (trimmed.includes('/*') && !trimmed.includes('*/'));
  }

  private isVariableDefinition(line: string, variableIndex: number): boolean {
    // Check if the variable is followed by a colon (indicating definition)
    const afterVariable = line.substring(variableIndex);
    const colonMatch = afterVariable.match(/^\$[a-zA-Z0-9-_]+\s*:/);
    return colonMatch !== null;
  }



  /**
   * Get SCSS variable definition context (mixin, function, selector, etc.)
   */
  getVariableContext(definition: VariableDefinition, text: string): string {
    const lines = text.split('\n');
    const defLine = definition.range.start.line;
    
    // Look backwards to find the context
    for (let i = defLine; i >= 0; i--) {
      const line = lines[i].trim();
      
      // Check for mixin definition
      if (line.startsWith('@mixin')) {
        const mixinMatch = line.match(/@mixin\s+([a-zA-Z0-9-_]+)/);
        return mixinMatch ? `@mixin ${mixinMatch[1]}` : '@mixin';
      }
      
      // Check for function definition
      if (line.startsWith('@function')) {
        const functionMatch = line.match(/@function\s+([a-zA-Z0-9-_]+)/);
        return functionMatch ? `@function ${functionMatch[1]}` : '@function';
      }
      
      // Check for selector
      if (line.includes('{')) {
        const selectorLine = line.substring(0, line.indexOf('{')).trim();
        if (selectorLine) {
          return selectorLine;
        }
      }
    }
    
    return 'global'; // Default context
  }

  // Enhanced SCSS variable usage analysis methods

  /**
   * Find SCSS variable usages with enhanced context analysis
   */
  findVariableUsagesEnhanced(text: string): VariableUsage[] {
    const usages: VariableUsage[] = [];
    const lines = text.split('\n');
    // const definitions = this.findVariableDefinitions(text);
    // const definedVariables = new Set(definitions.map(def => def.name));

    lines.forEach((line, lineIndex) => {
      // Skip SCSS comments
      if (this.isLineInComment(line)) {
        return;
      }

      // Find all variable usages in the line
      const variableMatches = this.findVariableMatchesInLine(line, lineIndex);
      
      variableMatches.forEach(match => {
        // Skip if this is a variable definition (not usage)
        if (this.isVariableDefinition(line, match.range.start.character)) {
          return;
        }

        usages.push(match);
      });
    });

    return usages;
  }

  /**
   * Find variable matches in a single line with context
   */
  private findVariableMatchesInLine(line: string, lineIndex: number): VariableUsage[] {
    const matches: VariableUsage[] = [];
    const regex = new RegExp(SCSSParser.SCSS_VARIABLE_PATTERNS.usage.source, 'g');
    let match;

    while ((match = regex.exec(line)) !== null) {
      const variableName = `$${match[1]}`;
      const startPos = new vscode.Position(lineIndex, match.index);
      const endPos = new vscode.Position(lineIndex, match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);

      // Determine usage context
      // const context = this.getVariableUsageContext(line, match.index);

      const usage: VariableUsage = {
        name: variableName,
        range,
        type: 'scss-variable'
      };

      matches.push(usage);
    }

    return matches;
  }



  /**
   * Analyze variable reference chains and dependencies
   */
  analyzeVariableReferences(text: string): Map<string, string[]> {
    const references = new Map<string, string[]>();
    const definitions = this.findVariableDefinitions(text);

    definitions.forEach(def => {
      const referencedVariables: string[] = [];
      const variableRegex = /\$([a-zA-Z0-9-_]+)/g;
      let match;

      while ((match = variableRegex.exec(def.value)) !== null) {
        const referencedVar = `$${match[1]}`;
        if (referencedVar !== def.name) {
          referencedVariables.push(referencedVar);
        }
      }

      references.set(def.name, referencedVariables);
    });

    return references;
  }

  /**
   * Find variable dependency tree
   */
  buildVariableDependencyTree(text: string): Map<string, Set<string>> {
    const tree = new Map<string, Set<string>>();
    const references = this.analyzeVariableReferences(text);

    // Initialize tree
    references.forEach((deps, variable) => {
      if (!tree.has(variable)) {
        tree.set(variable, new Set());
      }
      deps.forEach(dep => {
        if (!tree.has(dep)) {
          tree.set(dep, new Set());
        }
        tree.get(dep)!.add(variable);
      });
    });

    return tree;
  }

  /**
   * Find variables that depend on a given variable
   */
  findDependentVariables(variableName: string, text: string): string[] {
    const tree = this.buildVariableDependencyTree(text);
    const dependents: string[] = [];
    const visited = new Set<string>();

    const collectDependents = (varName: string) => {
      if (visited.has(varName)) {return;}
      visited.add(varName);

      const directDependents = tree.get(varName);
      if (directDependents) {
        directDependents.forEach(dependent => {
          dependents.push(dependent);
          collectDependents(dependent);
        });
      }
    };

    collectDependents(variableName);
    return dependents;
  }

  /**
   * Find SCSS variables used in specific contexts (mixins, functions, etc.)
   */
  findVariablesInContext(text: string, contextType: 'mixin' | 'function' | 'selector'): Array<{
    context: string;
    variables: VariableUsage[];
  }> {
    const results: Array<{ context: string; variables: VariableUsage[] }> = [];
    const lines = text.split('\n');
    let currentContext: string | null = null;
    let currentVariables: VariableUsage[] = [];
    let braceLevel = 0;

    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();

      // Track brace levels
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceLevel += openBraces - closeBraces;

      // Check for context start
      if (contextType === 'mixin' && trimmed.startsWith('@mixin')) {
        const mixinMatch = trimmed.match(/@mixin\s+([a-zA-Z0-9-_]+)/);
        if (mixinMatch) {
          currentContext = mixinMatch[1];
          currentVariables = [];
        }
      } else if (contextType === 'function' && trimmed.startsWith('@function')) {
        const functionMatch = trimmed.match(/@function\s+([a-zA-Z0-9-_]+)/);
        if (functionMatch) {
          currentContext = functionMatch[1];
          currentVariables = [];
        }
      } else if (contextType === 'selector' && trimmed.includes('{') && !trimmed.startsWith('@')) {
        const selectorMatch = trimmed.match(/^([^{]+)\s*{/);
        if (selectorMatch) {
          currentContext = selectorMatch[1].trim();
          currentVariables = [];
        }
      }

      // Collect variables in current context
      if (currentContext && braceLevel > 0) {
        const lineVariables = this.findVariableMatchesInLine(line, lineIndex);
        lineVariables.forEach(variable => {
          if (!this.isVariableDefinition(line, variable.range.start.character)) {
            currentVariables.push(variable);
          }
        });
      }

      // Context end
      if (currentContext && braceLevel === 0 && closeBraces > 0) {
        results.push({
          context: currentContext,
          variables: [...currentVariables]
        });
        currentContext = null;
        currentVariables = [];
      }
    });

    return results;
  }

  /**
   * Find SCSS variables used in interpolation #{$variable}
   */
  findInterpolatedVariables(text: string): VariableUsage[] {
    const interpolatedVars: VariableUsage[] = [];
    const lines = text.split('\n');
    const interpolationRegex = /#\{\s*(\$[a-zA-Z0-9-_]+)\s*\}/g;

    lines.forEach((line, lineIndex) => {
      let match;
      while ((match = interpolationRegex.exec(line)) !== null) {
        const variableName = match[1];
        const startPos = new vscode.Position(lineIndex, match.index + match[0].indexOf(variableName));
        const endPos = new vscode.Position(lineIndex, match.index + match[0].indexOf(variableName) + variableName.length);
        const range = new vscode.Range(startPos, endPos);

        interpolatedVars.push({
          name: variableName,
          range,
          type: 'scss-variable'
        });
      }
    });

    return interpolatedVars;
  }

  /**
   * Find SCSS variables used in calculations and expressions
   */
  findVariablesInExpressions(text: string): Array<{
    expression: string;
    variables: VariableUsage[];
    range: vscode.Range;
  }> {
    const expressions: Array<{ expression: string; variables: VariableUsage[]; range: vscode.Range }> = [];
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
      // Find expressions with mathematical operations
      const mathExpressions = line.match(/[^:;{}]*[\+\-\*\/][^:;{}]*/g);
      
      if (mathExpressions) {
        mathExpressions.forEach(expr => {
          const variables: VariableUsage[] = [];
          const variableRegex = /\$([a-zA-Z0-9-_]+)/g;
          let match;

          while ((match = variableRegex.exec(expr)) !== null) {
            const variableName = `$${match[1]}`;
            const exprStart = line.indexOf(expr);
            const varStart = exprStart + match.index;
            
            const startPos = new vscode.Position(lineIndex, varStart);
            const endPos = new vscode.Position(lineIndex, varStart + variableName.length);
            const range = new vscode.Range(startPos, endPos);

            variables.push({
              name: variableName,
              range,
              type: 'scss-variable'
            });
          }

          if (variables.length > 0) {
            const exprStart = line.indexOf(expr);
            const startPos = new vscode.Position(lineIndex, exprStart);
            const endPos = new vscode.Position(lineIndex, exprStart + expr.length);
            const range = new vscode.Range(startPos, endPos);

            expressions.push({
              expression: expr.trim(),
              variables,
              range
            });
          }
        });
      }
    });

    return expressions;
  }

  /**
   * Resolve variable value with full context (including imports)
   */
  resolveVariableValueWithImports(
    variableName: string, 
    text: string, 
    importResolver?: (path: string) => string | null
  ): string | null {
    // First try to resolve in current file
    const localValue = this.resolveVariableValue(variableName, text);
    if (localValue !== null) {
      return localValue;
    }

    // If not found locally and we have an import resolver, check imports
    if (importResolver) {
      const imports = this.findImports(text);
      const useStatements = this.findUseStatements(text);

      // Check @import statements
      for (const importStmt of imports) {
        const importedContent = importResolver(importStmt.path);
        if (importedContent) {
          const importedValue = this.resolveVariableValue(variableName, importedContent);
          if (importedValue !== null) {
            return importedValue;
          }
        }
      }

      // Check @use statements
      for (const useStmt of useStatements) {
        const importedContent = importResolver(useStmt.path);
        if (importedContent) {
          // Handle namespaced variables for @use
          let searchVariableName = variableName;
          if (useStmt.alias && useStmt.alias !== '*') {
            // Remove namespace prefix if present
            const namespacePrefix = `${useStmt.alias}.`;
            if (variableName.startsWith(`$${namespacePrefix}`)) {
              searchVariableName = variableName.substring(namespacePrefix.length + 1);
              searchVariableName = `$${searchVariableName}`;
            }
          }

          const importedValue = this.resolveVariableValue(searchVariableName, importedContent);
          if (importedValue !== null) {
            return importedValue;
          }
        }
      }
    }

    return null;
  }

  /**
   * Find all variable scopes and their definitions
   */
  analyzeVariableScopes(text: string): Array<{
    scope: string;
    variables: VariableDefinition[];
    range: vscode.Range;
  }> {
    const scopes: Array<{ scope: string; variables: VariableDefinition[]; range: vscode.Range }> = [];
    const lines = text.split('\n');
    const allDefinitions = this.findVariableDefinitions(text);
    
    let currentScope = 'global';
    let scopeStart = 0;
    let braceLevel = 0;
    let scopeVariables: VariableDefinition[] = [];

    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();
      
      // Track brace levels
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceLevel += openBraces - closeBraces;

      // Detect scope changes
      if (trimmed.startsWith('@mixin')) {
        const mixinMatch = trimmed.match(/@mixin\s+([a-zA-Z0-9-_]+)/);
        if (mixinMatch) {
          currentScope = `@mixin ${mixinMatch[1]}`;
          scopeStart = lineIndex;
          scopeVariables = [];
        }
      } else if (trimmed.startsWith('@function')) {
        const functionMatch = trimmed.match(/@function\s+([a-zA-Z0-9-_]+)/);
        if (functionMatch) {
          currentScope = `@function ${functionMatch[1]}`;
          scopeStart = lineIndex;
          scopeVariables = [];
        }
      } else if (trimmed.includes('{') && !trimmed.startsWith('@') && braceLevel === 1) {
        const selectorMatch = trimmed.match(/^([^{]+)\s*{/);
        if (selectorMatch) {
          currentScope = selectorMatch[1].trim();
          scopeStart = lineIndex;
          scopeVariables = [];
        }
      }

      // Collect variables in current scope
      const lineDefinitions = allDefinitions.filter(def => def.range.start.line === lineIndex);
      scopeVariables.push(...lineDefinitions);

      // Scope end
      if (braceLevel === 0 && closeBraces > 0 && currentScope !== 'global') {
        const startPos = new vscode.Position(scopeStart, 0);
        const endPos = new vscode.Position(lineIndex, line.length);
        const range = new vscode.Range(startPos, endPos);

        scopes.push({
          scope: currentScope,
          variables: [...scopeVariables],
          range
        });

        currentScope = 'global';
        scopeVariables = [];
      }
    });

    // Add global scope variables
    const globalVariables = allDefinitions.filter(def => 
      !scopes.some(scope => 
        def.range.start.line >= scope.range.start.line && 
        def.range.start.line <= scope.range.end.line
      )
    );

    if (globalVariables.length > 0) {
      scopes.unshift({
        scope: 'global',
        variables: globalVariables,
        range: new vscode.Range(0, 0, lines.length - 1, lines[lines.length - 1].length)
      });
    }

    return scopes;
  }
}