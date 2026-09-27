import { z } from "zod";
import { SkuSchema } from "../value-object/Sku";

/** 1つの在庫が持てる数量の上限。棚1つに置ける箱数から決めている。 */
export const QUANTITY_MAX = 9999;

/** ある倉庫に置いてある1つの品番の在庫。 */
export const StockItemSchema = z.object({
	/** 在庫の識別子 */
	id: z.string().uuid(),
	/** 置いてある倉庫。大文字英字2〜6文字 */
	warehouseCode: z.string().regex(/^[A-Z]{2,6}$/),
	/** 品番 */
	sku: SkuSchema,
	/** 置いてある数量。0以上9999以下 */
	quantity: z.number().int().min(0).max(QUANTITY_MAX),
	/** 最後に動いたタイムスタンプ。Unix epoch ミリ秒 */
	updatedAt: z.number(),
});

export type StockItem = z.infer<typeof StockItemSchema>;

export function createStockItem(props: unknown): StockItem {
	return StockItemSchema.parse(props);
}

/** 出庫する。在庫が足りないときは失敗する。 */
export function shipStockItem(
	item: StockItem,
	quantity: number,
	at: number,
): StockItem {
	if (item.quantity < quantity) {
		throw new Error(`在庫が足りません: ${item.quantity} < ${quantity}`);
	}
	return { ...item, quantity: item.quantity - quantity, updatedAt: at };
}

/** 棚卸しの結果で数量を置き換える。 */
export function adjustStockItem(
	item: StockItem,
	quantity: number,
	at: number,
): StockItem {
	return StockItemSchema.parse({ ...item, quantity, updatedAt: at });
}
