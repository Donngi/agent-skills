import { describe, test } from "vitest";
import { z } from "zod";
import { createDummyCommentId } from "../value-object/CommentId.helper.test";
import { createDummyProjectId } from "../value-object/ProjectId.helper.test";
import { createDummyTaskId } from "../value-object/TaskId.helper.test";
import { createDummyTimestamp } from "../value-object/Timestamp.helper.test";
import { createDummyUserId } from "../value-object/UserId.helper.test";
import { createDummyCommentDeps } from "./Comment.helper.test";
import {
	CommentLimitExceededError,
	CommentPostedBeforePreviousCommentError,
	CommentPostedBeforeTaskCreationError,
	DuplicateCommentError,
	InvalidTaskTitleError,
	Task,
	TaskCompletedBeforeStartError,
	TaskStartedBeforeCreationError,
	TaskStatusMismatchError,
} from "./Task";
import {
	createDummyBacklogTask,
	createDummyCreateTaskProps,
	createDummyInProgressTask,
	createDummyTaskDeps,
} from "./Task.helper.test";

describe("Task.create の型", () => {
	test("型: id に生の文字列を渡せない", () => {
		// Given: 制約を満たす入力と、生の文字列で表した TaskId と、クロックがあるとき
		const base = createDummyCreateTaskProps();
		const raw = "PROJ-1";
		const deps = createDummyTaskDeps();

		// When: id にその生の文字列を入れて Task.create を呼ぶと
		// Then: 型検査で拒否される
		Task.create(
			{
				...base,
				// @ts-expect-error 生の文字列は TaskId に代入できない
				id: raw,
			},
			deps,
		);
	});

	test("型: id に ProjectId を渡せない", () => {
		// Given: 制約を満たす入力と、ProjectId と、クロックがあるとき
		const base = createDummyCreateTaskProps();
		const projectId = createDummyProjectId();
		const deps = createDummyTaskDeps();

		// When: id にその ProjectId を入れて Task.create を呼ぶと
		// Then: 型検査で拒否される
		Task.create(
			{
				...base,
				// @ts-expect-error ProjectId は TaskId に代入できない
				id: projectId,
			},
			deps,
		);
	});

	test("型: labels に生の配列を渡せない", () => {
		// Given: 制約を満たす入力と、生の文字列の配列と、クロックがあるとき
		const base = createDummyCreateTaskProps();
		const raw = ["bug"];
		const deps = createDummyTaskDeps();

		// When: labels にその生の配列を入れて Task.create を呼ぶと
		// Then: 型検査で拒否される
		Task.create(
			{
				...base,
				// @ts-expect-error 生の配列は Labels に代入できない
				labels: raw,
			},
			deps,
		);
	});

	test("型: creatorId に生の文字列を渡せない", () => {
		// Given: 制約を満たす入力と、生の文字列で表した UserId と、クロックがあるとき
		const base = createDummyCreateTaskProps();
		const raw = "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e";
		const deps = createDummyTaskDeps();

		// When: creatorId にその生の文字列を入れて Task.create を呼ぶと
		// Then: 型検査で拒否される
		Task.create(
			{
				...base,
				// @ts-expect-error 生の文字列は UserId に代入できない
				creatorId: raw,
			},
			deps,
		);
	});

	test("型: creatorId に CommentId を渡せない", () => {
		// Given: 制約を満たす入力と、CommentId と、クロックがあるとき
		const base = createDummyCreateTaskProps();
		const commentId = createDummyCommentId();
		const deps = createDummyTaskDeps();

		// When: creatorId にその CommentId を入れて Task.create を呼ぶと
		// Then: 型検査で拒否される
		Task.create(
			{
				...base,
				// @ts-expect-error CommentId は UserId に代入できない
				creatorId: commentId,
			},
			deps,
		);
	});

	test("型: priority に定義に無い値を渡せない", () => {
		// Given: 制約を満たす入力と、クロックがあるとき
		const base = createDummyCreateTaskProps();
		const deps = createDummyTaskDeps();

		// When: priority に優先度の定義に無い値を入れて Task.create を呼ぶと
		// Then: 型検査で拒否される
		Task.create(
			{
				...base,
				// @ts-expect-error urgent は優先度に含まれない
				priority: "urgent",
			},
			deps,
		);
	});
});

