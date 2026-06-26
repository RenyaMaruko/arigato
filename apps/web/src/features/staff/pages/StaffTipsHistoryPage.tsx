import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { StaffTipItem, SettlementStatus } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StaffBottomNav } from "../components/StaffBottomNav.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe, useStaffTips } from "../hooks/useStaff.js";
import {
  computePeriodRange,
  TIPS_PERIODS,
  type TipsPeriod,
} from "../lib/tipsFilters.js";

/**
 * 受取履歴画面（/staff/history・モック04）。
 * 自分が受け取った投げ銭を金額・メッセージ・受取日時つきで一覧表示する（本人のみ）。
 * 金額（amount）を表示するのは本人スコープのこの画面だけ（横断ルール: 金額は本人のみ）。
 */
export function StaffTipsHistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  // 自分のプロフィール（未作成・未ログインなら入口へ戻す）
  const meQuery = useStaffMe(isAuthenticated);

  // 店舗・期間フィルタの選択状態（UI 状態なので useState で持つ）。
  // storeId="" は「すべての店舗」、period="all" は「期間フィルタ無し」を表す。
  const [storeId, setStoreId] = useState<string>("");
  const [period, setPeriod] = useState<TipsPeriod>("all");

  // 所属店一覧（店舗セレクタの選択肢）
  const memberships = meQuery.data?.memberships ?? [];
  // 重複店（掛け持ちで同店が複数 membership になる可能性）を除いた店舗一覧
  const stores = useMemo(() => {
    const seen = new Set<string>();
    const list: { storeId: string; storeName: string }[] = [];
    for (const m of memberships) {
      if (!seen.has(m.storeId)) {
        seen.add(m.storeId);
        list.push({ storeId: m.storeId, storeName: m.storeName });
      }
    }
    return list;
  }, [memberships]);

  // 期間プリセット → from/to（ISO）を計算し、店舗とまとめてフィルタにする。
  // フィルタ未指定（すべて）は undefined にして API クエリに載せない。
  const filter = useMemo(() => {
    const range = computePeriodRange(period);
    return {
      storeId: storeId || undefined,
      from: range.from,
      to: range.to,
    };
  }, [storeId, period]);

  // 何らかのフィルタが効いているか（0件時の文言を「全体0件」と「条件0件」で分けるために使う）
  const hasActiveFilter = Boolean(filter.storeId || filter.from || filter.to);

  // 受取履歴（フィルタを queryKey に含めるため、フィルタ変更で自動リセット＝先頭から取り直す）
  const tipsQuery = useStaffTips(isAuthenticated && Boolean(meQuery.data), filter);

  // 未ログイン・未作成なら入口（認証ゲート）へ戻す
  const shouldRedirect =
    !authLoading && !meQuery.isLoading && (!isAuthenticated || !meQuery.data);
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: "/staff" });
    }
  }, [shouldRedirect, navigate]);

  // 無限スクロールの操作（次ページ取得・状態）
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = tipsQuery;

  // 全ページの items を1本に平坦化する（無限スクロールの表示用）。ページ追加のたびに作り直す
  const items = useMemo(
    () => tipsQuery.data?.pages.flatMap((page) => page?.items ?? []) ?? [],
    [tipsQuery.data],
  );
  // サマリーは「最初のページ」の集計値を使う（全件の総額・総件数。読み込んだ件数ではない）
  const firstPage = tipsQuery.data?.pages[0] ?? null;
  const totalAmount = firstPage?.totalAmount ?? 0;
  const totalCount = firstPage?.totalCount ?? 0;

  // 一覧末尾の番兵要素。可視になったら次ページを取得する（IntersectionObserver）
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    // 番兵が無い（空・ローディング中）か、次ページが無いなら監視しない
    if (!node || !hasNextPage) return;
    // 番兵が画面に入ったら、取得中でないときだけ次ページを取りに行く
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      // 末尾に少し近づいた時点で先読みする（体験を滑らかに）
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  // ローディング表示（認証・プロフィール・履歴のいずれか取得中）。スピナーで示す
  if (authLoading || meQuery.isLoading || !meQuery.data) {
    return <HistoryLoading />;
  }

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る・タイトル） */}
      <div className="flex flex-none items-center justify-between bg-page px-[22px] pb-3.5 pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/staff" })}
          aria-label={t("staff.back")}
          className="flex h-6 w-6 items-center justify-center text-ink"
        >
          <BackIcon />
        </button>
        <span className="text-token-2xl font-bold text-ink">{t("staff.tipsTitle")}</span>
        {/* レイアウト対称用のスペーサー */}
        <span className="h-6 w-6" />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-6 pt-4">
        {/* フィルタ行（店舗・期間）。ヘッダー直下・サマリーの上に置く。
            フィルタ変更で useStaffTips が自動リセットされ、一覧・サマリーが連動して絞られる。
            所属が1店だけのときは店舗セレクタを出さない（選びようがないため）。 */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {stores.length > 1 && (
            <FilterSelect
              ariaLabel={t("staff.tipsFilterStoreLabel")}
              value={storeId}
              onChange={setStoreId}
              options={[
                { value: "", label: t("staff.tipsFilterAllStores") },
                ...stores.map((s) => ({ value: s.storeId, label: s.storeName })),
              ]}
            />
          )}
          <FilterSelect
            ariaLabel={t("staff.tipsFilterPeriodLabel")}
            value={period}
            onChange={(v) => setPeriod(v as TipsPeriod)}
            options={TIPS_PERIODS.map((p) => ({
              value: p,
              label: t(`staff.tipsFilterPeriod${capitalize(p)}` as const),
            }))}
          />
        </div>

        {tipsQuery.isLoading ? (
          // 初回（フィルタ変更含む）ローディングはスピナーで示す（やや上寄りで中央に）
          <div className="flex flex-1 items-center justify-center pb-10">
            <Spinner />
          </div>
        ) : tipsQuery.isError ? (
          // 取得に失敗したときのエラー表示（空・ローディングと分岐・カード体裁で浮かせない）
          <div className="flex flex-1 items-center justify-center pb-10">
            <div className="rounded-xl border-[1.5px] border-line bg-surface-subtle px-6 py-6 text-center text-token-sm leading-relaxed text-ink-sub">
              {t("staff.loadError")}
            </div>
          </div>
        ) : items.length === 0 ? (
          // 0件の空表示。フィルタが効いているかで文言を分ける（全体0件 / 条件0件）。
          // ハートを淡く添えてカード体裁で見せ、ぽつんと浮かないようにする。
          <div className="flex flex-1 items-center justify-center pb-10">
            <div className="flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-line bg-surface-subtle px-8 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-soft text-rose">
                <HeartIcon />
              </span>
              <span className="text-token-sm leading-relaxed text-ink-sub">
                {hasActiveFilter ? t("staff.tipsFilteredEmpty") : t("staff.tipsEmpty")}
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* 受取サマリー（本人のみ・全店/全期間の累計・手取りベース）。
                「総受取金額」「総受取件数」の2指標を左右に並べてすっきり見せる。
                値は全件集計（最初のページの totalAmount/totalCount）で、読み込んだ件数ではない。 */}
            <div className="mb-3 rounded-2xl border border-rose-spark/50 bg-rose-soft px-5 py-4">
              <div className="flex items-stretch">
                {/* 総受取金額（手取りベース・全店/全期間・全件） */}
                <div className="flex-1">
                  <div className="text-token-xs font-semibold text-rose/80">
                    {t("staff.tipsTotalAmountLabel")}
                  </div>
                  <div className="mt-1 text-[26px] font-bold leading-none text-rose">
                    ¥{totalAmount.toLocaleString()}
                  </div>
                </div>
                {/* 区切り線 */}
                <div className="mx-4 w-px self-stretch bg-rose-spark/40" />
                {/* 総受取件数（全件） */}
                <div className="flex-1">
                  <div className="text-token-xs font-semibold text-rose/80">
                    {t("staff.tipsTotalCountLabel")}
                  </div>
                  <div className="mt-1 text-[26px] font-bold leading-none text-rose">
                    {totalCount}
                    <span className="ml-0.5 text-token-md font-bold">件</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 手取り型の補足。サマリーだけでなく一覧の各金額にも効くため、カードの外・一覧の手前に置く */}
            <p className="mb-2 px-1 text-token-xs leading-relaxed text-muted">
              {t("staff.balanceTakeNote")}
            </p>

            {/* 受取一覧（カード内に区切り線で並べる・全ページを平坦化して表示） */}
            <ul className="overflow-hidden rounded-2xl bg-page shadow-[0_2px_10px_rgba(20,20,40,.05)]">
              {items.map((item, index) => (
                <li key={item.id}>
                  {index > 0 && <div className="mx-4 h-px bg-line-soft" />}
                  <TipHistoryRow item={item} />
                </li>
              ))}
            </ul>

            {/* 無限スクロールの番兵＋次ページ取得中のローディング。
                番兵が可視になると IntersectionObserver が次ページを取りに行く。
                次ページが無くなれば番兵は描画されず、自動取得は停止する。 */}
            {hasNextPage && (
              <div ref={sentinelRef} className="flex justify-center py-5">
                {isFetchingNextPage && <Spinner size="sm" />}
              </div>
            )}
          </>
        )}
      </div>

      {/* 下部ボトムナビ（現在地＝履歴） */}
      <StaffBottomNav active="history" />
    </PhoneFrame>
  );
}

