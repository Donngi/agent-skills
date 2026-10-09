import type { LoanNumber } from "../value-object/LoanNumber";
import type { MemberId } from "../value-object/MemberId";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

/**
 * LoanPermission
 * 利用者が貸出に対して何をしてよいかを、図書館の権限の設定から判定する。
 */
export type LoanPermission = Readonly<{
	/** 貸出の内容を見てよいか。本人と、その館の職員なら見てよい。 */
	canView: (memberId: MemberId, loanNumber: LoanNumber) => Promise<boolean>;
	/** 貸出の返却を記録してよいか。その館の職員だけが記録してよい。 */
	canRecordReturn: (
		memberId: MemberId,
		loanNumber: LoanNumber,
	) => Promise<boolean>;
}>;
