import * as vscode from 'vscode';
import { VariableResolver } from './interfaces';
import { ColorValue, VariableDefinition, VariableUsage, VariableContext } from './types';
import { ColorValueImpl } from './colorValue';
import { CSSParser } from './cssParser';
import { SCSSParser } from './scssParser';
import { 
  ErrorHandler, 
  VariableResolutionError, 
  PerformanceTimeoutError,
  withTimeout,
  safeExecute,
  safeExecuteSync
} from './errorHandler';

export class VariableResolverImpl implements VariableResolver {
  private cssParser: CSSParser;
  private scssParser: SCSSParser;
  private variableCache: Map<string, VariableContext> = new Map();
  private errorHandler: ErrorHandler;
  private readonly RESOLUTION_TIMEOUT_MS = 5000; // 5 seconds timeout
  private readonly MAX_RESOLUTION_DEPTH = 10; // Prevent infinite recursion

  constructor(errorHandler: ErrorHandler) {
    this.cssParser = new CSSParser();
    this.scssParser = new SCSSParser();
    this.errorHandler = errorHandler;
  }

  /**
   * Resolve CSS custom property value
   */
  resolveCSSVariable(variableName: string, document: vscode.TextDocument): ColorValue | null {
    return safeExecuteSync(
      () => this.resolveCSSVariableInternal(variableName, document),
      null,
      this.errorHandler,
      `resolveCSSVariable(${variableName})`
    );
  }

  /**
   * Internal CSS variable resolution with error handling
   */
  private resolveCSSVariableInternal(variableName: string, document: vscode.TextDocument): ColorValue | null {
    try {
      const text = document.getText();
      const definitions = this.cssParser.findVariableDefinitions(text);
      
      // Find the definition for this variable
      const definition = definitions.find(def => def.name === variableName);
      if (!definition) {
        throw new VariableResolutionError(
          variableName,
          'Variable definition not found',
          { documentUri: document.uri.toString() }
        );
      }

      // Try to parse the value as a color
      const colorValue = ColorValueImpl.fromString(definition.value);
      if (colorValue.isValid) {
        return colorValue;
      }

      // If the value contains another CSS variable, try to resolve it
      if (definition.value.includes('var(')) {
        const resolvedValue = this.resolveCSSVariableChain(variableName, text, 0);
        if (resolvedValue) {
          const resolvedColor = ColorValueImpl.fromString(resolvedValue);
          if (resolvedColor.isValid) {
            return resolvedColor;
          }
        }
      }

      throw new VariableResolutionError(
        variableName,
        'Variable value is not a valid color',
        { 
          documentUri: document.uri.toString(),
          variableValue: definition.value
        }
      );
    } catch (error) {
      if (error instanceof VariableResolutionError) {
        this.errorHandler.handleVariableResolutionError(error);
      } else {
        this.errorHandler.handleError(error instanceof Error ? error : new Error(String(error)));
      }
      return null;
    }
  }

  /**
   * Resolve SCSS variable value
   */
  resolveSCSSVariable(variableName: string, document: vscode.TextDocument): ColorValue | null {
    return safeExecuteSync(
      () => this.resolveSCSSVariableInternal(variableName, document),
      null,
      this.errorHandler,
      `resolveSCSSVariable(${variableName})`
    );
  }

  /**
   * Internal SCSS variable resolution with error handling
   */
  private resolveSCSSVariableInternal(variableName: string, document: vscode.TextDocument): ColorValue | null {
    try {
      const text = document.getText();
      const resolvedValue = this.scssParser.resolveVariableValue(variableName, text);
      
      if (!resolvedValue) {
        throw new VariableResolutionError(
          variableName,
          'SCSS variable definition not found',
          { documentUri: document.uri.toString() }
        );
      }

      // Try to parse the resolved value as a color
      const colorValue = ColorValueImpl.fromString(resolvedValue);
      if (colorValue.isValid) {
        return colorValue;
      }

      throw new VariableResolutionError(
        variableName,
        'SCSS variable value is not a valid color',
        { 
          documentUri: document.uri.toString(),
          variableValue: resolvedValue
        }
      );
    } catch (error) {
      if (error instanceof VariableResolutionError) {
        this.errorHandler.handleVariableResolutionError(error);
      } else {
        this.errorHandler.handleError(error instanceof Error ? error : new Error(String(error)));
      }
      return null;
    }
  }