describe("Task.start の型", () => {
	test("型: assigneeId に生の文字列を渡せない", () => {
		// Given: バックログの Task と、生の文字列で表した担当者の識別子と、着手時刻があるとき
		const task = createDummyBacklogTask();
		const raw = "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
		const at = createDummyTimestamp(2_000);

		// When: assigneeId にその生の文字列を入れて Task.start を呼ぶと
		// Then: 型検査で拒否される
		Task.start(task, {
			at,
			// @ts-expect-error 生の文字列は UserId に代入できない
			assigneeId: raw,
		});
	});

	test("型: assigneeId に CommentId を渡せない", () => {
		// Given: バックログの Task と、CommentId と、着手時刻があるとき
		const task = createDummyBacklogTask();
		const commentId = createDummyCommentId();
		const at = createDummyTimestamp(2_000);

		// When: assigneeId にその CommentId を入れて Task.start を呼ぶと
		// Then: 型検査で拒否される
		Task.start(task, {
			at,
			// @ts-expect-error CommentId は UserId に代入できない
			assigneeId: commentId,
		});
	});

	test("型: at に生の数値を渡せない", () => {
		// Given: バックログの Task と、担当者と、生の数値で表した Timestamp があるとき
		const task = createDummyBacklogTask();
		const assigneeId = createDummyUserId();
		const raw = 2_000;

		// When: at にその生の数値を入れて Task.start を呼ぶと
		// Then: 型検査で拒否される
		Task.start(task, {
			assigneeId,
			// @ts-expect-error 生の数値は Timestamp に代入できない
			at: raw,
		});
	});
});

describe("Task.complete の型", () => {
	test("型: at に生の数値を渡せない", () => {
		// Given: 着手中の Task と、生の数値で表した Timestamp があるとき
		const task = createDummyInProgressTask();
		const raw = 3_000;

		// When: at にその生の数値を入れて Task.complete を呼ぶと
		// Then: 型検査で拒否される
		Task.complete(task, {
			// @ts-expect-error 生の数値は Timestamp に代入できない
			at: raw,
		});
	});
});

describe("Task.addComment の型", () => {
	test("型: authorId に生の文字列を渡せない", () => {
		// Given: Task と、生の文字列で表した著者の識別子と、採番とクロックがあるとき
		const task = createDummyBacklogTask();
		const raw = "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e";
		const deps = createDummyCommentDeps();

		// When: authorId にその生の文字列を入れて Task.addComment を呼ぶと
		// Then: 型検査で拒否される
		Task.addComment(
			task,
			{
				body: "ダミーのコメント",
				// @ts-expect-error 生の文字列は UserId に代入できない
				authorId: raw,
			},
			deps,
		);
	});

	test("型: authorId に CommentId を渡せない", () => {
		// Given: Task と、UserId と同じ UUID 形式の CommentId と、採番とクロックがあるとき
		const task = createDummyBacklogTask();
		const commentId = createDummyCommentId();
		const deps = createDummyCommentDeps();

		// When: authorId にその CommentId を入れて Task.addComment を呼ぶと
		// Then: 型検査で拒否される
		Task.addComment(
			task,
			{
				body: "ダミーのコメント",
				// @ts-expect-error CommentId は UserId に代入できない
				authorId: commentId,
			},
			deps,
		);
	});
});

describe("Task.changePriority の型", () => {
	test("型: priority に定義に無い値を渡せない", () => {
		// Given: Task があるとき
		const task = createDummyBacklogTask();

		// When: priority に優先度の定義に無い値を入れて Task.changePriority を呼ぶと
		// Then: 型検査で拒否される
		Task.changePriority(task, {
			// @ts-expect-error urgent は優先度に含まれない
			priority: "urgent",
		});
	});
});

describe("Task.addLabel の型", () => {
	test("型: label に生の文字列を渡せない", () => {
		// Given: Task と、ブランドの無い Label の文字列があるとき
		const task = createDummyBacklogTask();
		const raw = "bug";

		// When: label にその生の文字列を入れて Task.addLabel を呼ぶと
		// Then: 型検査で拒否される
		Task.addLabel(task, {
			// @ts-expect-error 生の文字列は Label に代入できない
			label: raw,
		});
	});
});

describe("Task.removeLabel の型", () => {
	test("型: label に生の文字列を渡せない", () => {
		// Given: Task と、ブランドの無い Label の文字列があるとき
		const task = createDummyBacklogTask();
		const raw = "bug";

		// When: label にその生の文字列を入れて Task.removeLabel を呼ぶと
		// Then: 型検査で拒否される
		Task.removeLabel(task, {
			// @ts-expect-error 生の文字列は Label に代入できない
			label: raw,
		});
	});
});

