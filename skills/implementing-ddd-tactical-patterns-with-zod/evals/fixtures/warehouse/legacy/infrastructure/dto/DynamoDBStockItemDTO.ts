import { z } from "zod";
import {
	QUANTITY_MAX,
	type StockItem,
	StockItemSchema,
} from "../../domain/entity/StockItem";

/** 在庫の保存形式。 */
export const DynamoDBStockItemDTOSchema = z.object({
	PK: z.string(),
	SK: z.string(),
	id: z.string().uuid(),
	warehouseCode: z.string().regex(/^[A-Z]{2,6}$/),
	sku: z.string().regex(/^[A-Z]{3}-[0-9]{1,5}$/),
	quantity: z.number().int().min(0).max(QUANTITY_MAX),
	updatedAt: z.string(),
});

export type DynamoDBStockItemDTO = z.infer<typeof DynamoDBStockItemDTOSchema>;

/** 保存形式とドメインの相互変換。updatedAt は保存が ISO 8601、ドメインがミリ秒。 */
export const DynamoDBStockItemDTOCodec = z.codec(
	DynamoDBStockItemDTOSchema,
	StockItemSchema,
	{
		decode: (item) => ({
			id: item.id,
			warehouseCode: item.warehouseCode,
			sku: item.sku,
			quantity: item.quantity,
			updatedAt: Date.parse(item.updatedAt),
		}),
		encode: (item) => ({
			PK: `WAREHOUSE#${item.warehouseCode}`,
			SK: `STOCK#${item.sku}`,
			id: item.id,
			warehouseCode: item.warehouseCode,
			sku: item.sku,
			quantity: item.quantity,
			updatedAt: new Date(item.updatedAt).toISOString(),
		}),
	},
);

export function toDynamoDBStockItemDTO(item: StockItem): DynamoDBStockItemDTO {
	return z.encode(DynamoDBStockItemDTOCodec, item);
}

export function fromDynamoDBStockItemDTO(raw: unknown): StockItem {
	return DynamoDBStockItemDTOCodec.parse(raw);
}
