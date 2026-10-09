import {
	TaskNumberExhaustedError,
	type TaskNumberIssuer,
} from "../domain/domain-service/TaskNumberIssuer";
import {
	Project,
	TaskCreationOnArchivedProjectError,
} from "../domain/entity/Project";
import type { Task } from "../domain/entity/Task";
import type { ProjectRepository } from "../domain/repository/ProjectRepository";
import type { TaskRepository } from "../domain/repository/TaskRepository";
import { InvalidCreationParamError } from "../domain/shared-errors";
import type { Labels } from "../domain/value-object/Labels";
import type { Priority } from "../domain/value-object/Priority";
import type { ProjectId } from "../domain/value-object/ProjectId";
import type { PullRequestUrl } from "../domain/value-object/PullRequestUrl";
import type { TaskId } from "../domain/value-object/TaskId";
import type { Timestamp } from "../domain/value-object/Timestamp";
import type { UserId } from "../domain/value-object/UserId";
import { InvalidInputError, UseCaseError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type CreateTaskUseCaseProps = Readonly<{
	/** タスクを作るプロジェクトの ID */
	projectId: ProjectId;
	/** タイトル */
	title: string;
	/** 優先度 */
	priority: Priority;
	/** 追加するラベル */
	labels: Labels;
	/** 作成者 */
	creatorId: UserId;
	/** 実装の PR の URL */
	pullRequestUrl?: PullRequestUrl;
}>;

export type CreateTaskUseCaseResult = Readonly<{
	/** 作ったタスクの ID */
	taskId: string;
}>;

/**
 * CreateTaskUseCase
 * プロジェクトにタスクを作る。
 */
export type CreateTaskUseCase = Readonly<{
	/**
	 * 採番に成功したあとで失敗すると、その番号は欠番になる。
	 * プロジェクトがアーカイブされていないことを確かめたあとでアーカイブされても、タスクは作られる（Project.createTask）。
	 * @throws ProjectNotFoundError プロジェクトが無いとき。
	 * @throws TaskNumberUnavailableError プロジェクトのタスク番号が上限に達しているとき。cause は TaskNumberExhaustedError。
	 * @throws ProjectArchivedError プロジェクトがアーカイブ済みのとき。cause は TaskCreationOnArchivedProjectError。
	 * @throws InvalidInputError タイトルなどタスクの入力が不正なとき。cause は InvalidCreationParamError。
	 */
	run: (props: CreateTaskUseCaseProps) => Promise<CreateTaskUseCaseResult>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type CreateTaskUseCaseDeps = Readonly<{
	projectRepository: ProjectRepository;
	taskRepository: TaskRepository;
	taskNumberIssuer: TaskNumberIssuer;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。前回より小さい値を返さない。 */
		now: () => Timestamp;
	}>;
}>;

export function createCreateTaskUseCase(
	deps: CreateTaskUseCaseDeps,
): CreateTaskUseCase {
	return {
		run: async (props) => {
			const project = await deps.projectRepository.get(props.projectId);
			if (project === undefined) {
				throw new ProjectNotFoundError(
					"CreateTaskUseCase.run",
					props.projectId,
				);
			}

			let taskId: TaskId;
			try {
				taskId = await deps.taskNumberIssuer.next(project.id);
			} catch (error) {
				if (error instanceof TaskNumberExhaustedError) {
					throw new TaskNumberUnavailableError(
						"CreateTaskUseCase.run",
						props.projectId,
						{ cause: error },
					);
				}
				throw error;
			}

			let task: Task;
			try {
				task = Project.createTask(
					project,
					{
						id: taskId,
						title: props.title,
						priority: props.priority,
						labels: props.labels,
						creatorId: props.creatorId,
						...(props.pullRequestUrl !== undefined
							? { pullRequestUrl: props.pullRequestUrl }
							: {}),
					},
					{ clock: deps.clock },
				);
			} catch (error) {
				if (error instanceof TaskCreationOnArchivedProjectError) {
					throw new ProjectArchivedError(
						"CreateTaskUseCase.run",
						props.projectId,
						{ cause: error },
					);
				}
				if (error instanceof InvalidCreationParamError) {
					throw new InvalidInputError("CreateTaskUseCase.run", {
						cause: error,
					});
				}
				throw error;
			}
			await deps.taskRepository.put(task);

			return { taskId: task.id };
		},
	};
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 指定された ID のプロジェクトが無かった。 */
export class ProjectNotFoundError extends UseCaseError {
	override readonly name: string = "ProjectNotFoundError";

	/** 指定されたプロジェクトの ID */
	readonly projectId: ProjectId;

	constructor(operation: string, projectId: ProjectId) {
		super(operation, `プロジェクト ${projectId} が見つかりません`);
		this.projectId = projectId;
	}
}

/** プロジェクトのタスク番号が上限に達していて、タスクを作れなかった。 */
export class TaskNumberUnavailableError extends UseCaseError {
	override readonly name: string = "TaskNumberUnavailableError";
	override readonly cause: TaskNumberExhaustedError;

	/** タスクを作ろうとしたプロジェクトの ID */
	readonly projectId: ProjectId;

	constructor(
		operation: string,
		projectId: ProjectId,
		options: Readonly<{ cause: TaskNumberExhaustedError }>,
	) {
		super(
			operation,
			`プロジェクト ${projectId} のタスク番号が上限に達しています`,
			options,
		);
		this.cause = options.cause;
		this.projectId = projectId;
	}
}

/** プロジェクトがアーカイブ済みで、タスクを作れなかった。 */
export class ProjectArchivedError extends UseCaseError {
	override readonly name: string = "ProjectArchivedError";
	override readonly cause: TaskCreationOnArchivedProjectError;

	/** タスクを作ろうとしたプロジェクトの ID */
	readonly projectId: ProjectId;

	constructor(
		operation: string,
		projectId: ProjectId,
		options: Readonly<{ cause: TaskCreationOnArchivedProjectError }>,
	) {
		super(operation, `プロジェクト ${projectId} はアーカイブ済みです`, options);
		this.cause = options.cause;
		this.projectId = projectId;
	}
}