describe("Task.linkPullRequest の型", () => {
	test("型: url に生の文字列を渡せない", () => {
		// Given: Task と、ブランドの無い PullRequestUrl の文字列があるとき
		const task = createDummyBacklogTask();
		const raw = "https://github.com/acme/repo/pull/12";

		// When: url にその生の文字列を入れて Task.linkPullRequest を呼ぶと
		// Then: 型検査で拒否される
		Task.linkPullRequest(task, {
			// @ts-expect-error 生の文字列は PullRequestUrl に代入できない
			url: raw,
		});
	});
});

describe("Task の任意項目の型", () => {
	test("型: 入力の pullRequestUrl に undefined を渡せない", () => {
		// Given: 制約を満たす入力と、クロックがあるとき
		const base = createDummyCreateTaskProps();
		const deps = createDummyTaskDeps();

		// When: pullRequestUrl に undefined を入れて Task.create を呼ぶと
		// Then: 型検査で拒否される
		Task.create(
			// @ts-expect-error exactOptional の項目に undefined は代入できない
			{
				...base,
				pullRequestUrl: undefined,
			},
			deps,
		);
	});

	test("型: 入力の pullRequestUrl に生の文字列を渡せない", () => {
		// Given: 制約を満たす入力と、生の文字列で表した URL と、クロックがあるとき
		const base = createDummyCreateTaskProps();
		const raw = "https://example.com/owner/repo/pull/1";
		const deps = createDummyTaskDeps();

		// When: pullRequestUrl にその生の文字列を入れて Task.create を呼ぶと
		// Then: 型検査で拒否される
		Task.create(
			{
				...base,
				// @ts-expect-error 生の文字列は PullRequestUrl に代入できない
				pullRequestUrl: raw,
			},
			deps,
		);
	});
});

describe("TaskStatusMismatchError の型", () => {
	test("型: taskId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列があるとき
		const raw = "PROJ-1";

		// When: taskId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new TaskStatusMismatchError(
			"Task.start",
			// @ts-expect-error 生の文字列は TaskId に代入できない
			raw,
			"backlog",
			"done",
		);
	});

	test("型: taskId に ProjectId を渡せない", () => {
		// Given: 別種である ProjectId があるとき
		const projectId = createDummyProjectId();

		// When: taskId にその ProjectId を渡すと
		// Then: 型検査で拒否される
		void new TaskStatusMismatchError(
			"Task.start",
			// @ts-expect-error ProjectId は TaskId に代入できない
			projectId,
			"backlog",
			"done",
		);
	});

	test("型: expected に定義に無い状態を渡せない", () => {
		// Given: 制約を満たす識別子があるとき
		const taskId = createDummyTaskId();

		// When: expected に Task の状態に無い値を渡すと
		// Then: 型検査で拒否される
		void new TaskStatusMismatchError(
			"Task.start",
			taskId,
			// @ts-expect-error archived は Task の状態に含まれない
			"archived",
			"done",
		);
	});
	test("型: actual に定義に無い状態を渡せない", () => {
		// Given: 制約を満たす識別子があるとき
		const taskId = createDummyTaskId();

		// When: actual に Task の状態に無い値を渡すと
		// Then: 型検査で拒否される
		void new TaskStatusMismatchError(
			"Task.start",
			taskId,
			"backlog",
			// @ts-expect-error archived は Task の状態に含まれない
			"archived",
		);
	});
});

describe("TaskStartedBeforeCreationError の型", () => {
	test("型: startedAt に生の数値を渡せない", () => {
		// Given: 制約を満たす識別子と、ブランドの無い数値があるとき
		const taskId = createDummyTaskId();
		const raw = 1_000;

		// When: startedAt にその生の数値を渡すと
		// Then: 型検査で拒否される
		void new TaskStartedBeforeCreationError(
			"Task.start",
			taskId,
			// @ts-expect-error 生の数値は Timestamp に代入できない
			raw,
			createDummyTimestamp(2_000),
		);
	});

	test("型: createdAt に生の数値を渡せない", () => {
		// Given: 制約を満たす識別子と、ブランドの無い数値があるとき
		const taskId = createDummyTaskId();
		const raw = 2_000;

		// When: createdAt にその生の数値を渡すと
		// Then: 型検査で拒否される
		void new TaskStartedBeforeCreationError(
			"Task.start",
			taskId,
			createDummyTimestamp(1_000),
			// @ts-expect-error 生の数値は Timestamp に代入できない
			raw,
		);
	});

	test("型: taskId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列があるとき
		const raw = "PROJ-1";

		// When: taskId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new TaskStartedBeforeCreationError(
			"Task.start",
			// @ts-expect-error 生の文字列は TaskId に代入できない
			raw,
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);
	});

	test("型: taskId に ProjectId を渡せない", () => {
		// Given: 別種である ProjectId があるとき
		const projectId = createDummyProjectId();

		// When: taskId にその ProjectId を渡すと
		// Then: 型検査で拒否される
		void new TaskStartedBeforeCreationError(
			"Task.start",
			// @ts-expect-error ProjectId は TaskId に代入できない
			projectId,
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);
	});
});

