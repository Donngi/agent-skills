import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidClockValueError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "./shared-errors";

describe("InvalidCreationParamError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidCreationParamError("Project.create", cause);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation が渡した値のまま残る", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidCreationParamError("Project.create", cause);

		// Then: operation が渡した操作名になる
		expect(error.operation).toBe("Project.create");
	});

	test("正常系: 元の ZodError の issues を件数と path ごと持つ", () => {
		// Given: 名前と責任者をそれぞれ指す2件の issue を持つ ZodError があるとき
		const cause = new z.ZodError([
			{ code: "custom", message: "名前が不正です", path: ["name"], input: "" },
			{
				code: "custom",
				message: "責任者が不正です",
				path: ["leadId"],
				input: "x",
			},
		]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidCreationParamError("Project.create", cause);

		// Then: issues はその名前と責任者を指す2件の issue を元の順で持つ
		expect(error.issues).toHaveLength(2);
		expect(error.issues).toMatchObject([
			{ path: ["name"] },
			{ path: ["leadId"] },
		]);
	});

	test("正常系: cause に元の ZodError を持つ", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidCreationParamError("Project.create", cause);

		// Then: cause がその ZodError そのものになる
		expect(error.cause).toBe(cause);
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: InvalidCreationParamError の親の class を調べると
		const parent = Object.getPrototypeOf(InvalidCreationParamError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: InvalidReconstructParamError のインスタンスではない", () => {
		// Given: ほかの具象 class と、原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidCreationParamError("Project.create", cause);

		// Then: InvalidReconstructParamError のインスタンスとは判定されない
		expect(error).not.toBeInstanceOf(InvalidReconstructParamError);
	});

	test("正常系: name が InvalidCreationParamError になる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidCreationParamError("Project.create", cause);

		// Then: name が class 名になる
		expect(error.name).toBe("InvalidCreationParamError");
	});
});

describe("InvalidReconstructParamError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 復元の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidReconstructParamError(
			"Project.reconstruct",
			cause,
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation が渡した値のまま残る", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 復元の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidReconstructParamError(
			"Project.reconstruct",
			cause,
		);

		// Then: operation が渡した操作名になる
		expect(error.operation).toBe("Project.reconstruct");
	});

	test("正常系: 元の ZodError の issues を件数と path ごと持つ", () => {
		// Given: 識別子と作成時刻をそれぞれ指す2件の issue を持つ ZodError があるとき
		const cause = new z.ZodError([
			{
				code: "custom",
				message: "識別子が不正です",
				path: ["id"],
				input: "proj",
			},
			{
				code: "custom",
				message: "作成日時が不正です",
				path: ["createdAt"],
				input: -1,
			},
		]);

		// When: 復元の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidReconstructParamError(
			"Project.reconstruct",
			cause,
		);

		// Then: issues はその識別子と作成時刻を指す2件の issue を元の順で持つ
		expect(error.issues).toHaveLength(2);
		expect(error.issues).toMatchObject([
			{ path: ["id"] },
			{ path: ["createdAt"] },
		]);
	});

	test("正常系: cause に元の ZodError を持つ", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 復元の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidReconstructParamError(
			"Project.reconstruct",
			cause,
		);

		// Then: cause がその ZodError そのものになる
		expect(error.cause).toBe(cause);
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: InvalidReconstructParamError の親の class を調べると
		const parent = Object.getPrototypeOf(InvalidReconstructParamError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: InvalidCreationParamError のインスタンスではない", () => {
		// Given: ほかの具象 class と、原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 復元の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidReconstructParamError(
			"Project.reconstruct",
			cause,
		);

		// Then: InvalidCreationParamError のインスタンスとは判定されない
		expect(error).not.toBeInstanceOf(InvalidCreationParamError);
	});

	test("正常系: name が InvalidReconstructParamError になる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 復元の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidReconstructParamError(
			"Project.reconstruct",
			cause,
		);

		// Then: name が class 名になる
		expect(error.name).toBe("InvalidReconstructParamError");
	});
});

describe("InvalidClockValueError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidClockValueError("Task.create", cause);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation が渡した値のまま残る", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidClockValueError("Task.create", cause);

		// Then: operation が渡した操作名になる
		expect(error.operation).toBe("Task.create");
	});

	test("正常系: 元の ZodError の issues を件数と path ごと持つ", () => {
		// Given: 値そのものを指す issue を1件持つ ZodError があるとき
		const cause = new z.ZodError([
			{
				code: "custom",
				message: "タイムスタンプは1970-01-01以降です",
				path: [],
				input: -1,
			},
		]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidClockValueError("Task.create", cause);

		// Then: issues は値そのものを指すその1件の issue だけを持つ
		expect(error.issues).toHaveLength(1);
		expect(error.issues).toMatchObject([{ path: [] }]);
	});

	test("正常系: cause に元の ZodError を持つ", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidClockValueError("Task.create", cause);

		// Then: cause がその ZodError そのものになる
		expect(error.cause).toBe(cause);
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: InvalidClockValueError の親の class を調べると
		const parent = Object.getPrototypeOf(InvalidClockValueError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: InvalidCreationParamError のインスタンスではない", () => {
		// Given: ほかの具象 class と、原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidClockValueError("Task.create", cause);

		// Then: InvalidCreationParamError のインスタンスとは判定されない
		expect(error).not.toBeInstanceOf(InvalidCreationParamError);
	});

	test("正常系: name が InvalidClockValueError になる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidClockValueError("Task.create", cause);

		// Then: name が class 名になる
		expect(error.name).toBe("InvalidClockValueError");
	});
});

describe("FatalUnreachableError", () => {
	test("正常系: Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名だけでエラーを作ると
		const error = new FatalUnreachableError("Project.archive");

		// Then: Error のインスタンスになる
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: DomainError のインスタンスではない", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名だけでエラーを作ると
		const error = new FatalUnreachableError("Project.archive");

		// Then: 業務エラーの基底 class のインスタンスとは判定されない
		expect(error).not.toBeInstanceOf(DomainError);
	});

	test("正常系: operation が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名だけでエラーを作ると
		const error = new FatalUnreachableError("Project.archive");

		// Then: operation が渡した操作名になる
		expect(error.operation).toBe("Project.archive");
	});

	test("正常系: cause を渡せば渡した値のまま残る", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 操作名とその原因を渡してエラーを作ると
		const error = new FatalUnreachableError("Project.archive", cause);

		// Then: cause がその ZodError そのものになる
		expect(error.cause).toBe(cause);
	});

	test("正常系: cause を渡さなければ cause のキーを持たない", () => {
		// Given: 原因に渡すエラーが無いとき

		// When: 操作名だけでエラーを作ると
		const error = new FatalUnreachableError("Project.archive");

		// Then: cause のキー自体が存在しない
		expect("cause" in error).toBe(false);
	});

	test("正常系: name が FatalUnreachableError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名だけでエラーを作ると
		const error = new FatalUnreachableError("Project.archive");

		// Then: name が class 名になる
		expect(error.name).toBe("FatalUnreachableError");
	});
});
