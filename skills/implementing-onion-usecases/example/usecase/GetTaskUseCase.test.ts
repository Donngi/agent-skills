import { describe, expect, test, vi } from "vitest";
import { createDummyComment } from "../domain/entity/Comment.helper.test";
import {
	createDummyBacklogTask,
	createDummyDoneTask,
	createDummyInProgressTask,
} from "../domain/entity/Task.helper.test";
import { createDummyTaskId } from "../domain/value-object/TaskId.helper.test";
import { createGetTaskUseCase } from "./GetTaskUseCase";
import { TaskNotFoundError } from "./shared-errors";

describe("GetTaskUseCase.run", () => {
	test.for([
		{
			name: "backlog",
			task: createDummyBacklogTask({
				id: "PROJ-42",
				title: "ダミーのタイトル",
				priority: "high",
				labels: ["bug"],
				pullRequestUrl: "https://example.com/owner/repo/pull/1",
				comments: [
					createDummyComment({
						authorId: "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
					}),
				],
			}),
			expected: {
				id: "PROJ-42",
				title: "ダミーのタイトル",
				priority: "high",
				labels: ["bug"],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				pullRequestUrl: "https://example.com/owner/repo/pull/1",
				comments: [
					{
						id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
						authorId: "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
						body: "ダミーのコメント",
						postedAt: 1_500,
					},
				],
				status: "backlog",
			},
		},
		{
			name: "inProgress",
			task: createDummyInProgressTask({
				id: "PROJ-43",
				title: "ダミーのタイトル",
				priority: "low",
			}),
			expected: {
				id: "PROJ-43",
				title: "ダミーのタイトル",
				priority: "low",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "inProgress",
				assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
				startedAt: 2_000,
			},
		},
		{
			name: "done",
			task: createDummyDoneTask({
				id: "PROJ-44",
				title: "ダミーのタイトル",
				priority: "highest",
			}),
			expected: {
				id: "PROJ-44",
				title: "ダミーのタイトル",
				priority: "highest",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "done",
				assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
				startedAt: 2_000,
				completedAt: 3_000,
			},
		},
	])(
		"正常系: $name の Task はその各プロパティを持つ Result になる",
		async ({ task, expected }) => {
			// Given: その状態の Task を返すリポジトリで
			const mockGet = vi.fn();
			mockGet.mockResolvedValueOnce(task);
			const usecase = createGetTaskUseCase({
				taskRepository: { get: mockGet, listByProject: vi.fn(), put: vi.fn() },
			});

			// When: Task を取得すると
			const result = await usecase.run({ taskId: createDummyTaskId() });

			// Then: その Task の各プロパティを持つ Result と一致する
			expect(result).toStrictEqual(expected);
		},
	);

	test("正常系: Result の配列は、Task の配列と別のものになる", async () => {
		// Given: labels と Comment を持つ Task を返すリポジトリで
		const task = createDummyBacklogTask({
			labels: ["bug"],
			comments: [createDummyComment()],
		});
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(task);
		const usecase = createGetTaskUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: vi.fn() },
		});

		// When: Task を取得すると
		const result = await usecase.run({ taskId: createDummyTaskId() });

		// Then: labels と comments と comments の要素は、Task のものそのものではない
		expect(result.labels).not.toBe(task.labels);
		expect(result.comments).not.toBe(task.comments);
		expect(result.comments[0]).not.toBe(task.comments[0]);
	});

	test("正常系: props の taskId で Task を取得する", async () => {
		// Given: Task を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyBacklogTask({ id: "PROJ-42" }));
		const usecase = createGetTaskUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: vi.fn() },
		});

		// When: PROJ-42 を取得すると
		await usecase.run({ taskId: createDummyTaskId("PROJ-42") });

		// Then: PROJ-42 で Task を取得している
		expect(mockGet).toHaveBeenCalledWith(createDummyTaskId("PROJ-42"));
	});

	test("正常系: PR が無い Task なら pullRequestUrl のキーを持たない", async () => {
		// Given: PR の無い Task を返すリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(createDummyBacklogTask());
		const usecase = createGetTaskUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: vi.fn() },
		});

		// When: Task を取得すると
		const result = await usecase.run({ taskId: createDummyTaskId() });

		// Then: Result に pullRequestUrl のキーが無い
		expect("pullRequestUrl" in result).toBe(false);
	});

	test("異常系: Task が無ければ TaskNotFoundError が発生する", async () => {
		// Given: Task を返さないリポジトリで
		const mockGet = vi.fn();
		mockGet.mockResolvedValueOnce(undefined);
		const usecase = createGetTaskUseCase({
			taskRepository: { get: mockGet, listByProject: vi.fn(), put: vi.fn() },
		});

		// When: Task の取得を始めると
		const pending = usecase.run({ taskId: createDummyTaskId() });

		// Then: TaskNotFoundError が発生する
		await expect(pending).rejects.toThrow(TaskNotFoundError);
	});
});
