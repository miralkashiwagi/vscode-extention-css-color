# Design Document

## Overview

この拡張機能は、VSCodeでCSSカスタムプロパティとSCSS変数を使用している箇所に色チップを表示する機能を提供します。従来の色チップ表示機能を拡張し、変数を通じた色の定義と使用を視覚的にサポートします。

主要な技術的アプローチ：
- VSCode Decoration APIを使用した色チップの表示
- 正規表現とASTパーサーを組み合わせた変数解析
- ワークスペース全体での変数定義の追跡
- リアルタイムでの変数値解決

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Extension Host                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   ColorChip     │  │   Variable      │  │   Settings   │ │
│  │   Manager       │  │   Resolver      │  │   Manager    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   CSS Parser    │  │   SCSS Parser   │  │   File       │ │
│  │                 │  │                 │  │   Watcher    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   Decoration    │  │   Hover         │  │   Cache      │ │
│  │   Provider      │  │   Provider      │  │   Manager    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. ColorChipManager

メインコントローラーとして、全体の色チップ表示を管理します。

```typescript
interface ColorChipManager {
  activate(context: vscode.ExtensionContext): void;
  deactivate(): void;
  refreshDocument(document: vscode.TextDocument): void;
  updateSettings(): void;
}
```

**責任:**
- 拡張機能の初期化と終了処理
- ドキュメントの変更監視
- 設定変更の処理
- 各コンポーネントの協調

### 2. VariableResolver

変数の定義と使用箇所を解析し、色値を解決します。

```typescript
interface VariableResolver {
  resolveCSSVariable(variableName: string, document: vscode.TextDocument): ColorValue | null;
  resolveSCSSVariable(variableName: string, document: vscode.TextDocument): ColorValue | null;
  findVariableDefinitions(document: vscode.TextDocument): VariableDefinition[];
  findVariableUsages(document: vscode.TextDocument): VariableUsage[];
}

interface VariableDefinition {
  name: string;
  value: string;
  range: vscode.Range;
  type: 'css-custom-property' | 'scss-variable';
}

interface VariableUsage {
  name: string;
  range: vscode.Range;
  type: 'css-var' | 'scss-variable';
  fallbackValue?: string;
}
```

**責任:**
- CSS/SCSS変数の定義検出
- 変数使用箇所の検出
- 変数値の解決（インポート関係を含む）
- フォールバック値の処理

### 3. CSSParser & SCSSParser

各言語固有の構文解析を担当します。

```typescript
interface Parser {
  parseDocument(document: vscode.TextDocument): ParseResult;
  findColorValues(text: string): ColorMatch[];
  findVariableDefinitions(text: string): VariableDefinition[];
  findVariableUsages(text: string): VariableUsage[];
}

interface ParseResult {
  colorValues: ColorMatch[];
  variableDefinitions: VariableDefinition[];
  variableUsages: VariableUsage[];
}

interface ColorMatch {
  value: string;
  range: vscode.Range;
  colorValue: ColorValue;
}
```

**責任:**
- 言語固有の構文解析
- 色値の抽出と検証
- 変数定義・使用箇所の特定

### 4. DecorationProvider

VSCodeのDecoration APIを使用して色チップを表示します。

```typescript
interface DecorationProvider {
  createColorChip(color: ColorValue, range: vscode.Range): vscode.DecorationOptions;
  applyDecorations(editor: vscode.TextEditor, decorations: vscode.DecorationOptions[]): void;
  clearDecorations(editor: vscode.TextEditor): void;
}
```

**責任:**
- 色チップのビジュアル作成
- エディターへの装飾適用
- 装飾のクリアと更新

### 5. SettingsManager

拡張機能の設定を管理します。

```typescript
interface SettingsManager {
  getDisplayMode(): 'default' | 'computed' | 'multiple';
  getEnabledFileTypes(): string[];
  getVariableResolutionScope(): 'file' | 'workspace';
  getChipSize(): 'small' | 'medium' | 'large';
  onSettingsChanged(callback: () => void): void;
}
```

## Data Models

### ColorValue

