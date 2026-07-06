import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import {
  useInviteInfo,
  useStaffMe,
  useCreateStaffProfile,
  useJoinStore,
} from "../hooks/useStaff.js";

/**
 * 初回プロフィール作成画面（/staff/setup・/staff/onboard、または入口の未作成時）。
 * 表示名・一言を入力してプロフィール（人ごと1つ）を作成する。
 * 招待コード（?invite=）があれば、作成に続けてその店への参加（join）まで一気に確定し、
 * 参加完了画面「〇〇店に参加しました！」へ遷移する。招待が無ければ作成後ホームへ。
 * 本人確認・口座登録・Stripe Connect 連携は一切求めない（体験を登録の前に）。
 *
 * ガード: プロフィール作成済みのユーザーがこの作成ルートに来ても作成画面は出さない。
 *   - 招待あり → そのまま参加（join）→ 参加完了へ
 *   - 招待なし → ホームへ
 */
export function StaffProfileCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // ?invite= で招待コードを受け取る（招待リンクからの流入）。どのルート配下でも読めるよう strict:false で受ける
  const search = useSearch({ strict: false }) as { invite?: string };
  const invite = search.invite ?? "";

  // ログイン状態と自分のプロフィール（作成済みか＝ガード判定に使う）
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  const meQuery = useStaffMe(isAuthenticated);

  // 招待検証（コードがあれば店名・有効性を取得）
  const inviteQuery = useInviteInfo(invite);
  // プロフィール作成・参加
  const createMutation = useCreateStaffProfile();
  const joinMutation = useJoinStore();

  // 入力状態（UI ローカル・文字列で型付け）
  const [displayName, setDisplayName] = useState<string>("");
  const [headline, setHeadline] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  // 既存プロフィールの自動参加を1度だけ走らせるためのフラグ
  const [autoJoinStarted, setAutoJoinStarted] = useState(false);
  // 参加（join）を二重に撃たないための同期ガード。
  // 「作成→参加」フローでは作成成功時に hook 側 onSuccess（setQueryData）が先に走り、
  // それで hasProfile が true になって自動参加 useEffect が join を撃ってしまう一方、
  // handleSubmit 側 onSuccess も join を撃つため、単発招待が 2 回目で 409 になり「参加処理中」のまま固まる。
  // ref は再レンダーを待たず同期で読めるので、どちらの経路から来ても join は 1 回だけにできる。
  const joinClaimedRef = useRef(false);

  // 参加完了画面へ遷移する（status で「参加しました」/「既に所属」を出し分ける）
  const goJoined = (store: string, status: "joined" | "already") => {
    navigate({ to: "/staff/joined", search: { store, status } });
  };

  // 招待コードで参加（join）を実行し、結果に応じて遷移する共通処理。
  // 既に参加を開始済みなら二重実行しない（同期ガード）。
  const runJoin = (storeNameFallback: string) => {
    if (joinClaimedRef.current) return;
    joinClaimedRef.current = true;
    joinMutation.mutate(invite.trim(), {
      onSuccess: (result) => {
        // 管理者招待（type=admin）は所属（QR）を作らず店の管理者になるため、店の管理モード（/store）へ送る。
        // スタッフ招待（type=staff）は従来どおり参加完了画面へ。
        if (result.type === "admin") {
          navigate({ to: "/store" });
          return;
        }
        goJoined(
          result.storeName,
          result.status === "already_member" ? "already" : "joined",
        );
      },
      onError: (err) => {
        const code = err instanceof Error ? err.message : "";
        if (code === "invite_not_usable") setError(t("staff.joinErrorInvite"));
        else setError(t("staff.joinErrorGeneric"));
        // 失敗時もプロフィールは作成済み。店名は分からなくても画面に留めて再操作できるようにする
        void storeNameFallback;
      },
    });
  };

  // 未ログインで直接 /staff/setup に来たときはログインへ送る（招待は引き継ぐ）。
  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    if (invite.trim() !== "") {
      try {
        sessionStorage.setItem("arigato.pendingInvite", invite);
      } catch {
        // ストレージが使えなくても致命的でない
      }
    }
    navigate({ to: "/login" });
  }, [authLoading, isAuthenticated, invite, navigate]);

  // ガード: プロフィール作成済みなら作成画面を出さず、招待があれば参加、無ければホームへ
  const hasProfile = Boolean(meQuery.data);
  useEffect(() => {
    if (authLoading || meQuery.isLoading || !hasProfile || autoJoinStarted) return;
    setAutoJoinStarted(true);
    if (invite.trim() !== "") {
      // 既存ユーザー: 作成画面はスキップして参加だけ確定する
      runJoin(inviteQuery.data?.storeName ?? "");
    } else {
      // 招待が無いのに作成済みで来た → ホームへ
      navigate({ to: "/staff" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, meQuery.isLoading, hasProfile, autoJoinStarted, invite]);

  // 招待が有効か（招待が無い場合はプロフィール作成だけは許可する＝後から参加できる）
  const inviteValid = inviteQuery.data?.valid === true;
  const inviteProvided = invite.trim() !== "";
  // 作成可能か（招待があるなら有効であること・表示名必須）
  const canSubmit =
    (!inviteProvided || inviteValid) &&
    displayName.trim() !== "" &&
    !createMutation.isPending &&
    !joinMutation.isPending;

  // 作成を実行し、招待があれば続けて参加（join）まで確定する
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    createMutation.mutate(
      {
        displayName: displayName.trim(),
        headline: headline.trim() === "" ? undefined : headline.trim(),
      },
      {
        onSuccess: () => {
          // 招待があればその店へ参加（join）→ 参加完了画面。無ければホームへ。
          // runJoin は同期ガード（joinClaimedRef）で二重実行を防ぐため、
          // 作成成功で発火する自動参加 useEffect 側の join とは重複しない。
          if (inviteProvided) {
            runJoin(inviteQuery.data?.storeName ?? "");
          } else {
            navigate({ to: "/staff" });
          }
        },
        onError: (err) => {
          const code = err instanceof Error ? err.message : "";
          if (code === "staff_already_exists") setError(t("staff.createErrorExists"));
          else setError(t("staff.createErrorGeneric"));
        },
      },
    );
  };

  // プロフィール作成済みで参加が失敗したら、ローディングのまま固まらせずホームへ送る。
  // プロフィールは作成済み＝ログイン済み店員なので、ホームから招待リンクで参加を再試行できる。
  useEffect(() => {
    if (hasProfile && joinMutation.isError) {
      navigate({ to: "/staff" });
    }
  }, [hasProfile, joinMutation.isError, navigate]);

  // ガード判定中・未ログイン（ログインへ送る前）・既存ユーザーの自動参加中はローディング（作成画面のちらつき防止）
  if (authLoading || !isAuthenticated || meQuery.isLoading || hasProfile) {
    return (
      <PhoneFrame>
        {/* 既存ユーザーの自動参加・ガード判定中もスピナーを回して「処理が動いている」ことを見せる */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <span
            className="h-10 w-10 animate-spin rounded-full border-4 border-rose-soft border-t-rose"
            aria-hidden="true"
          />
          <span className="text-token-md text-ink-sub">
            {joinMutation.isPending ? t("staff.joining") : t("staff.loading")}
          </span>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto [&>*]:shrink-0 px-6 pb-7 pt-2">
        {/* 見出し */}
        <div className="mt-6">
          <div className="text-token-3xl font-bold text-ink">{t("staff.createTitle")}</div>
          <div className="mt-2 text-token-md text-ink-sub">{t("staff.createLead")}</div>
        </div>

        {/* 所属先の案内（招待リンクからの流入時）。招待で店が確定する */}
        {inviteProvided && (
          <div className="mt-5 rounded-xl border-[1.5px] border-rose bg-rose-soft px-4 py-3 text-center">
            {inviteQuery.isLoading && (
              <span className="text-token-sm text-ink-sub">{t("staff.inviteChecking")}</span>
            )}
            {inviteQuery.data && inviteQuery.data.valid && (
              <span className="text-token-md text-rose">
                「{inviteQuery.data.storeName}」
                {inviteQuery.data.type === "admin"
                  ? t("staff.inviteValidAdmin")
                  : t("staff.inviteValid")}
              </span>
            )}
            {inviteQuery.data && !inviteQuery.data.valid && (
              <span className="text-token-sm text-ink-sub">{t("staff.inviteInvalid")}</span>
            )}
            {inviteQuery.data === null && !inviteQuery.isLoading && (
              <span className="text-token-sm text-ink-sub">{t("staff.inviteNotFound")}</span>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col">
          {/* 表示名 */}
          <label className="text-token-sm text-ink-sub" htmlFor="display-name">
            {t("staff.displayNameLabel")}
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("staff.displayNamePlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          {/* 一言（任意） */}
          <label className="mt-5 text-token-sm text-ink-sub" htmlFor="headline">
            {t("staff.headlineLabel")}
          </label>
          <input
            id="headline"
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder={t("staff.headlinePlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          {/* 作成ボタン（招待があれば作成→参加まで一気に確定する） */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-8 flex items-center justify-center gap-2.5 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-50"
          >
            {createMutation.isPending || joinMutation.isPending ? (
              <>
                {/* 登録中はスピナーを回して「処理が動いている」ことを見せる
                    （プロフィール保存＋受け取り用のStripe連結アカウント作成で数秒かかるため） */}
                <span
                  className="h-5 w-5 animate-spin rounded-full border-2 border-page/40 border-t-page"
                  aria-hidden="true"
                />
                {t("staff.createSubmitting")}
              </>
            ) : (
              t("staff.createSubmit")
            )}
          </button>
          {error && <div className="mt-3 text-center text-token-sm text-rose">{error}</div>}
        </form>
      </div>
    </PhoneFrame>
  );
}
