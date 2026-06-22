# GitHub Kingdom Design System

## Overview

GitHub の活動を RPG として可視化するダッシュボード型 Web サービスのデザインシステム。

このサービスは、

- 開発活動をゲームとして楽しむ
- GitHub 人生を王国として可視化する
- SNS でシェアしたくなるビジュアル
- エンジニアが日常的に使いたくなる心地よさ

を目的とする。

---

# Design Philosophy

## Core Concept

> "Clean Dashboard x RPG Fantasy"

ゲームゲームした派手さではなく、
「洗練されたダッシュボードの中に、RPG の温かみが宿っている」を目指す。

---

## UX Principles

### 1. Dashboard First

情報を一目で把握できるレイアウト。

- カードベースの整理された画面構成
- 数値は大きく、ラベルは控えめに
- 最重要情報（キャラクター・活動サマリー）を最上位に

---

### 2. Subtle Fantasy

RPG 感は色とアクセントで表現する。

ユーザーに感じさせるのは、

- 冒険感
- 成長の喜び
- 王国を築いている実感

であり、
「ゲーム画面そのもの」にはしない。

---

### 3. Data is the Hero

GitHub の活動データが主役。

- 貢献グラフ、EXP、レベルを視覚的に強調
- 数値には専用フォント（Outfit）を使い、存在感を出す
- 装飾よりもデータの読みやすさを優先

---

### 4. Professional but Warm

エンジニアが仕事中に開いても恥ずかしくない品格。

- ライトモードベース
- 落ち着いたカラーパレット
- ゴールド / クリームのアクセントで RPG の温かみを加える
- 丸みのあるカード、穏やかなシャドウ

---

# Design Keywords

- clean
- card-based
- light-ui
- warm-gold-accent
- dashboard
- data-driven
- subtle-fantasy
- rpg-warmth
- professional
- growth-visualization

---

# Color System

## Base Colors

| Token | Value | Usage |
|---|---|---|
| Background | #eceef0 | ページ全体の背景 |
| Sidebar | #2c3a49 | サイドバー背景 |
| Card | #ffffff | カード背景 |

---

## Text Colors

| Token | Value | Usage |
|---|---|---|
| Ink | #2c3744 | メインテキスト |
| Ink Soft | #4a5663 | サブテキスト・ラベル |
| Muted | #919ba6 | 補足・非アクティブ |

---

## Accent Colors (RPG Theme)

| Token | Value | Usage |
|---|---|---|
| Cream | #b89a5e | RPG ゴールドアクセント（メインアクセント） |
| Cream Soft | #f7f1e3 | ゴールド系ボタン背景 |
| Cream Line | #e3d3a8 | ゴールド系ボーダー |

---

## Functional Colors

| Token | Value | Usage |
|---|---|---|
| Green | #3a9d52 | 成功・EXP 獲得・成長表示 |
| Green Soft | #eaf5ec | 成功系の背景 |
| Flame | #e2883a | 連続記録・オレンジ系アクセント |
| Highlight BG | #e7f1fb | ハイライト背景（自分のランキング等） |
| Highlight Line | #bcd9f3 | ハイライトボーダー |

---

## EXP Bar Gradient

| Token | Value | Usage |
|---|---|---|
| EXP Start | #5aa6cf | EXP バーのグラデーション開始（青） |
| EXP End | #69b98f | EXP バーのグラデーション終了（緑） |

---

## Activity Icon Colors

| Token | Value | Usage |
|---|---|---|
| Commit | #4a8fd6 | コミット関連アイコン背景 |
| PR | #e2883a | Pull Request 関連アイコン背景 |
| Issue | #c9a23f | Issue 関連アイコン背景 |
| Review | #7d8a97 | レビュー関連アイコン背景 |

---

## Stat Colors

| Token | Value | Usage |
|---|---|---|
| HP | #e0556b | HP ステータス |
| Attack | #5a6b7a | 攻撃力ステータス |
| Intelligence | #5a8fd0 | 知力ステータス |
| Dexterity | #cf9a3f | 器用さステータス |
| Luck | #5aa06a | 運ステータス |

---

## Border Colors

| Token | Value | Usage |
|---|---|---|
| Line | #e9ebee | 標準ボーダー |
| Line Soft | #f1f2f4 | 軽いボーダー |

---

## Overlay Colors

モーダル・ダイアログの背面に敷く幕。暗い暗幕で前面を「発光」させず、ライトUIに馴染む暖色（クリーム寄り）の柔らかいトーンにする。

