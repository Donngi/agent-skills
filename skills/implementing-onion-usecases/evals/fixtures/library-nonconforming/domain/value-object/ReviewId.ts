import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const ReviewIdBrand: unique symbol;

/**
 * ReviewId
 * 書評の識別子。集約の中だけで一意。
 */
export const ReviewIdSchema = z
	.uuid({ version: "v4" })
	// UUID は大文字小文字を同一視するが、z.uuid() は大文字も通す。表記が揺れると同じ識別子が2つ共存する
	.refine((v) => v === v.toLowerCase(), {
		error: "書評 ID は小文字です",
	})
	.brand<typeof ReviewIdBrand>();

export type ReviewId = z.output<typeof ReviewIdSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createReviewId(value: string): ReviewId {
	const result = ReviewIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("ReviewId.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructReviewId(value: string): ReviewId {
	const result = ReviewIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"ReviewId.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const ReviewId = {
	create: createReviewId,
	reconstruct: reconstructReviewId,
} as const;