/**
 * 受取履歴の1行（日時・メッセージ・金額・着金状態）。
 * 金額は本人のみ閲覧可（この画面でのみ表示する）。
 */
function TipHistoryRow({ item }: { item: StaffTipItem }) {
  const { t } = useTranslation();
  // 受取日時を「M/D HH:mm」に整形する
  const date = new Date(item.receivedAt);
  const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;
  const timeLabel = `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  return (
    <div className="flex gap-3 p-4">
      {/* 受取日（左の日付マーカー・モック04） */}
      <div className="w-[34px] flex-none pt-[18px] text-token-base font-bold text-lang">
        {dateLabel}
      </div>
      {/* お客さまのアバター枠（お客さまは匿名のため顔写真プレースホルダ） */}
      <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-rose-soft text-rose">
        <HeartIcon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-token-xs text-muted-soft">
          {dateLabel} {timeLabel}
        </div>
        {/* 所属店名（送信時点の店） */}
        <div className="mt-0.5 truncate text-token-md font-bold text-ink">{item.storeName}</div>
        {item.message ? (
          <div className="mt-1 whitespace-pre-line text-token-sm leading-snug text-ink-sub">
            {item.message}
          </div>
        ) : (
          <div className="mt-1 text-token-sm text-muted">{t("staff.tipsNoMessage")}</div>
        )}
      </div>
      {/* 金額（本人のみ）と着金状態 */}
      <div className="flex flex-none flex-col items-end">
        <div className="text-token-lg font-bold text-ink">¥{item.amount.toLocaleString()}</div>
        <SettlementBadge status={item.settlementStatus} />
      </div>
    </div>
  );
}

/**
 * 着金状態（保留 / 着金可能 / 着金済）のバッジ。
 */
function SettlementBadge({ status }: { status: SettlementStatus }) {
  const { t } = useTranslation();
  const map: Record<SettlementStatus, { label: string; className: string }> = {
    held: {
      label: t("staff.tipsSettlementHeld"),
      className: "bg-rose-soft text-rose",
    },
    payable: {
      label: t("staff.tipsSettlementPayable"),
      className: "bg-rose-soft text-rose",
    },
    paid: {
      label: t("staff.tipsSettlementPaid"),
      className: "bg-surface-subtle text-ink-sub",
    },
    // (f) 返金・異議は終端状態。残高・送金候補から除外済みであることをバッジで示す
    refunded: {
      label: t("staff.tipsSettlementRefunded"),
      className: "bg-surface-subtle text-muted",
    },
    disputed: {
      label: t("staff.tipsSettlementDisputed"),
      className: "bg-surface-subtle text-muted",
    },
  };
  const { label, className } = map[status];
  return (
    <span
      className={`mt-2 inline-block rounded-pill px-2.5 py-0.5 text-token-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

/** 受取履歴画面のローディング表示（スマホ枠内で中央寄せ・スピナー）。 */
function HistoryLoading() {
  return (
    <PhoneFrame>
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    </PhoneFrame>
  );
}

/**
 * 回転スピナー（Tailwind の animate-spin を使った円）。
 * 初回ローディング・次ページ取得中の「読み込み中」を、文字ではなく回転円で示す。
 * 色はアクセント（ローズ系）。淡いリングに濃い1/4を重ねて回転が見えるようにする。
 * size: 初回ローディングは大きめ（md）、末尾の追加読み込みは控えめ（sm）に分ける。
 */
function Spinner({ size = "md" }: { size?: "sm" | "md" }) {
  // 大きさ・線の太さをサイズで切り替える（初回は存在感、追加読み込みは控えめ）
  const sizeClass =
    size === "sm" ? "h-5 w-5 border-2" : "h-7 w-7 border-[2.5px]";
  return (
    <span
      role="status"
      aria-label="読み込み中"
      className={`inline-block animate-spin rounded-full border-rose-soft border-t-rose ${sizeClass}`}
    />
  );
}

/**
 * フィルタ用の小さなセレクト（店舗・期間共通）。
 * ネイティブ select を「軽やかで押しやすい」ピル型に整える。
 * - 既定値（すべて/全店舗 = 先頭オプション）以外を選ぶと、効いていると分かるようローズ塗りにする
 * - 右端に小さな▾（自前 SVG）を重ね、ネイティブの矢印は appearance-none で消す
 * - 機能（value/onChange）はそのまま。スタイルとマークアップだけ。
 * インラインスタイルは使わず Tailwind ユーティリティで書く。
 */
function FilterSelect({
  ariaLabel,
  value,
  onChange,
  options,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  // 先頭オプション（すべて / すべての店舗）が既定。それ以外を選んでいたら「絞り込み中」として強調する
  const isActive = value !== options[0]?.value;

  // 選択状態に応じてピルの色を切り替える（既定=白枠、絞り込み中=ローズ塗り）
  const pillClass = isActive
    ? "border-rose bg-rose text-page"
    : "border-line bg-page text-ink-label";

  return (
    <div className="relative inline-flex">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 appearance-none rounded-pill border-[1.5px] pl-3.5 pr-8 text-token-sm font-semibold focus:outline-none focus:ring-2 focus:ring-rose-spark/60 ${pillClass}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {/* 右端の▾（クリックは下の select に通す）。色はピルの状態に合わせる */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-2.5 flex items-center ${
          isActive ? "text-page" : "text-ink-sub"
        }`}
      >
        <ChevronDownIcon />
      </span>
    </div>
  );
}

// 期間プリセットのキー（thisMonth 等）を i18n キー（...ThisMonth）の語に合わせて先頭大文字化する
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** お客さまアバター枠に置くハート（匿名のお客さまのプレースホルダ）。 */
function HeartIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 21s-7.5-4.6-10-9.2C.6 9 1.6 5.5 4.7 4.6 6.8 4 8.8 4.9 10 6.6c.4.5.7 1 .9 1.4.2-.4.5-.9.9-1.4C13 4.9 15 4 17.1 4.6c3.1.9 4.1 4.4 2.7 7.2C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

/** フィルタピル右端の下向きシェブロン（▾）。 */
function ChevronDownIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** 戻る矢印アイコン。 */
function BackIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}
