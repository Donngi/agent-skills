import { describe, expect, test } from "vitest";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { PullRequestUrl, PullRequestUrlSchema } from "./PullRequestUrl";
import { createDummyPullRequestUrl } from "./PullRequestUrl.helper.test";

describe("PullRequestUrl.create", () => {
	test.for([
		{ name: "https の URL", value: "https://example.com/files/1" },
		{
			name: "ポートとクエリとフラグメントを持つ",
			value: "https://example.com:8443/files/1?q=@a#top",
		},
		// "https://example.com/" は20文字
		{ name: "2048文字", value: `https://example.com/${"a".repeat(2028)}` },
	])("正常系: $name なら書き換えずに受け入れる", ({ value }) => {
		// Given: 制約を満たす PullRequestUrl の入力があるとき

		// When: その PullRequestUrl を生成すると
		const result = PullRequestUrl.create(value);

		// Then: その PullRequestUrl が変更されずに返される
		expect(result).toBe(value);
	});

	test.for([
		{ name: "2049文字", value: `https://example.com/${"a".repeat(2029)}` },
		{ name: "後ろに空白がある", value: "https://example.com/files/1 " },
		{ name: "途中に改行がある", value: "https://example.com/files/\n1" },
		{ name: "途中にタブがある", value: "https://example.com/fi\tles/1" },
		{ name: "途中に CR がある", value: "https://example.com/files/\r1" },
		{ name: "途中に空白がある", value: "https://example.com/files/ 1" },
		{
			name: "途中に制御文字がある",
			value: "https://example.com/files/\u00011",
		},
		{ name: "末尾に NUL がある", value: "https://example.com/files/1\u0000" },
		{ name: "ゼロ幅空白を含む", value: "https://example.com/files/1\u200b" },
		{ name: "バックスラッシュを含む", value: "https://example.com\\files\\1" },
		{ name: "スキームが大文字", value: "HTTPS://example.com/files/1" },
		{ name: "// が無い", value: "https:example.com/files/1" },
		{ name: "/ が1つだけ", value: "https:/example.com/files/1" },
		{
			name: "認証情報を含む",
			value: "https://user:pw@example.com/files/1",
		},
		{ name: "ホスト名に大文字を含む", value: "https://Example.com/files/1" },
		{ name: "http", value: "http://example.com/files/1" },
		{ name: "ftp", value: "ftp://example.com/files/1" },
		{ name: "ホスト名がドメインでない", value: "https://localhost/files/1" },
		{ name: "スキームが無い", value: "example.com/files/1" },
		{ name: "空文字", value: "" },
	])("異常系: $name なら InvalidCreationParamError が発生する", ({ value }) => {
		// Given: 制約に違反する PullRequestUrl の入力があるとき

		// When: その PullRequestUrl を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => PullRequestUrl.create(value)).toThrow(
			InvalidCreationParamError,
		);
	});

	test("異常系: create に失敗したら operation に PullRequestUrl.create を持つ InvalidCreationParamError が発生する", () => {
		// Given: http の PullRequestUrl の入力があるとき
		const value = "http://example.com/files/1";

		// When: その PullRequestUrl の生成を試みると
		let caught: unknown;
		try {
			PullRequestUrl.create(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が PullRequestUrl.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "PullRequestUrl.create" });
	});

	test.for([
		{
			name: "途中に空白がある",
			value: "https://example.com/files/ 1",
			message:
				"URL に使える文字は、空白とバックスラッシュを除く印字可能な ASCII 文字です",
		},
		{
			name: "// が無い",
			value: "https:example.com/files/1",
			message: "URL は https:// で始まる形です",
		},
		{
			name: "認証情報を含む",
			value: "https://user:pw@example.com/files/1",
			message: "URL に認証情報を含めることはできません",
		},
		{
			name: "ホスト名に大文字を含む",
			value: "https://Example.com/files/1",
			message: "URL のホスト名は小文字です",
		},
	])(
		"異常系: $name なら、その違反だけを述べる issue を持つ InvalidCreationParamError が発生する",
		({ value, message }) => {
			// Given: URL の形の制約に1つ違反する PullRequestUrl の入力があるとき

			// When: その PullRequestUrl の生成を試みると
			let caught: unknown;
			try {
				PullRequestUrl.create(value);
			} catch (error) {
				caught = error;
			}

			// Then: 違反した条件を述べる issue を1件だけ持つ InvalidCreationParamError が発生する
			expect(caught).toBeInstanceOf(InvalidCreationParamError);
			expect(caught).toMatchObject({ issues: [{ message }] });
		},
	);

	// 先頭の空白と制御文字は、使える文字と https:// の書き出しの2つの制約を必ず同時に破る。
	// 片方の検査だけを確かめる値が作れないので、2つの違反が別々の issue になることを確かめる
	test.for([
		{ name: "前に空白がある", value: " https://example.com/files/1" },
		{
			name: "先頭に制御文字がある",
			value: "\u0001https://example.com/files/1",
		},
	])(
		"異常系: $name なら、使える文字と書き出しの2つの issue を持つ InvalidCreationParamError が発生する",
		({ value }) => {
			// Given: 先頭に URL に使えない文字がある PullRequestUrl の入力があるとき

			// When: その PullRequestUrl の生成を試みると
			let caught: unknown;
			try {
				PullRequestUrl.create(value);
			} catch (error) {
				caught = error;
			}

			// Then: 使える文字の違反と書き出しの違反を別々の issue として持つ InvalidCreationParamError が発生する
			expect(caught).toBeInstanceOf(InvalidCreationParamError);
			expect(caught).toMatchObject({
				issues: [
					{
						message:
							"URL に使える文字は、空白とバックスラッシュを除く印字可能な ASCII 文字です",
					},
					{ message: "URL は https:// で始まる形です" },
				],
			});
		},
	);
});

describe("PullRequestUrl.reconstruct", () => {
	test("正常系: 制約を満たす値なら復元できる", () => {
		// Given: 制約を満たす PullRequestUrl の保存値があるとき
		const value = "https://example.com/files/1";

		// When: その PullRequestUrl を復元すると
		const result = PullRequestUrl.reconstruct(value);

		// Then: その値と一致する PullRequestUrl が返される
		expect(result).toBe(value);
	});

	test("異常系: reconstruct に失敗したら operation が PullRequestUrl.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: http の PullRequestUrl の保存値があるとき
		const value = "http://example.com/files/1";

		// When: その PullRequestUrl の復元を試みると
		let caught: unknown;
		try {
			PullRequestUrl.reconstruct(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が PullRequestUrl.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "PullRequestUrl.reconstruct" });
	});
});

describe("PullRequestUrlSchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす PullRequestUrl があるとき
		const value = createDummyPullRequestUrl();

		// When: その値を PullRequestUrlSchema で検証すると
		const result = PullRequestUrlSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "http", value: "http://example.com/files/1" },
		{ name: "数値", value: 1 },
		{ name: "undefined", value: undefined },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: PullRequestUrl ではない値があるとき

		// When: その値を PullRequestUrlSchema で検証すると
		const result = PullRequestUrlSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});
