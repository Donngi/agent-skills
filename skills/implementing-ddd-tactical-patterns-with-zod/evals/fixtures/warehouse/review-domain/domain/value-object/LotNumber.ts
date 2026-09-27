import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const LotNumberBrand: unique symbol;

/**
 * LotNumber
 * 入庫した単位に付く製造ロットの番号。仕入先が採番する。
 */
export const LotNumberSchema = z
	.string()
	.regex(/^L[0-9]{8}$/, {
		error: "ロット番号は L20240401 の形です",
	})
	.brand<typeof LotNumberBrand>();

export type LotNumber = z.output<typeof LotNumberSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createLotNumber(value: string): LotNumber {
	const result = LotNumberSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("LotNumber.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructLotNumber(value: string): LotNumber {
	const result = LotNumberSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"LotNumber.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const LotNumber = {
	create: createLotNumber,
	reconstruct: reconstructLotNumber,
} as const;
