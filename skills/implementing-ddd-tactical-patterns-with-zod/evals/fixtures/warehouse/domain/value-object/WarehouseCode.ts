import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const WarehouseCodeBrand: unique symbol;

/**
 * WarehouseCode
 * 倉庫の識別に使う倉庫コード。
 */
export const WarehouseCodeSchema = z
	.string()
	.regex(/^[A-Z]{2,6}$/, {
		error: "倉庫コードは大文字英字2〜6文字です",
	})
	.brand<typeof WarehouseCodeBrand>();

export type WarehouseCode = z.output<typeof WarehouseCodeSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createWarehouseCode(value: string): WarehouseCode {
	const result = WarehouseCodeSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("WarehouseCode.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructWarehouseCode(value: string): WarehouseCode {
	const result = WarehouseCodeSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"WarehouseCode.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const WarehouseCode = {
	create: createWarehouseCode,
	reconstruct: reconstructWarehouseCode,
} as const;
