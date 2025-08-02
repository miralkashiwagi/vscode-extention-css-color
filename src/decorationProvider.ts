import * as vscode from 'vscode';
import { DecorationProvider } from './interfaces';
import { ColorValue } from './types';

export class DecorationProviderImpl implements DecorationProvider {
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private activeDecorations: Map<string, vscode.TextEditorDecorationType[]> = new Map();

  // Color and styling constants
  private readonly LIGHT_COLOR_THRESHOLD = 0.7; // Threshold for "light" color
  private readonly LUMINANCE_RED_FACTOR = 0.2126;
  private readonly LUMINANCE_GREEN_FACTOR = 0.7152;
  private readonly LUMINANCE_BLUE_FACTOR = 0.0722;

  /**
   * Create a color chip decoration for a given color and range
   */
  createColorChip(color: ColorValue, range: vscode.Range): vscode.DecorationOptions {
    const chipStyle = this.createChipStyle(color);

    return {
      range,
      renderOptions: {
        before: {
          contentText: '',
          backgroundColor: color.hex,
          border: this.getBorderStyle(color),
          width: chipStyle.width,
          height: chipStyle.height,
          margin: chipStyle.margin,
          textDecoration: 'none; display: inline-block; vertical-align: middle;'
        }
      },
      hoverMessage: this.createHoverMessage(color)
    };
  }

  /**
   * Apply decorations to a text editor
   */
  applyDecorations(editor: vscode.TextEditor, decorations: vscode.DecorationOptions[]): void {
    if (!editor) {
      return;
    }

    const editorId = editor.document.uri.toString();

    // If no new decorations, clear existing ones
    if (decorations.length === 0) {
      this.clearDecorations(editor);
      return;
    }

    // Resolve overlapping decorations
    const resolvedDecorations = this.resolveOverlappingDecorations(decorations);

    // Group decorations by color to optimize decoration types
    const decorationGroups = this.groupDecorationsByColor(resolvedDecorations);
    const newDecorationTypes: vscode.TextEditorDecorationType[] = [];

    decorationGroups.forEach((decorationOptions, colorKey) => {
      const decorationType = this.getOrCreateDecorationType(colorKey, decorationOptions[0]);
      newDecorationTypes.push(decorationType);

      // Apply decorations of this color
      editor.setDecorations(decorationType, decorationOptions);
    });

    // Store active decorations for cleanup
    this.activeDecorations.set(editorId, newDecorationTypes);
  }

  /**
   * Clear all decorations from a text editor
   */
  clearDecorations(editor: vscode.TextEditor): void {
    const editorId = editor.document.uri.toString();
    const activeTypes = this.activeDecorations.get(editorId);

    if (activeTypes) {
      activeTypes.forEach(decorationType => {
        editor.setDecorations(decorationType, []);
      });
      this.activeDecorations.delete(editorId);
    }
  }

  /**
   * Dispose all decoration types and clear resources
   */
  dispose(): void {
    // Clear all active decorations
    this.activeDecorations.clear();

    // Dispose all decoration types
    this.decorationTypes.forEach(decorationType => {
      decorationType.dispose();
    });
    this.decorationTypes.clear();
  }

  /**
   * Update decorations when settings change
   */
  updateDecorationStyles(): void {
    // Dispose existing decoration types to force recreation with new styles
    this.decorationTypes.forEach(decorationType => {
      decorationType.dispose();
    });
    this.decorationTypes.clear();

    // Active decorations will be recreated on next apply
  }

  // Private helper methods



  /**
   * Create chip style with fixed medium size
   */
  private createChipStyle(_color: ColorValue): {
    width: string;
    height: string;
    margin: string;
  } {
    return { width: '12px', height: '12px', margin: '0 4px 0 0' };
  }

  /**
   * Get border style for color chip
   */
  private getBorderStyle(color: ColorValue): string {
    // Add border for very light colors to improve visibility
    const isLightColor = this.isLightColor(color);
    return isLightColor ? '1px solid rgba(0, 0, 0, 0.2)' : 'none';
  }

  /**
   * Check if a color is light (for border determination)
   */
  private isLightColor(color: ColorValue): boolean {
    // Calculate relative luminance
    const r = color.rgb.r / 255;
    const g = color.rgb.g / 255;
    const b = color.rgb.b / 255;

    // Apply gamma correction
    const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

    // Calculate luminance
    const luminance = this.LUMINANCE_RED_FACTOR * rLinear + this.LUMINANCE_GREEN_FACTOR * gLinear + this.LUMINANCE_BLUE_FACTOR * bLinear;

    return luminance > this.LIGHT_COLOR_THRESHOLD;
  }

  /**
   * Create hover message for color chip
   */
  private createHoverMessage(color: ColorValue): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;

