import { TaskId } from "./TaskId";

export function createDummyTaskId(value = "PROJ-1"): TaskId {
	return TaskId.reconstruct(value);
}
