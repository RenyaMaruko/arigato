import { pgTable, uuid, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

/**
 * user_tutorial（チュートリアル既読）テーブル。
 * 「どのユーザーがどのチュートリアルを見たか」をアカウント（auth_user_id）に紐づけて永続する。
 * localStorage 管理だとプライベートモード・別端末で毎回再表示されるため、DB を真実の源泉にする。
 *
 * キー方式: チュートリアルの追加は tutorial_key（例: 'mode_switch' / 'welcome'）を増やすだけで
 * 済むよう、行＝「ユーザー×キー」の複合主キーにする（DB 変更は不要）。
 * キーのホワイトリストは packages/shared の Zod スキーマ（TutorialKeySchema）で検証する。
 */
export const userTutorial = pgTable(
  "user_tutorial",
  {
    // Supabase auth.users への参照（auth スキーマは Supabase 管理のため FK は張らず ID で保持。staff と同型）
    authUserId: uuid("auth_user_id").notNull(),
    // チュートリアルの識別キー（'mode_switch' / 'welcome' など。追加はキーを増やすだけ）
    tutorialKey: text("tutorial_key").notNull(),
    // 既読にした日時
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // ユーザー×キーで1行（同じチュートリアルの既読は1回だけ記録＝冪等の担保）
    pk: primaryKey({ columns: [t.authUserId, t.tutorialKey] }),
  }),
);
