/**
 * パスワード強度の検証（純粋関数・テスト対象）。
 * サインアップ／パスワード再設定のフロントバリデーションに使う。
 * Supabase 側のポリシー（最低文字数）と整合するよう、最低 8 文字を必須にする。
 * 認証（Supabase）呼び出しを含めないことで、副作用なくユニットテストできるよう lib に切り出す。
 */

// パスワードの最低文字数（Supabase のポリシーと揃える）
export const PASSWORD_MIN_LENGTH = 8;

// 検証結果。valid=false のときは reason で理由を返し、画面は対応する文言を出す
export type PasswordValidationResult =
  | { valid: true }
  | { valid: false; reason: "empty" | "too_short" };

/**
 * パスワードが要件（未入力でない・8文字以上）を満たすか判定する。
 * 弱すぎる入力（空・極端に短い）を弾くための最小限のルール。
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  // 未入力（空文字）は弾く
  if (password.length === 0) {
    return { valid: false, reason: "empty" };
  }
  // 最低文字数に満たないものは弾く
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, reason: "too_short" };
  }
  return { valid: true };
}
