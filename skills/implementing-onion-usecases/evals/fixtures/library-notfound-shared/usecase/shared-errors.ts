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