  /**
   * Find variable definitions in document
   */
  findVariableDefinitions(document: vscode.TextDocument): VariableDefinition[] {
    const text = document.getText();
    const languageId = document.languageId;
    
    if (languageId === 'css') {
      return this.cssParser.findVariableDefinitions(text);
    } else if (languageId === 'scss' || languageId === 'sass') {
      return this.scssParser.findVariableDefinitions(text);
    }
    
    // For other file types, try both parsers
    const cssDefinitions = this.cssParser.findVariableDefinitions(text);
    const scssDefinitions = this.scssParser.findVariableDefinitions(text);
    
    return [...cssDefinitions, ...scssDefinitions];
  }

  /**
   * Find variable usages in document
   */
  findVariableUsages(document: vscode.TextDocument): VariableUsage[] {
    const text = document.getText();
    const languageId = document.languageId;
    
    if (languageId === 'css') {
      return this.cssParser.findVariableUsages(text);
    } else if (languageId === 'scss' || languageId === 'sass') {
      return this.scssParser.findVariableUsages(text);
    }
    
    // For other file types, try both parsers
    const cssUsages = this.cssParser.findVariableUsages(text);
    const scssUsages = this.scssParser.findVariableUsages(text);
    
    return [...cssUsages, ...scssUsages];
  }

  /**
   * Build variable context for a document
   */
  buildVariableContext(document: vscode.TextDocument): VariableContext {
    const definitions = this.findVariableDefinitions(document);
    const usages = this.findVariableUsages(document);
    
    // Create definitions map
    const definitionsMap = new Map<string, VariableDefinition>();
    definitions.forEach(def => {
      definitionsMap.set(def.name, def);
    });

    // Find imports (for SCSS)
    const imports: any[] = [];
    if (document.languageId === 'scss' || document.languageId === 'sass') {
      const text = document.getText();
      const scssImports = this.scssParser.findImports(text);
      const scssUseStatements = this.scssParser.findUseStatements(text);
      
      imports.push(...scssImports.map(imp => ({ path: imp.path, range: imp.range })));
      imports.push(...scssUseStatements.map(use => ({ path: use.path, range: use.range, alias: use.alias })));
    }

    return {
      definitions: definitionsMap,
      usages,
      imports,
      scope: 'file'
    };
  }

  /**
   * Resolve variable value with fallback support
   */
  resolveVariableWithFallback(
    variableName: string, 
    fallbackValue: string | undefined, 
    document: vscode.TextDocument
  ): ColorValue | null {
    // First try to resolve the variable
    const resolvedValue = this.resolveVariable(variableName, document);
    if (resolvedValue) {
      return resolvedValue;
    }

    // If variable resolution failed, try the fallback value
    if (fallbackValue) {
      const fallbackColor = ColorValueImpl.fromString(fallbackValue);
      if (fallbackColor.isValid) {
        return fallbackColor;
      }

      // If fallback contains variables, try to resolve them
      if (fallbackValue.includes('var(') || fallbackValue.includes('$')) {
        return this.resolveFallbackValue(fallbackValue, document);
      }
    }

    return null;
  }

  /**
   * Resolve a variable (CSS or SCSS) based on its name
   */
  private resolveVariable(variableName: string, document: vscode.TextDocument): ColorValue | null {
    if (variableName.startsWith('--')) {
      return this.resolveCSSVariable(variableName, document);
    } else if (variableName.startsWith('$')) {
      return this.resolveSCSSVariable(variableName, document);
    }
    
    return null;
  }

