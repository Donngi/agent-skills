import { describe, expect, test, vi } from "vitest";
import { createDummyComment } from "../domain/entity/Comment.helper.test";
import {
	CommentLimitExceededError,
	DuplicateCommentError,
} from "../domain/entity/Task";
import { createDummyBacklogTask } from "../domain/entity/Task.helper.test";
import { InvalidCreationParamError } from "../domain/shared-errors";
import { createDummyTaskId } from "../domain/value-object/TaskId.helper.test";
import { createDummyTimestamp } from "../domain/value-object/Timestamp.helper.test";
import { createDummyUserId } from "../domain/value-object/UserId.helper.test";
import {
	CommentNotAddableError,
	createAddTaskCommentUseCase,
} from "./AddTaskCommentUseCase";
import {
	InvalidInputError,
	TaskNotFoundError,
	UseCaseError,
} from "./shared-errors";

describe("AddTaskCommentUseCase.run", () => {
	test("正常系: idGenerator の ID と clock.now() の値で Comment を追加した Task を保存する", async () => {
		// Given: Comment の無い Task を返すリポジトリと、5000 を返す clock と、固定の ID を返す idGenerator で
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyBacklogTask());
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const usecase = createAddTaskCommentUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
			idGenerator: { next: () => "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a" },
		});

		// When: Task の作成者と別の投稿者が Comment を追加すると
		await usecase.run({
			taskId: createDummyTaskId(),
			authorId: createDummyUserId("5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f"),
			body: "レビューをお願いします",
		});

		// Then: その Comment を1件持つ Task が1回だけ保存される
		expect(mockPut.mock.calls[0]?.[0]).toStrictEqual(
			createDummyBacklogTask({
				comments: [
					createDummyComment({
						id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
						authorId: "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
						body: "レビューをお願いします",
						postedAt: 5_000,
					}),
				],
			}),
		);
		expect(mockPut).toHaveBeenCalledTimes(1);
	});

	test("正常系: props の taskId で Task を取得する", async () => {
		// Given: Comment の無い Task を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyBacklogTask({ id: "PROJ-42" }));
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const usecase = createAddTaskCommentUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
			idGenerator: { next: () => "8e7d6c5b-4a39-4281-9f0e-d1c2b3a4f5e6" },
		});

		// When: PROJ-42 に Comment を追加すると
		await usecase.run({
			taskId: createDummyTaskId("PROJ-42"),
			authorId: createDummyUserId(),
			body: "ダミーのコメント",
		});

		// Then: PROJ-42 で Task を取得している
		expect(mockGet).toHaveBeenCalledWith(createDummyTaskId("PROJ-42"));
	});

	test("正常系: 追加した Comment の ID を返す", async () => {
		// Given: Comment を1件持つ Task を返すリポジトリと、呼ぶたびに違う ID を返す idGenerator で
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(
			createDummyBacklogTask({
				comments: [
					createDummyComment({ id: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" }),
				],
			}),
		);
		const mockPut = vi.fn();
		mockPut.mockResolvedValueOnce(undefined);
		const mockNext = vi.fn();
		mockNext
			.mockReturnValueOnce("8e7d6c5b-4a39-4281-9f0e-d1c2b3a4f5e6")
			.mockReturnValueOnce("2c4e6a8b-0d1f-4a3c-9e5b-7d9f1b3d5f7a");
		const usecase = createAddTaskCommentUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
			idGenerator: { next: mockNext },
		});

		// When: Comment を追加すると
		const result = await usecase.run({
			taskId: createDummyTaskId(),
			authorId: createDummyUserId(),
			body: "ダミーのコメント",
		});

		// Then: 保存した Task の末尾の Comment と同じ ID が返される
		expect(result).toStrictEqual({
			commentId: "8e7d6c5b-4a39-4281-9f0e-d1c2b3a4f5e6",
		});
		expect(mockPut.mock.calls[0]?.[0].comments.at(-1)?.id).toBe(
			"8e7d6c5b-4a39-4281-9f0e-d1c2b3a4f5e6",
		);
	});

	test("異常系: Task が無ければ TaskNotFoundError が発生し、保存しない", async () => {
		// Given: Task を返さないリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(undefined);
		const mockPut = vi.fn();
		const usecase = createAddTaskCommentUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
			idGenerator: { next: () => "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f" },
		});

		// When: Comment の追加を始めると
		const pending = usecase.run({
			taskId: createDummyTaskId(),
			authorId: createDummyUserId(),
			body: "ダミーのコメント",
		});

		// Then: TaskNotFoundError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(TaskNotFoundError);
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: 本文が空なら InvalidInputError が発生し、保存しない", async () => {
		// Given: Comment の無い Task を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyBacklogTask());
		const mockPut = vi.fn();
		const usecase = createAddTaskCommentUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
			idGenerator: { next: () => "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f" },
		});

		// When: 空の本文で Comment の追加を始めると
		const pending = usecase.run({
			taskId: createDummyTaskId(),
			authorId: createDummyUserId(),
			body: "",
		});

		// Then: InvalidInputError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(InvalidInputError);
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: 本文が空なら、InvalidInputError の cause に InvalidCreationParamError が入る", async () => {
		// Given: Comment の無い Task を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyBacklogTask());
		const mockPut = vi.fn();
		const usecase = createAddTaskCommentUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
			idGenerator: { next: () => "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f" },
		});

		// When: 空の本文で Comment の追加を始めると
		const pending = usecase.run({
			taskId: createDummyTaskId(),
			authorId: createDummyUserId(),
			body: "",
		});

		// Then: cause に、Comment.create が投げた InvalidCreationParamError が入っている
		await expect(pending).rejects.toMatchObject({
			cause: expect.any(InvalidCreationParamError),
		});
		await expect(pending).rejects.toMatchObject({
			cause: { operation: "Comment.create" },
		});
	});

	test("異常系: idGenerator が既存の Comment と同じ ID を返したら DuplicateCommentError がそのまま発生し、保存しない", async () => {
		// Given: Comment を1件持つ Task と、その Comment と同じ ID を返す idGenerator で
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(
			createDummyBacklogTask({
				comments: [
					createDummyComment({ id: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" }),
				],
			}),
		);
		const mockPut = vi.fn();
		const usecase = createAddTaskCommentUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
			idGenerator: { next: () => "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" },
		});

		// When: Comment の追加を始めると
		const pending = usecase.run({
			taskId: createDummyTaskId(),
			authorId: createDummyUserId(),
			body: "ダミーのコメント",
		});

		// Then: DuplicateCommentError が詰め替えられずに発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(DuplicateCommentError);
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: Comment が上限まであるなら CommentNotAddableError が発生し、保存しない", async () => {
		// Given: Comment を50件持つ Task を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(
			createDummyBacklogTask({
				comments: Array.from({ length: 50 }, (_, i) =>
					createDummyComment({
						id: `3f2c0c1e-8a4b-4d6e-9f10-${String(i).padStart(12, "0")}`,
					}),
				),
			}),
		);
		const mockPut = vi.fn();
		const usecase = createAddTaskCommentUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
			idGenerator: { next: () => "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f" },
		});

		// When: Comment の追加を始めると
		const pending = usecase.run({
			taskId: createDummyTaskId(),
			authorId: createDummyUserId(),
			body: "ダミーのコメント",
		});

		// Then: CommentNotAddableError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(CommentNotAddableError);
		expect(mockPut).not.toHaveBeenCalled();
	});

	test("異常系: Comment が上限まであるなら、CommentNotAddableError の cause に CommentLimitExceededError が入る", async () => {
		// Given: Comment を50件持つ Task を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(
			createDummyBacklogTask({
				comments: Array.from({ length: 50 }, (_, i) =>
					createDummyComment({
						id: `3f2c0c1e-8a4b-4d6e-9f10-${String(i).padStart(12, "0")}`,
					}),
				),
			}),
		);
		const mockPut = vi.fn();
		const usecase = createAddTaskCommentUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
			clock: { now: () => createDummyTimestamp(5_000) },
			idGenerator: { next: () => "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f" },
		});

		// When: Comment の追加を始めると
		const pending = usecase.run({
			taskId: createDummyTaskId(),
			authorId: createDummyUserId(),
			body: "ダミーのコメント",
		});

		// Then: cause に、件数の上限を表す CommentLimitExceededError が入っている
		await expect(pending).rejects.toMatchObject({
			cause: expect.any(CommentLimitExceededError),
		});
		await expect(pending).rejects.toMatchObject({
			cause: { limit: 50 },
		});
	});
});

