import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const MoneyBrand: unique symbol;

/**
 * Money
 * 円単位の金額。
 */
export const MoneySchema = z
	.int()
	.nonnegative({ error: "金額は0以上です" })
	.brand<typeof MoneyBrand>();

export type Money = z.output<typeof MoneySchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createMoney(value: number): Money {
	const result = MoneySchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("Money.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructMoney(value: number): Money {
	const result = MoneySchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError("Money.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Money = {
	create: createMoney,
	reconstruct: reconstructMoney,
} as const;
