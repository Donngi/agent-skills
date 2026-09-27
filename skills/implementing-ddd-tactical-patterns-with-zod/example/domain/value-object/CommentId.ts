import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const CommentIdBrand: unique symbol;

/**
 * CommentId
 * コメントの識別子。集約の中だけで一意。
 */
export const CommentIdSchema = z
	.uuid({ version: "v4" })
	// UUID は大文字小文字を同一視するが、z.uuid() は大文字も通す。表記が揺れると同じ識別子が2つ共存する
	.refine((v) => v === v.toLowerCase(), {
		error: "コメント ID は小文字です",
	})
	.brand<typeof CommentIdBrand>();

export type CommentId = z.output<typeof CommentIdSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createCommentId(value: string): CommentId {
	const result = CommentIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("CommentId.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructCommentId(value: string): CommentId {
	const result = CommentIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"CommentId.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const CommentId = {
	create: createCommentId,
	reconstruct: reconstructCommentId,
} as const;
