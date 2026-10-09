import { describe, expect, test, vi } from "vitest";
import { TaskNumberExhaustedError } from "../domain/domain-service/TaskNumberIssuer";
import {
	TaskCreationOnArchivedProjectError,
	TaskIdProjectMismatchError,
} from "../domain/entity/Project";
import { createDummyProject } from "../domain/entity/Project.helper.test";
import { createDummyBacklogTask } from "../domain/entity/Task.helper.test";
import { InvalidCreationParamError } from "../domain/shared-errors";
import { createDummyLabels } from "../domain/value-object/Labels.helper.test";
import { createDummyProjectId } from "../domain/value-object/ProjectId.helper.test";
import { createDummyPullRequestUrl } from "../domain/value-object/PullRequestUrl.helper.test";
import { createDummyTaskId } from "../domain/value-object/TaskId.helper.test";
import { createDummyTimestamp } from "../domain/value-object/Timestamp.helper.test";
import { createDummyUserId } from "../domain/value-object/UserId.helper.test";
import {
	createCreateTaskUseCase,
	ProjectArchivedError,
	ProjectNotFoundError,
	TaskNumberUnavailableError,
} from "./CreateTaskUseCase";
import { InvalidInputError, UseCaseError } from "./shared-errors";

describe("CreateTaskUseCase.run", () => {
	test("正常系: 採番した ID と clock.now() の値と渡した値で backlog の Task を作って保存する", async () => {
		// Given: アーカイブされていない Project と、PROJ-7 を返す TaskNumberIssuer で
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(createDummyProject());
		const mockTaskPut = vi.fn();
		mockTaskPut.mockResolvedValueOnce(undefined);
		const mockNext = vi.fn();
		mockNext.mockResolvedValueOnce(createDummyTaskId("PROJ-7"));
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: Task を作ると
		await usecase.run({
			projectId: createDummyProjectId(),
			title: "ダミーのタイトル",
			priority: "high",
			labels: createDummyLabels(["bug"]),
			creatorId: createDummyUserId("5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f"),
		});

		// Then: 採番した ID と clock.now() の値と渡した値を持つ backlog の Task が1回だけ保存される
		expect(mockTaskPut.mock.calls[0]?.[0]).toStrictEqual(
			createDummyBacklogTask({
				id: "PROJ-7",
				title: "ダミーのタイトル",
				priority: "high",
				labels: ["bug"],
				creatorId: "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
				createdAt: 5_000,
			}),
		);
		expect(mockTaskPut).toHaveBeenCalledTimes(1);
	});

	test("正常系: props の projectId で Project を取得し、そのプロジェクトで採番する", async () => {
		// Given: アーカイブされていない Project と、OPS-7 を返す TaskNumberIssuer で
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(createDummyProject({ id: "OPS" }));
		const mockTaskPut = vi.fn();
		mockTaskPut.mockResolvedValueOnce(undefined);
		const mockNext = vi.fn();
		mockNext.mockResolvedValueOnce(createDummyTaskId("OPS-7"));
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: OPS に Task を作ると
		await usecase.run({
			projectId: createDummyProjectId("OPS"),
			title: "ダミーのタイトル",
			priority: "medium",
			labels: createDummyLabels(),
			creatorId: createDummyUserId(),
		});

		// Then: OPS で Project を取得し、OPS で採番している
		expect(mockProjectGet).toHaveBeenCalledWith(createDummyProjectId("OPS"));
		expect(mockNext).toHaveBeenCalledWith(createDummyProjectId("OPS"));
	});

	test("正常系: PR の URL を渡すと、それを持つ Task を保存する", async () => {
		// Given: アーカイブされていない Project と、PROJ-7 を返す TaskNumberIssuer で
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(createDummyProject());
		const mockTaskPut = vi.fn();
		mockTaskPut.mockResolvedValueOnce(undefined);
		const mockNext = vi.fn();
		mockNext.mockResolvedValueOnce(createDummyTaskId("PROJ-7"));
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: PR の URL を付けて Task を作ると
		await usecase.run({
			projectId: createDummyProjectId(),
			title: "ダミーのタイトル",
			priority: "low",
			labels: createDummyLabels(["docs"]),
			creatorId: createDummyUserId("5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f"),
			pullRequestUrl: createDummyPullRequestUrl(
				"https://example.com/owner/repo/pull/42",
			),
		});

		// Then: その URL を持つ Task が保存される
		expect(mockTaskPut.mock.calls[0]?.[0]).toStrictEqual(
			createDummyBacklogTask({
				id: "PROJ-7",
				title: "ダミーのタイトル",
				priority: "low",
				labels: ["docs"],
				creatorId: "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
				createdAt: 5_000,
				pullRequestUrl: "https://example.com/owner/repo/pull/42",
			}),
		);
	});

	test("正常系: 作った Task の ID を返す", async () => {
		// Given: アーカイブされていない Project と、PROJ-7 を返す TaskNumberIssuer で
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(createDummyProject());
		const mockTaskPut = vi.fn();
		mockTaskPut.mockResolvedValueOnce(undefined);
		const mockNext = vi.fn();
		mockNext.mockResolvedValueOnce(createDummyTaskId("PROJ-7"));
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: Task を作ると
		const result = await usecase.run({
			projectId: createDummyProjectId(),
			title: "ダミーのタイトル",
			priority: "medium",
			labels: createDummyLabels(),
			creatorId: createDummyUserId(),
		});

		// Then: 採番した ID が返される
		expect(result).toStrictEqual({ taskId: "PROJ-7" });
	});

	test("異常系: Project が無ければ ProjectNotFoundError が発生し、採番も保存もしない", async () => {
		// Given: Project を返さないリポジトリで
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(undefined);
		const mockTaskPut = vi.fn();
		const mockNext = vi.fn();
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: Task の作成を始めると
		const pending = usecase.run({
			projectId: createDummyProjectId(),
			title: "ダミーのタイトル",
			priority: "medium",
			labels: createDummyLabels(),
			creatorId: createDummyUserId(),
		});

		// Then: ProjectNotFoundError が発生し、採番も保存も呼ばれない
		await expect(pending).rejects.toThrow(ProjectNotFoundError);
		expect(mockNext).not.toHaveBeenCalled();
		expect(mockTaskPut).not.toHaveBeenCalled();
	});

	test("異常系: アーカイブ済みの Project なら ProjectArchivedError が発生し、保存しない", async () => {
		// Given: アーカイブ済みの Project で
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(
			createDummyProject({ archived: true }),
		);
		const mockTaskPut = vi.fn();
		const mockNext = vi.fn();
		mockNext.mockResolvedValueOnce(createDummyTaskId("PROJ-7"));
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: Task の作成を始めると
		const pending = usecase.run({
			projectId: createDummyProjectId(),
			title: "ダミーのタイトル",
			priority: "medium",
			labels: createDummyLabels(),
			creatorId: createDummyUserId(),
		});

		// Then: ProjectArchivedError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(ProjectArchivedError);
		expect(mockTaskPut).not.toHaveBeenCalled();
	});

	test("異常系: アーカイブ済みの Project なら、ProjectArchivedError の cause に TaskCreationOnArchivedProjectError が入る", async () => {
		// Given: アーカイブ済みの Project で
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(
			createDummyProject({ archived: true }),
		);
		const mockTaskPut = vi.fn();
		const mockNext = vi.fn();
		mockNext.mockResolvedValueOnce(createDummyTaskId("PROJ-7"));
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: Task の作成を始めると
		const pending = usecase.run({
			projectId: createDummyProjectId(),
			title: "ダミーのタイトル",
			priority: "medium",
			labels: createDummyLabels(),
			creatorId: createDummyUserId(),
		});

		// Then: cause に、アーカイブ済みを表す TaskCreationOnArchivedProjectError が入っている
		await expect(pending).rejects.toMatchObject({
			cause: expect.any(TaskCreationOnArchivedProjectError),
		});
		await expect(pending).rejects.toMatchObject({
			cause: { projectId: "PROJ" },
		});
	});

	test("異常系: タスク番号が上限に達していれば TaskNumberUnavailableError が発生し、保存しない", async () => {
		// Given: TaskNumberExhaustedError を投げる TaskNumberIssuer で
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(createDummyProject());
		const mockTaskPut = vi.fn();
		const mockNext = vi.fn();
		mockNext.mockRejectedValueOnce(
			new TaskNumberExhaustedError(
				"TaskNumberIssuer.next",
				createDummyProjectId(),
				1_000_000_000,
			),
		);
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: Task の作成を始めると
		const pending = usecase.run({
			projectId: createDummyProjectId(),
			title: "ダミーのタイトル",
			priority: "medium",
			labels: createDummyLabels(),
			creatorId: createDummyUserId(),
		});

		// Then: TaskNumberUnavailableError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(TaskNumberUnavailableError);
		expect(mockTaskPut).not.toHaveBeenCalled();
	});

	test("異常系: タスク番号が上限に達していれば、TaskNumberUnavailableError の cause に TaskNumberExhaustedError が入る", async () => {
		// Given: TaskNumberExhaustedError を投げる TaskNumberIssuer で
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(createDummyProject());
		const mockTaskPut = vi.fn();
		const exhausted = new TaskNumberExhaustedError(
			"TaskNumberIssuer.next",
			createDummyProjectId(),
			1_000_000_000,
		);
		const mockNext = vi.fn();
		mockNext.mockRejectedValueOnce(exhausted);
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: Task の作成を始めると
		const pending = usecase.run({
			projectId: createDummyProjectId(),
			title: "ダミーのタイトル",
			priority: "medium",
			labels: createDummyLabels(),
			creatorId: createDummyUserId(),
		});

		// Then: cause に、TaskNumberIssuer が投げた TaskNumberExhaustedError そのものが入っている
		await expect(pending).rejects.toSatisfy(
			(error) =>
				error instanceof TaskNumberUnavailableError &&
				error.cause === exhausted,
		);
	});

	test("異常系: タイトルが空なら InvalidInputError が発生し、保存しない", async () => {
		// Given: アーカイブされていない Project と、PROJ-7 を返す TaskNumberIssuer で
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(createDummyProject());
		const mockTaskPut = vi.fn();
		const mockNext = vi.fn();
		mockNext.mockResolvedValueOnce(createDummyTaskId("PROJ-7"));
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 空のタイトルで Task の作成を始めると
		const pending = usecase.run({
			projectId: createDummyProjectId(),
			title: "",
			priority: "medium",
			labels: createDummyLabels(),
			creatorId: createDummyUserId(),
		});

		// Then: InvalidInputError が発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(InvalidInputError);
		expect(mockTaskPut).not.toHaveBeenCalled();
	});

	test("異常系: タイトルが空なら、InvalidInputError の cause に InvalidCreationParamError が入る", async () => {
		// Given: アーカイブされていない Project と、PROJ-7 を返す TaskNumberIssuer で
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(createDummyProject());
		const mockTaskPut = vi.fn();
		const mockNext = vi.fn();
		mockNext.mockResolvedValueOnce(createDummyTaskId("PROJ-7"));
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: 空のタイトルで Task の作成を始めると
		const pending = usecase.run({
			projectId: createDummyProjectId(),
			title: "",
			priority: "medium",
			labels: createDummyLabels(),
			creatorId: createDummyUserId(),
		});

		// Then: cause に、Task.create が投げた InvalidCreationParamError が入っている
		await expect(pending).rejects.toMatchObject({
			cause: expect.any(InvalidCreationParamError),
		});
		await expect(pending).rejects.toMatchObject({
			cause: { operation: "Task.create" },
		});
	});

	test("異常系: TaskNumberIssuer が想定外の Error を投げたら、その Error がそのまま発生し、保存しない", async () => {
		// Given: 保存先に接続できないエラーを投げる TaskNumberIssuer で
		const unavailable = new Error("保存先に接続できません");
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(createDummyProject());
		const mockTaskPut = vi.fn();
		const mockNext = vi.fn();
		mockNext.mockRejectedValueOnce(unavailable);
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: Task の作成を始めると
		const pending = usecase.run({
			projectId: createDummyProjectId(),
			title: "ダミーのタイトル",
			priority: "medium",
			labels: createDummyLabels(),
			creatorId: createDummyUserId(),
		});

		// Then: TaskNumberIssuer が投げたエラーが詰め替えられずに発生し、保存は呼ばれない
		await expect(pending).rejects.toBe(unavailable);
		expect(mockTaskPut).not.toHaveBeenCalled();
	});

	test("異常系: TaskNumberIssuer が別のプロジェクトの ID を返したら TaskIdProjectMismatchError がそのまま発生し、保存しない", async () => {
		// Given: 別の Project の ID を返す TaskNumberIssuer で
		const mockProjectGet = vi.fn();
		mockProjectGet.mockResolvedValueOnce(createDummyProject());
		const mockTaskPut = vi.fn();
		const mockNext = vi.fn();
		mockNext.mockResolvedValueOnce(createDummyTaskId("OPS-7"));
		const usecase = createCreateTaskUseCase({
			projectRepository: { get: mockProjectGet },
			taskRepository: {
				get: vi.fn(),
				listByProject: vi.fn(),
				put: mockTaskPut,
			},
			taskNumberIssuer: { next: mockNext },
			clock: { now: () => createDummyTimestamp(5_000) },
		});

		// When: Task の作成を始めると
		const pending = usecase.run({
			projectId: createDummyProjectId(),
			title: "ダミーのタイトル",
			priority: "medium",
			labels: createDummyLabels(),
			creatorId: createDummyUserId(),
		});

		// Then: TaskIdProjectMismatchError が詰め替えられずに発生し、保存は呼ばれない
		await expect(pending).rejects.toThrow(TaskIdProjectMismatchError);
		expect(mockTaskPut).not.toHaveBeenCalled();
	});
});

