import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const SkuBrand: unique symbol;

/**
 * Sku
 * 在庫を数える単位になる品番。
 */
export const SkuSchema = z
	.string()
	.regex(/^[A-Z]{3}-[0-9]{5}$/, {
		error: "品番は ABC-00001 の形です",
	})
	.brand<typeof SkuBrand>();

export type Sku = z.output<typeof SkuSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createSku(value: string): Sku {
	const result = SkuSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("Sku.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructSku(value: string): Sku {
	const result = SkuSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError("Sku.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Sku = {
	create: createSku,
	reconstruct: reconstructSku,
} as const;
