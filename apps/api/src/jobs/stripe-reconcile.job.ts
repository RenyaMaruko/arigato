import { createTipRepository } from "../features/tip/tip.repository.js";
import { fetchPaymentIntentStatus } from "../infrastructure/stripe/stripe-connect.js";

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
