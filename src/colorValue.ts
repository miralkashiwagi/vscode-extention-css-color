import { ColorValue } from './types';
import tinycolor from 'tinycolor2';

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
    const colorString = this.original.trim();

    // Skip pure numbers (like "55", "100", etc.) as they are not colors
    if (this.isPureNumber(colorString)) {
      return;
    }

    // Skip SCSS flags and keywords that are not colors
    if (this.isNonColorKeyword(colorString.toLowerCase())) {
      return;
    }

    // Skip CSS property values that are not colors
    if (this.isNonColorPropertyValue(colorString.toLowerCase())) {
      return;
    }

    // Use tinycolor2 to parse and validate the color
    const color = tinycolor(colorString);
    
    if (color.isValid()) {
      this.isValid = true;
      
      // Get color values from tinycolor2
      const rgb = color.toRgb();
      const hsl = color.toHsl();
      
      this.hex = color.toHexString();
      this.rgb = {
        r: Math.round(rgb.r),
        g: Math.round(rgb.g),
        b: Math.round(rgb.b)
      };
      
      if (rgb.a < 1) {
        this.rgb.a = rgb.a;
      }
      
      this.hsl = {
        h: Math.round(hsl.h || 0),
        s: Math.round(hsl.s * 100),
        l: Math.round(hsl.l * 100)
      };
      
      if (hsl.a < 1) {
        this.hsl.a = hsl.a;
      }
    }
  }

  private isPureNumber(value: string): boolean {
    // Check if the value is just a number (with optional decimal point)
    // This includes: "55", "100", "16.5", ".5", etc.
    const numberRegex = /^-?\d*\.?\d+$/;
    if (numberRegex.test(value)) {
      return true;
    }

    // Check if the value is a number with common CSS units (not colors)
    const numberWithUnitRegex = /^-?\d*\.?\d+(px|em|rem|vh|vw|vmin|vmax|%|pt|pc|in|cm|mm|ex|ch|fr|s|ms|deg|rad|grad|turn)$/;
    if (numberWithUnitRegex.test(value)) {
      return true;
    }

    return false;
  }

  private isNonColorKeyword(value: string): boolean {
    // SCSS/CSS keywords that are not colors
    const nonColorKeywords = [
      '!default', '!important', '!global', '!optional',
      'inherit', 'initial', 'unset', 'revert', 'auto',
      'none', 'normal', 'bold', 'italic', 'underline',
      'left', 'right', 'center', 'top', 'bottom',
      'block', 'inline', 'flex', 'grid', 'absolute', 'relative',
      'fixed', 'static', 'sticky', 'hidden', 'visible',
      'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge',
      'inset', 'outset', 'border-box', 'content-box',
      'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear'
    ];

    return nonColorKeywords.includes(value);
  }

  private isNonColorPropertyValue(value: string): boolean {
    // Check for transition/animation values (contains timing functions and durations)
    if (this.isTransitionValue(value)) {
      return true;
    }

    // Check for transform values
    if (this.isTransformValue(value)) {
      return true;
    }

    // Check for calc() expressions
    if (value.includes('calc(')) {
      return true;
    }

    // Check for CSS functions that are not color functions
    const nonColorFunctions = ['var(', 'attr(', 'url(', 'counter(', 'counters('];
    if (nonColorFunctions.some(func => value.includes(func))) {
      return true;
    }

    return false;
  }

  private isTransitionValue(value: string): boolean {
    // Transition values typically contain timing functions and durations
    const timingFunctions = ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'cubic-bezier'];
    const timeUnits = ['s', 'ms'];
    
    // Check if value contains timing functions
    if (timingFunctions.some(func => value.includes(func))) {
      return true;
    }

    // Check if value contains time units (but not just time units)
    const hasTimeUnit = timeUnits.some(unit => {
      const regex = new RegExp(`\\d+${unit}\\b`);
      return regex.test(value);
    });

    // If it has time units and multiple words, it's likely a transition
    if (hasTimeUnit && value.split(/\s+/).length > 1) {
      return true;
    }

    return false;
  }

  private isTransformValue(value: string): boolean {
    const transformFunctions = [
      'translate', 'translate3d', 'translateX', 'translateY', 'translateZ',
      'scale', 'scaleX', 'scaleY', 'scaleZ', 'scale3d',
      'rotate', 'rotateX', 'rotateY', 'rotateZ', 'rotate3d',
      'skew', 'skewX', 'skewY', 'matrix', 'matrix3d', 'perspective'
    ];

    return transformFunctions.some(func => value.includes(func + '('));
  }

  // Static factory method for creating ColorValue instances
  static fromString(colorString: string): ColorValue {
    return new ColorValueImpl(colorString);
  }

  // Utility method to check if a string is a valid color
  static isValidColor(colorString: string): boolean {
    return new ColorValueImpl(colorString).isValid;
  }
}