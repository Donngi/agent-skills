# 網羅すべきテストの観点

実装したモデルの種類に応じて、該当する観点をすべて書く。チェックリストとして使い、書いたものに印を付ける。

**観点は、モデルの種類ごとのファイルに分けてある。** この文書は常に読む。そのうえで、書いたモデルの種類に当たるファイルを読み、その観点をすべて書く。
当たらない種類のファイルは読まなくてよい。読むファイルは `SKILL.md` の「読む計画」の表が正で、次の表はその写しである。

| 書いたもの | 観点のファイル |
|---|---|
| 値オブジェクト | `references/testing-value-objects.md` |
| エンティティ・集約、I/O の無いドメインサービス | `references/testing-entities.md` |
| エラー class（`shared-errors.ts` と、モデル・インターフェースのファイルのエラー） | `references/testing-errors.md` |
| DTO と保存キー、リポジトリ実装、ドメインサービスの実装 | `references/testing-infra.md` |

**この文書と種類ごとのファイルは「何を確かめるか」の一覧である。** 書き方（置き場、命名、Given / When / Then、テーブル駆動、
ダミー生成ヘルパー、型のテスト）は `references/test-style.md` にある。どの書き方に従うかの判断と、
利用者に確認する条件もそちらにある。以下のコード例はその書き方で書いてある。
全モデルぶんの実物は `example/` にある。任意項目は `Task` の `pullRequestUrl` が実物。参照実装のモデルに無い契約の観点（導出値など）には実物が無い。

**観点は、対象にその契約があるときに適用する。** 参照実装の状態・項目・数値を、別のモデルに要求しない。
逆に、既存のテストに無いことを省く理由にしない。プロジェクトが例外ではなく `Result` を返すなど、
そのまま当てはめられないときの読み替えは、`test-style.md`「どの書き方に従うか」の条件で利用者に確認する。

**範囲は、本物の外部接続を使わずに手元で完結するテストである。** リポジトリ実装とドメインサービス実装は、
クライアントをモックに差し替えて確かめる。本物のクライアントで実際の保存先に接続しないと確かめられない契約だけを、
`references/testing-infra.md` の「範囲外: 本物のクライアントで確かめる契約」に列挙してある。

**独立した制約は、1つずつ違反させる。** 2つの制約を同時に破った値で拒否を確かめると、
片方の検証が消えても落ちない。細かい境界値は、その制約を持っているモデルで確かめる。
ほかのモデルや層では、受け渡しと検証の経路を代表の1ケースで確かめる。

**1つの制約だけを破ったつもりの値が、ほかの制約も破っていないかを確かめる。** 見落としやすいのは次のものである。

- **空文字と前後の空白は、複数の制約を同時に破りやすい。** 「2文字以上」「英大文字だけ」「前後に空白が無い」を別々の検査で持つ値に
  `""` を渡すと前の2つを、`" AB"` を渡すと後の2つを同時に破る。長さを確かめるなら `"A"`、文字種なら `"Ab"` のように、ほかの制約を満たす値を選ぶ。
  テーブル駆動の行も1行ずつ、狙った制約のほかを満たしているかを確かめる
- **書き出し（接頭辞）の検査と文字種の検査を別に持つ値では、先頭に置いた違反文字が両方を破る。** URL で `https://` で始まることと使える文字を別々に検査しているなら、
  `" https://…"` や `"\u0001https://…"` は両方に違反する。文字種は書き出しのあと（途中や末尾）に違反文字を置いた値で確かめる（`"https://example.com/files/ 1"`）。
  先頭の空白のように、どう置いても両方を破る値は、2つの違反が別々の issue になることを確かめるテストにする（下の1つ目。実物は `example/domain/value-object/PullRequestUrl.test.ts`）
- **DTO で本体の項目を壊すときは、保存キーも壊した本体から組み直す。** キーを元のままにすると、キーと本体の整合の検査が先に拒否し、
  狙った検査に届かない（`references/testing-infra.md` の「保存キー」）
