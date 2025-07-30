import * as assert from 'assert';
import * as vscode from 'vscode';
import { DecorationProviderImpl } from '../decorationProvider';
import { ColorValue } from '../types';

suite('DecorationProvider Tests', () => {
  let provider: DecorationProviderImpl;
  let mockEditor: vscode.TextEditor;

  setup(() => {
    provider = new DecorationProviderImpl();
    mockEditor = createMockEditor();
  });

  teardown(() => {
    provider.dispose();
  });

  suite('Color Chip Creation', () => {
    test('should create basic color chip decoration', () => {
      const color: ColorValue = {
        hex: '#ff0000',
        rgb: { r: 255, g: 0, b: 0 },
        hsl: { h: 0, s: 100, l: 50 },
        original: '#ff0000',
        isValid: true
      };
      const range = new vscode.Range(0, 0, 0, 7);

      const decoration = provider.createColorChip(color, range);

      assert.strictEqual(decoration.range, range);
      assert.ok(decoration.renderOptions?.before);
      assert.strictEqual(decoration.renderOptions.before.backgroundColor, '#ff0000');
      assert.ok(decoration.hoverMessage);
    });

    test('should create color chip with appropriate border for light colors', () => {
      const lightColor: ColorValue = {
        hex: '#ffffff',
        rgb: { r: 255, g: 255, b: 255 },
        hsl: { h: 0, s: 0, l: 100 },
        original: '#ffffff',
        isValid: true
      };
      const range = new vscode.Range(0, 0, 0, 7);

      const decoration = provider.createColorChip(lightColor, range);

      assert.ok(decoration.renderOptions?.before?.border);
      assert.ok(decoration.renderOptions.before.border.includes('rgba(0, 0, 0, 0.2)'));
    });

    test('should create color chip without border for dark colors', () => {
      const darkColor: ColorValue = {
        hex: '#000000',
        rgb: { r: 0, g: 0, b: 0 },
        hsl: { h: 0, s: 0, l: 0 },
        original: '#000000',
        isValid: true
      };
      const range = new vscode.Range(0, 0, 0, 7);

      const decoration = provider.createColorChip(darkColor, range);

      assert.strictEqual(decoration.renderOptions?.before?.border, 'none');
    });

    test('should include comprehensive color information in hover message', () => {
      const color: ColorValue = {
        hex: '#ff0000',
        rgb: { r: 255, g: 0, b: 0, a: 0.8 },
        hsl: { h: 0, s: 100, l: 50, a: 0.8 },
        original: 'rgba(255, 0, 0, 0.8)',
        isValid: true
      };
      const range = new vscode.Range(0, 0, 0, 20);

      const decoration = provider.createColorChip(color, range);

      const hoverMessage = decoration.hoverMessage as vscode.MarkdownString;
      assert.ok(hoverMessage);
      assert.ok(hoverMessage.value.includes('rgba(255, 0, 0, 0.8)'));
      assert.ok(hoverMessage.value.includes('#ff0000'));
      assert.ok(hoverMessage.value.includes('rgb(255, 0, 0, 0.8)'));
      assert.ok(hoverMessage.value.includes('hsl(0, 100%, 50%, 0.8)'));
    });
  });

  suite('Variable Color Chip Creation', () => {
    test('should create variable color chip with variable information', () => {
      const resolvedColor: ColorValue = {
        hex: '#ff0000',
        rgb: { r: 255, g: 0, b: 0 },
        hsl: { h: 0, s: 100, l: 50 },
        original: '#ff0000',
        isValid: true
      };
      const range = new vscode.Range(0, 0, 0, 15);

      const decoration = provider.createVariableColorChip('--primary-color', resolvedColor, range);

      assert.strictEqual(decoration.range, range);
      assert.strictEqual(decoration.renderOptions?.before?.backgroundColor, '#ff0000');
      
      const hoverMessage = decoration.hoverMessage as vscode.MarkdownString;
      assert.ok(hoverMessage.value.includes('--primary-color'));
      assert.ok(hoverMessage.value.includes('Resolved Color'));
    });

    test('should include fallback color information when provided', () => {
      const resolvedColor: ColorValue = {
        hex: '#ff0000',
        rgb: { r: 255, g: 0, b: 0 },
        hsl: { h: 0, s: 100, l: 50 },
        original: '#ff0000',
        isValid: true
      };
      const fallbackColor: ColorValue = {
        hex: '#00ff00',
        rgb: { r: 0, g: 255, b: 0 },
        hsl: { h: 120, s: 100, l: 50 },
        original: '#00ff00',
        isValid: true
      };
      const range = new vscode.Range(0, 0, 0, 15);

      const decoration = provider.createVariableColorChip('$primary-color', resolvedColor, range, fallbackColor);

      const hoverMessage = decoration.hoverMessage as vscode.MarkdownString;
      assert.ok(hoverMessage.value.includes('Fallback Color'));
      assert.ok(hoverMessage.value.includes('#00ff00'));
    });
  });

  suite('Multiple Color Chips', () => {
    test('should create gradient decoration for multiple colors', () => {
      const colors: ColorValue[] = [
        {
          hex: '#ff0000',
          rgb: { r: 255, g: 0, b: 0 },
          hsl: { h: 0, s: 100, l: 50 },
          original: '#ff0000',
          isValid: true
        },
        {
          hex: '#00ff00',
          rgb: { r: 0, g: 255, b: 0 },
          hsl: { h: 120, s: 100, l: 50 },
          original: '#00ff00',
          isValid: true
        }
      ];
      const range = new vscode.Range(0, 0, 0, 10);

      const decoration = provider.createMultipleColorChips(colors, range, 'Theme variants');

      assert.ok(decoration.renderOptions?.before?.contentText);
      assert.strictEqual(decoration.renderOptions.before.contentText, '●●');
      assert.strictEqual(decoration.renderOptions.before.color, '#ff0000');

      const hoverMessage = decoration.hoverMessage as vscode.MarkdownString;
      assert.ok(hoverMessage.value.includes('Theme variants'));
      assert.ok(hoverMessage.value.includes('Multiple Possible Colors (2)'));
    });

    test('should fallback to single color chip for single color array', () => {
      const colors: ColorValue[] = [
        {
          hex: '#ff0000',
          rgb: { r: 255, g: 0, b: 0 },
          hsl: { h: 0, s: 100, l: 50 },
          original: '#ff0000',
          isValid: true
        }
      ];
      const range = new vscode.Range(0, 0, 0, 10);

      const decoration = provider.createMultipleColorChips(colors, range);

      // Should behave like a single color chip
      assert.strictEqual(decoration.renderOptions?.before?.backgroundColor, '#ff0000');
    });

    test('should throw error for empty color array', () => {
      const range = new vscode.Range(0, 0, 0, 10);

      assert.throws(() => {
        provider.createMultipleColorChips([], range);
      }, /At least one color is required/);
    });
  });

  suite('Undefined Variable Decoration', () => {
    test('should create decoration for undefined variable', () => {
      const range = new vscode.Range(0, 0, 0, 15);

      const decoration = provider.createUndefinedVariableDecoration('--undefined-var', range);

      assert.strictEqual(decoration.range, range);
      assert.strictEqual(decoration.renderOptions?.before?.contentText, '?');
      assert.ok(decoration.renderOptions?.before?.border?.includes('dashed'));
      assert.ok(decoration.renderOptions?.before?.border?.includes('rgba(255, 0, 0, 0.5)'));

      const hoverMessage = decoration.hoverMessage as vscode.MarkdownString;
      assert.ok(hoverMessage.value.includes('Undefined Variable'));
      assert.ok(hoverMessage.value.includes('--undefined-var'));
      assert.ok(hoverMessage.value.includes('Suggestions'));
    });

    test('should include fallback color when provided', () => {
      const fallbackColor: ColorValue = {
        hex: '#cccccc',
        rgb: { r: 204, g: 204, b: 204 },
        hsl: { h: 0, s: 0, l: 80 },
        original: '#cccccc',
        isValid: true
      };
      const range = new vscode.Range(0, 0, 0, 15);

      const decoration = provider.createUndefinedVariableDecoration('$undefined-var', range, fallbackColor);

      assert.strictEqual(decoration.renderOptions?.before?.backgroundColor, '#cccccc');

      const hoverMessage = decoration.hoverMessage as vscode.MarkdownString;
      assert.ok(hoverMessage.value.includes('Fallback Color'));
      assert.ok(hoverMessage.value.includes('#cccccc'));
    });
  });

  suite('Decoration Application and Management', () => {
    test('should apply decorations to editor', () => {
      const color: ColorValue = {
        hex: '#ff0000',
        rgb: { r: 255, g: 0, b: 0 },
        hsl: { h: 0, s: 100, l: 50 },
        original: '#ff0000',
        isValid: true
      };
      const decorations = [
        provider.createColorChip(color, new vscode.Range(0, 0, 0, 7)),
        provider.createColorChip(color, new vscode.Range(1, 0, 1, 7))
      ];

      // Should not throw
      assert.doesNotThrow(() => {
        provider.applyDecorations(mockEditor, decorations);
      });
    });

    test('should handle empty decorations array', () => {
      assert.doesNotThrow(() => {
        provider.applyDecorations(mockEditor, []);
      });
    });

    test('should clear decorations from editor', () => {
      const color: ColorValue = {
        hex: '#ff0000',
        rgb: { r: 255, g: 0, b: 0 },
        hsl: { h: 0, s: 100, l: 50 },
        original: '#ff0000',
        isValid: true
      };
      const decorations = [
        provider.createColorChip(color, new vscode.Range(0, 0, 0, 7))
      ];

      provider.applyDecorations(mockEditor, decorations);

      // Should not throw
      assert.doesNotThrow(() => {
        provider.clearDecorations(mockEditor);
      });
    });

    test('should update decoration styles', () => {
      // Should not throw
      assert.doesNotThrow(() => {
        provider.updateDecorationStyles();
      });
    });
  });

  suite('Settings Integration', () => {
    test('should respect chip size settings', () => {
      // Mock different chip sizes
      const originalGet = vscode.workspace.getConfiguration;
      
      // Test small size
      vscode.workspace.getConfiguration = () => ({
        get: (key: string, defaultValue?: any) => {
          if (key === 'chipSize') {return 'small';}
          return defaultValue;
        }
      } as any);

      const color: ColorValue = {
        hex: '#ff0000',
        rgb: { r: 255, g: 0, b: 0 },
        hsl: { h: 0, s: 100, l: 50 },
        original: '#ff0000',
        isValid: true
      };
      const decoration = provider.createColorChip(color, new vscode.Range(0, 0, 0, 7));

      assert.strictEqual(decoration.renderOptions?.before?.width, '8px');
      assert.strictEqual(decoration.renderOptions?.before?.height, '8px');

      // Restore original function
      vscode.workspace.getConfiguration = originalGet;
    });
  });

  suite('Position and Size Adjustment', () => {
    test('should create compact multiple chips with proper spacing', () => {
      const colors: ColorValue[] = [
        {
          hex: '#ff0000',
          rgb: { r: 255, g: 0, b: 0 },
          hsl: { h: 0, s: 100, l: 50 },
          original: '#ff0000',
          isValid: true
        },
        {
          hex: '#00ff00',
          rgb: { r: 0, g: 255, b: 0 },
          hsl: { h: 120, s: 100, l: 50 },
          original: '#00ff00',
          isValid: true
        }
      ];
      const baseRange = new vscode.Range(0, 0, 0, 10);

      const decorations = provider.createCompactMultipleChips(colors, baseRange, 2);

      assert.strictEqual(decorations.length, 2);
      assert.ok(decorations[0].range.start.character < decorations[1].range.start.character);
    });

    test('should create stacked color chips for limited space', () => {
      const colors: ColorValue[] = [
        {
          hex: '#ff0000',
          rgb: { r: 255, g: 0, b: 0 },
          hsl: { h: 0, s: 100, l: 50 },
          original: '#ff0000',
          isValid: true
        },
        {
          hex: '#00ff00',
          rgb: { r: 0, g: 255, b: 0 },
          hsl: { h: 120, s: 100, l: 50 },
          original: '#00ff00',
          isValid: true
        },
        {
          hex: '#0000ff',
          rgb: { r: 0, g: 0, b: 255 },
          hsl: { h: 240, s: 100, l: 50 },
          original: '#0000ff',
          isValid: true
        }
      ];
      const range = new vscode.Range(0, 0, 0, 10);

      const decoration = provider.createStackedColorChips(colors, range, 2);

      assert.ok(decoration.renderOptions?.before?.contentText);
      assert.ok(decoration.renderOptions.before.contentText.includes('3') || decoration.renderOptions.before.contentText.includes('+'));

      const hoverMessage = decoration.hoverMessage as vscode.MarkdownString;
      assert.ok(hoverMessage.value.includes('Stacked Colors'));
      assert.ok(hoverMessage.value.includes('3 total'));
    });

    test('should handle overlapping decorations', () => {
      const color1: ColorValue = {
        hex: '#ff0000',
        rgb: { r: 255, g: 0, b: 0 },
        hsl: { h: 0, s: 100, l: 50 },
        original: '#ff0000',
        isValid: true
      };
      const color2: ColorValue = {
        hex: '#00ff00',
        rgb: { r: 0, g: 255, b: 0 },
        hsl: { h: 120, s: 100, l: 50 },
        original: '#00ff00',
        isValid: true
      };

      // Create overlapping decorations
      const decorations = [
        provider.createColorChip(color1, new vscode.Range(0, 0, 0, 7)),
        provider.createColorChip(color2, new vscode.Range(0, 1, 0, 8)) // Overlapping position
      ];

      // Should not throw and should handle overlaps
      assert.doesNotThrow(() => {
        provider.applyDecorations(mockEditor, decorations);
      });
    });

    test('should adjust chip size based on settings', () => {
      // Mock different chip sizes
      const originalGet = vscode.workspace.getConfiguration;
      
      // Test large size
      vscode.workspace.getConfiguration = () => ({
        get: (key: string, defaultValue?: any) => {
          if (key === 'chipSize') {return 'large';}
          return defaultValue;
        }
      } as any);

      const color: ColorValue = {
        hex: '#ff0000',
        rgb: { r: 255, g: 0, b: 0 },
        hsl: { h: 0, s: 100, l: 50 },
        original: '#ff0000',
        isValid: true
      };
      const decoration = provider.createColorChip(color, new vscode.Range(0, 0, 0, 7));

      assert.strictEqual(decoration.renderOptions?.before?.width, '16px');
      assert.strictEqual(decoration.renderOptions?.before?.height, '16px');

      // Restore original function
      vscode.workspace.getConfiguration = originalGet;
    });
  });

  suite('Error Handling', () => {
    test('should handle invalid editor gracefully', () => {
      const decorations = [
        provider.createColorChip({
          hex: '#ff0000',
          rgb: { r: 255, g: 0, b: 0 },
          hsl: { h: 0, s: 100, l: 50 },
          original: '#ff0000',
          isValid: true
        }, new vscode.Range(0, 0, 0, 7))
      ];

      assert.doesNotThrow(() => {
        provider.applyDecorations(null as any, decorations);
      });
    });

    test('should handle dispose multiple times', () => {
      assert.doesNotThrow(() => {
        provider.dispose();
        provider.dispose(); // Should not throw on second dispose
      });
    });

    test('should throw error for empty color array in stacked chips', () => {
      const range = new vscode.Range(0, 0, 0, 10);

      assert.throws(() => {
        provider.createStackedColorChips([], range);
      }, /At least one color is required/);
    });

    test('should handle empty decorations in compact chips', () => {
      const baseRange = new vscode.Range(0, 0, 0, 10);

      const decorations = provider.createCompactMultipleChips([], baseRange);

      assert.strictEqual(decorations.length, 0);
    });
  });
});

// Helper function to create mock VSCode editor
function createMockEditor(): vscode.TextEditor {
  const mockDocument = {
    uri: vscode.Uri.parse('test://test.css'),
    fileName: 'test.css',
    languageId: 'css',
    version: 1,
    getText: () => '.test { color: #ff0000; }',
    lineCount: 1
  } as vscode.TextDocument;

  return {
    document: mockDocument,
    selection: new vscode.Selection(0, 0, 0, 0),
    selections: [new vscode.Selection(0, 0, 0, 0)],
    visibleRanges: [new vscode.Range(0, 0, 0, 21)],
    options: {
      cursorStyle: vscode.TextEditorCursorStyle.Line,
      insertSpaces: true,
      lineNumbers: vscode.TextEditorLineNumbersStyle.On,
      tabSize: 2
    },
    viewColumn: vscode.ViewColumn.One,
    edit: async () => true,
    insertSnippet: async () => true,
    setDecorations: (decorationType: vscode.TextEditorDecorationType, decorations: vscode.DecorationOptions[]) => {
      // Mock implementation - just store for testing
    },
    revealRange: () => {},
    show: () => {},
    hide: () => {}
  } as vscode.TextEditor;
}