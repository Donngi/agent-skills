import { z } from "zod";
import { StockItem, StockItemSchema } from "../../domain/entity/StockItem";
import {
	FatalUnreachableError,
	InvalidReconstructParamError,
} from "../../domain/shared-errors";
import type { Sku } from "../../domain/value-object/Sku";
import type { WarehouseCode } from "../../domain/value-object/WarehouseCode";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

const DynamoDBStockItemDTOCommonFields = {
	// 保存キーは templateLiteral ではなく string + regex で書く。
	// templateLiteral にすると出力型が `WAREHOUSE#${string}` になり、戻り値型を注釈していない
	// 中間オブジェクトをスプレッドして組み立てたときに as が要る。
	// regex は区切りの位置だけを見る。倉庫コードと品番の文字種と長さはドメインの制約なので
	// 写さない。写すとドメイン側を広げた瞬間に、有効な値の保存がここで落ちる
	/** パーティションキー */
	PK: z.string().regex(/^WAREHOUSE#[^#]+$/),
	/** ソートキー */
	SK: z.string().regex(/^STOCK#[^#]+$/),
	/** 在庫の識別子 */
	id: z.string(),
	/** 置いてある倉庫 */
	warehouseCode: z.string(),
	/** 品番 */
	sku: z.string(),
	/** 置いてある数量 */
	quantity: z.number(),
	/** 最後に動いたタイムスタンプ */
	updatedAt: z.number(),
};

/**
 * DynamoDBStockItemDTO
 * 在庫の DTO。
 */
// 状態別ユニオンにする。単一オブジェクトで状態ごとの項目を任意にすると、
// ドメインへ変換するときに as が要る
const DynamoDBStockItemDTOSchema = z
	.discriminatedUnion("status", [
		z.strictObject({
			...DynamoDBStockItemDTOCommonFields,
			status: z.literal("available"),
		}),
		z.strictObject({
			...DynamoDBStockItemDTOCommonFields,
			status: z.literal("held"),
			/** 引き当てた出荷指示 */
			heldFor: z.string(),
			/** 引き当てた数量 */
			heldQuantity: z.number(),
			/** 引き当てのタイムスタンプ */
			heldAt: z.number(),
		}),
	])
	.superRefine((v, ctx) => {
		const key = toPKSKFromRawFields(v.warehouseCode, v.sku);
		if (v.PK !== key.PK) {
			ctx.addIssue({
				code: "custom",
				path: ["PK"],
				message: "パーティションキーは倉庫コードから導出した値です",
			});
		}
		if (v.SK !== key.SK) {
			ctx.addIssue({
				code: "custom",
				path: ["SK"],
				message: "ソートキーは品番から導出した値です",
			});
		}
	});

export type DynamoDBStockItemDTO = z.output<typeof DynamoDBStockItemDTOSchema>;

// -------------------------------------------------
// 変換
// -------------------------------------------------

function toPKFromRawWarehouseCode(warehouseCode: string): string {
	return `WAREHOUSE#${warehouseCode}`;
}

export function toDynamoDBStockItemDTOPK(warehouseCode: WarehouseCode): string {
	return toPKFromRawWarehouseCode(warehouseCode);
}

/** 横断検証からも呼ぶので、検証前の文字列を受ける。 */
function toPKSKFromRawFields(
	warehouseCode: string,
	sku: string,
): Readonly<{ PK: string; SK: string }> {
	return {
		PK: toPKFromRawWarehouseCode(warehouseCode),
		SK: `STOCK#${sku}`,
	};
}

export function toDynamoDBStockItemDTOPKSK(
	warehouseCode: WarehouseCode,
	sku: Sku,
): Readonly<{ PK: string; SK: string }> {
	return toPKSKFromRawFields(warehouseCode, sku);
}

function toDynamoDBStockItemDTOCommonFields(item: StockItem) {
	return {
		...toDynamoDBStockItemDTOPKSK(item.warehouseCode, item.sku),
		id: item.id,
		warehouseCode: item.warehouseCode,
		sku: item.sku,
		quantity: item.quantity,
		updatedAt: item.updatedAt,
	};
}

function toDynamoDBStockItemDTOFields(item: StockItem): DynamoDBStockItemDTO {
	const common = toDynamoDBStockItemDTOCommonFields(item);
	switch (item.status) {
		case "available":
			return { ...common, status: "available" };
		case "held":
			return {
				...common,
				status: "held",
				heldFor: item.heldFor,
				heldQuantity: item.heldQuantity,
				heldAt: item.heldAt,
			};
		default:
			item satisfies never;
			throw new FatalUnreachableError("DynamoDBStockItemDTO.to");
	}
}

export function toDynamoDBStockItemDTO(item: StockItem): DynamoDBStockItemDTO {
	// StockItem 型でも不変条件を満たすとは限らない。ブランドはスプレッドで引き継がれるので、
	// 規約に反してドメインの外でスプレッドして作った値も StockItem 型になる。
	// 壊れた値を書き込むと以後の読み出しがすべて失敗するので、保存形式にする前に確かめる
	const checked = StockItemSchema.safeParse(item);
	if (!checked.success) {
		throw new FatalUnreachableError("DynamoDBStockItemDTO.to", checked.error);
	}
	const raw = toDynamoDBStockItemDTOFields(checked.data);
	const result = DynamoDBStockItemDTOSchema.safeParse(raw);
	if (!result.success) {
		throw new FatalUnreachableError("DynamoDBStockItemDTO.to", result.error);
	}
	return result.data;
}

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
export function fromDynamoDBStockItemDTO(raw: unknown): StockItem {
	const result = DynamoDBStockItemDTOSchema.safeParse(raw);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"DynamoDBStockItemDTO.from",
			result.error,
		);
	}
	const { PK: _pk, SK: _sk, ...rest } = result.data;
	return StockItem.reconstruct(rest);
}
