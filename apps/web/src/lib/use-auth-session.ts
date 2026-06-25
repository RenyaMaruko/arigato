import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  bootstrapSession,
  getCurrentSession,
  isSessionBootstrapped,
  subscribeSession,
} from "./auth.js";

/**
 * Supabase の認証セッションを購読するフック（横断的に共有する）。
 * セッションはモジュールレベルでメモリ保持され、auth-js の onAuthStateChange で
 * 同期的に差し替えられる（lib/auth.ts）。このフックはそのメモリセッションを購読するだけで、
 * 毎回 getSession() を呼ばない（Web Locks のロック競合・固まりを避ける）。
 *
 * 初回はブートストラップ（タイムアウト保険つき）の完了を待ち、返らなくても loading を
 * 必ず解除する。staff / store 双方の認証ガードで使うため lib に置く
 * （feature 同士の直接 import を避け、横断関心は lib から共有する）。
 */
export function useAuthSession() {
  // メモリに既にあるセッションで初期化（再マウント時のちらつきを抑える）
  const [session, setSession] = useState<Session | null>(() => getCurrentSession());
  // 既にブートストラップ済みなら loading は不要
  const [loading, setLoading] = useState(() => !isSessionBootstrapped());

  useEffect(() => {
    let mounted = true;

    // メモリセッションの変化（ログイン/ログアウト/トークン更新）を購読する
    const unsubscribe = subscribeSession((next) => {
      if (!mounted) return;
      setSession(next);
      setLoading(false);
    });

    // 初回ブートストラップ（タイムアウト保険つき）。完了したら loading を解除する。
    // 既に完了済みなら即解決するため、固まらない。
    bootstrapSession().then(() => {
      if (!mounted) return;
      setSession(getCurrentSession());
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { session, loading, isAuthenticated: Boolean(session) };
}
