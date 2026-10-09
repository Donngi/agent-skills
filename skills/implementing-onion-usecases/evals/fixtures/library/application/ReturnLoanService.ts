import { Loan } from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import type { Timestamp } from "../domain/value-object/Timestamp";
import { LoanNotFoundError } from "./errors";

// ===== 入力と公開する型 =====

export type ReturnLoanInput = Readonly<{
	/** 返却する貸出の貸出番号 */
	loanNumber: LoanNumber;
}>;

/**
 * ReturnLoanService
 * 貸出中の貸出の返却を記録する。
 */
export type ReturnLoanService = Readonly<{
	/**
	 * 同じ貸出を並行して更新すると、後から保存したほうが残る（LoanRepository.put）。
	 * @throws LoanNotFoundError 貸出が無いとき。
	 * @throws LoanStatusMismatchError 貸出中でないとき。
	 * @throws LoanReturnedBeforeLendingError clock が貸出日より前のタイムスタンプを返したとき。
	 */
	execute: (input: ReturnLoanInput) => Promise<void>;
}>;

// ===== 組み立て =====

export type ReturnLoanServiceDeps = Readonly<{
	loanRepository: LoanRepository;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。 */
		now: () => Timestamp;
	}>;
}>;

export function makeReturnLoanService(
	deps: ReturnLoanServiceDeps,
): ReturnLoanService {
	return {
		execute: async (input) => {
			const loan = await deps.loanRepository.get(input.loanNumber);
			if (loan === undefined) {
				throw new LoanNotFoundError(
					"ReturnLoanService.execute",
					input.loanNumber,
				);
			}

			const returned = Loan.return(loan, { at: deps.clock.now() });
			await deps.loanRepository.put(returned);
		},
	};
}
