import { z } from "zod";

/**
 * 画像アップロード（店員アバター・店ロゴ）の共有スキーマ・定数。
 * フロント（事前チェック）とバック（サーバ側の必須検証）で同じルールを使うため shared に置く。
 * 画像はお客さま等にも表示する公開メディアのため、Supabase Storage の公開バケットに保存する。
 */

// 許可する画像 MIME（これ以外は 400）。表示用途に十分な png / jpeg / webp に絞る。
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

// 画像サイズの上限（5MB）。これを超えるアップロードは 400。
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

// MIME → 保存時の拡張子（公開URLのパスに使う）
export const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * アップロードされた画像のメタ（MIME・サイズ）を検証する Zod スキーマ。
 * Service 層で本体を読み取る前に、まず MIME とサイズだけを機械的に弾く（過大・非画像を早期に拒否）。
 */
export const ImageUploadMetaSchema = z.object({
  // MIME は許可リストのいずれか（image/png, image/jpeg, image/webp）
  contentType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  // サイズは 1 byte 以上・上限（5MB）以下
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_IMAGE_SIZE_BYTES),
});
export type ImageUploadMeta = z.infer<typeof ImageUploadMetaSchema>;

/**
 * 画像メタ（MIME・サイズ）が許可範囲かを判定する純粋関数（true=許可）。
 * Service から呼んで検証する（不許可は呼び出し側で 400 に変換する）。
 */
export function isAllowedImageMeta(meta: { contentType: string; sizeBytes: number }): boolean {
  return ImageUploadMetaSchema.safeParse(meta).success;
}

// 店員アバターのアップロード応答（公開URL）
export const AvatarUploadResultSchema = z.object({
  avatarUrl: z.string().url(),
});
export type AvatarUploadResult = z.infer<typeof AvatarUploadResultSchema>;

// 店ロゴのアップロード応答（公開URL）
export const LogoUploadResultSchema = z.object({
  logoUrl: z.string().url(),
});
export type LogoUploadResult = z.infer<typeof LogoUploadResultSchema>;