| Token | Value | Usage |
|---|---|---|
| Overlay | rgba(60, 50, 36, 0.28) | モーダル/ダイアログのオーバーレイ（暖色・柔らかい半透明） |

---

## Sidebar Colors

| Token | Value | Usage |
|---|---|---|
| Sidebar BG | #2c3a49 | サイドバー背景 |
| Sidebar Text | #cfd8e1 | サイドバー標準テキスト |
| Sidebar Text Active | #e6edf3 | サイドバーホバー・アクティブテキスト |
| Sidebar Text Muted | #aeb9c4 | サイドバーナビリンク |
| Sidebar Hover | #36465a | サイドバーホバー背景 |
| Sidebar Active BG | #e9edf1 | サイドバーアクティブ項目背景 |
| Sidebar Active Text | #26323e | サイドバーアクティブ項目テキスト |
| Sidebar Border | #3a4a5b | サイドバー内ボーダー |

---

## Contribution Graph Colors

| Level | Value | Usage |
|---|---|---|
| Level 0 | #ebedf0 | 活動なし |
| Level 1 | #c9e7cc | 少量 |
| Level 2 | #9bd3a0 | 中量 |
| Level 3 | #62b76e | 多め |
| Level 4 | #2f9244 | 最大 |

---

## Ranking Colors

| Token | Value | Usage |
|---|---|---|
| Gold | #d9a93a | 1位 |
| Silver | #9aa6b2 | 2位 |
| Bronze | #c08a52 | 3位 |

---

# Typography

## Font Family

### Primary (UI)

- Noto Sans JP
- system-ui
- sans-serif

### Numeric

- Outfit
- Noto Sans JP
- sans-serif

数値表示には `font-feature-settings: "tnum"` を適用し、等幅数字にする。

---

## Font Sizes

| Token | Size | Usage |
|---|---|---|
| XS | 10.5px | 曜日ラベル・月ラベル |
| SM | 11px | タイムスタンプ・補足テキスト |
| Base | 13px | 標準テキスト・ナビ・カードタイトル |
| MD | 14px | サイドバーナビ・ボタンラベル |
| LG | 15px | ブランドロゴテキスト |
| XL | 18px | フィーチャーカード見出し |
| 2XL | 23px | ダッシュボード見出し |
| 3XL | 26px | 活動サマリー数値 |
| 4XL | 34px | レベル数値（メイン） |

---

## Font Weight

| Token | Weight | Usage |
|---|---|---|
| Normal | 400 | 本文 |
| Medium | 500 | ナビリンク・サブテキスト |
| Bold | 700 | カードタイトル・ボタン・ラベル |
| Black | 900 | 見出し・数値・レベル表示 |

---

## Line Height

- 本文: 1.45
- 見出し・ラベル: 1.2

---

# Spacing System

| Token | Size | Usage |
|---|---|---|
| Space 1 | 3px | セル間・最小ギャップ |
| Space 2 | 6px | アイコンとテキスト間 |
| Space 3 | 9px | リスト項目間・ステータス行間 |
| Space 4 | 12px | カード内セクション間・グリッドギャップ |
| Space 5 | 14px | ボタン内パディング |
| Space 6 | 16px | サイドバーパディング |
| Space 7 | 18px | カードパディング・カード間ギャップ |
| Space 8 | 20px | パネルパディング |
| Space 9 | 22px | ダッシュボードパディング |
| Space 10 | 24px | ダッシュボード左右パディング |

---

# Radius System

| Token | Value | Usage |
|---|---|---|
| XS | 2.5px | 貢献グラフセル |
| SM | 7px | タブ内ボタン |
| MD | 9px | ボタン・サブカード・タブグループ |
| LG | 11px | サマリーカード・建物画像・ポートレート |
| XL | 14px | 標準カード |
| 2XL | 18px | メインパネル・フローセクション |
| Full | 50% | アバター（丸） |

---

# Shadow System

## Card Shadow

```
0 1px 2px rgba(28, 40, 52, 0.05),
0 6px 20px rgba(28, 40, 52, 0.05)
```

穏やかな浮き上がり。カード全般に使用。
RPG 的な重厚さではなく、クリーンな浮遊感を意識する。

---

## Active Nav Shadow

```
0 2px 8px rgba(0, 0, 0, 0.18)
```

サイドバーのアクティブ項目に使用。

---

## Hover Shadow

```
0 4px 14px rgba(0, 0, 0, 0.14)
```

クイックアクションカード等のホバー時に使用。

---

# Layout System

## Overall Structure

