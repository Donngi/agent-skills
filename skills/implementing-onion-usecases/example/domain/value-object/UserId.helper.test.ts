import { UserId } from "./UserId";

export function createDummyUserId(
	value = "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
): UserId {
	return UserId.reconstruct(value);
}
