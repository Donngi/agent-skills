# 網羅すべきテストの観点: 値オブジェクト

`references/testing.md` の観点に加えて書く。適用の考え方（契約があるときに適用する、独立した制約を1つずつ違反させる）と、どのモデルにも共通の観点はそちらにある。書き方は `references/test-style.md` にある。

---

## 値オブジェクト

### プリミティブ型

- [ ] 境界値の内と外（長さ、範囲）
- [ ] 形式違反を拒否する
- [ ] 大文字小文字を同一視する形式の識別子（UUID など）なら、受け入れると決めた表記以外を拒否する
- [ ] 前後の空白を正規化せず拒否する（文字列の場合）

```ts
describe("UserId.create", () => {
	test("異常系: 大文字を含むなら InvalidCreationParamError が発生する", () => {
		// Given: 大文字で書かれた UserId の入力があるとき
		const value = "0B6F5F5E-1B5E-4F1E-9F1E-1B5E4F1E9F1E";

		// When: その UserId を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => UserId.create(value)).toThrow(InvalidCreationParamError);
	});
});
```

### 接頭辞付き識別子

- [ ] 接頭辞が無いものを拒否する
- [ ] 区切りの後ろが不正なもの（`0`、先頭ゼロ、負号）を拒否する
- [ ] **桁数の過不足を拒否する**（`z.templateLiteral` の構成要素では `regex` と `min` / `max` を併用すると `min` / `max` が無視される）
- [ ] **接頭辞に使う値オブジェクトの下限ちょうど・上限ちょうどを、接頭辞付き識別子の側でも受け入れる。下限未満・上限超過はそれぞれ拒否する**（構成要素の `min` / `max` が無視されても、構成要素の値オブジェクト単体のテストでは検出できない）
- [ ] 受け入れる最大の番号を受け入れ、1つ上を拒否する
- [ ] 読み取りの関数があるなら、分解した値が期待どおり

### 列挙

- [ ] 定義した値をすべて受け入れる
- [ ] 定義外の値を拒否する
- [ ] 比較の関数があるなら、`true` になる組・`false` になる組・同じ値どうしを確かめる

### URL

- [ ] **暗黙の正規化を手前で拒否できている**（前後の空白、途中の改行・タブ・CR。`z.url()` は途中の文字も取り除く）
- [ ] 許していないスキームを拒否する

### 複数値かつ各値はプリミティブ型

- [ ] **別々に作った同じ内容の値を、等価性の関数が等しいと判定する**
- [ ] 1項目だけ違う値を、項目ごとに等しくないと判定する
- [ ] 演算があるなら、結果の値
- [ ] 演算があるなら、単位の不一致を名前付きのエラーで拒否する
- [ ] 演算の結果が範囲を超えるなら、名前付きのエラーで拒否する（`Number.MAX_SAFE_INTEGER` を超える合計など）

```ts
describe("Estimate.add", () => {
	test("異常系: 単位が異なるなら EstimateUnitMismatchError が発生する", () => {
		// Given: 単位が異なる2つの Estimate があるとき
		const estimate = createDummyEstimate({ unit: "point" });
		const addend = createDummyEstimate({ unit: "hour" });

		// When: その2つの Estimate を加算すると
		// Then: EstimateUnitMismatchError が発生する
		expect(() => Estimate.add(estimate, { addend })).toThrow(
			EstimateUnitMismatchError,
		);
	});
});
```

### 複数値かつ各値が別の値オブジェクト

- [ ] 入れ子の値オブジェクトの制約が効く（代表の1ケース）
- [ ] 項目どうしの制約を拒否し、issue の `path` が問題の項目を指す
- [ ] 項目どうしの制約の境界（同じ値を許すかどうか）

### コレクション

- [ ] 空を受け入れるかどうか
- [ ] 最大件数ちょうどを受け入れ、1件超えを拒否する
- [ ] 重複を拒否する
- [ ] 並び順を不変条件にしたなら、順序の制約を拒否する（`create` で並べ替えるなら、`create` は並べ替えた値を返し、`reconstruct` と完成値スキーマが決めた順でない値を拒否する）
- [ ] 並び順を不変条件にしないなら、`create` と `reconstruct` が渡された並びのまま受け入れ、等価性が並び順を無視する
- [ ] `create` で並べ替えるなら、渡された配列の並びを変えない
- [ ] 並び順を不変条件にしたなら、重複と順序の違反が、別々の issue として区別できる（`create` が並べ替えるなら `reconstruct` で確かめる）
- [ ] 追加・削除の結果の値と並び
- [ ] **状態が変わらない呼び出し**（すでに追加されているものを追加する、無いものを削除する）が、仕様どおりの結果（元の値をそのまま返す、など）になる
- [ ] 上限に達した状態で新しい要素を追加すると、専用のエラーを投げる（`FatalUnreachableError` にならない）
- [ ] 上限に達した状態で既にある要素を追加したときの結果が仕様どおり（無変更の判定と上限の判定の順序）
- [ ] 引数で受け取ったコレクションを変更しない
- [ ] **横断検証から呼ぶ導出関数が、計算できないときに `undefined` を返す**

```ts
describe("Labels.add", () => {
	test("不変性: すでに追加されている Label なら元の値をそのまま返す", () => {
		// Given: 2つの Label と、そのうちの1つと同じ Label があるとき
		const labels = createDummyLabels(["bug", "ui"]);
		const label = createDummyLabel("ui");

		// When: その Label を追加すると
		const result = Labels.add(labels, { label });

		// Then: 元の値と同じ参照が返される
		expect(result).toBe(labels);
	});
});
```
