import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const TimestampBrand: unique symbol;

/**
 * Timestamp
 * Unix epoch ミリ秒。
 */
export const TimestampSchema = z
	.int()
	.nonnegative({ error: "タイムスタンプは1970-01-01以降です" })
	.max(253_402_300_799_999, {
		error: "タイムスタンプは9999-12-31以前です",
	})
	.brand<typeof TimestampBrand>();

export type Timestamp = z.output<typeof TimestampSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createTimestamp(value: number): Timestamp {
	const result = TimestampSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("Timestamp.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructTimestamp(value: number): Timestamp {
	const result = TimestampSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"Timestamp.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Timestamp = {
	create: createTimestamp,
	reconstruct: reconstructTimestamp,
} as const;
