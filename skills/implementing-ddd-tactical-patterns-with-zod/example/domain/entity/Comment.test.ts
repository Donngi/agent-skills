import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import {
	DomainError,
	InvalidClockValueError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import {
	Comment,
	CommentSchema,
	type CommentSchemaInput,
	InvalidGeneratedCommentIdError,
} from "./Comment";
import {
	createDummyComment,
	createDummyCommentDeps,
	createDummyCreateCommentProps,
} from "./Comment.helper.test";

describe("Comment.create", () => {
	test("正常系: 制約を満たす入力なら生成した識別子とクロックの時刻を持つ Comment を返す", () => {
		// Given: 制約を満たす入力と、固定値を返すクロックと IDジェネレーターで
		const props = createDummyCreateCommentProps();
		const deps = createDummyCommentDeps({
			clock: { now: () => 2_000 },
			idGenerator: { next: () => "9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" },
		});

		// When: Comment を生成すると
		const result = Comment.create(props, deps);

		// Then: 生成した識別子と投稿時刻を持つ Comment になる
		const expected = createDummyComment({
			id: "9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
			postedAt: 2_000,
		});
		expect(result).toStrictEqual(expected);
	});

	test.for([
		{ name: "1文字", value: "a" },
		{ name: "1000文字", value: "a".repeat(1000) },
	])("正常系: 本文が $name なら受け入れる", ({ value }) => {
		// Given: 長さが下限か上限に一致する本文の入力で
		const props = createDummyCreateCommentProps({ body: value });
		const deps = createDummyCommentDeps();

		// When: Comment を生成すると
		const result = Comment.create(props, deps);

		// Then: その入力の本文をそのまま持つ Comment になる
		expect(result.body).toBe(value);
	});

	test("異常系: 本文が空なら IDジェネレーターを呼ばない", () => {
		// Given: 本文が空の入力と、呼び出しを記録する IDジェネレーターで
		const props = createDummyCreateCommentProps({ body: "" });
		const mockNext = vi.fn(() => "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f");
		const deps = createDummyCommentDeps({ idGenerator: { next: mockNext } });

		// When: Comment の生成を試みると
		try {
			Comment.create(props, deps);
		} catch {
			// 失敗の種別は「本文が '空' なら InvalidCreationParamError」のテストで確かめる
		}

		// Then: その IDジェネレーターは呼ばれていない
		expect(mockNext).not.toHaveBeenCalled();
	});

	test.for([
		{ name: "空", value: "" },
		{ name: "1001文字", value: "a".repeat(1001) },
		{ name: "先頭に空白を含む", value: " コメント" },
		{ name: "末尾に空白を含む", value: "コメント " },
	])("異常系: 本文が $name なら InvalidCreationParamError が発生する", ({
		value,
	}) => {
		// Given: 長さか前後の空白の制約に違反する本文の入力で
		const props = createDummyCreateCommentProps({ body: value });
		const deps = createDummyCommentDeps();

		// When: Comment の生成を試みると
		// Then: InvalidCreationParamError が発生する
		expect(() => Comment.create(props, deps)).toThrow(
			InvalidCreationParamError,
		);
	});

	test("異常系: 余剰キーを持つなら InvalidCreationParamError が発生する", () => {
		// Given: 余剰キーを含む入力で
		const props = { ...createDummyCreateCommentProps(), memo: "x" };
		const deps = createDummyCommentDeps();

		// When: Comment の生成を試みると
		// Then: InvalidCreationParamError が発生する
		expect(() => Comment.create(props, deps)).toThrow(
			InvalidCreationParamError,
		);
	});

	test("異常系: IDジェネレーターが大文字を含む識別子を返すなら operation が Comment.create の InvalidGeneratedCommentIdError が発生する", () => {
		// Given: 制約を満たす入力と、大文字の UUID を返す IDジェネレーターで
		const props = createDummyCreateCommentProps();
		const deps = createDummyCommentDeps({
			idGenerator: { next: () => "9A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D" },
		});

		// When: Comment の生成を試みると
		let caught: unknown;
		try {
			Comment.create(props, deps);
		} catch (error) {
			caught = error;
		}

		// Then: operation が Comment.create の InvalidGeneratedCommentIdError が発生する
		expect(caught).toBeInstanceOf(InvalidGeneratedCommentIdError);
		expect(caught).toMatchObject({ operation: "Comment.create" });
	});

	test("異常系: クロックが範囲外の時刻を返すなら operation が Comment.create の InvalidClockValueError が発生する", () => {
		// Given: 制約を満たす入力と、負の時刻を返すクロックで
		const props = createDummyCreateCommentProps();
		const deps = createDummyCommentDeps({ clock: { now: () => -1 } });

		// When: Comment の生成を試みると
		let caught: unknown;
		try {
			Comment.create(props, deps);
		} catch (error) {
			caught = error;
		}

		// Then: operation が Comment.create の InvalidClockValueError が発生する
		expect(caught).toBeInstanceOf(InvalidClockValueError);
		expect(caught).toMatchObject({ operation: "Comment.create" });
	});

	test("異常系: IDジェネレーターが例外を投げるならその例外を包まずに発生させる", () => {
		// Given: 制約を満たす入力と、例外を投げる IDジェネレーターで
		const props = createDummyCreateCommentProps();
		const failure = new Error("採番に失敗した");
		const deps = createDummyCommentDeps({
			idGenerator: {
				next: () => {
					throw failure;
				},
			},
		});

		// When: Comment の生成を試みると
		let caught: unknown;
		try {
			Comment.create(props, deps);
		} catch (error) {
			caught = error;
		}

		// Then: その IDジェネレーターが投げた例外がそのまま発生する
		expect(caught).toBe(failure);
	});

	test("異常系: クロックが例外を投げるならその例外を包まずに発生させる", () => {
		// Given: 制約を満たす入力と、例外を投げるクロックで
		const props = createDummyCreateCommentProps();
		const failure = new Error("時刻の取得に失敗した");
		const deps = createDummyCommentDeps({
			clock: {
				now: () => {
					throw failure;
				},
			},
		});

		// When: Comment の生成を試みると
		let caught: unknown;
		try {
			Comment.create(props, deps);
		} catch (error) {
			caught = error;
		}

		// Then: そのクロックが投げた例外がそのまま発生する
		expect(caught).toBe(failure);
	});

	test("異常系: create に失敗したら operation が Comment.create の InvalidCreationParamError が発生する", () => {
		// Given: 本文が空の入力と依存で
		const props = createDummyCreateCommentProps({ body: "" });
		const deps = createDummyCommentDeps();

		// When: Comment の生成を試みると
		let caught: unknown;
		try {
			Comment.create(props, deps);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Comment.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "Comment.create" });
	});

	test("異常系: 本文が空ならクロックを呼ばない", () => {
		// Given: 本文が空の入力と、呼び出しを記録するクロックで
		const props = createDummyCreateCommentProps({ body: "" });
		const mockNow = vi.fn(() => 1_500);
		const deps = createDummyCommentDeps({ clock: { now: mockNow } });

		// When: Comment の生成を試みると
		try {
			Comment.create(props, deps);
		} catch {
			// 失敗の種別は「本文が '空' なら InvalidCreationParamError」のテストで確かめる
		}

		// Then: そのクロックは呼ばれていない
		expect(mockNow).not.toHaveBeenCalled();
	});

	test("不変性: 凍結された Comment を返す", () => {
		// Given: 制約を満たす入力と、制約を満たす値を返すクロックと IDジェネレーターで
		const props = createDummyCreateCommentProps();
		const deps = createDummyCommentDeps();

		// When: Comment を生成すると
		const result = Comment.create(props, deps);

		// Then: 凍結された Comment になる
		expect(Object.isFrozen(result)).toBe(true);
	});
});