- **別の値オブジェクトを組み込んだ識別子の拒否テストでは、値が部品の制約を満たすようにする。** `ProjectId` を接頭辞に組み込んだ `TaskId` に `"1"` を渡すと、
  部品の `ProjectId` の長さと、区切り・番号の形式を同時に破る。区切りの欠落なら `"PROJ1"`、番号の形式なら `"PROJ-1a"` のように、部品は正しい `ProjectId` にする。
  部品の制約（長さ・文字種・前後の空白）は部品の値オブジェクトのテストで確かめ、組み込んだ側では部品の検証を通ることを代表の1行（`"Proj-1"`）で確かめる
  （実物は `example/domain/value-object/TaskId.test.ts`）

**同時に破ってよいのは、次のように、破り方の組み合わせそのものが契約のテストだけである。** そのときはテスト名と Then にその契約を書く。

- 違反が別々の issue として報告されること（issue の内訳を確かめる）
- 複数の違反があるとき、どの失敗が優先されるか（判定の順序を確かめる。複数の違反を渡すだけでなく、どの失敗になったかまで確かめる）
- 仕様どおりには組めない値でも、意図しない例外にならないこと（`references/testing-infra.md` の「保存キー」の、形式違反の識別子）

---

## すべてのモデルに共通

- [ ] 制約を満たす値で `create` できる
- [ ] 制約を満たす値で `reconstruct` できる
- [ ] 完成値スキーマが制約を満たす値を通す（`XxxSchema.safeParse(value).success` が `true`）
- [ ] 完成値スキーマが不正な値を通さない（`false`。例外が漏れれば、そのテストが落ちるので `not.toThrow` は重ねない）
- [ ] オブジェクトの完成値なら、完成値スキーマが余剰キーを持つ値を通さない
- [ ] `create` の失敗が `InvalidCreationParamError`、`reconstruct` の失敗が `InvalidReconstructParamError`（`toThrow` に具象の class を渡す）
- [ ] 失敗したエラーの `operation` が `"Xxx.create"` / `"Xxx.reconstruct"`
- [ ] **JSDoc に書いた制約が、実際に拒否される**（書いただけで検証していない制約を見つける）

```ts
describe("EstimateSchema", () => {
	test("正常系: 余剰キーを持つなら検証を通らない", () => {
		// Given: 余剰キーを含む Estimate の値があるとき
		const value = { amount: 3, unit: "point", memo: "x" };

		// When: その値を EstimateSchema で検証すると
		const result = EstimateSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});
```

---

## ダミーと期待値の作り方

書き方の詳細は `references/test-style-helpers.md` にある。観点に関わるのは次の3つである。

- **ダミーの完成値は `reconstruct` で作る。** 完成値スキーマが不変条件をすべて検証するので、起こりえない状態にはならない。
  テスト対象の操作（`create` や遷移）でダミーを作らない。対象が壊れたときに無関係なテストまで落ちる
- **DTO の期待値は、仕様から書き下ろす。** 現行の `to` から作ると、テストが実装の写し鏡になり、
  旧データや外部仕様とのずれを検出できない
- **正常な値の1項目だけを壊して拒否を確かめるときは、ダミーや `to` の出力を土台にしてよい。**
  壊す前の値が制約を満たすことが前提の検証だからである。ただしそれで、独立に書いた DTO との対応テストを代用しない

---

## 型のテストを置くモデル

**置くのは、下の3箇所のどれかに型で止める引数があるモデルだけである。** 全モデルには置かない。
型のテストが止めるのは次の4つである。

1. **生の値を渡す**（`"PROJ-1"` を `TaskId` の位置に、`3` を `Timestamp` の位置に）
2. **別種の識別子を渡す**（`ProjectId` を `TaskId` の位置に、`CommentId` を `UserId` の位置に）
3. **任意項目に `undefined` を渡す**（`.exactOptional()` の項目。`exactOptionalPropertyTypes` を
   有効にしたプロジェクトでだけ止まる。無効なら書かない）
