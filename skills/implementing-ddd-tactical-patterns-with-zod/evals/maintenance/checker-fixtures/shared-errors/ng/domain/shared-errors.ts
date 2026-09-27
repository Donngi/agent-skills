import type * as z from "zod";
import type { ShelfId } from "./value-object/ShelfId";

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

/** 満杯の棚に置こうとした。 */
export class ShelfFullError extends DomainError {
	override readonly name: string = "ShelfFullError";

	/** 満杯だった棚の識別子 */
	readonly shelfId: ShelfId;

	constructor(operation: string, shelfId: ShelfId) {
		super(operation, "満杯の棚に置くことはできません");
		this.shelfId = shelfId;
	}
}
