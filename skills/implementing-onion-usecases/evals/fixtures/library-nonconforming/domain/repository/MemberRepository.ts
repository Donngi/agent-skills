import type { Member } from "../entity/Member";
import type { MemberId } from "../value-object/MemberId";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

/**
 * MemberRepository
 * 利用者の永続層への入出力インターフェース。
 */
export type MemberRepository = Readonly<{
	/**
	 * 会員番号で1件取る。無ければ undefined。
	 * @throws InvalidReconstructParamError 保存されている値が壊れているとき。
	 */
	get: (id: MemberId) => Promise<Member | undefined>;
}>;