describe("TaskCompletedBeforeStartError の型", () => {
	test("型: completedAt に生の数値を渡せない", () => {
		// Given: 制約を満たす識別子と、ブランドの無い数値があるとき
		const taskId = createDummyTaskId();
		const raw = 1_000;

		// When: completedAt にその生の数値を渡すと
		// Then: 型検査で拒否される
		void new TaskCompletedBeforeStartError(
			"Task.complete",
			taskId,
			// @ts-expect-error 生の数値は Timestamp に代入できない
			raw,
			createDummyTimestamp(2_000),
		);
	});

	test("型: startedAt に生の数値を渡せない", () => {
		// Given: 制約を満たす識別子と、ブランドの無い数値があるとき
		const taskId = createDummyTaskId();
		const raw = 2_000;

		// When: startedAt にその生の数値を渡すと
		// Then: 型検査で拒否される
		void new TaskCompletedBeforeStartError(
			"Task.complete",
			taskId,
			createDummyTimestamp(1_000),
			// @ts-expect-error 生の数値は Timestamp に代入できない
			raw,
		);
	});

	test("型: taskId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列があるとき
		const raw = "PROJ-1";

		// When: taskId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new TaskCompletedBeforeStartError(
			"Task.complete",
			// @ts-expect-error 生の文字列は TaskId に代入できない
			raw,
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);
	});

	test("型: taskId に ProjectId を渡せない", () => {
		// Given: 別種である ProjectId があるとき
		const projectId = createDummyProjectId();

		// When: taskId にその ProjectId を渡すと
		// Then: 型検査で拒否される
		void new TaskCompletedBeforeStartError(
			"Task.complete",
			// @ts-expect-error ProjectId は TaskId に代入できない
			projectId,
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);
	});
});

describe("CommentPostedBeforePreviousCommentError の型", () => {
	test("型: postedAt に生の数値を渡せない", () => {
		// Given: 制約を満たす識別子と、ブランドの無い数値があるとき
		const taskId = createDummyTaskId();
		const raw = 1_000;

		// When: postedAt にその生の数値を渡すと
		// Then: 型検査で拒否される
		void new CommentPostedBeforePreviousCommentError(
			"Task.addComment",
			taskId,
			// @ts-expect-error 生の数値は Timestamp に代入できない
			raw,
			createDummyTimestamp(2_000),
		);
	});

	test("型: previousPostedAt に生の数値を渡せない", () => {
		// Given: 制約を満たす識別子と、ブランドの無い数値があるとき
		const taskId = createDummyTaskId();
		const raw = 2_000;

		// When: previousPostedAt にその生の数値を渡すと
		// Then: 型検査で拒否される
		void new CommentPostedBeforePreviousCommentError(
			"Task.addComment",
			taskId,
			createDummyTimestamp(1_000),
			// @ts-expect-error 生の数値は Timestamp に代入できない
			raw,
		);
	});

	test("型: taskId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列があるとき
		const raw = "PROJ-1";

		// When: taskId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new CommentPostedBeforePreviousCommentError(
			"Task.addComment",
			// @ts-expect-error 生の文字列は TaskId に代入できない
			raw,
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);
	});

	test("型: taskId に ProjectId を渡せない", () => {
		// Given: 別種である ProjectId があるとき
		const projectId = createDummyProjectId();

		// When: taskId にその ProjectId を渡すと
		// Then: 型検査で拒否される
		void new CommentPostedBeforePreviousCommentError(
			"Task.addComment",
			// @ts-expect-error ProjectId は TaskId に代入できない
			projectId,
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);
	});
});

