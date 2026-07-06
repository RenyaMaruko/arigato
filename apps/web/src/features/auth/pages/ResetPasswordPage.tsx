import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import {
  requestPasswordReset,
  updatePassword,
  isPasswordRecoveryActive,
} from "../../../lib/auth.js";
import { validatePasswordStrength } from "../../../lib/password.js";
import { useAuthSession } from "../../../lib/use-auth-session.js";

/**
 * パスワード再設定ページ（/reset-password）。
 * 2つのモードを1画面で扱う:
 *  - リセット申請: 登録メールに再設定リンクを送る（resetPasswordForEmail）。
 *  - 新パスワード設定: 再設定メールのリンクから復帰したとき（PASSWORD_RECOVERY セッション）、
 *    新しいパスワードを入力して確定する（updateUser）。
 * どちらのモードかは isPasswordRecoveryActive() で判定する。
 * useAuthSession を購読することで、リンク復帰でセッションが確立した際に再描画されモードが切り替わる。
 */
export function ResetPasswordPage() {
  // セッション購読（リンク復帰でセッションが確立すると再描画され、recovery モードに切り替わる）
  useAuthSession();
  // 再設定リンク経由の復帰中か（新パスワード設定モード）
  const recovery = isPasswordRecoveryActive();
  return recovery ? <SetNewPasswordForm /> : <RequestResetForm />;
}

/**
 * リセット申請モード（メールアドレスを入力して再設定リンクを送る）。
 */
function RequestResetForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 再設定メールを送る
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() === "" || busy) return;
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch {
      setError(t("auth.resetError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PhoneFrame>
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-6 pb-7 pt-2">
        {/* 見出し */}
        <div className="mt-10 text-center">
          <div className="text-token-3xl font-bold text-ink">{t("auth.resetTitle")}</div>
        </div>

        {sent ? (
          /* 送信後の案内 */
          <div className="mt-8 rounded-xl border-[1.5px] border-line bg-surface-subtle px-5 py-6 text-center text-token-md leading-relaxed text-ink">
            {t("auth.resetSentLead")}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col">
            <div className="text-token-md text-ink-sub">{t("auth.resetRequestLead")}</div>
            <label className="mt-6 text-token-sm text-ink-sub" htmlFor="reset-email">
              {t("auth.emailLabel")}
            </label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-6 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
            >
              {t("auth.resetSubmit")}
            </button>
          </form>
        )}

        {error && <div className="mt-4 text-center text-token-sm text-rose">{error}</div>}

        {/* ログインへ戻る */}
        <button
          type="button"
          onClick={() => navigate({ to: "/login" })}
          className="mt-auto pt-8 text-center text-token-sm text-ink-sub underline"
        >
          {t("auth.backToLogin")}
        </button>
      </div>
    </PhoneFrame>
  );
}

/**
 * 新パスワード設定モード（再設定リンクからの復帰後）。
 */
function SetNewPasswordForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 新しいパスワードを確定する（強度・一致を検証してから更新）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    // パスワード強度（最低8文字）を検証
    const check = validatePasswordStrength(password);
    if (!check.valid) {
      setError(check.reason === "empty" ? t("auth.passwordEmpty") : t("auth.passwordTooShort"));
      return;
    }
    // 確認入力との一致を検証
    if (password !== confirm) {
      setError(t("auth.newPasswordMismatch"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch {
      setError(t("auth.resetError"));
    } finally {
      setBusy(false);
    }
  };

  // 変更完了画面
  if (done) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-6 pb-7 pt-2">
          <div className="mt-10 text-center">
            <div className="text-token-3xl font-bold text-ink">
              {t("auth.newPasswordDoneTitle")}
            </div>
          </div>
          <div className="mt-8 rounded-xl border-[1.5px] border-line bg-surface-subtle px-5 py-6 text-center text-token-md leading-relaxed text-ink">
            {t("auth.newPasswordDoneLead")}
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/staff" })}
            className="mt-8 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
          >
            {t("auth.toHome")}
          </button>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-6 pb-7 pt-2">
        <div className="mt-10 text-center">
          <div className="text-token-3xl font-bold text-ink">{t("auth.newPasswordTitle")}</div>
          <div className="mt-2 text-token-md text-ink-sub">{t("auth.newPasswordLead")}</div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col">
          <label className="text-token-sm text-ink-sub" htmlFor="new-password">
            {t("auth.newPasswordLabel")}
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          <label className="mt-5 text-token-sm text-ink-sub" htmlFor="new-password-confirm">
            {t("auth.newPasswordConfirmLabel")}
          </label>
          <input
            id="new-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          <button
            type="submit"
            disabled={busy}
            className="mt-6 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
          >
            {t("auth.newPasswordSubmit")}
          </button>
        </form>

        {error && <div className="mt-4 text-center text-token-sm text-rose">{error}</div>}
      </div>
    </PhoneFrame>
  );
}
