import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const MemberIdBrand: unique symbol;

/**
 * MemberId
 * 利用者の会員番号。入会したときに採番する。
 */
export const MemberIdSchema = z
	.string()
	.regex(/^M-[0-9]{4}$/, {
		error: "会員番号は M-0001 の形です",
	})
	.brand<typeof MemberIdBrand>();

export type MemberId = z.output<typeof MemberIdSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createMemberId(value: string): MemberId {
	const result = MemberIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("MemberId.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructMemberId(value: string): MemberId {
	const result = MemberIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"MemberId.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const MemberId = {
	create: createMemberId,
	reconstruct: reconstructMemberId,
} as const;
