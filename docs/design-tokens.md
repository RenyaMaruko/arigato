# Arigato Design System

## Overview

接客現場で、お客さまが店員さん個人に少額の「ありがとう（投げ銭）」を送る Web サービスのデザインシステム。

このサービスは、

- 「ありがとう」の気持ちを、迷わずその場で送れる
- 知らない QR を読んでも怖くない、安心できる決済体験
- 金額ではなく「感謝」が主役に見えるビジュアル
- スマホで完結する、アプリのような心地よさ

を目的とする。

> トークン値はお客さま画面モック（`/docs/design-references/tip/`）から抽出したものを正とする。

---

# Design Philosophy

## Core Concept

> "Warm Thanks on Clean White"

清潔な白の上に、感謝を表すローズの温かみを一点だけ効かせる。
派手な装飾ではなく、「気持ちを送る」という行為そのものを主役にする。

---

## UX Principles

### 1. Don't Make Them Think

お客さまを悩ませない。

- 金額は定額ボタンで即決（¥100 / ¥300 / ¥500）
- メッセージは任意（送る障壁にしない）
- 決済は Apple Pay / Google Pay を最優先で大きく置く
- 1画面1カラム、上から下へ迷わず進める

---

### 2. Trust by Cleanliness

白ベースで清潔感を出し、初見の QR 決済でも安心させる。

- 背景は白、カードもボーダーは細く控えめ
- 「🔒 安全な決済で、満額が届きます」を決済前に必ず添える
- 派手な色面は使わず、アクセントはローズ一色に絞る

---

### 3. Gratitude is the Hero

主役は金額ではなく「ありがとう」。

- 完了画面は「ありがとうを届けました！」を最も大きく見せる
- 誰に・いくら・どのメッセージで送ったかを完了画面に再掲する
- 一言メッセージで感情を添えられる

---

### 4. Mobile App, Not a Web Page

Web だがスマホアプリのように見せる。

- 最大幅 430px で中央に1カラム固定
- ステータスバー風の上部、ボトムシート決済などアプリの作法を使う
- PC でも横に広げず、スマホ枠の中で完結させる（対応端末方針は要件定義書 2.5）

---

# Design Keywords

- clean-white
- warm-rose-accent
- mobile-first
- single-column
- thanks-over-amount
- frictionless-payment
- app-like
- trustworthy
- emotional
- minimal-decoration

---

# Color System

## Base Colors

| Token | Value | Usage |
|---|---|---|
| App BG | #e9e9ec | 端末枠の外側背景（スマホ枠の地） |
| Page | #ffffff | ページ・カードの背景 |
| Surface Subtle | #fcfcfd | 控えめなカード背景（完了画面のメッセージ枠など） |

---

## Text Colors

| Token | Value | Usage |
|---|---|---|
| Ink | #1f2024 | メインテキスト（店員名・本文・ボタン文字） |
| Ink Label | #3a3c42 | セクションラベル（「金額を選ぶ」等） |
| Ink Sub | #8b8e96 | サブテキスト（店名「カフェ Arigato」等） |
| Muted | #9a9da4 | 補足・「（任意）」・注釈 |
| Muted Soft | #b6b9c0 | 文字カウンター等の最も淡い補足 |
| Lang | #6b6e76 | 言語切替ラベル |
| Status | #111111 | ステータスバー（時刻・アイコン） |

---

## Accent Colors (Rose)

| Token | Value | Usage |
|---|---|---|
| Rose | #ec3a6d | メインアクセント（送るボタン・選択中・チェック・見出し強調） |
| Rose Soft | #fde8ee | ローズ系の淡い面（ボタン背景・ハイライト） |
| Rose Spark | #f7a8c4 | 完了アニメーションの輝き（装飾） |

---

## Payment Colors

| Token | Value | Usage |
|---|---|---|
| Apple Pay | #000000 | Apple Pay ボタン背景（最優先表示） |
| Google Blue | #4285F4 | Google Pay の「G」マーク |

---

## Border Colors

| Token | Value | Usage |
|---|---|---|
| Line | #e6e7ea | 標準ボーダー（カード・入力枠・セカンダリボタン、1.5px） |
| Line Soft | #ededf0 | 軽い区切り線・淡いボーダー |
| Handle | #e2e3e7 | ボトムシートのドラッグハンドル |

---

## Overlay Colors

モーダル・ボトムシートの背面に敷く幕。

| Token | Value | Usage |
|---|---|---|
| Scrim | rgba(20, 20, 30, 0.18) | ボトムシート背面のスクリム（柔らかい半透明） |

---

# Typography

## Font Family

### Primary (UI)

- Noto Sans JP
- sans-serif

ウェイトは 400 / 500 / 600 / 700 を使用。

---

## Font Sizes

| Token | Size | Usage |
|---|---|---|
| XS | 11px | 文字カウンター・注釈（「🔒 安全な決済…」） |
| SM | 12px | ステータスアイコン・「または」区切り |
| Base | 13px | セクションラベル・言語切替 |
| MD | 14px | 本文・店名・「さん」・メッセージ |
| LG | 15px | ボタンラベル・金額ボタン・時刻 |
| XL | 16px | ボトムシート見出し・Apple Pay ラベル |
| 2XL | 17px | 完了画面のサブ文（「¥300 を届けました」） |
| 3XL | 21px | 店員さんの名前 |
| 4XL | 27px | 完了見出し（「ありがとうを届けました！」） |
| Display | 52px | 完了チェックマーク |

---

## Font Weight

| Token | Weight | Usage |
|---|---|---|
| Normal | 400 | 本文・「（任意）」 |
| Medium | 500 | 補助 |
| Semibold | 600 | ボタン・店員名以外の強め文字・時刻 |
| Bold | 700 | 見出し・店員名・主ボタン・ラベル |

