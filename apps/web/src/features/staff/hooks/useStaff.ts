import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateStaffProfileInput,
  UpdateStaffProfileInput,
} from "@arigato/shared";
import {
  fetchStaffMe,
  createStaffProfile,
  joinStore,
  updateStaffProfile,
  fetchInviteInfo,
  fetchStaffTips,
  fetchStaffBalance,
  startConnectOnboard,
  createPayout,
  fetchPayouts,
} from "../api/staff.api.js";

/**
 * staff feature のサーバー状態フック（TanStack Query）。
 * Page → Hook → API → Backend の流れに従い、フェッチ・キャッシュ・無効化を扱う。
 */

// クエリキー
const STAFF_ME_KEY = ["staff", "me"] as const;

/**
 * 自分のプロフィール（GET /staff/me）を取得する。
 * enabled でログイン済みのときだけ走らせる。未作成は data=null（作成へ誘導）。
 */
export function useStaffMe(enabled: boolean) {
  return useQuery({
    queryKey: STAFF_ME_KEY,
    queryFn: fetchStaffMe,
    enabled,
    // 認証エラー等のリトライは最小限に
    retry: false,
  });
}

/**
 * 招待コードを検証する（GET /invites/:code）。
 * コードが空のときは走らせない。
 */
export function useInviteInfo(code: string) {
  return useQuery({
    queryKey: ["invite", code],
    queryFn: () => fetchInviteInfo(code),
    enabled: code.trim() !== "",
    retry: false,
  });
}

/**
 * 初回プロフィール作成（POST /staff/me）。
 * 成功時は staff/me を無効化して最新を取り直す。
 */
export function useCreateStaffProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStaffProfileInput) => createStaffProfile(input),
    onSuccess: (me) => {
      // 取得済みキャッシュを即時更新しつつ無効化する
      qc.setQueryData(STAFF_ME_KEY, me);
      qc.invalidateQueries({ queryKey: STAFF_ME_KEY });
    },
  });
}

/**
 * 招待コードで所属を追加する参加（POST /staff/me/join）。
 * 参加の確定点（新規/既存問わず）。成功時は staff/me を無効化して所属一覧を取り直す。
 */
export function useJoinStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) => joinStore(inviteCode),
    onSuccess: () => {
      // 所属一覧（memberships）が増えるため自分のプロフィールを取り直す
      qc.invalidateQueries({ queryKey: STAFF_ME_KEY });
    },
  });
}

/**
 * プロフィール編集（PATCH /staff/me）。
 */
export function useUpdateStaffProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStaffProfileInput) => updateStaffProfile(input),
    onSuccess: (me) => {
      qc.setQueryData(STAFF_ME_KEY, me);
      qc.invalidateQueries({ queryKey: STAFF_ME_KEY });
    },
  });
}

/**
 * 受取履歴（GET /staff/me/tips）を取得する。本人のみ・ログイン済みのときだけ走らせる。
 */
export function useStaffTips(enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "tips"],
    queryFn: fetchStaffTips,
    enabled,
    retry: false,
  });
}

/**
 * 保留残高サマリ（GET /staff/me/balance）を取得する。本人のみ・ログイン済みのときだけ走らせる。
 */
export function useStaffBalance(enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "balance"],
    queryFn: fetchStaffBalance,
    enabled,
    retry: false,
  });
}

/**
 * Stripe Connect オンボーディングの開始（POST /staff/me/connect/onboard）。
 * 成功時に返る URL へ遷移して本人確認・口座登録を行う。
 */
export function useStartConnectOnboard() {
  return useMutation({
    mutationFn: () => startConnectOnboard(),
  });
}

/**
 * 送金履歴（GET /staff/me/payouts）を取得する。本人のみ・ログイン済みのときだけ走らせる。
 */
export function useStaffPayouts(enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "payouts"],
    queryFn: fetchPayouts,
    enabled,
    retry: false,
  });
}

/**
 * 送金（振込申請・POST /staff/me/payouts）。着金可能額の全額を登録口座へ送金する。
 * 成功時は残高（payable→paid に移る）と送金履歴を取り直す。
 */
export function useCreatePayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => createPayout(),
    onSuccess: () => {
      // 着金可能額が減り、送金履歴が増えるため両方を無効化して取り直す
      qc.invalidateQueries({ queryKey: ["staff", "balance"] });
      qc.invalidateQueries({ queryKey: ["staff", "payouts"] });
    },
  });
}
