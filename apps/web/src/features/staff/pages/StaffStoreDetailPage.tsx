import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StaffBottomNav } from "../components/StaffBottomNav.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe, useLeaveMembership } from "../hooks/useStaff.js";

/**
 * 所属店舗の詳細画面（/staff/stores/:membershipId）。
 * 多対多モデル（掛け持ち）で、所属（membership＝人×店）ごとの固定QR（/tip/:membershipId）を表示・印刷する。
 * 所属店舗の一覧（/staff/stores）から選んで来る。QR は固定（再発行・失効なし）。
 * 指定の所属が見つからないときは一覧へ戻す。
 */
export function StaffStoreDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // URL から対象の所属（membership）ID を受け取る
  const { membershipId } = useParams({ from: "/staff/stores/$membershipId" });
  // ログイン状態と自分のプロフィール（所属一覧＝memberships を含む）を取得
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  const meQuery = useStaffMe(isAuthenticated);
  // この店を脱退する（論理削除）。確認ダイアログの開閉は UI 状態として持つ
  const leaveMutation = useLeaveMembership();
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  // 未ログイン・未作成なら入口（認証ゲート）へ戻す。リダイレクトは副作用で行う
  const me = meQuery.data;
  const shouldRedirect = !authLoading && !meQuery.isLoading && (!isAuthenticated || !me);
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: "/staff" });
    }
  }, [shouldRedirect, navigate]);

  // 認証情報の取得中・リダイレクト待ちはローディング表示
  if (authLoading || (isAuthenticated && meQuery.isLoading) || !me) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
          {t("staff.loading")}
        </div>
      </PhoneFrame>
    );
  }

  // URL の membershipId に対応する所属を探す
  const membership = me.memberships.find((x) => x.membershipId === membershipId);

  // 該当の所属が無いとき（不正なURL・脱退済み等）は一覧へ戻す
  if (!membership) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-token-md text-ink-sub">{t("staff.homeNoStores")}</p>
          <button
            type="button"
            onClick={() => navigate({ to: "/staff/stores" })}
            className="rounded-xl bg-rose px-6 py-3 text-token-md font-bold text-page"
          >
            {t("staff.storesTitle")}
          </button>
        </div>
      </PhoneFrame>
    );
  }

  // 印刷を実行する（QR と名前のみが出るようにレイアウトしている）
  const handlePrint = () => {
    window.print();
  };

  // この店を脱退する（確認ダイアログで実行）。成功したら所属一覧へ戻す（その店は一覧から消える）。
  const handleLeave = () => {
    leaveMutation.mutate(membership.membershipId, {
      onSuccess: () => {
        setConfirmingLeave(false);
        navigate({ to: "/staff/stores" });
      },
    });
  };

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る・タイトル） */}
      <div className="flex flex-none items-center justify-between px-[22px] pb-1.5 pt-2 print:hidden">
        <button
          type="button"
          onClick={() => navigate({ to: "/staff/stores" })}
          aria-label={t("staff.back")}
          className="flex h-6 w-6 items-center justify-center text-ink"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
        <span className="text-token-2xl font-bold text-ink">{t("staff.qrTitle")}</span>
        {/* レイアウト対称のためのスペーサー */}
        <span className="h-6 w-6" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-[26px] pb-7 pt-5">
        {/* 見出し（どの店のQRかを併記する） */}
        <div className="mt-3.5 text-center text-token-lg font-bold text-ink">
          {t("staff.qrHeading")}
        </div>
        <div className="mt-1 text-center text-token-sm text-rose print:hidden">
          {t("staff.qrStoreSub", { store: membership.storeName })}
        </div>

        {/* QR 本体（印刷対象）。コーナーブラケットで装飾する */}
        <div className="mt-7 flex justify-center">
          <div className="relative p-[22px]" data-testid="staff-qr">
            {/* 四隅のローズ色ブラケット */}
            <span className="absolute left-0 top-0 h-[34px] w-[34px] rounded-tl-lg border-l-4 border-t-4 border-rose print:hidden" />
            <span className="absolute right-0 top-0 h-[34px] w-[34px] rounded-tr-lg border-r-4 border-t-4 border-rose print:hidden" />
            <span className="absolute bottom-0 left-0 h-[34px] w-[34px] rounded-bl-lg border-b-4 border-l-4 border-rose print:hidden" />
            <span className="absolute bottom-0 right-0 h-[34px] w-[34px] rounded-br-lg border-b-4 border-r-4 border-rose print:hidden" />
            {/* QR コード（印刷を想定して十分な解像度で描画する SVG）。中央にハートの目印を重ねる */}
            <div className="relative">
              <QRCodeSVG
                value={membership.tipUrl}
                size={220}
                level="H"
                marginSize={0}
                title={me.displayName}
              />
              {/* 中央のハート（読み取りに影響しないよう誤り訂正レベルを H にしている） */}
              <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-page text-token-2xl">
                ❤️
              </span>
            </div>
          </div>
        </div>

        {/* 名前（印刷時の案内・最小限） */}
        <div className="mt-5 text-center">
          <span className="text-token-xl font-bold text-ink">{me.displayName}</span>
          <span className="text-token-md text-ink"> {t("staff.san")}</span>
        </div>
        <div className="mt-1 text-center text-token-sm text-ink-sub">{membership.storeName}</div>

        {/* 案内（画面のみ・印刷では隠す） */}
        <div className="mt-5 text-center text-token-sm text-muted print:hidden">
          {t("staff.qrNote")}
        </div>

        {/* QR が指す URL（確認用・画面のみ） */}
        <div className="mt-4 break-all rounded-xl border-[1.5px] border-line bg-surface-subtle px-4 py-3 text-center print:hidden">
          <div className="text-token-xs text-ink-sub">{t("staff.qrUrlLabel")}</div>
          <div className="mt-1 text-token-sm text-ink">{membership.tipUrl}</div>
        </div>

        {/* 印刷ボタン・脱退ボタン（画面のみ） */}
        <div className="mt-auto flex flex-col gap-3 pt-8 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
          >
            {t("staff.qrPrint")}
          </button>
          {/* この店を脱退する（控えめなテキストボタン。実行は確認ダイアログを挟む） */}
          <button
            type="button"
            onClick={() => setConfirmingLeave(true)}
            className="py-2 text-center text-token-sm font-semibold text-muted underline-offset-2 hover:underline"
          >
            {t("staff.leaveStoreCta")}
          </button>
        </div>
      </div>

      {/* 脱退の確認ダイアログ（注意書き付き：脱退しても受取履歴で収益を確認できる） */}
      {confirmingLeave && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-ink/40 print:hidden">
          <div className="w-full rounded-t-2xl bg-page px-6 pb-7 pt-6">
            <h2 className="text-token-lg font-bold text-ink">{t("staff.leaveConfirmTitle")}</h2>
            <p className="mt-3 text-token-sm leading-relaxed text-ink-sub">
              {t("staff.leaveConfirmBody", { store: membership.storeName })}
            </p>
            {/* 注意書き（脱退しても受け取った収益は受取履歴で引き続き確認できます） */}
            <p className="mt-3 rounded-xl bg-rose-soft px-4 py-3 text-token-sm leading-relaxed text-rose">
              {t("staff.leaveConfirmNote")}
            </p>
            {leaveMutation.isError && (
              <p className="mt-3 text-token-sm text-rose">{t("staff.leaveError")}</p>
            )}
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleLeave}
                disabled={leaveMutation.isPending}
                className="rounded-xl bg-rose py-3.5 text-center text-token-md font-bold text-page disabled:opacity-60"
              >
                {leaveMutation.isPending ? t("staff.leaving") : t("staff.leaveConfirmCta")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingLeave(false)}
                disabled={leaveMutation.isPending}
                className="py-2 text-center text-token-sm font-semibold text-muted"
              >
                {t("staff.leaveCancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 下部ボトムナビ（現在地＝所属店舗。印刷時は隠す） */}
      <div className="print:hidden">
        <StaffBottomNav active="stores" />
      </div>
    </PhoneFrame>
  );
}
