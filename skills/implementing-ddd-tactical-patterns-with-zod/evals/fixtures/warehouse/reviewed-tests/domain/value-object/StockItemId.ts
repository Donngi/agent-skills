import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const StockItemIdBrand: unique symbol;

/**
 * StockItemId
 * 在庫の識別子。棚に品番を置いたときに採番する。
 */
export const StockItemIdSchema = z
	.uuid({ version: "v4" })
	// z.uuid() は大文字を通す。表記が揺れると同じ識別子が2つ共存する
	.refine((v) => v === v.toLowerCase(), {
		error: "在庫品目 ID は小文字です",
	})
	.brand<typeof StockItemIdBrand>();

export type StockItemId = z.output<typeof StockItemIdSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createStockItemId(value: string): StockItemId {
	const result = StockItemIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("StockItemId.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructStockItemId(value: string): StockItemId {
	const result = StockItemIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"StockItemId.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const StockItemId = {
	create: createStockItemId,
	reconstruct: reconstructStockItemId,
} as const;
