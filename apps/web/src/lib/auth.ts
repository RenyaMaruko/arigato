import { createClient, type Session } from "@supabase/supabase-js";

/**
 * Supabase Auth クライアントとログイン処理（フロントの認証集約）。
 * 発行は Supabase。メール（マジックリンク/パスワード）と Google でのサインイン・サインアップに対応する。
 * バックへは Supabase が発行した access token（JWT）を Authorization: Bearer で送り、
 * バックは JWKS で検証する（共有 Secret は使わない）。
 *
 * 【固まり対策の方針（恒久対応）】
 * auth-js の navigator Web Locks（lock:sb-…-auth-token）の孤立ロックで
 * getSession()/getUser() が永久ハングする既知問題があるため、以下で構造的に回避する:
 *  1. セッションをモジュールレベルでメモリ保持し、毎リクエストの getSession() を呼ばない。
 *  2. createClient に no-op ロックを渡し、Web Locks を完全バイパスする。
 *  3. 起動時の初回 getSession() にタイムアウトを付け、返らなくても loading を必ず解除する。
 *  4. persistSession / autoRefreshToken は維持し、自動ログイン（持続性）は不変。
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

/**
 * navigator Web Locks をバイパスする no-op ロック関数。
 * auth-js はトークン更新等でロックを取りに行くが、孤立ロックでデッドロックする既知不具合があるため、
 * ロックを取らずにそのまま処理を実行する（公式 discussion #35069 のパターン）。
 *
 * トレードオフ：複数タブが同時刻にトークン更新を競合した場合、片方がサインアウトする可能性がある。
 * ただし固まり（永久ハング）の根絶を優先し、ここではロックを無効化する。
 */
const noOpLock = async <T>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>,
): Promise<T> => {
  return fn();
};

// Supabase クライアント（セッションは localStorage に永続化し、ページ再読込でログインを保つ）
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Web Locks を無効化してロックのデッドロックを構造的に防ぐ
    lock: noOpLock,
  },
});

// 現在のセッションのメモリキャッシュ（onAuthStateChange で同期的に差し替える）。
// API クライアントや購読フックはここを参照し、毎回 getSession() を呼ばない。
let currentSession: Session | null = null;

// 初回ブートストラップが完了したか（getSession の初回解決 or タイムアウトで true になる）
let bootstrapped = false;

// メモリセッション変化の購読者（useAuthSession などが登録し、変化時に通知を受ける）
type Subscriber = (session: Session | null) => void;
const subscribers = new Set<Subscriber>();

// 購読者全員に現在のメモリセッションを通知する
function notify() {
  for (const sub of subscribers) {
    sub(currentSession);
  }
}

/**
 * メモリセッションの変化を購読する（解除関数を返す）。
 * 購読フック（useAuthSession）が同じメモリセッションを共有するために使う。
 */
export function subscribeSession(sub: Subscriber): () => void {
  subscribers.add(sub);
  return () => {
    subscribers.delete(sub);
  };
}

// パスワード再設定リンクからの復帰中か（PASSWORD_RECOVERY イベントで true になる）。
// 再設定ページはこのフラグを見て「新しいパスワードを設定」フォームを出す。
let passwordRecoveryActive = false;

/**
 * パスワード再設定リンク経由での復帰中かを返す（再設定ページのモード判定に使う）。
 */
export function isPasswordRecoveryActive(): boolean {
  return passwordRecoveryActive;
}

// 認証イベントを購読し、メモリセッションを同期的に差し替える。
// 重要：このコールバック内では await する Supabase 呼び出しをしない（デッドロック回避）。
// INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT / PASSWORD_RECOVERY を反映する。
supabase.auth.onAuthStateChange((event, session) => {
  currentSession = session;
  bootstrapped = true;
  // パスワード再設定リンクからの復帰は recovery セッションを伴う。
  // 再設定ページが新パスワード設定フォームを出せるようフラグを立てる。
  if (event === "PASSWORD_RECOVERY") {
    passwordRecoveryActive = true;
  }
  notify();
});

