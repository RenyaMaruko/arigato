import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateStoreProfileInput, CreateStoreInput } from "@arigato/shared";
import {
  fetchMyStore,
  fetchManagedStores,
  fetchStore,
  createStore,
  updateStore,
  uploadStoreLogo,
  createStoreInvite,
  revokeStoreInvite,
  fetchStoreInvites,
  fetchStoreStaff,
  fetchStoreStaffDetail,
  removeStoreStaff,
  fetchStoreGratitude,
  fetchStoreAdmins,
  createStoreAdminInvite,
  removeStoreAdmin,
  transferStoreOwner,
  closeStore,
  leaveStoreAsOwner,
} from "../api/store.api.js";

/**
 * store feature のサーバー状態フック（TanStack Query）。
 * Page → Hook → API → Backend の流れに従い、フェッチ・キャッシュ・無効化を扱う。
 */

// クエリキー
const STORE_ME_KEY = ["store", "me"] as const;
// 自分が管理する店の一覧（GET /store/mine）のクエリキー（中央ナビ切替の判定・選択に使う）
const STORE_MINE_KEY = ["store", "mine"] as const;

/**
 * 自分（ログイン中の店アカウント）が所有する店（GET /store/me）を取得する。
 * enabled でログイン済みのときだけ走らせる。未作成は data=null（店舗作成へ誘導）。
 */
export function useMyStore(enabled: boolean) {
  return useQuery({
    queryKey: STORE_ME_KEY,
    queryFn: fetchMyStore,
    enabled,
    retry: false,
  });
}

/**
 * 自分が管理する店の一覧（GET /store/mine・§11.4）を取得する。
 * 中央ナビの切替ボタンの表示条件（items.length >= 1）と、切替時の分岐（1件直行/複数一覧）に使う。
 * enabled でログイン済みのときだけ走らせる。純店員は items 空配列。金額は含まれない。
 */
export function useManagedStores(enabled: boolean) {
  return useQuery({
    queryKey: STORE_MINE_KEY,
    queryFn: fetchManagedStores,
    enabled,
    retry: false,
  });
}

/**
 * 選択中の店（GET /store/:storeId）を取得する（§11.4・選択店解決）。
 * 単一 /store/me 前提を廃し、中央ナビで選んだ storeId の店プロフィールを引く。
 * storeId が確定しているときだけ走らせる。
 */
export function useStore(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store", "detail", storeId],
    queryFn: () => fetchStore(storeId!),
    enabled: Boolean(storeId),
    retry: false,
  });
}

/**
 * 店舗をセルフサーブで新規作成する（POST /store）。
 * 成功時は store/me を更新・無効化して最新を取り直し、ホームへ進める。
 */
export function useCreateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStoreInput) => createStore(input),
    onSuccess: (store) => {
      qc.setQueryData(STORE_ME_KEY, store);
      qc.invalidateQueries({ queryKey: STORE_ME_KEY });
      // 管理する店が増えるため一覧（中央ナビの表示条件・選択肢）を取り直す（§11.4）
      qc.invalidateQueries({ queryKey: STORE_MINE_KEY });
      // 店員側 me の managesStore も true に変わるため取り直す（設定・ナビの出し分け）
      qc.invalidateQueries({ queryKey: ["staff", "me"] });
    },
  });
}

/**
 * 店プロフィール編集（PATCH /store/:storeId）。
 */
export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { storeId: string; input: UpdateStoreProfileInput }) =>
      updateStore(args.storeId, args.input),
    onSuccess: (store) => {
      qc.setQueryData(STORE_ME_KEY, store);
      qc.invalidateQueries({ queryKey: STORE_ME_KEY });
    },
  });
}

/**
 * 店ロゴ画像のアップロード（POST /store/:storeId/logo）。
 * 成功時は store/me を取り直してロゴ（logoUrl）を反映する。
 */
export function useUploadStoreLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { storeId: string; file: File }) => uploadStoreLogo(args.storeId, args.file),
    onSuccess: () => {
      // logo_url が変わるため自店を取り直す
      qc.invalidateQueries({ queryKey: STORE_ME_KEY });
    },
  });
}

/**
 * 発行済み招待の一覧（GET /store/:storeId/invites）を取得する。
 * storeId が確定しているときだけ走らせる。
 */
export function useStoreInvites(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store", "invites", storeId],
    queryFn: () => fetchStoreInvites(storeId!),
    enabled: Boolean(storeId),
    retry: false,
  });
}

/**
 * スタッフ招待リンクの発行（POST /store/:storeId/invites）。
 * 引数 label は「誰宛か」の任意メモ（未指定なら無記名の招待）。
 * 成功時は招待一覧を無効化して最新を取り直す。
 */
export function useCreateStoreInvite(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label?: string) => createStoreInvite(storeId!, label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store", "invites", storeId] });
    },
  });
}

/**
 * 招待中（pending）の招待を取り消す（POST /store/:storeId/invites/:code/revoke）。
 * 成功時は招待一覧を無効化して最新を取り直す（取り消した招待は pending 一覧から消える）。
 */
export function useRevokeStoreInvite(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => revokeStoreInvite(storeId!, code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store", "invites", storeId] });
    },
  });
}

/**
 * 所属スタッフ一覧（GET /store/:storeId/staff）を取得する。
 */
export function useStoreStaff(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store", "staff", storeId],
    queryFn: () => fetchStoreStaff(storeId!),
    enabled: Boolean(storeId),
    retry: false,
  });
}

/**
 * 在籍中スタッフ1人の詳細（GET /store/:storeId/staff/:staffId）を取得する。
 * storeId と staffId が確定しているときだけ走らせる。
 */
