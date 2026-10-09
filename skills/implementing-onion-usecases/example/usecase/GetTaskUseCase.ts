import type { Task } from "../domain/entity/Task";
import type { TaskRepository } from "../domain/repository/TaskRepository";
import type { TaskId } from "../domain/value-object/TaskId";
import { TaskNotFoundError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

type CommonTaskResult = Readonly<{
	id: string;
	title: string;
	priority: "highest" | "high" | "medium" | "low" | "lowest";
	labels: readonly string[];
	creatorId: string;
	/** Unix epoch ミリ秒 */
	createdAt: number;
	/** PR が無ければプロパティ自体が無い。 */
	pullRequestUrl?: string;
	comments: readonly Readonly<{
		id: string;
		authorId: string;
		body: string;
		/** Unix epoch ミリ秒 */
		postedAt: number;
	}>[];
}>;

export type GetTaskUseCaseProps = Readonly<{
	/** 取得するタスクの ID */
	taskId: TaskId;
}>;

export type GetTaskUseCaseResult =
	| (CommonTaskResult & Readonly<{ status: "backlog" }>)
	| (CommonTaskResult &
			Readonly<{
				status: "inProgress";
				assigneeId: string;
				/** Unix epoch ミリ秒 */
				startedAt: number;
			}>)
	| (CommonTaskResult &
			Readonly<{
				status: "done";
				assigneeId: string;
				/** Unix epoch ミリ秒 */
				startedAt: number;
				/** Unix epoch ミリ秒 */
				completedAt: number;
			}>);

/**
 * GetTaskUseCase
 * タスクを1件取得する。
 */
export type GetTaskUseCase = Readonly<{
	/**
	 * @throws TaskNotFoundError タスクが無いとき。
	 */
	run: (props: GetTaskUseCaseProps) => Promise<GetTaskUseCaseResult>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type GetTaskUseCaseDeps = Readonly<{
	taskRepository: TaskRepository;
}>;

export function createGetTaskUseCase(deps: GetTaskUseCaseDeps): GetTaskUseCase {
	return {
		run: async (props) => {
			const task = await deps.taskRepository.get(props.taskId);
			if (task === undefined) {
				throw new TaskNotFoundError("GetTaskUseCase.run", props.taskId);
			}
			return toGetTaskUseCaseResult(task);
		},
	};
}

// -------------------------------------------------
// Result DTO へのマッピング
// -------------------------------------------------

function toGetTaskUseCaseResult(task: Task): GetTaskUseCaseResult {
	const common: CommonTaskResult = {
		id: task.id,
		title: task.title,
		priority: task.priority,
		labels: [...task.labels],
		creatorId: task.creatorId,
		createdAt: task.createdAt,
		...(task.pullRequestUrl !== undefined
			? { pullRequestUrl: task.pullRequestUrl }
			: {}),
		comments: task.comments.map((c) => ({
			id: c.id,
			authorId: c.authorId,
			body: c.body,
			postedAt: c.postedAt,
		})),
	};
	switch (task.status) {
		case "backlog":
			return { ...common, status: "backlog" };
		case "inProgress":
			return {
				...common,
				status: "inProgress",
				assigneeId: task.assigneeId,
				startedAt: task.startedAt,
			};
		case "done":
			return {
				...common,
				status: "done",
				assigneeId: task.assigneeId,
				startedAt: task.workPeriod.startedAt,
				completedAt: task.workPeriod.completedAt,
			};
	}
}
