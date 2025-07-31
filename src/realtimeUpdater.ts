import * as vscode from 'vscode';
import { FileWatcher, DecorationProvider, SettingsManager, CacheManager } from './interfaces';
import { IncrementalAnalyzer } from './incrementalAnalyzer';
import { VariableResolverImpl } from './variableResolver';
import { DynamicModeHandlerImpl } from './dynamicModeHandler';
import { ColorValue } from './types';
import { ColorValueImpl } from './colorValue';

export interface RealtimeUpdateOptions {
  enableTypingUpdates: boolean;
  enableFileWatchUpdates: boolean;
  enableVisibleRangeUpdates: boolean;
  debounceDelay: number;
}

export class RealtimeUpdater {
  private disposables: vscode.Disposable[] = [];
  private updateTimers: Map<string, NodeJS.Timeout> = new Map();
  private isActive = false;
  private visibleEditorsCache: Map<string, vscode.TextEditor> = new Map();

  constructor(
    private fileWatcher: FileWatcher,
    private decorationProvider: DecorationProvider,
    private settingsManager: SettingsManager,
    private cacheManager: CacheManager,
    private incrementalAnalyzer: IncrementalAnalyzer,
    private variableResolver: VariableResolverImpl,
    private dynamicModeHandler: DynamicModeHandlerImpl
  ) {}

  /**
   * Start real-time updates
   */
  start(): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    this.setupEventListeners();
    this.fileWatcher.startWatching();
    
