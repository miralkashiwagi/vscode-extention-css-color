import * as vscode from 'vscode';

/**
 * Error types for the CSS Variable Color Chips extension
 */
export enum ErrorType {
  VARIABLE_RESOLUTION = 'variable_resolution',
  PERFORMANCE_TIMEOUT = 'performance_timeout',
  SETTINGS_VALIDATION = 'settings_validation',
  PARSER_ERROR = 'parser_error',
  FILE_ACCESS = 'file_access',
  DECORATION_ERROR = 'decoration_error'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Base error class for extension-specific errors
 */
export class CSSVariableColorChipsError extends Error {
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    type: ErrorType,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'CSSVariableColorChipsError';
    this.type = type;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date();
  }
}

/**
 * Variable resolution specific error
 */
export class VariableResolutionError extends CSSVariableColorChipsError {
  constructor(
    variableName: string,
    reason: string,
    context?: Record<string, any>
  ) {
    super(
      `Failed to resolve variable '${variableName}': ${reason}`,
      ErrorType.VARIABLE_RESOLUTION,
      ErrorSeverity.LOW,
      { variableName, reason, ...context }
    );
  }
}

/**
 * Performance timeout error
 */
export class PerformanceTimeoutError extends CSSVariableColorChipsError {
  constructor(
    operation: string,
    timeoutMs: number,
    context?: Record<string, any>
  ) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      ErrorType.PERFORMANCE_TIMEOUT,
      ErrorSeverity.HIGH,
      { operation, timeoutMs, ...context }
    );
  }
}

/**
 * Settings validation error
 */
export class SettingsValidationError extends CSSVariableColorChipsError {
  constructor(
    settingKey: string,
    value: any,
    reason: string,
    context?: Record<string, any>
  ) {
    super(
      `Invalid setting '${settingKey}' with value '${value}': ${reason}`,
      ErrorType.SETTINGS_VALIDATION,
      ErrorSeverity.MEDIUM,
      { settingKey, value, reason, ...context }
    );
  }
}

/**
 * Parser error
 */
export class ParserError extends CSSVariableColorChipsError {
  constructor(
    parserType: string,
    documentUri: string,
    reason: string,
    context?: Record<string, any>
  ) {
    super(
      `Parser error in ${parserType} for document '${documentUri}': ${reason}`,
      ErrorType.PARSER_ERROR,
      ErrorSeverity.MEDIUM,
      { parserType, documentUri, reason, ...context }
    );
  }
}

/**
 * Error handler interface
 */
export interface ErrorHandler {
  handleError(error: Error): void;
  handleVariableResolutionError(error: VariableResolutionError): void;
  handlePerformanceTimeoutError(error: PerformanceTimeoutError): void;
  handleSettingsValidationError(error: SettingsValidationError): void;
  getErrorStats(): ErrorStats;
  clearErrorStats(): void;
}

/**
 * Error statistics
 */
export interface ErrorStats {
  totalErrors: number;
  errorsByType: Record<ErrorType, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recentErrors: Array<{
    error: CSSVariableColorChipsError;
    timestamp: Date;
  }>;
}

/**
 * Error handler implementation
 */
export class ErrorHandlerImpl implements ErrorHandler {
  private errorStats: ErrorStats;
  private maxRecentErrors = 50;
  private debugMode: boolean = false;

  constructor() {
    this.errorStats = this.initializeErrorStats();
  }

  /**
   * Set debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Handle any error
   */
  handleError(error: Error): void {
    if (error instanceof CSSVariableColorChipsError) {
      this.handleExtensionError(error);
    } else {
      // Convert generic error to extension error
      const extensionError = new CSSVariableColorChipsError(
        error.message,
        ErrorType.PARSER_ERROR,
        ErrorSeverity.MEDIUM,
        { originalError: error.name, stack: error.stack }
      );
      this.handleExtensionError(extensionError);
    }
  }

