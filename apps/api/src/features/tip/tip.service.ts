import type {
  CreateTipInput,
  StaffDisplayInfo,
  TipComplete,
  TipIntentResult,
} from "@arigato/shared";
import { buildTipAmounts } from "./tip.model.js";
import type { TipRepository } from "./tip.repository.js";

/**
 * tip feature の Service 層（ユースケースの指揮者・アクセス制御）。
 * Model（金額計算）と Repository（DB）を組み合わせて投げ銭のユースケースを実現する。
 * Repository は引数で受け取り（注入）、feature 同士・外部依存を直接 import しない。
 *
 * 本スプリントは Stripe 本接続を行わず、決済はモック成立（succeeded）として完了画面まで通す。
 */

/**
 * 投げ銭額からそのまま見積もりを返す純粋ユースケース。
 * Sprint 1 から残している疎通用の薄いラッパ。
 */
export function quoteTip(amount: number) {
  return buildTipAmounts(amount);
}

/**
 * 投げ銭画面の表示情報（顔写真・名前・店名・一言）を取得する。
 * 金額・履歴は返さない（横断ルール: 金額は本人のみ閲覧可）。
 */
export async function getStaffDisplayInfo(
  repo: TipRepository,
  staffId: string,
): Promise<StaffDisplayInfo | null> {
  // staff + store を結合して表示情報を取得
  const row = await repo.findStaffDisplay(staffId);
  if (!row) return null;

  // 表示に必要な項目だけに絞って返す
  return {
    staffId: row.staffId,
    displayName: row.displayName,
    headline: row.headline,
    avatarUrl: row.avatarUrl,
    storeName: row.storeName,
  };
}

/**
 * 投げ銭の作成（PaymentIntent 相当）。
 * 金額を Model で計算 → tip を記録する。本スプリントは Stripe を呼ばずモックで決済成立させ、
 * status=succeeded・settlement_status=held（本人確認前提）で確定まで進める。
 */
export async function createTipIntent(
  repo: TipRepository,
  staffId: string,
  input: CreateTipInput,
): Promise<TipIntentResult | null> {
  // 送り先 staff の存在と所属店を確認（送信時点の所属を tip に固定保存するため）
  const staffRow = await repo.findStaffDisplay(staffId);
  if (!staffRow) return null;

  // 金額3点を Model（純粋関数）で算出
  const amounts = buildTipAmounts(input.amount);

  // モック決済を成立させた前提で tip を記録する
  // （Stripe 本接続は次スプリント。ここではダミーの PaymentIntent ID を付与）
  const mockPaymentIntentId = `pi_mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const saved = await repo.insertTip({
    staffId: staffRow.staffId,
    storeId: staffRow.storeId,
    amount: amounts.amount,
    platformFee: amounts.platformFee,
    customerTotal: amounts.customerTotal,
    message: input.message ?? null,
    stamp: input.stamp ?? null,
    // モック決済成立 → 決済は succeeded
    status: "succeeded",
    // 本人確認前に成立した分は保留残高（held）から開始
    settlementStatus: "held",
    stripePaymentIntentId: mockPaymentIntentId,
  });

  return {
    tipId: saved.id,
    status: saved.status,
    amount: saved.amount,
    platformFee: saved.platformFee,
    customerTotal: saved.customerTotal,
  };
}

/**
 * 完了画面の表示情報を取得する。
 * 当該 tip の送金額・メッセージ・スタンプと、送り先店員さんの名前を再掲する。
 * amount は「当該 tip の送金額のみ」を返す（履歴・合算は返さない）。
 */
export async function getTipComplete(
  repo: TipRepository,
  staffId: string,
  tipId: string,
): Promise<TipComplete | null> {
  // tip を ID で取得
  const tip = await repo.findTipById(tipId);
  if (!tip) return null;

  // URL の staffId と tip の staffId が一致しない場合は取り違えとして拒否する
  if (tip.staffId !== staffId) return null;

  // 送り先店員さんの表示名を取得（誰に送ったかの再掲）
  const staffRow = await repo.findStaffDisplay(staffId);
  if (!staffRow) return null;

  return {
    tipId: tip.id,
    staffDisplayName: staffRow.displayName,
    amount: tip.amount,
    message: tip.message,
    stamp: tip.stamp,
  };
}
