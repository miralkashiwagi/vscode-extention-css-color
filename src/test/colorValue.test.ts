import * as assert from 'assert';
import { ColorValueImpl } from '../colorValue';

suite('ColorValue Tests', () => {
  
  suite('Hex Color Parsing', () => {
    test('should parse 3-digit hex colors', () => {
      const color = ColorValueImpl.fromString('#f0a');
      assert.strictEqual(color.isValid, true);
      assert.strictEqual(color.hex, '#ff00aa');
      assert.strictEqual(color.rgb.r, 255);
      assert.strictEqual(color.rgb.g, 0);
      assert.strictEqual(color.rgb.b, 170);
    });

    test('should parse 6-digit hex colors', () => {
      const color = ColorValueImpl.fromString('#ff0000');
      assert.strictEqual(color.isValid, true);
      assert.strictEqual(color.hex, '#ff0000');
      assert.strictEqual(color.rgb.r, 255);
      assert.strictEqual(color.rgb.g, 0);
      assert.strictEqual(color.rgb.b, 0);
    });

    test('should parse 8-digit hex colors with alpha', () => {
      const color = ColorValueImpl.fromString('#ff000080');
      assert.strictEqual(color.isValid, true);
      assert.strictEqual(color.hex, '#ff0000');
      assert.strictEqual(color.rgb.a, 0.5019607843137255); // 128/255
    });

    test('should reject invalid hex colors', () => {
      const color = ColorValueImpl.fromString('#gg0000');
      assert.strictEqual(color.isValid, false);
    });
  });

  suite('RGB Color Parsing', () => {
    test('should parse rgb() colors', () => {
      const color = ColorValueImpl.fromString('rgb(255, 0, 0)');
      assert.strictEqual(color.isValid, true);
      assert.strictEqual(color.hex, '#ff0000');
      assert.strictEqual(color.rgb.r, 255);
      assert.strictEqual(color.rgb.g, 0);
      assert.strictEqual(color.rgb.b, 0);
    });

    test('should parse rgba() colors', () => {
      const color = ColorValueImpl.fromString('rgba(255, 0, 0, 0.5)');
      assert.strictEqual(color.isValid, true);
      assert.strictEqual(color.hex, '#ff0000');
      assert.strictEqual(color.rgb.a, 0.5);
    });

    test('should parse rgb() with percentages', () => {
      const color = ColorValueImpl.fromString('rgb(100%, 0%, 0%)');
      assert.strictEqual(color.isValid, true);
      assert.strictEqual(color.hex, '#ff0000');
      assert.strictEqual(color.rgb.r, 255);
    });

    test('should reject invalid rgb values', () => {
      const color = ColorValueImpl.fromString('rgb(300, 0, 0)');
      assert.strictEqual(color.isValid, false);
    });
  });

  suite('HSL Color Parsing', () => {
    test('should parse hsl() colors', () => {
      const color = ColorValueImpl.fromString('hsl(0, 100%, 50%)');
      assert.strictEqual(color.isValid, true);
      assert.strictEqual(color.hex, '#ff0000');
      assert.strictEqual(color.hsl.h, 0);
      assert.strictEqual(color.hsl.s, 100);
      assert.strictEqual(color.hsl.l, 50);
    });

    test('should parse hsla() colors', () => {
      const color = ColorValueImpl.fromString('hsla(0, 100%, 50%, 0.5)');
      assert.strictEqual(color.isValid, true);
      assert.strictEqual(color.hsl.a, 0.5);
    });

    test('should handle hue normalization', () => {
      const color = ColorValueImpl.fromString('hsl(360, 100%, 50%)');
      assert.strictEqual(color.isValid, true);
      assert.strictEqual(color.hsl.h, 0); // 360 should normalize to 0
    });
  });

  suite('Named Color Parsing', () => {
    test('should parse named colors', () => {
      const color = ColorValueImpl.fromString('red');
      assert.strictEqual(color.isValid, true);
      assert.strictEqual(color.hex, '#ff0000');
    });

    test('should parse transparent', () => {
      const color = ColorValueImpl.fromString('transparent');
      assert.strictEqual(color.isValid, true);
      assert.strictEqual(color.rgb.a, 0);
    });

    test('should reject unknown named colors', () => {
      const color = ColorValueImpl.fromString('unknowncolor');
      assert.strictEqual(color.isValid, false);
    });
  });

  suite('Color Conversion', () => {
    test('should convert RGB to HSL correctly', () => {
      const color = ColorValueImpl.fromString('#ff0000');
      assert.strictEqual(color.hsl.h, 0);
      assert.strictEqual(color.hsl.s, 100);
      assert.strictEqual(color.hsl.l, 50);
    });

    test('should convert HSL to RGB correctly', () => {
      const color = ColorValueImpl.fromString('hsl(120, 100%, 50%)');
      assert.strictEqual(color.rgb.r, 0);
      assert.strictEqual(color.rgb.g, 255);
      assert.strictEqual(color.rgb.b, 0);
    });
  });

  suite('Utility Methods', () => {
    test('isValidColor should work correctly', () => {
      assert.strictEqual(ColorValueImpl.isValidColor('#ff0000'), true);
      assert.strictEqual(ColorValueImpl.isValidColor('red'), true);
      assert.strictEqual(ColorValueImpl.isValidColor('invalid'), false);
    });

    test('should preserve original color string', () => {
      const original = '  #FF0000  ';
      const color = ColorValueImpl.fromString(original);
      assert.strictEqual(color.original, '#FF0000'); // trimmed
    });
  });
});