import * as vscode from 'vscode';
import { ColorChipManager } from './interfaces';
import { SettingsManagerImpl } from './settingsManager';
import { CacheManagerImpl } from './cacheManager';
import { FileWatcherImpl } from './fileWatcher';
import { DecorationProviderImpl } from './decorationProvider';
import { IncrementalAnalyzer } from './incrementalAnalyzer';
import { VariableResolverImpl } from './variableResolver';
import { DynamicModeHandlerImpl } from './dynamicModeHandler';
import { RealtimeUpdater } from './realtimeUpdater';
import { CSSParser } from './cssParser';
import { SCSSParser } from './scssParser';
import { ErrorHandlerImpl, ErrorHandler, safeExecute } from './errorHandler';
import { initializeLogger, LoggerImpl, PerformanceLogger, DebugInfoCollector } from './logger';

export class ColorChipManagerImpl implements ColorChipManager {
  private logger!: LoggerImpl;
  private performanceLogger!: PerformanceLogger;
  private debugInfoCollector!: DebugInfoCollector;
  private errorHandler!: ErrorHandler;
  private settingsManager!: SettingsManagerImpl;
  private cacheManager!: CacheManagerImpl;
  private fileWatcher!: FileWatcherImpl;
  private decorationProvider!: DecorationProviderImpl;
  private incrementalAnalyzer!: IncrementalAnalyzer;
  private variableResolver!: VariableResolverImpl;
  private dynamicModeHandler!: DynamicModeHandlerImpl;
  private realtimeUpdater!: RealtimeUpdater;
  private cssParser!: CSSParser;
  private scssParser!: SCSSParser;

  private isActivated = false;
  private disposables: vscode.Disposable[] = [];

  /**
   * Activate the extension
   */
  activate(context: vscode.ExtensionContext): void {
    if (this.isActivated) {
      this.logger?.warn('ColorChipManager', 'Attempted to activate already activated extension');
      return;
    }

    const activationTimer = 'extension-activation';
    
    try {
      // Initialize logger first
      this.logger = initializeLogger(context);
      this.performanceLogger = new PerformanceLogger(this.logger);
      this.debugInfoCollector = new DebugInfoCollector(this.logger);
      
      this.performanceLogger.startTimer(activationTimer, 'Extension activation');
      this.logger.info('ColorChipManager', 'Starting extension activation');

      // Initialize error handler
      this.errorHandler = new ErrorHandlerImpl();
      
      // Enable debug mode if in development
      const isDebug = context.extensionMode === vscode.ExtensionMode.Development;
      (this.errorHandler as ErrorHandlerImpl).setDebugMode(isDebug);
      
      this.logger.debug('ColorChipManager', 'Error handler initialized', { debugMode: isDebug });

      // Initialize all components
      this.initializeComponents();
      this.logger.debug('ColorChipManager', 'All components initialized');

      // Setup extension context
      this.setupExtensionContext(context);
      this.logger.debug('ColorChipManager', 'Extension context setup completed');

      // Start real-time updates if enabled
      if (this.settingsManager.isEnabled()) {
        this.realtimeUpdater.start();
        this.logger.info('ColorChipManager', 'Real-time updates started');
      } else {
        this.logger.info('ColorChipManager', 'Extension is disabled, real-time updates not started');
      }

      this.isActivated = true;
      
      const activationTime = this.performanceLogger.endTimer(activationTimer, 'Extension activation');
      this.logger.info('ColorChipManager', `Extension activated successfully in ${activationTime}ms`);

      // Collect initial debug info if in debug mode
      if (isDebug) {
        this.debugInfoCollector.collectSystemInfo();
        this.debugInfoCollector.collectWorkspaceInfo();
        this.debugInfoCollector.collectExtensionConfig();
      }

    } catch (error) {
      console.error('Failed to activate CSS Variable Color Chips extension:', error);
      vscode.window.showErrorMessage(
        'Failed to activate CSS Variable Color Chips extension. Please check the console for details.'
      );
    }
  }