  /**
   * Resolve CSS variable chain (var() references)
   */
  private resolveCSSVariableChain(variableName: string, text: string, depth: number = 0, visited: Set<string> = new Set()): string | null {
    // Prevent infinite recursion
    if (depth >= this.MAX_RESOLUTION_DEPTH) {
      throw new VariableResolutionError(
        variableName,
        `Maximum resolution depth (${this.MAX_RESOLUTION_DEPTH}) exceeded`,
        { depth, visited: Array.from(visited) }
      );
    }

    // Prevent circular references
    if (visited.has(variableName)) {
      throw new VariableResolutionError(
        variableName,
        'Circular reference detected',
        { visited: Array.from(visited) }
      );
    }
    
    const newVisited = new Set(visited);
    newVisited.add(variableName);

    try {
      const definitions = this.cssParser.findVariableDefinitions(text);
      const definition = definitions.find(def => def.name === variableName);
      
      if (!definition) {
        throw new VariableResolutionError(
          variableName,
          'Variable definition not found in chain resolution',
          { depth, visited: Array.from(visited) }
        );
      }

      let value = definition.value.trim();

      // If the value contains var() calls, resolve them
      const varUsages = this.cssParser.findVariableUsages(value);
      
      for (const usage of varUsages) {
        try {
          const referencedValue = this.resolveCSSVariableChain(usage.name, text, depth + 1, newVisited);
          if (referencedValue) {
            // Replace the var() call with the resolved value
            const varCall = usage.fallbackValue 
              ? `var(${usage.name}, ${usage.fallbackValue})`
              : `var(${usage.name})`;
            value = value.replace(varCall, referencedValue);
          }
        } catch (error) {
          // If resolution fails, try to use fallback value
          if (usage.fallbackValue) {
            const varCall = `var(${usage.name}, ${usage.fallbackValue})`;
            value = value.replace(varCall, usage.fallbackValue);
          } else {
            // Re-throw if no fallback available
            throw error;
          }
        }
      }

      return value;
    } catch (error) {
      if (error instanceof VariableResolutionError) {
        throw error;
      }
      throw new VariableResolutionError(
        variableName,
        `Chain resolution failed: ${error instanceof Error ? error.message : String(error)}`,
        { depth, visited: Array.from(visited) }
      );
    }
  }

  /**
   * Resolve fallback value that may contain variables
   */
  private resolveFallbackValue(fallbackValue: string, document: vscode.TextDocument): ColorValue | null {
    let resolvedValue = fallbackValue;

    // Handle CSS var() in fallback
    if (fallbackValue.includes('var(')) {
      const varUsages = this.cssParser.findVariableUsages(fallbackValue);
      for (const usage of varUsages) {
        const resolved = this.resolveCSSVariable(usage.name, document);
        if (resolved) {
          const varCall = usage.fallbackValue 
            ? `var(${usage.name}, ${usage.fallbackValue})`
            : `var(${usage.name})`;
          resolvedValue = resolvedValue.replace(varCall, resolved.original);
        }
      }
    }

    // Handle SCSS variables in fallback
    if (fallbackValue.includes('$')) {
      const scssUsages = this.scssParser.findVariableUsages(fallbackValue);
      for (const usage of scssUsages) {
        const resolved = this.resolveSCSSVariable(usage.name, document);
        if (resolved) {
          resolvedValue = resolvedValue.replace(usage.name, resolved.original);
        }
      }
    }

    const colorValue = ColorValueImpl.fromString(resolvedValue);
    return colorValue.isValid ? colorValue : null;
  }

  /**
   * Get all variables that reference a given variable
   */
  findVariableReferences(targetVariable: string, document: vscode.TextDocument): VariableUsage[] {
    const allUsages = this.findVariableUsages(document);
    return allUsages.filter(usage => usage.name === targetVariable);
  }

  /**
   * Get all variables that are referenced by a given variable
   */
  findVariableDependencies(sourceVariable: string, document: vscode.TextDocument): string[] {
    const definitions = this.findVariableDefinitions(document);
    const definition = definitions.find(def => def.name === sourceVariable);
    
    if (!definition) {
      return [];
    }

    const dependencies: string[] = [];
    
    // For CSS variables, check for var() calls
    if (sourceVariable.startsWith('--')) {
      const varUsages = this.cssParser.findVariableUsages(definition.value);
      dependencies.push(...varUsages.map(usage => usage.name));
    }
    
    // For SCSS variables, check for $variable references
    if (sourceVariable.startsWith('$')) {
      const scssUsages = this.scssParser.findVariableUsages(definition.value);
      dependencies.push(...scssUsages.map(usage => usage.name));
    }

    return dependencies;
  }

