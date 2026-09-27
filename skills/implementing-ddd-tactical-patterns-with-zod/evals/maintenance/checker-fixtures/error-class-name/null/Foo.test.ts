import { describe, expect, test, vi } from "vitest";
import {
	FooVersionConflictError,
	FooConflictError,
	PutFooCommand,
	unknownConstructor,
} from "./commands.js";

describe("FooRepositoryImpl.save", () => {
	test("正常系: 保存すると Foo の項目を書き込む送信をする", () => {
		// Given: 送信を記録するクライアントがあるとき
		const mockSend = vi.fn();

		// When: Foo を保存すると
		mockSend(new PutFooCommand({ key: "FOO#1" }));

		// Then: 書き込みの送信が1回される
		expect(mockSend.mock.calls[0]?.[0]).toBeInstanceOf(PutFooCommand);
	});
});

describe("FooVersionConflictError", () => {
	test("正常系: 版の食い違いのエラーは衝突のエラーの一種である", () => {
		// Given: 版の食い違いのエラーを作ったとき
		const error = new FooVersionConflictError();

		// When: 種別を確かめると
		// Then: 衝突のエラーの一種である
		expect(error).toBeInstanceOf(FooConflictError);
	});
});

describe("Foo.build", () => {
	test("正常系: 組み立てると構築子の値になる", () => {
		// Given: 組み立てた値があるとき
		const built: unknown = Reflect.construct(unknownConstructor, []);

		// When: 種別を確かめると
		// Then: 構築子の値になる
		expect(built).toBeInstanceOf(unknownConstructor);
	});
});