describe("ProjectNotFoundError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と ProjectId でエラーを作ると
		const error = new ProjectNotFoundError(
			"CreateTaskUseCase.run",
			createDummyProjectId("PROJ"),
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と ProjectId が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と ProjectId でエラーを作ると
		const error = new ProjectNotFoundError(
			"CreateTaskUseCase.run",
			createDummyProjectId("PROJ"),
		);

		// Then: 操作名と ProjectId が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "CreateTaskUseCase.run",
			projectId: "PROJ",
		});
	});

	test("正常系: name が ProjectNotFoundError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と ProjectId でエラーを作ると
		const error = new ProjectNotFoundError(
			"CreateTaskUseCase.run",
			createDummyProjectId("PROJ"),
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("ProjectNotFoundError");
	});
});

describe("TaskNumberUnavailableError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: タスク番号の上限を表すドメインのエラーがあるとき
		const cause = new TaskNumberExhaustedError(
			"TaskNumberIssuer.next",
			createDummyProjectId("OPS"),
			1_000_000_000,
		);

		// When: 操作名と ProjectId と cause でエラーを作ると
		const error = new TaskNumberUnavailableError(
			"CreateTaskUseCase.run",
			createDummyProjectId("OPS"),
			{ cause },
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と ProjectId と cause が渡した値のまま残る", () => {
		// Given: タスク番号の上限を表すドメインのエラーがあるとき
		const cause = new TaskNumberExhaustedError(
			"TaskNumberIssuer.next",
			createDummyProjectId("OPS"),
			1_000_000_000,
		);

		// When: 操作名と ProjectId と cause でエラーを作ると
		const error = new TaskNumberUnavailableError(
			"CreateTaskUseCase.run",
			createDummyProjectId("OPS"),
			{ cause },
		);

		// Then: 操作名と ProjectId が渡した値のまま残り、cause は渡したエラーそのものになる
		expect(error).toMatchObject({
			operation: "CreateTaskUseCase.run",
			projectId: "OPS",
		});
		expect(error.cause).toBe(cause);
	});

	test("正常系: name が TaskNumberUnavailableError になる", () => {
		// Given: タスク番号の上限を表すドメインのエラーがあるとき
		const cause = new TaskNumberExhaustedError(
			"TaskNumberIssuer.next",
			createDummyProjectId("OPS"),
			1_000_000_000,
		);

		// When: 操作名と ProjectId と cause でエラーを作ると
		const error = new TaskNumberUnavailableError(
			"CreateTaskUseCase.run",
			createDummyProjectId("OPS"),
			{ cause },
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("TaskNumberUnavailableError");
	});
});

