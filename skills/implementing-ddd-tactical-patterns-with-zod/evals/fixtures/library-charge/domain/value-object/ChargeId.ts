import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const ChargeIdBrand: unique symbol;

/**
 * ChargeId
 * 延滞請求の識別子。請求を生成するときに採番する。
 */
export const ChargeIdSchema = z
	.uuid({ version: "v4" })
	// z.uuid() は大文字を通す。表記が揺れると同じ識別子が2つ共存する
	.refine((v) => v === v.toLowerCase(), {
		error: "請求 ID は小文字です",
	})
	.brand<typeof ChargeIdBrand>();

export type ChargeId = z.output<typeof ChargeIdSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createChargeId(value: string): ChargeId {
	const result = ChargeIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("ChargeId.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructChargeId(value: string): ChargeId {
	const result = ChargeIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"ChargeId.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const ChargeId = {
	create: createChargeId,
	reconstruct: reconstructChargeId,
} as const;
