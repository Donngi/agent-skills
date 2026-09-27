import { describe, expect, test } from "vitest";

describe("Foo の型", () => {
	test("型: 数値を渡せない", () => {
		// Given: 数値があるとき
		const value = 1;

		// When: 文字列の変数に代入すると
		// Then: 型検査で拒否される
		// @ts-expect-error 数値は文字列に代入できない
		const text: string = value;
		void text;
	});
});
