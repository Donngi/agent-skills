import { Priority } from "./Priority";

export function createDummyPriority(value = "medium"): Priority {
	return Priority.reconstruct(value);
}
