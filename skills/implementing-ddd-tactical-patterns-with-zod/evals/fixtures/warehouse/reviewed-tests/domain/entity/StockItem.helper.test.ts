import { createDummySku } from "../value-object/Sku.helper.test";
import { createDummyStockItemId } from "../value-object/StockItemId.helper.test";
import type { Timestamp } from "../value-object/Timestamp";
import { createDummyTimestamp } from "../value-object/Timestamp.helper.test";
import { createDummyWarehouseCode } from "../value-object/WarehouseCode.helper.test";
import {
	type CreateStockItemProps,
	StockItem,
	type StockItemDeps,
	type StockItemSchemaInput,
} from "./StockItem";

type HeldStockItemSchemaInput = Extract<
	StockItemSchemaInput,
	{ status: "held" }
>;

export function createDummyAvailableStockItem(
	params: Partial<CreateStockItemProps> & { updatedAt?: Timestamp } = {},
): StockItem {
	const { updatedAt = createDummyTimestamp(1_000), ...props } = params;
	return StockItem.create(
		{
			id: createDummyStockItemId(),
			warehouseCode: createDummyWarehouseCode(),
			sku: createDummySku(),
			quantity: 10,
			...props,
		},
		{ clock: { now: () => updatedAt } },
	);
}

export function createDummyHeldStockItem(
	params: Partial<Omit<HeldStockItemSchemaInput, "status">> = {},
): StockItem {
	return StockItem.reconstruct({
		id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
		warehouseCode: "TOKYO",
		sku: "ABC-00001",
		quantity: 10,
		updatedAt: 1_000,
		heldFor: "SHP-000001",
		heldQuantity: 3,
		heldAt: 1_000,
		...params,
		status: "held",
	});
}

export function createDummyCreateStockItemProps(
	params: Partial<CreateStockItemProps> = {},
): CreateStockItemProps {
	return {
		id: createDummyStockItemId(),
		warehouseCode: createDummyWarehouseCode(),
		sku: createDummySku(),
		quantity: 10,
		...params,
	};
}

export function createDummyStockItemDeps(now = 1_000): StockItemDeps {
	return { clock: { now: () => now } };
}