describe("CommentPostedBeforeTaskCreationError の型", () => {
	test("型: postedAt に生の数値を渡せない", () => {
		// Given: 制約を満たす識別子と、ブランドの無い数値があるとき
		const taskId = createDummyTaskId();
		const raw = 1_000;

		// When: postedAt にその生の数値を渡すと
		// Then: 型検査で拒否される
		void new CommentPostedBeforeTaskCreationError(
			"Task.addComment",
			taskId,
			// @ts-expect-error 生の数値は Timestamp に代入できない
			raw,
			createDummyTimestamp(2_000),
		);
	});

	test("型: taskCreatedAt に生の数値を渡せない", () => {
		// Given: 制約を満たす識別子と、ブランドの無い数値があるとき
		const taskId = createDummyTaskId();
		const raw = 2_000;

		// When: taskCreatedAt にその生の数値を渡すと
		// Then: 型検査で拒否される
		void new CommentPostedBeforeTaskCreationError(
			"Task.addComment",
			taskId,
			createDummyTimestamp(1_000),
			// @ts-expect-error 生の数値は Timestamp に代入できない
			raw,
		);
	});

	test("型: taskId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列があるとき
		const raw = "PROJ-1";

		// When: taskId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new CommentPostedBeforeTaskCreationError(
			"Task.addComment",
			// @ts-expect-error 生の文字列は TaskId に代入できない
			raw,
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);
	});

	test("型: taskId に ProjectId を渡せない", () => {
		// Given: 別種である ProjectId があるとき
		const projectId = createDummyProjectId();

		// When: taskId にその ProjectId を渡すと
		// Then: 型検査で拒否される
		void new CommentPostedBeforeTaskCreationError(
			"Task.addComment",
			// @ts-expect-error ProjectId は TaskId に代入できない
			projectId,
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);
	});
});

describe("DuplicateCommentError の型", () => {
	test("型: taskId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列と、制約を満たす CommentId があるとき
		const raw = "PROJ-1";
		const commentId = createDummyCommentId();

		// When: taskId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new DuplicateCommentError(
			"Task.addComment",
			// @ts-expect-error 生の文字列は TaskId に代入できない
			raw,
			commentId,
		);
	});

	test("型: taskId に ProjectId を渡せない", () => {
		// Given: 別種である ProjectId と、制約を満たす CommentId があるとき
		const projectId = createDummyProjectId();
		const commentId = createDummyCommentId();

		// When: taskId にその ProjectId を渡すと
		// Then: 型検査で拒否される
		void new DuplicateCommentError(
			"Task.addComment",
			// @ts-expect-error ProjectId は TaskId に代入できない
			projectId,
			commentId,
		);
	});

	test("型: commentId に生の文字列を渡せない", () => {
		// Given: 制約を満たす識別子と、ブランドの無い CommentId の文字列があるとき
		const taskId = createDummyTaskId();
		const raw = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

		// When: commentId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new DuplicateCommentError(
			"Task.addComment",
			taskId,
			// @ts-expect-error 生の文字列は CommentId に代入できない
			raw,
		);
	});

	test("型: commentId に TaskId を渡せない", () => {
		// Given: 制約を満たす識別子と、別種である TaskId があるとき
		const taskId = createDummyTaskId();
		const otherTaskId = createDummyTaskId("PROJ-2");

		// When: commentId にその TaskId を渡すと
		// Then: 型検査で拒否される
		void new DuplicateCommentError(
			"Task.addComment",
			taskId,
			// @ts-expect-error TaskId は CommentId に代入できない
			otherTaskId,
		);
	});
});

describe("CommentLimitExceededError の型", () => {
	test("型: taskId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列があるとき
		const raw = "PROJ-1";

		// When: taskId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new CommentLimitExceededError(
			"Task.addComment",
			// @ts-expect-error 生の文字列は TaskId に代入できない
			raw,
			200,
		);
	});

	test("型: taskId に ProjectId を渡せない", () => {
		// Given: 別種である ProjectId があるとき
		const projectId = createDummyProjectId();

		// When: taskId にその ProjectId を渡すと
		// Then: 型検査で拒否される
		void new CommentLimitExceededError(
			"Task.addComment",
			// @ts-expect-error ProjectId は TaskId に代入できない
			projectId,
			200,
		);
	});
});

describe("InvalidTaskTitleError の型", () => {
	test("型: taskId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列があるとき
		const raw = "PROJ-1";

		// When: taskId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new InvalidTaskTitleError(
			"Task.rename",
			// @ts-expect-error 生の文字列は TaskId に代入できない
			raw,
			new z.ZodError([]),
		);
	});

	test("型: taskId に ProjectId を渡せない", () => {
		// Given: 別種である ProjectId があるとき
		const projectId = createDummyProjectId();

		// When: taskId にその ProjectId を渡すと
		// Then: 型検査で拒否される
		void new InvalidTaskTitleError(
			"Task.rename",
			// @ts-expect-error ProjectId は TaskId に代入できない
			projectId,
			new z.ZodError([]),
		);
	});
});