describe("CommentNotAddableError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 件数の上限を表すドメインのエラーがあるとき
		const cause = new CommentLimitExceededError(
			"Task.addComment",
			createDummyTaskId("PROJ-42"),
			50,
		);

		// When: 操作名と TaskId と cause でエラーを作ると
		const error = new CommentNotAddableError(
			"AddTaskCommentUseCase.run",
			createDummyTaskId("PROJ-42"),
			{ cause },
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と TaskId と cause が渡した値のまま残る", () => {
		// Given: 件数の上限を表すドメインのエラーがあるとき
		const cause = new CommentLimitExceededError(
			"Task.addComment",
			createDummyTaskId("PROJ-42"),
			50,
		);

		// When: 操作名と TaskId と cause でエラーを作ると
		const error = new CommentNotAddableError(
			"AddTaskCommentUseCase.run",
			createDummyTaskId("PROJ-42"),
			{ cause },
		);

		// Then: 操作名と TaskId が渡した値のまま残り、cause は渡したエラーそのものになる
		expect(error).toMatchObject({
			operation: "AddTaskCommentUseCase.run",
			taskId: "PROJ-42",
		});
		expect(error.cause).toBe(cause);
	});

	test("正常系: name が CommentNotAddableError になる", () => {
		// Given: 件数の上限を表すドメインのエラーがあるとき
		const cause = new CommentLimitExceededError(
			"Task.addComment",
			createDummyTaskId("PROJ-42"),
			50,
		);

		// When: 操作名と TaskId と cause でエラーを作ると
		const error = new CommentNotAddableError(
			"AddTaskCommentUseCase.run",
			createDummyTaskId("PROJ-42"),
			{ cause },
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("CommentNotAddableError");
	});
});
