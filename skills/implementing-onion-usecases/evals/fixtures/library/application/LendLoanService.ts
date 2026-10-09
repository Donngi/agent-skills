import { Loan } from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import type { MemberId } from "../domain/value-object/MemberId";
import type { Timestamp } from "../domain/value-object/Timestamp";
import { LoanNotFoundError } from "./errors";

// ===== 入力と公開する型 =====

export type LendLoanInput = Readonly<{
	/** 貸し出す貸出の貸出番号 */
	loanNumber: LoanNumber;
	/** 借りに来た利用者 */
	memberId: MemberId;
	/** 返却期限のタイムスタンプ */
	dueAt: Timestamp;
}>;

/**
 * LendLoanService
 * 予約済の貸出を、窓口に来た利用者に貸し出す。
 */
export type LendLoanService = Readonly<{
	/**
	 * 同じ貸出を並行して更新すると、後から保存したほうが残る（LoanRepository.put）。
	 * @throws LoanNotFoundError 貸出が無いとき。
	 * @throws LoanStatusMismatchError 予約済でないとき。
	 * @throws LoanMemberMismatchError 予約した利用者と別の利用者が借りようとしたとき。
	 * @throws LoanDueBeforeLendingError clock.now() の値より前の返却期限を渡したとき。
	 */
	execute: (input: LendLoanInput) => Promise<void>;
}>;

// ===== 組み立て =====

export type LendLoanServiceDeps = Readonly<{
	loanRepository: LoanRepository;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。 */
		now: () => Timestamp;
	}>;
}>;

export function makeLendLoanService(
	deps: LendLoanServiceDeps,
): LendLoanService {
	return {
		execute: async (input) => {
			const loan = await deps.loanRepository.get(input.loanNumber);
			if (loan === undefined) {
				throw new LoanNotFoundError(
					"LendLoanService.execute",
					input.loanNumber,
				);
			}

			const lent = Loan.lend(loan, {
				memberId: input.memberId,
				at: deps.clock.now(),
				dueAt: input.dueAt,
			});
			await deps.loanRepository.put(lent);
		},
	};
}
