import { Task, TaskStatusMismatchError } from "../domain/entity/Task";
import type { TaskRepository } from "../domain/repository/TaskRepository";
import type { TaskId } from "../domain/value-object/TaskId";
import type { Timestamp } from "../domain/value-object/Timestamp";
import type { UserId } from "../domain/value-object/UserId";
import { TaskNotFoundError, UseCaseError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type StartTaskUseCaseProps = Readonly<{
	/** 着手するタスクの ID */
	taskId: TaskId;
	/** 担当者 */
	assigneeId: UserId;
}>;

/**
 * StartTaskUseCase
 * バックログのタスクに着手する。
 */
export type StartTaskUseCase = Readonly<{
	/**
	 * 同じタスクを並行して更新すると、後から保存したほうが残る（TaskRepository.put）。
	 * @throws TaskNotFoundError タスクが無いとき。
	 * @throws TaskNotStartableError バックログでないとき。cause は TaskStatusMismatchError。
	 */
	run: (props: StartTaskUseCaseProps) => Promise<void>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type StartTaskUseCaseDeps = Readonly<{
	taskRepository: TaskRepository;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。前回より小さい値を返さない。 */
		now: () => Timestamp;
	}>;
}>;

export function createStartTaskUseCase(
	deps: StartTaskUseCaseDeps,
): StartTaskUseCase {
	return {
		run: async (props) => {
			const task = await deps.taskRepository.get(props.taskId);
			if (task === undefined) {
				throw new TaskNotFoundError("StartTaskUseCase.run", props.taskId);
			}

			let started: Task;
			try {
				started = Task.start(task, {
					assigneeId: props.assigneeId,
					at: deps.clock.now(),
				});
			} catch (error) {
				if (error instanceof TaskStatusMismatchError) {
					throw new TaskNotStartableError(
						"StartTaskUseCase.run",
						props.taskId,
						{ cause: error },
					);
				}
				throw error;
			}
			await deps.taskRepository.put(started);
		},
	};
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 指定されたタスクがバックログになく、着手できなかった。 */
export class TaskNotStartableError extends UseCaseError {
	override readonly name: string = "TaskNotStartableError";
	override readonly cause: TaskStatusMismatchError;

	/** 着手しようとしたタスクの ID */
	readonly taskId: TaskId;

	constructor(
		operation: string,
		taskId: TaskId,
		options: Readonly<{ cause: TaskStatusMismatchError }>,
	) {
		super(operation, `タスク ${taskId} に着手できません`, options);
		this.cause = options.cause;
		this.taskId = taskId;
	}
}
