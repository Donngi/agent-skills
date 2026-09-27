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
	test("異常系: 空の識別子なら FooNotFoundError が発生する", () => {
		// Given: 空の識別子があるとき
		const id = "";

		// When: その識別子で探すと
		// Then: FooNotFoundError が発生する
		expect(() => findFoo(id)).toThrow(FooNotFoundError);
	});

	test("正常系: 識別子を渡すとその識別子が返される", () => {
		// Given: 識別子があるとき
		const id = "foo";

		// When: その識別子で探すと
		const found = findFoo(id);

		// Then: 同じ識別子が返される
		expect(found).toBe("foo");
	});

	test.for([
		{ name: "a", id: "a" },
		{ name: "b", id: "b" },
	])("正常系: 識別子が $name ならその識別子が返される", ({ id }) => {
		// Given: 識別子があるとき
		// When: その識別子で探すと
		const found = findFoo(id);

		// Then: 同じ識別子が返される
		expect(found).toBe(id);
	});
});
