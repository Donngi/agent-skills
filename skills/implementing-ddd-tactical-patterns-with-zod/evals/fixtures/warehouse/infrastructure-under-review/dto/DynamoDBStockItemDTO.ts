import { z } from "zod";
import {
	QUANTITY_MAX,
	StockItem,
	type StockItemSchemaInput,
} from "../../domain/entity/StockItem";
import {
	FatalUnreachableError,
	InvalidCreationParamError,
} from "../../domain/shared-errors";
import type { Sku } from "../../domain/value-object/Sku";
import type { WarehouseCode } from "../../domain/value-object/WarehouseCode";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

function toDynamoDBStockItemDTOPartitionKey(warehouseCode: WarehouseCode): string {
	return `WAREHOUSE#${warehouseCode}`;
}

function toDynamoDBStockItemDTOKey(
	warehouseCode: WarehouseCode,
	sku: Sku,
): Readonly<{ PK: string; SK: string }> {
	return {
		PK: `WAREHOUSE#${warehouseCode}`,
		SK: `STOCK#${sku}`,
	};
}

/** 保存は ISO 8601 の文字列、ドメインは Unix epoch ミリ秒。 */
const UpdatedAtCodec = z.codec(z.iso.datetime(), z.number(), {
	decode: (value) => Date.parse(value),
	encode: (value) => new Date(value).toISOString(),
});

/**
 * DynamoDBStockItemDTO
 * 在庫の DTO。
 */
export const DynamoDBStockItemDTOSchema = z.strictObject({
	/** パーティションキー */
	PK: z.string().regex(/^WAREHOUSE#[^#]+$/),
	/** ソートキー */
	SK: z.string().regex(/^STOCK#[^#]+$/),
	/** 在庫の識別子 */
	id: z.uuid({ version: "v4" }),
	/** 置いてある倉庫 */
	warehouseCode: z.string().regex(/^[A-Z]{2,6}$/),
	/** 品番 */
	sku: z.string().regex(/^[A-Z]{3}-[0-9]{5}$/),
	/** 置いてある数量 */
	quantity: z.int().nonnegative().max(QUANTITY_MAX),
	/** 最後に動いたタイムスタンプ */
	updatedAt: UpdatedAtCodec,
	/** 状態 */
	status: z.string(),
	/** 引き当てた出荷指示 */
	heldFor: z
		.string()
		.regex(/^SHP-[0-9]{6}$/)
		.optional(),
	/** 引き当てた数量 */
	heldQuantity: z.int().positive().optional(),
	/** 引き当てのタイムスタンプ */
	heldAt: z.number().optional(),
});

export type DynamoDBStockItemDTO = z.output<typeof DynamoDBStockItemDTOSchema>;

// -------------------------------------------------
// 変換
// -------------------------------------------------

function toDynamoDBStockItemDTO(item: StockItem): DynamoDBStockItemDTO {
	const result = DynamoDBStockItemDTOSchema.safeParse({
		...toDynamoDBStockItemDTOKey(item.warehouseCode, item.sku),
		id: item.id,
		warehouseCode: item.warehouseCode,
		sku: item.sku,
		quantity: item.quantity,
		updatedAt: new Date(item.updatedAt).toISOString(),
		status: item.status,
		heldFor: item.status === "held" ? item.heldFor : undefined,
		heldQuantity: item.status === "held" ? item.heldQuantity : undefined,
		heldAt: item.status === "held" ? item.heldAt : undefined,
	});
	if (!result.success) {
		throw new FatalUnreachableError("DynamoDBStockItemDTO.to", result.error);
	}
	return result.data;
}

/** @throws InvalidCreationParamError 保存されている値が壊れているとき。 */
function fromDynamoDBStockItemDTO(raw: unknown): StockItem {
	const result = DynamoDBStockItemDTOSchema.safeParse(raw);
	if (!result.success) {
		throw new InvalidCreationParamError("DynamoDBStockItemDTO.from", result.error);
	}
	const { PK: _pk, SK: _sk, ...rest } = result.data;
	return StockItem.reconstruct(rest as unknown as StockItemSchemaInput);
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const DynamoDBStockItemDTO = {
	key: toDynamoDBStockItemDTOKey,
	partitionKey: toDynamoDBStockItemDTOPartitionKey,
	to: toDynamoDBStockItemDTO,
	from: fromDynamoDBStockItemDTO,
} as const;
