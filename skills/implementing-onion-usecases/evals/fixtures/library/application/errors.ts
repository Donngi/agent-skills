import type { LoanNumber } from "../domain/value-object/LoanNumber";

// ===== 基底 class =====

/** アプリケーションサービスが投げるエラーの基底 class。 */
export abstract class ApplicationError extends Error {
	abstract override readonly name: string;

	/** 失敗したサービスとメソッド。`"LendLoanService.execute"` の形。 */
	readonly operation: string;

	constructor(operation: string, message: string, options?: ErrorOptions) {
		super(`${operation}: ${message}`, options);
		this.operation = operation;
	}
}

// ===== エラー =====

/** 指定された貸出番号の貸出が無かった。 */
export class LoanNotFoundError extends ApplicationError {
	override readonly name: string = "LoanNotFoundError";

	/** 指定された貸出番号 */
	readonly loanNumber: LoanNumber;

	constructor(operation: string, loanNumber: LoanNumber) {
		super(operation, `貸出 ${loanNumber} が見つかりません`);
		this.loanNumber = loanNumber;
	}
}
