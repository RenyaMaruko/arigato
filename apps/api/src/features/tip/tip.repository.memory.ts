import { randomUUID } from "node:crypto";
import type {
  TipRepository,
  StaffDisplayRow,
  TipRow,
  InsertTipParams,
} from "./tip.repository.js";

/**
 * tip feature の Repository 層・インメモリ実装（DB 接続が無い環境向けフォールバック）。
 *
 * DATABASE_URL が未設定でもお客さま投げ銭フロー（表示→記録→完了）を一通り通すための実装。
 * 本物の DB と同じ TipRepository 契約を満たすため、Service / Route から見ると差し替え可能で、
 * 4層分離（Repository だけが永続化を知る）を崩さない。
 * 永続化はプロセスのメモリ上に持つ Map のみで、再起動で消える（開発・評価用途）。
 */

// 評価・デモ用に最初から入っている店員さんのサンプル表示情報
// （URL の :staffId が未知でも、安心して投げ銭フローを試せるようにする）
const sampleStaff: StaffDisplayRow = {
  staffId: "00000000-0000-0000-0000-000000000001",
  displayName: "山田 さくら",
  headline: "笑顔で接客します",
  avatarUrl: null,
  storeId: "00000000-0000-0000-0000-000000000010",
  storeName: "カフェ Arigato",
};

/**
 * インメモリの TipRepository を生成する。
 * findStaffDisplay は「どの staffId でもサンプル店員さんを返す」フォールバック挙動にして、
 * 任意の /tip/:staffId（例: /tip/test-staff-id）でも画面が成立するようにする。
 */
export function createInMemoryTipRepository(): TipRepository {
  // tipId → 保存済み tip 行
  const tips = new Map<string, TipRow>();

  return {
    // どんな staffId でもサンプル店員さんの表示情報を返す（URL の id を採用して整合させる）
    async findStaffDisplay(staffId) {
      return { ...sampleStaff, staffId };
    },

    // tip をメモリに1件保存し、保存後の行を返す
    async insertTip(params: InsertTipParams) {
      const id = randomUUID();
      const row: TipRow = {
        id,
        staffId: params.staffId,
        storeId: params.storeId,
        amount: params.amount,
        platformFee: params.platformFee,
        customerTotal: params.customerTotal,
        message: params.message,
        stamp: params.stamp,
        status: params.status,
        settlementStatus: params.settlementStatus,
      };
      tips.set(id, row);
      return row;
    },

    // 完了画面の再掲に使う tip を ID で取得
    async findTipById(tipId) {
      return tips.get(tipId) ?? null;
    },
  };
}