describe("ProjectArchivedError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: アーカイブ済みを表すドメインのエラーがあるとき
		const cause = new TaskCreationOnArchivedProjectError(
			"Project.createTask",
			createDummyProjectId("OPS"),
		);

		// When: 操作名と ProjectId と cause でエラーを作ると
		const error = new ProjectArchivedError(
			"CreateTaskUseCase.run",
			createDummyProjectId("OPS"),
			{ cause },
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と ProjectId と cause が渡した値のまま残る", () => {
		// Given: アーカイブ済みを表すドメインのエラーがあるとき
		const cause = new TaskCreationOnArchivedProjectError(
			"Project.createTask",
			createDummyProjectId("OPS"),
		);

		// When: 操作名と ProjectId と cause でエラーを作ると
		const error = new ProjectArchivedError(
			"CreateTaskUseCase.run",
			createDummyProjectId("OPS"),
			{ cause },
		);

		// Then: 操作名と ProjectId が渡した値のまま残り、cause は渡したエラーそのものになる
		expect(error).toMatchObject({
			operation: "CreateTaskUseCase.run",
			projectId: "OPS",
		});
		expect(error.cause).toBe(cause);
	});

	test("正常系: name が ProjectArchivedError になる", () => {
		// Given: アーカイブ済みを表すドメインのエラーがあるとき
		const cause = new TaskCreationOnArchivedProjectError(
			"Project.createTask",
			createDummyProjectId("OPS"),
		);

		// When: 操作名と ProjectId と cause でエラーを作ると
		const error = new ProjectArchivedError(
			"CreateTaskUseCase.run",
			createDummyProjectId("OPS"),
			{ cause },
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("ProjectArchivedError");
	});
});
