import * as vscode from 'vscode';

// Core color value representation
export interface ColorValue {
  hex: string;
  rgb: { r: number; g: number; b: number; a?: number };
  hsl: { h: number; s: number; l: number; a?: number };
  original: string;
  isValid: boolean;
}

// Variable definition types
export interface VariableDefinition {
  name: string;
  value: string;
  range: vscode.Range;
  type: 'css-custom-property' | 'scss-variable';
}

// Variable usage types
export interface VariableUsage {
  name: string;
  range: vscode.Range;
  type: 'css-var' | 'scss-variable';
  fallbackValue?: string;
}

// Color match in document
export interface ColorMatch {
  value: string;
  range: vscode.Range;
  colorValue: ColorValue;
}

// Parse result from document analysis
export interface ParseResult {
  colorValues: ColorMatch[];
  variableDefinitions: VariableDefinition[];
  variableUsages: VariableUsage[];
}

// Variable context for resolution
export interface VariableContext {
  definitions: Map<string, VariableDefinition>;
  usages: VariableUsage[];
  imports: ImportDeclaration[];
  scope: 'file' | 'workspace';
}

// Import declaration for SCSS
export interface ImportDeclaration {
  path: string;
  range: vscode.Range;
}

// Cache entry for performance optimization
export interface CacheEntry {
  documentUri: string;
  version: number;
  variables: VariableContext;
  colorMatches: ColorMatch[];
  timestamp: number;
}

// Error types for variable resolution
export enum VariableResolutionError {
  NOT_FOUND = 'Variable not found',
  CIRCULAR_REFERENCE = 'Circular reference detected',
  INVALID_VALUE = 'Invalid color value',
  IMPORT_ERROR = 'Failed to resolve import'
}

// Settings types
export type DisplayMode = 'default' | 'computed' | 'multiple';
export type ChipSize = 'small' | 'medium' | 'large';
export type ResolutionScope = 'file' | 'workspace';