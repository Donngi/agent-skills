import { describe, expect, test, vi } from "vitest";
import {
	TaskStartedBeforeCreationError,
	TaskStatusMismatchError,
} from "../domain/entity/Task";
import {
	createDummyBacklogTask,
	createDummyInProgressTask,
} from "../domain/entity/Task.helper.test";
import { createDummyTaskId } from "../domain/value-object/TaskId.helper.test";
import { createDummyTimestamp } from "../domain/value-object/Timestamp.helper.test";
import { createDummyUserId } from "../domain/value-object/UserId.helper.test";
import {
	createStartTaskUseCase,
	TaskNotStartableError,
} from "./StartTaskUseCase";
import { TaskNotFoundError, UseCaseError } from "./shared-errors";

describe("StartTaskUseCase.run", () => {
	test("正常系: 担当者と clock.now() の値で着手した Task を保存する", async () => {
		// Given: backlog の Task を返すリポジトリと、5000 を返す clock で
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyBacklogTask());
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const usecase = createStartTaskUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 着手すると
		await usecase.run({
			taskId: createDummyTaskId(),
			assigneeId: createDummyUserId("2e4f6a8b-1c3d-4e5f-9a7b-6c8d0e2f4a6b"),
		});

		// Then: inProgress になった Task が1回だけ保存される
		expect(mockPut.mock.calls[0]?.[0]).toStrictEqual(
			createDummyInProgressTask({
				assigneeId: "2e4f6a8b-1c3d-4e5f-9a7b-6c8d0e2f4a6b",
				startedAt: 5_000,
			}),
		);
		expect(mockPut).toHaveBeenCalledTimes(1);
	});

	test("正常系: props の taskId で Task を取得する", async () => {
		// Given: backlog の Task を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyBacklogTask({ id: "PROJ-42" }));
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const usecase = createStartTaskUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: PROJ-42 に着手すると
		await usecase.run({
			taskId: createDummyTaskId("PROJ-42"),
			assigneeId: createDummyUserId("2e4f6a8b-1c3d-4e5f-9a7b-6c8d0e2f4a6b"),
		});

		// Then: PROJ-42 で Task を取得している
		expect(mockGet).toHaveBeenCalledWith(createDummyTaskId("PROJ-42"));
	});

	test("異常系: Task が無ければ TaskNotFoundError が発生し、保存しない", async () => {
		// Given: Task を返さないリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(undefined);
		const mockPut = vi.fn();
		const usecase = createStartTaskUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 着手を始めると
		const pending = usecase.run({
			taskId: createDummyTaskId(),
			assigneeId: createDummyUserId(),
		});

		// Then: TaskNotFoundError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(TaskNotFoundError);
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: 着手中の Task なら TaskNotStartableError が発生し、保存しない", async () => {
		// Given: inProgress の Task を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyInProgressTask());
		const mockPut = vi.fn();
		const usecase = createStartTaskUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 着手を始めると
		const pending = usecase.run({
			taskId: createDummyTaskId(),
			assigneeId: createDummyUserId(),
		});

		// Then: TaskNotStartableError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(TaskNotStartableError);
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: 着手中の Task なら、TaskNotStartableError の cause に TaskStatusMismatchError が入る", async () => {
		// Given: inProgress の Task を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyInProgressTask());
		const usecase = createStartTaskUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: vi.fn() },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 着手を始めると
		const pending = usecase.run({
			taskId: createDummyTaskId(),
			assigneeId: createDummyUserId(),
		});

		// Then: cause に、状態の不一致を表す TaskStatusMismatchError が入っている
		await expect(pending).rejects.toMatchObject({
			cause: expect.any(TaskStatusMismatchError),
		});
		await expect(pending).rejects.toMatchObject({
			cause: { expected: "backlog", actual: "inProgress" },
		});
	});

	test("異常系: clock が作成より前を返したら TaskStartedBeforeCreationError がそのまま発生し、保存しない", async () => {
		// Given: 1000 に作られた backlog の Task と、500 を返す clock で
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyBacklogTask({ createdAt: 1_000 }));
		const mockPut = vi.fn();
		const usecase = createStartTaskUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(500) },
		});

		// When: 着手を始めると
		const pending = usecase.run({
			taskId: createDummyTaskId(),
			assigneeId: createDummyUserId(),
		});

		// Then: TaskStartedBeforeCreationError が詰め替えられずに発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(TaskStartedBeforeCreationError);
		expect(mockPut).not.toHaveBeenCalled();
	});
});

describe("TaskNotStartableError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 状態の不一致を表すドメインのエラーがあるとき
		const cause = new TaskStatusMismatchError(
			"Task.start",
			createDummyTaskId("PROJ-42"),
			"backlog",
			"inProgress",
		);

		// When: 操作名と TaskId と cause でエラーを作ると
		const error = new TaskNotStartableError(
			"StartTaskUseCase.run",
			createDummyTaskId("PROJ-42"),
			{ cause },
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と TaskId と cause が渡した値のまま残る", () => {
		// Given: 状態の不一致を表すドメインのエラーがあるとき
		const cause = new TaskStatusMismatchError(
			"Task.start",
			createDummyTaskId("PROJ-42"),
			"backlog",
			"inProgress",
		);

		// When: 操作名と TaskId と cause でエラーを作ると
		const error = new TaskNotStartableError(
			"StartTaskUseCase.run",
			createDummyTaskId("PROJ-42"),
			{ cause },
		);

		// Then: 操作名と TaskId が渡した値のまま残り、cause は渡したエラーそのものになる
		expect(error).toMatchObject({
			operation: "StartTaskUseCase.run",
			taskId: "PROJ-42",
		});
		expect(error.cause).toBe(cause);
	});

	test("正常系: name が TaskNotStartableError になる", () => {
		// Given: 状態の不一致を表すドメインのエラーがあるとき
		const cause = new TaskStatusMismatchError(
			"Task.start",
			createDummyTaskId("PROJ-42"),
			"backlog",
			"inProgress",
		);

		// When: 操作名と TaskId と cause でエラーを作ると
		const error = new TaskNotStartableError(
			"StartTaskUseCase.run",
			createDummyTaskId("PROJ-42"),
			{ cause },
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("TaskNotStartableError");
	});
});