  /**
   * Handle variable resolution error
   */
  handleVariableResolutionError(error: VariableResolutionError): void {
    this.handleExtensionError(error);
    
    // Variable resolution errors are usually not critical
    // Just log them for debugging purposes
    if (this.debugMode) {
      console.warn(`Variable resolution failed: ${error.message}`, error.context);
    }
  }

  /**
   * Handle performance timeout error
   */
  handlePerformanceTimeoutError(error: PerformanceTimeoutError): void {
    this.handleExtensionError(error);
    
    // Performance timeouts are more serious - show warning to user
    console.warn(`Performance timeout: ${error.message}`);
    
    if (error.severity === ErrorSeverity.CRITICAL) {
      vscode.window.showWarningMessage(
        `CSS Variable Color Chips: Operation timed out. Consider reducing file size or disabling the extension for large files.`
      );
    }
  }

  /**
   * Handle settings validation error
   */
  handleSettingsValidationError(error: SettingsValidationError): void {
    this.handleExtensionError(error);
    
    // Settings errors should be shown to the user
    console.error(`Settings validation error: ${error.message}`);
    
    vscode.window.showErrorMessage(
      `CSS Variable Color Chips: Invalid setting '${error.context?.settingKey}'. Using default value.`
    );
  }

  /**
   * Get error statistics
   */
  getErrorStats(): ErrorStats {
    return { ...this.errorStats };
  }

  /**
   * Clear error statistics
   */
  clearErrorStats(): void {
    this.errorStats = this.initializeErrorStats();
  }

  /**
   * Handle extension-specific error
   */
  private handleExtensionError(error: CSSVariableColorChipsError): void {
    // Update statistics
    this.errorStats.totalErrors++;
    this.errorStats.errorsByType[error.type] = (this.errorStats.errorsByType[error.type] || 0) + 1;
    this.errorStats.errorsBySeverity[error.severity] = (this.errorStats.errorsBySeverity[error.severity] || 0) + 1;
    
    // Add to recent errors
    this.errorStats.recentErrors.unshift({
      error,
      timestamp: error.timestamp
    });
    
    // Keep only recent errors
    if (this.errorStats.recentErrors.length > this.maxRecentErrors) {
      this.errorStats.recentErrors = this.errorStats.recentErrors.slice(0, this.maxRecentErrors);
    }
    
    // Log error based on severity
    switch (error.severity) {
      case ErrorSeverity.LOW:
        if (this.debugMode) {
          console.debug(`[CSS Variable Color Chips] ${error.message}`, error.context);
        }
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(`[CSS Variable Color Chips] ${error.message}`, error.context);
        break;
      case ErrorSeverity.HIGH:
        console.error(`[CSS Variable Color Chips] ${error.message}`, error.context);
        break;
      case ErrorSeverity.CRITICAL:
        console.error(`[CSS Variable Color Chips] CRITICAL: ${error.message}`, error.context);
        break;
    }
  }

  /**
   * Initialize error statistics
   */
  private initializeErrorStats(): ErrorStats {
    return {
      totalErrors: 0,
      errorsByType: {} as Record<ErrorType, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      recentErrors: []
    };
  }
}

/**
 * Timeout utility function
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new PerformanceTimeoutError(operation, timeoutMs));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

/**
 * Safe execution wrapper
 */
export async function safeExecute<T>(
  operation: () => Promise<T>,
  fallback: T,
  errorHandler: ErrorHandler,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    errorHandler.handleError(error instanceof Error ? error : new Error(String(error)));
    return fallback;
  }
}

/**
 * Safe synchronous execution wrapper
 */
export function safeExecuteSync<T>(
  operation: () => T,
  fallback: T,
  errorHandler: ErrorHandler,
  operationName: string
): T {
  try {
    return operation();
  } catch (error) {
    errorHandler.handleError(error instanceof Error ? error : new Error(String(error)));
    return fallback;
  }
}