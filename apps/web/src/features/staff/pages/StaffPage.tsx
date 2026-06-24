import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe } from "../hooks/useStaff.js";
import { StaffLoginPage } from "./StaffLoginPage.js";
import { StaffProfileCreatePage } from "./StaffProfileCreatePage.js";
import { StaffHomePage } from "./StaffHomePage.js";

// 招待受け入れからログインを跨いで引き継ぐ招待コードの保管キー（StaffInviteAcceptPage と共有）
const PENDING_INVITE_KEY = "arigato.pendingInvite";

/**
 * 店員さん画面の入口（/staff）と認証ゲート。
 * セッションとプロフィール（GET /staff/me）の状態を見て、出す画面を一元的に出し分ける:
 *  - 未ログイン            → ログイン画面
 *  - ログイン後に保留中の招待がある → 参加フロー（/staff/setup?invite=）へ送る
 *  - ログイン済み・未作成   → プロフィール作成画面
 *  - ログイン済み・作成済み → ホーム
 * 認証情報の取得中はローディング表示にして、画面のちらつきを防ぐ。
 */
export function StaffPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Supabase セッション（ログイン状態）
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  // 自分のプロフィール（ログイン済みのときだけ取得）
  const meQuery = useStaffMe(isAuthenticated);

  // ログイン後に保留中の招待があれば参加フローへ送る（招待リンク→ログイン→参加の引き継ぎ）。
  // 副作用で1度だけ実行し、退避した招待コードは消費して取り除く。
  useEffect(() => {
    if (authLoading || !isAuthenticated || meQuery.isLoading) return;
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(PENDING_INVITE_KEY);
    } catch {
      pending = null;
    }
    if (pending) {
      try {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
      } catch {
        // 取り除けなくても致命的でない
      }
      // 参加フローへ（新規＝作成→参加 / 既存＝作成スキップ→参加 を setup 側で出し分ける）
      navigate({ to: "/staff/setup", search: { invite: pending } });
    }
  }, [authLoading, isAuthenticated, meQuery.isLoading, navigate]);

  // セッション確定前はローディング（ガードのちらつき防止）
  if (authLoading) {
    return <StaffLoading label={t("staff.loading")} />;
  }

  // 未ログインならログイン画面へ
  if (!isAuthenticated) {
    return <StaffLoginPage />;
  }

  // プロフィール取得中はローディング
  if (meQuery.isLoading) {
    return <StaffLoading label={t("staff.loading")} />;
  }

  // 未作成（初回ログイン）ならプロフィール作成へ
  if (!meQuery.data) {
    return <StaffProfileCreatePage />;
  }

  // 作成済みならホームを表示
  return <StaffHomePage me={meQuery.data} />;
}

/**
 * 店員さん画面のローディング表示（スマホ枠内で中央寄せ）。
 */
function StaffLoading({ label }: { label: string }) {
  return (
    <PhoneFrame>
      <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
        {label}
      </div>
    </PhoneFrame>
  );
}