  /**
   * Check if a variable is defined in the document
   */
  isVariableDefined(variableName: string, document: vscode.TextDocument): boolean {
    const definitions = this.findVariableDefinitions(document);
    return definitions.some(def => def.name === variableName);
  }

  /**
   * Get variable definition by name
   */
  getVariableDefinition(variableName: string, document: vscode.TextDocument): VariableDefinition | null {
    const definitions = this.findVariableDefinitions(document);
    return definitions.find(def => def.name === variableName) || null;
  }

  /**
   * Get all color values from variable definitions
   */
  extractColorsFromVariables(document: vscode.TextDocument): Array<{
    variable: VariableDefinition;
    color: ColorValue;
  }> {
    const definitions = this.findVariableDefinitions(document);
    const results: Array<{ variable: VariableDefinition; color: ColorValue }> = [];

    definitions.forEach(def => {
      const resolvedColor = this.resolveVariable(def.name, document);
      if (resolvedColor) {
        results.push({
          variable: def,
          color: resolvedColor
        });
      }
    });

    return results;
  }

  /**
   * Validate variable usage (check if referenced variables exist)
   */
  validateVariableUsage(document: vscode.TextDocument): Array<{
    usage: VariableUsage;
    isValid: boolean;
    error?: string;
  }> {
    const usages = this.findVariableUsages(document);
    const definitions = this.findVariableDefinitions(document);
    const definedVariables = new Set(definitions.map(def => def.name));

    return usages.map(usage => {
      const isValid = definedVariables.has(usage.name);
      return {
        usage,
        isValid,
        error: isValid ? undefined : `Variable '${usage.name}' is not defined`
      };
    });
  }

  /**
   * Clear variable cache
   */
  clearCache(): void {
    this.variableCache.clear();
  }

  /**
   * Get cached variable context or build new one
   */
  getVariableContext(document: vscode.TextDocument): VariableContext {
    const cacheKey = `${document.uri.toString()}-${document.version}`;
    
    if (this.variableCache.has(cacheKey)) {
      return this.variableCache.get(cacheKey)!;
    }

    const context = this.buildVariableContext(document);
    this.variableCache.set(cacheKey, context);
    
    return context;
  }

  // Advanced variable resolution methods

  /**
   * Resolve variables across multiple files with import support
   */
  async resolveVariableWithImports(
    variableName: string,
    document: vscode.TextDocument,
    workspaceFolder?: vscode.WorkspaceFolder
  ): Promise<ColorValue | null> {
    // First try to resolve in current document
    const localResult = this.resolveVariable(variableName, document);
    if (localResult) {
      return localResult;
    }

    // If not found locally, check imports
    if (document.languageId === 'scss' || document.languageId === 'sass') {
      return this.resolveFromSCSSImports(variableName, document, workspaceFolder);
    }

    return null;
  }

