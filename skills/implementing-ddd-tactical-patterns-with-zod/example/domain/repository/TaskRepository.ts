import type { Task } from "../entity/Task";
import { DomainError } from "../shared-errors";
import type { ProjectId } from "../value-object/ProjectId";
import type { TaskId } from "../value-object/TaskId";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

/**
 * TaskRepository
 * タスクの永続層への入出力インターフェース。
 */
export type TaskRepository = Readonly<{
	/**
	 * 識別子で1件取る。無ければ undefined。
	 * @throws InvalidReconstructParamError 保存されている値が壊れているとき。
	 */
	get: (id: TaskId) => Promise<Task | undefined>;
	/**
	 * プロジェクト内のタスクを、タスク番号の大きい順に最大 limit 件取る。
	 * limit は0以上の整数。0 なら空の配列を返す。
	 * limit 件に満たないのは、プロジェクトのタスクがそれだけしか無いときだけである。
	 * @throws ListLimitOutOfRangeError limit が0以上の整数でないとき。
	 * @throws InvalidReconstructParamError 保存されている値が壊れているとき。
	 */
	listByProject: (
		projectId: ProjectId,
		limit: number,
	) => Promise<readonly Task[]>;
	/**
	 * 1件保存する。無ければ作り、あれば置き換える。
	 * 同時更新は検出しない。同じタスクを並行して更新すると、後から保存したほうが残る。
	 */
	put: (task: Task) => Promise<void>;
}>;

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 一覧の取得件数に、0以上の整数でない値を指定した。 */
export class ListLimitOutOfRangeError extends DomainError {
	override readonly name: string = "ListLimitOutOfRangeError";

	/** 一覧を取ろうとしたプロジェクトの識別子 */
	readonly projectId: ProjectId;
	/** 指定された件数 */
	readonly limit: number;

	constructor(operation: string, projectId: ProjectId, limit: number) {
		super(
			operation,
			`取得件数は0以上の整数です。指定された件数は ${limit} です`,
		);
		this.projectId = projectId;
		this.limit = limit;
	}
}
