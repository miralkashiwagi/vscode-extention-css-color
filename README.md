# SCSS Variable Color Chips

CSS/SCSS変数の色値をカラーチップで表示するVSCode拡張機能です。

## 機能

- CSS変数（`--color`）とSCSS変数（`$color`）の色値を視覚化
- ワークスペース全体での変数検索

## 使い方

1. CSS/SCSSファイルを開く
2. 変数の色値が自動的にカラーチップで表示される

```css
/* CSS カスタムプロパティ */
:root {
  --primary-color: #3498db;  
}

.button {
  background-color: var(--primary-color);  /* ← カラーチップが表示される */
}
```

```scss
/* SCSS変数 */
$primary-color: #3498db;

.button {
  background-color: $primary-color;  // ← カラーチップが表示される
}
```

## 設定

主な設定項目：

- `cssVariableColorChips.chipSize` - チップサイズ（small/medium/large）
- `cssVariableColorChips.variableResolutionScope` - 検索範囲（file/workspace）

## 対応ファイル

- CSS (`.css`)
- SCSS (`.scss`) 
- Sass (`.sass`)

## 動作要件

Visual Studio Code 1.99.0 以上

## ライセンス

MIT License
