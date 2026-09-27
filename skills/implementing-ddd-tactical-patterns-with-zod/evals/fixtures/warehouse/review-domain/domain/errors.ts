import type * as z from "zod";
import type { StockItemId } from "./value-object/StockItemId";

// -------------------------------------------------
// 基底 class
// -------------------------------------------------

/** ドメイン層が投げるエラーの基底 class。 */
export abstract class DomainError extends Error {
	abstract override readonly name: string;

	/** どの操作で失敗したか。`"StockItem.ship"` のようにモデル名を含める。 */
	readonly operation: string;

	constructor(operation: string, message: string, options?: ErrorOptions) {
		super(`${operation}: ${message}`, options);
		this.operation = operation;
	}
}

// -------------------------------------------------
// ドメインエラー群
// -------------------------------------------------

/**
 * `create` に渡された値が不正。
 * 呼び出し側が入力を直せる。
 */
export class InvalidCreationParamError extends DomainError {
	override readonly name: string = "InvalidCreationParamError";

	readonly issues: readonly z.core.$ZodIssue[];

	constructor(operation: string, cause: z.ZodError) {
		super(operation, "生成に渡された値が不正です", { cause });
		this.issues = cause.issues;
	}
}

/**
 * 復元対象の保存値が不正。
 * 呼び出し側には直せない。
 */
export class InvalidReconstructParamError extends DomainError {
	override readonly name: string = "InvalidReconstructParamError";

	readonly issues: readonly z.core.$ZodIssue[];

	constructor(operation: string, cause: z.ZodError) {
		super(operation, "復元に渡された値が不正です", { cause });
		this.issues = cause.issues;
	}
}

/** 前提条件を満たさない呼び出しがあった。 */
export class PreconditionError extends DomainError {
	override readonly name: string = "PreconditionError";
}

/** ロットを追加すると件数が上限を超えるため、追加を拒否した。 */
export class LotLimitExceededError extends DomainError {
	override readonly name: string = "LotLimitExceededError";

	/** 失敗した在庫の識別子 */
	readonly stockItemId: StockItemId;
	/** 上限の件数 */
	readonly limit: number;

	constructor(operation: string, stockItemId: StockItemId, limit: number) {
		super(operation, `ロットは${limit}件までです`);
		this.stockItemId = stockItemId;
		this.limit = limit;
	}
}

// -------------------------------------------------
// 到達しないはずの分岐
// -------------------------------------------------

/**
 * 絶対に通らないはずだが、型の都合で書かざるを得ない分岐に入った。
 * `DomainError` を継承しないので、業務の失敗として扱う層には拾われない。
 */
export class FatalUnreachableError extends Error {
	override readonly name: string = "FatalUnreachableError";

	/** どの操作の分岐か。`"StockItem.ship"` のようにモデル名を含める。 */
	readonly operation: string;

	constructor(operation: string, cause?: unknown) {
		super(
			`${operation}: 到達しないはずの分岐に入りました`,
			cause === undefined ? undefined : { cause },
		);
		this.operation = operation;
	}
}
