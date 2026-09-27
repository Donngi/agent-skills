import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidClockValueError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { type ProjectId, ProjectIdSchema } from "../value-object/ProjectId";
import { TaskId } from "../value-object/TaskId";
import { TimestampSchema } from "../value-object/Timestamp";
import { UserIdSchema } from "../value-object/UserId";
import { type CreateTaskProps, Task, type TaskDeps } from "./Task";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const ProjectBrand: unique symbol;

const ProjectFields = {
	/** プロジェクトの識別子。タスク番号の接頭辞にもなる。以後変わらない。 */
	id: ProjectIdSchema,
	/** 表示名 */
	name: z
		.string()
		.min(1, { error: "プロジェクト名は1文字以上です" })
		.max(80, { error: "プロジェクト名は80文字までです" })
		.refine((v) => v === v.trim(), {
			error: "プロジェクト名の前後に空白を含めることはできません",
		}),
	/** 責任者 */
	leadId: UserIdSchema,
	/** 作成のタイムスタンプ */
	createdAt: TimestampSchema,
	/** アーカイブ済みか。アーカイブしたあとも既存のタスクは読める。 */
	archived: z.boolean(),
};

/**
 * Project
 * タスクをまとめる単位。
 */
export const ProjectSchema = z
	.strictObject(ProjectFields)
	.readonly()
	.brand<typeof ProjectBrand>();

export type Project = z.output<typeof ProjectSchema>;

export type ProjectSchemaInput = z.input<typeof ProjectSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type ProjectDeps = Readonly<{
	clock: Readonly<{
		/** Unix epoch ミリ秒を返す。前に返した値より小さい値を返さない。 */
		now: () => number;
	}>;
}>;

export const CreateProjectPropsSchema = z
	.strictObject(ProjectFields)
	.pick({
		id: true,
		name: true,
		leadId: true,
	})
	.readonly();

export type CreateProjectProps = z.output<typeof CreateProjectPropsSchema>;

/**
 * @throws InvalidCreationParamError 渡された値が不正なとき。
 * @throws InvalidClockValueError クロックがタイムスタンプとして不正な値を返したとき。
 */
function createProject(props: CreateProjectProps, deps: ProjectDeps): Project {
	const input = CreateProjectPropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("Project.create", input.error);
	}
	const createdAt = TimestampSchema.safeParse(deps.clock.now());
	if (!createdAt.success) {
		throw new InvalidClockValueError("Project.create", createdAt.error);
	}
	const result = ProjectSchema.safeParse({
		id: input.data.id,
		name: input.data.name,
		leadId: input.data.leadId,
		createdAt: createdAt.data,
		archived: false,
	} satisfies ProjectSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Project.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructProject(props: ProjectSchemaInput): Project {
	const result = ProjectSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError("Project.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

function projectEqualsById(a: Project, b: Project): boolean {
	return a.id === b.id;
}

// -------------------------------------------------
// 業務操作
// -------------------------------------------------

/** @throws ProjectAlreadyArchivedError すでにアーカイブされているとき。 */
function archiveProject(project: Project): Project {
	if (project.archived) {
		throw new ProjectAlreadyArchivedError("Project.archive", project.id);
	}
	const result = ProjectSchema.safeParse({
		...project,
		archived: true,
	} satisfies ProjectSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Project.archive", result.error);
	}
	return result.data;
}

export type CreateTaskInProjectParams = CreateTaskProps;

/**
 * このプロジェクトにタスクを作る。タスクを作る入口はこの操作である。
 * 識別子は、呼び出し側が TaskNumberIssuer で先に採番して渡す。この操作で失敗した番号は欠番になる。
 * 確かめるのは渡されたプロジェクトの状態で、確かめたあとにアーカイブされた場合は防がない
 * （同時更新は楽観ロックでよいという要件）。
 * @throws TaskCreationOnArchivedProjectError プロジェクトがアーカイブ済みのとき。
 * @throws TaskIdProjectMismatchError タスクの識別子が別のプロジェクトのものであるとき。
 * @throws InvalidCreationParamError タスクの入力が不正なとき。operation は Task.create。
 * @throws InvalidClockValueError クロックがタイムスタンプとして不正な値を返したとき。operation は Task.create。
 */
function createTaskInProject(
	project: Project,
	params: CreateTaskInProjectParams,
	deps: TaskDeps,
): Task {
	if (project.archived) {
		throw new TaskCreationOnArchivedProjectError(
			"Project.createTask",
			project.id,
		);
	}
	if (TaskId.projectId(params.id) !== project.id) {
		throw new TaskIdProjectMismatchError(
			"Project.createTask",
			project.id,
			params.id,
		);
	}
	return Task.create(params, deps);
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** すでにアーカイブされているプロジェクトをアーカイブしようとした。 */
export class ProjectAlreadyArchivedError extends DomainError {
	override readonly name: string = "ProjectAlreadyArchivedError";

	/** 失敗したプロジェクトの識別子 */
	readonly projectId: ProjectId;

	constructor(operation: string, projectId: ProjectId) {
		super(operation, "アーカイブ済みのプロジェクトはアーカイブできません");
		this.projectId = projectId;
	}
}

/** アーカイブ済みのプロジェクトにタスクを作ろうとした。 */
export class TaskCreationOnArchivedProjectError extends DomainError {
	override readonly name: string = "TaskCreationOnArchivedProjectError";

	/** 失敗したプロジェクトの識別子 */
	readonly projectId: ProjectId;

	constructor(operation: string, projectId: ProjectId) {
		super(
			operation,
			"アーカイブ済みのプロジェクトにタスクを作ることはできません",
		);
		this.projectId = projectId;
	}
}

/** 別のプロジェクトの識別子を持つタスクを、このプロジェクトに作ろうとした。 */
export class TaskIdProjectMismatchError extends DomainError {
	override readonly name: string = "TaskIdProjectMismatchError";

	/** 失敗したプロジェクトの識別子 */
	readonly projectId: ProjectId;
	/** 渡されたタスクの識別子 */
	readonly taskId: TaskId;

	constructor(operation: string, projectId: ProjectId, taskId: TaskId) {
		super(
			operation,
			"タスクの識別子は、作るプロジェクトの識別子で始まる形です",
		);
		this.projectId = projectId;
		this.taskId = taskId;
	}
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Project = {
	create: createProject,
	reconstruct: reconstructProject,
	equalsById: projectEqualsById,
	archive: archiveProject,
	createTask: createTaskInProject,
} as const;
