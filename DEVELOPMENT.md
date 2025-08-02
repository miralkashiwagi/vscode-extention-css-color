# Development Guide

SCSS Variable Color Chips拡張機能の開発者向けドキュメントです。

## 🏗️ アーキテクチャ

### コアコンポーネント

```
src/
├── extension.ts              # 拡張機能のエントリーポイント
├── colorChipManager.ts       # メインコントローラー
├── realtimeUpdater.ts        # リアルタイム更新処理
├── decorationProvider.ts     # カラーチップの描画
├── variableResolver.ts       # 変数解決エンジン
├── cssParser.ts             # CSS構文解析
├── scssParser.ts            # SCSS構文解析
├── dynamicModeHandler.ts    # 動的表示モード処理
├── settingsManager.ts       # 設定管理
├── cacheManager.ts          # キャッシュ管理
├── fileWatcher.ts           # ファイル監視
├── incrementalAnalyzer.ts   # 段階的解析
├── errorHandler.ts          # エラーハンドリング
├── logger.ts                # ログ機能
├── interfaces.ts            # インターフェース定義
└── types.ts                 # 型定義
```

### データフロー

```
ファイル変更 → FileWatcher → RealtimeUpdater → IncrementalAnalyzer
                                    ↓
ColorChipManager ← DecorationProvider ← VariableResolver
                                    ↓
                              DynamicModeHandler
```

## 🔧 開発環境のセットアップ

### 必要な環境
- Node.js 18.x以上
- npm 9.x以上
- Visual Studio Code 1.99.0以上

### インストール

```bash
# 依存関係のインストール
npm install

# 開発用ビルド
npm run compile

# ウォッチモード
npm run watch
```

### デバッグ

1. VS Codeで`F5`を押してExtension Development Hostを起動
2. 新しいウィンドウでCSS/SCSSファイルを開く
3. カラーチップが表示されることを確認

## 🧪 テスト

### テストの実行

```bash
# 全テストの実行
npm test

# テストのコンパイル
npm run compile-tests

# テストのウォッチモード
npm run watch-tests
```

### テストファイル構成

```
src/test/
├── colorValue.test.ts           # 色値処理のテスト
├── cssParser.test.ts            # CSS構文解析のテスト
├── scssParser.test.ts           # SCSS構文解析のテスト
├── variableResolver.test.ts     # 変数解決のテスト
├── decorationProvider.test.ts   # デコレーション作成のテスト
├── settingsManager.test.ts      # 設定管理のテスト
├── cacheManager.test.ts         # キャッシュ管理のテスト
├── fileWatcher.test.ts          # ファイル監視のテスト
├── dynamicModeHandler.test.ts   # 動的モードのテスト
└── realtimeUpdater.test.ts      # リアルタイム更新のテスト
```

## 📦 ビルドとパッケージング

### 開発ビルド
```bash
npm run compile
```

### プロダクションビルド
```bash
npm run package
```

### VSIXパッケージの作成
```bash
# vsce のインストール（初回のみ）
npm install -g vsce

# パッケージの作成
vsce package
```

## 🔍 コード構造の詳細

### 1. ColorChipManager
拡張機能の中心となるコントローラー。全コンポーネントを協調制御します。

```typescript
class ColorChipManagerImpl {
  // 初期化とコンポーネント連携
  activate(context: vscode.ExtensionContext): void
  
  // 設定変更の処理
  private handleSettingsChange(): void
  
  // ドキュメントの更新処理
  refreshDocument(document: vscode.TextDocument): void
}
```

### 2. VariableResolver
CSS/SCSS変数の解決を行うエンジン。

```typescript
class VariableResolverImpl {
  // CSS変数の解決
  async resolveCSSVariable(name: string, doc: TextDocument): Promise<ColorValue | null>
  
  // SCSS変数の解決
  async resolveSCSSVariable(name: string, doc: TextDocument): Promise<ColorValue | null>
  
  // ワークスペース全体での検索
  private async resolveFromWorkspace(name: string, doc: TextDocument): Promise<ColorValue | null>
}
```

### 3. DecorationProvider
VSCode Decoration APIを使用してカラーチップを描画。

```typescript
class DecorationProviderImpl {
  // 基本的なカラーチップの作成
  createColorChip(color: ColorValue, range: Range): DecorationOptions
  
  // 変数用カラーチップの作成
  createVariableColorChip(name: string, color: ColorValue, range: Range): DecorationOptions
  
  // 複数色チップの作成
  createMultipleColorChips(colors: ColorValue[], range: Range): DecorationOptions
}
```

## ⚡ パフォーマンス最適化

### 1. キャッシュ戦略
- **LRUキャッシュ**: 解析結果をメモリに保存
- **ドキュメントレベルキャッシュ**: ファイル単位でのキャッシュ
- **変数解決キャッシュ**: 変数名と解決結果のマッピング

### 2. 段階的処理
- **可視領域優先**: 表示されている部分を最初に処理
- **バックグラウンド処理**: 残りの部分を非同期で処理
- **インクリメンタル解析**: 変更差分のみを再解析

### 3. 大規模ファイル対応
- **ファイルサイズ制限**: 100KB以上のファイルはスキップ
- **タイムアウト処理**: 長時間の処理を防止
- **適応的デバウンス**: ファイルサイズに応じた遅延調整

## 🐛 デバッグとトラブルシューティング

### デバッグログの有効化
```json
{
  "cssVariableColorChips.enableDebugLogging": true
}
```

### よくある問題

#### 1. カラーチップが表示されない
- 拡張機能が有効になっているか確認
- 対象ファイルタイプが設定に含まれているか確認
- 変数の値が有効な色値かどうか確認

#### 2. パフォーマンスが遅い
- `debounceDelay` を大きな値に設定
- `variableResolutionScope` を `"file"` に変更
- 不要なファイルタイプを設定から除外

#### 3. 変数が解決されない
- インポートパスが正しいか確認
- 変数名にタイポがないか確認
- ワークスペース設定を確認


## 📄 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照してください。