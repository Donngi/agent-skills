# テストの書き方: Vitest 以外と in-source testing

`references/test-style.md` の規則（置き場と命名、Given / When / Then など）に加えて読む。**何を確かめるか**は `references/testing.md` にある。

---

## Vitest 以外で書くとき

利用者に確認したうえで別のライブラリを使うなら、次のように読み替える。
**そのライブラリに同じ機能が無いものは、自分で作らない。**

| この文書 | Jest | node:test |
|---|---|---|
| `test.for(rows)("$name …", (row) => …)` | `test.each(rows)("$name …", (row) => …)`。オブジェクトの行は展開されない | 表の機能が無い。ケースごとに `test` を書く |
| `toThrow(具象の class)` | 同じ | `assert.throws(() => …, 具象の class)` |
| `toStrictEqual` | 同じ | `assert.deepStrictEqual` |
| `vi.fn` | `jest.fn` | `mock.fn` |
| `Xxx.test-d.ts` と型検査モード | 無い。`@ts-expect-error` を `tsc --noEmit` で検出する | 無い。`@ts-expect-error` を `tsc --noEmit` で検出する |
| ヘルパーを収集から外す設定 | `testPathIgnorePatterns` | 実行対象のファイル指定から外す |
| in-source testing | 無い | 無い |
| `vitest run --coverage` | `jest --coverage` | `node --test --experimental-test-coverage` |

---

## in-source testing

Vitest は、実装ファイルの中にテストを書く書き方も持っている。**このスキルの既定では使わない。**
知らずに見かけたときに読めるよう、使うならどうするかをここに書く。

```ts
// 対象ファイルの末尾。「公開 API」セクションのあとに置く
if (import.meta.vitest) {
	const { describe, test, expect } = import.meta.vitest;

	describe("isSortedAscending", () => {
		test("正常系: 隣り合う値が降順なら昇順ではないと判定される", () => {
			// Given: 隣り合う値が降順の配列があるとき
			const values = [2, 1];

			// When: その配列が昇順かを判定すると
			const result = isSortedAscending(values);

			// Then: 昇順ではないと判定される
			expect(result).toBe(false);
		});
	});
}
```

テストの API はブロックの中で `import.meta.vitest` から取り出す。ファイルの先頭で `vitest` を import しない。
書き方の規則はこの文書のとおりである。

### 使ってよい場面

**export しない純粋な関数を直接確かめる価値があり、公開 API を通すと失敗の条件をはっきり観測しにくいときだけ。**

公開していないというだけでは理由にならない。参照実装の `toPKSKFromRawId` は非公開だが、
`toDynamoDBTaskItemDTOPKSK` と `fromDynamoDBTaskItemDTO` の整合検証から観測できるので、in-source にしない。

### 使わない場面

- 公開 API から確かめられる振る舞いを、重ねて確かめるだけのとき
- 外部接続、モジュールのモック、大きなダミーが要るとき
- 本番の成果物からテストコードを取り除けないとき
- `tsc` だけでビルドして JavaScript を配布しているとき

### 設定

3つが揃わないと動かないか、本番に残る。

```ts
// vitest.config.ts
export default defineConfig({
	test: {
		// 狭く指定する。当たったファイルは中身の文字列で判定される
		includeSource: ["src/domain/value-object/Labels.ts"],
	},
});
```

```jsonc
// tsconfig.json。既存の types を消さずに足す
{ "compilerOptions": { "types": ["node", "vitest/importMeta"] } }
```

```ts
// 本番をビルドする設定（Vite なら vite.config.ts、esbuild ならその build 呼び出し）
define: { "import.meta.vitest": "undefined" },
```

### 落とし穴

- **`tsc` の出力にはテストコードがそのまま残る。** Node で `import.meta.vitest` は `undefined` なので実行はされないが、消えない（実測）
- **esbuild は `define` だけでは消さない。** `if (void 0) { … }` が残り、`minifySyntax`（または `minify`）を付けて初めて消える（実測）。Lambda を esbuild で束ねるなら両方を確かめる
- **`import.meta.vitest` という文字列がコメントにあるだけで、テストファイルとして収集される。** テストが無ければ `No test suite found` で落ちる（実測）
- **`types` に `vitest/importMeta` が無いと TS2339。**
- **`*.helper.test.ts` を import しない。** 本番コードがテスト用のファイルを import することになる
- 本番の成果物を実際に開いて、テスト名の文字列が残っていないことを確かめる
