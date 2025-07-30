import * as vscode from 'vscode';
import { FileWatcher } from './interfaces';
import { SettingsManager } from './interfaces';

export class FileWatcherImpl implements FileWatcher {
  private watchers: vscode.FileSystemWatcher[] = [];
  private changeCallbacks: ((uri: vscode.Uri) => void)[] = [];
  private disposables: vscode.Disposable[] = [];
  private isWatching = false;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private settingsManager: SettingsManager) {}

  /**
   * Start watching for file changes
   */
  startWatching(): void {
    if (this.isWatching) {
      return;
    }

    this.isWatching = true;
    this.setupWatchers();
    this.setupDocumentChangeListeners();
  }

  /**
   * Stop watching for file changes
   */
  stopWatching(): void {
    if (!this.isWatching) {
      return;
    }

    this.isWatching = false;
    this.disposeWatchers();
    this.disposeDocumentListeners();
    this.clearDebounceTimers();
  }

  /**
   * Register callback for file changes
   */
  onFileChanged(callback: (uri: vscode.Uri) => void): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Remove file change callback
   */
  removeFileChangeCallback(callback: (uri: vscode.Uri) => void): void {
    const index = this.changeCallbacks.indexOf(callback);
    if (index !== -1) {
      this.changeCallbacks.splice(index, 1);
    }
  }

  /**
   * Check if currently watching
   */
  isCurrentlyWatching(): boolean {
    return this.isWatching;
  }

  /**
   * Get statistics about watched files
   */
  getWatchStats(): {
    watchersCount: number;
    callbacksCount: number;
    pendingDebounces: number;
  } {
    return {
      watchersCount: this.watchers.length,
      callbacksCount: this.changeCallbacks.length,
      pendingDebounces: this.debounceTimers.size
    };
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.stopWatching();
  }

  // Private helper methods

  /**
   * Setup file system watchers
   */
  private setupWatchers(): void {
    const enabledFileTypes = this.settingsManager.getEnabledFileTypes();
    
    // Create watchers for each enabled file type
    for (const fileType of enabledFileTypes) {
      const pattern = `**/*.${fileType}`;
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      // Watch for file changes
      watcher.onDidChange(this.handleFileChange.bind(this));
      watcher.onDidCreate(this.handleFileCreate.bind(this));
      watcher.onDidDelete(this.handleFileDelete.bind(this));

      this.watchers.push(watcher);
    }
  }

  /**
   * Setup document change listeners
   */
  private setupDocumentChangeListeners(): void {
    // Listen for document content changes
    const contentChangeDisposable = vscode.workspace.onDidChangeTextDocument(
      this.handleDocumentContentChange.bind(this)
    );

    // Listen for document open/close
    const openDisposable = vscode.workspace.onDidOpenTextDocument(
      this.handleDocumentOpen.bind(this)
    );

    const closeDisposable = vscode.workspace.onDidCloseTextDocument(
      this.handleDocumentClose.bind(this)
    );

    // Listen for document save
    const saveDisposable = vscode.workspace.onDidSaveTextDocument(
      this.handleDocumentSave.bind(this)
    );

    this.disposables.push(
      contentChangeDisposable,
      openDisposable,
      closeDisposable,
      saveDisposable
    );
  }

  /**
   * Handle file system changes
   */
  private handleFileChange(uri: vscode.Uri): void {
    if (!uri || this.shouldIgnoreFile(uri)) {
      return;
    }

    this.debounceFileChange(uri, 'change');
  }

  /**
   * Handle file creation
   */
  private handleFileCreate(uri: vscode.Uri): void {
    if (!uri || this.shouldIgnoreFile(uri)) {
      return;
    }

    this.debounceFileChange(uri, 'create');
  }

  /**
   * Handle file deletion
   */
  private handleFileDelete(uri: vscode.Uri): void {
    if (!uri || this.shouldIgnoreFile(uri)) {
      return;
    }

    // Don't debounce deletions - handle immediately
    this.notifyFileChange(uri);
  }

  /**
   * Handle document content changes
   */
  private handleDocumentContentChange(event: vscode.TextDocumentChangeEvent): void {
    const document = event.document;
    
    if (this.shouldIgnoreDocument(document)) {
      return;
    }

    // Only process if there are actual content changes
    if (event.contentChanges.length > 0) {
      this.debounceFileChange(document.uri, 'content');
    }
  }

  /**
   * Handle document open
   */
  private handleDocumentOpen(document: vscode.TextDocument): void {
    if (this.shouldIgnoreDocument(document)) {
      return;
    }

    this.notifyFileChange(document.uri);
  }

  /**
   * Handle document close
   */
  private handleDocumentClose(document: vscode.TextDocument): void {
    if (this.shouldIgnoreDocument(document)) {
      return;
    }

    // Clear any pending debounce for this document
    const uriString = document.uri.toString();
    const timer = this.debounceTimers.get(uriString);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(uriString);
    }

    this.notifyFileChange(document.uri);
  }

  /**
   * Handle document save
   */
  private handleDocumentSave(document: vscode.TextDocument): void {
    if (this.shouldIgnoreDocument(document)) {
      return;
    }

    // Clear debounce and notify immediately on save
    const uriString = document.uri.toString();
    const timer = this.debounceTimers.get(uriString);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(uriString);
    }

    this.notifyFileChange(document.uri);
  }

  /**
   * Debounce file changes to avoid excessive notifications
   */
  private debounceFileChange(uri: vscode.Uri, changeType: string): void {
    const uriString = uri.toString();
    const debounceDelay = this.settingsManager.getDebounceDelay();

    // Clear existing timer
    const existingTimer = this.debounceTimers.get(uriString);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(uriString);
      this.notifyFileChange(uri);
    }, debounceDelay);

    this.debounceTimers.set(uriString, timer);
  }

  /**
   * Notify all callbacks about file change
   */
  private notifyFileChange(uri: vscode.Uri): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback(uri);
      } catch (error) {
        console.error('Error in file change callback:', error);
      }
    }
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnoreFile(uri: vscode.Uri): boolean {
    if (!uri || !uri.fsPath) {
      return true;
    }

    const enabledFileTypes = this.settingsManager.getEnabledFileTypes();
    const fileExtension = this.getFileExtension(uri.fsPath);
    
    if (!enabledFileTypes.includes(fileExtension)) {
      return true;
    }

    // Ignore files in node_modules, .git, etc.
    const ignoredPaths = [
      'node_modules',
      '.git',
      '.vscode',
      'dist',
      'build',
      'out'
    ];

    const path = uri.fsPath.toLowerCase();
    return ignoredPaths.some(ignoredPath => 
      path.includes(`/${ignoredPath}/`) || 
      path.includes(`\\${ignoredPath}\\`)
    );
  }

  /**
   * Check if document should be ignored
   */
  private shouldIgnoreDocument(document: vscode.TextDocument): boolean {
    // Ignore untitled documents
    if (document.uri.scheme === 'untitled') {
      return true;
    }

    // Ignore non-file schemes (like git, output, etc.)
    if (document.uri.scheme !== 'file') {
      return true;
    }

    return this.shouldIgnoreFile(document.uri);
  }

  /**
   * Get file extension from path
   */
  private getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) {
      return '';
    }
    return filePath.substring(lastDot + 1).toLowerCase();
  }

  /**
   * Dispose all watchers
   */
  private disposeWatchers(): void {
    this.watchers.forEach(watcher => watcher.dispose());
    this.watchers = [];
  }

  /**
   * Dispose document listeners
   */
  private disposeDocumentListeners(): void {
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables = [];
  }

  /**
   * Clear all debounce timers
   */
  private clearDebounceTimers(): void {
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
  }

  /**
   * Force refresh of all open documents
   */
  forceRefreshAllDocuments(): void {
    const openDocuments = vscode.workspace.textDocuments;
    
    for (const document of openDocuments) {
      if (!this.shouldIgnoreDocument(document)) {
        this.notifyFileChange(document.uri);
      }
    }
  }

  /**
   * Watch specific file or pattern
   */
  watchSpecificPattern(pattern: string): vscode.Disposable {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    
    watcher.onDidChange(this.handleFileChange.bind(this));
    watcher.onDidCreate(this.handleFileCreate.bind(this));
    watcher.onDidDelete(this.handleFileDelete.bind(this));

    return watcher;
  }

  /**
   * Get list of currently watched patterns
   */
  getWatchedPatterns(): string[] {
    const enabledFileTypes = this.settingsManager.getEnabledFileTypes();
    return enabledFileTypes.map(fileType => `**/*.${fileType}`);
  }
}