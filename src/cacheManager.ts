import * as vscode from 'vscode';
import { CacheManager } from './interfaces';
import { VariableContext, ParseResult } from './types';

export interface CacheEntry {
  documentUri: string;
  version: number;
  timestamp: number;
  data: any;
}

export interface VariableCacheEntry extends CacheEntry {
  data: VariableContext;
}

export interface ParseCacheEntry extends CacheEntry {
  data: ParseResult;
}

export class CacheManagerImpl implements CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private accessOrder: string[] = []; // For LRU implementation

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Get cached data for a document
   */
  get(documentUri: string): any | null {
    const entry = this.cache.get(documentUri);
    
    if (!entry) {
      return null;
    }

    // Check if cache entry is still valid
    if (this.isExpired(entry)) {
      this.cache.delete(documentUri);
      this.removeFromAccessOrder(documentUri);
      return null;
    }

    // Update access order for LRU
    this.updateAccessOrder(documentUri);
    
    return entry.data;
  }

  /**
   * Set cached data for a document
   */
  set(documentUri: string, data: any): void {
    // Get document version if available
    const document = this.findDocument(documentUri);
    const version = document?.version || 0;

    const entry: CacheEntry = {
      documentUri,
      version,
      timestamp: Date.now(),
      data
    };

    // Remove old entry if exists
    if (this.cache.has(documentUri)) {
      this.removeFromAccessOrder(documentUri);
    }

    // Add new entry
    this.cache.set(documentUri, entry);
    this.updateAccessOrder(documentUri);

    // Enforce size limit
    this.enforceSizeLimit();
  }

  /**
   * Invalidate cache for a specific document
   */
  invalidate(documentUri: string): void {
    if (this.cache.has(documentUri)) {
      this.cache.delete(documentUri);
      this.removeFromAccessOrder(documentUri);
    }
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{
      uri: string;
      version: number;
      timestamp: number;
      age: number;
    }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([uri, entry]) => ({
      uri,
      version: entry.version,
      timestamp: entry.timestamp,
      age: now - entry.timestamp
    }));

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.calculateHitRate(),
      entries
    };
  }

  /**
   * Set maximum cache size
   */
  setMaxSize(maxSize: number): void {
    this.maxSize = maxSize;
    this.enforceSizeLimit();
  }

  /**
   * Check if document version has changed
   */
  isDocumentChanged(documentUri: string): boolean {
    const entry = this.cache.get(documentUri);
    if (!entry) {
      return true; // No cache entry means it's "changed"
    }

    const document = this.findDocument(documentUri);
    if (!document) {
      return true; // Document not found means it's changed
    }

    return entry.version !== document.version;
  }

  /**
   * Update cache entry if document version changed
   */
  updateIfChanged(documentUri: string, dataProvider: () => any): any {
    if (this.isDocumentChanged(documentUri)) {
      const newData = dataProvider();
      this.set(documentUri, newData);
      return newData;
    }

    return this.get(documentUri);
  }

  /**
   * Get cached variable context or create new one
   */
  getVariableContext(
    documentUri: string,
    contextProvider: () => VariableContext
  ): VariableContext {
    const cached = this.get(documentUri);
    
    if (cached && this.isVariableContext(cached)) {
      return cached;
    }

    const newContext = contextProvider();
    this.set(documentUri, newContext);
    return newContext;
  }

  /**
   * Get cached parse result or create new one
   */
  getParseResult(
    documentUri: string,
    parseProvider: () => ParseResult
  ): ParseResult {
    const cached = this.get(documentUri);
    
    if (cached && this.isParseResult(cached)) {
      return cached;
    }

    const newResult = parseProvider();
    this.set(documentUri, newResult);
    return newResult;
  }

  /**
   * Invalidate cache entries older than specified age
   */
  invalidateOlderThan(maxAge: number): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [uri, entry] of this.cache.entries()) {
      if (now - entry.timestamp > maxAge) {
        toDelete.push(uri);
      }
    }

    toDelete.forEach(uri => this.invalidate(uri));
  }

  /**
   * Invalidate cache entries for documents that no longer exist
   */
  invalidateStaleEntries(): void {
    const toDelete: string[] = [];

    for (const [uri] of this.cache.entries()) {
      const document = this.findDocument(uri);
      if (!document) {
        toDelete.push(uri);
      }
    }

    toDelete.forEach(uri => this.invalidate(uri));
  }

  /**
   * Preload cache for visible documents
   */
  preloadVisibleDocuments(dataProvider: (uri: string) => any): void {
    const visibleEditors = vscode.window.visibleTextEditors;
    
    for (const editor of visibleEditors) {
      const uri = editor.document.uri.toString();
      
      if (!this.cache.has(uri) || this.isDocumentChanged(uri)) {
        try {
          const data = dataProvider(uri);
          this.set(uri, data);
        } catch (error) {
          console.warn(`Failed to preload cache for ${uri}:`, error);
        }
      }
    }
  }

  // Private helper methods

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    const maxAge = 30 * 60 * 1000; // 30 minutes
    return Date.now() - entry.timestamp > maxAge;
  }

  /**
   * Find document by URI
   */
  private findDocument(documentUri: string): vscode.TextDocument | undefined {
    try {
      const uri = vscode.Uri.parse(documentUri);
      return vscode.workspace.textDocuments.find(doc => 
        doc.uri.toString() === uri.toString()
      );
    } catch {
      return undefined;
    }
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(documentUri: string): void {
    // Remove from current position
    this.removeFromAccessOrder(documentUri);
    
    // Add to end (most recently used)
    this.accessOrder.push(documentUri);
  }

  /**
   * Remove from access order
   */
  private removeFromAccessOrder(documentUri: string): void {
    const index = this.accessOrder.indexOf(documentUri);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Enforce cache size limit using LRU eviction
   */
  private enforceSizeLimit(): void {
    while (this.cache.size > this.maxSize && this.accessOrder.length > 0) {
      // Remove least recently used entry
      const lruUri = this.accessOrder.shift();
      if (lruUri) {
        this.cache.delete(lruUri);
      }
    }
  }

  /**
   * Calculate cache hit rate (simplified)
   */
  private calculateHitRate(): number {
    // This is a simplified implementation
    // In a real implementation, you'd track hits and misses
    return this.cache.size > 0 ? 0.8 : 0;
  }

  /**
   * Type guard for VariableContext
   */
  private isVariableContext(data: any): data is VariableContext {
    return data && 
           typeof data === 'object' &&
           'definitions' in data &&
           'usages' in data &&
           'imports' in data &&
           'scope' in data;
  }

  /**
   * Type guard for ParseResult
   */
  private isParseResult(data: any): data is ParseResult {
    return data &&
           typeof data === 'object' &&
           'colorValues' in data &&
           'variableDefinitions' in data &&
           'variableUsages' in data &&
           Array.isArray(data.colorValues) &&
           Array.isArray(data.variableDefinitions) &&
           Array.isArray(data.variableUsages);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.clear();
  }
}