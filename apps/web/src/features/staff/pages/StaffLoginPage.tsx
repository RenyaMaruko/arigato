import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { signInWithGoogle, signInWithEmail } from "../../../lib/auth.js";
import { useAuthSession } from "../hooks/useAuthSession.js";

/**
 * 店員さんログイン画面（/staff のログイン前状態）。
 * Supabase Auth の Google OAuth とメール（マジックリンク）でサインイン/サインアップする。
 * 認証後は同じ /staff に戻り、プロフィール未作成なら作成画面、作成済みならホームへ進む。
 */
export function StaffLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // 既にログイン済みなら入口（/staff）へ送り、ログイン後の判定（作成/ホーム）に委ねる
  const { isAuthenticated } = useAuthSession();
  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: "/staff" });
    }
  }, [isAuthenticated, navigate]);

  // メール入力・送信状態・エラーは UI ローカル状態として持つ
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Google でサインイン（OAuth リダイレクト）
  const handleGoogle = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError(t("staff.loginError"));
    }
  };

  // メールにマジックリンクを送る
  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() === "" || busy) return;
    setError(null);
    setBusy(true);
    try {
      await signInWithEmail(email.trim());
      setSent(true);
    } catch {
      setError(t("staff.loginError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-7 pt-2">
        {/* 見出し */}
        <div className="mt-8 text-center">
          <div className="text-token-3xl font-bold text-ink">{t("staff.loginTitle")}</div>
          <div className="mt-2 text-token-md text-ink-sub">{t("staff.loginLead")}</div>
        </div>

        {/* マジックリンク送信後の案内 */}
        {sent ? (
          <div className="mt-10 rounded-xl border-[1.5px] border-line bg-surface-subtle px-5 py-6 text-center text-token-md leading-relaxed text-ink">
            {t("staff.magicLinkSent")}
          </div>
        ) : (
          <>
            {/* Google でログイン */}
            <button
              type="button"
              onClick={handleGoogle}
              className="mt-10 flex items-center justify-center gap-[7px] rounded-xl border-[1.5px] border-line bg-page py-4 text-token-lg font-semibold text-ink"
            >
              <span className="text-token-xl font-bold text-google-blue">G</span>
              {t("staff.continueWithGoogle")}
            </button>

            {/* 区切り */}
            <div className="my-6 flex items-center gap-3 text-token-sm text-muted">
              <span className="h-px flex-1 bg-line-soft" />
              {t("staff.or")}
              <span className="h-px flex-1 bg-line-soft" />
            </div>

            {/* メールでログイン */}
            <form onSubmit={handleEmail} className="flex flex-col">
              <label className="text-token-sm text-ink-sub" htmlFor="staff-email">
                {t("staff.emailLabel")}
              </label>
              <input
                id="staff-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("staff.emailPlaceholder")}
                className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
              />
              <button
                type="submit"
                disabled={busy}
                className="mt-4 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
              >
                {t("staff.sendMagicLink")}
              </button>
            </form>
          </>
        )}

        {/* エラー表示 */}
        {error && <div className="mt-4 text-center text-token-sm text-rose">{error}</div>}

        {/* 招待からの登録案内 */}
        <div className="mt-auto pt-8 text-center text-token-xs text-muted">
          {t("staff.loginNote")}
        </div>
      </div>
    </PhoneFrame>
  );
}
