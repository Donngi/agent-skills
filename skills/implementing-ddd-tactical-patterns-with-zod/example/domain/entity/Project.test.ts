import { describe, expect, test, vi } from "vitest";
import {
	DomainError,
	InvalidClockValueError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { createDummyProjectId } from "../value-object/ProjectId.helper.test";
import { createDummyTaskId } from "../value-object/TaskId.helper.test";
import {
	Project,
	ProjectAlreadyArchivedError,
	ProjectSchema,
	type ProjectSchemaInput,
	TaskCreationOnArchivedProjectError,
	TaskIdProjectMismatchError,
} from "./Project";
import {
	createDummyCreateProjectProps,
	createDummyProject,
	createDummyProjectDeps,
} from "./Project.helper.test";
import {
	createDummyBacklogTask,
	createDummyCreateTaskProps,
	createDummyTaskDeps,
} from "./Task.helper.test";

describe("Project.create", () => {
	test("正常系: 制約を満たす入力ならクロックの時刻を作成時刻にしたアーカイブされていない Project を返す", () => {
		// Given: 制約を満たす入力と、固定の時刻を返すクロックで
		const props = createDummyCreateProjectProps();
		const deps = createDummyProjectDeps({ clock: { now: () => 2_000 } });

		// When: Project を生成すると
		const result = Project.create(props, deps);

		// Then: クロックの時刻を作成時刻に持つ未アーカイブの Project になる
		const expected = createDummyProject({ createdAt: 2_000, archived: false });
		expect(result).toStrictEqual(expected);
	});

	test.for([
		{ name: "1文字", value: "a" },
		{ name: "80文字", value: "a".repeat(80) },
	])("正常系: 名前が $name なら受け入れる", ({ value }) => {
		// Given: 長さが下限か上限に一致する名前の入力で
		const props = createDummyCreateProjectProps({ name: value });
		const deps = createDummyProjectDeps();

		// When: Project を生成すると
		const result = Project.create(props, deps);

		// Then: その入力の名前をそのまま持つ Project になる
		expect(result.name).toBe(value);
	});

	test.for([
		{ name: "空", value: "" },
		{ name: "81文字", value: "a".repeat(81) },
		{ name: "先頭に空白を含む", value: " プロジェクト" },
		{ name: "末尾に空白を含む", value: "プロジェクト " },
	])("異常系: 名前が $name なら InvalidCreationParamError が発生する", ({
		value,
	}) => {
		// Given: 長さか前後の空白の制約に違反する名前の入力で
		const props = createDummyCreateProjectProps({ name: value });
		const deps = createDummyProjectDeps();

		// When: Project の生成を試みると
		// Then: InvalidCreationParamError が発生する
		expect(() => Project.create(props, deps)).toThrow(
			InvalidCreationParamError,
		);
	});

	test("異常系: 余剰キーを持つなら InvalidCreationParamError が発生する", () => {
		// Given: 余剰キーを含む入力で
		const props = { ...createDummyCreateProjectProps(), memo: "x" };
		const deps = createDummyProjectDeps();

		// When: Project の生成を試みると
		// Then: InvalidCreationParamError が発生する
		expect(() => Project.create(props, deps)).toThrow(
			InvalidCreationParamError,
		);
	});

	test("異常系: クロックが範囲外の時刻を返すなら operation が Project.create の InvalidClockValueError が発生する", () => {
		// Given: 制約を満たす入力と、負の時刻を返すクロックで
		const props = createDummyCreateProjectProps();
		const deps = createDummyProjectDeps({ clock: { now: () => -1 } });

		// When: Project の生成を試みると
		let caught: unknown;
		try {
			Project.create(props, deps);
		} catch (error) {
			caught = error;
		}

		// Then: operation が Project.create の InvalidClockValueError が発生する
		expect(caught).toBeInstanceOf(InvalidClockValueError);
		expect(caught).toMatchObject({ operation: "Project.create" });
	});

	test("異常系: クロックが例外を投げるならその例外を包まずに発生させる", () => {
		// Given: 制約を満たす入力と、例外を投げるクロックで
		const props = createDummyCreateProjectProps();
		const failure = new Error("時刻の取得に失敗した");
		const deps = createDummyProjectDeps({
			clock: {
				now: () => {
					throw failure;
				},
			},
		});

		// When: Project の生成を試みると
		let caught: unknown;
		try {
			Project.create(props, deps);
		} catch (error) {
			caught = error;
		}

		// Then: そのクロックが投げた例外がそのまま発生する
		expect(caught).toBe(failure);
	});

	test("異常系: create に失敗したら operation が Project.create の InvalidCreationParamError が発生する", () => {
		// Given: 名前が空の入力とクロックで
		const props = createDummyCreateProjectProps({ name: "" });
		const deps = createDummyProjectDeps();

		// When: Project の生成を試みると
		let caught: unknown;
		try {
			Project.create(props, deps);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Project.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "Project.create" });
	});

	test("異常系: 名前が空ならクロックを呼ばない", () => {
		// Given: 名前が空の入力と、呼び出しを記録するクロックで
		const props = createDummyCreateProjectProps({ name: "" });
		const mockNow = vi.fn(() => 1_000);
		const deps = createDummyProjectDeps({ clock: { now: mockNow } });

		// When: Project の生成を試みると
		try {
			Project.create(props, deps);
		} catch {
			// 失敗の種別は「名前が '空' なら InvalidCreationParamError」のテストで確かめる
		}

		// Then: そのクロックは呼ばれていない
		expect(mockNow).not.toHaveBeenCalled();
	});

	test("不変性: 凍結された Project を返す", () => {
		// Given: 制約を満たす入力と、制約を満たす時刻を返すクロックで
		const props = createDummyCreateProjectProps();
		const deps = createDummyProjectDeps();

		// When: Project を生成すると
		const result = Project.create(props, deps);

		// Then: 凍結された Project になる
		expect(Object.isFrozen(result)).toBe(true);
	});
});

