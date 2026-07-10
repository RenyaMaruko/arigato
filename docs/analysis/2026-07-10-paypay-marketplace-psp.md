# PayPay 対応の実現可能性調査（マーケットプレイス型PSP比較）

調査日: 2026-07-10
背景: Arigato は Stripe Connect（Direct charge）でカード・Apple Pay / Google Pay に対応済みだが、
PayPay は Stripe の Direct charge 非対応のため使えないことが判明。代替手段を調査した。

確度表記: ◎=公式ドキュメントで確認 / ○=公式（LP/FAQ等）/ △=推測・二次情報 / ✕=非対応（公式または不存在確認）

## 結論（要約）

- **「PayPay対応 × Connect相当の分配 × 受取人が非事業者の個人」を1社で満たす国内PSPは公開情報上ゼロ。**
- ボトルネックは PayPay 対応ではなく、(a) 受取人＝非事業者の個人、(b) 投げ銭＝「対価を伴わない金銭授受」という業態（PayPay の禁止商材に明記）。
- **朗報: Stripe 自身が 2025-11-17 に PayPay の Connect 対応（プレビュー）を開始**（`paypay_payments` capability）。
  ただし Direct charge では使えず destination charge 等への部分移行が必要になる公算が高い（PayPal の前例から類推）。
- 現在の構成（各店員が連結アカウント＝資金をプラットフォームが預からない）は投げ銭サービスの適法スキームとして最も筋が良く、
  PayPay のために収納代行型へ後退させるのは資金移動業リスクを自ら背負う本末転倒。

## 1. PSP比較表

| PSP | PayPay対応 | 分配機能（Connect相当） | 個人受取 | 手数料（PayPay） | 主な出典 |
|---|---|---|---|---|---|
| **fincode byGMO** | ◎ 対応 | ◎ プラットフォーム/テナント機能あり。fincodeがテナントへ直接入金、利用料を自動控除 | △ テナントはスタンダード審査＝個人可の見込み。純・非事業者は要確認 | 初期0/月0。物販3.6% / デジタルコンテンツ9.0%（審査で決定） | [platform](https://www.fincode.jp/platform/) [pricing](https://www.fincode.jp/pricing/) [paypay](https://www.fincode.jp/payments/paypay/) |
| **GMO-PG本体** | ◎ 対応 | △ コアに分配機能の公式記述なし（実質fincodeへ誘導） | △ 本体は法人向け | 非公開・見積 | [mulpay/paypay](https://www.gmo-pg.com/service/mulpay/paypay/) |
| **KOMOJU (Degica)** | ◎ 対応 | ◎ Platform Model / Split Payments あり（MoR型寄り） | ✕ 明文で法人/個人事業主のみ | 物販3.5% / デジタル9% ＋販売者管理費 | [platform-model](https://ja.doc.komoju.com/docs/platform-model-overview) [AUP](https://ja.komoju.com/acceptable-use-policy/) |
| **SBPS** | ◎ 対応（リンク型） | ✕ 収納代行のみ | △ 個人事業主可 | 参考 3.45% | [paypay_online](https://www.sbpayment.jp/service/asp/paypay_online/) |
| **UnivaPay** | ◎ 対応 | ✕ 分配機能を確認できず | △ 個人事業主まで | 個別見積（参考 2.8%〜） | [paypay-online](https://univapay.com/service/paypay-online/) |
| **ROBOT PAYMENT** | ○ 対応（UnivaPay提携） | ✕ 収納代行のみ | △ 個人事業主実績あり | 非公開 | [news/70](https://www.robotpayment.co.jp/biz/news/70) |
| **PayPay直接契約** | ◎（加盟店として） | ✕ マーケットプレイス/split機能なし | ○ 個人事業主は加盟店可 | 加盟店料率 | [developers](https://developer.paypay.ne.jp/products/docs/webpayment) [禁止商品](https://paypay.ne.jp/notice-merchant/20181203/323/) |

## 2. 重要な発見

### Stripe の PayPay Connect 対応（◎）

- PayPay 単体は Stripe で GA 済み（日本・JPY・都度決済のみ・50〜1,000,000円）。
- **2025-11-17 changelog「Adds support for PayPay to Accounts」で Connect 連結アカウント経由の PayPay がプレビュー開始**。
  有効化には `paypay_payments` capability、`goods_type`、特商法URL が必要。
  https://docs.stripe.com/changelog/clover/2025-11-17/paypay-connect
- どのチャージタイプで使えるかは公式未確定。PayPal の前例（destination ✓ / separate ✓ / Direct ✕ / on_behalf_of ✕）から
  **Direct charge 非対応の可能性が高い**（実測とも整合）。

### 投げ銭という業態の審査リスク（◎/△）

- PayPay 公式の禁止商品に「寄付行為」「対価を伴わない金銭授受」が明記 → 純粋なチップは直接契約の審査で弾かれるリスク大。
- KOMOJU: AUP で「寄附、募金など対価を伴わないもの」「送金・集金代行」を明文禁止。
- 17LIVE 等のギフティングで PayPay が使えるのは「プラットフォーム自身が加盟店としてポイントを販売する」構成のため。
  個人へ PayPay 資金が直接渡る投げ銭サービスは確認できなかった。

### 法的論点（△・要専門家確認）

- 2020年資金決済法改正で「割り勘アプリ・投げ銭など送金に特化したサービス」は為替取引（資金移動業登録が必要）と整理された。
- 投げ銭の実務上の適法スキームは3つ:
  1. 収納代行型（原因取引＝実在する対価債務が必要。純粋チップは弱い）
  2. 前払式支払手段型（ポイント化＋現金化不可設計）
  3. **各受取人を加盟店化して直接入金（＝現在の Stripe Connect 構成）← 最も安全**
- 参考: [金融庁論点資料](https://www8.cao.go.jp/kisei-kaikaku/kisei/meeting/wg/toushi/20200410/200410toushi05.pdf) /
  [STORIA法律事務所](https://storialaw.jp/blog/5089) / [TOPCOURT](https://topcourt-law.com/new_business/throwing-money-service)

## 3. 推奨

1. **第一候補（推奨）**: Stripe の PayPay Connect 対応（プレビュー→GA）を待つ。
   Stripe サポートに (a) チャージタイプ別サポート (b) GA時期 (c) Direct charge 構成のまま PayPay だけ
   destination charge で併用できるか、を確認する。
2. **第二候補**: fincode byGMO のプラットフォーム機能を PayPay 専用に併用検証。
   要確認: (a) 非事業者の個人がテナント登録可か (b) 投げ銭の手数料区分（3.6% or 9.0%）(c) 資金を預からない整理が可能か。
3. **非推奨**: PayPay 直接契約（分配なし＋禁止商材）、KOMOJU 現行モデル（非事業者不可）、収納代行型への全面移行（資金移動業リスク）。

## 4. 注意事項

- デジタルコンテンツ区分（9%）に投げ銭が該当すると、運営手数料15%の大半が原価に消える。審査時の区分確定が必須。
- PayPay は全社で都度決済のみ（サブスク不可）。
- 法規制の最終整理は金融規制に詳しい弁護士の確認を推奨。
