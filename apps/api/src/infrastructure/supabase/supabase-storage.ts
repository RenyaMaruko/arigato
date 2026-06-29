/**
 * Supabase Storage の隔離点（infrastructure 層・外部 API の隔離）。
 * feature 層からは直接 Supabase を叩かず、必ずこの infrastructure 経由で呼ぶ。
 *
 * 依存追加を避けるため SDK は使わず、Storage の REST API を fetch で直接叩く。
 *  - アップロード: POST {SUPABASE_URL}/storage/v1/object/{bucket}/{path}
 *  - 公開URL:     {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
 *  - バケット作成: POST {SUPABASE_URL}/storage/v1/bucket（public バケットを冪等に用意）
 *
 * 認証は Service key（管理アクセス）を Authorization: Bearer で付ける。
 * 秘匿値（SUPABASE_SECRET_KEY）はコードに直書きせず必ず env から読む。
 */

// 画像を保存する公開バケット名（1つに集約し、パスで avatars / logos を分ける）
export const MEDIA_BUCKET = "media";

// Supabase の接続情報（URL・Service key）を env から取得する。未設定なら明示的に失敗させる。
function getSupabaseConfig(): { url: string; serviceKey: string } {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) {
    // 秘匿値が無い状態で Storage を呼ぼうとしたら明示的に失敗させる（コードには直書きしない）
    throw new Error(
      "SUPABASE_URL / SUPABASE_SECRET_KEY が未設定です。apps/api/.env.example を参考に設定してください。",
    );
  }
  // 末尾スラッシュを取り除いて URL の組み立てを安定させる
  return { url: url.replace(/\/+$/, ""), serviceKey };
}

// Storage REST に付ける認証ヘッダを作る。
// 新方式の Secret key（sb_secret_…）は JWT ではないため、Authorization に加えて apikey ヘッダが必須。
// 旧方式（JWT の service_role）でも両方付けて問題ないため、常に両方を付ける。
function authHeaders(serviceKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };
}

// ある path の公開URL（{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}）を組み立てる
function buildPublicUrl(url: string, bucket: string, path: string): string {
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

// 公開バケットを冪等に用意する（既に存在すれば 409 が返るが無視する）。
// アップロード前に1度だけ呼べばよいよう、結果はメモリにキャッシュして連打を避ける。
let _bucketEnsured = false;
async function ensurePublicBucket(): Promise<void> {
  if (_bucketEnsured) return;
  const { url, serviceKey } = getSupabaseConfig();
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      ...authHeaders(serviceKey),
      "Content-Type": "application/json",
    },
    // public:true で公開バケット（avatar/logo はお客さま等に表示するため public read）
    body: JSON.stringify({ id: MEDIA_BUCKET, name: MEDIA_BUCKET, public: true }),
  });
  // 201（作成）か 409（既存）なら成功扱い。それ以外は失敗として投げる。
  if (res.ok || res.status === 409) {
    _bucketEnsured = true;
    return;
  }
  // 既存バケットは Supabase によっては 400「already exists」を返すこともあるため本文で判定する
  const text = await res.text().catch(() => "");
  if (text.includes("already exists") || text.includes("Duplicate")) {
    _bucketEnsured = true;
    return;
  }
  throw new Error(`Supabase バケット作成に失敗しました: ${res.status} ${text}`);
}

// アップロード結果（保存先パスと公開URL）
export type UploadResult = {
  path: string;
  publicUrl: string;
};

/**
 * 画像 1 枚を公開バケットへアップロードし、保存先パスと公開URLを返す。
 * 呼び出し側（Service）が組み立てた path（例 avatars/<staffId>/<uuid>.png）に保存する。
 * バケットは冪等に用意してから保存する。upsert=true で同一パスの差し替えも許す。
 */
export async function uploadPublicImage(params: {
  path: string;
  body: ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const { url, serviceKey } = getSupabaseConfig();
  // 公開バケットを冪等に用意する
  await ensurePublicBucket();

  // POST {SUPABASE_URL}/storage/v1/object/{bucket}/{path} に本体を直接 PUT 相当で送る
  const res = await fetch(
    `${url}/storage/v1/object/${MEDIA_BUCKET}/${params.path}`,
    {
      method: "POST",
      headers: {
        ...authHeaders(serviceKey),
        "Content-Type": params.contentType,
        // 同一パスへの再アップロード（差し替え）を許可する
        "x-upsert": "true",
      },
      // Uint8Array / ArrayBuffer をそのまま本体として送る（fetch が受け付ける）
      body: params.body as unknown as ArrayBuffer,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase 画像アップロードに失敗しました: ${res.status} ${text}`);
  }

  return {
    path: params.path,
    publicUrl: buildPublicUrl(url, MEDIA_BUCKET, params.path),
  };
}
