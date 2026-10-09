import type * as z from "zod";
import { DomainError } from "../shared-errors";
import type { ProjectId } from "../value-object/ProjectId";
import type { TaskId } from "../value-object/TaskId";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

/**
 * TaskNumberIssuer
 * プロジェクトごとに1から始まる連番を、重複なく採番する。
 * 欠番を許す。採番した番号は、タスクを保存しなくても再利用しない。
 */
export type TaskNumberIssuer = Readonly<{
	/**
	 * @throws InvalidTaskNumberResponseError 保存先の採番結果が番号として不正なとき。
	 * @throws TaskNumberExhaustedError 番号が上限を超え、これ以上採番できないとき。
	 */
	next: (projectId: ProjectId) => Promise<TaskId>;
}>;

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 保存先の採番結果が、番号として不正だった（数でない、正の整数でない、結果が無い）。 */
export class InvalidTaskNumberResponseError extends DomainError {
	override readonly name: string = "InvalidTaskNumberResponseError";

	/** 採番しようとしたプロジェクトの識別子 */
	readonly projectId: ProjectId;

	readonly issues: readonly z.core.$ZodIssue[];

	constructor(operation: string, projectId: ProjectId, cause: z.ZodError) {
		super(operation, `${projectId} のタスク番号の採番結果が不正です`, {
			cause,
		});
		this.projectId = projectId;
		this.issues = cause.issues;
	}
}

/** 採番した番号がタスク番号の上限を超えた。以後の採番もすべて上限を超える。 */
export class TaskNumberExhaustedError extends DomainError {
	override readonly name: string = "TaskNumberExhaustedError";

	/** 採番しようとしたプロジェクトの識別子 */
	readonly projectId: ProjectId;
	/** 保存先が返した番号 */
	readonly issuedNumber: number;

	constructor(operation: string, projectId: ProjectId, issuedNumber: number) {
		super(
			operation,
			`${projectId} のタスク番号は上限に達しているので、採番できません`,
		);
		this.projectId = projectId;
		this.issuedNumber = issuedNumber;
	}
}
