import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import {
  signInWithGoogleForStore,
  signInWithEmailForStore,
} from "../../../lib/auth.js";
import { useAuthSession } from "../../../lib/use-auth-session.js";

/**
 * 店舗ログイン画面（/store のログイン前状態）。
 * Supabase Auth の Google OAuth とメール（マジックリンク）でサインイン/サインアップする。
 * 認証後は同じ /store に戻り、店未紐付けなら導入セットアップ、紐付け済みならホームへ進む。
 */
export function StoreLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // 既にログイン済みなら入口（/store）へ送り、ログイン後の判定に委ねる
  const { isAuthenticated } = useAuthSession();
  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: "/store" });
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
      await signInWithGoogleForStore();
    } catch {
      setError(t("store.loginError"));
    }
  };

  // メールにマジックリンクを送る
  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() === "" || busy) return;
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailForStore(email.trim());
      setSent(true);
    } catch {
      setError(t("store.loginError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PhoneFrame>
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-6 pb-7 pt-2">
        {/* 見出し */}
        <div className="mt-8 text-center">
          <div className="text-token-3xl font-bold text-ink">{t("store.loginTitle")}</div>
        </div>

        {/* マジックリンク送信後の案内 */}
        {sent ? (
          <div className="mt-10 rounded-xl border-[1.5px] border-line bg-surface-subtle px-5 py-6 text-center text-token-md leading-relaxed text-ink">
            {t("store.magicLinkSent")}
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
              {t("store.continueWithGoogle")}
            </button>

            {/* 区切り */}
            <div className="my-6 flex items-center gap-3 text-token-sm text-muted">
              <span className="h-px flex-1 bg-line-soft" />
              {t("store.or")}
              <span className="h-px flex-1 bg-line-soft" />
            </div>

            {/* メールでログイン */}
            <form onSubmit={handleEmail} className="flex flex-col">
              <label className="text-token-sm text-ink-sub" htmlFor="store-email">
                {t("store.emailLabel")}
              </label>
              <input
                id="store-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("store.emailPlaceholder")}
                className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
              />
              <button
                type="submit"
                disabled={busy}
                className="mt-4 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
              >
                {t("store.sendMagicLink")}
              </button>
            </form>
          </>
        )}

        {/* エラー表示 */}
        {error && <div className="mt-4 text-center text-token-sm text-rose">{error}</div>}

        {/* 案内 */}
        <div className="mt-auto pt-8 text-center text-token-xs text-muted">
          {t("store.loginNote")}
        </div>
      </div>
    </PhoneFrame>
  );
}
