import { Book } from "../domain/entity/Book";
import { Loan, LoanStatusMismatchError } from "../domain/entity/Loan";
import type { BookRepository } from "../domain/repository/BookRepository";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import type { Timestamp } from "../domain/value-object/Timestamp";
import { findBookOrThrow } from "./book-steps";
import {
	LoanNotFoundError,
	LoanNotReturnableError,
	UseCaseError,
} from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type ReturnLoanWithReviewUseCaseProps = Readonly<{
	/** 返却する貸出の貸出番号 */
	loanNumber: LoanNumber;
	/** 返却に添える書評の本文 */
	body: string;
}>;

/**
 * ReturnLoanWithReviewUseCase
 * 利用者が貸出を返却し、借りていた蔵書に書評を添える。
 */
export type ReturnLoanWithReviewUseCase = Readonly<{
	/**
	 * 同じ貸出や蔵書を並行して更新すると、後から保存したほうが残る（LoanRepository.put・BookRepository.put）。
	 * @throws LoanNotFoundError 貸出が無いとき。
	 * @throws BookNotFoundError 貸出の蔵書が無いとき。
	 * @throws LoanNotReturnableError 貸出中でないとき。cause は LoanStatusMismatchError。
	 * @throws LoanReturnedBeforeLendingError clock が貸出日より前のタイムスタンプを返したとき。
	 * @throws ReviewRejectedError 書評を足せなかったとき。
	 */
	run: (props: ReturnLoanWithReviewUseCaseProps) => Promise<void>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type ReturnLoanWithReviewUseCaseDeps = Readonly<{
	loanRepository: LoanRepository;
	bookRepository: BookRepository;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。前回より小さい値を返さない。 */
		now: () => Timestamp;
	}>;
	idGenerator: Readonly<{
		/** 小文字の UUID v4 を返す。 */
		next: () => string;
	}>;
}>;

export function createReturnLoanWithReviewUseCase(
	deps: ReturnLoanWithReviewUseCaseDeps,
): ReturnLoanWithReviewUseCase {
	return {
		run: async (props) => {
			const loan = await deps.loanRepository.get(props.loanNumber);
			if (loan === undefined) {
				throw new LoanNotFoundError(
					"ReturnLoanWithReviewUseCase.run",
					props.loanNumber,
				);
			}
			const book = await findBookOrThrow(
				deps.bookRepository,
				loan.bookId,
				"ReturnLoanWithReviewUseCase.run",
			);

			let returned: Loan;
			try {
				returned = Loan.return(loan, { at: deps.clock.now() });
			} catch (error) {
				if (error instanceof LoanStatusMismatchError) {
					throw new LoanNotReturnableError(
						"ReturnLoanWithReviewUseCase.run",
						props.loanNumber,
						{ cause: error },
					);
				}
				throw error;
			}
			await deps.loanRepository.put(returned);

			const shelved: Book = { ...book, status: "onShelf" };
			let reviewed: Book;
			try {
				reviewed = Book.addReview(
					shelved,
					{ reviewerId: loan.memberId, body: props.body },
					{ clock: deps.clock, idGenerator: deps.idGenerator },
				);
			} catch (error) {
				throw new ReviewRejectedError(
					"ReturnLoanWithReviewUseCase.run",
					props.loanNumber,
					{ cause: error },
				);
			}
			await deps.bookRepository.put(reviewed);
		},
	};
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 返却に添えた書評を、蔵書に足せなかった。 */
export class ReviewRejectedError extends UseCaseError {
	override readonly name: string = "ReviewRejectedError";

	/** 返却した貸出の貸出番号 */
	readonly loanNumber: LoanNumber;

	constructor(
		operation: string,
		loanNumber: LoanNumber,
		options?: ErrorOptions,
	) {
		super(operation, `貸出 ${loanNumber} の書評を足せませんでした`, options);
		this.loanNumber = loanNumber;
	}
}
