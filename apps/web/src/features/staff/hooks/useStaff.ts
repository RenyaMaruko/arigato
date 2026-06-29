import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { StripeConnectInstance } from "@stripe/connect-js";
import { initConnectOnboarding } from "../lib/connect.js";
import { shouldInitConnectOnboarding } from "../lib/connect-init.js";
import type {
  CreateStaffProfileInput,
  UpdateStaffProfileInput,
} from "@arigato/shared";
import {
  fetchStaffMe,
  createStaffProfile,
  joinStore,
  leaveMembership,
  updateStaffProfile,
  uploadStaffAvatar,
  fetchInviteInfo,
  fetchStaffTips,
  fetchStaffBalance,
  startConnectOnboard,
  createPayout,
  fetchPayouts,
  type StaffTipsFilterParams,
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
 * 自分でその店を脱退する（POST /staff/me/memberships/:membershipId/leave・論理削除）。
 * 成功時は staff/me（active な所属一覧）と受取履歴を取り直す
 * （脱退店は所属一覧から消えるが、受取履歴の店フィルタには残る）。
 */
export function useLeaveMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) => leaveMembership(membershipId),
    onSuccess: (me) => {
      // 最新の StaffMe（memberships が減り receiptStores は残る）を即時反映しつつ取り直す
      qc.setQueryData(STAFF_ME_KEY, me);
      qc.invalidateQueries({ queryKey: STAFF_ME_KEY });
      // 受取履歴のサマリー・一覧も整合させる
      qc.invalidateQueries({ queryKey: ["staff", "tips"] });
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
 * アバター画像のアップロード（POST /staff/me/avatar）。
 * 成功時は staff/me を取り直してプレビュー（avatarUrl）を反映する。
 */
export function useUploadStaffAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadStaffAvatar(file),
    onSuccess: () => {
      // avatar_url が変わるため自分のプロフィールを取り直す
      qc.invalidateQueries({ queryKey: STAFF_ME_KEY });
    },
  });
}

/**
 * 受取履歴（GET /staff/me/tips）を「20件ずつの無限スクロール」で取得する。
 * 本人のみ・ログイン済みのときだけ走らせる。
 * キーセットページング: getNextPageParam で前ページの nextCursor を次ページの基点に使う
 * （null なら次ページなし＝末尾）。サマリー（totalAmount/totalCount）はフィルタ後の全件集計のため
 * 各ページに同じ値が入る（画面は最初のページの値を使う）。
 *
 * 店舗・期間フィルタ（filter）を queryKey に含めるため、フィルタを変えると
 * useInfiniteQuery が別キーとして自動リセットされ、先頭ページから取り直す。
 * フィルタは fetch のクエリにも渡し、一覧・サマリーの両方がフィルタ後の値になる。
 */
export function useStaffTips(enabled: boolean, filter: StaffTipsFilterParams = {}) {
  // queryKey にフィルタ（店舗・期間）を含める。null/undefined を正規化して安定したキーにする。
  const filterKey = {
    storeId: filter.storeId ?? null,
    from: filter.from ?? null,
    to: filter.to ?? null,
  };
  return useInfiniteQuery({
    queryKey: ["staff", "tips", filterKey],
    // pageParam は次ページの基点 cursor（先頭ページは undefined）。フィルタも併せて渡す
    queryFn: ({ pageParam }) => fetchStaffTips(pageParam, filter),
    // 先頭ページは cursor 無し
    initialPageParam: undefined as string | undefined,
    // 前ページの nextCursor を次の pageParam にする（null/未作成なら undefined＝停止）
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
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
 * 成功時に返る URL へ遷移して本人確認・口座登録を行う（旧・全画面リダイレクト方式）。
 * 埋め込み型（useConnectOnboarding）へ移行済みのため通常は使わないが、後方互換のため残す。
 */
export function useStartConnectOnboard() {
  return useMutation({
    mutationFn: () => startConnectOnboard(),
  });
}

/**
 * 埋め込み型オンボーディング（Connect Embedded Components）用の Connect インスタンスを用意する。
 *
 * 全画面リダイレクトをやめ、アプリ内に Stripe の本人確認 UI を埋め込むための初期化。
 *
 * 初期化のタイミングが肝:
 *  - ログイン・プロフィールが確定（enabled が false→true）した時点で一度だけ初期化する。
 *  - useStaffMe が未キャッシュのコールド読み込み（/staff/identity 直リンク・ハードリフレッシュ）では
 *    初回マウント時 enabled=false で、その後データ到着で true に変わる。この遷移を取りこぼさず初期化する
 *    （useState の遅延初期化だと初回の false が固定され、永久に未初期化になるため useEffect で行う）。
 *  - 一度生成したインスタンスは再レンダー・再 enabled でも作り直さない（ref ガードで多重生成を防ぐ）。
 *  - fetchClientSecret の参照は initConnectOnboarding 内で生成され、初期化は一度きりのため安定。
 *  - 公開可能キー未設定など初期化に失敗した場合は error に保持し、画面側でエラー表示する。
 */
export function useConnectOnboarding(enabled: boolean) {
  const [instance, setInstance] = useState<StripeConnectInstance | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // 初期化を一度だけに固定するガード（再レンダー・enabled の再 true で作り直さない）
  const initializedRef = useRef(false);

  useEffect(() => {
    // 有効化前・初期化済みなら何もしない（enabled の false→true 遷移で一度だけ通る）
    if (!shouldInitConnectOnboarding(enabled, initializedRef.current)) return;
    initializedRef.current = true;
    try {
      // Connect インスタンスを生成（fetchClientSecret は内部で都度 Account Session を発行する）
      setInstance(initConnectOnboarding());
    } catch (err) {
      // 公開可能キー未設定などの初期化失敗。画面側でエラー表示に使う
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [enabled]);

  return { instance, error };
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
