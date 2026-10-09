import { CommentLimitExceededError, Task } from "../domain/entity/Task";
import type { TaskRepository } from "../domain/repository/TaskRepository";
import {
	FatalUnreachableError,
	InvalidCreationParamError,
} from "../domain/shared-errors";
import type { TaskId } from "../domain/value-object/TaskId";
import type { Timestamp } from "../domain/value-object/Timestamp";
import type { UserId } from "../domain/value-object/UserId";
import {
	InvalidInputError,
	TaskNotFoundError,
	UseCaseError,
} from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type AddTaskCommentUseCaseProps = Readonly<{
	/** コメントを付けるタスクの ID */
	taskId: TaskId;
	/** 投稿者 */
	authorId: UserId;
	/** 本文 */
	body: string;
}>;

export type AddTaskCommentUseCaseResult = Readonly<{
	/** 追加したコメントの ID */
	commentId: string;
}>;

/**
 * AddTaskCommentUseCase
 * タスクにコメントを追加する。
 */
export type AddTaskCommentUseCase = Readonly<{
	/**
	 * 同じタスクを並行して更新すると、後から保存したほうが残る（TaskRepository.put）。
	 * @throws TaskNotFoundError タスクが無いとき。
	 * @throws CommentNotAddableError コメントの件数が上限に達しているとき。cause は CommentLimitExceededError。
	 * @throws InvalidInputError 本文などコメントの入力が不正なとき。cause は InvalidCreationParamError。
	 */
	run: (
		props: AddTaskCommentUseCaseProps,
	) => Promise<AddTaskCommentUseCaseResult>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type AddTaskCommentUseCaseDeps = Readonly<{
	taskRepository: TaskRepository;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。前回より小さい値を返さない。 */
		now: () => Timestamp;
	}>;
	idGenerator: Readonly<{
		/** 小文字の UUID v4 を返す。 */
		next: () => string;
	}>;
}>;

export function createAddTaskCommentUseCase(
	deps: AddTaskCommentUseCaseDeps,
): AddTaskCommentUseCase {
	return {
		run: async (props) => {
			const task = await deps.taskRepository.get(props.taskId);
			if (task === undefined) {
				throw new TaskNotFoundError("AddTaskCommentUseCase.run", props.taskId);
			}

			let commented: Task;
			try {
				commented = Task.addComment(
					task,
					{ authorId: props.authorId, body: props.body },
					{ clock: deps.clock, idGenerator: deps.idGenerator },
				);
			} catch (error) {
				if (error instanceof CommentLimitExceededError) {
					throw new CommentNotAddableError(
						"AddTaskCommentUseCase.run",
						props.taskId,
						{ cause: error },
					);
				}
				if (error instanceof InvalidCreationParamError) {
					throw new InvalidInputError("AddTaskCommentUseCase.run", {
						cause: error,
					});
				}
				throw error;
			}

			// 追加したコメントは末尾にある（コメントは投稿順に並ぶ）
			const added = commented.comments.at(-1);
			if (added === undefined) {
				throw new FatalUnreachableError("AddTaskCommentUseCase.run");
			}

			await deps.taskRepository.put(commented);
			return { commentId: added.id };
		},
	};
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** タスクのコメントが上限に達していて、コメントを追加できなかった。 */
export class CommentNotAddableError extends UseCaseError {
	override readonly name: string = "CommentNotAddableError";
	override readonly cause: CommentLimitExceededError;

	/** コメントを追加しようとしたタスクの ID */
	readonly taskId: TaskId;

	constructor(
		operation: string,
		taskId: TaskId,
		options: Readonly<{ cause: CommentLimitExceededError }>,
	) {
		super(
			operation,
			`タスク ${taskId} にはこれ以上コメントを追加できません`,
			options,
		);
		this.cause = options.cause;
		this.taskId = taskId;
	}
}