4. **列挙の外の値を渡す**（`"archived"` を `Task["status"]` の位置に。
   実物は `example/domain/entity/Task.test-d.ts` の `TaskStatusMismatchError の型` の `expected` にある）

1と2はブランドがあって初めて成立する。3と4はブランドが無い項目でも対象になる。
**2の「別種」は識別子どうしだけである。** `Timestamp` を `Money` の位置に、数量を時刻の位置に渡すような、
識別子以外のブランド付きの値どうしの取り違えを止めるテストは書かない（`Money` の項目の検査は1の生の数値で足りる）。
識別子は同じ形の文字列が1つの引数に並びやすく、取り違えても実行時の検証を通ることがあるので、別種の識別子を個別に止める。
**下の3箇所にある項目ごとに、この4つのうち当てはまるものを1テストずつ書く。** 代表の1項目にしない。
項目ごとに型が別々に定義されているので、1つの項目のブランドが外れても、ほかの項目のテストでは検出できない。
**型のテストの対象は、この節だけで決める。** `SKILL.md` と `test-style.md` はここを参照する。

**数えるのは次の3箇所だけである。**

| 箇所 | 例 |
|---|---|
| `create` の第1引数 | `CreateXxxProps` にブランド付き・任意・列挙の項目があるモデル（`Comment` の `authorId`、`Project` の `leadId`、`Task` の `creatorId` と `pullRequestUrl` と `priority`、`Estimate` の `unit`） |
| 業務操作のパラメータ | `StartTaskParams.assigneeId`、`CompleteTaskParams.at`、`AddEstimateParams.addend`。I/O の無いドメインサービスのパラメータも同じ |
| エラーのコンストラクタ引数 | `TaskStatusMismatchError` の `taskId` と `expected` / `actual`、`TaskStartedBeforeCreationError` の `startedAt` / `createdAt`、`EstimateUnitMismatchError` の `left` / `right` |

**この3箇所の外は数えない。** リポジトリインターフェースと実装（`TaskRepository.get(id: TaskId)`）、
ドメインサービスと実装（`TaskNumberIssuer.next(projectId: ProjectId)`）、
DTO の変換（`toDynamoDBTaskItemDTO(task: Task)`）、読み取り関数のレシーバ（`TaskId.projectId(id: TaskId)`）は、
ブランド付きの値を要求していても型のテストを置かない。
**これらはドメインの型を `import type` で参照しているだけで、そこでブランドが外れる余地が無い。**
外れるならドメイン側で外れ、ドメイン側の型のテストが検出する。

**置かないモデルは2種類ある。どちらも「止めるべき代入が存在しない」ので、無いことが正しい。**

- **1つのプリミティブ値を包む値オブジェクト**（`TaskId` / `ProjectId` / `UserId` / `CommentId` /
  `Timestamp` / `Label` / `PullRequestUrl` の7つ）。
  `createXxx(value: string)` と**生の値を受けるのが仕様**なので（`references/model-code.md`「create の第1引数の作り方」の#1）、
  生の値を渡せないことを確かめる対象がそもそも無い
- **列挙**（`Priority`）。`createPriority(value: string)` と生の値を受け、操作のパラメータも
  エラーのコンストラクタも自分では持たないので、上の3箇所に当たる引数が無い。
  **列挙の値を型で止める検査（上の4）は、その列挙を引数に取る側に置く。**
  `Task["status"]` を受け取る `TaskStatusMismatchError` の `expected` がそれで、
  検査はそれを定義した `Task.ts` の型のテスト（`Task.test-d.ts`）にある

参照実装では `Estimate` `Labels` `WorkPeriod` `Comment` `Project` `Task` と、エラー class を持つインターフェースの `TaskRepository` `TaskNumberIssuer` の8つに置いている（エラー class の型のテストは、そのエラーを定義したファイルの `Xxx.test-d.ts` に入れる）。
**止めるものが無いモデルに空の型テストを作らない。** 何も検査しないテストが増えるだけで、
`@ts-expect-error` が外れたことにも気づけなくなる。

