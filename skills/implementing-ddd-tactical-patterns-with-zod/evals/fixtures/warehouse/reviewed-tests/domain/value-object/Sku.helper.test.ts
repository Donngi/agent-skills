import { Sku } from "./Sku";

export function createDummySku(value = "ABC-00001"): Sku {
	return Sku.reconstruct(value);
}
