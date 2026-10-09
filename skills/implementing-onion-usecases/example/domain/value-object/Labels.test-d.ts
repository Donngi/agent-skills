import { describe, test } from "vitest";
import { Labels } from "./Labels";
import { createDummyLabels } from "./Labels.helper.test";

describe("Labels.create の型", () => {
	test("型: 要素に生の文字列を渡せない", () => {
		// Given: ブランドの無い生の Label の文字列があるとき
		const raw = "bug";

		// When: 要素にその生の文字列を入れて Labels.create を呼ぶと
		// Then: 型検査で拒否される
		Labels.create([
			// @ts-expect-error 生の文字列は Label に代入できない
			raw,
		]);
	});
});

describe("Labels.add の型", () => {
	test("型: label に生の文字列を渡せない", () => {
		// Given: Labels と、ブランドの無い生の Label の文字列があるとき
		const labels = createDummyLabels();
		const raw = "bug";

		// When: label にその生の文字列を入れて Labels.add を呼ぶと
		// Then: 型検査で拒否される
		Labels.add(labels, {
			// @ts-expect-error 生の文字列は Label に代入できない
			label: raw,
		});
	});
});

describe("Labels.remove の型", () => {
	test("型: label に生の文字列を渡せない", () => {
		// Given: Labels と、ブランドの無い生の Label の文字列があるとき
		const labels = createDummyLabels();
		const raw = "bug";

		// When: label にその生の文字列を入れて Labels.remove を呼ぶと
		// Then: 型検査で拒否される
		Labels.remove(labels, {
			// @ts-expect-error 生の文字列は Label に代入できない
			label: raw,
		});
	});
});
