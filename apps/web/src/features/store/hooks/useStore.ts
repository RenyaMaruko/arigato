import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateStoreProfileInput, CreateStoreInput } from "@arigato/shared";
import {
  fetchMyStore,
  createStore,
  updateStore,
  createStoreInvite,
  fetchStoreInvites,
  fetchStoreStaff,
  fetchStoreGratitude,
} from "../api/store.api.js";

/**
 * store feature のサーバー状態フック（TanStack Query）。
 * Page → Hook → API → Backend の流れに従い、フェッチ・キャッシュ・無効化を扱う。
 */

// クエリキー
const STORE_ME_KEY = ["store", "me"] as const;

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
 * 成功時は招待一覧を無効化して最新を取り直す。
 */
export function useCreateStoreInvite(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => createStoreInvite(storeId!),
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
 * 感謝の可視化（GET /store/:storeId/gratitude）を取得する。件数・お客さまの声・スタッフ別件数。
 */
export function useStoreGratitude(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store", "gratitude", storeId],
    queryFn: () => fetchStoreGratitude(storeId!),
    enabled: Boolean(storeId),
    retry: false,
  });
}
