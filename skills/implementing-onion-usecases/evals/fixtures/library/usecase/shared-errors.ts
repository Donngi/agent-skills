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
