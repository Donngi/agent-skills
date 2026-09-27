import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const ShipmentNumberBrand: unique symbol;

/**
 * ShipmentNumber
 * 出荷指示に付く番号。上流の受注システムが採番する。
 */
export const ShipmentNumberSchema = z
	.string()
	.regex(/^SHP-[0-9]{6}$/, {
		error: "出荷指示番号は SHP-000001 の形です",
	})
	.brand<typeof ShipmentNumberBrand>();

export type ShipmentNumber = z.output<typeof ShipmentNumberSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createShipmentNumber(value: string): ShipmentNumber {
	const result = ShipmentNumberSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("ShipmentNumber.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructShipmentNumber(value: string): ShipmentNumber {
	const result = ShipmentNumberSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"ShipmentNumber.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const ShipmentNumber = {
	create: createShipmentNumber,
	reconstruct: reconstructShipmentNumber,
} as const;
