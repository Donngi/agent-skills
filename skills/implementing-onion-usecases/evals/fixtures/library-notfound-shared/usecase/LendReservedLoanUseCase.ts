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
import { LoanNotFoundError, UseCaseError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type LendReservedLoanUseCaseProps = Readonly<{
	/** 貸し出す貸出の貸出番号 */
	loanNumber: LoanNumber;
	/** 借りに来た利用者 */
	memberId: MemberId;
	/** 返却期限のタイムスタンプ */
	dueAt: Timestamp;
}>;

/**
 * LendReservedLoanUseCase
 * 予約済の貸出を、窓口に来た利用者に貸し出す。
 */
export type LendReservedLoanUseCase = Readonly<{
	/**
	 * 同じ貸出を並行して更新すると、後から保存したほうが残る（LoanRepository.put）。
	 * @throws LoanNotFoundError 貸出が無いとき。
	 * @throws LoanNotLendableError 予約済でない・予約した利用者と別の利用者・clock.now() の値より前の返却期限のとき。cause は LoanStatusMismatchError・LoanMemberMismatchError・LoanDueBeforeLendingError のどれか。
	 */
	run: (props: LendReservedLoanUseCaseProps) => Promise<void>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type LendReservedLoanUseCaseDeps = Readonly<{
	loanRepository: LoanRepository;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。前回より小さい値を返さない。 */
		now: () => Timestamp;
	}>;
}>;

export function createLendReservedLoanUseCase(
	deps: LendReservedLoanUseCaseDeps,
): LendReservedLoanUseCase {
	return {
		run: async (props) => {
			const loan = await deps.loanRepository.get(props.loanNumber);
			if (loan === undefined) {
				throw new LoanNotFoundError(
					"LendReservedLoanUseCase.run",
					props.loanNumber,
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
					throw new LoanNotLendableError(
						"LendReservedLoanUseCase.run",
						props.loanNumber,
						{ cause: error },
					);
				}
				throw error;
			}
			await deps.loanRepository.put(lent);
		},
	};
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 指定された貸出を、指定された利用者と返却期限で貸し出せなかった。 */
export class LoanNotLendableError extends UseCaseError {
	override readonly name: string = "LoanNotLendableError";
	override readonly cause:
		| LoanStatusMismatchError
		| LoanMemberMismatchError
		| LoanDueBeforeLendingError;

	/** 貸し出そうとした貸出の貸出番号 */
	readonly loanNumber: LoanNumber;

	constructor(
		operation: string,
		loanNumber: LoanNumber,
		options: Readonly<{
			cause:
				| LoanStatusMismatchError
				| LoanMemberMismatchError
				| LoanDueBeforeLendingError;
		}>,
	) {
		super(operation, `貸出 ${loanNumber} を貸し出せません`, options);
		this.cause = options.cause;
		this.loanNumber = loanNumber;
	}
}
