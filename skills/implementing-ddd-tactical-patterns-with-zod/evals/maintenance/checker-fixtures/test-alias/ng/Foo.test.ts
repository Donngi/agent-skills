import * as v from "vitest";

v.describe("Foo.create", () => {
	v.it("正常系: 値を渡すとその値を返す", () => {
		const returned = "foo";
		v.expect(returned).toBe("foo");
	});
});
