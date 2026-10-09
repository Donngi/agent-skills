import { Loan, LoanStatusMismatchError } from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import type { Timestamp } from "../domain/value-object/Timestamp";
import { LoanNotFoundError, UseCaseError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type ReturnLentLoanUseCaseProps = Readonly<{
	/** 返却する貸出の貸出番号 */
	loanNumber: LoanNumber;
}>;

/**
 * ReturnLentLoanUseCase
 * 貸出中の貸出の返却を記録する。
 */
export type ReturnLentLoanUseCase = Readonly<{
	/**
	 * 同じ貸出を並行して更新すると、後から保存したほうが残る（LoanRepository.put）。
	 * @throws LoanNotFoundError 貸出が無いとき。
	 * @throws LoanNotReturnableError 貸出中でないとき。cause は LoanStatusMismatchError。
	 */
	run: (props: ReturnLentLoanUseCaseProps) => Promise<void>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type ReturnLentLoanUseCaseDeps = Readonly<{
	loanRepository: LoanRepository;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。前回より小さい値を返さない。 */
		now: () => Timestamp;
	}>;
}>;

export function createReturnLentLoanUseCase(
	deps: ReturnLentLoanUseCaseDeps,
): ReturnLentLoanUseCase {
	return {
		run: async (props) => {
			const loan = await deps.loanRepository.get(props.loanNumber);
			if (loan === undefined) {
				throw new LoanNotFoundError(
					"ReturnLentLoanUseCase.run",
					props.loanNumber,
				);
			}

			let returned: Loan;
			try {
				returned = Loan.return(loan, { at: deps.clock.now() });
			} catch (error) {
				if (error instanceof LoanStatusMismatchError) {
					throw new LoanNotReturnableError(
						"ReturnLentLoanUseCase.run",
						props.loanNumber,
						{ cause: error },
					);
				}
				throw error;
			}
			await deps.loanRepository.put(returned);
		},
	};
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 指定された貸出が貸出中でなく、返却できなかった。 */
export class LoanNotReturnableError extends UseCaseError {
	override readonly name: string = "LoanNotReturnableError";
	override readonly cause: LoanStatusMismatchError;

	/** 返却しようとした貸出の貸出番号 */
	readonly loanNumber: LoanNumber;

	constructor(
		operation: string,
		loanNumber: LoanNumber,
		options: Readonly<{ cause: LoanStatusMismatchError }>,
	) {
		super(operation, `貸出 ${loanNumber} を返却できません`, options);
		this.cause = options.cause;
		this.loanNumber = loanNumber;
	}
}
