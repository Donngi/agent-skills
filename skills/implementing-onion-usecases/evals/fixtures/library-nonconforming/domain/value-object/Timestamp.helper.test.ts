import { Timestamp } from "./Timestamp";

export function createDummyTimestamp(value = 1_000): Timestamp {
	return Timestamp.reconstruct(value);
}
