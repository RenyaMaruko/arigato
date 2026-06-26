import { createTipRepository } from "../features/tip/tip.repository.js";
import { createStaffRepository } from "../features/staff/staff.repository.js";
import type {
  StaffRepository,
  ReconcileStaffTotals,
} from "../features/staff/staff.repository.js";
import {
  fetchPaymentIntentStatus,
  retrieveConnectBalance,
  sumPaidPayouts,
} from "../infrastructure/stripe/stripe-connect.js";

/**
 * 夜間 Cron 用の Stripe 突合ジョブ。
 *
 * 目的: Webhook の取りこぼし対策（二重化）。
 * Webhook が落ちる・遅延する等で tip.status が pending のまま取り残された決済を、
 * Stripe の PaymentIntent 実ステータスと突合して確定（succeeded / failed）へ寄せる。
 *
 * これは Webhook と同じ「決済の正は Stripe」という原則のもう一つの入口。
 * Direct charge の PaymentIntent は Connected Account 上にあるため、口座 ID を指定して読む。
 *
 * ここはジョブ自身のコンポジションルートでもある（Repository と infrastructure を配線する）。
 * Cron からは `tsx src/jobs/stripe-reconcile.job.ts` で起動できる。
 */

// Stripe の PaymentIntent ステータスを、自前 tip のステータスへ写像する
function mapPaymentIntentStatusToTip(stripeStatus: string): "succeeded" | "failed" | null {
  if (stripeStatus === "succeeded") return "succeeded";
  // 失敗・キャンセル系は failed として確定させる
  if (stripeStatus === "canceled") return "failed";
  // それ以外（requires_payment_method / processing 等）はまだ確定させない
  return null;
}