describe("Comment.reconstruct", () => {
	test("正常系: 制約を満たす保存値ならその値の Comment を返す", () => {
		// Given: 制約を満たす Comment の保存値で
		const props: CommentSchemaInput = {
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
			authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			body: "ダミーのコメント",
			postedAt: 1_500,
		};

		// When: Comment を復元すると
		const result = Comment.reconstruct(props);

		// Then: その保存値と各項目の値が一致する Comment になる
		expect(result).toStrictEqual({
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
			authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			body: "ダミーのコメント",
			postedAt: 1_500,
		});
	});

	test.for([
		{
			name: "識別子が大文字を含む",
			override: { id: "3F2C0C1E-8A4B-4D6E-9F10-2A3B4C5D6E7F" },
		},
		{ name: "著者の識別子が UUID でない", override: { authorId: "author" } },
		{ name: "投稿時刻が負", override: { postedAt: -1 } },
	])("異常系: $name なら InvalidReconstructParamError が発生する", ({
		override,
	}) => {
		// Given: 1項目だけ制約に違反する Comment の保存値で
		const props: CommentSchemaInput = {
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
			authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			body: "ダミーのコメント",
			postedAt: 1_500,
			...override,
		};

		// When: Comment の復元を試みると
		// Then: InvalidReconstructParamError が発生する
		expect(() => Comment.reconstruct(props)).toThrow(
			InvalidReconstructParamError,
		);
	});

	test("異常系: 余剰キーを持つなら operation が Comment.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 余剰キーを含む Comment の保存値で
		const props = {
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
			authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			body: "ダミーのコメント",
			postedAt: 1_500,
			memo: "x",
		};

		// When: Comment の復元を試みると
		let caught: unknown;
		try {
			Comment.reconstruct(props);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Comment.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "Comment.reconstruct" });
	});
});

