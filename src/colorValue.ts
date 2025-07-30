import { ColorValue } from './types';

export class ColorValueImpl implements ColorValue {
  public hex: string;
  public rgb: { r: number; g: number; b: number; a?: number };
  public hsl: { h: number; s: number; l: number; a?: number };
  public original: string;
  public isValid: boolean;

  constructor(colorString: string) {
    this.original = colorString.trim();
    this.isValid = false;
    this.hex = '';
    this.rgb = { r: 0, g: 0, b: 0 };
    this.hsl = { h: 0, s: 0, l: 0 };

    this.parseColor();
  }

  private parseColor(): void {
    const color = this.original.toLowerCase();

    // Try different color formats
    if (this.parseHex(color) || 
        this.parseRgb(color) || 
        this.parseHsl(color) || 
        this.parseNamedColor(color)) {
      this.isValid = true;
    }
  }

  private parseHex(color: string): boolean {
    // Match #RGB, #RRGGBB, #RGBA, #RRGGBBAA
    const hexMatch = color.match(/^#([0-9a-f]{3,8})$/);
    if (!hexMatch) {return false;}

    const hex = hexMatch[1];
    let r: number, g: number, b: number, a: number = 1;

    if (hex.length === 3) {
      // #RGB -> #RRGGBB
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 4) {
      // #RGBA -> #RRGGBBAA
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
      a = parseInt(hex[3] + hex[3], 16) / 255;
    } else if (hex.length === 6) {
      // #RRGGBB
      r = parseInt(hex.substr(0, 2), 16);
      g = parseInt(hex.substr(2, 2), 16);
      b = parseInt(hex.substr(4, 2), 16);
    } else if (hex.length === 8) {
      // #RRGGBBAA
      r = parseInt(hex.substr(0, 2), 16);
      g = parseInt(hex.substr(2, 2), 16);
      b = parseInt(hex.substr(4, 2), 16);
      a = parseInt(hex.substr(6, 2), 16) / 255;
    } else {
      return false;
    }

    this.rgb = { r, g, b };
    if (a !== 1) {this.rgb.a = a;}
    
    this.hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    this.hsl = this.rgbToHsl(r, g, b);
    if (a !== 1) {this.hsl.a = a;}

    return true;
  }

  private parseRgb(color: string): boolean {
    // Match rgb(r, g, b) or rgba(r, g, b, a)
    const rgbMatch = color.match(/rgba?\(\s*([^)]+)\s*\)/);
    if (!rgbMatch) {return false;}

    const values = rgbMatch[1].split(',').map(v => v.trim());
    if (values.length < 3 || values.length > 4) {return false;}

    const r = this.parseColorValue(values[0], 255);
    const g = this.parseColorValue(values[1], 255);
    const b = this.parseColorValue(values[2], 255);
    const a = values.length === 4 ? this.parseAlpha(values[3]) : 1;

    if (r === null || g === null || b === null || a === null) {return false;}

    this.rgb = { r, g, b };
    if (a !== 1) {this.rgb.a = a;}

    this.hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    this.hsl = this.rgbToHsl(r, g, b);
    if (a !== 1) {this.hsl.a = a;}

    return true;
  }

  private parseHsl(color: string): boolean {
    // Match hsl(h, s%, l%) or hsla(h, s%, l%, a)
    const hslMatch = color.match(/hsla?\(\s*([^)]+)\s*\)/);
    if (!hslMatch) {return false;}

    const values = hslMatch[1].split(',').map(v => v.trim());
    if (values.length < 3 || values.length > 4) {return false;}

    const h = this.parseHue(values[0]);
    const s = this.parsePercentage(values[1]);
    const l = this.parsePercentage(values[2]);
    const a = values.length === 4 ? this.parseAlpha(values[3]) : 1;

    if (h === null || s === null || l === null || a === null) {return false;}

    this.hsl = { h, s, l };
    if (a !== 1) {this.hsl.a = a;}

    const rgb = this.hslToRgb(h, s, l);
    this.rgb = { r: rgb.r, g: rgb.g, b: rgb.b };
    if (a !== 1) {this.rgb.a = a;}

    this.hex = `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;

    return true;
  }

  private parseNamedColor(color: string): boolean {
    const namedColors: { [key: string]: string } = {
      'black': '#000000', 'white': '#ffffff', 'red': '#ff0000', 'green': '#008000',
      'blue': '#0000ff', 'yellow': '#ffff00', 'cyan': '#00ffff', 'magenta': '#ff00ff',
      'silver': '#c0c0c0', 'gray': '#808080', 'maroon': '#800000', 'olive': '#808000',
      'lime': '#00ff00', 'aqua': '#00ffff', 'teal': '#008080', 'navy': '#000080',
      'fuchsia': '#ff00ff', 'purple': '#800080', 'orange': '#ffa500', 'transparent': '#00000000'
    };

    const hexValue = namedColors[color];
    if (!hexValue) {return false;}

    // Parse the hex value
    const tempColor = new ColorValueImpl(hexValue);
    if (!tempColor.isValid) {return false;}

    this.hex = tempColor.hex;
    this.rgb = tempColor.rgb;
    this.hsl = tempColor.hsl;

    return true;
  }

  private parseColorValue(value: string, max: number): number | null {
    if (value.endsWith('%')) {
      const percent = parseFloat(value.slice(0, -1));
      if (isNaN(percent) || percent < 0 || percent > 100) {return null;}
      return Math.round((percent / 100) * max);
    } else {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > max) {return null;}
      return Math.round(num);
    }
  }

  private parsePercentage(value: string): number | null {
    if (!value.endsWith('%')) {return null;}
    const percent = parseFloat(value.slice(0, -1));
    if (isNaN(percent) || percent < 0 || percent > 100) {return null;}
    return percent;
  }

  private parseHue(value: string): number | null {
    const num = parseFloat(value);
    if (isNaN(num)) {return null;}
    return ((num % 360) + 360) % 360; // Normalize to 0-360
  }

  private parseAlpha(value: string): number | null {
    if (value.endsWith('%')) {
      const percent = parseFloat(value.slice(0, -1));
      if (isNaN(percent) || percent < 0 || percent > 100) {return null;}
      return percent / 100;
    } else {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 1) {return null;}
      return num;
    }
  }

  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    const sum = max + min;
    const l = sum / 2;

    let h: number, s: number;

    if (diff === 0) {
      h = s = 0; // achromatic
    } else {
      s = l > 0.5 ? diff / (2 - sum) : diff / sum;

      switch (max) {
        case r: h = (g - b) / diff + (g < b ? 6 : 0); break;
        case g: h = (b - r) / diff + 2; break;
        case b: h = (r - g) / diff + 4; break;
        default: h = 0;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h /= 360;
    s /= 100;
    l /= 100;

    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) {t += 1;}
      if (t > 1) {t -= 1;}
      if (t < 1/6) {return p + (q - p) * 6 * t;}
      if (t < 1/2) {return q;}
      if (t < 2/3) {return p + (q - p) * (2/3 - t) * 6;}
      return p;
    };

    let r: number, g: number, b: number;

    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  // Static factory method
  static fromString(colorString: string): ColorValue {
    return new ColorValueImpl(colorString);
  }

  // Utility method to check if a string is a valid color
  static isValidColor(colorString: string): boolean {
    return new ColorValueImpl(colorString).isValid;
  }
}