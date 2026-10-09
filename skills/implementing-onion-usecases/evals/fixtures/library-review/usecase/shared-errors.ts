import type { LoanStatusMismatchError } from "../domain/entity/Loan";
import type { DomainError } from "../domain/shared-errors";
import type { BookId } from "../domain/value-object/BookId";
import type { LoanNumber } from "../domain/value-object/LoanNumber";

// -------------------------------------------------
// 基底 class
// -------------------------------------------------

/** ユースケース層が投げるエラーの基底 class。 */
export abstract class UseCaseError extends Error {
	abstract override readonly name: string;

	/** 失敗した操作 */
	readonly operation: string;

	constructor(operation: string, message: string, options?: ErrorOptions) {
		super(`${operation}: ${message}`, options);
		this.operation = operation;
	}
}

// -------------------------------------------------
// 複数のユースケースに共通のエラー
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

/** 指定された ID の蔵書が無かった。 */
export class BookNotFoundError extends UseCaseError {
	override readonly name: string = "BookNotFoundError";

	/** 指定された蔵書の ID */
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

/** 渡された入力の形が不正だった。 */
export class InvalidInputError extends UseCaseError {
	override readonly name: string = "InvalidInputError";
	override readonly cause: DomainError;

	constructor(operation: string, options: Readonly<{ cause: DomainError }>) {
		super(operation, "渡された入力が不正です", options);
		this.cause = options.cause;
	}
}