  /**
   * Resolve SCSS variable from imported files
   */
  private async resolveFromSCSSImports(
    variableName: string,
    document: vscode.TextDocument,
    workspaceFolder?: vscode.WorkspaceFolder
  ): Promise<ColorValue | null> {
    const text = document.getText();
    const imports = this.scssParser.findImports(text);
    const useStatements = this.scssParser.findUseStatements(text);

    // Check @import statements
    for (const importStmt of imports) {
      const importedDocument = await this.resolveImportPath(importStmt.path, document, workspaceFolder);
      if (importedDocument) {
        const result = this.resolveSCSSVariable(variableName, importedDocument);
        if (result) {
          return result;
        }
      }
    }

    // Check @use statements with namespace handling
    for (const useStmt of useStatements) {
      const importedDocument = await this.resolveImportPath(useStmt.path, document, workspaceFolder);
      if (importedDocument) {
        let searchVariableName = variableName;

        // Handle namespaced variables
        if (useStmt.alias && useStmt.alias !== '*') {
          // If variable has namespace prefix, remove it for search
          const namespacePrefix = `${useStmt.alias}.`;
          if (variableName.startsWith(`$${namespacePrefix}`)) {
            searchVariableName = variableName.substring(namespacePrefix.length + 1);
            searchVariableName = `$${searchVariableName}`;
          } else {
            // Skip this @use if variable doesn't match namespace
            continue;
          }
        }

        const result = this.resolveSCSSVariable(searchVariableName, importedDocument);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Resolve import path to actual document
   */
  private async resolveImportPath(
    importPath: string,
    currentDocument: vscode.TextDocument,
    workspaceFolder?: vscode.WorkspaceFolder
  ): Promise<vscode.TextDocument | null> {
    try {
      const currentDir = vscode.Uri.joinPath(currentDocument.uri, '..');
      let resolvedUri: vscode.Uri;

      // Handle relative imports
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        resolvedUri = vscode.Uri.joinPath(currentDir, importPath);
      } else {
        // Handle absolute imports from workspace root
        if (workspaceFolder) {
          resolvedUri = vscode.Uri.joinPath(workspaceFolder.uri, importPath);
        } else {
          resolvedUri = vscode.Uri.joinPath(currentDir, importPath);
        }
      }

      // Try different file extensions
      const extensions = ['', '.scss', '.sass', '.css'];
      for (const ext of extensions) {
        try {
          const uriWithExt = ext ? vscode.Uri.parse(resolvedUri.toString() + ext) : resolvedUri;
          const document = await vscode.workspace.openTextDocument(uriWithExt);
          return document;
        } catch {
          // Continue to next extension
        }
      }

      // Try with underscore prefix (SCSS partial files)
      const fileName = importPath.split('/').pop() || '';
      const dirPath = importPath.substring(0, importPath.lastIndexOf('/') + 1);
      const partialPath = dirPath + '_' + fileName;

      for (const ext of extensions) {
        try {
          const partialUri = ext 
            ? vscode.Uri.joinPath(currentDir, partialPath + ext)
            : vscode.Uri.joinPath(currentDir, partialPath);
          const document = await vscode.workspace.openTextDocument(partialUri);
          return document;
        } catch {
          // Continue to next extension
        }
      }

    } catch (error) {
      console.warn(`Failed to resolve import path: ${importPath}`, error);
    }

    return null;
  }

  /**
   * Detect circular references in variable definitions
   */
  detectCircularReferences(document: vscode.TextDocument): Array<{
    cycle: string[];
    variables: VariableDefinition[];
  }> {
    const definitions = this.findVariableDefinitions(document);
    const dependencyGraph = new Map<string, string[]>();
    const cycles: Array<{ cycle: string[]; variables: VariableDefinition[] }> = [];

    // Build dependency graph
    definitions.forEach(def => {
      const dependencies = this.findVariableDependencies(def.name, document);
      dependencyGraph.set(def.name, dependencies);
    });

    // Detect cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (variable: string, path: string[]): string[] | null => {
      if (recursionStack.has(variable)) {
        // Found a cycle
        const cycleStart = path.indexOf(variable);
        return path.slice(cycleStart);
      }

      if (visited.has(variable)) {
        return null;
      }

      visited.add(variable);
      recursionStack.add(variable);
      path.push(variable);

      const dependencies = dependencyGraph.get(variable) || [];
      for (const dep of dependencies) {
        const cycle = detectCycle(dep, [...path]);
        if (cycle) {
          return cycle;
        }
      }

      recursionStack.delete(variable);
      return null;
    };

    // Check each variable for cycles
    definitions.forEach(def => {
      if (!visited.has(def.name)) {
        const cycle = detectCycle(def.name, []);
        if (cycle) {
          const cycleVariables = cycle.map(name => 
            definitions.find(d => d.name === name)!
          ).filter(Boolean);

          cycles.push({
            cycle,
            variables: cycleVariables
          });
        }
      }
    });

    return cycles;
  }

  /**
   * Analyze variable usage across workspace
   */
  async analyzeWorkspaceVariables(
    workspaceFolder: vscode.WorkspaceFolder
  ): Promise<{
    definitions: Map<string, { document: vscode.TextDocument; definition: VariableDefinition }[]>;
    usages: Map<string, { document: vscode.TextDocument; usage: VariableUsage }[]>;
    undefinedVariables: Array<{ variable: string; document: vscode.TextDocument; usage: VariableUsage }>;
  }> {
    const definitions = new Map<string, { document: vscode.TextDocument; definition: VariableDefinition }[]>();
    const usages = new Map<string, { document: vscode.TextDocument; usage: VariableUsage }[]>();
    const undefinedVariables: Array<{ variable: string; document: vscode.TextDocument; usage: VariableUsage }> = [];

    // Find all CSS/SCSS files in workspace
    const cssFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, '**/*.{css,scss,sass}'),
      '**/node_modules/**'
    );

