import type * as z from "zod";

/** ドメイン層が投げるエラーの基底 class。 */
export abstract class DomainError extends Error {
	abstract override readonly name: string;

	/** どの操作で失敗したか。 */
	readonly operation: string;

	constructor(operation: string, message: string, options?: ErrorOptions) {
		super(`${operation}: ${message}`, options);
		this.operation = operation;
	}
}

/** `create` に渡された値が不正。 */
export class InvalidCreationParamError extends DomainError {
	override readonly name: string = "InvalidCreationParamError";

	readonly issues: readonly z.core.$ZodIssue[];

	constructor(operation: string, cause: z.ZodError) {
		super(operation, "生成に渡された値が不正です", { cause });
		this.issues = cause.issues;
	}
}
