# 網羅すべきテストの観点: エラー

`references/testing.md` の観点に加えて書く。適用の考え方（契約があるときに適用する、独立した制約を1つずつ違反させる）と、どのモデルにも共通の観点はそちらにある。書き方は `references/test-style.md` にある。

---

## エラー

**このグループは必須。** エラー class は継承・`cause`・`issues` という実行時の契約を持つので、テストを書く。テストは、その class を定義したファイルのテストに置く（共有の class は `shared-errors.test.ts`、モデルの class はそのモデルの `Xxx.test.ts`）。

- [ ] 業務のすべてのエラーが、`DomainError` かつ `Error` のインスタンスである
- [ ] `FatalUnreachableError` が `Error` であって `DomainError` ではない
- [ ] **種別が互いに混ざらない**。業務のエラーの具象 class の直接の親が `DomainError` である（`Object.getPrototypeOf(XxxError)` が `DomainError`）。具象どうしが継承し合わないので、ある具象のインスタンスがほかの具象のインスタンスになることは構造で起きない。**全 class の総当たりで `not.toBeInstanceOf` を並べない**（エラーの置き場が分かれているので、各テストが全部のエラーのファイルを import することになる）
- [ ] 取り違えると呼び出し側の打つ手が変わる組だけは、直接確かめる: `InvalidCreationParamError` と `InvalidReconstructParamError`（生成と復元の失敗）、依存が返した値のエラー（`InvalidClockValueError`・`InvalidGeneratedXxxIdError`）と `InvalidCreationParamError`（依存の値の不正と入力の不正）。`FatalUnreachableError` と `DomainError` の組は上の項目で確かめる
- [ ] `name` が class 名と同じ
- [ ] `operation` と、**失敗した対象の識別子**と、分岐に使うフィールド（期待した状態、上限件数、重複した要素の識別子）が、渡した値のまま残る
- [ ] **エラーのフィールドが、検証済みのドメイン値を元の型のまま持つ**（そのエラーを定義したファイルの `Xxx.test-d.ts` で、生の値と別種の識別子を渡せないことを確かめる）
- [ ] **業務操作が投げたエラーが、その対象の識別子を持つ**（`Task.start` の失敗なら `taskId` がその Task のもの。操作のテスト側で確かめる。識別子を持たないモデルが投げるエラーは適用外）
- [ ] `ZodError` を包むエラーが、元の `issues` を件数と `path` ごと持ち、`cause` に元の `ZodError` を持つ
- [ ] `FatalUnreachableError` を直接生成し、`operation` と渡した `cause` が残る（到達しない分岐を無理に通さない。ブランドを偽造した値で操作を呼ばない）

操作が投げる種別は、各モデルのテストで `toThrow(具象の class)` で確かめる。
`not.toThrow(別の種別)` は、何も投げない誤実装も通すので書かない。

```ts
describe("InvalidCreationParamError", () => {
	test("正常系: InvalidReconstructParamError のインスタンスではない", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: それを包んで InvalidCreationParamError を生成すると
		const error = new InvalidCreationParamError("Estimate.create", cause);

		// Then: InvalidReconstructParamError のインスタンスではない
		expect(error).not.toBeInstanceOf(InvalidReconstructParamError);
	});
});

// Task.test.ts の末尾（モデルのエラー class のテストは、そのモデルのテストに置く）
describe("TaskStatusMismatchError", () => {
	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: TaskStatusMismatchError の親の class を調べると
		const parent = Object.getPrototypeOf(TaskStatusMismatchError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});
});
```

### プロジェクト独自のエラー規則に従う場合

利用者に確認して、`Result<T, E>` や独自のエラー階層に読み替えると決めたなら、そちらを確かめる。

- [ ] `create` が投げずに失敗を返す
- [ ] 失敗の型がプロジェクトの型で、このスキルの `DomainError` を利用側が import していない
- [ ] Zod の `issues` が変換後にも件数と `path` ごと残っている
