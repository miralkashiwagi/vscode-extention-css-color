# Requirements Document

## Introduction

VSCode拡張機能として、CSSカスタムプロパティ（CSS変数）とSCSS変数を使用している箇所でも色のチップを表示する機能を開発します。従来のColor Info拡張機能では直接的な色値（#ffffff、rgb()など）のみに色チップが表示されますが、この拡張機能では変数を通じて色が定義・使用されている場合でも適切な色チップを表示します。

## Requirements

### Requirement 1

**User Story:** 開発者として、CSSカスタムプロパティの定義部分で色チップを確認したい。そうすることで、変数に割り当てられた色を視覚的に把握できる。

#### Acceptance Criteria

1. WHEN CSSファイル内で `--color-primary: #ffffff;` のような形式でカスタムプロパティが定義されている THEN システムは色値の横に色チップを表示する SHALL
2. WHEN カスタムプロパティの値が有効な色形式（hex、rgb、rgba、hsl、hsla、色名）である THEN システムは対応する色チップを表示する SHALL
3. WHEN カスタムプロパティの値が無効な色形式である THEN システムは色チップを表示しない SHALL

### Requirement 2

**User Story:** 開発者として、CSSカスタムプロパティを使用している箇所で色チップを確認したい。そうすることで、実際に適用される色を視覚的に把握できる。

#### Acceptance Criteria

1. WHEN CSSファイル内で `color: var(--color-primary)` のような形式でカスタムプロパティが使用されている THEN システムは変数名の横に解決された色の色チップを表示する SHALL
2. WHEN `color: var(--color-primary, #000)` のようにフォールバック値が指定されている THEN システムは変数名とフォールバック値の両方に色チップを表示する SHALL
3. WHEN 変数が定義されていない場合 THEN システムはフォールバック値のみに色チップを表示する SHALL
4. WHEN 変数もフォールバック値も解決できない場合 THEN システムは色チップを表示しない SHALL

### Requirement 3

**User Story:** 開発者として、SCSS変数の定義部分で色チップを確認したい。そうすることで、変数に割り当てられた色を視覚的に把握できる。

#### Acceptance Criteria

1. WHEN SCSSファイル内で `$color-primary: #ffffff;` のような形式で変数が定義されている THEN システムは色値の横に色チップを表示する SHALL
2. WHEN SCSS変数の値が有効な色形式である THEN システムは対応する色チップを表示する SHALL
3. WHEN SCSS変数の値が他の変数を参照している場合 THEN システムは最終的に解決された色の色チップを表示する SHALL

### Requirement 4

**User Story:** 開発者として、SCSS変数を使用している箇所で色チップを確認したい。そうすることで、実際に適用される色を視覚的に把握できる。

#### Acceptance Criteria

1. WHEN SCSSファイル内で `color: $color-primary;` のような形式で変数が使用されている THEN システムは変数名の横に解決された色の色チップを表示する SHALL
2. WHEN 変数が定義されていない場合 THEN システムは色チップを表示しない SHALL
3. WHEN 変数が他のファイルで定義されている場合 THEN システムはインポート関係を解析して色を解決する SHALL

### Requirement 5

**User Story:** 開発者として、動的に変更される可能性のあるカスタムプロパティに対する適切な対処法を知りたい。そうすることで、プロジェクトの状況に応じて最適な表示方法を選択できる。

#### Acceptance Criteria

1. WHEN カスタムプロパティがJavaScriptで動的に変更される可能性がある THEN システムは複数の対処法オプションを提供する SHALL
2. WHEN 設定で「デフォルト値表示モード」が選択されている THEN システムはCSS内で定義された初期値の色チップを表示する SHALL
3. WHEN 設定で「計算値表示モード」が選択されている THEN システムは現在のDOM状態から計算された値の色チップを表示する SHALL
4. WHEN 設定で「複数値表示モード」が選択されている THEN システムは可能性のある複数の色値を並べて表示する SHALL
5. WHEN 変数の値が解決できない場合 THEN システムは「未解決」を示すインジケーターを表示する SHALL

### Requirement 6

**User Story:** 開発者として、拡張機能の動作を自分のプロジェクトに合わせてカスタマイズしたい。そうすることで、プロジェクトの特性に応じた最適な表示を得られる。

#### Acceptance Criteria

1. WHEN 拡張機能の設定画面を開く THEN システムは色チップ表示に関する設定オプションを提供する SHALL
2. WHEN ファイルタイプごとの有効/無効設定が変更される THEN システムは該当するファイルタイプでのみ機能を動作させる SHALL
3. WHEN 変数解決の範囲設定が変更される THEN システムは指定された範囲（現在のファイルのみ、プロジェクト全体など）で変数を解決する SHALL
4. WHEN 色チップのサイズや位置設定が変更される THEN システムは指定されたスタイルで色チップを表示する SHALL