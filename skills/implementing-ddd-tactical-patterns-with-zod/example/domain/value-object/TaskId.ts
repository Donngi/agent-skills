import { z } from "zod";
import {
	FatalUnreachableError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { type ProjectId, ProjectIdSchema } from "./ProjectId";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const TaskIdBrand: unique symbol;

/** 識別子に入る番号の桁数。 */
const TASK_NUMBER_DIGITS = 9;

/** 識別子に入る番号の最大値。採番する側はこれを超えないことを確かめる。 */
export const TASK_NUMBER_MAX = 10 ** TASK_NUMBER_DIGITS - 1;

// 番号は区切りの直後から見る。末尾から見ると、PROJ--1 の -1 を番号と読んでしまう。
// どれも番号の条件だけを見る。区切りや番号の欠落・数字以外の文字は z.templateLiteral が拒否するので、
// ここで形式まで見ると、形式の違反を2つの検査が同時に拒否する
const NEGATIVE_NUMBER_PATTERN = /^[^-]*--/;
const LEADING_ZERO_PATTERN = /^[^-]*-0/;
const TOO_MANY_DIGITS_PATTERN = new RegExp(
	`^[^-]*--?[0-9]{${TASK_NUMBER_DIGITS + 1},}$`,
);

/**
 * TaskId
 * タスクの識別子。
 */
export const TaskIdSchema = z
	// z.templateLiteral を先頭に置くと入力型が `${string}-${number}` になり、境界で as が要る。
	// z.string() で受けてから pipe すると入力型が string のままになる
	.string()
	.pipe(
		z.templateLiteral([ProjectIdSchema, "-", z.number().int().positive()], {
			error: "タスク ID は PROJ-123 の形です",
		}),
	)
	// z.templateLiteral は ProjectIdSchema の regex と z.number() の int を検査するが、
	// positive は検査しない。PROJ--1、PROJ-0、PROJ-01 が通るので番号を止める。
	// 3つの条件は独立に破れるので、どれに違反したか分かるように refine を分ける
	.refine((v) => !NEGATIVE_NUMBER_PATTERN.test(v), {
		error: "タスク番号を負の数にすることはできません",
	})
	.refine((v) => !LEADING_ZERO_PATTERN.test(v), {
		error: "タスク番号を0や0で始まる数にすることはできません",
	})
	.refine((v) => !TOO_MANY_DIGITS_PATTERN.test(v), {
		error: `タスク番号は${TASK_NUMBER_DIGITS}桁までです`,
	})
	.brand<typeof TaskIdBrand>();

export type TaskId = z.output<typeof TaskIdSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createTaskId(value: string): TaskId {
	const result = TaskIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("TaskId.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructTaskId(value: string): TaskId {
	const result = TaskIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError("TaskId.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 読み取り
// -------------------------------------------------

function taskIdProjectId(id: TaskId): ProjectId {
	const [prefix] = id.split("-");
	const result = ProjectIdSchema.safeParse(prefix);
	if (!result.success) {
		throw new FatalUnreachableError("TaskId.projectId", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const TaskId = {
	create: createTaskId,
	reconstruct: reconstructTaskId,
	projectId: taskIdProjectId,
} as const;
