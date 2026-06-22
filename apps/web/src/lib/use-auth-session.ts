import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./auth.js";

/**
 * Supabase の認証セッションを購読するフック（横断的に共有する）。
 * 初回にセッションを取得し、以降は onAuthStateChange で変化を反映する。
 * ログイン/ログアウト・OAuth リダイレクト後の復帰を画面に伝える。
 *
 * staff / store 双方の認証ガードで使うため、特定 feature ではなく lib に置く
 * （feature 同士の直接 import を避け、横断関心は lib から共有する）。
 */
export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  // 初回のセッション取得が終わるまでは loading（ガードで画面を出し分ける）
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // 初回セッションを取得する
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    // セッション変化（ログイン/ログアウト/トークン更新）を購読する
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading, isAuthenticated: Boolean(session) };
}
