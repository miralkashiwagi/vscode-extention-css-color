import * as vscode from 'vscode';
import { 
  ColorValue, 
  VariableDefinition, 
  VariableUsage, 
  ParseResult, 
  ColorMatch,
  DisplayMode,
  ChipSize,
  ResolutionScope
} from './types';

// Main controller interface
export interface ColorChipManager {
  activate(context: vscode.ExtensionContext): void;
  deactivate(): void;
  refreshDocument(document: vscode.TextDocument): void;
  updateSettings(): void;
}

// Variable resolution interface
export interface VariableResolver {
  resolveCSSVariable(variableName: string, document: vscode.TextDocument): Promise<ColorValue | null>;
  resolveSCSSVariable(variableName: string, document: vscode.TextDocument): Promise<ColorValue | null>;
  findVariableDefinitions(document: vscode.TextDocument): VariableDefinition[];
  findVariableUsages(document: vscode.TextDocument): VariableUsage[];
}

// Parser interface for CSS/SCSS
export interface Parser {
  parseDocument(document: vscode.TextDocument): ParseResult;
  findColorValues(text: string): ColorMatch[];
  findVariableDefinitions(text: string): VariableDefinition[];
  findVariableUsages(text: string): VariableUsage[];
}

// Decoration provider interface
export interface DecorationProvider {
  createColorChip(color: ColorValue, range: vscode.Range): vscode.DecorationOptions;
  createVariableColorChip(variableName: string, resolvedColor: ColorValue, range: vscode.Range, fallbackColor?: ColorValue): vscode.DecorationOptions;
  createMultipleColorChips(colors: ColorValue[], range: vscode.Range, context?: string): vscode.DecorationOptions;
  createCompactMultipleChips(colors: ColorValue[], baseRange: vscode.Range, spacing?: number): vscode.DecorationOptions[];
  createStackedColorChips(colors: ColorValue[], range: vscode.Range, maxVisible?: number): vscode.DecorationOptions;
  createUndefinedVariableDecoration(variableName: string, range: vscode.Range, fallbackColor?: ColorValue): vscode.DecorationOptions;
  applyDecorations(editor: vscode.TextEditor, decorations: vscode.DecorationOptions[]): void;
  clearDecorations(editor: vscode.TextEditor): void;
  updateDecorationStyles(): void;
  dispose(): void;
}

// Settings management interface
export interface SettingsManager {
  getDisplayMode(): DisplayMode;
  getEnabledFileTypes(): string[];
  getVariableResolutionScope(): ResolutionScope;
  getChipSize(): ChipSize;
  isEnabled(): boolean;
  showVariableDefinitions(): boolean;
  showVariableUsages(): boolean;
  showDirectColors(): boolean;
  getMaxColorsInMultipleMode(): number;
  enableHoverInfo(): boolean;
  enableDebugLogging(): boolean;
  getCacheSizeLimit(): number;
  getDebounceDelay(): number;
  getCustomThemePaths(): string[];
  onSettingsChanged(callback: () => void): void;
  updateSetting<T>(key: string, value: T, target?: vscode.ConfigurationTarget): Promise<void>;
  resetToDefaults(): Promise<void>;
  getAllSettings(): Record<string, any>;
  validateSettings(): string[];
  dispose(): void;
}

// Cache management interface
export interface CacheManager {
  get(documentUri: string): any | null;
  set(documentUri: string, data: any): void;
  invalidate(documentUri: string): void;
  clear(): void;
}

// File watcher interface
export interface FileWatcher {
  startWatching(): void;
  stopWatching(): void;
  onFileChanged(callback: (uri: vscode.Uri) => void): void;
}