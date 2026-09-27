import type { Loan } from "../entity/Loan";
import type { LibraryCode } from "../value-object/LibraryCode";
import type { LoanNumber } from "../value-object/LoanNumber";
import type { MemberId } from "../value-object/MemberId";

/**
 * LoanRepository
 * 貸出の永続層への入出力インターフェース。
 */
export type LoanRepository = Readonly<{
	/**
	 * 貸出番号で1件取る。無ければ undefined。
	 * @throws InvalidReconstructParamError 保存されている値が壊れているとき。
	 */
	get: (id: LoanNumber) => Promise<Loan | undefined>;
	/**
	 * 同じ館の貸出を貸出番号の昇順に取る。
	 * @throws InvalidReconstructParamError 保存されている値が壊れているとき。
	 */
	listByLibrary: (
		libraryCode: LibraryCode,
		limit: number,
	) => Promise<readonly Loan[]>;
	/**
	 * 同じ利用者の貸出を貸出番号の昇順に取る。館をまたいで返す。
	 * @throws InvalidReconstructParamError 保存されている値が壊れているとき。
	 */
	listByMember: (memberId: MemberId, limit: number) => Promise<readonly Loan[]>;
	/** 1件保存する。無ければ作り、あれば置き換える。 */
	put: (loan: Loan) => Promise<void>;
}>;