    // Initial update for all visible editors
    this.updateAllVisibleEditors();
  }

  /**
   * Stop real-time updates
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.fileWatcher.stopWatching();
    this.disposeEventListeners();
    this.clearAllTimers();
    this.clearVisibleEditorsCache();
  }

  /**
   * Force update for specific document
   */
  forceUpdate(document: vscode.TextDocument): void {
    if (!this.isActive) {
      return;
    }
    
    if (!this.shouldProcessDocument(document)) {
      return;
    }

    const editor = this.findEditorForDocument(document);
    if (editor) {
      this.updateEditor(editor, true);
    }
  }

  /**
   * Update all visible editors
   */
  updateAllVisibleEditors(): void {
    if (!this.isActive) {
      return;
    }

    const visibleEditors = vscode.window.visibleTextEditors;
    
    for (const editor of visibleEditors) {
      if (this.shouldProcessDocument(editor.document)) {
        this.updateEditor(editor, false);
      }
    }
  }

  /**
   * Get update statistics
   */
  getStats(): {
    isActive: boolean;
    pendingUpdates: number;
    cachedEditors: number;
  } {
    return {
      isActive: this.isActive,
      pendingUpdates: this.updateTimers.size,
      cachedEditors: this.visibleEditorsCache.size
    };
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.stop();
  }

  // Private helper methods

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for document content changes
    const contentChangeDisposable = vscode.workspace.onDidChangeTextDocument(
      this.handleDocumentContentChange.bind(this)
    );

    // Listen for visible text editors change
    const visibleEditorsDisposable = vscode.window.onDidChangeVisibleTextEditors(
      this.handleVisibleEditorsChange.bind(this)
    );

    // Listen for active editor change
    const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(
      this.handleActiveEditorChange.bind(this)
    );

    // Listen for visible ranges change
    const visibleRangesDisposable = vscode.window.onDidChangeTextEditorVisibleRanges(
      this.handleVisibleRangesChange.bind(this)
    );

    // Listen for file changes from FileWatcher
    this.fileWatcher.onFileChanged(this.handleFileChange.bind(this));

    // Listen for settings changes
    this.settingsManager.onSettingsChanged(this.handleSettingsChange.bind(this));

    this.disposables.push(
      contentChangeDisposable,
      visibleEditorsDisposable,
      activeEditorDisposable,
      visibleRangesDisposable
    );
  }

  /**
   * Handle document content changes
   */
  private handleDocumentContentChange(event: vscode.TextDocumentChangeEvent): void {
    if (!this.shouldProcessDocument(event.document)) {
      return;
    }

    const editor = this.findEditorForDocument(event.document);
    if (!editor) {
      return;
    }

    // Process incremental changes
    const changes = event.contentChanges.map(change => ({
      range: change.range,
      text: change.text,
      rangeLength: change.rangeLength
    }));

    // Update incremental analyzer
    this.incrementalAnalyzer.processIncrementalChange(event.document, changes);

    // Schedule debounced update
    this.scheduleUpdate(editor, false);
  }

  /**
   * Handle visible editors change
   */
  private handleVisibleEditorsChange(editors: readonly vscode.TextEditor[]): void {
    // Update cache
    this.updateVisibleEditorsCache(editors);

    // Update new visible editors
    for (const editor of editors) {
      if (this.shouldProcessDocument(editor.document)) {
        this.scheduleUpdate(editor, false);
      }
    }
  }

  /**
   * Handle active editor change
   */
  private handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    if (!editor || !this.shouldProcessDocument(editor.document)) {
      return;
    }

    // Update active editor with higher priority
    this.scheduleUpdate(editor, false, 100); // Shorter delay for active editor
  }

  /**
   * Handle visible ranges change
   */
  private handleVisibleRangesChange(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (!this.shouldProcessDocument(event.textEditor.document)) {
      return;
    }

    // Analyze newly visible regions
    const visibleRanges = [...event.textEditor.visibleRanges];
    this.incrementalAnalyzer.analyzeVisibleRegions(event.textEditor.document, visibleRanges);

    // Schedule update
    this.scheduleUpdate(event.textEditor, false);
  }

  /**
   * Handle file changes from FileWatcher
   */
  private handleFileChange(uri: vscode.Uri): void {
    // Find editors for this file
    const editors = vscode.window.visibleTextEditors.filter(
      editor => editor.document.uri.toString() === uri.toString()
    );

    for (const editor of editors) {
      if (this.shouldProcessDocument(editor.document)) {
        // Invalidate caches
        this.cacheManager.invalidate(uri.toString());
        this.incrementalAnalyzer.invalidateDocument(uri.toString());
        this.dynamicModeHandler.invalidateDocumentCache(uri.toString());

        // Force update
        this.scheduleUpdate(editor, true);
      }
    }
  }

  /**
   * Handle settings changes
   */
  private handleSettingsChange(): void {
    // Clear all caches when settings change
    this.cacheManager.clear();
    this.incrementalAnalyzer.clearCache();
    this.dynamicModeHandler.clearCaches();

    // Update decoration styles
    this.decorationProvider.updateDecorationStyles();

    // Force update all visible editors
    this.updateAllVisibleEditors();
  }

  /**
   * Schedule debounced update for editor
   */
  private scheduleUpdate(
    editor: vscode.TextEditor,
    immediate: boolean,
    customDelay?: number
  ): void {
    const editorId = editor.document.uri.toString();
    
    // Clear existing timer
    const existingTimer = this.updateTimers.get(editorId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    if (immediate) {
      this.updateEditor(editor, true);
      return;
    }

    // Schedule new update
    const delay = customDelay || this.settingsManager.getDebounceDelay();
    const timer = setTimeout(() => {
      this.updateTimers.delete(editorId);
      this.updateEditor(editor, false);
    }, delay);

    this.updateTimers.set(editorId, timer);
  }

  /**
   * Update editor with color chips
   */
  private async updateEditor(editor: vscode.TextEditor, immediate: boolean): Promise<void> {
    try {
      const document = editor.document;
      
      // Get analysis result
      const visibleRanges = [...editor.visibleRanges];
      const analysisResult = immediate 
        ? this.incrementalAnalyzer.analyzeVisibleRegions(document, visibleRanges)
        : this.incrementalAnalyzer.getAnalysisResult(document.uri.toString()) ||
          this.incrementalAnalyzer.analyzeVisibleRegions(document, visibleRanges);

      // Create decorations
      const decorations = await this.createDecorations(document, analysisResult);

      // Apply decorations
      this.decorationProvider.applyDecorations(editor, decorations);

    } catch (error) {
      if (this.settingsManager.enableDebugLogging()) {
        console.error(`Failed to update editor ${editor.document.uri.toString()}:`, error);
      }
    }
  }

  /**
   * Create decorations from analysis result
   */
  private async createDecorations(
    document: vscode.TextDocument,
    analysisResult: any
  ): Promise<vscode.DecorationOptions[]> {
    const decorations: vscode.DecorationOptions[] = [];
    const settings = this.settingsManager;
    const processedRanges = new Set<string>(); // Track processed ranges to avoid duplicates

    // Helper function to check if range is already processed
    const isRangeProcessed = (range: vscode.Range): boolean => {
      const key = `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
      return processedRanges.has(key);
    };

    // Helper function to mark range as processed
    const markRangeProcessed = (range: vscode.Range): void => {
      const key = `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
      processedRanges.add(key);
    };

    // Skip direct color values - VS Code handles these natively

    // Process variable definitions (medium priority)
    if (settings.showVariableDefinitions()) {
      for (const varDef of analysisResult.variableDefinitions || []) {
        if (!isRangeProcessed(varDef.range)) {
          const colorValue = await this.resolveVariableColor(varDef.name, varDef.value, document);
          if (colorValue) {
            if (Array.isArray(colorValue)) {
              // Multiple colors
              const decoration = this.decorationProvider.createMultipleColorChips(
                colorValue,
                varDef.range,
                'Variable definition'
              );
              decorations.push(decoration);
            } else {
              // Single color
              const decoration = this.decorationProvider.createVariableColorChip(
                varDef.name,
                colorValue,
                varDef.range
              );
              decorations.push(decoration);
            }
            markRangeProcessed(varDef.range);
          }
        }
      }
    }

    // Process variable usages (lowest priority)
    if (settings.showVariableUsages()) {
      for (const varUsage of analysisResult.variableUsages || []) {
        if (!isRangeProcessed(varUsage.range)) {
          const colorValue = await this.resolveVariableColor(varUsage.name, null, document);
          if (colorValue) {
            if (Array.isArray(colorValue)) {
              // Multiple colors
              const decoration = this.decorationProvider.createMultipleColorChips(
                colorValue,
                varUsage.range,
                'Variable usage'
              );
              decorations.push(decoration);
            } else {
              // Single color
              const fallbackColor = varUsage.fallbackValue 
                ? await this.resolveColorValue(varUsage.fallbackValue)
                : undefined;
              
              const decoration = this.decorationProvider.createVariableColorChip(
                varUsage.name,
                colorValue,
                varUsage.range,
                fallbackColor || undefined
              );
              decorations.push(decoration);
            }
            markRangeProcessed(varUsage.range);
          }
          // If colorValue is null (variable is not a color or undefined), don't show anything
        }
      }
    }

    return decorations;
  }

  /**
   * Resolve variable color using dynamic mode handler
   */
  private async resolveVariableColor(
    variableName: string,
    defaultValue: string | null,
    document: vscode.TextDocument
  ): Promise<ColorValue | ColorValue[] | null> {
    try {
      // First resolve the default value if provided
      let defaultColorValue: ColorValue | null = null;
      if (defaultValue) {
        defaultColorValue = await this.resolveColorValue(defaultValue);
      }

      // If no default color value, try to resolve from variable resolver
      if (!defaultColorValue) {
        if (variableName.startsWith('--')) {
          defaultColorValue = await this.variableResolver.resolveCSSVariable(variableName, document);
        } else if (variableName.startsWith('$')) {
          // Use async resolution for SCSS variables to support workspace-wide search
          defaultColorValue = await this.variableResolver.resolveSCSSVariable(variableName, document);
        }
      }

      // Use dynamic mode handler to get final color(s)
      const result = this.dynamicModeHandler.resolveVariableColor(
        variableName,
        defaultColorValue,
        document
      );

      return result;
    } catch (error) {
      if (this.settingsManager.enableDebugLogging()) {
        console.warn(`Failed to resolve variable color ${variableName}:`, error);
      }
      return null;
    }
  }

  /**
   * Resolve color value from string
   */
  private async resolveColorValue(colorString: string): Promise<ColorValue | null> {
    try {
      // Use ColorValueImpl to parse color strings
      const colorValue = ColorValueImpl.fromString(colorString);
      return colorValue.isValid ? colorValue : null;
    } catch (error) {
      if (this.settingsManager.enableDebugLogging()) {
        console.warn(`Failed to resolve color value from string "${colorString}":`, error);
      }
      return null;
    }
  }

  /**
   * Check if document should be processed
   */
  private shouldProcessDocument(document: vscode.TextDocument): boolean {
    if (!this.settingsManager.isEnabled()) {
      return false;
    }

    const enabledFileTypes = this.settingsManager.getEnabledFileTypes();
    const fileExtension = this.getFileExtension(document.fileName);
    
    return enabledFileTypes.includes(fileExtension);
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1) {
      return '';
    }
    return fileName.substring(lastDot + 1).toLowerCase();
  }

  /**
   * Find editor for document
   */
  private findEditorForDocument(document: vscode.TextDocument): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(
      editor => editor.document.uri.toString() === document.uri.toString()
    );
  }

  /**
   * Update visible editors cache
   */
  private updateVisibleEditorsCache(editors: readonly vscode.TextEditor[]): void {
    this.visibleEditorsCache.clear();
    
    for (const editor of editors) {
      this.visibleEditorsCache.set(editor.document.uri.toString(), editor);
    }
  }

  /**
   * Clear visible editors cache
   */
  private clearVisibleEditorsCache(): void {
    this.visibleEditorsCache.clear();
  }

  /**
   * Dispose event listeners
   */
  private disposeEventListeners(): void {
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables = [];
  }

  /**
   * Clear all update timers
   */
  private clearAllTimers(): void {
    this.updateTimers.forEach(timer => clearTimeout(timer));
    this.updateTimers.clear();
  }


}