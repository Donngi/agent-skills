import type { DomainError } from "../domain/shared-errors";
import type { TaskId } from "../domain/value-object/TaskId";

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

/** 指定された ID のタスクが無かった。 */
export class TaskNotFoundError extends UseCaseError {
	override readonly name: string = "TaskNotFoundError";

	/** 指定されたタスクの ID */
	readonly taskId: TaskId;

	constructor(operation: string, taskId: TaskId) {
		super(operation, `タスク ${taskId} が見つかりません`);
		this.taskId = taskId;
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
