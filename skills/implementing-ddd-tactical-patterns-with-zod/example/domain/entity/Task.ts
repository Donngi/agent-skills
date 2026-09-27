import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidClockValueError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import type { CommentId } from "../value-object/CommentId";
import type { Label } from "../value-object/Label";
import { Labels, LabelsSchema } from "../value-object/Labels";
import { type Priority, PrioritySchema } from "../value-object/Priority";
import {
	type PullRequestUrl,
	PullRequestUrlSchema,
} from "../value-object/PullRequestUrl";
import { type TaskId, TaskIdSchema } from "../value-object/TaskId";
import { type Timestamp, TimestampSchema } from "../value-object/Timestamp";
import { type UserId, UserIdSchema } from "../value-object/UserId";
import {
	WorkPeriodSchema,
	type WorkPeriodSchemaInput,
} from "../value-object/WorkPeriod";
import { Comment, type CommentDeps, CommentSchema } from "./Comment";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const TaskBrand: unique symbol;

/** 1つのタスクに付けられるコメントの上限。 */
const COMMENT_LIMIT = 50;

const TaskCommonFields = {
	/** タスクの識別子。TaskNumberIssuer が採番する。以後変わらない。 */
	id: TaskIdSchema,
	/** 表題 */
	title: z
		.string()
		.min(1, { error: "表題は1文字以上です" })
		.max(200, { error: "表題は200文字までです" })
		.refine((v) => v === v.trim(), {
			error: "表題の前後に空白を含めることはできません",
		}),
	/** 優先度 */
	priority: PrioritySchema,
	/** 追加されているラベル */
	labels: LabelsSchema,
	/** 作成者 */
	creatorId: UserIdSchema,
	/** 作成のタイムスタンプ */
	createdAt: TimestampSchema,
	/** 実装のプルリクエストの URL。実装していなければ項目ごと無い。 */
	// optional は undefined を通し、項目が残る。exactOptional は項目ごと無いことだけを許す
	pullRequestUrl: PullRequestUrlSchema.exactOptional(),
	/** 追加されたコメント。投稿順に並ぶ。 */
	comments: z
		.array(CommentSchema)
		.max(COMMENT_LIMIT, { error: `コメントは${COMMENT_LIMIT}件までです` })
		.refine((cs) => new Set(cs.map((c) => c.id)).size === cs.length, {
			error: "コメント ID は一意です",
		})
		.refine(
			(cs) =>
				cs.every((c, i) => {
					const prev = cs[i - 1];
					return prev === undefined || prev.postedAt <= c.postedAt;
				}),
			{ error: "コメントは投稿順です" },
		)
		.readonly(),
};

/**
 * Task
 * タスク。
 */
export const TaskSchema = z
	.discriminatedUnion("status", [
		z.strictObject({
			...TaskCommonFields,
			status: z.literal("backlog"),
		}),
		z.strictObject({
			...TaskCommonFields,
			status: z.literal("inProgress"),
			/** 担当者 */
			assigneeId: UserIdSchema,
			/** 着手のタイムスタンプ */
			startedAt: TimestampSchema,
		}),
		z.strictObject({
			...TaskCommonFields,
			status: z.literal("done"),
			/** 担当者 */
			assigneeId: UserIdSchema,
			/** 着手から完了までの期間 */
			workPeriod: WorkPeriodSchema,
		}),
	])
	.superRefine((v, ctx) => {
		// この中から例外を投げる関数を呼ばない。safeParse は例外を捕まえないので、
		// safeParse を呼んだ場所すべてで意図しない例外になる
		if (v.status === "inProgress" && v.startedAt < v.createdAt) {
			ctx.addIssue({
				code: "custom",
				path: ["startedAt"],
				message: "着手のタイムスタンプは作成より前にはできません",
			});
		}
		if (v.status === "done" && v.workPeriod.startedAt < v.createdAt) {
			ctx.addIssue({
				code: "custom",
				path: ["workPeriod", "startedAt"],
				message: "着手のタイムスタンプは作成より前にはできません",
			});
		}
		if (v.comments.some((c) => c.postedAt < v.createdAt)) {
			ctx.addIssue({
				code: "custom",
				path: ["comments"],
				message: "コメントのタイムスタンプは作成より前にはできません",
			});
		}
	})
	.readonly()
	.brand<typeof TaskBrand>();

