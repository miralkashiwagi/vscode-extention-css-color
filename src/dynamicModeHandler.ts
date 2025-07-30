import * as vscode from 'vscode';
import * as path from 'path';
import { ColorValue, DisplayMode, VariableDefinition } from './types';
import { SettingsManager } from './interfaces';
import { ColorValueImpl } from './colorValue';

export interface DynamicModeHandler {
  resolveVariableColor(
    variableName: string,
    defaultValue: ColorValue | null,
    document: vscode.TextDocument
  ): ColorValue | ColorValue[] | null;
  
  getThemeVariants(variableName: string): ColorValue[];
  getComputedValue(variableName: string, document: vscode.TextDocument): ColorValue | null;
}

export class DynamicModeHandlerImpl implements DynamicModeHandler {
  private themeCache: Map<string, Map<string, ColorValue>> = new Map();
  private computedCache: Map<string, ColorValue> = new Map();

  constructor(private settingsManager: SettingsManager) {}

  /**
   * Resolve variable color based on current display mode
   */
  resolveVariableColor(
    variableName: string,
    defaultValue: ColorValue | null,
    document: vscode.TextDocument
  ): ColorValue | ColorValue[] | null {
    const displayMode = this.settingsManager.getDisplayMode();

    switch (displayMode) {
      case 'default':
        return this.handleDefaultMode(variableName, defaultValue);
      
      case 'computed':
        return this.handleComputedMode(variableName, defaultValue, document);
      
      case 'multiple':
        return this.handleMultipleMode(variableName, defaultValue, document);
      
      default:
        return defaultValue;
    }
  }

  /**
   * Get theme variants for a variable
   */
  getThemeVariants(variableName: string): ColorValue[] {
    const variants: ColorValue[] = [];
    const customThemePaths = this.settingsManager.getCustomThemePaths();

    // Load variants from custom theme files
    for (const themePath of customThemePaths) {
      const themeVariant = this.loadThemeVariant(variableName, themePath);
      if (themeVariant) {
        variants.push(themeVariant);
      }
    }

    // Load variants from common theme locations
    const commonThemeVariants = this.loadCommonThemeVariants(variableName);
    variants.push(...commonThemeVariants);

    return this.deduplicateColors(variants);
  }

  /**
   * Get computed value for a variable
   */
  getComputedValue(variableName: string, document: vscode.TextDocument): ColorValue | null {
    const cacheKey = `${document.uri.toString()}:${variableName}`;
    
    if (this.computedCache.has(cacheKey)) {
      return this.computedCache.get(cacheKey)!;
    }

    // Try to resolve from active theme
    const computedValue = this.resolveFromActiveTheme(variableName, document);
    
    if (computedValue) {
      this.computedCache.set(cacheKey, computedValue);
    }

    return computedValue;
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.themeCache.clear();
    this.computedCache.clear();
  }

  /**
   * Invalidate cache for specific document
   */
  invalidateDocumentCache(documentUri: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.computedCache.keys()) {
      if (key.startsWith(documentUri)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.computedCache.delete(key));
  }

  // Private methods for different display modes

  /**
   * Handle default mode - return the default value as-is
   */
  private handleDefaultMode(
    variableName: string,
    defaultValue: ColorValue | null
  ): ColorValue | null {
    return defaultValue;
  }

  /**
   * Handle computed mode - try to get computed value, fallback to default
   */
  private handleComputedMode(
    variableName: string,
    defaultValue: ColorValue | null,
    document: vscode.TextDocument
  ): ColorValue | null {
    const computedValue = this.getComputedValue(variableName, document);
    return computedValue || defaultValue;
  }

  /**
   * Handle multiple mode - return array of possible values
   */
  private handleMultipleMode(
    variableName: string,
    defaultValue: ColorValue | null,
    document: vscode.TextDocument
  ): ColorValue[] {
    const values: ColorValue[] = [];
    
    // Add default value if available
    if (defaultValue) {
      values.push(defaultValue);
    }

    // Add computed value if different from default
    const computedValue = this.getComputedValue(variableName, document);
    if (computedValue && !this.colorsEqual(computedValue, defaultValue)) {
      values.push(computedValue);
    }

    // Add theme variants
    const themeVariants = this.getThemeVariants(variableName);
    for (const variant of themeVariants) {
      if (!values.some(existing => this.colorsEqual(existing, variant))) {
        values.push(variant);
      }
    }

    // Limit to max colors setting
    const maxColors = this.settingsManager.getMaxColorsInMultipleMode();
    return values.slice(0, maxColors);
  }

  /**
   * Load theme variant from a specific theme file
   */
  private loadThemeVariant(variableName: string, themePath: string): ColorValue | null {
    try {
      const cacheKey = themePath;
      
      if (!this.themeCache.has(cacheKey)) {
        this.loadThemeFile(themePath);
      }

      const themeVariables = this.themeCache.get(cacheKey);
      return themeVariables?.get(variableName) || null;
    } catch (error) {
      if (this.settingsManager.enableDebugLogging()) {
        console.warn(`Failed to load theme variant from ${themePath}:`, error);
      }
      return null;
    }
  }