export function useStoreStaffDetail(storeId: string | undefined, staffId: string | undefined) {
  return useQuery({
    queryKey: ["store", "staff", storeId, staffId],
    queryFn: () => fetchStoreStaffDetail(storeId!, staffId!),
    enabled: Boolean(storeId) && Boolean(staffId),
    retry: false,
  });
}

/**
 * 自店のスタッフを在籍解除する（POST /store/:storeId/staff/:staffId/remove・論理削除）。
 * 成功時はスタッフ一覧・記録（スタッフ別件数）を取り直す（在籍解除した人が消える）。お金は移動しない。
 */
export function useRemoveStoreStaff(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (staffId: string) => removeStoreStaff(storeId!, staffId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store", "staff", storeId] });
      // 記録（スタッフ別件数・選択肢）も active のみになるため取り直す
      qc.invalidateQueries({ queryKey: ["store", "gratitude", storeId] });
    },
  });
}

/**
 * 感謝の可視化（GET /store/:storeId/gratitude）を取得する。件数・お客さまの声・スタッフ別件数。
 *
 * period（from/to・ISO）で期間を絞れる（記録画面の期間セレクタ用）。未指定は全期間（店ホーム互換）。
 * period.staffId（uuid）で voices を特定スタッフに絞れる（スタッフ別タブの「特定スタッフ」用。
 * 集計値 totalCount/weekCount/perStaff は staffId に関わらず不変）。
 * period（from/to/staffId）を queryKey に含めるので、変わると自動で再取得し連動する。
 *
 * options.enabled で取得の有効/無効を切り替えられる（特定スタッフ選択時だけ追加取得する等）。
 * 省略時は storeId が確定していれば取得する（従来どおり）。
 */
export function useStoreGratitude(
  storeId: string | undefined,
  period?: { from?: string; to?: string; staffId?: string },
  options?: { enabled?: boolean },
) {
  // period の各値を queryKey に含める（null は全期間・全スタッフを表す安定キー）
  const from = period?.from ?? null;
  const to = period?.to ?? null;
  const staffId = period?.staffId ?? null;
  // 呼び出し側の enabled 指定があればそれと storeId の有無を AND（省略時は storeId の有無のみ）
  const enabled = Boolean(storeId) && (options?.enabled ?? true);
  return useQuery({
    queryKey: ["store", "gratitude", storeId, from, to, staffId],
    queryFn: () => fetchStoreGratitude(storeId!, period),
    enabled,
    retry: false,
  });
}

/**
 * 管理者一覧（GET /store/:storeId/admins）を取得する。
 * 応答の viewerRole で owner だけに管理者の招待・削除・owner 譲渡ボタンを出す。
 */
export function useStoreAdmins(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store", "admins", storeId],
    queryFn: () => fetchStoreAdmins(storeId!),
    enabled: Boolean(storeId),
    retry: false,
  });
}

/**
 * 管理者招待リンクの発行（POST /store/:storeId/admin-invites・owner のみ）。
 * 引数 label は「誰宛か」の任意メモ。成功で招待リンクを返す（一覧の無効化は不要＝別導線）。
 */
export function useCreateStoreAdminInvite(storeId: string | undefined) {
  return useMutation({
    mutationFn: (label?: string) => createStoreAdminInvite(storeId!, label),
  });
}

/**
 * 管理者を外す（POST /store/:storeId/admins/:authUserId/remove・owner のみ）。
 * 成功時は管理者一覧を取り直す。
 */
export function useRemoveStoreAdmin(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (authUserId: string) => removeStoreAdmin(storeId!, authUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store", "admins", storeId] });
      // スタッフ一覧・詳細のロール表示も変わるため取り直す（管理者→店員のみ）
      qc.invalidateQueries({ queryKey: ["store", "staff", storeId] });
    },
  });
}

/**
 * owner を譲渡する（POST /store/:storeId/transfer-owner・owner のみ）。
 * 成功時は管理者一覧・自店（GET /store/me のロール起点）を取り直す。
 */
export function useTransferStoreOwner(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetAuthUserId: string) => transferStoreOwner(storeId!, targetAuthUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store", "admins", storeId] });
      qc.invalidateQueries({ queryKey: STORE_ME_KEY });
      // スタッフ詳細の viewerRole/role も変わるため取り直す
      qc.invalidateQueries({ queryKey: ["store", "staff", storeId] });
    },
  });
}

/**
 * 店を論理削除（閉店）する（POST /store/:storeId/close・owner のみ）。
 * 成功時は自店・所属店（staff 側）を取り直す（閉店後は店ホームに来られなくなる）。
 */
export function useCloseStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storeId: string) => closeStore(storeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STORE_ME_KEY });
      // 管理する店が減るため一覧（中央ナビの表示条件・選択肢）を取り直す（§11.4）
      qc.invalidateQueries({ queryKey: STORE_MINE_KEY });
      qc.invalidateQueries({ queryKey: ["staff", "me"] });
    },
  });
}

/**
 * owner が店から抜ける（POST /store/:storeId/owner/leave・owner のみ）。
 * 残る管理者がいれば自動昇格・いなければ閉店。成功時は自店・所属店を取り直す。
 */
export function useLeaveStoreAsOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storeId: string) => leaveStoreAsOwner(storeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STORE_ME_KEY });
      // 管理する店が減る場合があるため一覧（中央ナビの表示条件・選択肢）を取り直す（§11.4）
      qc.invalidateQueries({ queryKey: STORE_MINE_KEY });
      qc.invalidateQueries({ queryKey: ["staff", "me"] });
    },
  });
}
