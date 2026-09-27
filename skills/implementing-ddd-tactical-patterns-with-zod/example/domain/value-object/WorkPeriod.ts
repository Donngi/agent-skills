import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { TimestampSchema } from "./Timestamp";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const WorkPeriodBrand: unique symbol;

const WorkPeriodFields = {
	/** 着手のタイムスタンプ */
	startedAt: TimestampSchema,
	/** 完了のタイムスタンプ。着手と同じ値は許す（同一ミリ秒で終わることはありうる）。 */
	completedAt: TimestampSchema,
};

/**
 * WorkPeriod
 * 作業した期間。
 */
export const WorkPeriodSchema = z
	.strictObject(WorkPeriodFields)
	.refine((v) => v.completedAt >= v.startedAt, {
		path: ["completedAt"],
		error: "完了のタイムスタンプは着手より前にはできません",
	})
	.readonly()
	.brand<typeof WorkPeriodBrand>();

export type WorkPeriod = z.output<typeof WorkPeriodSchema>;

export type WorkPeriodSchemaInput = z.input<typeof WorkPeriodSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export const CreateWorkPeriodPropsSchema = z
	.strictObject(WorkPeriodFields)
	.pick({ startedAt: true, completedAt: true })
	.readonly();

export type CreateWorkPeriodProps = z.output<
	typeof CreateWorkPeriodPropsSchema
>;

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createWorkPeriod(props: CreateWorkPeriodProps): WorkPeriod {
	const input = CreateWorkPeriodPropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("WorkPeriod.create", input.error);
	}
	const result = WorkPeriodSchema.safeParse(input.data);
	if (!result.success) {
		throw new InvalidCreationParamError("WorkPeriod.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructWorkPeriod(props: WorkPeriodSchemaInput): WorkPeriod {
	const result = WorkPeriodSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"WorkPeriod.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

function workPeriodEquals(a: WorkPeriod, b: WorkPeriod): boolean {
	return a.startedAt === b.startedAt && a.completedAt === b.completedAt;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const WorkPeriod = {
	create: createWorkPeriod,
	reconstruct: reconstructWorkPeriod,
	equals: workPeriodEquals,
} as const;
