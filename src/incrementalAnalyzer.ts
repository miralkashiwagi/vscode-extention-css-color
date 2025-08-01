import * as vscode from 'vscode';
import { ColorMatch, VariableDefinition, VariableUsage, ParseResult } from './types';
import { Parser } from './interfaces';

export interface AnalysisRegion {
  startLine: number;
  endLine: number;
  priority: 'high' | 'medium' | 'low';
}

export interface IncrementalChange {
  range: vscode.Range;
  text: string;
  rangeLength: number;
}

export interface AnalysisResult {
  colorMatches: ColorMatch[];
  variableDefinitions: VariableDefinition[];
  variableUsages: VariableUsage[];
  analyzedRegions: AnalysisRegion[];
  isComplete: boolean;
}

export class IncrementalAnalyzer {
  private analysisCache: Map<string, AnalysisResult> = new Map();
  private pendingAnalysis: Map<string, AnalysisRegion[]> = new Map();
  private analysisInProgress: Set<string> = new Set();
  
  // Analysis configuration constants
  private readonly BACKGROUND_PROCESS_DELAY = 100; // Small delay to not block UI

  constructor(
    private cssParser: Parser,
    private scssParser: Parser
  ) {}

  /**
   * Analyze visible regions with high priority
   */
  analyzeVisibleRegions(
    document: vscode.TextDocument,
    visibleRanges: vscode.Range[]
  ): AnalysisResult {
    const documentUri = document.uri.toString();
    
    // Get or create analysis result
    let result = this.analysisCache.get(documentUri) || this.createEmptyResult();
    
    // Convert visible ranges to analysis regions
    const visibleRegions = visibleRanges.map(range => ({
      startLine: range.start.line,
      endLine: range.end.line,
      priority: 'high' as const
    }));

    // Analyze visible regions immediately
    const visibleAnalysis = this.analyzeRegions(document, visibleRegions);
    
    // Merge with existing results
    result = this.mergeResults(result, visibleAnalysis);
    
    // Schedule analysis of remaining regions
    this.scheduleRemainingAnalysis(document, visibleRegions);
    
    // Cache the result
    this.analysisCache.set(documentUri, result);
    
    return result;
  }

  /**
   * Process incremental changes to document
   */
  processIncrementalChange(
    document: vscode.TextDocument,
    changes: IncrementalChange[]
  ): AnalysisResult {
    const documentUri = document.uri.toString();
    
    // Get existing analysis or create empty
    let result = this.analysisCache.get(documentUri) || this.createEmptyResult();
    
    // Determine affected regions
    const affectedRegions = this.calculateAffectedRegions(changes);
    
    // Re-analyze affected regions
    const updatedAnalysis = this.analyzeRegions(document, affectedRegions);
    
    // Remove old results from affected regions and add new ones
    result = this.updateResultsForRegions(result, updatedAnalysis, affectedRegions);
    
    // Cache updated result
    this.analysisCache.set(documentUri, result);
    
    return result;
  } 
 /**
   * Get analysis result for document
   */
  getAnalysisResult(documentUri: string): AnalysisResult | null {
    return this.analysisCache.get(documentUri) || null;
  }

  /**
   * Invalidate analysis cache for document
   */
  invalidateDocument(documentUri: string): void {
    this.analysisCache.delete(documentUri);
    this.pendingAnalysis.delete(documentUri);
    this.analysisInProgress.delete(documentUri);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.analysisCache.clear();
    this.pendingAnalysis.clear();
    this.analysisInProgress.clear();
  }

  /**
   * Get analysis statistics
   */
  getStats(): {
    cachedDocuments: number;
    pendingAnalysis: number;
    inProgress: number;
  } {
    return {
      cachedDocuments: this.analysisCache.size,
      pendingAnalysis: this.pendingAnalysis.size,
      inProgress: this.analysisInProgress.size
    };
  }

  // Private helper methods

  /**
   * Create empty analysis result
   */
  private createEmptyResult(): AnalysisResult {
    return {
      colorMatches: [],
      variableDefinitions: [],
      variableUsages: [],
      analyzedRegions: [],
      isComplete: false
    };
  }

