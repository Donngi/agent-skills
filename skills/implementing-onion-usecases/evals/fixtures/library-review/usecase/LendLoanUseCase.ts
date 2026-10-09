import {
	Loan,
	LoanDueBeforeLendingError,
	LoanMemberMismatchError,
	LoanStatusMismatchError,
} from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import type { MemberId } from "../domain/value-object/MemberId";
import { Timestamp } from "../domain/value-object/Timestamp";
import { UseCaseError } from "./shared-errors";

/** 一度に貸し出せる期間。14日（ミリ秒）。 */
const MAX_LOAN_PERIOD = 14 * 24 * 60 * 60 * 1000;

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type LendLoanUseCaseProps = Readonly<{
	/** 貸し出す貸出の貸出番号 */
	loanNumber: LoanNumber;
	/** 借りに来た利用者の会員番号 */
	memberId: MemberId;
	/** 返却期限 */
	dueAt: Timestamp;
}>;

/**
 * LendLoanUseCase
 * 予約済の貸出を貸し出す。
 */
export type LendLoanUseCase = Readonly<{
	/**
	 * 同じ貸出を並行して更新すると、後から保存したほうが残る（LoanRepository.put）。
	 * @throws LoanNotFoundError 貸出が無いとき。
	 * @throws LoanPeriodTooLongError 返却期限が貸出日から14日を超えるとき。
	 * @throws LoanNotLendableError 予約済でない・予約した利用者と別の利用者・貸出日より前の返却期限のとき。cause は LoanStatusMismatchError・LoanMemberMismatchError・LoanDueBeforeLendingError のどれか。
	 * @throws InvalidReconstructParamError 保存されている貸出が壊れているとき。operation は Loan.reconstruct。
	 */
	run: (props: LendLoanUseCaseProps) => Promise<void>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type LendLoanUseCaseDeps = Readonly<{
	loanRepository: LoanRepository;
	clock: Readonly<{
		/** Unix epoch ミリ秒を返す。前に返した値より小さい値を返さない。 */
		now: () => number;
	}>;
}>;

export function createLendLoanUseCase(
	deps: LendLoanUseCaseDeps,
): LendLoanUseCase {
	return {
		run: async (props) => {
			const loan = await deps.loanRepository.get(props.loanNumber);
			if (loan === undefined) {
				throw new LoanNotFoundError("LendLoanUseCase.run", props.loanNumber);
			}

			const at = Timestamp.create(deps.clock.now());
			if (props.dueAt - at > MAX_LOAN_PERIOD) {
				throw new LoanPeriodTooLongError(
					"LendLoanUseCase.run",
					props.loanNumber,
					props.dueAt,
				);
			}

			let lent: Loan;
			try {
				lent = Loan.lend(loan, {
					memberId: props.memberId,
					at,
					dueAt: props.dueAt,
				});
			} catch (error) {
				if (
					error instanceof LoanStatusMismatchError ||
					error instanceof LoanMemberMismatchError ||
					error instanceof LoanDueBeforeLendingError
				) {
					throw new LoanNotLendableError(
						"LendLoanUseCase.run",
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

/** 指定された貸出番号の貸出が無かった。 */
export class LoanNotFoundError extends UseCaseError {
	override readonly name: string = "LoanNotFoundError";

	/** 指定された貸出番号 */
	readonly loanNumber: LoanNumber;

	constructor(operation: string, loanNumber: LoanNumber) {
		super(operation, `貸出 ${loanNumber} が見つかりません`);
		this.loanNumber = loanNumber;
	}
}

/** 返却期限が、貸出日から貸し出せる期間を超えていた。 */
export class LoanPeriodTooLongError extends UseCaseError {
	override readonly name: string = "LoanPeriodTooLongError";

	/** 貸し出そうとした貸出の貸出番号 */
	readonly loanNumber: LoanNumber;
	/** 渡された返却期限 */
	readonly dueAt: Timestamp;

	constructor(operation: string, loanNumber: LoanNumber, dueAt: Timestamp) {
		super(operation, "返却期限は貸出日から14日以内です");
		this.loanNumber = loanNumber;
		this.dueAt = dueAt;
	}
}

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