    // Analyze each file
    for (const fileUri of cssFiles) {
      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        
        // Collect definitions
        const fileDefs = this.findVariableDefinitions(document);
        fileDefs.forEach(def => {
          if (!definitions.has(def.name)) {
            definitions.set(def.name, []);
          }
          definitions.get(def.name)!.push({ document, definition: def });
        });

        // Collect usages
        const fileUsages = this.findVariableUsages(document);
        fileUsages.forEach(usage => {
          if (!usages.has(usage.name)) {
            usages.set(usage.name, []);
          }
          usages.get(usage.name)!.push({ document, usage });
        });

      } catch (error) {
        console.warn(`Failed to analyze file: ${fileUri.toString()}`, error);
      }
    }

    // Find undefined variables
    usages.forEach((usageList, variableName) => {
      if (!definitions.has(variableName)) {
        usageList.forEach(({ document, usage }) => {
          undefinedVariables.push({ variable: variableName, document, usage });
        });
      }
    });

    return { definitions, usages, undefinedVariables };
  }

  /**
   * Find all variables that would be affected by changing a specific variable
   */
  findAffectedVariables(
    targetVariable: string,
    document: vscode.TextDocument
  ): Array<{
    variable: VariableDefinition;
    dependencyChain: string[];
  }> {
    const definitions = this.findVariableDefinitions(document);
    const affected: Array<{ variable: VariableDefinition; dependencyChain: string[] }> = [];
    const visited = new Set<string>();

    const findDependents = (variable: string, chain: string[]) => {
      if (visited.has(variable)) {
        return; // Prevent infinite recursion
      }
      visited.add(variable);

      definitions.forEach(def => {
        const dependencies = this.findVariableDependencies(def.name, document);
        if (dependencies.includes(variable) && !chain.includes(def.name)) {
          const newChain = [...chain, def.name];
          affected.push({
            variable: def,
            dependencyChain: newChain
          });
          
          // Recursively find dependents
          findDependents(def.name, newChain);
        }
      });
    };

    findDependents(targetVariable, [targetVariable]);
    return affected;
  }

  /**
   * Resolve variable with theme context support
   */
  resolveVariableWithTheme(
    variableName: string,
    document: vscode.TextDocument,
    themeContext?: 'light' | 'dark' | 'auto'
  ): ColorValue | null {
    // If theme context is provided, look for theme-specific variables first
    if (themeContext && themeContext !== 'auto') {
      const themeVariableName = this.getThemeVariableName(variableName, themeContext);
      const themeResult = this.resolveVariable(themeVariableName, document);
      if (themeResult) {
        return themeResult;
      }
    }

    // Fallback to direct resolution
    const directResult = this.resolveVariable(variableName, document);
    if (directResult) {
      return directResult;
    }

    return null;
  }

  /**
   * Get theme-specific variable name
   */
  private getThemeVariableName(variableName: string, theme: 'light' | 'dark'): string {
    if (variableName.startsWith('--')) {
      // CSS custom property: --color -> --light-color
      const baseName = variableName.substring(2);
      return `--${theme}-${baseName}`;
    } else if (variableName.startsWith('$')) {
      // SCSS variable: $color -> $light-color
      const baseName = variableName.substring(1);
      return `$${theme}-${baseName}`;
    }
    return variableName;
  }

  /**
   * Validate variable definitions for potential issues
   */
  validateVariableDefinitions(document: vscode.TextDocument): Array<{
    variable: VariableDefinition;
    issues: Array<{
      type: 'circular-reference' | 'undefined-dependency' | 'invalid-color' | 'naming-convention';
      message: string;
      severity: 'error' | 'warning' | 'info';
    }>;
  }> {
    const definitions = this.findVariableDefinitions(document);
    const results: Array<{ variable: VariableDefinition; issues: Array<any> }> = [];

    definitions.forEach(def => {
      const issues: Array<any> = [];

      // Check for circular references
      const cycles = this.detectCircularReferences(document);
      const isInCycle = cycles.some(cycle => cycle.cycle.includes(def.name));
      if (isInCycle) {
        issues.push({
          type: 'circular-reference',
          message: `Variable '${def.name}' is part of a circular reference`,
          severity: 'error'
        });
      }

      // Check for undefined dependencies
      const dependencies = this.findVariableDependencies(def.name, document);
      const definedVariables = new Set(definitions.map(d => d.name));
      dependencies.forEach(dep => {
        if (!definedVariables.has(dep)) {
          issues.push({
            type: 'undefined-dependency',
            message: `Variable '${def.name}' depends on undefined variable '${dep}'`,
            severity: 'error'
          });
        }
      });

      // Check if color values are valid
      const resolvedColor = this.resolveVariable(def.name, document);
      if (def.value.match(/#[0-9a-fA-F]{3,8}|rgb|hsl|color/) && !resolvedColor) {
        issues.push({
          type: 'invalid-color',
          message: `Variable '${def.name}' appears to contain a color value but cannot be parsed`,
          severity: 'warning'
        });
      }

      // Check naming conventions
      if (def.name.startsWith('--') && !def.name.match(/^--[a-z][a-z0-9-]*$/)) {
        issues.push({
          type: 'naming-convention',
          message: `CSS custom property '${def.name}' should use kebab-case naming`,
          severity: 'info'
        });
      } else if (def.name.startsWith('$') && !def.name.match(/^\$[a-z][a-zA-Z0-9_-]*$/)) {
        issues.push({
          type: 'naming-convention',
          message: `SCSS variable '${def.name}' should use camelCase or kebab-case naming`,
          severity: 'info'
        });
      }

      if (issues.length > 0) {
        results.push({ variable: def, issues });
      }
    });

    return results;
  }

  /**
   * Generate variable usage report
   */
  generateUsageReport(document: vscode.TextDocument): {
    totalVariables: number;
    usedVariables: number;
    unusedVariables: VariableDefinition[];
    mostUsedVariables: Array<{ variable: VariableDefinition; usageCount: number }>;
    colorVariables: Array<{ variable: VariableDefinition; color: ColorValue }>;
  } {
    const definitions = this.findVariableDefinitions(document);
    const usages = this.findVariableUsages(document);
    const colorVariables = this.extractColorsFromVariables(document);

    // Count usage frequency
    const usageCount = new Map<string, number>();
    usages.forEach(usage => {
      usageCount.set(usage.name, (usageCount.get(usage.name) || 0) + 1);
    });

    // Find unused variables
    const unusedVariables = definitions.filter(def => !usageCount.has(def.name));

    // Find most used variables
    const mostUsedVariables = definitions
      .map(def => ({ variable: def, usageCount: usageCount.get(def.name) || 0 }))
      .filter(item => item.usageCount > 0)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);

    return {
      totalVariables: definitions.length,
      usedVariables: definitions.length - unusedVariables.length,
      unusedVariables,
      mostUsedVariables,
      colorVariables
    };
  }

  /**
   * Optimize variable definitions by removing unused variables
   */
  optimizeVariables(document: vscode.TextDocument): Array<{
    action: 'remove' | 'inline' | 'rename';
    variable: VariableDefinition;
    reason: string;
    suggestion?: string;
  }> {
    const report = this.generateUsageReport(document);
    const optimizations: Array<any> = [];

    // Suggest removing unused variables
    report.unusedVariables.forEach(variable => {
      optimizations.push({
        action: 'remove',
        variable,
        reason: 'Variable is defined but never used'
      });
    });

    // Suggest inlining variables used only once
    report.mostUsedVariables
      .filter(item => item.usageCount === 1)
      .forEach(item => {
        optimizations.push({
          action: 'inline',
          variable: item.variable,
          reason: 'Variable is used only once, consider inlining the value'
        });
      });

    return optimizations;
  }
}