  /**
   * Analyze specific regions of document
   */
  private analyzeRegions(
    document: vscode.TextDocument,
    regions: AnalysisRegion[]
  ): AnalysisResult {
    const result = this.createEmptyResult();
    const languageId = document.languageId;

    for (const region of regions) {
      try {
        const regionText = this.extractRegionText(document, region);
        const mockDocument = {
          ...document,
          getText: () => regionText
        } as vscode.TextDocument;

        let regionResult: ParseResult;

        // Handle different file types
        if (languageId === 'css') {
          // CSS files: use CSS parser only
          regionResult = this.cssParser.parseDocument(mockDocument);
        } else if (languageId === 'scss' || languageId === 'sass') {
          // SCSS files: use both parsers to handle SCSS variables and CSS custom properties
          const scssResult = this.scssParser.parseDocument(mockDocument);
          const cssResult = this.cssParser.parseDocument(mockDocument);
          
          // Merge results
          regionResult = {
            colorValues: [...scssResult.colorValues, ...cssResult.colorValues],
            variableDefinitions: [...scssResult.variableDefinitions, ...cssResult.variableDefinitions],
            variableUsages: [...scssResult.variableUsages, ...cssResult.variableUsages]
          };
        } else {
          // Other file types: try both parsers
          const cssResult = this.cssParser.parseDocument(mockDocument);
          const scssResult = this.scssParser.parseDocument(mockDocument);
          
          regionResult = {
            colorValues: [...cssResult.colorValues, ...scssResult.colorValues],
            variableDefinitions: [...cssResult.variableDefinitions, ...scssResult.variableDefinitions],
            variableUsages: [...cssResult.variableUsages, ...scssResult.variableUsages]
          };
        }

        // Adjust line numbers for region offset
        const adjustedResult = this.adjustLineNumbers(regionResult, region.startLine);
        
        // Merge into result
        result.colorMatches.push(...adjustedResult.colorValues);
        result.variableDefinitions.push(...adjustedResult.variableDefinitions);
        result.variableUsages.push(...adjustedResult.variableUsages);
      } catch (error) {
        // Log error but continue with other regions
        console.warn(`Failed to analyze region ${region.startLine}-${region.endLine}:`, error);
      }
    }

    result.analyzedRegions = regions;
    result.isComplete = this.isDocumentFullyAnalyzed(document, regions);

    return result;
  }

  /**
   * Extract text for specific region
   */
  private extractRegionText(document: vscode.TextDocument, region: AnalysisRegion): string {
    const startPos = new vscode.Position(region.startLine, 0);
    const endPos = new vscode.Position(
      Math.min(region.endLine, document.lineCount - 1),
      document.lineAt(Math.min(region.endLine, document.lineCount - 1)).text.length
    );
    
    return document.getText(new vscode.Range(startPos, endPos));
  }

  /**
   * Adjust line numbers for region offset
   */
  private adjustLineNumbers(result: ParseResult, lineOffset: number): ParseResult {
    return {
      colorValues: result.colorValues.map(match => ({
        ...match,
        range: new vscode.Range(
          match.range.start.line + lineOffset,
          match.range.start.character,
          match.range.end.line + lineOffset,
          match.range.end.character
        )
      })),
      variableDefinitions: result.variableDefinitions.map(def => ({
        ...def,
        range: new vscode.Range(
          def.range.start.line + lineOffset,
          def.range.start.character,
          def.range.end.line + lineOffset,
          def.range.end.character
        )
      })),
      variableUsages: result.variableUsages.map(usage => ({
        ...usage,
        range: new vscode.Range(
          usage.range.start.line + lineOffset,
          usage.range.start.character,
          usage.range.end.line + lineOffset,
          usage.range.end.character
        )
      }))
    };
  }



  /**
   * Merge two analysis results
   */
  private mergeResults(existing: AnalysisResult, newResult: AnalysisResult): AnalysisResult {
    return {
      colorMatches: [...existing.colorMatches, ...newResult.colorMatches],
      variableDefinitions: [...existing.variableDefinitions, ...newResult.variableDefinitions],
      variableUsages: [...existing.variableUsages, ...newResult.variableUsages],
      analyzedRegions: [...existing.analyzedRegions, ...newResult.analyzedRegions],
      isComplete: existing.isComplete || newResult.isComplete
    };
  }

  /**
   * Schedule analysis of remaining document regions
   */
  private scheduleRemainingAnalysis(
    document: vscode.TextDocument,
    analyzedRegions: AnalysisRegion[]
  ): void {
    const documentUri = document.uri.toString();
    
    if (this.analysisInProgress.has(documentUri)) {
      return; // Already in progress
    }

    const remainingRegions = this.calculateRemainingRegions(document, analyzedRegions);
    
    if (remainingRegions.length > 0) {
      this.pendingAnalysis.set(documentUri, remainingRegions);
      
      // Schedule background analysis
      setTimeout(() => {
        this.processBackgroundAnalysis(document, remainingRegions);
      }, this.BACKGROUND_PROCESS_DELAY);
    }
  }

  /**
   * Calculate regions that haven't been analyzed yet
   */
  private calculateRemainingRegions(
    document: vscode.TextDocument,
    analyzedRegions: AnalysisRegion[]
  ): AnalysisRegion[] {
    const totalLines = document.lineCount;
    const remaining: AnalysisRegion[] = [];
    
    // Sort analyzed regions by start line
    const sortedRegions = [...analyzedRegions].sort((a, b) => a.startLine - b.startLine);
    
    let currentLine = 0;
    
    for (const region of sortedRegions) {
      // Add gap before this region
      if (currentLine < region.startLine) {
        remaining.push({
          startLine: currentLine,
          endLine: region.startLine - 1,
          priority: 'low'
        });
      }
      
      currentLine = Math.max(currentLine, region.endLine + 1);
    }
    
    // Add remaining lines after last region
    if (currentLine < totalLines) {
      remaining.push({
        startLine: currentLine,
        endLine: totalLines - 1,
        priority: 'low'
      });
    }
    
    return remaining;
  }

