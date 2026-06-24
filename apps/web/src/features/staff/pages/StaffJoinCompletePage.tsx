import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";

/**
 * 参加完了画面（/staff/joined?store=...&status=joined|already）。
 * 招待からの参加が確定したとき「〇〇店に参加しました！」を主役に大きく見せ、ホームへ導く。
 * 既に同じ店に所属していた場合（already）は「すでに〇〇店に所属しています」と案内する。
 *
 * 多対多モデル: 参加の確定点（POST /staff/me/join）の結果（joined / already_member）を
 * status で受け取り、文言を出し分ける。店名は store クエリで受け取る。
 */
export function StaffJoinCompletePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // クエリ（参加した店名・結果区分）。直接アクセス時のフォールバックも持つ
  const { store, status } = useSearch({ from: "/staff/joined" });

  // 既に所属していた場合は案内文、新規参加なら「参加しました！」
  const isAlready = status === "already";
  const title = isAlready
    ? t("staff.alreadyMemberTitle", { store })
    : t("staff.joinedTitle", { store });
  const lead = isAlready ? t("staff.alreadyMemberLead") : t("staff.joinedLead");

  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col px-[26px] pb-[30px] pt-2">
        {/* 成功チェック（pop アニメ + 周囲の輝き）。新規参加を祝う表現 */}
        <div className="mt-16 flex justify-center">
          <div className="relative h-[108px] w-[108px] animate-pop">
            <div className="flex h-[108px] w-[108px] items-center justify-center rounded-full bg-rose text-token-display font-bold text-page">
              ✓
            </div>
            <span className="absolute -left-1 -top-1.5 animate-spark text-token-2xl text-rose-spark [animation-delay:.35s]">
              ＼
            </span>
            <span className="absolute -right-1 -top-1.5 animate-spark text-token-2xl text-rose-spark [animation-delay:.42s]">
              ／
            </span>
          </div>
        </div>

        {/* 「〇〇店に参加しました！」（既存所属なら案内文） */}
        <div className="mt-[30px] text-center text-token-2xl font-bold leading-[1.7] text-ink">
          {title}
        </div>
        <div className="mt-3 text-center text-token-md leading-[1.7] text-ink-sub">{lead}</div>

        {/* ホームへ */}
        <div className="mt-auto pt-[30px]">
          <button
            type="button"
            onClick={() => navigate({ to: "/staff" })}
            className="w-full rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
          >
            {t("staff.joinedGoHome")}
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}
