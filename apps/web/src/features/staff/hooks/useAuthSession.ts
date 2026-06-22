/**
 * 認証セッション購読フックの再エクスポート。
 * 実体は横断的な lib/use-auth-session に移動した（staff / store 双方が同じ実装を共有するため）。
 * staff 側の既存 import を壊さないよう、ここからは lib の実装を再エクスポートするだけにする。
 */
export { useAuthSession } from "../../../lib/use-auth-session.js";
