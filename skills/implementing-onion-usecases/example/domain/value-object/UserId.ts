import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const UserIdBrand: unique symbol;

/**
 * UserId
 * 利用者の識別子。認証基盤が発行する。
 */
export const UserIdSchema = z
	.uuid({ version: "v4" })
	// UUID は大文字小文字を同一視するが、z.uuid() は大文字も通す。表記が揺れると同じ識別子が2つ共存する
	.refine((v) => v === v.toLowerCase(), {
		error: "利用者 ID は小文字です",
	})
	.brand<typeof UserIdBrand>();

export type UserId = z.output<typeof UserIdSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createUserId(value: string): UserId {
	const result = UserIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("UserId.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructUserId(value: string): UserId {
	const result = UserIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError("UserId.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const UserId = {
	create: createUserId,
	reconstruct: reconstructUserId,
} as const;