```ts
// ✓ 生の値を止める（example/domain/entity/Task.test-d.ts）
const raw = "PROJ-1";
void new TaskStatusMismatchError(
	"Task.start",
	// @ts-expect-error 生の文字列は TaskId に代入できない
	raw,
	"backlog",
	"done",
);

// ✓ 別種の識別子を止める
const projectId = createDummyProjectId();
void new TaskStatusMismatchError(
	"Task.start",
	// @ts-expect-error ProjectId は TaskId に代入できない
	projectId,
	"backlog",
	"done",
);
```

---

## 到達しない分岐

カバレッジ（C1）から除外してよい分岐は、次の3区分だけである。確かめ方は `references/test-style-coverage.md` にある。
除外した分岐は、ファイルと行と区分を回答に書く。これ以外の未到達は観点の漏れとして扱う。

| 区分 | 例 |
|---|---|
| `FatalUnreachableError` を投げる分岐 | 業務操作の末尾の完成値スキーマ、原因が残っていない `create` の末尾（下の「`create` の末尾の種別」）、DTO の `to` の DTO スキーマ |
| 判別子を網羅した `switch` の `default` | DTO の `to` の組み立て |
| ハック無しではテストできない分岐 | 第1引数の項目がすべてブランド付きで、型の付いた呼び出しでは1段目の検査が必ず通るモデルの1段目（`Labels`）。到達させるには型アサーションが要る |

3つ目の `Labels` の1段目は、型の付いた呼び出しからは通らないが、**消してはいけない。**
型アサーションや `any` を経由した呼び出し、JavaScript からの呼び出しを境界で止める役割がある。

### `create` の末尾の種別

**`create` の末尾（完成値スキーマの `safeParse`）が投げる種別は、そこに着く原因が残っているかで決まる**
（`references/model-code.md` の「create の第1引数の作り方」、`references/errors.md`）。
入力は1段目で確かめ、生成器（`clock` / `idGenerator`）の戻り値は取った直後に確かめるので、残りうる原因は
「入力の値だけで違反しうる完成値スキーマの検査」だけである。

- **その検査が無いモデル**は、末尾に着く原因が残らないので `FatalUnreachableError` を投げる。
  1つ目の区分として除外してよい（`Estimate`・`Project`・`Task`・`Comment`）。
  `Task` の `superRefine` は着手・完了・コメントを見るが、`create` が組む `status: "backlog"`・`comments: []` では偽にならない
- **その検査があるモデル**は、末尾が入力の不正を判定する場所なので `InvalidCreationParamError` を投げる。テストで到達させる
  （`WorkPeriod` は `completedAt < startedAt`、`Labels` は11件の配列や重複で到達する）

```ts
// 原因が残らない（Estimate 型）。項目をまたぐ refine も件数も無い
const result = EstimateSchema.safeParse(input.data);
if (!result.success) { throw new FatalUnreachableError(…); }   // ← 除外してよい

// 入力で到達する（WorkPeriod 型）。完成値スキーマに横断の refine がある
const result = WorkPeriodSchema.safeParse(input.data);
if (!result.success) { throw new InvalidCreationParamError(…); }   // ← completedAt < startedAt で到達する。テストする
```

**コレクション（#3）は第1引数のスキーマが要素だけを検証し、件数・重複は完成値スキーマにしか無い。** そのため末尾が入力で到達する。
`Labels.create` に11件の配列を渡すと、1段目は通って末尾が落ちる（`example/domain/value-object/Labels.test.ts` にその異常系がある）。
**1段目を消してよいという話ではない。** 1段目は境界で `props` を検査する役割を持ち、
余剰キーや `null` を止める。理由は `references/model-code.md` の「create の第1引数の作り方」にある。