describe("Project.reconstruct", () => {
	test("正常系: 制約を満たす保存値ならその値の Project を返す", () => {
		// Given: アーカイブ済みの制約を満たす Project の保存値で
		const props: ProjectSchemaInput = {
			id: "PROJ",
			name: "ダミーのプロジェクト",
			leadId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			archived: true,
		};

		// When: Project を復元すると
		const result = Project.reconstruct(props);

		// Then: その保存値と各項目の値が一致する Project になる
		expect(result).toStrictEqual({
			id: "PROJ",
			name: "ダミーのプロジェクト",
			leadId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			archived: true,
		});
	});

	test.for([
		{ name: "識別子が小文字", override: { id: "proj" } },
		{ name: "責任者の識別子が UUID でない", override: { leadId: "lead" } },
		{ name: "作成時刻が負", override: { createdAt: -1 } },
	])("異常系: $name なら InvalidReconstructParamError が発生する", ({
		override,
	}) => {
		// Given: 1項目だけ制約に違反する Project の保存値で
		const props: ProjectSchemaInput = {
			id: "PROJ",
			name: "ダミーのプロジェクト",
			leadId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			archived: false,
			...override,
		};

		// When: Project の復元を試みると
		// Then: InvalidReconstructParamError が発生する
		expect(() => Project.reconstruct(props)).toThrow(
			InvalidReconstructParamError,
		);
	});

	test("異常系: 余剰キーを持つなら operation が Project.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 余剰キーを含む Project の保存値で
		const props = {
			id: "PROJ",
			name: "ダミーのプロジェクト",
			leadId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			archived: false,
			memo: "x",
		};

		// When: Project の復元を試みると
		let caught: unknown;
		try {
			Project.reconstruct(props);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Project.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "Project.reconstruct" });
	});
});

