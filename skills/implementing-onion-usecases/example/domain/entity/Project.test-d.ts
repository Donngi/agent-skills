import { describe, test } from "vitest";
import { createDummyCommentId } from "../value-object/CommentId.helper.test";
import { createDummyTaskId } from "../value-object/TaskId.helper.test";
import { createDummyProjectId } from "../value-object/ProjectId.helper.test";
import {
	Project,
	ProjectAlreadyArchivedError,
	TaskCreationOnArchivedProjectError,
	TaskIdProjectMismatchError,
} from "./Project";
import {
	createDummyCreateProjectProps,
	createDummyProject,
	createDummyProjectDeps,
} from "./Project.helper.test";
import {
	createDummyCreateTaskProps,
	createDummyTaskDeps,
} from "./Task.helper.test";

describe("Project.create の型", () => {
	test("型: id に生の文字列を渡せない", () => {
		// Given: 制約を満たす入力と、ブランドの無い識別子の文字列と、依存があるとき
		const base = createDummyCreateProjectProps();
		const raw = "PROJ";
		const deps = createDummyProjectDeps();

		// When: id にその生の文字列を入れて Project.create を呼ぶと
		// Then: 型検査で拒否される
		Project.create(
			{
				...base,
				// @ts-expect-error 生の文字列は ProjectId に代入できない
				id: raw,
			},
			deps,
		);
	});

	test("型: id に TaskId を渡せない", () => {
		// Given: 制約を満たす入力と、別種である TaskId と、依存があるとき
		const base = createDummyCreateProjectProps();
		const taskId = createDummyTaskId();
		const deps = createDummyProjectDeps();

		// When: id にその TaskId を入れて Project.create を呼ぶと
		// Then: 型検査で拒否される
		Project.create(
			{
				...base,
				// @ts-expect-error TaskId は ProjectId に代入できない
				id: taskId,
			},
			deps,
		);
	});

	test("型: leadId に生の文字列を渡せない", () => {
		// Given: 制約を満たす入力と、ブランドの無い UserId の文字列と、依存があるとき
		const base = createDummyCreateProjectProps();
		const raw = "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e";
		const deps = createDummyProjectDeps();

		// When: leadId にその生の文字列を入れて Project.create を呼ぶと
		// Then: 型検査で拒否される
		Project.create(
			{
				...base,
				// @ts-expect-error 生の文字列は UserId に代入できない
				leadId: raw,
			},
			deps,
		);
	});

	test("型: leadId に CommentId を渡せない", () => {
		// Given: 制約を満たす入力と、UserId と同じ UUID 形式の CommentId と、依存があるとき
		const base = createDummyCreateProjectProps();
		const commentId = createDummyCommentId();
		const deps = createDummyProjectDeps();

		// When: leadId にその CommentId を入れて Project.create を呼ぶと
		// Then: 型検査で拒否される
		Project.create(
			{
				...base,
				// @ts-expect-error CommentId は UserId に代入できない
				leadId: commentId,
			},
			deps,
		);
	});
});

describe("ProjectAlreadyArchivedError の型", () => {
	test("型: projectId に TaskId を渡せない", () => {
		// Given: 別種である TaskId があるとき
		const taskId = createDummyTaskId();

		// When: projectId にその TaskId を渡すと
		// Then: 型検査で拒否される
		void new ProjectAlreadyArchivedError(
			"Project.archive",
			// @ts-expect-error TaskId は ProjectId に代入できない
			taskId,
		);
	});
	test("型: projectId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列があるとき
		const raw = "PROJ";

		// When: projectId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new ProjectAlreadyArchivedError(
			"Project.archive",
			// @ts-expect-error 生の文字列は ProjectId に代入できない
			raw,
		);
	});
});

describe("Project.createTask の型", () => {
	test("型: id に生の文字列を渡せない", () => {
		// Given: Project と、制約を満たす Task の入力と、生の文字列で表した TaskId と、クロックがあるとき
		const project = createDummyProject();
		const base = createDummyCreateTaskProps();
		const raw = "PROJ-1";
		const deps = createDummyTaskDeps();

		// When: id にその生の文字列を入れて Project.createTask を呼ぶと
		// Then: 型検査で拒否される
		Project.createTask(
			project,
			{
				...base,
				// @ts-expect-error 生の文字列は TaskId に代入できない
				id: raw,
			},
			deps,
		);
	});

	test("型: id に ProjectId を渡せない", () => {
		// Given: Project と、制約を満たす Task の入力と、ProjectId と、クロックがあるとき
		const project = createDummyProject();
		const base = createDummyCreateTaskProps();
		const projectId = createDummyProjectId();
		const deps = createDummyTaskDeps();

		// When: id にその ProjectId を入れて Project.createTask を呼ぶと
		// Then: 型検査で拒否される
		Project.createTask(
			project,
			{
				...base,
				// @ts-expect-error ProjectId は TaskId に代入できない
				id: projectId,
			},
			deps,
		);
	});
});

describe("TaskCreationOnArchivedProjectError の型", () => {
	test("型: projectId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列があるとき
		const raw = "PROJ";

		// When: projectId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new TaskCreationOnArchivedProjectError(
			"Project.createTask",
			// @ts-expect-error 生の文字列は ProjectId に代入できない
			raw,
		);
	});
});

describe("TaskIdProjectMismatchError の型", () => {
	test("型: taskId に生の文字列を渡せない", () => {
		// Given: ProjectId と、ブランドの無い TaskId の文字列があるとき
		const projectId = createDummyProjectId();
		const raw = "OTHER-1";

		// When: taskId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new TaskIdProjectMismatchError(
			"Project.createTask",
			projectId,
			// @ts-expect-error 生の文字列は TaskId に代入できない
			raw,
		);
	});

	test("型: taskId に ProjectId を渡せない", () => {
		// Given: ProjectId が2つあるとき
		const projectId = createDummyProjectId();
		const other = createDummyProjectId();

		// When: taskId に ProjectId を渡すと
		// Then: 型検査で拒否される
		void new TaskIdProjectMismatchError(
			"Project.createTask",
			projectId,
			// @ts-expect-error ProjectId は TaskId に代入できない
			other,
		);
	});
});