    // Color preview
    const colorPreview = `<div style="width: 50px; height: 20px; background-color: ${color.hex}; border: 1px solid #ccc; display: inline-block; margin-right: 10px;"></div>`;

    // Color information
    const colorInfo = [
      `**Original:** \`${color.original}\``,
      `**Hex:** \`${color.hex}\``,
      `**RGB:** \`rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}${color.rgb.a !== undefined ? `, ${color.rgb.a}` : ''})\``,
      `**HSL:** \`hsl(${color.hsl.h}, ${color.hsl.s}%, ${color.hsl.l}%${color.hsl.a !== undefined ? `, ${color.hsl.a}` : ''})\``
    ].join('\n\n');

    markdown.appendMarkdown(`${colorPreview}\n\n${colorInfo}`);

    return markdown;
  }

  /**
   * Group decorations by color to optimize decoration types
   */
  private groupDecorationsByColor(decorations: vscode.DecorationOptions[]): Map<string, vscode.DecorationOptions[]> {
    const groups = new Map<string, vscode.DecorationOptions[]>();

    decorations.forEach(decoration => {
      // Extract color from decoration
      const backgroundColor = decoration.renderOptions?.before?.backgroundColor;
      if (backgroundColor) {
        const colorKey = backgroundColor.toString();
        if (!groups.has(colorKey)) {
          groups.set(colorKey, []);
        }
        groups.get(colorKey)!.push(decoration);
      }
    });

    return groups;
  }

  /**
   * Get or create decoration type for a specific color
   */
  private getOrCreateDecorationType(colorKey: string, sampleDecoration: vscode.DecorationOptions): vscode.TextEditorDecorationType {
    if (this.decorationTypes.has(colorKey)) {
      return this.decorationTypes.get(colorKey)!;
    }

    // Create new decoration type
    const decorationType = vscode.window.createTextEditorDecorationType({
      ...(sampleDecoration.renderOptions?.before && { before: sampleDecoration.renderOptions.before })
    });

    this.decorationTypes.set(colorKey, decorationType);
    return decorationType;
  }

  /**
   * Create decoration for variable usage with resolved color
   */
  createVariableColorChip(
    variableName: string,
    resolvedColor: ColorValue,
    range: vscode.Range,
    fallbackColor?: ColorValue
  ): vscode.DecorationOptions {
    const chipStyle = this.createChipStyle(resolvedColor);

    // Create compound decoration for variable with fallback
    const decoration: vscode.DecorationOptions = {
      range,
      renderOptions: {
        before: {
          contentText: '',
          backgroundColor: resolvedColor.hex,
          border: this.getBorderStyle(resolvedColor),
          width: chipStyle.width,
          height: chipStyle.height,
          margin: chipStyle.margin,
          textDecoration: 'none; display: inline-block; vertical-align: middle;'
        }
      },
      hoverMessage: this.createVariableHoverMessage(variableName, resolvedColor, fallbackColor)
    };

    return decoration;
  }

  /**
   * Create hover message for variable color chip
   */
  private createVariableHoverMessage(
    variableName: string,
    resolvedColor: ColorValue,
    fallbackColor?: ColorValue
  ): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;

    // Variable information
    markdown.appendMarkdown(`**Variable:** \`${variableName}\`\n\n`);

    // Resolved color preview
    const colorPreview = `<div style="width: 50px; height: 20px; background-color: ${resolvedColor.hex}; border: 1px solid #ccc; display: inline-block; margin-right: 10px;"></div>`;
    markdown.appendMarkdown(`${colorPreview}\n\n`);

    // Color information
    // const colorInfo = [
    //   `**Resolved Color:**`,
    //   `- Hex: \`${resolvedColor.hex}\``,
    //   `- RGB: \`rgb(${resolvedColor.rgb.r}, ${resolvedColor.rgb.g}, ${resolvedColor.rgb.b}${resolvedColor.rgb.a !== undefined ? `, ${resolvedColor.rgb.a}` : ''})\``,
    //   `- HSL: \`hsl(${resolvedColor.hsl.h}, ${resolvedColor.hsl.s}%, ${resolvedColor.hsl.l}%${resolvedColor.hsl.a !== undefined ? `, ${resolvedColor.hsl.a}` : ''})\``
    // ];

    const colorInfo = [
      `**Resolved Color:** Hex: \`${resolvedColor.hex}\` RGB: \`rgb(${resolvedColor.rgb.r}, ${resolvedColor.rgb.g}, ${resolvedColor.rgb.b}${resolvedColor.rgb.a !== undefined ? `, ${resolvedColor.rgb.a}` : ''})\``,
    ];

    if (fallbackColor) {
      colorInfo.push('', `**Fallback Color:** Hex: \`${fallbackColor.hex}\` RGB: \`rgb(${fallbackColor.rgb.r}, ${fallbackColor.rgb.g}, ${fallbackColor.rgb.b}${fallbackColor.rgb.a !== undefined ? `, ${fallbackColor.rgb.a}` : ''})\``);
    }

    markdown.appendMarkdown(colorInfo.join('\n'));

    return markdown;
  }

  /**
   * Create multiple color chips for variables with multiple possible values
   */
  createMultipleColorChips(
    colors: ColorValue[],
    range: vscode.Range,
    context?: string
  ): vscode.DecorationOptions {
    if (colors.length === 0) {
      throw new Error('At least one color is required');
    }

    if (colors.length === 1) {
      return this.createColorChip(colors[0], range);
    }

    const chipStyle = this.createChipStyle(colors[0]);

    // Create gradient background for multiple colors
    // const gradientColors = colors.map(color => color.hex).join(', ');
    // const gradient = `linear-gradient(90deg, ${gradientColors})`;

    const decoration: vscode.DecorationOptions = {
      range,
      renderOptions: {
        before: {
          contentText: '●●',
          color: colors[0].hex,
          border: '1px solid rgba(0, 0, 0, 0.2)',
          width: chipStyle.width,
          height: chipStyle.height,
          margin: chipStyle.margin,
          textDecoration: 'none; display: inline-block; vertical-align: middle; font-size: 6px;'
        }
      },
      hoverMessage: this.createMultipleColorsHoverMessage(colors, context)
    };

    return decoration;
  }

  /**
   * Create hover message for multiple colors
   */
  private createMultipleColorsHoverMessage(colors: ColorValue[], context?: string): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;

    if (context) {
      markdown.appendMarkdown(`**Context:** ${context}\n\n`);
    }

    markdown.appendMarkdown(`**Multiple Possible Colors (${colors.length}):**\n\n`);

    colors.forEach((color, index) => {
      const colorPreview = `<div style="width: 30px; height: 15px; background-color: ${color.hex}; border: 1px solid #ccc; display: inline-block; margin-right: 5px;"></div>`;
      markdown.appendMarkdown(`${index + 1}. ${colorPreview} \`${color.hex}\` (${color.original})\n\n`);
    });

    return markdown;
  }



  /**
   * Resolve overlapping decorations to prevent visual conflicts
   */
  private resolveOverlappingDecorations(decorations: vscode.DecorationOptions[]): vscode.DecorationOptions[] {
    if (decorations.length <= 1) {
      return decorations;
    }

    // Remove exact duplicates first
    const uniqueDecorations = this.removeDuplicateDecorations(decorations);

    // Sort decorations by position
    const sortedDecorations = [...uniqueDecorations].sort((a, b) => {
      const aStart = a.range.start;
      const bStart = b.range.start;

      if (aStart.line !== bStart.line) {
        return aStart.line - bStart.line;
      }
      return aStart.character - bStart.character;
    });

    const resolvedDecorations: vscode.DecorationOptions[] = [];
    const usedPositions = new Set<string>();

    for (const decoration of sortedDecorations) {
      const positionKey = `${decoration.range.start.line}:${decoration.range.start.character}`;

      // Skip if we already have a decoration at this exact position
      if (usedPositions.has(positionKey)) {
        continue;
      }

      // Check for overlap with nearby decorations
      const hasOverlap = resolvedDecorations.some(existing =>
        this.decorationsOverlap(existing, decoration)
      );

      if (!hasOverlap) {
        resolvedDecorations.push(decoration);
        usedPositions.add(positionKey);
      }
    }

    return resolvedDecorations;
  }

  /**
   * Remove exact duplicate decorations
   */
  private removeDuplicateDecorations(decorations: vscode.DecorationOptions[]): vscode.DecorationOptions[] {
    const seen = new Set<string>();
    const unique: vscode.DecorationOptions[] = [];

    for (const decoration of decorations) {
      const key = this.getDecorationKey(decoration);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(decoration);
      }
    }

    return unique;
  }

  /**
   * Generate a unique key for a decoration
   */
  private getDecorationKey(decoration: vscode.DecorationOptions): string {
    const range = decoration.range;
    const color = decoration.renderOptions?.before?.backgroundColor || '';
    return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}:${color}`;
  }

  /**
   * Check if two decorations overlap
   */
  private decorationsOverlap(decoration1: vscode.DecorationOptions, decoration2: vscode.DecorationOptions): boolean {
    const range1 = decoration1.range;
    const range2 = decoration2.range;

    // Check if ranges overlap
    if (range1.start.line !== range2.start.line) {
      return false;
    }

    // Same line - check character overlap with chip width consideration
    const chipWidth = this.getChipWidthInCharacters();

    const start1 = range1.start.character;
    const end1 = range1.end.character;
    const start2 = range2.start.character;
    const end2 = range2.end.character;

    // Consider chip visual width when checking overlap
    return Math.abs(start1 - start2) < chipWidth ||
      (start1 <= end2 + chipWidth && end1 + chipWidth >= start2);
  }



  /**
   * Get chip width in character units for overlap calculation
   */
  private getChipWidthInCharacters(): number {
    // Fixed medium size width (1.5 characters as specified in requirements)
    return 1.5;
  }

  /**
   * Create optimized decoration for multiple chips on same line
   */
  createCompactMultipleChips(
    colors: ColorValue[],
    baseRange: vscode.Range,
    spacing: number = 1
  ): vscode.DecorationOptions[] {
    if (colors.length === 0) {
      return [];
    }

    if (colors.length === 1) {
      return [this.createColorChip(colors[0], baseRange)];
    }

    const chipWidth = this.getChipWidthInCharacters();
    const decorations: vscode.DecorationOptions[] = [];

    colors.forEach((color, index) => {
      const offsetCharacter = baseRange.start.character + (index * (chipWidth + spacing));
      const chipRange = new vscode.Range(
        baseRange.start.line,
        offsetCharacter,
        baseRange.start.line,
        offsetCharacter + chipWidth
      );

      const decoration = this.createColorChip(color, chipRange);

      // Add index indicator for multiple chips
      if (decoration.renderOptions?.before) {
        decoration.renderOptions.before.contentText = `${index + 1}`;
        decoration.renderOptions.before.color = this.getContrastColor(color);
        // Use textDecoration to include font styling
        decoration.renderOptions.before.textDecoration = 'none; display: inline-block; vertical-align: middle; text-align: center; font-size: 6px; font-weight: bold;';
      }

      decorations.push(decoration);
    });

    return decorations;
  }

  /**
   * Get contrasting color for text on color chip
   */
  private getContrastColor(color: ColorValue): string {
    const luminance = this.calculateLuminance(color);
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  /**
   * Calculate relative luminance of a color
   */
  private calculateLuminance(color: ColorValue): number {
    const r = color.rgb.r / 255;
    const g = color.rgb.g / 255;
    const b = color.rgb.b / 255;

    // Apply gamma correction
    const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

    // Calculate luminance
    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
  }

  /**
   * Create stacked decoration for multiple colors in limited space
   */
  createStackedColorChips(
    colors: ColorValue[],
    range: vscode.Range,
    maxVisible: number = 3
  ): vscode.DecorationOptions {
    if (colors.length === 0) {
      throw new Error('At least one color is required');
    }

    if (colors.length === 1) {
      return this.createColorChip(colors[0], range);
    }

    const chipStyle = this.createChipStyle(colors[0]);

    // Show primary color with indicator for additional colors
    const visibleColors = colors.slice(0, maxVisible);
    const hiddenCount = Math.max(0, colors.length - maxVisible);

    const decoration: vscode.DecorationOptions = {
      range,
      renderOptions: {
        before: {
          contentText: hiddenCount > 0 ? `+${hiddenCount}` : `${colors.length}`,
          backgroundColor: colors[0].hex,
          color: this.getContrastColor(colors[0]),
          border: this.getBorderStyle(colors[0]),
          width: chipStyle.width,
          height: chipStyle.height,
          margin: chipStyle.margin,
          textDecoration: 'none; display: inline-block; vertical-align: middle; text-align: center; font-size: 6px; font-weight: bold;'
        }
      },
      hoverMessage: this.createStackedColorsHoverMessage(colors, visibleColors, hiddenCount)
    };

    return decoration;
  }

  /**
   * Create hover message for stacked colors
   */
  private createStackedColorsHoverMessage(
    allColors: ColorValue[],
    visibleColors: ColorValue[],
    hiddenCount: number
  ): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;

    markdown.appendMarkdown(`**Stacked Colors (${allColors.length} total)**\n\n`);

    // Show visible colors
    visibleColors.forEach((color, index) => {
      const colorPreview = `<div style="width: 30px; height: 15px; background-color: ${color.hex}; border: 1px solid #ccc; display: inline-block; margin-right: 5px;"></div>`;
      markdown.appendMarkdown(`${index + 1}. ${colorPreview} \`${color.hex}\` (${color.original})\n\n`);
    });

    // Show hidden count
    if (hiddenCount > 0) {
      markdown.appendMarkdown(`*... and ${hiddenCount} more colors*\n\n`);
    }

    markdown.appendMarkdown(`**Click to expand all colors**`);

    return markdown;
  }


}