export type Task = z.output<typeof TaskSchema>;

export type TaskSchemaInput = z.input<typeof TaskSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type TaskDeps = Readonly<{
	clock: Readonly<{
		/** Unix epoch ミリ秒を返す。前に返した値より小さい値を返さない。 */
		now: () => number;
	}>;
}>;

export const CreateTaskPropsSchema = z
	.strictObject(TaskCommonFields)
	.pick({
		id: true,
		title: true,
		priority: true,
		labels: true,
		creatorId: true,
		pullRequestUrl: true,
	})
	.readonly();

export type CreateTaskProps = z.output<typeof CreateTaskPropsSchema>;

/**
 * 業務でタスクを作る入口は `Project.createTask` である。アーカイブ済みのプロジェクトかどうかは、ここでは確かめない。
 * @throws InvalidCreationParamError 渡された値が不正なとき。
 * @throws InvalidClockValueError クロックがタイムスタンプとして不正な値を返したとき。
 */
function createTask(props: CreateTaskProps, deps: TaskDeps): Task {
	const input = CreateTaskPropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("Task.create", input.error);
	}
	const createdAt = TimestampSchema.safeParse(deps.clock.now());
	if (!createdAt.success) {
		throw new InvalidClockValueError("Task.create", createdAt.error);
	}
	const result = TaskSchema.safeParse({
		id: input.data.id,
		title: input.data.title,
		priority: input.data.priority,
		labels: input.data.labels,
		creatorId: input.data.creatorId,
		createdAt: createdAt.data,
		// undefined を代入すると項目が残る。exactOptionalPropertyTypes が無効な
		// プロジェクトでは satisfies も止めないので、値があるときだけ項目を置く
		...(input.data.pullRequestUrl !== undefined
			? { pullRequestUrl: input.data.pullRequestUrl }
			: {}),
		comments: [],
		status: "backlog",
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructTask(props: TaskSchemaInput): Task {
	const result = TaskSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError("Task.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

function taskEqualsById(a: Task, b: Task): boolean {
	return a.id === b.id;
}

// -------------------------------------------------
// 業務操作
// -------------------------------------------------

export type StartTaskParams = Readonly<{
	/** 担当者 */
	assigneeId: UserId;
	/** 着手のタイムスタンプ */
	at: Timestamp;
}>;

/**
 * バックログのタスクだけ着手できる。
 * @throws TaskStatusMismatchError バックログでないとき。
 * @throws TaskStartedBeforeCreationError 作成より前のタイムスタンプを渡したとき。
 */
function startTask(task: Task, params: StartTaskParams): Task {
	if (task.status !== "backlog") {
		throw new TaskStatusMismatchError(
			"Task.start",
			task.id,
			"backlog",
			task.status,
		);
	}
	if (params.at < task.createdAt) {
		throw new TaskStartedBeforeCreationError(
			"Task.start",
			task.id,
			params.at,
			task.createdAt,
		);
	}
	const result = TaskSchema.safeParse({
		...task,
		status: "inProgress",
		assigneeId: params.assigneeId,
		startedAt: params.at,
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.start", result.error);
	}
	return result.data;
}

export type CompleteTaskParams = Readonly<{
	/** 完了のタイムスタンプ */
	at: Timestamp;
}>;

/**
 * 着手中のタスクだけ完了できる。
 * @throws TaskStatusMismatchError 着手中でないとき。
 * @throws TaskCompletedBeforeStartError 着手より前のタイムスタンプを渡したとき。
 */
function completeTask(task: Task, params: CompleteTaskParams): Task {
	if (task.status !== "inProgress") {
		throw new TaskStatusMismatchError(
			"Task.complete",
			task.id,
			"inProgress",
			task.status,
		);
	}
	const period = WorkPeriodSchema.safeParse({
		startedAt: task.startedAt,
		completedAt: params.at,
	} satisfies WorkPeriodSchemaInput);
	if (!period.success) {
		throw new TaskCompletedBeforeStartError(
			"Task.complete",
			task.id,
			params.at,
			task.startedAt,
		);
	}
	const { startedAt: _startedAt, ...rest } = task;
	const result = TaskSchema.safeParse({
		...rest,
		status: "done",
		workPeriod: period.data,
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.complete", result.error);
	}
	return result.data;
}

/**
 * 完了したタスクを着手中に戻す。担当者と着手のタイムスタンプはそのまま残る。
 * @throws TaskStatusMismatchError 完了していないとき。
 */
function reopenTask(task: Task): Task {
	if (task.status !== "done") {
		throw new TaskStatusMismatchError(
			"Task.reopen",
			task.id,
			"done",
			task.status,
		);
	}
	const { workPeriod, ...rest } = task;
	const result = TaskSchema.safeParse({
		...rest,
		status: "inProgress",
		startedAt: workPeriod.startedAt,
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.reopen", result.error);
	}
	return result.data;
}

export type AddTaskCommentParams = Readonly<{
	/** 著者 */
	authorId: UserId;
	/** 本文 */
	body: string;
}>;

/**
 * どの状態でも追加できる。コメントの識別子と投稿のタイムスタンプは deps から決まる。
 * @throws CommentLimitExceededError 件数が上限に達しているとき。
 * @throws InvalidCreationParamError 著者か本文が不正なとき。operation は Comment.create。
 * @throws InvalidGeneratedCommentIdError ID ジェネレーターが識別子として不正な値を返したとき。operation は Comment.create。
 * @throws InvalidClockValueError クロックがタイムスタンプとして不正な値を返したとき。operation は Comment.create。
 * @throws DuplicateCommentError 採番した識別子が、すでに追加されているコメントと重複したとき。
 * @throws CommentPostedBeforePreviousCommentError クロックが直前のコメントより前のタイムスタンプを返したとき。
 * @throws CommentPostedBeforeTaskCreationError クロックがタスクの作成より前のタイムスタンプを返したとき。
 */
function addTaskComment(
	task: Task,
	params: AddTaskCommentParams,
	deps: CommentDeps,
): Task {
	if (task.comments.length >= COMMENT_LIMIT) {
		throw new CommentLimitExceededError(
			"Task.addComment",
			task.id,
			COMMENT_LIMIT,
		);
	}
	const comment = Comment.create(
		{ authorId: params.authorId, body: params.body },
		deps,
	);
	if (task.comments.some((c) => c.id === comment.id)) {
		throw new DuplicateCommentError("Task.addComment", task.id, comment.id);
	}
	const last = task.comments.at(-1);
	if (last !== undefined && comment.postedAt < last.postedAt) {
		throw new CommentPostedBeforePreviousCommentError(
			"Task.addComment",
			task.id,
			comment.postedAt,
			last.postedAt,
		);
	}
	if (comment.postedAt < task.createdAt) {
		throw new CommentPostedBeforeTaskCreationError(
			"Task.addComment",
			task.id,
			comment.postedAt,
			task.createdAt,
		);
	}
	const result = TaskSchema.safeParse({
		...task,
		comments: [...task.comments, comment],
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.addComment", result.error);
	}
	return result.data;
}

export type RenameTaskParams = Readonly<{
	/** 新しい表題 */
	title: string;
}>;

/**
 * どの状態でも変えられる。
 * @throws InvalidTaskTitleError 表題の形を満たさない値を渡したとき。
 */
function renameTask(task: Task, params: RenameTaskParams): Task {
	// 表題は値オブジェクトに切り出していないので、検証されていない文字列で届く。
	// 新しいスキーマは作らず、完成値と同じ項目のスキーマで確かめる
	const title = TaskCommonFields.title.safeParse(params.title);
	if (!title.success) {
		throw new InvalidTaskTitleError("Task.rename", task.id, title.error);
	}
	const result = TaskSchema.safeParse({
		...task,
		title: title.data,
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.rename", result.error);
	}
	return result.data;
}

export type ChangeTaskPriorityParams = Readonly<{
	/** 新しい優先度 */
	priority: Priority;
}>;

/** どの状態でも変えられる。 */
function changeTaskPriority(
	task: Task,
	params: ChangeTaskPriorityParams,
): Task {
	const result = TaskSchema.safeParse({
		...task,
		priority: params.priority,
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.changePriority", result.error);
	}
	return result.data;
}

export type AddTaskLabelParams = Readonly<{
	/** 追加するラベル */
	label: Label;
}>;

/**
 * どの状態でも追加できる。すでに追加されていれば元の値をそのまま返す。
 * @throws LabelsLimitExceededError 件数が上限を超えるとき。operation は Labels.add。
 */
function addTaskLabel(task: Task, params: AddTaskLabelParams): Task {
	const labels = Labels.add(task.labels, { label: params.label });
	if (labels === task.labels) {
		return task;
	}
	const result = TaskSchema.safeParse({
		...task,
		labels,
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.addLabel", result.error);
	}
	return result.data;
}

export type RemoveTaskLabelParams = Readonly<{
	/** 外すラベル */
	label: Label;
}>;

/** どの状態でも外せる。追加されていなければ元の値をそのまま返す。 */
function removeTaskLabel(task: Task, params: RemoveTaskLabelParams): Task {
	const labels = Labels.remove(task.labels, { label: params.label });
	if (labels === task.labels) {
		return task;
	}
	const result = TaskSchema.safeParse({
		...task,
		labels,
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.removeLabel", result.error);
	}
	return result.data;
}

export type LinkTaskPullRequestParams = Readonly<{
	/** 実装のプルリクエストの URL */
	url: PullRequestUrl;
}>;

/** どの状態でも紐づけられる。すでに紐づいていれば、その URL で置き換える。 */
function linkTaskPullRequest(
	task: Task,
	params: LinkTaskPullRequestParams,
): Task {
	const result = TaskSchema.safeParse({
		...task,
		pullRequestUrl: params.url,
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.linkPullRequest", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** その操作を許さない状態のタスクに対して処理を実行しようとした。 */
export class TaskStatusMismatchError extends DomainError {
	override readonly name: string = "TaskStatusMismatchError";

	/** 失敗したタスクの識別子 */
	readonly taskId: TaskId;
	/** その操作ができる状態 */
	readonly expected: Task["status"];
	/** 渡されたタスクの状態 */
	readonly actual: Task["status"];

	constructor(
		operation: string,
		taskId: TaskId,
		expected: Task["status"],
		actual: Task["status"],
	) {
		super(
			operation,
			`${expected} のタスクだけが対象です。渡されたタスクは ${actual} です`,
		);
		this.taskId = taskId;
		this.expected = expected;
		this.actual = actual;
	}
}

/** 表題として、表題の形を満たさない値を渡した。 */
export class InvalidTaskTitleError extends DomainError {
	override readonly name: string = "InvalidTaskTitleError";

	/** 失敗したタスクの識別子 */
	readonly taskId: TaskId;

	readonly issues: readonly z.core.$ZodIssue[];

	constructor(operation: string, taskId: TaskId, cause: z.ZodError) {
		super(operation, "表題として渡された値が不正です", { cause });
		this.taskId = taskId;
		this.issues = cause.issues;
	}
}

/** 着手のタイムスタンプに、タスクの作成より前の値を渡した。 */
export class TaskStartedBeforeCreationError extends DomainError {
	override readonly name: string = "TaskStartedBeforeCreationError";

	/** 失敗したタスクの識別子 */
	readonly taskId: TaskId;
	/** 渡された着手のタイムスタンプ */
	readonly startedAt: Timestamp;
	/** タスクの作成のタイムスタンプ */
	readonly createdAt: Timestamp;

	constructor(
		operation: string,
		taskId: TaskId,
		startedAt: Timestamp,
		createdAt: Timestamp,
	) {
		super(operation, "着手のタイムスタンプは作成より前にはできません");
		this.taskId = taskId;
		this.startedAt = startedAt;
		this.createdAt = createdAt;
	}
}

/** 完了のタイムスタンプに、着手より前の値を渡した。 */
export class TaskCompletedBeforeStartError extends DomainError {
	override readonly name: string = "TaskCompletedBeforeStartError";

	/** 失敗したタスクの識別子 */
	readonly taskId: TaskId;
	/** 渡された完了のタイムスタンプ */
	readonly completedAt: Timestamp;
	/** タスクの着手のタイムスタンプ */
	readonly startedAt: Timestamp;

	constructor(
		operation: string,
		taskId: TaskId,
		completedAt: Timestamp,
		startedAt: Timestamp,
	) {
		super(operation, "完了のタイムスタンプは着手より前にはできません");
		this.taskId = taskId;
		this.completedAt = completedAt;
		this.startedAt = startedAt;
	}
}

/**
 * コメントの投稿のタイムスタンプとしてクロックが返した値が、直前のコメントより前だった。
 * 呼び出し側には直せない。
 */
export class CommentPostedBeforePreviousCommentError extends DomainError {
	override readonly name: string = "CommentPostedBeforePreviousCommentError";

	/** 失敗したタスクの識別子 */
	readonly taskId: TaskId;
	/** クロックが返した投稿のタイムスタンプ */
	readonly postedAt: Timestamp;
	/** 直前のコメントの投稿のタイムスタンプ */
	readonly previousPostedAt: Timestamp;

	constructor(
		operation: string,
		taskId: TaskId,
		postedAt: Timestamp,
		previousPostedAt: Timestamp,
	) {
		super(
			operation,
			"コメントのタイムスタンプは直前のコメントより前にはできません",
		);
		this.taskId = taskId;
		this.postedAt = postedAt;
		this.previousPostedAt = previousPostedAt;
	}
}

/**
 * コメントの投稿のタイムスタンプとしてクロックが返した値が、タスクの作成より前だった。
 * 呼び出し側には直せない。
 */
export class CommentPostedBeforeTaskCreationError extends DomainError {
	override readonly name: string = "CommentPostedBeforeTaskCreationError";

	/** 失敗したタスクの識別子 */
	readonly taskId: TaskId;
	/** クロックが返した投稿のタイムスタンプ */
	readonly postedAt: Timestamp;
	/** タスクの作成のタイムスタンプ */
	readonly taskCreatedAt: Timestamp;

	constructor(
		operation: string,
		taskId: TaskId,
		postedAt: Timestamp,
		taskCreatedAt: Timestamp,
	) {
		super(operation, "コメントのタイムスタンプは作成より前にはできません");
		this.taskId = taskId;
		this.postedAt = postedAt;
		this.taskCreatedAt = taskCreatedAt;
	}
}

/**
 * 追加するコメントとして採番した識別子が、すでに追加されているコメントと重複した。
 * 呼び出し側には直せない。
 */
export class DuplicateCommentError extends DomainError {
	override readonly name: string = "DuplicateCommentError";

	/** 失敗したタスクの識別子 */
	readonly taskId: TaskId;
	/** 重複したコメントの識別子 */
	readonly commentId: CommentId;

	constructor(operation: string, taskId: TaskId, commentId: CommentId) {
		super(operation, `コメント ${commentId} は2度追加できません`);
		this.taskId = taskId;
		this.commentId = commentId;
	}
}

/** コメントを追加すると件数が上限を超えるため、追加を拒否した。 */
export class CommentLimitExceededError extends DomainError {
	override readonly name: string = "CommentLimitExceededError";

	/** 失敗したタスクの識別子 */
	readonly taskId: TaskId;
	/** 上限の件数 */
	readonly limit: number;

	constructor(operation: string, taskId: TaskId, limit: number) {
		super(operation, `コメントは${limit}件までです`);
		this.taskId = taskId;
		this.limit = limit;
	}
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Task = {
	create: createTask,
	reconstruct: reconstructTask,
	equalsById: taskEqualsById,
	start: startTask,
	complete: completeTask,
	reopen: reopenTask,
	addComment: addTaskComment,
	rename: renameTask,
	changePriority: changeTaskPriority,
	addLabel: addTaskLabel,
	removeLabel: removeTaskLabel,
	linkPullRequest: linkTaskPullRequest,
} as const;