describe("CommentSchema", () => {
	test("正常系: 制約を満たす Comment なら検証を通る", () => {
		// Given: 制約を満たす Comment があるとき
		const value = createDummyComment();

		// When: その値を CommentSchema で検証すると
		const result = CommentSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "null", value: null },
		{ name: "文字列", value: "ダミーのコメント" },
		{
			name: "本文が空",
			value: {
				id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
				authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				body: "",
				postedAt: 1_500,
			},
		},
		{
			name: "投稿時刻が数値でない",
			value: {
				id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
				authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				body: "ダミーのコメント",
				postedAt: "1500",
			},
		},
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: 制約に違反する Comment の値があるとき

		// When: その値を CommentSchema で検証すると
		const result = CommentSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: 余剰キーを持つなら検証を通らない", () => {
		// Given: 余剰キーを含む Comment の値があるとき
		const value = { ...createDummyComment(), memo: "x" };

		// When: その値を CommentSchema で検証すると
		const result = CommentSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});

describe("Comment.equalsById", () => {
	test("正常系: 識別子が同じならほかの項目が異なっても等しいと判定される", () => {
		// Given: 識別子だけが同じで、本文と投稿時刻が異なる2つの Comment があるとき
		const a = createDummyComment({
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
			body: "A",
			postedAt: 1_500,
		});
		const b = createDummyComment({
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
			body: "B",
			postedAt: 2_500,
		});

		// When: その2つの識別子で等価性を判定すると
		const result = Comment.equalsById(a, b);

		// Then: 等しいと判定される
		expect(result).toBe(true);
	});

	test("正常系: 識別子が異なればほかの項目が同じでも等しくないと判定される", () => {
		// Given: 識別子だけが異なる2つの Comment があるとき
		const a = createDummyComment({
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
		});
		const b = createDummyComment({
			id: "9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
		});

		// When: その2つの識別子で等価性を判定すると
		const result = Comment.equalsById(a, b);

		// Then: 等しくないと判定される
		expect(result).toBe(false);
	});
});

describe("InvalidGeneratedCommentIdError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidGeneratedCommentIdError("Comment.create", cause);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation が渡した値のまま残る", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidGeneratedCommentIdError("Comment.create", cause);

		// Then: operation が渡した操作名になる
		expect(error.operation).toBe("Comment.create");
	});

	test("正常系: 元の ZodError の issues を件数と path ごと持つ", () => {
		// Given: 値そのものを指す issue を1件持つ ZodError があるとき
		const cause = new z.ZodError([
			{
				code: "custom",
				message: "コメント ID は小文字です",
				path: [],
				input: "A",
			},
		]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidGeneratedCommentIdError("Comment.create", cause);

		// Then: issues は値そのものを指すその1件の issue だけを持つ
		expect(error.issues).toHaveLength(1);
		expect(error.issues).toMatchObject([{ path: [] }]);
	});

	test("正常系: cause に元の ZodError を持つ", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidGeneratedCommentIdError("Comment.create", cause);

		// Then: cause がその ZodError そのものになる
		expect(error.cause).toBe(cause);
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: InvalidGeneratedCommentIdError の親の class を調べると
		const parent = Object.getPrototypeOf(InvalidGeneratedCommentIdError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: InvalidCreationParamError のインスタンスではない", () => {
		// Given: ほかの具象 class と、原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidGeneratedCommentIdError("Comment.create", cause);

		// Then: InvalidCreationParamError のインスタンスとは判定されない
		expect(error).not.toBeInstanceOf(InvalidCreationParamError);
	});

	test("正常系: name が InvalidGeneratedCommentIdError になる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 生成の操作名とその ZodError を渡してエラーを作ると
		const error = new InvalidGeneratedCommentIdError("Comment.create", cause);

		// Then: name が class 名になる
		expect(error.name).toBe("InvalidGeneratedCommentIdError");
	});
});
