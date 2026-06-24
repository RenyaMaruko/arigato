import { useQuery, useMutation } from "@tanstack/react-query";
import type { CreateTipInput } from "@arigato/shared";
import {
  fetchStaffDisplayInfo,
  createTipIntent,
  fetchTipComplete,
} from "../api/tip.api.js";

/**
 * tip feature のサーバー状態フック群（TanStack Query）。
 * Page → Hook → API → Backend の流れに従い、フェッチ・キャッシュ・送信を一手に扱う。
 *
 * 多対多モデル: 識別子は所属（membership＝人×店）。QR が指す membershipId を受ける。
 */

// クエリキーの一元管理（階層構造で無効化しやすくする）。キーは membership 単位
export const tipKeys = {
  all: ["tip"] as const,
  membership: (membershipId: string) => [...tipKeys.all, "membership", membershipId] as const,
  complete: (membershipId: string, tipId: string) =>
    [...tipKeys.all, "complete", membershipId, tipId] as const,
};

/**
 * 投げ銭画面の表示情報（顔写真・名前・店名・一言）を membership から取得するフック。
 */
export function useStaffDisplayInfo(membershipId: string) {
  return useQuery({
    queryKey: tipKeys.membership(membershipId),
    queryFn: () => fetchStaffDisplayInfo(membershipId),
    enabled: Boolean(membershipId),
  });
}

/**
 * 投げ銭を作成（PaymentIntent 作成・client_secret 取得）するミューテーション。
 * 成功すると tipId を含む結果が返り、呼び出し側が完了画面へ遷移する。
 */
export function useCreateTipIntent(membershipId: string) {
  return useMutation({
    mutationFn: (input: CreateTipInput) => createTipIntent(membershipId, input),
  });
}

/**
 * 完了画面の表示情報（誰に・¥◯◯・メッセージ・決済ステータス）を取得するフック。
 *
 * 表示の再掲情報（名前・金額・メッセージ）はサーバーから1回取れば足りる。
 * ただし「後日確定手段（processing）」や「status 無しの直接アクセス」では、サーバー側の
 * tip.status が Webhook で succeeded/failed に確定するのをポーリングで待つ（poll=true のとき）。
 * confirmPayment の即時結果で succeeded が分かっている場合（poll=false）はポーリングしない
 * （永久スピナーを作らない）。残高・着金の確定は引き続き Webhook を正とする。
 */
export function useTipComplete(membershipId: string, tipId: string, poll = true) {
  return useQuery({
    queryKey: tipKeys.complete(membershipId, tipId),
    queryFn: () => fetchTipComplete(membershipId, tipId),
    enabled: Boolean(membershipId) && Boolean(tipId),
    // poll=true かつ pending の間だけ2秒ごとに再取得（Webhook 確定を待つ）。確定したら止める。
    refetchInterval: (query) =>
      poll && query.state.data?.status === "pending" ? 2000 : false,
  });
}
