import * as vscode from 'vscode';

/**
 * Log levels for the extension
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

/**
 * Log entry interface
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  stack?: string;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(category: string, message: string, data?: any): void;
  info(category: string, message: string, data?: any): void;
  warn(category: string, message: string, data?: any): void;
  error(category: string, message: string, error?: Error, data?: any): void;
  setLogLevel(level: LogLevel): void;
  getLogLevel(): LogLevel;
  getRecentLogs(count?: number): LogEntry[];
  clearLogs(): void;
  exportLogs(): string;
}

/**
 * Logger implementation with VSCode output channel integration
 */
export class LoggerImpl implements Logger {
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel = LogLevel.INFO;
  private recentLogs: LogEntry[] = [];
  private maxRecentLogs = 1000;
  private debugMode = false;

  constructor(channelName: string = 'CSS Variable Color Chips') {
    this.outputChannel = vscode.window.createOutputChannel(channelName);
  }

  /**
   * Set debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    if (enabled) {
      this.setLogLevel(LogLevel.DEBUG);
      this.info('Logger', 'Debug mode enabled');
    } else {
      this.setLogLevel(LogLevel.INFO);
      this.info('Logger', 'Debug mode disabled');
    }
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugMode(): boolean {
    return this.debugMode;
  }

  /**
   * Set the minimum log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info('Logger', `Log level set to ${LogLevel[level]}`);
  }

  /**
   * Get the current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Log debug message
   */
  debug(category: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  /**
   * Log info message
   */
  info(category: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  /**
   * Log warning message
   */
  warn(category: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  /**
   * Log error message
   */
  error(category: string, message: string, error?: Error, data?: any): void {
    const logData = data || {};
    if (error) {
      logData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }
    this.log(LogLevel.ERROR, category, message, logData, error?.stack);
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(count: number = 100): LogEntry[] {
    return this.recentLogs.slice(-count);
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.recentLogs = [];
    this.outputChannel.clear();
    this.info('Logger', 'Logs cleared');
  }

  /**
   * Export logs as string
   */
  exportLogs(): string {
    const logs = this.recentLogs.map(entry => {
      const timestamp = entry.timestamp.toISOString();
      const level = LogLevel[entry.level].padEnd(5);
      const category = entry.category.padEnd(20);
      let line = `[${timestamp}] ${level} ${category} ${entry.message}`;
      
      if (entry.data) {
        line += `\n  Data: ${JSON.stringify(entry.data, null, 2)}`;
      }
      
      if (entry.stack) {
        line += `\n  Stack: ${entry.stack}`;
      }
      
      return line;
    }).join('\n');

    return logs;
  }

  /**
   * Show output channel
   */
  show(): void {
    this.outputChannel.show();
  }

  /**
   * Hide output channel
   */
  hide(): void {
    this.outputChannel.hide();
  }

  /**
   * Dispose the logger
   */
  dispose(): void {
    this.outputChannel.dispose();
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, category: string, message: string, data?: any, stack?: string): void {
    // Check if we should log this level
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      data,
      stack: stack || undefined
    };

    // Add to recent logs
    this.recentLogs.push(entry);
    if (this.recentLogs.length > this.maxRecentLogs) {
      this.recentLogs = this.recentLogs.slice(-this.maxRecentLogs);
    }

    // Format message for output channel
    const timestamp = entry.timestamp.toISOString();
    const levelStr = LogLevel[level];
    let outputMessage = `[${timestamp}] ${levelStr} [${category}] ${message}`;

    if (data && this.debugMode) {
      outputMessage += `\n  Data: ${JSON.stringify(data, null, 2)}`;
    }

    if (stack && this.debugMode) {
      outputMessage += `\n  Stack: ${stack}`;
    }

    // Write to output channel
    this.outputChannel.appendLine(outputMessage);

    // Also log to console in debug mode
    if (this.debugMode) {
      const consoleMethod = this.getConsoleMethod(level);
      if (data || stack) {
        consoleMethod(`[${category}] ${message}`, { data, stack });
      } else {
        consoleMethod(`[${category}] ${message}`);
      }
    }
  }

  /**
   * Get appropriate console method for log level
   */
  private getConsoleMethod(level: LogLevel): (...args: any[]) => void {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug;
      case LogLevel.INFO:
        return console.info;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.ERROR:
        return console.error;
      default:
        return console.log;
    }
  }
}

/**
 * Performance logger for measuring execution times
 */
export class PerformanceLogger {
  private logger: Logger;
  private timers: Map<string, number> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Start timing an operation
   */
  startTimer(operationId: string, description?: string): void {
    this.timers.set(operationId, Date.now());
    if (description) {
      this.logger.debug('Performance', `Started: ${description}`, { operationId });
    }
  }

  /**
   * End timing an operation and log the result
   */
  endTimer(operationId: string, description?: string): number {
    const startTime = this.timers.get(operationId);
    if (!startTime) {
      this.logger.warn('Performance', `Timer not found: ${operationId}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(operationId);

    const message = description || `Operation ${operationId} completed`;
    this.logger.debug('Performance', `${message} (${duration}ms)`, {
      operationId,
      duration,
      startTime: new Date(startTime),
      endTime: new Date()
    });

    return duration;
  }

  /**
   * Measure execution time of a function
   */
  async measureAsync<T>(
    operationId: string,
    description: string,
    operation: () => Promise<T>
  ): Promise<T> {
    this.startTimer(operationId, description);
    try {
      const result = await operation();
      this.endTimer(operationId, description);
      return result;
    } catch (error) {
      this.endTimer(operationId, `${description} (failed)`);
      throw error;
    }
  }

  /**
   * Measure execution time of a synchronous function
   */
  measureSync<T>(
    operationId: string,
    description: string,
    operation: () => T
  ): T {
    this.startTimer(operationId, description);
    try {
      const result = operation();
      this.endTimer(operationId, description);
      return result;
    } catch (error) {
      this.endTimer(operationId, `${description} (failed)`);
      throw error;
    }
  }

  /**
   * Get all active timers
   */
  getActiveTimers(): Array<{ operationId: string; startTime: Date; duration: number }> {
    const now = Date.now();
    return Array.from(this.timers.entries()).map(([operationId, startTime]) => ({
      operationId,
      startTime: new Date(startTime),
      duration: now - startTime
    }));
  }

  /**
   * Clear all timers
   */
  clearTimers(): void {
    this.timers.clear();
    this.logger.debug('Performance', 'All timers cleared');
  }
}

/**
 * Debug information collector
 */
export class DebugInfoCollector {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Collect system information
   */
  collectSystemInfo(): any {
    const info = {
      vscodeVersion: vscode.version,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    this.logger.debug('Debug', 'System info collected', info);
    return info;
  }

  /**
   * Collect workspace information
   */
  collectWorkspaceInfo(): any {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const info = {
      workspaceFolders: workspaceFolders?.map(folder => ({
        name: folder.name,
        uri: folder.uri.toString()
      })) || [],
      workspaceFile: vscode.workspace.workspaceFile?.toString(),
      name: vscode.workspace.name,
      timestamp: new Date().toISOString()
    };

    this.logger.debug('Debug', 'Workspace info collected', info);
    return info;
  }

  /**
   * Collect extension configuration
   */
  collectExtensionConfig(): any {
    const config = vscode.workspace.getConfiguration('cssVariableColorChips');
    const info = {
      enabled: config.get('enabled'),
      displayMode: config.get('displayMode'),
      enabledFileTypes: config.get('enabledFileTypes'),
      variableResolutionScope: config.get('variableResolutionScope'),
      chipSize: config.get('chipSize'),
      showVariableDefinitions: config.get('showVariableDefinitions'),
      showVariableUsages: config.get('showVariableUsages'),
      enableHoverInfo: config.get('enableHoverInfo'),
      debugLogging: config.get('debugLogging'),
      maxColorsInMultipleMode: config.get('maxColorsInMultipleMode'),
      cacheSizeLimit: config.get('cacheSizeLimit'),
      debounceDelay: config.get('debounceDelay'),
      customThemePaths: config.get('customThemePaths'),
      timestamp: new Date().toISOString()
    };

    this.logger.debug('Debug', 'Extension config collected', info);
    return info;
  }

  /**
   * Collect all debug information
   */
  collectAllDebugInfo(): any {
    const debugInfo = {
      system: this.collectSystemInfo(),
      workspace: this.collectWorkspaceInfo(),
      extensionConfig: this.collectExtensionConfig(),
      recentLogs: this.logger.getRecentLogs(50),
      timestamp: new Date().toISOString()
    };

    this.logger.info('Debug', 'Complete debug info collected');
    return debugInfo;
  }

  /**
   * Export debug information as formatted string
   */
  exportDebugInfo(): string {
    const debugInfo = this.collectAllDebugInfo();
    return JSON.stringify(debugInfo, null, 2);
  }

  /**
   * Save debug information to file
   */
  async saveDebugInfoToFile(): Promise<void> {
    try {
      const debugInfo = this.exportDebugInfo();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `css-variable-color-chips-debug-${timestamp}.json`;
      
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(fileName),
        filters: {
          'JSON Files': ['json'],
          'All Files': ['*']
        }
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(debugInfo, 'utf8'));
        this.logger.info('Debug', `Debug info saved to ${uri.fsPath}`);
        vscode.window.showInformationMessage(`Debug info saved to ${uri.fsPath}`);
      }
    } catch (error) {
      this.logger.error('Debug', 'Failed to save debug info', error instanceof Error ? error : new Error(String(error)));
      vscode.window.showErrorMessage('Failed to save debug info');
    }
  }
}

/**
 * Global logger instance
 */
let globalLogger: LoggerImpl | undefined;

/**
 * Get or create global logger instance
 */
export function getLogger(): LoggerImpl {
  if (!globalLogger) {
    globalLogger = new LoggerImpl();
  }
  return globalLogger;
}

/**
 * Initialize logger with extension context
 */
export function initializeLogger(context: vscode.ExtensionContext): LoggerImpl {
  const logger = getLogger();
  
  // Set debug mode based on extension mode
  const isDebug = context.extensionMode === vscode.ExtensionMode.Development;
  logger.setDebugMode(isDebug);
  
  // Add dispose to context
  context.subscriptions.push({
    dispose: () => logger.dispose()
  });
  
  logger.info('Logger', 'Logger initialized', {
    extensionMode: vscode.ExtensionMode[context.extensionMode],
    debugMode: isDebug
  });
  
  return logger;
}

/**
 * Dispose global logger
 */
export function disposeLogger(): void {
  if (globalLogger) {
    globalLogger.dispose();
    globalLogger = undefined;
  }
}