  /**
   * Deactivate the extension
   */
  deactivate(): void {
    if (!this.isActivated) {
      this.logger?.warn('ColorChipManager', 'Attempted to deactivate already deactivated extension');
      return;
    }

    const deactivationTimer = 'extension-deactivation';
    
    try {
      this.performanceLogger?.startTimer(deactivationTimer, 'Extension deactivation');
      this.logger?.info('ColorChipManager', 'Starting extension deactivation');

      // Stop real-time updates
      if (this.realtimeUpdater) {
        this.realtimeUpdater.stop();
        this.logger?.debug('ColorChipManager', 'Real-time updates stopped');
      }

      // Dispose all components
      this.disposeComponents();
      this.logger?.debug('ColorChipManager', 'All components disposed');

      // Dispose extension disposables
      this.disposables.forEach(disposable => disposable.dispose());
      this.disposables = [];
      this.logger?.debug('ColorChipManager', 'Extension disposables disposed');

      this.isActivated = false;

      const deactivationTime = this.performanceLogger?.endTimer(deactivationTimer, 'Extension deactivation') || 0;
      this.logger?.info('ColorChipManager', `Extension deactivated successfully in ${deactivationTime}ms`);

    } catch (error) {
      this.logger?.error('ColorChipManager', 'Error during extension deactivation', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Refresh a specific document
   */
  refreshDocument(document: vscode.TextDocument): void {
    if (!this.isActivated || !this.settingsManager.isEnabled()) {
      return;
    }

    try {
      // Force update the document
      this.realtimeUpdater.forceUpdate(document);

    } catch (error) {
      if (this.settingsManager.enableDebugLogging()) {
        console.error(`Failed to refresh document ${document.uri.toString()}:`, error);
      }
    }
  }

  /**
   * Update settings and refresh all documents
   */
  updateSettings(): void {
    if (!this.isActivated) {
      return;
    }

    try {
      // Settings are automatically handled by SettingsManager callbacks
      // This method is here for manual refresh if needed
      
      if (this.settingsManager.isEnabled()) {
        if (!this.realtimeUpdater.getStats().isActive) {
          this.realtimeUpdater.start();
        }
        this.realtimeUpdater.updateAllVisibleEditors();
      } else {
        this.realtimeUpdater.stop();
        this.clearAllDecorations();
      }

    } catch (error) {
      if (this.settingsManager.enableDebugLogging()) {
        console.error('Failed to update settings:', error);
      }
    }
  }

  /**
   * Get extension statistics
   */
  getStats(): {
    isActivated: boolean;
    isEnabled: boolean;
    realtimeUpdater: any;
    cacheManager: any;
    fileWatcher: any;
    incrementalAnalyzer: any;
  } {
    return {
      isActivated: this.isActivated,
      isEnabled: this.settingsManager?.isEnabled() || false,
      realtimeUpdater: this.realtimeUpdater?.getStats() || null,
      cacheManager: this.cacheManager?.getStats?.() || null,
      fileWatcher: this.fileWatcher?.getWatchStats?.() || null,
      incrementalAnalyzer: this.incrementalAnalyzer?.getStats?.() || null
    };
  }

  /**
   * Force refresh all visible documents
   */
  refreshAllDocuments(): void {
    if (!this.isActivated || !this.settingsManager.isEnabled()) {
      return;
    }

    try {
      this.realtimeUpdater.updateAllVisibleEditors();
    } catch (error) {
      if (this.settingsManager.enableDebugLogging()) {
        console.error('Failed to refresh all documents:', error);
      }
    }
  }

  /**
   * Clear all decorations from visible editors
   */
  clearAllDecorations(): void {
    try {
      const visibleEditors = vscode.window.visibleTextEditors;
      
      for (const editor of visibleEditors) {
        this.decorationProvider.clearDecorations(editor);
      }
    } catch (error) {
      if (this.settingsManager?.enableDebugLogging()) {
        console.error('Failed to clear decorations:', error);
      }
    }
  }

  /**
   * Toggle extension enabled/disabled state
   */
  async toggleEnabled(): Promise<void> {
    if (!this.isActivated) {
      return;
    }

    try {
      const currentState = this.settingsManager.isEnabled();
      await this.settingsManager.updateSetting('enabled', !currentState);
      
      // Settings change will be handled automatically by the settings manager callback
      
    } catch (error) {
      console.error('Failed to toggle extension state:', error);
      vscode.window.showErrorMessage('Failed to toggle CSS Variable Color Chips extension');
    }
  }

  /**
   * Show extension information
   */
  showInfo(): void {
    const stats = this.getStats();
    const info = [
      `CSS Variable Color Chips Extension`,
      ``,
      `Status: ${stats.isActivated ? 'Activated' : 'Not Activated'}`,
      `Enabled: ${stats.isEnabled ? 'Yes' : 'No'}`,
      ``,
      `Real-time Updates: ${stats.realtimeUpdater?.isActive ? 'Active' : 'Inactive'}`,
      `Pending Updates: ${stats.realtimeUpdater?.pendingUpdates || 0}`,
      `Cached Editors: ${stats.realtimeUpdater?.cachedEditors || 0}`,
      ``,
      `File Watchers: ${stats.fileWatcher?.watchersCount || 0}`,
      `Cache Size: ${stats.cacheManager?.size || 0}`,
      ``,
      `Settings: Open VS Code settings and search for "cssVariableColorChips"`
    ].join('\n');

    vscode.window.showInformationMessage(info, { modal: true });
  }

  // Private helper methods

  /**
   * Initialize all components
   */
  private initializeComponents(): void {
    // Initialize settings manager first (with error handler)
    this.settingsManager = new SettingsManagerImpl(this.errorHandler);

    // Initialize cache manager
    const cacheSize = this.settingsManager.getCacheSizeLimit();
    this.cacheManager = new CacheManagerImpl(cacheSize);

    // Initialize parsers
    this.cssParser = new CSSParser();
    this.scssParser = new SCSSParser();

    // Initialize variable resolver (with error handler)
    this.variableResolver = new VariableResolverImpl(this.errorHandler);

    // Initialize decoration provider
    this.decorationProvider = new DecorationProviderImpl();

    // Initialize incremental analyzer
    this.incrementalAnalyzer = new IncrementalAnalyzer(
      this.cssParser,
      this.scssParser
    );

    // Initialize dynamic mode handler
    this.dynamicModeHandler = new DynamicModeHandlerImpl(this.settingsManager);

    // Initialize file watcher
    this.fileWatcher = new FileWatcherImpl(this.settingsManager);

    // Initialize real-time updater
    this.realtimeUpdater = new RealtimeUpdater(
      this.fileWatcher,
      this.decorationProvider,
      this.settingsManager,
      this.cacheManager,
      this.incrementalAnalyzer,
      this.variableResolver,
      this.dynamicModeHandler
    );

    // Setup settings change handler
    this.settingsManager.onSettingsChanged(() => {
      this.handleSettingsChange();
    });
  }

  /**
   * Setup extension context (commands, etc.)
   */
  private setupExtensionContext(context: vscode.ExtensionContext): void {
    // Register commands
    const commands = [
      vscode.commands.registerCommand('cssVariableColorChips.toggle', () => {
        this.toggleEnabled();
      }),
      vscode.commands.registerCommand('cssVariableColorChips.refresh', () => {
        this.refreshAllDocuments();
      }),
      vscode.commands.registerCommand('cssVariableColorChips.clear', () => {
        this.clearAllDecorations();
      }),
      vscode.commands.registerCommand('cssVariableColorChips.info', () => {
        this.showInfo();
      }),
      vscode.commands.registerCommand('cssVariableColorChips.refreshDocument', (uri?: vscode.Uri) => {
        if (uri) {
          const document = vscode.workspace.textDocuments.find(doc => 
            doc.uri.toString() === uri.toString()
          );
          if (document) {
            this.refreshDocument(document);
          }
        }
      }),
      
      // Debug commands
      vscode.commands.registerCommand('cssVariableColorChips.showLogs', () => {
        this.showLogs();
      }),
      vscode.commands.registerCommand('cssVariableColorChips.exportDebugInfo', () => {
        this.exportDebugInfo();
      }),
      vscode.commands.registerCommand('cssVariableColorChips.clearLogs', () => {
        this.clearLogs();
      }),
      vscode.commands.registerCommand('cssVariableColorChips.toggleDebugMode', () => {
        this.toggleDebugMode();
      })
    ];

    // Add commands to disposables
    this.disposables.push(...commands);

    // Add components to disposables
    this.disposables.push(
      this.settingsManager,
      this.fileWatcher,
      this.decorationProvider,
      this.incrementalAnalyzer,
      this.realtimeUpdater
    );

    // Register with extension context
    context.subscriptions.push(...this.disposables);
  }

  /**
   * Handle settings changes
   */
  private handleSettingsChange(): void {
    try {
      // Update cache size if changed
      const newCacheSize = this.settingsManager.getCacheSizeLimit();
      this.cacheManager.setMaxSize(newCacheSize);

      // Handle enabled/disabled state
      if (this.settingsManager.isEnabled()) {
        if (!this.realtimeUpdater.getStats().isActive) {
          this.realtimeUpdater.start();
        }
      } else {
        this.realtimeUpdater.stop();
        this.clearAllDecorations();
      }

    } catch (error) {
      if (this.settingsManager.enableDebugLogging()) {
        console.error('Error handling settings change:', error);
      }
    }
  }

  /**
   * Dispose all components
   */
  private disposeComponents(): void {
    // Components are disposed through the disposables array
    // This method is here for any additional cleanup if needed
  }

  /**
   * Handle extension errors
   */
  private handleError(error: Error, context: string): void {
    if (this.settingsManager?.enableDebugLogging()) {
      console.error(`CSS Variable Color Chips - ${context}:`, error);
    }

    // Show user-friendly error message for critical errors
    if (context.includes('activation') || context.includes('critical')) {
      vscode.window.showErrorMessage(
        `CSS Variable Color Chips: ${context}. Check the console for details.`
      );
    }
  }

  /**
   * Validate extension state
   */
  private validateState(): boolean {
    if (!this.isActivated) {
      console.warn('CSS Variable Color Chips: Extension not activated');
      return false;
    }

    if (!this.settingsManager) {
      console.error('CSS Variable Color Chips: Settings manager not initialized');
      return false;
    }

    return true;
  }

  /**
   * Get component health status
   */
  getHealthStatus(): {
    overall: 'healthy' | 'warning' | 'error';
    components: Record<string, 'healthy' | 'warning' | 'error'>;
    issues: string[];
    errorStats?: any;
  } {
    const issues: string[] = [];
    const components: Record<string, 'healthy' | 'warning' | 'error'> = {};

    // Check each component
    components.errorHandler = this.errorHandler ? 'healthy' : 'error';
    components.settingsManager = this.settingsManager ? 'healthy' : 'error';
    components.cacheManager = this.cacheManager ? 'healthy' : 'error';
    components.fileWatcher = this.fileWatcher ? 'healthy' : 'error';
    components.decorationProvider = this.decorationProvider ? 'healthy' : 'error';
    components.incrementalAnalyzer = this.incrementalAnalyzer ? 'healthy' : 'error';
    components.variableResolver = this.variableResolver ? 'healthy' : 'error';
    components.dynamicModeHandler = this.dynamicModeHandler ? 'healthy' : 'error';
    components.realtimeUpdater = this.realtimeUpdater ? 'healthy' : 'error';

    // Check for issues
    if (!this.isActivated) {
      issues.push('Extension not activated');
    }

    if (this.settingsManager && !this.settingsManager.isEnabled()) {
      issues.push('Extension is disabled in settings');
    }

    // Get error statistics
    let errorStats;
    if (this.errorHandler) {
      errorStats = this.errorHandler.getErrorStats();
      
      // Check error levels
      if (errorStats.totalErrors > 0) {
        const criticalErrors = errorStats.errorsBySeverity.critical || 0;
        const highErrors = errorStats.errorsBySeverity.high || 0;
        
        if (criticalErrors > 0) {
          issues.push(`${criticalErrors} critical errors detected`);
        }
        if (highErrors > 0) {
          issues.push(`${highErrors} high severity errors detected`);
        }
        if (errorStats.totalErrors > 10) {
          issues.push(`High error count: ${errorStats.totalErrors} total errors`);
        }
      }
    }

    const errorComponents = Object.entries(components)
      .filter(([, status]) => status === 'error')
      .map(([name]) => name);

    if (errorComponents.length > 0) {
      issues.push(`Components with errors: ${errorComponents.join(', ')}`);
    }

    // Determine overall status
    let overall: 'healthy' | 'warning' | 'error' = 'healthy';
    if (errorComponents.length > 0) {
      overall = 'error';
    } else if (issues.length > 0) {
      overall = 'warning';
    }

    // Include error stats if available
    const result: any = {
      overall,
      components,
      issues
    };

    if (errorStats) {
      result.errorStats = errorStats;
    }

    return result;
  }

  /**
   * Show logs in output channel
   */
  private showLogs(): void {
    if (this.logger) {
      this.logger.show();
      this.logger.info('Debug', 'Logs displayed to user');
    } else {
      vscode.window.showWarningMessage('Logger not initialized');
    }
  }

  /**
   * Export debug information
   */
  private async exportDebugInfo(): Promise<void> {
    if (this.debugInfoCollector) {
      await this.debugInfoCollector.saveDebugInfoToFile();
    } else {
      vscode.window.showWarningMessage('Debug info collector not initialized');
    }
  }

  /**
   * Clear all logs
   */
  private clearLogs(): void {
    if (this.logger) {
      this.logger.clearLogs();
      vscode.window.showInformationMessage('Logs cleared');
    } else {
      vscode.window.showWarningMessage('Logger not initialized');
    }
  }

  /**
   * Toggle debug mode
   */
  private toggleDebugMode(): void {
    if (this.logger) {
      const currentDebugMode = this.logger.isDebugMode();
      this.logger.setDebugMode(!currentDebugMode);
      
      const newState = this.logger.isDebugMode() ? 'enabled' : 'disabled';
      vscode.window.showInformationMessage(`Debug mode ${newState}`);
      
      this.logger.info('Debug', `Debug mode toggled to ${newState}`);
    } else {
      vscode.window.showWarningMessage('Logger not initialized');
    }
  }

  /**
   * Get debug information
   */
  getDebugInfo(): any {
    if (this.debugInfoCollector) {
      return this.debugInfoCollector.collectAllDebugInfo();
    }
    return null;
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): any {
    if (this.performanceLogger) {
      return {
        activeTimers: this.performanceLogger.getActiveTimers(),
        recentLogs: this.logger?.getRecentLogs(20).filter(log => log.category === 'Performance')
      };
    }
    return null;
  }
}