  /**
   * Load theme file and cache its variables
   */
  private async loadThemeFile(themePath: string): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        return;
      }

      const fullPath = path.resolve(workspaceFolders[0].uri.fsPath, themePath);
      const themeUri = vscode.Uri.file(fullPath);
      
      const document = await vscode.workspace.openTextDocument(themeUri);
      const themeVariables = this.parseThemeVariables(document.getText());
      
      this.themeCache.set(themePath, themeVariables);
    } catch (error) {
      if (this.settingsManager.enableDebugLogging()) {
        console.warn(`Failed to load theme file ${themePath}:`, error);
      }
      // Set empty map to avoid repeated attempts
      this.themeCache.set(themePath, new Map());
    }
  }

  /**
   * Parse theme variables from CSS/SCSS content
   */
  private parseThemeVariables(content: string): Map<string, ColorValue> {
    const variables = new Map<string, ColorValue>();
    
    // CSS custom properties pattern
    const cssVariablePattern = /--([\w-]+)\s*:\s*([^;]+);/g;
    let match;
    
    while ((match = cssVariablePattern.exec(content)) !== null) {
      const variableName = `--${match[1]}`;
      const value = match[2].trim();
      
      const colorValue = ColorValueImpl.fromString(value);
      if (colorValue && colorValue.isValid) {
        variables.set(variableName, colorValue);
      }
    }

    // SCSS variables pattern
    const scssVariablePattern = /\$([\w-]+)\s*:\s*([^;]+);/g;
    
    while ((match = scssVariablePattern.exec(content)) !== null) {
      const variableName = `$${match[1]}`;
      const value = match[2].trim();
      
      const colorValue = ColorValueImpl.fromString(value);
      if (colorValue && colorValue.isValid) {
        variables.set(variableName, colorValue);
      }
    }

    return variables;
  }

  /**
   * Load common theme variants from typical locations
   */
  private loadCommonThemeVariants(variableName: string): ColorValue[] {
    const variants: ColorValue[] = [];
    const commonPaths = [
      'src/styles/themes/light.css',
      'src/styles/themes/dark.css',
      'styles/themes/light.scss',
      'styles/themes/dark.scss',
      'assets/themes/light.css',
      'assets/themes/dark.css'
    ];

    for (const commonPath of commonPaths) {
      const variant = this.loadThemeVariant(variableName, commonPath);
      if (variant) {
        variants.push(variant);
      }
    }

    return variants;
  }

  /**
   * Resolve variable from active VSCode theme
   */
  private resolveFromActiveTheme(
    variableName: string,
    document: vscode.TextDocument
  ): ColorValue | null {
    // This is a simplified implementation since VSCode doesn't provide
    // direct access to computed CSS values. In a real implementation,
    // we might need to use webview or other techniques.
    
    // For now, we'll try to infer from common theme patterns
    const activeTheme = vscode.window.activeColorTheme;
    
    if (activeTheme.kind === vscode.ColorThemeKind.Dark) {
      return this.getDarkThemeValue(variableName);
    } else if (activeTheme.kind === vscode.ColorThemeKind.Light) {
      return this.getLightThemeValue(variableName);
    } else if (activeTheme.kind === vscode.ColorThemeKind.HighContrast) {
      return this.getHighContrastThemeValue(variableName);
    }

    return null;
  }

  /**
   * Get dark theme value for common variables
   */
  private getDarkThemeValue(variableName: string): ColorValue | null {
    const darkThemeDefaults: Record<string, string> = {
      '--background': '#1e1e1e',
      '--foreground': '#d4d4d4',
      '--primary': '#007acc',
      '--secondary': '#6c757d',
      '--success': '#28a745',
      '--warning': '#ffc107',
      '--danger': '#dc3545',
      '--info': '#17a2b8',
      '--text-color': '#d4d4d4',
      '--border-color': '#3c3c3c'
    };

    const value = darkThemeDefaults[variableName];
    return value ? ColorValueImpl.fromString(value) : null;
  }

  /**
   * Get light theme value for common variables
   */
  private getLightThemeValue(variableName: string): ColorValue | null {
    const lightThemeDefaults: Record<string, string> = {
      '--background': '#ffffff',
      '--foreground': '#333333',
      '--primary': '#007acc',
      '--secondary': '#6c757d',
      '--success': '#28a745',
      '--warning': '#ffc107',
      '--danger': '#dc3545',
      '--info': '#17a2b8',
      '--text-color': '#333333',
      '--border-color': '#dee2e6'
    };

    const value = lightThemeDefaults[variableName];
    return value ? ColorValueImpl.fromString(value) : null;
  }

  /**
   * Get high contrast theme value for common variables
   */
  private getHighContrastThemeValue(variableName: string): ColorValue | null {
    const highContrastDefaults: Record<string, string> = {
      '--background': '#000000',
      '--foreground': '#ffffff',
      '--primary': '#ffffff',
      '--secondary': '#ffffff',
      '--success': '#00ff00',
      '--warning': '#ffff00',
      '--danger': '#ff0000',
      '--info': '#00ffff',
      '--text-color': '#ffffff',
      '--border-color': '#ffffff'
    };

    const value = highContrastDefaults[variableName];
    return value ? ColorValueImpl.fromString(value) : null;
  }

  /**
   * Check if two colors are equal
   */
  private colorsEqual(color1: ColorValue | null, color2: ColorValue | null): boolean {
    if (!color1 || !color2) {
      return color1 === color2;
    }
    return color1.hex.toLowerCase() === color2.hex.toLowerCase();
  }

  /**
   * Remove duplicate colors from array
   */
  private deduplicateColors(colors: ColorValue[]): ColorValue[] {
    const seen = new Set<string>();
    return colors.filter(color => {
      const key = color.hex.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}