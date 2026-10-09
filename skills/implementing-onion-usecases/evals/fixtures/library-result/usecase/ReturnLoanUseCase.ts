import {
	Loan,
	LoanReturnedBeforeLendingError,
	LoanStatusMismatchError,
} from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import type { Timestamp } from "../domain/value-object/Timestamp";
import { err, ok, type Result } from "./result";
import { LoanNotFoundError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type ReturnLoanUseCaseProps = Readonly<{
	/** 返却する貸出の貸出番号 */
	loanNumber: LoanNumber;
}>;

export type ReturnLoanUseCaseFailure =
	| LoanNotFoundError
	| LoanStatusMismatchError
	| LoanReturnedBeforeLendingError;

/**
 * ReturnLoanUseCase
 * 貸出中の貸出の返却を記録する。
 */
export type ReturnLoanUseCase = Readonly<{
	/**
	 * 失敗は ReturnLoanUseCaseFailure の Err で返す。
	 * LoanRepository の reject（InvalidReconstructParamError を含む）は Err にせず、そのまま reject する。
	 * 同じ貸出を並行して更新すると、後から保存したほうが残る（LoanRepository.put）。
	 */
	run: (
		props: ReturnLoanUseCaseProps,
	) => Promise<Result<void, ReturnLoanUseCaseFailure>>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type ReturnLoanUseCaseDeps = Readonly<{
	loanRepository: LoanRepository;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。前回より小さい値を返さない。 */
		now: () => Timestamp;
	}>;
}>;

export function createReturnLoanUseCase(
	deps: ReturnLoanUseCaseDeps,
): ReturnLoanUseCase {
	return {
		run: async (props) => {
			const loan = await deps.loanRepository.get(props.loanNumber);
			if (loan === undefined) {
				return err(
					new LoanNotFoundError("ReturnLoanUseCase.run", props.loanNumber),
				);
			}

			let returned: Loan;
			try {
				returned = Loan.return(loan, { at: deps.clock.now() });
			} catch (error) {
				if (
					error instanceof LoanStatusMismatchError ||
					error instanceof LoanReturnedBeforeLendingError
				) {
					return err(error);
				}
				throw error;
			}
			await deps.loanRepository.put(returned);
			return ok(undefined);
		},
	};
}