/**
 * 起動時の初回セッション取得（タイムアウト保険つき）。
 * getSession() が孤立ロックで返らない場合に備え、所定時間で諦めて未取得として確定する。
 * これにより loading が永久に解除されない（固まる）事態を防ぐ。
 *
 * 既に onAuthStateChange（INITIAL_SESSION）で確定済みなら何もしない。
 */
const BOOTSTRAP_TIMEOUT_MS = 3000;
let bootstrapPromise: Promise<void> | null = null;

export function bootstrapSession(): Promise<void> {
  // 既に確定済みなら即座に解決
  if (bootstrapped) {
    return Promise.resolve();
  }
  // 進行中のブートストラップがあれば使い回す
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      bootstrapped = true;
      notify();
      resolve();
    };

    // タイムアウト保険：返らなければ「未取得」として loading を解除する
    const timer = setTimeout(finish, BOOTSTRAP_TIMEOUT_MS);

    // 初回のみ getSession を呼ぶ（以降はメモリ＋listener で運用）
    supabase.auth
      .getSession()
      .then(({ data }) => {
        // onAuthStateChange が先に確定済みなら上書きしない
        if (!settled && !currentSession) {
          currentSession = data.session;
        }
      })
      .catch(() => {
        // 取得失敗は未ログイン扱い（loading は必ず解除する）
      })
      .finally(() => {
        clearTimeout(timer);
        finish();
      });
  });

  return bootstrapPromise;
}

/**
 * 現在のセッションの access token（JWT）を返す（メモリ参照・同期）。
 * 毎回 supabase.auth.getSession() を呼ばないことでロック競合の入口を増やさない。
 * autoRefreshToken が裏で更新し、TOKEN_REFRESHED でメモリが差し替わるため常に新鮮。
 */
export function getAccessToken(): string | null {
  return currentSession?.access_token ?? null;
}

/**
 * 現在のメモリセッションを返す（未ログインなら null・同期）。
 */
export function getCurrentSession(): Session | null {
  return currentSession;
}

/**
 * 初回ブートストラップが完了しているか（loading 解除の判定に使う）。
 */
export function isSessionBootstrapped(): boolean {
  return bootstrapped;
}

/**
 * メール＋パスワードで新規登録（サインアップ）する。
 * 登録時メール確認あり。確認リンクをクリックすると emailRedirectTo に戻り、
 * セッションが確立して初回フロー（プロフィール作成）へ進む。
 * 確認前はログインできない（Supabase の email confirmation 設定に依存）。
 *
 * 統合アカウント方針のため店員/店舗で分けず、戻り先は共通の店員ホーム入口（/staff）にする。
 */
export async function signUpWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // メール確認リンクからの復帰先（確認後の起点）。全員まず /staff に着地する。
      emailRedirectTo: `${window.location.origin}/staff`,
    },
  });
  if (error) {
    throw error;
  }
}

/**
 * メール＋パスワードでログイン（サインイン）する。
 * メール未確認のアカウントは Supabase 側でエラーになる（確認前はログイン不可）。
 */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
}

/**
 * Google でサインイン/サインアップ（OAuth リダイレクト）。
 * 統合アカウント方針のため店員/店舗で分けず、戻り先は共通の店員ホーム入口（/staff）にする。
 */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/staff`,
    },
  });
  if (error) {
    throw error;
  }
}

/**
 * パスワード再設定メールを送る（リセット申請）。
 * メール内リンクをクリックすると redirectTo（再設定ページ）へ戻り、
 * PASSWORD_RECOVERY セッションが確立して新しいパスワードを設定できる。
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // 再設定リンクからの戻り先（新パスワード設定フォームを出すページ）
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) {
    throw error;
  }
}

/**
 * ログイン中（または再設定リンクで復帰した）ユーザーのパスワードを更新する。
 * パスワード再設定ページで新しいパスワードを確定するのに使う。
 */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    throw error;
  }
  // 注意: ここで recovery フラグを落とさない。
  // updateUser は USER_UPDATED を発火して再設定ページを再描画させるが、
  // フラグを落とすと親が「申請フォーム」へ切り替わり、変更完了画面を見せられなくなる。
  // フラグはメモリ保持のみで、ページ再読込（次回のモジュール初期化）で自然にリセットされる。
}

/**
 * サインアウトする。
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
