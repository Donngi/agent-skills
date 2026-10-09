import type { Loan } from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import { LoanNotFoundError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

type CommonLoanResult = Readonly<{
	loanNumber: string;
	bookId: string;
	memberId: string;
	/** メモが無ければプロパティ自体が無い。 */
	memo?: string;
}>;

export type GetLoanUseCaseProps = Readonly<{
	/** 取得する貸出の貸出番号 */
	loanNumber: LoanNumber;
}>;

export type GetLoanUseCaseResult =
	| (CommonLoanResult &
			Readonly<{
				status: "reserved";
				/** Unix epoch ミリ秒 */
				holdUntil: number;
			}>)
	| (CommonLoanResult &
			Readonly<{
				status: "lent";
				/** Unix epoch ミリ秒 */
				lentAt: number;
				/** Unix epoch ミリ秒 */
				dueAt: number;
			}>)
	| (CommonLoanResult &
			Readonly<{
				status: "returned";
				/** Unix epoch ミリ秒 */
				lentAt: number;
				/** Unix epoch ミリ秒 */
				dueAt: number;
				/** Unix epoch ミリ秒 */
				returnedAt: number;
			}>);

/**
 * GetLoanUseCase
 * 貸出を1件取得する。
 */
export type GetLoanUseCase = Readonly<{
	/**
	 * @throws LoanNotFoundError 貸出が無いとき。
	 */
	run: (props: GetLoanUseCaseProps) => Promise<GetLoanUseCaseResult>;
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
			return toGetLoanUseCaseResult(loan);
		},
	};
}

// -------------------------------------------------
// Result DTO へのマッピング
// -------------------------------------------------

function toGetLoanUseCaseResult(loan: Loan): GetLoanUseCaseResult {
	const common: CommonLoanResult = {
		loanNumber: loan.id,
		bookId: loan.bookId,
		memberId: loan.memberId,
		...(loan.memo !== undefined ? { memo: loan.memo } : {}),
	};
	switch (loan.status) {
		case "reserved":
			return { ...common, status: "reserved", holdUntil: loan.holdUntil };
		case "lent":
			return {
				...common,
				status: "lent",
				lentAt: loan.lentAt,
				dueAt: loan.dueAt,
			};
		case "returned":
			return {
				...common,
				status: "returned",
				lentAt: loan.lentAt,
				dueAt: loan.dueAt,
				returnedAt: loan.returnedAt,
			};
	}
}
