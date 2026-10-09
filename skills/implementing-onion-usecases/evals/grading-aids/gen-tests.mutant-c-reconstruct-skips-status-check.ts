import { Book, BookStatusMismatchError } from "../domain/entity/Book";
import {
	Loan,
	type LoanSchemaInput,
	LoanStatusMismatchError,
} from "../domain/entity/Loan";
import type { BookRepository } from "../domain/repository/BookRepository";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { BookId } from "../domain/value-object/BookId";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import type { Timestamp } from "../domain/value-object/Timestamp";
import { UseCaseError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type ReturnLoanWithBookUseCaseProps = Readonly<{
	/** 返却する貸出の貸出番号 */
	loanNumber: LoanNumber;
}>;

/**
 * ReturnLoanWithBookUseCase
 * 貸出を返却し、借りていた蔵書を棚に戻す。
 */
export type ReturnLoanWithBookUseCase = Readonly<{
	/**
	 * Loan を保存したあとで Book の保存に失敗すると、返却済みの Loan は保存済みで残る。
	 * 同じ貸出や蔵書を並行して更新すると、後から保存したほうが残る（LoanRepository.put・BookRepository.put）。
	 * @throws LoanNotFoundError 貸出が無いとき。
	 * @throws BookNotFoundError 貸出が指す蔵書が無いとき。
	 * @throws LoanNotReturnableError 貸出中でないとき。cause は LoanStatusMismatchError。
	 * @throws BookNotShelvableError 蔵書が貸出中でないとき。cause は BookStatusMismatchError。
	 */
	run: (props: ReturnLoanWithBookUseCaseProps) => Promise<void>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type ReturnLoanWithBookUseCaseDeps = Readonly<{
	loanRepository: LoanRepository;
	bookRepository: BookRepository;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。前回より小さい値を返さない。 */
		now: () => Timestamp;
	}>;
}>;

export function createReturnLoanWithBookUseCase(
	deps: ReturnLoanWithBookUseCaseDeps,
): ReturnLoanWithBookUseCase {
	return {
		run: async (props) => {
			const loan = await deps.loanRepository.get(props.loanNumber);
			if (loan === undefined) {
				throw new LoanNotFoundError(
					"ReturnLoanWithBookUseCase.run",
					props.loanNumber,
				);
			}
			const book = await deps.bookRepository.get(loan.bookId);
			if (book === undefined) {
				throw new BookNotFoundError(
					"ReturnLoanWithBookUseCase.run",
					loan.bookId,
				);
			}

			const returned = Loan.reconstruct({
				...loan,
				status: "returned",
				returnedAt: deps.clock.now(),
			} as LoanSchemaInput);
			let shelved: Book;
			try {
				shelved = Book.returnToShelf(book);
			} catch (error) {
				if (error instanceof BookStatusMismatchError) {
					throw new BookNotShelvableError(
						"ReturnLoanWithBookUseCase.run",
						loan.bookId,
						{ cause: error },
					);
				}
				throw error;
			}
			await deps.loanRepository.put(returned);
			await deps.bookRepository.put(shelved);
		},
	};
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 指定された貸出番号の貸出が無かった。 */
export class LoanNotFoundError extends UseCaseError {
	override readonly name: string = "LoanNotFoundError";

	/** 指定された貸出の貸出番号 */
	readonly loanNumber: LoanNumber;

	constructor(operation: string, loanNumber: LoanNumber) {
		super(operation, `貸出 ${loanNumber} が見つかりません`);
		this.loanNumber = loanNumber;
	}
}

/** 貸出が指す ID の蔵書が無かった。 */
export class BookNotFoundError extends UseCaseError {
	override readonly name: string = "BookNotFoundError";

	/** 貸出が指す蔵書の ID */
	readonly bookId: BookId;

	constructor(operation: string, bookId: BookId) {
		super(operation, `蔵書 ${bookId} が見つかりません`);
		this.bookId = bookId;
	}
}

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

/** 貸出が指す蔵書が貸出中でなく、棚に戻せなかった。 */
export class BookNotShelvableError extends UseCaseError {
	override readonly name: string = "BookNotShelvableError";
	override readonly cause: BookStatusMismatchError;

	/** 棚に戻そうとした蔵書の ID */
	readonly bookId: BookId;

	constructor(
		operation: string,
		bookId: BookId,
		options: Readonly<{ cause: BookStatusMismatchError }>,
	) {
		super(operation, `蔵書 ${bookId} を棚に戻せません`, options);
		this.cause = options.cause;
		this.bookId = bookId;
	}
}
