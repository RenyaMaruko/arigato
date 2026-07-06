import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import {
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
} from "../../../lib/auth.js";
import { validatePasswordStrength } from "../../../lib/password.js";
import { useAuthSession } from "../../../lib/use-auth-session.js";

/**
 * 統合ログイン／サインアップ画面（/login）。
 * 店員用・店舗用に分かれていた旧ログイン画面を1つに集約したもの。
 * メール＋パスワードのログイン・新規登録、Google、パスワード再設定への導線を1画面にまとめる。
 * マジックリンクは廃止した。認証後は全員まず店員ホーム入口（/staff）に着地する
 * （店の管理へは店員側の暫定導線から入る／本格的なモード切替はフェーズ3）。
 */
export function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // 既にログイン済みなら入口（/staff）へ送り、ログイン後の判定（作成/ホーム）に委ねる
  const { isAuthenticated } = useAuthSession();
  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: "/staff" });
    }
  }, [isAuthenticated, navigate]);

  // ログイン／サインアップの切替（1画面内でモードを持つ）
  const [mode, setMode] = useState<"login" | "signup">("login");
  // 入力・状態は UI ローカルで持つ
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // サインアップ後の「確認メールを送りました」表示フラグ
  const [signupSent, setSignupSent] = useState(false);

  // モード切替時は入力エラーだけリセットする（入力値は引き継ぐ）
  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    setError(null);
  };

  // Google でサインイン（OAuth リダイレクト）
  const handleGoogle = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError(t("auth.loginError"));
    }
  };

  // メール＋パスワードでログイン
  const handleLogin = async () => {
    // メール・パスワードの空チェック（フロント一次バリデーション）
    if (email.trim() === "") {
      setError(t("auth.emailEmpty"));
      return;
    }
    if (password === "") {
      setError(t("auth.passwordEmpty"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await signInWithPassword(email.trim(), password);
      // 成功時はセッションが確立し、上の useEffect が /staff へ送る
    } catch (err) {
      // メール未確認は専用の案内を出す（確認前はログイン不可）
      const message = err instanceof Error ? err.message.toLowerCase() : "";
      if (message.includes("not confirmed") || message.includes("confirm")) {
        setError(t("auth.emailNotConfirmed"));
      } else {
        setError(t("auth.loginError"));
      }
    } finally {
      setBusy(false);
    }
  };

  // メール＋パスワードで新規登録（パスワード強度を先に検証）
  const handleSignup = async () => {
    // メール未入力チェック
    if (email.trim() === "") {
      setError(t("auth.emailEmpty"));
      return;
    }
    // パスワード強度（最低8文字）をフロントで検証し、弱すぎる入力を弾く
    const check = validatePasswordStrength(password);
    if (!check.valid) {
      setError(check.reason === "empty" ? t("auth.passwordEmpty") : t("auth.passwordTooShort"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await signUpWithPassword(email.trim(), password);
      // 登録時メール確認あり。確認メール送信済みの案内へ切り替える
      setSignupSent(true);
    } catch (err) {
      // 既に登録済みのメールはログインを促す
      const message = err instanceof Error ? err.message.toLowerCase() : "";
      if (message.includes("already") || message.includes("registered")) {
        setError(t("auth.signupExists"));
      } else {
        setError(t("auth.signupError"));
      }
    } finally {
      setBusy(false);
    }
  };

  // フォーム送信（モードで分岐）
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === "login") {
      void handleLogin();
    } else {
      void handleSignup();
    }
  };

  // サインアップ後の「確認メールを送りました」画面
  if (signupSent) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-6 pb-7 pt-2">
          <div className="mt-10 text-center">
            <div className="text-token-3xl font-bold text-ink">{t("auth.signupSentTitle")}</div>
          </div>
          <div className="mt-8 whitespace-pre-line rounded-xl border-[1.5px] border-line bg-surface-subtle px-5 py-6 text-center text-token-md leading-relaxed text-ink">
            {t("auth.signupSentLead")}
          </div>
          {/* 確認後はログインできる旨。ログイン画面へ戻す */}
          <button
            type="button"
            onClick={() => {
              setSignupSent(false);
              switchMode("login");
            }}
            className="mt-8 rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-lg font-semibold text-ink"
          >
            {t("auth.backToLogin")}
          </button>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-6 pb-7 pt-2">
        {/* 見出し（モードで出し分け） */}
        <div className="mt-8 text-center">
          <div className="text-token-3xl font-bold text-ink">
            {mode === "login" ? t("auth.loginTitle") : t("auth.signupTitle")}
          </div>
          <div className="mt-2 text-token-md text-ink-sub">
            {mode === "login" ? t("auth.loginLead") : t("auth.signupLead")}
          </div>
        </div>

        {/* メール＋パスワードのフォーム（上に配置） */}
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col">
          <label className="text-token-sm text-ink-sub" htmlFor="auth-email">
            {t("auth.emailLabel")}
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          <label className="mt-5 text-token-sm text-ink-sub" htmlFor="auth-password">
            {t("auth.passwordLabel")}
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          <button
            type="submit"
            disabled={busy}
            className="mt-6 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
          >
            {mode === "login" ? t("auth.loginSubmit") : t("auth.signupSubmit")}
          </button>
        </form>

        {/* エラー表示 */}
        {error && <div className="mt-4 text-center text-token-sm text-rose">{error}</div>}

        {/* 区切り */}
        <div className="my-6 flex items-center gap-3 text-token-sm text-muted">
          <span className="h-px flex-1 bg-line-soft" />
          {t("auth.or")}
          <span className="h-px flex-1 bg-line-soft" />
        </div>

        {/* Google で続ける（下に配置） */}
        <button
          type="button"
          onClick={handleGoogle}
          className="flex items-center justify-center gap-[7px] rounded-xl border-[1.5px] border-line bg-page py-4 text-token-lg font-semibold text-ink"
        >
          <span className="text-token-xl font-bold text-google-blue">G</span>
          {t("auth.continueWithGoogle")}
        </button>

        {/* パスワードを忘れた導線（ログイン時のみ） */}
        {mode === "login" && (
          <button
            type="button"
            onClick={() => navigate({ to: "/reset-password" })}
            className="mt-5 text-center text-token-sm text-ink-sub underline"
          >
            {t("auth.forgotPassword")}
          </button>
        )}

        {/* ログイン⇄サインアップの切替（テキストリンクのまま、少し大きく太字で目立たせる） */}
        <button
          type="button"
          onClick={() => switchMode(mode === "login" ? "signup" : "login")}
          className="mt-5 text-center text-token-md font-bold text-rose underline underline-offset-4"
        >
          {mode === "login" ? t("auth.toSignup") : t("auth.toLogin")}
        </button>

        {/* 招待からの登録案内 */}
        <div className="mt-auto pt-8 text-center text-token-xs text-muted">
          {t("auth.loginNote")}
        </div>
      </div>
    </PhoneFrame>
  );
}