```typescript
interface ColorValue {
  hex: string;
  rgb: { r: number; g: number; b: number; a?: number };
  hsl: { h: number; s: number; l: number; a?: number };
  original: string;
  isValid: boolean;
}
```

### VariableContext

```typescript
interface VariableContext {
  definitions: Map<string, VariableDefinition>;
  usages: VariableUsage[];
  imports: ImportDeclaration[];
  scope: 'file' | 'workspace';
}
```

### CacheEntry

```typescript
interface CacheEntry {
  documentUri: string;
  version: number;
  variables: VariableContext;
  colorMatches: ColorMatch[];
  timestamp: number;
}
```

## Error Handling

### 1. 変数解決エラー

```typescript
enum VariableResolutionError {
  NOT_FOUND = 'Variable not found',
  CIRCULAR_REFERENCE = 'Circular reference detected',
  INVALID_VALUE = 'Invalid color value',
  IMPORT_ERROR = 'Failed to resolve import'
}
```

**対処法:**
- 未定義変数: フォールバック値を使用、または警告表示
- 循環参照: 検出して無限ループを防止
- 無効な色値: 色チップを表示せず、ログに記録
- インポートエラー: 現在のファイル内のみで解決を試行

### 2. パフォーマンスエラー

**対処法:**
- 大きなファイルでの処理タイムアウト（5秒）
- キャッシュによる重複処理の回避
- 段階的な解析（必要な部分のみ）

### 3. 設定エラー

**対処法:**
- 無効な設定値はデフォルト値にフォールバック
- 設定変更時の検証とエラー通知

## Testing Strategy

### 1. Unit Tests

**対象コンポーネント:**
- VariableResolver: 変数解決ロジック
- CSSParser/SCSSParser: 構文解析
- ColorValue: 色値変換
- SettingsManager: 設定管理

**テストケース例:**
```typescript
describe('VariableResolver', () => {
  test('should resolve CSS custom property', () => {
    const css = ':root { --primary: #ff0000; } .class { color: var(--primary); }';
    const result = resolver.resolveCSSVariable('--primary', mockDocument(css));
    expect(result?.hex).toBe('#ff0000');
  });

  test('should handle fallback values', () => {
    const css = '.class { color: var(--undefined, #00ff00); }';
    const result = resolver.resolveCSSVariable('--undefined', mockDocument(css));
    expect(result?.hex).toBe('#00ff00');
  });
});
```

### 2. Integration Tests

**シナリオ:**
- 複数ファイル間での変数解決
- インポート関係の解析
- リアルタイム更新の動作
- 設定変更時の動作

### 3. Performance Tests

**測定項目:**
- 大きなファイル（10,000行以上）での処理時間
- メモリ使用量
- キャッシュ効率

### 4. Visual Tests

**確認項目:**
- 色チップの正確な色表示
- 位置とサイズの適切性
- 複数の色チップの重複回避

## Implementation Notes

### 動的変更への対処法の実装

#### 1. デフォルト値表示モード
```typescript
// CSS内の初期定義値を使用
const defaultValue = findVariableDefinition(variableName, document);
return defaultValue?.colorValue;
```

#### 2. 計算値表示モード
```typescript
// DOM APIを使用（制限あり）
// 注意: VSCode拡張機能ではDOM APIは利用できないため、
// 代替として設定ファイルやテーマファイルから値を取得
const computedValue = getComputedStyleFromTheme(variableName);
return computedValue;
```

#### 3. 複数値表示モード
```typescript
// 可能性のある全ての値を収集
const possibleValues = [
  getDefaultValue(variableName),
  ...getThemeOverrides(variableName),
  ...getMediaQueryOverrides(variableName)
];
return possibleValues.filter(v => v.isValid);
```

### パフォーマンス最適化

1. **段階的解析**: 表示領域内のみを優先的に解析
2. **インクリメンタル更新**: 変更された部分のみを再解析
3. **ワーカースレッド**: 重い処理を別スレッドで実行
4. **キャッシュ戦略**: LRUキャッシュによる効率的なメモリ使用