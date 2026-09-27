import { z } from "zod";
import { Task, TaskSchema } from "../../domain/entity/Task";
import {
	FatalUnreachableError,
	InvalidReconstructParamError,
} from "../../domain/shared-errors";
import type { ProjectId } from "../../domain/value-object/ProjectId";
import type { TaskId } from "../../domain/value-object/TaskId";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

// ドメインの TaskId が持つ桁数と同じ値だが共有しない。あちらは業務で許す番号の
// 上限、こちらは保存済みのキーの符号化幅で、変えてよいタイミングが違う。連動させると
// 番号の上限を広げただけで既存のキーが変わり、保存済みの Task が取得できなくなる
/** ソートキーの連番の桁数。文字列比較で番号順に並ぶようにゼロ詰めする。 */
const SEQUENCE_DIGITS = 9;

const DynamoDBTaskItemDTOCommonFields = {
	// 保存キーは templateLiteral ではなく string + regex で書く。
	// templateLiteral にすると出力型が `PROJECT#${string}` になり、戻り値型を注釈していない
	// 中間オブジェクトをスプレッドして組み立てたときに as が要る。
	// regex が見るのは、接頭辞と区切りの位置と、SK の連番が SEQUENCE_DIGITS 桁の数字であることだけである。
	// ProjectId の文字種と長さはドメインの制約なので写さない。写すとドメイン側を広げた瞬間に、
	// 有効な値の保存がここで落ちる
	/** パーティションキー */
	PK: z.string().regex(/^PROJECT#[^#-]+$/),
	/** ソートキー */
	SK: z.string().regex(new RegExp(`^TASK#[^#-]+-[0-9]{${SEQUENCE_DIGITS}}$`)),
	/** タスクの識別子 */
	id: z.string(),
	/** 表題 */
	title: z.string(),
	/** 優先度 */
	priority: z.enum(["highest", "high", "medium", "low", "lowest"]),
	/** ラベル */
	labels: z.array(z.string()),
	/** 作成者 */
	creatorId: z.string(),
	/** 作成のタイムスタンプ */
	createdAt: z.number(),
	/** 実装のプルリクエストの URL */
	pullRequestUrl: z.string().exactOptional(),
	/** コメント */
	comments: z.array(
		z.strictObject({
			id: z.string(),
			authorId: z.string(),
			body: z.string(),
			postedAt: z.number(),
		}),
	),
};

/**
 * DynamoDBTaskItemDTO
 * タスクの DTO。
 */
// 状態別ユニオンにする。単一オブジェクトで状態ごとの項目を任意にすると、
// ドメインへ変換するときに as が要る
const DynamoDBTaskItemDTOSchema = z
	.discriminatedUnion("status", [
		z.strictObject({
			...DynamoDBTaskItemDTOCommonFields,
			status: z.literal("backlog"),
		}),
		z.strictObject({
			...DynamoDBTaskItemDTOCommonFields,
			status: z.literal("inProgress"),
			/** 担当者 */
			assigneeId: z.string(),
			/** 着手のタイムスタンプ */
			startedAt: z.number(),
		}),
		z.strictObject({
			...DynamoDBTaskItemDTOCommonFields,
			status: z.literal("done"),
			/** 担当者 */
			assigneeId: z.string(),
			/** 作業した期間 */
			workPeriod: z.strictObject({
				startedAt: z.number(),
				completedAt: z.number(),
			}),
		}),
	])
	.superRefine((v, ctx) => {
		const key = toPKSKFromRawId(v.id);
		if (v.PK !== key.PK) {
			ctx.addIssue({
				code: "custom",
				path: ["PK"],
				message: "パーティションキーはタスク ID から導出した値です",
			});
		}
		if (v.SK !== key.SK) {
			ctx.addIssue({
				code: "custom",
				path: ["SK"],
				message: "ソートキーはタスク ID から導出した値です",
			});
		}
	});

export type DynamoDBTaskItemDTO = z.output<typeof DynamoDBTaskItemDTOSchema>;

// -------------------------------------------------
// 変換
// -------------------------------------------------

function toPKFromRawId(projectId: string): string {
	return `PROJECT#${projectId}`;
}

export function toDynamoDBTaskItemDTOPK(projectId: ProjectId): string {
	return toPKFromRawId(projectId);
}

// 横断検証からも呼ぶので、検証前の文字列を受ける
function toPKSKFromRawId(id: string): Readonly<{ PK: string; SK: string }> {
	const separator = id.indexOf("-");
	const projectId = id.slice(0, separator);
	const sequence = id.slice(separator + 1);
	return {
		PK: toPKFromRawId(projectId),
		SK: `TASK#${projectId}-${sequence.padStart(SEQUENCE_DIGITS, "0")}`,
	};
}

export function toDynamoDBTaskItemDTOPKSK(
	id: TaskId,
): Readonly<{ PK: string; SK: string }> {
	return toPKSKFromRawId(id);
}

function toDynamoDBTaskItemDTOCommonFields(task: Task) {
	return {
		...toDynamoDBTaskItemDTOPKSK(task.id),
		id: task.id,
		title: task.title,
		priority: task.priority,
		labels: [...task.labels],
		creatorId: task.creatorId,
		createdAt: task.createdAt,
		// 任意項目は、値があるときだけ置く。undefined を入れると DTO に項目が残る
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
}

function toDynamoDBTaskItemDTOFields(task: Task): DynamoDBTaskItemDTO {
	const common = toDynamoDBTaskItemDTOCommonFields(task);
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
				workPeriod: {
					startedAt: task.workPeriod.startedAt,
					completedAt: task.workPeriod.completedAt,
				},
			};
		default:
			task satisfies never;
			throw new FatalUnreachableError("DynamoDBTaskItemDTO.to");
	}
}

export function toDynamoDBTaskItemDTO(task: Task): DynamoDBTaskItemDTO {
	// Task 型でも不変条件を満たすとは限らない。ブランドはスプレッドで引き継がれるので、
	// 規約に反してドメインの外で { ...task, title: "" } と書いた値も Task 型になる。
	// 壊れた値を書き込むと以後の読み出しがすべて失敗するので、保存形式にする前に確かめる
	const checked = TaskSchema.safeParse(task);
	if (!checked.success) {
		throw new FatalUnreachableError("DynamoDBTaskItemDTO.to", checked.error);
	}
	const item = toDynamoDBTaskItemDTOFields(checked.data);
	const result = DynamoDBTaskItemDTOSchema.safeParse(item);
	if (!result.success) {
		throw new FatalUnreachableError("DynamoDBTaskItemDTO.to", result.error);
	}
	return result.data;
}

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
export function fromDynamoDBTaskItemDTO(raw: unknown): Task {
	const result = DynamoDBTaskItemDTOSchema.safeParse(raw);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"DynamoDBTaskItemDTO.from",
			result.error,
		);
	}
	const { PK: _pk, SK: _sk, ...rest } = result.data;
	return Task.reconstruct(rest);
}
