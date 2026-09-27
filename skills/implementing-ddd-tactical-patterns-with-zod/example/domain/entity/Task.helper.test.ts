import { createDummyLabels } from "../value-object/Labels.helper.test";
import { createDummyTaskId } from "../value-object/TaskId.helper.test";
import { createDummyUserId } from "../value-object/UserId.helper.test";
import {
	type CreateTaskProps,
	Task,
	type TaskDeps,
	type TaskSchemaInput,
} from "./Task";

type BacklogTaskSchemaInput = Extract<TaskSchemaInput, { status: "backlog" }>;

type InProgressTaskSchemaInput = Extract<
	TaskSchemaInput,
	{ status: "inProgress" }
>;

type DoneTaskSchemaInput = Extract<TaskSchemaInput, { status: "done" }>;

export function createDummyBacklogTask(
	params: Partial<Omit<BacklogTaskSchemaInput, "status">> = {},
): Task {
	return Task.reconstruct({
		id: "PROJ-1",
		title: "ダミーの表題",
		priority: "medium",
		labels: [],
		creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
		createdAt: 1_000,
		comments: [],
		...params,
		status: "backlog",
	});
}

export function createDummyInProgressTask(
	params: Partial<Omit<InProgressTaskSchemaInput, "status">> = {},
): Task {
	return Task.reconstruct({
		id: "PROJ-1",
		title: "ダミーの表題",
		priority: "medium",
		labels: [],
		creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
		createdAt: 1_000,
		comments: [],
		assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
		startedAt: 2_000,
		...params,
		status: "inProgress",
	});
}

export function createDummyDoneTask(
	params: Partial<Omit<DoneTaskSchemaInput, "status">> = {},
): Task {
	return Task.reconstruct({
		id: "PROJ-1",
		title: "ダミーの表題",
		priority: "medium",
		labels: [],
		creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
		createdAt: 1_000,
		comments: [],
		assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
		workPeriod: { startedAt: 2_000, completedAt: 3_000 },
		...params,
		status: "done",
	});
}

export function createDummyCreateTaskProps(
	params: Partial<CreateTaskProps> = {},
): CreateTaskProps {
	return {
		id: createDummyTaskId(),
		title: "ダミーの表題",
		priority: "medium",
		labels: createDummyLabels(),
		creatorId: createDummyUserId(),
		...params,
	};
}

export function createDummyTaskDeps(params: Partial<TaskDeps> = {}): TaskDeps {
	return {
		clock: { now: () => 1_000 },
		...params,
	};
}
