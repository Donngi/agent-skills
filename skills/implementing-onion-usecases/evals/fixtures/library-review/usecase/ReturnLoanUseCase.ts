import type { LoanPermission } from "../domain/domain-service/LoanPermission";
import { Book, BookStatusMismatchError } from "../domain/entity/Book";
import { Loan, LoanStatusMismatchError } from "../domain/entity/Loan";
import type { BookRepository } from "../domain/repository/BookRepository";
import type { BookId } from "../domain/value-object/BookId";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import type { MemberId } from "../domain/value-object/MemberId";
import type { Timestamp } from "../domain/value-object/Timestamp";
import type { DynamoLoanRepository } from "../infrastructure/DynamoLoanRepository";
import {
	BookNotFoundError,
	LoanNotReturnableError,
	UseCaseError,
} from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type ReturnLoanUseCaseProps = Readonly<{
	/** 返却する貸出の貸出番号 */
	loanNumber: LoanNumber;
	/** 返却を記録する職員の会員番号 */
	staffId: MemberId;
}>;

/**
 * ReturnLoanUseCase
 * 貸出中の貸出の返却を記録し、蔵書を棚に戻す。
 */
export type ReturnLoanUseCase = Readonly<{
	/**
	 * Loan を保存したあとで Book の保存に失敗すると、返却済みの Loan は保存済みで残る。
	 * 同じ貸出や蔵書を並行して更新すると、後から保存したほうが残る（LoanRepository.put・BookRepository.put）。
	 * @throws ReturnNotPermittedError 職員に返却を記録する権限が無いとき。
	 * @throws LoanNotFoundError 貸出が無いとき。
	 * @throws BookNotFoundError 貸出の蔵書が無いとき。
	 * @throws LoanNotReturnableError 貸出中でないとき。cause は LoanStatusMismatchError。
	 * @throws BookNotShelvableError 蔵書が貸出中でないとき。cause は BookStatusMismatchError。
	 * @throws LoanReturnedBeforeLendingError clock が貸出日より前のタイムスタンプを返したとき。
	 */
	run: (props: ReturnLoanUseCaseProps) => Promise<void>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type ReturnLoanUseCaseDeps = Readonly<{
	loanRepository: DynamoLoanRepository;
	bookRepository: BookRepository;
	loanPermission: LoanPermission;
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
			const permitted = await deps.loanPermission.canRecordReturn(
				props.staffId,
				props.loanNumber,
			);
			if (!permitted) {
				throw new ReturnNotPermittedError(
					"ReturnLoanUseCase.run",
					props.staffId,
					props.loanNumber,
				);
			}

			const loan = await deps.loanRepository.get(props.loanNumber);
			if (loan === undefined) {
				throw new LoanNotFoundError("ReturnLoanUseCase.run", props.loanNumber);
			}
			const book = await deps.bookRepository.get(loan.bookId);
			if (book === undefined) {
				throw new BookNotFoundError("ReturnLoanUseCase.run", loan.bookId);
			}

			let returned: Loan;
			try {
				returned = Loan.return(loan, { at: deps.clock.now() });
			} catch (error) {
				if (error instanceof LoanStatusMismatchError) {
					throw new LoanNotReturnableError(
						"ReturnLoanUseCase.run",
						props.loanNumber,
						{ cause: error },
					);
				}
				throw error;
			}
			let shelved: Book;
			try {
				shelved = Book.returnToShelf(book);
			} catch (error) {
				if (error instanceof BookStatusMismatchError) {
					throw new BookNotShelvableError(
						"ReturnLoanUseCase.run",
						loan.bookId,
						{
							cause: error,
						},
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

	/** 指定された貸出番号 */
	readonly loanNumber: LoanNumber;

	constructor(operation: string, loanNumber: LoanNumber) {
		super(operation, `貸出 ${loanNumber} が見つかりません`);
		this.loanNumber = loanNumber;
	}
}

/** 返却を記録する権限の無い職員が、返却を記録しようとした。 */
export class ReturnNotPermittedError extends UseCaseError {
	override readonly name: string = "ReturnNotPermittedError";

	/** 記録しようとした職員の会員番号 */
	readonly staffId: MemberId;
	/** 返却しようとした貸出の貸出番号 */
	readonly loanNumber: LoanNumber;

	constructor(operation: string, staffId: MemberId, loanNumber: LoanNumber) {
		super(operation, `${staffId} は貸出 ${loanNumber} の返却を記録できません`);
		this.staffId = staffId;
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
