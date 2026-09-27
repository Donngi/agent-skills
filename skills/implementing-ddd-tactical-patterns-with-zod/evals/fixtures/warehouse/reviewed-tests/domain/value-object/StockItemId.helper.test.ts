import { StockItemId } from "./StockItemId";

export function createDummyStockItemId(
	value = "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
): StockItemId {
	return StockItemId.reconstruct(value);
}
