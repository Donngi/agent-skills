import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

/**
 * Priority
 * タスクの優先度。
 */
export const PrioritySchema = z.enum([
	"highest",
	"high",
	"medium",
	"low",
	"lowest",
]);

export type Priority = z.output<typeof PrioritySchema>;

/** 並べ替えに使う序数。小さいほど優先度が高い。 */
const PRIORITY_ORDER: Readonly<Record<Priority, number>> = {
	highest: 0,
	high: 1,
	medium: 2,
	low: 3,
	lowest: 4,
};

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createPriority(value: string): Priority {
	const result = PrioritySchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("Priority.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructPriority(value: string): Priority {
	const result = PrioritySchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"Priority.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 比較
// -------------------------------------------------

function priorityIsHigherThan(a: Priority, b: Priority): boolean {
	return PRIORITY_ORDER[a] < PRIORITY_ORDER[b];
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Priority = {
	create: createPriority,
	reconstruct: reconstructPriority,
	isHigherThan: priorityIsHigherThan,
} as const;
