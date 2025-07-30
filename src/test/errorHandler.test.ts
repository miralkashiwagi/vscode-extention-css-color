import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  ErrorHandlerImpl,
  CSSVariableColorChipsError,
  VariableResolutionError,
  PerformanceTimeoutError,
  SettingsValidationError,
  ParserError,
  ErrorType,
  ErrorSeverity,
  withTimeout,
  safeExecute,
  safeExecuteSync
} from '../errorHandler';

suite('ErrorHandler Tests', () => {
  let errorHandler: ErrorHandlerImpl;

  setup(() => {
    errorHandler = new ErrorHandlerImpl();
  });

  suite('Error Classes', () => {
    test('should create CSSVariableColorChipsError with correct properties', () => {
      const error = new CSSVariableColorChipsError(
        'Test error',
        ErrorType.VARIABLE_RESOLUTION,
        ErrorSeverity.HIGH,
        { test: 'context' }
      );

      assert.strictEqual(error.message, 'Test error');
      assert.strictEqual(error.type, ErrorType.VARIABLE_RESOLUTION);
      assert.strictEqual(error.severity, ErrorSeverity.HIGH);
      assert.deepStrictEqual(error.context, { test: 'context' });
      assert.ok(error.timestamp instanceof Date);
    });

    test('should create VariableResolutionError with correct format', () => {
      const error = new VariableResolutionError(
        '--primary-color',
        'not found',
        { document: 'test.css' }
      );

      assert.strictEqual(error.message, "Failed to resolve variable '--primary-color': not found");
      assert.strictEqual(error.type, ErrorType.VARIABLE_RESOLUTION);
      assert.strictEqual(error.severity, ErrorSeverity.LOW);
      assert.strictEqual(error.context?.variableName, '--primary-color');
      assert.strictEqual(error.context?.reason, 'not found');
    });

    test('should create PerformanceTimeoutError with correct format', () => {
      const error = new PerformanceTimeoutError(
        'variable resolution',
        5000,
        { document: 'large.scss' }
      );

      assert.strictEqual(error.message, "Operation 'variable resolution' timed out after 5000ms");
      assert.strictEqual(error.type, ErrorType.PERFORMANCE_TIMEOUT);
      assert.strictEqual(error.severity, ErrorSeverity.HIGH);
      assert.strictEqual(error.context?.operation, 'variable resolution');
      assert.strictEqual(error.context?.timeoutMs, 5000);
    });

    test('should create SettingsValidationError with correct format', () => {
      const error = new SettingsValidationError(
        'displayMode',
        'invalid',
        'not a valid mode',
        { validValues: ['default', 'computed'] }
      );

      assert.strictEqual(error.message, "Invalid setting 'displayMode' with value 'invalid': not a valid mode");
      assert.strictEqual(error.type, ErrorType.SETTINGS_VALIDATION);
      assert.strictEqual(error.severity, ErrorSeverity.MEDIUM);
      assert.strictEqual(error.context?.settingKey, 'displayMode');
      assert.strictEqual(error.context?.value, 'invalid');
    });
  });

  suite('Error Handler', () => {
    test('should handle generic errors', () => {
      const genericError = new Error('Generic error');
      
      assert.doesNotThrow(() => {
        errorHandler.handleError(genericError);
      });

      const stats = errorHandler.getErrorStats();
      assert.strictEqual(stats.totalErrors, 1);
      assert.strictEqual(stats.errorsByType[ErrorType.PARSER_ERROR], 1);
    });

    test('should handle variable resolution errors', () => {
      const error = new VariableResolutionError('--test', 'not found');
      
      assert.doesNotThrow(() => {
        errorHandler.handleVariableResolutionError(error);
      });

      const stats = errorHandler.getErrorStats();
      assert.strictEqual(stats.totalErrors, 1);
      assert.strictEqual(stats.errorsByType[ErrorType.VARIABLE_RESOLUTION], 1);
      assert.strictEqual(stats.errorsBySeverity[ErrorSeverity.LOW], 1);
    });

    test('should handle performance timeout errors', () => {
      const error = new PerformanceTimeoutError('test operation', 1000);
      
      assert.doesNotThrow(() => {
        errorHandler.handlePerformanceTimeoutError(error);
      });

      const stats = errorHandler.getErrorStats();
      assert.strictEqual(stats.totalErrors, 1);
      assert.strictEqual(stats.errorsByType[ErrorType.PERFORMANCE_TIMEOUT], 1);
      assert.strictEqual(stats.errorsBySeverity[ErrorSeverity.HIGH], 1);
    });

    test('should handle settings validation errors', () => {
      const error = new SettingsValidationError('test', 'invalid', 'reason');
      
      assert.doesNotThrow(() => {
        errorHandler.handleSettingsValidationError(error);
      });

      const stats = errorHandler.getErrorStats();
      assert.strictEqual(stats.totalErrors, 1);
      assert.strictEqual(stats.errorsByType[ErrorType.SETTINGS_VALIDATION], 1);
      assert.strictEqual(stats.errorsBySeverity[ErrorSeverity.MEDIUM], 1);
    });

    test('should track recent errors', () => {
      const error1 = new VariableResolutionError('--test1', 'reason1');
      const error2 = new VariableResolutionError('--test2', 'reason2');

      errorHandler.handleVariableResolutionError(error1);
      errorHandler.handleVariableResolutionError(error2);

      const stats = errorHandler.getErrorStats();
      assert.strictEqual(stats.recentErrors.length, 2);
      assert.strictEqual(stats.recentErrors[0].error.context?.variableName, '--test2');
      assert.strictEqual(stats.recentErrors[1].error.context?.variableName, '--test1');
    });

    test('should limit recent errors to maximum', () => {
      // Create more errors than the limit (50)
      for (let i = 0; i < 60; i++) {
        const error = new VariableResolutionError(`--test${i}`, 'reason');
        errorHandler.handleVariableResolutionError(error);
      }

      const stats = errorHandler.getErrorStats();
      assert.strictEqual(stats.totalErrors, 60);
      assert.strictEqual(stats.recentErrors.length, 50); // Should be limited to 50
    });

    test('should clear error statistics', () => {
      const error = new VariableResolutionError('--test', 'reason');
      errorHandler.handleVariableResolutionError(error);

      let stats = errorHandler.getErrorStats();
      assert.strictEqual(stats.totalErrors, 1);

      errorHandler.clearErrorStats();

      stats = errorHandler.getErrorStats();
      assert.strictEqual(stats.totalErrors, 0);
      assert.strictEqual(stats.recentErrors.length, 0);
    });

    test('should handle debug mode', () => {
      errorHandler.setDebugMode(true);
      
      const error = new VariableResolutionError('--test', 'reason');
      
      // Should not throw in debug mode
      assert.doesNotThrow(() => {
        errorHandler.handleVariableResolutionError(error);
      });
    });
  });

  suite('Utility Functions', () => {
    test('withTimeout should resolve when promise completes in time', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise, 1000, 'test operation');
      assert.strictEqual(result, 'success');
    });

    test('withTimeout should reject when promise times out', async () => {
      const promise = new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        await withTimeout(promise, 100, 'test operation');
        assert.fail('Should have thrown timeout error');
      } catch (error) {
        assert.ok(error instanceof PerformanceTimeoutError);
        assert.strictEqual((error as PerformanceTimeoutError).context?.operation, 'test operation');
        assert.strictEqual((error as PerformanceTimeoutError).context?.timeoutMs, 100);
      }
    });

    test('safeExecute should return result when operation succeeds', async () => {
      const operation = async () => 'success';
      const result = await safeExecute(operation, 'fallback', errorHandler, 'test');
      assert.strictEqual(result, 'success');
    });

    test('safeExecute should return fallback when operation fails', async () => {
      const operation = async () => {
        throw new Error('Operation failed');
      };
      
      const result = await safeExecute(operation, 'fallback', errorHandler, 'test');
      assert.strictEqual(result, 'fallback');
      
      const stats = errorHandler.getErrorStats();
      assert.strictEqual(stats.totalErrors, 1);
    });

    test('safeExecuteSync should return result when operation succeeds', () => {
      const operation = () => 'success';
      const result = safeExecuteSync(operation, 'fallback', errorHandler, 'test');
      assert.strictEqual(result, 'success');
    });

    test('safeExecuteSync should return fallback when operation fails', () => {
      const operation = () => {
        throw new Error('Operation failed');
      };
      
      const result = safeExecuteSync(operation, 'fallback', errorHandler, 'test');
      assert.strictEqual(result, 'fallback');
      
      const stats = errorHandler.getErrorStats();
      assert.strictEqual(stats.totalErrors, 1);
    });
  });

  suite('Error Statistics', () => {
    test('should provide accurate error statistics', () => {
      // Add different types of errors
      errorHandler.handleVariableResolutionError(new VariableResolutionError('--test1', 'reason'));
      errorHandler.handlePerformanceTimeoutError(new PerformanceTimeoutError('op1', 1000));
      errorHandler.handleSettingsValidationError(new SettingsValidationError('key1', 'val1', 'reason'));
      errorHandler.handleVariableResolutionError(new VariableResolutionError('--test2', 'reason'));

      const stats = errorHandler.getErrorStats();
      
      assert.strictEqual(stats.totalErrors, 4);
      assert.strictEqual(stats.errorsByType[ErrorType.VARIABLE_RESOLUTION], 2);
      assert.strictEqual(stats.errorsByType[ErrorType.PERFORMANCE_TIMEOUT], 1);
      assert.strictEqual(stats.errorsByType[ErrorType.SETTINGS_VALIDATION], 1);
      assert.strictEqual(stats.errorsBySeverity[ErrorSeverity.LOW], 2);
      assert.strictEqual(stats.errorsBySeverity[ErrorSeverity.HIGH], 1);
      assert.strictEqual(stats.errorsBySeverity[ErrorSeverity.MEDIUM], 1);
    });

    test('should return copy of statistics to prevent mutation', () => {
      const error = new VariableResolutionError('--test', 'reason');
      errorHandler.handleVariableResolutionError(error);

      const stats1 = errorHandler.getErrorStats();
      const stats2 = errorHandler.getErrorStats();

      // Should be different objects
      assert.notStrictEqual(stats1, stats2);
      
      // But with same content
      assert.deepStrictEqual(stats1, stats2);
      
      // Modifying one shouldn't affect the other
      stats1.totalErrors = 999;
      assert.notStrictEqual(stats1.totalErrors, stats2.totalErrors);
    });
  });
});