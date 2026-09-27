import { ShipmentNumber } from "./ShipmentNumber";

export function createDummyShipmentNumber(
	value = "SHP-000001",
): ShipmentNumber {
	return ShipmentNumber.reconstruct(value);
}
