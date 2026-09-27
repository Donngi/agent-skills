import { describe, expect, test } from "vitest";

abstract class BaseError extends Error {}
class FooNotFoundError extends BaseError {}

function findFoo(id: string): string {
	if (id === "") {
		throw new FooNotFoundError();
	}
	return id;
}

describe("Foo.find", () => {
	test("異常系: 空の識別子なら例外が発生する", () => {
		// Given: 不正な空の識別子があるとき
		const id = "";

		// When: その識別子で探すと
		// Then: 例外が発生する
		expect(() => findFoo(id)).toThrow(BaseError);
	});

	test("異常系: 空の識別子なら失敗する", () => {
		// Given: 空の識別子があるとき
		const id = "";

		// When: その識別子で探すと
		try {
			findFoo(id);
		} catch (error) {
			// Then: FooNotFoundError が発生する
			expect(error).toBeInstanceOf(FooNotFoundError);
		}
	});

	test("正常系: 書き下ろした識別子を渡すとその識別子が返される", () => {
		// Given: 識別子と期待する値があるとき
		const id = "foo";
		const expected = "foo";

		// When: その識別子で探すと
		const found = findFoo(id);
		// Then: 同じ識別子が返される
		expect(found).toBe(expected);
	});

	test("正常系: 識別子を渡すと同じ識別子が2回返される", () => {
		// Given: 識別子があるとき
		const id = "foo";

		// When: その識別子で2回探すと
		// Then: 同じ識別子が返される
		expect(findFoo(id)).toBe(findFoo(id));
	});

	test.for([
		{ name: "a", id: "a" },
		{ name: "b", id: "b" },
	])("正常系: 識別子ならその識別子が返される", ({ id }) => {
		// Given: 識別子があるとき
		// When: その識別子で探すと
		const found = findFoo(id);

		// Then: 同じ識別子が返される
		expect(found).toBe(id);
	});

	test("異常系: 空の識別子を渡すと種別を問わず失敗する", () => {
		// Given: 空の識別子があるとき
		const id = "";

		// When: その識別子で探すと
		// Then: 例外が発生する
		expect(() => findFoo(id)).toThrow();
	});
});
