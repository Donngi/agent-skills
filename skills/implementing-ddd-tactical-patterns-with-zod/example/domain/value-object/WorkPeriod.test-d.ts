import { describe, test } from "vitest";
import { createDummyTimestamp } from "./Timestamp.helper.test";
import { WorkPeriod } from "./WorkPeriod";

describe("WorkPeriod.create の型", () => {
	test("型: startedAt に生の数値を渡せない", () => {
		// Given: ブランドの無い生の着手時刻の数値があるとき
		const raw = 2_000;

		// When: startedAt にその生の数値を入れて WorkPeriod.create を呼ぶと
		// Then: 型検査で拒否される
		WorkPeriod.create({
			// @ts-expect-error 生の数値は Timestamp に代入できない
			startedAt: raw,
			completedAt: createDummyTimestamp(3_000),
		});
	});

	test("型: completedAt に生の数値を渡せない", () => {
		// Given: ブランドの無い生の完了時刻の数値があるとき
		const raw = 3_000;

		// When: completedAt にその生の数値を入れて WorkPeriod.create を呼ぶと
		// Then: 型検査で拒否される
		WorkPeriod.create({
			startedAt: createDummyTimestamp(2_000),
			// @ts-expect-error 生の数値は Timestamp に代入できない
			completedAt: raw,
		});
	});
});
