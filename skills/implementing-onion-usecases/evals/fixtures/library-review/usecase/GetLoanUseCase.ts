import type { Loan } from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import { LoanNotFoundError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type GetLoanUseCaseProps = Readonly<{
	/** 取得する貸出の貸出番号 */
	loanNumber: LoanNumber;
}>;

/**
 * GetLoanUseCase
 * 貸出を1件取得する。ドライビングアダプタ（REST のコントローラ）から呼ばれ、LoanRepository ポートから読み出す。
 */
export type GetLoanUseCase = Readonly<{
	/**
	 * @throws LoanNotFoundError 貸出が無いとき。
	 */
	run: (props: GetLoanUseCaseProps) => Promise<Loan>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type GetLoanUseCaseDeps = Readonly<{
	loanRepository: LoanRepository;
}>;

export function createGetLoanUseCase(deps: GetLoanUseCaseDeps): GetLoanUseCase {
	return {
		run: async (props) => {
			const loan = await deps.loanRepository.get(props.loanNumber);
			if (loan === undefined) {
				throw new LoanNotFoundError("GetLoanUseCase.run", props.loanNumber);
			}
			return loan;
		},
	};
}
