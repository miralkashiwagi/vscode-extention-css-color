import * as vscode from 'vscode';
import { SettingsManager } from './interfaces';
import { DisplayMode, ResolutionScope } from './types';
import { 
  ErrorHandler, 
  SettingsValidationError,
  safeExecuteSync
} from './errorHandler';

export class SettingsManagerImpl implements SettingsManager {
  private static readonly CONFIGURATION_SECTION = 'cssVariableColorChips';
  private changeCallbacks: (() => void)[] = [];
  private disposables: vscode.Disposable[] = [];
  private errorHandler: ErrorHandler;

  constructor(errorHandler: ErrorHandler) {
    this.errorHandler = errorHandler;
    
    // Listen for configuration changes
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
      this.handleConfigurationChange.bind(this)
    );
    this.disposables.push(configChangeDisposable);
  }

  /**
   * Get the current display mode for dynamic variables
   */
  getDisplayMode(): DisplayMode {
    return safeExecuteSync(
      () => this.getDisplayModeInternal(),
      'default',
      this.errorHandler,
      'getDisplayMode'
    );
  }

  /**
   * Internal display mode retrieval with validation
   */
  private getDisplayModeInternal(): DisplayMode {
    const config = this.getConfiguration();
    const mode = config.get<string>('displayMode', 'default');
    
    // Validate the mode value
    if (this.isValidDisplayMode(mode)) {
      return mode as DisplayMode;
    }
    
    // Throw validation error for invalid mode
    throw new SettingsValidationError(
      'displayMode',
      mode,
      `Invalid display mode. Valid values are: default, computed, multiple`,
      { validValues: ['default', 'computed', 'multiple'] }
    );
  }

  /**
   * Get the list of enabled file types
   */
  getEnabledFileTypes(): string[] {
    return safeExecuteSync(
      () => this.getEnabledFileTypesInternal(),
      ['css', 'scss', 'sass'],
      this.errorHandler,
      'getEnabledFileTypes'
    );
  }

  /**
   * Internal file types retrieval with validation
   */
  private getEnabledFileTypesInternal(): string[] {
    const config = this.getConfiguration();
    const fileTypes = config.get<string[]>('enabledFileTypes', ['css', 'scss', 'sass']);
    
    if (!Array.isArray(fileTypes)) {
      throw new SettingsValidationError(
        'enabledFileTypes',
        fileTypes,
        'Must be an array of strings',
        { expectedType: 'string[]' }
      );
    }
    
    // Validate and filter file types
    const validFileTypes = fileTypes.filter(type => {
      if (typeof type !== 'string' || type.trim().length === 0) {
        this.errorHandler.handleSettingsValidationError(
          new SettingsValidationError(
            'enabledFileTypes',
            type,
            'File type must be a non-empty string',
            { invalidValue: type }
          )
        );
        return false;
      }
      return true;
    });

    if (validFileTypes.length === 0) {
      throw new SettingsValidationError(
        'enabledFileTypes',
        fileTypes,
        'At least one valid file type must be specified',
        { originalValue: fileTypes }
      );
    }

    return validFileTypes;
  }

  /**
   * Get the variable resolution scope
   */
  getVariableResolutionScope(): ResolutionScope {
    const config = this.getConfiguration();
    const scope = config.get<string>('variableResolutionScope', 'workspace');
    
    // Validate the scope value
    if (this.isValidResolutionScope(scope)) {
      return scope as ResolutionScope;
    }
    
    // Fallback to workspace if invalid
    console.warn(`Invalid resolution scope: ${scope}. Using workspace.`);
    return 'workspace';
  }



  /**
   * Get whether the extension is enabled
   */
  isEnabled(): boolean {
    const config = this.getConfiguration();
    return config.get<boolean>('enabled', true);
  }

  /**
   * Get whether to show color chips for variable definitions
   */
  showVariableDefinitions(): boolean {
    const config = this.getConfiguration();
    return config.get<boolean>('showVariableDefinitions', true);
  }

  /**
   * Get whether to show color chips for variable usages
   */
  showVariableUsages(): boolean {
    const config = this.getConfiguration();
    return config.get<boolean>('showVariableUsages', true);
  }



  /**
   * Get the maximum number of colors to show in multiple color mode
   */
  getMaxColorsInMultipleMode(): number {
    const config = this.getConfiguration();
    const maxColors = config.get<number>('maxColorsInMultipleMode', 5);
    
    // Validate range (1-10)
    if (maxColors >= 1 && maxColors <= 10) {
      return maxColors;
    }
    
    console.warn(`Invalid maxColorsInMultipleMode: ${maxColors}. Using default value 5.`);
    return 5;
  }

  /**
   * Get whether to enable hover information
   */
  enableHoverInfo(): boolean {
    const config = this.getConfiguration();
    return config.get<boolean>('enableHoverInfo', true);
  }

  /**
   * Get whether to enable debug logging
   */
  enableDebugLogging(): boolean {
    const config = this.getConfiguration();
    return config.get<boolean>('enableDebugLogging', false);
  }

  /**
   * Get the cache size limit
   */
  getCacheSizeLimit(): number {
    const config = this.getConfiguration();
    const cacheSize = config.get<number>('cacheSizeLimit', 100);
    
    // Validate range (10-1000)
    if (cacheSize >= 10 && cacheSize <= 1000) {
      return cacheSize;
    }
    
    console.warn(`Invalid cacheSizeLimit: ${cacheSize}. Using default value 100.`);
    return 100;
  }

  /**
   * Get the debounce delay for real-time updates (in milliseconds)
   */
  getDebounceDelay(): number {
    const config = this.getConfiguration();
    const delay = config.get<number>('debounceDelay', 300);
    
    // Validate range (50-2000)
    if (delay >= 50 && delay <= 2000) {
      return delay;
    }
    
    console.warn(`Invalid debounceDelay: ${delay}. Using default value 300.`);
    return 300;
  }

  /**
   * Get custom theme paths for computed mode
   */
  getCustomThemePaths(): string[] {
    const config = this.getConfiguration();
    const paths = config.get<string[]>('customThemePaths', []);
    
    // Validate and filter paths
    return paths.filter(path => typeof path === 'string' && path.trim().length > 0);
  }

  /**
   * Register a callback for settings changes
   */
  onSettingsChanged(callback: () => void): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Update a specific setting
   */
  async updateSetting<T>(key: string, value: T, target?: vscode.ConfigurationTarget): Promise<void> {
    const config = this.getConfiguration();
    
    try {
      await config.update(key, value, target || vscode.ConfigurationTarget.Global);
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
      throw new Error(`Failed to update setting: ${key}`);
    }
  }

  /**
   * Reset all settings to defaults
   */
  async resetToDefaults(): Promise<void> {
    const config = this.getConfiguration();
    const keys = [
      'displayMode',
      'enabledFileTypes',
      'variableResolutionScope',
      'enabled',
      'showVariableDefinitions',
      'showVariableUsages',
      'maxColorsInMultipleMode',
      'enableHoverInfo',
      'enableDebugLogging',
      'cacheSizeLimit',
      'debounceDelay',
      'customThemePaths'
    ];

    try {
      for (const key of keys) {
        await config.update(key, undefined, vscode.ConfigurationTarget.Global);
      }
    } catch (error) {
      console.error('Failed to reset settings:', error);
      throw new Error('Failed to reset settings to defaults');
    }
  }

  /**
   * Get all current settings as an object
   */
  getAllSettings(): Record<string, any> {
    return {
      displayMode: this.getDisplayMode(),
      enabledFileTypes: this.getEnabledFileTypes(),
      variableResolutionScope: this.getVariableResolutionScope(),
      enabled: this.isEnabled(),
      showVariableDefinitions: this.showVariableDefinitions(),
      showVariableUsages: this.showVariableUsages(),
      maxColorsInMultipleMode: this.getMaxColorsInMultipleMode(),
      enableHoverInfo: this.enableHoverInfo(),
      enableDebugLogging: this.enableDebugLogging(),
      cacheSizeLimit: this.getCacheSizeLimit(),
      debounceDelay: this.getDebounceDelay(),
      customThemePaths: this.getCustomThemePaths()
    };
  }

  /**
   * Validate settings and return any issues
   */
  validateSettings(): string[] {
    const issues: string[] = [];
    const config = this.getConfiguration();

    // Check display mode
    const displayMode = config.get<string>('displayMode');
    if (displayMode && !this.isValidDisplayMode(displayMode)) {
      issues.push(`Invalid display mode: ${displayMode}`);
    }

    // Check resolution scope
    const resolutionScope = config.get<string>('variableResolutionScope');
    if (resolutionScope && !this.isValidResolutionScope(resolutionScope)) {
      issues.push(`Invalid resolution scope: ${resolutionScope}`);
    }

    // Check numeric ranges
    const maxColors = config.get<number>('maxColorsInMultipleMode');
    if (maxColors !== undefined && (maxColors < 1 || maxColors > 10)) {
      issues.push(`maxColorsInMultipleMode must be between 1 and 10, got: ${maxColors}`);
    }

    const cacheSize = config.get<number>('cacheSizeLimit');
    if (cacheSize !== undefined && (cacheSize < 10 || cacheSize > 1000)) {
      issues.push(`cacheSizeLimit must be between 10 and 1000, got: ${cacheSize}`);
    }

    const debounceDelay = config.get<number>('debounceDelay');
    if (debounceDelay !== undefined && (debounceDelay < 50 || debounceDelay > 2000)) {
      issues.push(`debounceDelay must be between 50 and 2000, got: ${debounceDelay}`);
    }

    return issues;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables = [];
    this.changeCallbacks = [];
  }

  // Private helper methods

  /**
   * Get the VSCode configuration for this extension
   */
  private getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(SettingsManagerImpl.CONFIGURATION_SECTION);
  }

  /**
   * Handle configuration changes
   */
  private handleConfigurationChange(event: vscode.ConfigurationChangeEvent): void {
    if (event.affectsConfiguration(SettingsManagerImpl.CONFIGURATION_SECTION)) {
      // Validate new settings
      const issues = this.validateSettings();
      if (issues.length > 0) {
        console.warn('Settings validation issues:', issues);
        vscode.window.showWarningMessage(
          `CSS Variable Color Chips: Settings validation issues found: ${issues.join(', ')}`
        );
      }

      // Notify all registered callbacks
      this.changeCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('Error in settings change callback:', error);
        }
      });
    }
  }

  /**
   * Validate display mode value
   */
  private isValidDisplayMode(mode: string): boolean {
    return ['default', 'computed', 'multiple'].includes(mode);
  }

  /**
   * Validate resolution scope value
   */
  private isValidResolutionScope(scope: string): boolean {
    return ['file', 'workspace'].includes(scope);
  }


}