// 突合の集計結果（ログ・テスト・運用監視に使う）
export type ReconcileSummary = {
  checked: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

/**
 * 突合ジョブの本体。pending な tip を列挙し、Stripe の実ステータスと突合して更新する。
 * 1件のエラーで全体を止めず、件ごとに握って処理を続ける（夜間バッチの耐障害性）。
 */
export async function runStripeReconcile(): Promise<ReconcileSummary> {
  const repo = createTipRepository();
  const summary: ReconcileSummary = { checked: 0, succeeded: 0, failed: 0, skipped: 0 };

  // 決済未確定（pending）かつ PaymentIntent 作成済みの tip を取得
  const pendings = await repo.listPendingTipsForReconcile();

  for (const tip of pendings) {
    summary.checked += 1;
    try {
      // PaymentIntent 方式では tip 作成時点で PaymentIntent ID が確定している。
      // PaymentIntent が無い行（理論上の取りこぼし）はスキップする。
      if (!tip.paymentIntentId) {
        summary.skipped += 1;
        continue;
      }

      // Stripe 側の PaymentIntent ステータスを読む（Connected Account 上にあるため口座 ID 指定）
      const snapshot = await fetchPaymentIntentStatus(
        tip.paymentIntentId,
        tip.connectedAccountId,
      );

      const nextStatus = mapPaymentIntentStatusToTip(snapshot.status);
      if (!nextStatus) {
        // まだ確定していない → スキップ（次回の突合に回す）
        summary.skipped += 1;
        continue;
      }
      // 確定状態へ更新（tipId で確定し、PaymentIntent ID も記録する）
      await repo.updateTipStatusByTipId(tip.tipId, nextStatus, tip.paymentIntentId);
      if (nextStatus === "succeeded") summary.succeeded += 1;
      else summary.failed += 1;
    } catch (err) {
      // 1件の失敗で全体を止めない（ログに残して次へ）
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[reconcile] tip=${tip.tipId} の突合に失敗: ${message}`);
      summary.skipped += 1;
    }
  }

  return summary;
}

/**
 * (e) 日次照合バッチ。
 *
 * 目的: 自前 DB（業務状態＋鏡）と Stripe（残高の真実の源泉）を突き合わせ、差分を検知する点検ジョブ。
 *
 * 設計の肝（全件スキャンしない）:
 *  1. **まず合計レベル**で照合する（店員1人ごと）:
 *     - DB の paid な tip 手取り合計 ＝ Stripe の成立 payout 合計
 *     - DB が想定する未確定残高（held+payable 手取り合計）＝ Stripe の balance(available+pending)
 *  2. 合計がズレた店員、または未確定(pending)tip・進行中 payout を持つ店員「だけ」を差分として報告する。
 *     差分が無ければそれ以上掘り下げない（直近 24〜48h の取引の精査は差分があるときの次段。ここでは件数で示唆する）。
 *  3. 差分はログ／サマリで報告する（アラート相当）。戻り値で差分件数・内訳を返す（テスト可能）。
 *
 * Cron 常時実行は任意（実装はするが初期は動かさなくてよい＝手動起動可能）。
 * 依存（Repository / Stripe）は引数で注入できるようにし、実 DB 無しでもテストできる（4層分離）。
 */

// 1店員分の照合差分（合計レベルのズレ・掘り下げ目安）
export type ReconcileDiff = {
  staffId: string;
  connectedAccountId: string;
  // DB 側の paid 手取り合計 と Stripe 側の成立 payout 合計（円）
  dbPaidTakeTotal: number;
  stripePaidPayoutTotal: number;
  // DB 側の未確定（held+payable）手取り合計 と Stripe 側の balance(available+pending)（円）
  dbUnsettledTakeTotal: number;
  stripeBalanceTotal: number;
  // 進行中 payout 件数・未確定 tip 件数（掘り下げの示唆）
  pendingPayoutCount: number;
  pendingTipCount: number;
  // 差分の理由（payout_total_mismatch / balance_mismatch / has_pending）
  reasons: string[];
  // Stripe 取得に失敗した場合（合計照合できず）
  stripeError: string | null;
};

// 日次照合の集計結果（ログ・テスト・運用監視に使う）
export type DailyReconcileSummary = {
  // 照合した店員数（Connected Account を持つ店員）
  checkedStaff: number;
  // 差分（合計ズレ・未確定あり・Stripe エラー）のあった店員数
  diffStaff: number;
  // 差分の内訳（diffStaff 件分）
  diffs: ReconcileDiff[];
};

// 日次照合の依存（コンポジション。テストではモックを注入する）
export type DailyReconcileDeps = {
  // DB 側の合計を店員ごとに集約する
  listTotals: () => Promise<ReconcileStaffTotals[]>;
  // Stripe の balance(available+pending)（円）を取得する
  getStripeBalanceTotal: (connectedAccountId: string) => Promise<number>;
  // Stripe の成立 payout 合計（円）を取得する
  getStripePaidPayoutTotal: (connectedAccountId: string) => Promise<number>;
};

/**
 * 日次照合の本体（手動起動可能・テスト可能）。
 * 依存を注入できる。省略時は実 DB ＋ 実 Stripe を配線して使う（Cron エントリ・手動起動）。
 */
export async function runDailyReconcile(
  deps?: Partial<DailyReconcileDeps>,
): Promise<DailyReconcileSummary> {
  // 既定の配線（実 DB ＋ 実 Stripe）。テストでは deps を渡して差し替える。
  const staffRepo: StaffRepository = createStaffRepository();
  const resolved: DailyReconcileDeps = {
    listTotals: deps?.listTotals ?? (() => staffRepo.listReconcileTotalsByStaff()),
    getStripeBalanceTotal:
      deps?.getStripeBalanceTotal ??
      (async (accountId) => {
        const balance = await retrieveConnectBalance(accountId);
        // available + pending（負も握りつぶさず合算。Stripe を正とする）
        return balance.availableAmount + balance.pendingAmount;
      }),
    getStripePaidPayoutTotal: deps?.getStripePaidPayoutTotal ?? sumPaidPayouts,
  };

  const summary: DailyReconcileSummary = { checkedStaff: 0, diffStaff: 0, diffs: [] };
  const totals = await resolved.listTotals();

  for (const t of totals) {
    summary.checkedStaff += 1;
    const reasons: string[] = [];
    let stripeError: string | null = null;
    let stripePaidPayoutTotal = 0;
    let stripeBalanceTotal = 0;

    try {
      // 合計レベルで Stripe を取得する（balance・成立 payout 合計）
      stripeBalanceTotal = await resolved.getStripeBalanceTotal(t.connectedAccountId);
      stripePaidPayoutTotal = await resolved.getStripePaidPayoutTotal(t.connectedAccountId);

      // DB の paid 手取り合計 ＝ Stripe の成立 payout 合計（送金済みは銀行へ出た額と一致するはず）
      if (t.paidTakeTotal !== stripePaidPayoutTotal) {
        reasons.push("payout_total_mismatch");
      }
      // DB の未確定（held+payable）手取り合計 ＝ Stripe の balance(available+pending)
      //   受け取ったがまだ送金していない分は Stripe 残高に残るはず（負残高・調整中はズレとして検知する）。
      if (t.unsettledTakeTotal !== stripeBalanceTotal) {
        reasons.push("balance_mismatch");
      }
    } catch (err) {
      // Stripe 取得失敗は合計照合できないため、差分（要確認）として記録する（1件で全体を止めない）
      stripeError = err instanceof Error ? err.message : String(err);
      reasons.push("stripe_error");
    }

    // 未確定（pending）tip・進行中 payout がある店員は掘り下げ対象として示唆する
    if (t.pendingPayoutCount > 0 || t.pendingTipCount > 0) {
      reasons.push("has_pending");
    }

    // 差分があれば内訳に積む（差分が無ければ掘り下げない＝全件精査を避ける）
    if (reasons.length > 0) {
      summary.diffStaff += 1;
      summary.diffs.push({
        staffId: t.staffId,
        connectedAccountId: t.connectedAccountId,
        dbPaidTakeTotal: t.paidTakeTotal,
        stripePaidPayoutTotal,
        dbUnsettledTakeTotal: t.unsettledTakeTotal,
        stripeBalanceTotal,
        pendingPayoutCount: t.pendingPayoutCount,
        pendingTipCount: t.pendingTipCount,
        reasons,
        stripeError,
      });
    }
  }

  return summary;
}

// tsx で直接起動されたとき（Cron エントリ）に実行する。import 時には実行しない。
// （import.meta.url と実行ファイルの URL を比較してエントリ実行かどうかを判定する）
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] != null &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  runStripeReconcile()
    .then((summary) => {
      console.log("[reconcile] 突合完了:", JSON.stringify(summary));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[reconcile] ジョブが異常終了しました:", err);
      process.exit(1);
    });
}
