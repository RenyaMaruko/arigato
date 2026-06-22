/**
 * 店画面の表示用フォーマット関数（純粋関数・金額は扱わない）。
 * 受取日時を「◯時間前 / ◯日前」などの相対表記や、日付表記に整える。
 */

/**
 * ISO 文字列の日時を「たった今 / ◯分前 / ◯時間前 / ◯日前」の相対表記にする。
 * お客さまの声フィードで「いつ届いたか」を柔らかく見せるために使う。
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = now.getTime() - then.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}日前`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}週間前`;
  return formatDate(iso);
}

/**
 * ISO 文字列の日時を JST の YYYY/MM/DD 表記にする（招待日などに使う）。
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // JST（+9時間）に換算して年月日を取り出す
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}