---

## Line Height

- 本文: 1.6 〜 1.8（メッセージ・完了サブ文）
- 見出し: 1.4

---

# Spacing System

| Token | Size | Usage |
|---|---|---|
| Space 1 | 4px | 名前と店名の最小ギャップ |
| Space 2 | 6px | アイコン間・微調整 |
| Space 3 | 8px | スクロール領域の上パディング |
| Space 4 | 11px | 主ボタン間ギャップ |
| Space 5 | 12px | 金額ボタン間・要素間ギャップ |
| Space 6 | 14px | ボタン内ギャップ・要素間 |
| Space 7 | 16px | ボタン縦パディング・節目の余白 |
| Space 8 | 22px | セクション間（中） |
| Space 9 | 24px | 画面左右パディング |
| Space 10 | 30px | セクション間（大・「金額を選ぶ」前など） |

---

# Radius System

| Token | Value | Usage |
|---|---|---|
| SM | 3px | ステータスバーのバッテリー等 |
| MD | 12px | 金額ボタン |
| LG | 13px | メッセージ入力枠 |
| XL | 14px | 主ボタン・セカンダリボタン・カード |
| 2XL | 26px | ボトムシート上端 |
| Pill | 99px | ドラッグハンドル |
| Full | 50% | 顔写真アバター（丸） |

---

# Shadow System

## Phone Frame

```
0 0 50px rgba(20, 20, 40, 0.1)
```

スマホ枠（最大幅 430px の白いコンテナ）を地から浮かせる。

---

## Bottom Sheet

```
0 -10px 40px rgba(20, 20, 40, 0.16)
```

決済ボトムシートを下から持ち上げる影。

---

# Layout System

## Overall Structure

```
+----------------------------+
|  status bar (9:41 / icons) |
+----------------------------+
|        🌐 日本語 ⌄          |
|                            |
|        ( avatar 120 )      |
|        山田 さくら さん      |
|        カフェ Arigato       |
|                            |
|  金額を選ぶ                 |
|  [¥100][¥300][¥500]        |
|                            |
|  メッセージを添える（任意）   |
|  [ textarea ]              |
|                            |
|  [   Pay で送る   ]         |
|  [ G Pay で送る  ]          |
|  🔒 安全な決済で、満額が届きます|
+----------------------------+
```

- 最大幅: 430px（中央寄せ・1カラム固定）
- 端末枠の外: #e9e9ec / 枠内: #ffffff
- 画面左右パディング: 24px
- ボタン縦パディング: 16〜17px

---

# Component Patterns

## Amount Button

金額の定額ボタン（横3分割）。

- パディング: 13px 0
- ボーダー: 1.5px solid #e6e7ea / 角丸 12px
- テキスト: 15px / Semibold / #1f2024
- 選択中: 背景 #ec3a6d / ボーダー #ec3a6d / テキスト #fff / Bold

---

## Message Input

メッセージ入力枠。

- ボーダー: 1.5px solid #e6e7ea / 角丸 13px
- パディング: 13px 14px / 最小高さ 74px
- テキスト: 14px / line-height 1.6
- カウンター: 右下に 11px / #b6b9c0（例: 20/80）

---

## Primary Button (Send)

「○○ で送る」「もう一度送る」の主アクション。

- 背景: #ec3a6d / 角丸 14px
- パディング: 16px 0
- テキスト: 15px / Bold / #fff
- 横幅 100%

---

## Secondary Button

「閉じる」「G Pay で送る」等のセカンダリ。

- 背景: #fff / ボーダー 1.5px solid #e6e7ea / 角丸 14px
- パディング: 16px 0
- テキスト: 15px / Semibold / #1f2024

---

## Apple Pay Button

決済シートの最優先ボタン。

- 背景: #000 / 角丸 14px
- パディング: 17px 0
- テキスト: 16px / Semibold / #fff

---

## Bottom Sheet

支払い方法選択のボトムシート。

- 背景: #fff / 角丸 26px 26px 0 0
- パディング: 14px 24px 34px
- ドラッグハンドル: 38px × 4px / #e2e3e7 / pill
- 背面スクリム: rgba(20,20,30,.18)

---

## Avatar

店員さんの顔写真。

- サイズ: 120px / 円（border-radius 50%）
- 中央配置

---

## Success Mark

完了画面のチェック。

- 円: 108px / 背景 #ec3a6d
- チェック: 52px / Bold / #fff
- 周囲に #f7a8c4 の輝き（装飾）

---

# Motion Design

## Principles

- 感謝が「届いた」瞬間を気持ちよく演出する
- ただし過剰なバウンスは避け、上品に
- 画面遷移・シート表示はスムーズに

---

## Keyframes

| Name | Duration / Easing | Usage |
|---|---|---|
| sheetUp | 0.32s cubic-bezier(.22,1,.36,1) | ボトムシートが下からせり上がる |
| pop | 0.5s cubic-bezier(.22,1,.36,1) | 完了チェックが弾けて出る（scale .4→1.08→1） |
| spark | 0.5s（遅延 .35〜.55s） | チェック周囲の輝きが順に現れる |

---

# Interaction Rules

## Amount Selection

定額ボタンは即時選択。選択中はローズ塗り（#ec3a6d / 白文字）で表現する。

---

## Payment Sheet

決済ボタン押下でボトムシートが下からせり上がる（sheetUp）。背面はスクリムで暗くし、スクリムタップ・✕ で閉じる。

---

# Final Experience Goal

お客さまに感じさせるべきなのは、

「決済をした」

ではなく、

> "良い接客だったから、
> 気持ちをその場でちゃんと届けられた"

という、後味のよい体験。
