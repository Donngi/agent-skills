import type { StockItem } from "../entity/StockItem";
import type { Sku } from "../value-object/Sku";
import type { WarehouseCode } from "../value-object/WarehouseCode";

/**
 * StockItemRepository
 * 在庫の永続層への入出力インターフェース。
 */
export type StockItemRepository = Readonly<{
	/**
	 * 倉庫と品番で1件取る。無ければ undefined。
	 * @throws InvalidReconstructParamError 保存されている値が壊れているとき。
	 */
	get: (
		warehouseCode: WarehouseCode,
		sku: Sku,
	) => Promise<StockItem | undefined>;
	/**
	 * 同じ倉庫の在庫を品番の昇順に取る。
	 * @throws InvalidReconstructParamError 保存されている値が壊れているとき。
	 */
	listByWarehouse: (
		warehouseCode: WarehouseCode,
		limit: number,
	) => Promise<readonly StockItem[]>;
	/** 1件保存する。無ければ作り、あれば置き換える。 */
	put: (item: StockItem) => Promise<void>;
}>;
