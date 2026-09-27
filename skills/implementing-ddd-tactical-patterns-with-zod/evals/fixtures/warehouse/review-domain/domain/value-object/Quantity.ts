import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

/** 1つの在庫が持てる数量の上限。 */
const QUANTITY_MAX = 9999;

/**
 * Quantity
 * 在庫の数量。
 */
export const QuantitySchema = z
	.int()
	.nonnegative({ error: "数量は0以上です" })
	.max(QUANTITY_MAX, { error: `数量は${QUANTITY_MAX}までです` })
	.brand<"Quantity">();

export type Quantity = z.output<typeof QuantitySchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createQuantity(value: number): Quantity {
	const result = QuantitySchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("Quantity.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructQuantity(value: number): Quantity {
	const result = QuantitySchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"Quantity.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

function quantityEquals(a: Quantity, b: Quantity): boolean {
	return a === b;
}

// -------------------------------------------------
// 演算
// -------------------------------------------------

export type AddQuantityParams = Readonly<{
	/** 足す数量 */
	addend: Quantity;
}>;

function addQuantity(quantity: Quantity, params: AddQuantityParams): Quantity {
	return Math.min(quantity + params.addend, QUANTITY_MAX) as Quantity;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Quantity = {
	create: createQuantity,
	reconstruct: reconstructQuantity,
	equals: quantityEquals,
	add: addQuantity,
} as const;
