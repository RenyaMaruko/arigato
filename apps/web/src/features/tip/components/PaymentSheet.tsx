import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { getConnectedStripe } from "../lib/stripe.js";
import { useTipFormStore } from "../stores/tipFormStore.js";
import { PaymentForm } from "./PaymentForm.js";

/**
 * 支払い方法ボトムシート（アプリ内埋め込み決済・deferred intent 方式）。
 *
 * Stripe の deferred intent 方式（現行標準）を採用する:
 *  - Elements は client_secret を使わず `mode: "payment"` ＋ 金額・通貨だけで
 *    ページ表示時点から組み立てる（PaymentIntent はまだ作らない）。
 *  - PaymentIntent（＝ tip 行）は「実際に支払う操作」をした瞬間に初めて作る。
 * こうする理由:
 *  1. ウォレット即表示 — Express Checkout Element（Apple Pay / Google Pay）の
 *     マウント・端末ウォレット判定をページ表示時点で済ませられるため、
 *     「送る」を押した瞬間にウォレットボタンとカードボタンが同時に出る。
 *  2. Stripe の現行標準フロー（submit → intent 作成 → confirmPayment）に一致する。
 *  3. 孤児 intent の削減 — シートを開いただけでは tip 行（pending）が作られず、
 *     支払う操作をした人の分しか intent が残らない。
 *
 * シート自体は常時マウントし、開閉は表示（translate / opacity）だけで切り替える。
 * display:none だと Express Checkout Element がウォレット判定・描画できないため、
 * 閉時も translate-y-full ＋ opacity-0 ＋ pointer-events-none で「画面外だが描画済み」に保つ。
 * 金額（Elements の amount）はフォームストアの選択金額を単一の源とし、変更時は
 * <Elements> の options 更新（react-stripe-js が elements.update を呼ぶ）で追従させる。
 */
type Props = {
  // シートの開閉状態（閉じてもアンマウントしない＝ウォレット判定を温存する）
  open: boolean;
  // Direct charge の課金先 Connected Account（Stripe.js を stripeAccount 指定で初期化するため）
  connectedAccountId: string | null;
  // QR が指す所属（人×店）。確定時の intent 作成と戻り先 URL の組み立てに使う
  membershipId: string;
  // ✕・スクリムで閉じる
  onClose: () => void;
  // 決済が（アプリ内で）成立したときに呼ぶ。confirm 結果の確定区分（succeeded＝即完了 /
  // processing＝結果は後ほど）と、確定時に作成された tipId を渡す。遷移は親が行う
  onPaid: (status: "succeeded" | "processing", tipId: string) => void;
};

// サーバーの PaymentIntent 作成（infrastructure/stripe）と同じ除外手段。
// deferred 方式では Elements 側が表示手段を決めるため、サーバーと同じ除外を指定して
// 「Elements に出るがサーバー PI で使えない」不整合を防ぐ（カード＋ウォレットだけが残る）。
const EXCLUDED_PAYMENT_METHOD_TYPES = ["konbini", "customer_balance"];

export function PaymentSheet({ open, connectedAccountId, membershipId, onClose, onPaid }: Props) {
  const { t } = useTranslation();

  // 選択中の金額（Elements の amount と確定時のサーバー入力の単一の源）
  const amount = useTipFormStore((s) => s.amount);

  // Connected Account コンテキストで Stripe.js を初期化する（口座別キャッシュ・ページ表示時に先読み済み）。
  // 口座が未確定のときは初期化しない（決済 UI を出さない）。
  const stripePromise = useMemo(
    () => (connectedAccountId ? getConnectedStripe(connectedAccountId) : null),
    [connectedAccountId],
  );

  // Elements に渡す金額。「その他の金額」入力中の無効値（null）の間は最後の有効金額を保持し、
  // Elements を壊さない（送信自体は null の間できないため整合は保たれる）。
  const lastValidAmountRef = useRef(amount ?? 300);
  if (amount != null) {
    lastValidAmountRef.current = amount;
  }
  const elementsAmount = amount ?? lastValidAmountRef.current;

  // Elements のオプション（deferred intent 方式: client_secret なしで金額・通貨から組み立てる）。
  // 金額変更時はこの options の変化を react-stripe-js が検知して elements.update({amount}) を呼ぶ。
  // JPY はゼロ小数通貨のため円額をそのまま渡す（サーバー PI の amount と同一単位）。
  const elementsOptions: StripeElementsOptions = useMemo(
    () => ({
      mode: "payment",
      amount: elementsAmount,
      currency: "jpy",
      // サーバー PI と同じ手段除外（表示と確定の整合を取る）
      excludedPaymentMethodTypes: EXCLUDED_PAYMENT_METHOD_TYPES,
      // デザイントークン（rose / ink）に寄せた最小限の外観。詳細は Designer が磨く。
      appearance: {
        theme: "stripe",
        variables: {
          colorPrimary: "#ec3a6d",
          colorText: "#1f2024",
          fontFamily: "system-ui, sans-serif",
          borderRadius: "12px",
        },
      },
    }),
    [elementsAmount],
  );

  return (
    // シート全体をビューポート基準で固定配置する（ドキュメントスクロール方式のため fixed。
    // 中身はアプリ幅 max-w-app に制約して中央へ。fixed のボトムナビ z-30 より上の z-50）。
    // 閉時もアンマウントせず、pointer-events-none で背面操作を妨げない＋支援技術からは隠す。
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-50 flex items-end justify-center ${
        open ? "" : "pointer-events-none"
      }`}
    >
      {/* 背面スクリム（タップで閉じる）。開閉はフェードで切り替える */}
      <button
        type="button"
        aria-label={t("tip.sheetClose")}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 bg-scrim transition-opacity duration-200 ease-out ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* ボトムシート本体（下からせり上がる）。閉時は画面外へ translate するが描画は維持し、
          Express Checkout Element のウォレット判定・描画を閉じたまま済ませておく */}
      <div
        className={`relative max-h-[88%] w-full max-w-app overflow-y-auto rounded-t-2xl bg-page px-6 pb-[34px] pt-[14px] shadow-sheet transition-transform duration-[320ms] ease-[cubic-bezier(.22,1,.36,1)] ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* ドラッグハンドル */}
        <div className="mb-[14px] flex justify-center">
          <span className="h-1 w-[38px] rounded-pill bg-handle" />
        </div>

        {/* タイトル + ✕ */}
        <div className="relative mb-5 flex items-center justify-center">
          <span className="text-token-xl font-bold text-ink">{t("tip.sheetTitle")}</span>
          <button
            type="button"
            aria-label={t("tip.sheetClose")}
            onClick={onClose}
            tabIndex={open ? 0 : -1}
            className="absolute right-0 text-[18px] text-muted"
          >
            ✕
          </button>
        </div>

        {/* 課金先口座が未確定（Stripe 未連携）のときは決済 UI を出せない */}
        {!stripePromise && (
          <div className="py-8 text-center text-token-sm text-rose">{t("tip.payStartError")}</div>
        )}

        {/* deferred intent 方式の Stripe Elements（client_secret なしで常時マウント）。
            PaymentIntent（tip 行）は PaymentForm 内の確定操作で初めて作成される */}
        {stripePromise && (
          <Elements stripe={stripePromise} options={elementsOptions}>
            <PaymentForm
              membershipId={membershipId}
              open={open}
              onPaid={onPaid}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}