describe("ProjectSchema", () => {
	test("正常系: 制約を満たす Project なら検証を通る", () => {
		// Given: 制約を満たす Project があるとき
		const value = createDummyProject();

		// When: その値を ProjectSchema で検証すると
		const result = ProjectSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "null", value: null },
		{ name: "文字列", value: "PROJ" },
		{
			name: "名前が空",
			value: {
				id: "PROJ",
				name: "",
				leadId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				archived: false,
			},
		},
		{
			name: "archived が真偽値でない",
			value: {
				id: "PROJ",
				name: "ダミーのプロジェクト",
				leadId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				archived: "false",
			},
		},
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: 制約に違反する Project の値があるとき

		// When: その値を ProjectSchema で検証すると
		const result = ProjectSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: 余剰キーを持つなら検証を通らない", () => {
		// Given: 余剰キーを含む Project の値があるとき
		const value = { ...createDummyProject(), memo: "x" };

		// When: その値を ProjectSchema で検証すると
		const result = ProjectSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});

describe("Project.equalsById", () => {
	test("正常系: 識別子が同じならほかの項目が異なっても等しいと判定される", () => {
		// Given: 識別子だけが同じで、ほかの項目が異なる2つの Project があるとき
		const a = createDummyProject({ id: "PROJ", name: "A", archived: false });
		const b = createDummyProject({ id: "PROJ", name: "B", archived: true });

		// When: その2つの識別子で等価性を判定すると
		const result = Project.equalsById(a, b);

		// Then: 等しいと判定される
		expect(result).toBe(true);
	});

	test("正常系: 識別子が異なればほかの項目が同じでも等しくないと判定される", () => {
		// Given: 識別子だけが異なる2つの Project があるとき
		const a = createDummyProject({ id: "PROJ" });
		const b = createDummyProject({ id: "TEAM" });

		// When: その2つの識別子で等価性を判定すると
		const result = Project.equalsById(a, b);

		// Then: 等しくないと判定される
		expect(result).toBe(false);
	});
});

describe("Project.archive", () => {
	test("正常系: アーカイブされていなければアーカイブ済みの Project を返す", () => {
		// Given: 未アーカイブの Project があるとき
		const project = createDummyProject({ archived: false });

		// When: その Project をアーカイブすると
		const result = Project.archive(project);

		// Then: アーカイブ済みの Project になる
		const expected = createDummyProject({ archived: true });
		expect(result).toStrictEqual(expected);
	});

	test("異常系: アーカイブ済みなら operation が Project.archive の ProjectAlreadyArchivedError が発生する", () => {
		// Given: アーカイブ済みの Project があるとき
		const project = createDummyProject({ archived: true });

		// When: そのアーカイブを試みると
		let caught: unknown;
		try {
			Project.archive(project);
		} catch (error) {
			caught = error;
		}

		// Then: ProjectAlreadyArchivedError が発生し
		expect(caught).toBeInstanceOf(ProjectAlreadyArchivedError);
		// And: その例外は操作名 Project.archive と、その Project の識別子を持つ
		expect(caught).toMatchObject({
			operation: "Project.archive",
			projectId: "PROJ",
		});
	});

	test("不変性: 引数で受け取った Project を変えない", () => {
		// Given: 未アーカイブの Project があるとき
		const project = createDummyProject({ archived: false });

		// When: その Project をアーカイブすると
		Project.archive(project);

		// Then: その Project は未アーカイブのままである
		const expected = createDummyProject({ archived: false });
		expect(project).toStrictEqual(expected);
	});

	test("不変性: 凍結された Project を返す", () => {
		// Given: 未アーカイブの Project があるとき
		const project = createDummyProject({ archived: false });

		// When: その Project をアーカイブすると
		const result = Project.archive(project);

		// Then: 凍結された Project になる
		expect(Object.isFrozen(result)).toBe(true);
	});
});

describe("Project.createTask", () => {
	test("正常系: アーカイブされていなければ、クロックの時刻を作成時刻にしたバックログの Task を返す", () => {
		// Given: 未アーカイブの Project と、その Project の識別子で始まる Task の入力と、固定の時刻を返すクロックがあるとき
		const project = createDummyProject({ archived: false });
		const params = createDummyCreateTaskProps();
		const deps = createDummyTaskDeps({ clock: { now: () => 5_000 } });

		// When: その Project に Task を作ると
		const result = Project.createTask(project, params, deps);

		// Then: その時刻に作成された、Comment の無いバックログの Task と一致する
		const expected = createDummyBacklogTask({ createdAt: 5_000 });
		expect(result).toStrictEqual(expected);
	});

	test("異常系: アーカイブ済みなら operation が Project.createTask の TaskCreationOnArchivedProjectError が発生する", () => {
		// Given: アーカイブ済みの Project と、制約を満たす Task の入力があるとき
		const project = createDummyProject({ archived: true });
		const params = createDummyCreateTaskProps();
		const deps = createDummyTaskDeps();

		// When: その Project に Task を作ると
		let caught: unknown;
		try {
			Project.createTask(project, params, deps);
		} catch (error) {
			caught = error;
		}

		// Then: TaskCreationOnArchivedProjectError が発生し
		expect(caught).toBeInstanceOf(TaskCreationOnArchivedProjectError);
		// And: その例外は操作名 Project.createTask と、その Project の識別子を持つ
		expect(caught).toMatchObject({
			operation: "Project.createTask",
			projectId: "PROJ",
		});
	});

	test("異常系: アーカイブ済みならクロックを呼ばない", () => {
		// Given: アーカイブ済みの Project と、呼び出しを記録するクロックで
		const project = createDummyProject({ archived: true });
		const params = createDummyCreateTaskProps();
		const mockNow = vi.fn(() => 5_000);
		const deps = createDummyTaskDeps({ clock: { now: mockNow } });

		// When: その Project に Task を作ることを試みると
		try {
			Project.createTask(project, params, deps);
		} catch {
			// 失敗の種別は「アーカイブ済みなら TaskCreationOnArchivedProjectError」のテストで確かめる
		}

		// Then: そのクロックは呼ばれていない
		expect(mockNow).not.toHaveBeenCalled();
	});

	test("異常系: Task の識別子が別の Project のものなら operation が Project.createTask の TaskIdProjectMismatchError が発生する", () => {
		// Given: 未アーカイブの Project と、別の Project の識別子で始まる Task の入力があるとき
		const project = createDummyProject({ archived: false });
		const params = createDummyCreateTaskProps({
			id: createDummyTaskId("OTHER-1"),
		});
		const deps = createDummyTaskDeps();

		// When: その Project に Task を作ると
		let caught: unknown;
		try {
			Project.createTask(project, params, deps);
		} catch (error) {
			caught = error;
		}

		// Then: TaskIdProjectMismatchError が発生し
		expect(caught).toBeInstanceOf(TaskIdProjectMismatchError);
		// And: その例外は操作名 Project.createTask と、その Project の識別子と、渡された Task の識別子を持つ
		expect(caught).toMatchObject({
			operation: "Project.createTask",
			projectId: "PROJ",
			taskId: "OTHER-1",
		});
	});

	test("異常系: Task の入力が不正なら operation が Task.create の InvalidCreationParamError が発生する", () => {
		// Given: 未アーカイブの Project と、表題が空の Task の入力があるとき
		const project = createDummyProject({ archived: false });
		const params = createDummyCreateTaskProps({ title: "" });
		const deps = createDummyTaskDeps();

		// When: その Project に Task を作ると
		let caught: unknown;
		try {
			Project.createTask(project, params, deps);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Task.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "Task.create" });
	});

	test("不変性: 引数で受け取った Project を変えない", () => {
		// Given: 未アーカイブの Project と、制約を満たす Task の入力があるとき
		const project = createDummyProject({ archived: false });
		const params = createDummyCreateTaskProps();
		const deps = createDummyTaskDeps();

		// When: その Project に Task を作ると
		Project.createTask(project, params, deps);

		// Then: その Project は元の値のままである
		const expected = createDummyProject({ archived: false });
		expect(project).toStrictEqual(expected);
	});
});

