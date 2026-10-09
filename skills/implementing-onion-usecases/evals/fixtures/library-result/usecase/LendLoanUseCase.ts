import {
	Loan,
	LoanDueBeforeLendingError,
	LoanMemberMismatchError,
	LoanStatusMismatchError,
} from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import type { MemberId } from "../domain/value-object/MemberId";
import type { Timestamp } from "../domain/value-object/Timestamp";
import { err, ok, type Result } from "./result";
import { LoanNotFoundError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type LendLoanUseCaseProps = Readonly<{
	/** 貸し出す貸出の貸出番号 */
	loanNumber: LoanNumber;
	/** 借りに来た利用者 */
	memberId: MemberId;
	/** 返却期限のタイムスタンプ */
	dueAt: Timestamp;
}>;

export type LendLoanUseCaseFailure =
	| LoanNotFoundError
	| LoanStatusMismatchError
	| LoanMemberMismatchError
	| LoanDueBeforeLendingError;

/**
 * LendLoanUseCase
 * 予約済の貸出を、窓口に来た利用者に貸し出す。
 */
export type LendLoanUseCase = Readonly<{
	/**
	 * 失敗は LendLoanUseCaseFailure の Err で返す。
	 * LoanRepository の reject（InvalidReconstructParamError を含む）は Err にせず、そのまま reject する。
	 * 同じ貸出を並行して更新すると、後から保存したほうが残る（LoanRepository.put）。
	 */
	run: (
		props: LendLoanUseCaseProps,
	) => Promise<Result<void, LendLoanUseCaseFailure>>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type LendLoanUseCaseDeps = Readonly<{
	loanRepository: LoanRepository;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。前回より小さい値を返さない。 */
		now: () => Timestamp;
	}>;
}>;

export function createLendLoanUseCase(
	deps: LendLoanUseCaseDeps,
): LendLoanUseCase {
	return {
		run: async (props) => {
			const loan = await deps.loanRepository.get(props.loanNumber);
			if (loan === undefined) {
				return err(
					new LoanNotFoundError("LendLoanUseCase.run", props.loanNumber),
				);
			}

			let lent: Loan;
			try {
				lent = Loan.lend(loan, {
					memberId: props.memberId,
					at: deps.clock.now(),
					dueAt: props.dueAt,
				});
			} catch (error) {
				if (
					error instanceof LoanStatusMismatchError ||
					error instanceof LoanMemberMismatchError ||
					error instanceof LoanDueBeforeLendingError
				) {
					return err(error);
				}
				throw error;
			}
			await deps.loanRepository.put(lent);
			return ok(undefined);
		},
	};
}