  /**
   * Process background analysis
   */
  private async processBackgroundAnalysis(
    document: vscode.TextDocument,
    regions: AnalysisRegion[]
  ): Promise<void> {
    const documentUri = document.uri.toString();
    
    this.analysisInProgress.add(documentUri);
    
    try {
      // Analyze in chunks to avoid blocking
      const chunkSize = 50; // lines per chunk
      const chunks = this.splitRegionsIntoChunks(regions, chunkSize);
      
      for (const chunk of chunks) {
        const chunkResult = this.analyzeRegions(document, chunk);
        
        // Merge with existing results
        const existing = this.analysisCache.get(documentUri) || this.createEmptyResult();
        const merged = this.mergeResults(existing, chunkResult);
        
        this.analysisCache.set(documentUri, merged);
        
        // Yield control to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Mark as complete
      const finalResult = this.analysisCache.get(documentUri);
      if (finalResult) {
        finalResult.isComplete = true;
        this.analysisCache.set(documentUri, finalResult);
      }
      
    } finally {
      this.analysisInProgress.delete(documentUri);
      this.pendingAnalysis.delete(documentUri);
    }
  }

  /**
   * Split regions into smaller chunks for processing
   */
  private splitRegionsIntoChunks(
    regions: AnalysisRegion[],
    maxLinesPerChunk: number
  ): AnalysisRegion[][] {
    const chunks: AnalysisRegion[][] = [];
    let currentChunk: AnalysisRegion[] = [];
    let currentChunkLines = 0;
    
    for (const region of regions) {
      const regionLines = region.endLine - region.startLine + 1;
      
      if (currentChunkLines + regionLines > maxLinesPerChunk && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentChunkLines = 0;
      }
      
      currentChunk.push(region);
      currentChunkLines += regionLines;
    }
    
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  /**
   * Calculate affected regions from changes
   */
  private calculateAffectedRegions(changes: IncrementalChange[]): AnalysisRegion[] {
    const regions: AnalysisRegion[] = [];
    
    for (const change of changes) {
      // Add some buffer around the change
      const bufferLines = 5;
      const startLine = Math.max(0, change.range.start.line - bufferLines);
      const endLine = change.range.end.line + bufferLines;
      
      regions.push({
        startLine,
        endLine,
        priority: 'high'
      });
    }
    
    // Merge overlapping regions
    return this.mergeOverlappingRegions(regions);
  }

  /**
   * Merge overlapping analysis regions
   */
  private mergeOverlappingRegions(regions: AnalysisRegion[]): AnalysisRegion[] {
    if (regions.length <= 1) {
      return regions;
    }
    
    const sorted = [...regions].sort((a, b) => a.startLine - b.startLine);
    const merged: AnalysisRegion[] = [];
    let current = sorted[0];
    
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      
      if (current.endLine >= next.startLine - 1) {
        // Overlapping or adjacent, merge them
        current = {
          startLine: current.startLine,
          endLine: Math.max(current.endLine, next.endLine),
          priority: current.priority === 'high' || next.priority === 'high' ? 'high' : 
                   current.priority === 'medium' || next.priority === 'medium' ? 'medium' : 'low'
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    
    merged.push(current);
    return merged;
  }

  /**
   * Update results for specific regions
   */
  private updateResultsForRegions(
    existing: AnalysisResult,
    newResults: AnalysisResult,
    affectedRegions: AnalysisRegion[]
  ): AnalysisResult {
    // Remove old results from affected regions
    const filteredExisting = this.filterResultsOutsideRegions(existing, affectedRegions);
    
    // Merge with new results
    return this.mergeResults(filteredExisting, newResults);
  }

  /**
   * Filter results to exclude items in specified regions
   */
  private filterResultsOutsideRegions(
    result: AnalysisResult,
    regions: AnalysisRegion[]
  ): AnalysisResult {
    const isInRegion = (line: number) => {
      return regions.some(region => line >= region.startLine && line <= region.endLine);
    };
    
    return {
      colorMatches: result.colorMatches.filter(match => !isInRegion(match.range.start.line)),
      variableDefinitions: result.variableDefinitions.filter(def => !isInRegion(def.range.start.line)),
      variableUsages: result.variableUsages.filter(usage => !isInRegion(usage.range.start.line)),
      analyzedRegions: result.analyzedRegions.filter(region => 
        !regions.some(affectedRegion => 
          region.startLine <= affectedRegion.endLine && region.endLine >= affectedRegion.startLine
        )
      ),
      isComplete: false // Mark as incomplete since we removed some regions
    };
  }

  /**
   * Check if document is fully analyzed
   */
  private isDocumentFullyAnalyzed(document: vscode.TextDocument, regions: AnalysisRegion[]): boolean {
    const totalLines = document.lineCount;
    const coveredLines = new Set<number>();
    
    for (const region of regions) {
      for (let line = region.startLine; line <= region.endLine; line++) {
        coveredLines.add(line);
      }
    }
    
    return coveredLines.size >= totalLines;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.clearCache();
  }
}