describe("ProjectAlreadyArchivedError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: アーカイブの操作名でエラーを作ると
		const error = new ProjectAlreadyArchivedError(
			"Project.archive",
			createDummyProjectId(),
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と ProjectId が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: アーカイブの操作名と ProjectId でエラーを作ると
		const error = new ProjectAlreadyArchivedError(
			"Project.archive",
			createDummyProjectId(),
		);

		// Then: 操作名と ProjectId が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "Project.archive",
			projectId: "PROJ",
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: ProjectAlreadyArchivedError の親の class を調べると
		const parent = Object.getPrototypeOf(ProjectAlreadyArchivedError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が ProjectAlreadyArchivedError になる", () => {
		// Given: 特別な前提が無いとき

		// When: アーカイブの操作名でエラーを作ると
		const error = new ProjectAlreadyArchivedError(
			"Project.archive",
			createDummyProjectId(),
		);

		// Then: name が class 名になる
		expect(error.name).toBe("ProjectAlreadyArchivedError");
	});
});

describe("TaskCreationOnArchivedProjectError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: Task を作る操作名でエラーを作ると
		const error = new TaskCreationOnArchivedProjectError(
			"Project.createTask",
			createDummyProjectId(),
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と ProjectId が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: Task を作る操作名と ProjectId でエラーを作ると
		const error = new TaskCreationOnArchivedProjectError(
			"Project.createTask",
			createDummyProjectId(),
		);

		// Then: 操作名と ProjectId が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "Project.createTask",
			projectId: "PROJ",
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: TaskCreationOnArchivedProjectError の親の class を調べると
		const parent = Object.getPrototypeOf(TaskCreationOnArchivedProjectError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が TaskCreationOnArchivedProjectError になる", () => {
		// Given: 特別な前提が無いとき

		// When: Task を作る操作名でエラーを作ると
		const error = new TaskCreationOnArchivedProjectError(
			"Project.createTask",
			createDummyProjectId(),
		);

		// Then: name が class 名になる
		expect(error.name).toBe("TaskCreationOnArchivedProjectError");
	});
});

describe("TaskIdProjectMismatchError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: Task を作る操作名でエラーを作ると
		const error = new TaskIdProjectMismatchError(
			"Project.createTask",
			createDummyProjectId(),
			createDummyTaskId("OTHER-1"),
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と ProjectId と TaskId が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: Task を作る操作名と ProjectId と TaskId でエラーを作ると
		const error = new TaskIdProjectMismatchError(
			"Project.createTask",
			createDummyProjectId(),
			createDummyTaskId("OTHER-1"),
		);

		// Then: 操作名と ProjectId と TaskId が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "Project.createTask",
			projectId: "PROJ",
			taskId: "OTHER-1",
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: TaskIdProjectMismatchError の親の class を調べると
		const parent = Object.getPrototypeOf(TaskIdProjectMismatchError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が TaskIdProjectMismatchError になる", () => {
		// Given: 特別な前提が無いとき

		// When: Task を作る操作名でエラーを作ると
		const error = new TaskIdProjectMismatchError(
			"Project.createTask",
			createDummyProjectId(),
			createDummyTaskId("OTHER-1"),
		);

		// Then: name が class 名になる
		expect(error.name).toBe("TaskIdProjectMismatchError");
	});
});
