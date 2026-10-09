import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const BookIdBrand: unique symbol;

/**
 * BookId
 * 蔵書の識別子。蔵書を登録するときに採番する。
 */
export const BookIdSchema = z
	.uuid({ version: "v4" })
	// z.uuid() は大文字を通す。表記が揺れると同じ識別子が2つ共存する
	.refine((v) => v === v.toLowerCase(), {
		error: "書籍 ID は小文字です",
	})
	.brand<typeof BookIdBrand>();

export type BookId = z.output<typeof BookIdSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createBookId(value: string): BookId {
	const result = BookIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("BookId.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructBookId(value: string): BookId {
	const result = BookIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError("BookId.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const BookId = {
	create: createBookId,
	reconstruct: reconstructBookId,
} as const;
