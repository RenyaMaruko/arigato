import { useQueryClient } from "@tanstack/react-query";
import type { StaffMe, TutorialKey } from "@arigato/shared";
import { apiClient } from "./api-client.js";

// staff/me のクエリキー（features/staff/hooks/useStaff.ts の STAFF_ME_KEY と同じキーでキャッシュ共有する）
const STAFF_ME_KEY = ["staff", "me"] as const;

/**
 * チュートリアルを既読にするフック（楽観更新＋裏で既読API）。
 *
 * 返す関数を呼ぶと:
 *  1. me キャッシュ（["staff","me"]）の seenTutorials にキーを即時追加する（楽観更新）。
 *     チュートリアルの表示判定はこの値を見ているため、その場で閉じる。
 *  2. 既読API（POST /staff/me/tutorials/:key/seen・冪等）を裏で叩く。
 *     失敗しても握りつぶす（リトライしない）。DB に残らなかった場合は次回再表示になるだけで許容。
 *
 * 共有コンポーネント（StoreModeSwitch）と staff feature（welcome チュートリアル）の両方から使うため、
 * feature ではなく横断の lib に置く。
 */
export function useMarkTutorialSeen() {
  const queryClient = useQueryClient();

  return (key: TutorialKey) => {
    // 【1】楽観更新: キャッシュの seenTutorials に即時追加（未取得・既読済みなら何もしない）
    queryClient.setQueryData<StaffMe | null>(STAFF_ME_KEY, (prev) => {
      if (!prev || prev.seenTutorials.includes(key)) return prev;
      return { ...prev, seenTutorials: [...prev.seenTutorials, key] };
    });

    // 【2】既読APIを裏で叩く（冪等・失敗は次回再表示で許容するため何もしない）
    void apiClient.staff.me.tutorials[":key"].seen
      .$post({ param: { key } })
      .catch(() => {
        // 通信失敗は握りつぶす（楽観更新でこのセッションは閉じたまま。次回ロードで再表示される）
      });
  };
}
