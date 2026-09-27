import { WarehouseCode } from "./WarehouseCode";

export function createDummyWarehouseCode(value = "TOKYO"): WarehouseCode {
	return WarehouseCode.reconstruct(value);
}
