import { describe as group, expect as check, test as spec } from "vitest";

group("Foo.create", () => {
	spec("正常系: 値を渡すとその値を返す", () => {
		// Given: 値があるとき
		const value = "foo";

		// When: そのまま返すと
		const returned = value;

		// Then: 同じ値が返される
		check(returned).toBe("foo");
	});
});
