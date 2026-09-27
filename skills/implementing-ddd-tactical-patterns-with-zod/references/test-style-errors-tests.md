# テストの書き方: エラー class のテスト

`references/test-style.md` の規則（置き場と命名、Given / When / Then など）に加えて読む。**何を確かめるか**は `references/testing-errors.md` にある。

---

## エラー class のテスト

**エラー class のテストは、その class を定義したファイルのテストに置く。** 共有の class は `shared-errors.test.ts`、モデルの class はそのモデルの `Xxx.test.ts`、インターフェースの class はそのインターフェースの `Xxx.test.ts`。どのファイルでも、エラー class は class 単位で `describe` を立てる（`references/test-style.md`「置き場と命名」）。

**エラー class を `new` で直接作って項目を確かめるテストでは、項目を決まり方で分ける。**
判定はエラー class のコンストラクタ本体を見るだけで付く。

- **`this.項目 = 引数` と素で写しているだけの項目は、`operation` と一緒に1テストにまとめる。**
  `left` / `right`、`taskId` / `expected` / `actual`、`projectId`、`commentId`、`limit` がこれに当たる。
  同じ形の代入が並んでいるだけなので、「**渡した引数が取り違えられずに残る**」という1つの契約になる。
  `toMatchObject` で項目名と期待値を一度に書き、取り違えを見るために項目ごとに違う値を渡す
- **素の代入で決まらない項目は、項目ごとに別のテストにする。** 次の3つがこれに当たる

| 項目 | 決まり方 | エラー class での書かれ方 |
|---|---|---|
| `issues` | 引数そのものではなく、その中身を取り出す | `this.issues = cause.issues;` |
| `cause` | 代入行が無く、`Error` が設定する | `super(operation, "…", { cause })` |
| `name` | 引数と無関係。class の宣言で決まる | `override readonly name: string = "XxxError";` |

決まる仕組みが違うので独立に壊れ、確かめる matcher も違う（件数と `path` / 参照の同一性 / 文字列）。
まとめると、**中身の取り出しが壊れたのか、`super` への受け渡しが壊れたのか、宣言を書き忘れたのか**が読めない。
引数の有無で分岐する項目（`FatalUnreachableError` の `cause`）は、分岐ごとに1テストにする。

**`operation` が単独のテストになっている class は、まとめなかったのではなく、まとめる相手がいない。**
素の代入で決まる項目が `operation` しか無いだけである。

`references/test-style.md`「1つのテストで確かめること」の表の「捕まえた例外の種別と `operation`」は、**対象操作が投げた例外を捕まえたとき**の話である。
エラー class のテストには種別の検査が無く（`new` で作った値の型は分かりきっている）、
項目だけが並ぶので、この行には当たらない。

```ts
// ✗ 決まり方が違う3つを1つのテストにまとめている
test("正常系: 操作名と、渡した ZodError の issues と cause が残っている", () => {
	// Given: 原因に渡す ZodError があるとき
	const cause = new z.ZodError([...]);

	// When: InvalidCreationParamError を作る
	const error = new InvalidCreationParamError("Task.create", cause);

	// Then: 操作名と issues と cause が渡した値のまま残る
	expect(error.operation).toBe("Task.create");
	expect(error.issues).toHaveLength(1);
	expect(error.cause).toBe(cause);
});

// ✓ 素の代入で決まる項目はまとめる（実物は example/domain/value-object/Estimate.test.ts）
test("正常系: operation と左辺と右辺の単位が渡した値のまま残る", () => {
	// Given: 特別な前提が無いとき

	// When: 加算の操作名と、異なる2つの単位でエラーを作ると
	const error = new EstimateUnitMismatchError("Estimate.add", "point", "hour");

	// Then: 操作名と左辺・右辺の単位が渡した順のまま残っている
	expect(error).toMatchObject({
		operation: "Estimate.add",
		left: "point",
		right: "hour",
	});
});

// ✓ issues / cause / name は分ける
test("正常系: 元の ZodError の issues を件数と path ごと持つ", () => { … });
test("正常系: cause に元の ZodError を持つ", () => { … });
test("正常系: name が InvalidCreationParamError になる", () => { … });
```

**同じ class の中で両方が現れてよい。** `InvalidTaskNumberResponseError` は `ZodError` を包みながら、
`operation` と `projectId` を1テストにまとめ、`issues` と `cause` と `name` を分けている。
判定はモデルの種類ではなく項目ごとである。

例外は2つある。どちらも「1つの `expect` で済む」か「1つの契約の言い換え」である。

- 基底 class と `Error` の**両方のインスタンス**であること（`expect` を2つ並べて1テスト）
- **メッセージの組み立て**（接頭辞と本文が1つの文字列になる契約）
