import * as vscode from 'vscode';
import { Parser } from './interfaces';
import { ColorMatch, VariableDefinition, VariableUsage, ParseResult } from './types';
import { ColorValueImpl } from './colorValue';

export class CSSParser implements Parser {
  // Regular expressions for color detection
  private static readonly COLOR_PATTERNS = {
    // Hex colors: #RGB, #RRGGBB, #RGBA, #RRGGBBAA
    hex: /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{8})\b/g,
    
    // RGB/RGBA colors: rgb(r, g, b) or rgba(r, g, b, a)
    rgb: /rgba?\(\s*([^)]+)\s*\)/g,
    
    // HSL/HSLA colors: hsl(h, s%, l%) or hsla(h, s%, l%, a)
    hsl: /hsla?\(\s*([^)]+)\s*\)/g,
    
    // Named colors (basic set)
    named: /\b(black|white|red|green|blue|yellow|cyan|magenta|silver|gray|grey|maroon|olive|lime|aqua|teal|navy|fuchsia|purple|orange|transparent)\b/g
  };

  // Regular expressions for CSS custom properties
  private static readonly CSS_VARIABLE_PATTERNS = {
    // CSS custom property definition: --variable-name: value;
    definition: /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g,
    
    // CSS var() usage: var(--variable-name) or var(--variable-name, fallback)
    usage: /var\(\s*(--[a-zA-Z0-9-_]+)(?:\s*,\s*([^)]*))?\s*\)/g
  };

  parseDocument(document: vscode.TextDocument): ParseResult {
    const text = document.getText();
    
    return {
      colorValues: this.findColorValues(text),
      variableDefinitions: this.findVariableDefinitions(text),
      variableUsages: this.findVariableUsages(text)
    };
  }

  findColorValues(text: string): ColorMatch[] {
    const matches: ColorMatch[] = [];
    const lines = text.split('\n');

    // Find all color matches
    lines.forEach((line, lineIndex) => {
      // Check each color pattern
      Object.entries(CSSParser.COLOR_PATTERNS).forEach(([type, pattern]) => {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;

        while ((match = regex.exec(line)) !== null) {
          const colorString = match[0];
          const colorValue = ColorValueImpl.fromString(colorString);

          if (colorValue.isValid) {
            const startPos = new vscode.Position(lineIndex, match.index);
            const endPos = new vscode.Position(lineIndex, match.index + colorString.length);
            const range = new vscode.Range(startPos, endPos);

            matches.push({
              value: colorString,
              range,
              colorValue
            });
          }
        }
      });
    });

    return matches;
  }

  findVariableDefinitions(text: string): VariableDefinition[] {
    const definitions: VariableDefinition[] = [];
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
      const regex = new RegExp(CSSParser.CSS_VARIABLE_PATTERNS.definition.source, 'g');
      let match;

      while ((match = regex.exec(line)) !== null) {
        const variableName = `--${match[1]}`;
        const value = match[2].trim();
        
        const startPos = new vscode.Position(lineIndex, match.index);
        const endPos = new vscode.Position(lineIndex, match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        definitions.push({
          name: variableName,
          value,
          range,
          type: 'css-custom-property'
        });
        
        // Debug log for CSS variable definitions (only when found)
        // console.log(`[CSS Parser] Found CSS variable definition: ${variableName} = ${value} at line ${lineIndex + 1}`);
      }
    });

    // Only log when definitions are found (disabled for production)
    // if (definitions.length > 0) {
    //   console.log(`[CSS Parser] Found ${definitions.length} CSS variable definitions`);
    // }
    return definitions;
  }

  findVariableUsages(text: string): VariableUsage[] {
    const usages: VariableUsage[] = [];
    
    // First, find all var() calls recursively
    this.findVarCalls(text, usages);
    
    return usages;
  }

  private findVarCalls(text: string, usages: VariableUsage[], lineOffset: number = 0): void {
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
      let searchIndex = 0;
      while (searchIndex < line.length) {
        const varStart = line.indexOf('var(', searchIndex);
        if (varStart === -1) {break;}

        // Find the matching closing parenthesis
        let parenCount = 1;
        let currentIndex = varStart + 4; // Start after 'var('

        // Find variable name
        const varNameMatch = line.substring(currentIndex).match(/^\s*(--[a-zA-Z0-9-_]+)/);
        if (!varNameMatch) {
          searchIndex = varStart + 1;
          continue;
        }

        const variableName = varNameMatch[1];
        currentIndex += varNameMatch[0].length;

        let fallbackStart = -1;
        // Check for comma (fallback)
        const commaMatch = line.substring(currentIndex).match(/^\s*,\s*/);
        if (commaMatch) {
          currentIndex += commaMatch[0].length;
          fallbackStart = currentIndex;
        }

        // Find the matching closing parenthesis
        while (currentIndex < line.length && parenCount > 0) {
          if (line[currentIndex] === '(') {
            parenCount++;
          } else if (line[currentIndex] === ')') {
            parenCount--;
          }
          currentIndex++;
        }

        if (parenCount === 0) {
          const varEnd = currentIndex;
          const startPos = new vscode.Position(lineIndex + lineOffset, varStart);
          const endPos = new vscode.Position(lineIndex + lineOffset, varEnd);
          const range = new vscode.Range(startPos, endPos);

          const usage: VariableUsage = {
            name: variableName,
            range,
            type: 'css-var'
          };

          if (fallbackStart !== -1) {
            const fallbackValue = line.substring(fallbackStart, varEnd - 1).trim();
            if (fallbackValue) {
              usage.fallbackValue = fallbackValue;
              
              // Recursively find var() calls in the fallback value
              if (fallbackValue.includes('var(')) {
                this.findVarCalls(fallbackValue, usages, lineIndex + lineOffset);
              }
            }
          }

          usages.push(usage);
        }

        searchIndex = varStart + 1;
      }
    });
  }

  // Utility method to check if a line is inside a comment
  private isInComment(text: string, position: number): boolean {
    const beforePosition = text.substring(0, position);
    
    // Check for /* */ comments
    let commentStart = -1;
    let commentEnd = -1;
    let searchPos = 0;

    while (searchPos < beforePosition.length) {
      const blockStart = beforePosition.indexOf('/*', searchPos);
      const blockEnd = beforePosition.indexOf('*/', searchPos);

      if (blockStart !== -1 && (blockEnd === -1 || blockStart < blockEnd)) {
        commentStart = blockStart;
        searchPos = blockStart + 2;
        
        const nextEnd = text.indexOf('*/', commentStart);
        if (nextEnd === -1 || nextEnd > position) {
          return true; // Inside an unclosed comment
        }
        commentEnd = nextEnd;
        searchPos = commentEnd + 2;
      } else if (blockEnd !== -1) {
        commentEnd = blockEnd;
        searchPos = blockEnd + 2;
      } else {
        break;
      }
    }

    // Check if position is between the last comment start and end
    if (commentStart !== -1 && commentEnd !== -1) {
      return position > commentStart && position < commentEnd;
    } else if (commentStart !== -1 && commentEnd === -1) {
      return position > commentStart;
    }

    return false;
  }

  // Utility method to check if a line is inside a string
  private isInString(line: string, position: number): boolean {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escaped = false;

    for (let i = 0; i < position && i < line.length; i++) {
      const char = line[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
      } else if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
      }
    }

    return inSingleQuote || inDoubleQuote;
  }

  // Enhanced color detection that excludes comments and strings
  findColorValuesEnhanced(text: string): ColorMatch[] {
    const matches: ColorMatch[] = [];
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
      // Skip if entire line is a comment
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
        return;
      }

      Object.entries(CSSParser.COLOR_PATTERNS).forEach(([type, pattern]) => {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;

        while ((match = regex.exec(line)) !== null) {
          const matchStart = match.index;
          
          // Skip if inside comment or string
          if (this.isInComment(text, this.getAbsolutePosition(lines, lineIndex, matchStart)) ||
              this.isInString(line, matchStart)) {
            continue;
          }

          const colorString = match[0];
          const colorValue = ColorValueImpl.fromString(colorString);

          if (colorValue.isValid) {
            const startPos = new vscode.Position(lineIndex, matchStart);
            const endPos = new vscode.Position(lineIndex, matchStart + colorString.length);
            const range = new vscode.Range(startPos, endPos);

            matches.push({
              value: colorString,
              range,
              colorValue
            });
          }
        }
      });
    });

    return matches;
  }

  private getAbsolutePosition(lines: string[], lineIndex: number, columnIndex: number): number {
    let position = 0;
    for (let i = 0; i < lineIndex; i++) {
      position += lines[i].length + 1; // +1 for newline
    }
    return position + columnIndex;
  }

  // Enhanced CSS custom property analysis methods
  
  /**
   * Find CSS custom property definitions with enhanced context analysis
   */
  findCustomPropertyDefinitions(text: string): VariableDefinition[] {
    const definitions: VariableDefinition[] = [];
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
      // Skip comments and strings
      if (this.isLineInComment(line) || this.isLineInString(line)) {
        return;
      }

      const regex = new RegExp(CSSParser.CSS_VARIABLE_PATTERNS.definition.source, 'g');
      let match;

      while ((match = regex.exec(line)) !== null) {
        const variableName = `--${match[1]}`;
        const value = match[2].trim();
        
        // Check if the value itself is a color
        const isColorValue = this.isColorValue(value);
        
        const startPos = new vscode.Position(lineIndex, match.index);
        const endPos = new vscode.Position(lineIndex, match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        const definition: VariableDefinition = {
          name: variableName,
          value,
          range,
          type: 'css-custom-property'
        };

        definitions.push(definition);
      }
    });

    return definitions;
  }

  /**
   * Find var() function usages with enhanced fallback analysis
   */
  findVarUsages(text: string): VariableUsage[] {
    const usages: VariableUsage[] = [];
    this.findVarCallsEnhanced(text, usages);
    return usages;
  }

  private findVarCallsEnhanced(text: string, usages: VariableUsage[], lineOffset: number = 0): void {
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
      // Skip comments and strings
      if (this.isLineInComment(line) || this.isLineInString(line)) {
        return;
      }

      let searchIndex = 0;
      while (searchIndex < line.length) {
        const varStart = line.indexOf('var(', searchIndex);
        if (varStart === -1) {break;}

        const result = this.parseVarFunction(line, varStart, lineIndex + lineOffset);
        if (result) {
          usages.push(result.usage);
          
          // Recursively parse nested var() calls in fallback
          if (result.fallbackValue && result.fallbackValue.includes('var(')) {
            this.findVarCallsEnhanced(result.fallbackValue, usages, lineIndex + lineOffset);
          }
        }

        searchIndex = varStart + 1;
      }
    });
  }

  private parseVarFunction(line: string, startIndex: number, lineIndex: number): { usage: VariableUsage; fallbackValue?: string } | null {
    let currentIndex = startIndex + 4; // Start after 'var('
    let parenCount = 1;

    // Find variable name
    const varNameMatch = line.substring(currentIndex).match(/^\s*(--[a-zA-Z0-9-_]+)/);
    if (!varNameMatch) {
      return null;
    }

    const variableName = varNameMatch[1];
    currentIndex += varNameMatch[0].length;

    let fallbackStart = -1;
    // Check for comma (fallback)
    const commaMatch = line.substring(currentIndex).match(/^\s*,\s*/);
    if (commaMatch) {
      currentIndex += commaMatch[0].length;
      fallbackStart = currentIndex;
    }

    // Find the matching closing parenthesis
    while (currentIndex < line.length && parenCount > 0) {
      if (line[currentIndex] === '(') {
        parenCount++;
      } else if (line[currentIndex] === ')') {
        parenCount--;
      }
      currentIndex++;
    }

    if (parenCount !== 0) {
      return null; // Unmatched parentheses
    }

    const varEnd = currentIndex;
    const startPos = new vscode.Position(lineIndex, startIndex);
    const endPos = new vscode.Position(lineIndex, varEnd);
    const range = new vscode.Range(startPos, endPos);

    const usage: VariableUsage = {
      name: variableName,
      range,
      type: 'css-var'
    };

    let fallbackValue: string | undefined;
    if (fallbackStart !== -1) {
      fallbackValue = line.substring(fallbackStart, varEnd - 1).trim();
      if (fallbackValue) {
        usage.fallbackValue = fallbackValue;
      }
    }

    return { usage, fallbackValue };
  }

  /**
   * Analyze CSS custom property inheritance and cascading
   */
  analyzeCustomPropertyCascade(text: string): Map<string, VariableDefinition[]> {
    const cascade = new Map<string, VariableDefinition[]>();
    const definitions = this.findCustomPropertyDefinitions(text);

    definitions.forEach(def => {
      if (!cascade.has(def.name)) {
        cascade.set(def.name, []);
      }
      cascade.get(def.name)!.push(def);
    });

    return cascade;
  }

  /**
   * Find CSS custom properties that are used but not defined
   */
  findUndefinedCustomProperties(text: string): string[] {
    const definitions = this.findCustomPropertyDefinitions(text);
    const usages = this.findVarUsages(text);
    
    const definedNames = new Set(definitions.map(def => def.name));
    const usedNames = new Set(usages.map(usage => usage.name));
    
    const undefined: string[] = [];
    usedNames.forEach(name => {
      if (!definedNames.has(name)) {
        undefined.push(name);
      }
    });

    return undefined;
  }

  /**
   * Extract color values from CSS custom property values
   */
  extractColorsFromCustomProperties(text: string): Array<{ variable: VariableDefinition; colors: ColorMatch[] }> {
    const definitions = this.findCustomPropertyDefinitions(text);
    const results: Array<{ variable: VariableDefinition; colors: ColorMatch[] }> = [];

    definitions.forEach(def => {
      const colors = this.findColorValues(def.value);
      if (colors.length > 0) {
        results.push({ variable: def, colors });
      }
    });

    return results;
  }

  /**
   * Resolve CSS custom property values with fallback chain
   */
  resolveCustomPropertyValue(variableName: string, text: string): string | null {
    const definitions = this.findCustomPropertyDefinitions(text);
    const definition = definitions.find(def => def.name === variableName);
    
    if (!definition) {
      return null;
    }

    // If the value is another custom property, resolve recursively
    if (definition.value.includes('var(')) {
      const usages = this.findVarUsages(definition.value);
      if (usages.length > 0) {
        const nestedValue = this.resolveCustomPropertyValue(usages[0].name, text);
        return nestedValue || (usages[0].fallbackValue || null);
      }
    }

    return definition.value;
  }

  // Utility methods for enhanced analysis

  private isColorValue(value: string): boolean {
    return ColorValueImpl.isValidColor(value);
  }

  private isLineInComment(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('/*') || trimmed.startsWith('//');
  }

  private isLineInString(line: string): boolean {
    // Simple check for lines that are primarily string content
    const trimmed = line.trim();
    return (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
           (trimmed.startsWith("'") && trimmed.endsWith("'"));
  }

  /**
   * Get CSS custom property definition context (selector, rule, etc.)
   */
  getCustomPropertyContext(definition: VariableDefinition, text: string): string {
    const lines = text.split('\n');
    const defLine = definition.range.start.line;
    
    // Look backwards to find the selector
    for (let i = defLine; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.includes('{')) {
        // Found opening brace, look for selector
        const selectorLine = line.substring(0, line.indexOf('{')).trim();
        if (selectorLine) {
          return selectorLine;
        }
        // Look at previous lines for multi-line selectors
        for (let j = i - 1; j >= 0; j--) {
          const prevLine = lines[j].trim();
          if (prevLine && !prevLine.endsWith(',')) {
            return prevLine;
          }
        }
      }
    }
    
    return ':root'; // Default context
  }
}