```
+-----------------------------------------------+
| +----------+--------------------------------+  |
| |          |                                |  |
| | Sidebar  |  Dashboard Content             |  |
| | (236px)  |                                |  |
| |          |                                |  |
| +----------+--------------------------------+  |
|                                                |
| +------+------+------+------+------+           |
| | Feat | Feat | Feat | Feat | Feat |           |
| +------+------+------+------+------+           |
|                                                |
| +--------------------------------------------+ |
| |  Game Flow                                 | |
| +--------------------------------------------+ |
+-----------------------------------------------+
```

- 最大幅: 1320px
- サイドバー幅: 236px
- ダッシュボード内: キャラカード(300px) + 右カラム(1fr)
- フィーチャー行: 5 カラム均等

---

## Grid Gaps

| Location | Gap |
|---|---|
| メインラップ | 18px |
| ダッシュボードグリッド | 18px |
| サマリーグリッド | 12px |
| フィーチャーカード行 | 16px |
| 貢献グラフセル | 3px |

---

# Component Patterns

## Card

全コンテンツの基本単位。

- 背景: #ffffff
- ボーダー: 1px solid #e9ebee
- 角丸: 14px
- パディング: 18px
- シャドウ: Card Shadow

---

## Card Title

カード内の見出し。

- サイズ: 13px
- ウェイト: 700
- 色: #4a5663 (Ink Soft)
- レタースペーシング: 0.3px

---

## Button (Cream)

RPG テーマのプライマリアクションボタン。

- ボーダー: 1px solid #e3d3a8
- 背景: #f7f1e3
- テキスト: #876f38
- サイズ: 13px
- ウェイト: 700
- 角丸: 9px
- ホバー: 背景 #f1e8d2

---

## Button (Line)

カード内のセカンダリアクション。

- ボーダー: 1px solid #e3d3a8
- 背景: #ffffff
- テキスト: #8a7338
- 幅: 100%
- 角丸: 10px
- ホバー: 背景 #f7f1e3

---

## EXP Bar

経験値の進捗バー。

- 高さ: 8px
- 背景: #eef0f2
- 角丸: 6px
- バー: linear-gradient(90deg, #5aa6cf, #69b98f)

---

## Sidebar Navigation

- リンクパディング: 10px 12px
- 角丸: 10px
- アイコンサイズ: 18px
- ホバー: 背景 #36465a / テキスト #e6edf3
- アクティブ: 背景 #e9edf1 / テキスト #26323e / ウェイト 700

---

## Stat Row

キャラクターステータスの1行。

- アイコン: 17px
- テキスト: 13px / Ink Soft
- 数値: 右寄せ / Bold
- 行間ギャップ: 9px

---

## Activity Summary Card

GitHub 活動のサマリー表示。

- 4 カラムグリッド
- アイコン: 26px 角丸 8px 白アイコン + カラー背景
- 数値: 26px / Black (900)
- EXP 表示: 12px / Bold / Green

---

## Ranking Row

- パディング: 8px 9px
- 角丸: 9px
- ランク: 20px 幅 / 中央揃え / Black
- アバター: 26px / 丸
- 自分の行: 背景 #e7f1fb / ボーダー #bcd9f3

---

## Placeholder Art

画像プレースホルダーのスタイル。

- 背景: #eef0f2
- パターン: 斜線ストライプ (45deg, #e6e9ec / #eef1f4)
- テキスト: 9.5px / Outfit / #a7afb8
- ボーダー: 1px solid #e2e6ea

---

# Motion Design

## Principles

- クリーンで機能的なアニメーション
- RPG 演出は控えめに
- データ更新時はスムーズなトランジション
- 過剰なバウンス禁止

---

## Timing

| Type | Duration | Usage |
|---|---|---|
| Fast | 150ms | ホバー・ボタンフィードバック |
| Normal | 250ms | トランジション全般 |
| Slow | 600ms | リフレッシュアイコン回転 |

---

# Interaction Rules

## Refresh Button

更新ボタン押下時にアイコンが 360 度回転する。

- duration: 600ms
- easing: ease

---

## Tab Switching

タブ切り替えは即時。
アクティブ状態は背景色 + シャドウで表現。

---

## Hover States

- ナビリンク: 背景色変更 + テキスト色変更
- カード内ボタン: 背景色がクリーム系に変化
- クイックアクションカード: シャドウ強化

---

# Final Experience Goal

ユーザーに感じさせるべきなのは、

「ゲームをプレイしている」

ではなく、

> "毎日の開発を続けていたら、
> いつのまにか自分だけの王国ができていた"

という体験。
