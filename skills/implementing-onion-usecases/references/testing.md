# テスト

ユースケースのテストで確かめることと書き方。実物は `example/usecase/*.test.ts`。

**プロジェクトに既存のテストの流儀があれば、それに合わせる。** 外してよいのは `references/checklist.md` の「既存の流儀で外せる規則」の表のうちテストに関わる行（置き場・命名・テストの書式・エラーの返し方・ユースケースのエラーの基底 class と置き場）の範囲だけで、確かめる観点（保存するもの・詰め替えと `cause`・保存を呼ばないことなど）は外さない。 以下は定めが無い場合の既定で、Vitest を前提にする。

## 確かめること

ユースケースのテストは、**手順の組み立て**を確かめる。ドメインの判定そのもの（どの状態なら着手できるか）はドメインのテストが確かめているので、ユースケースのテストで網羅し直さない。

| 観点 | 確かめること | 例 |
|---|---|---|
| 正常系: 保存するもの | 保存のメソッドに渡した値が、期待するドメインの値と一致する | `Task.start` した Task が `put` に渡る |
| 正常系: 戻り値 | Result DTO や ID が期待する値と一致する | `{ taskId: "PROJ-7" }` が返る |
| 正常系: 足した子の ID（子エンティティを足すとき） | 子を1件以上持つ集約に足しても、足した子の ID が返る。子が無い集約だけで確かめると、取り出す位置の誤りを見逃す。idGenerator は呼ぶたびに違う値を返すモックにし、返った ID と保存した子の ID が同じことを確かめる（ユースケースが idGenerator を自分でもう一度呼ぶ誤りを見つける） | Comment を1件持つ Task に足して、保存した Comment の ID が返る |
| 正常系: 一覧（一覧を返す参照） | リポジトリが返した順のまま返り（2件以上で確かめる）、空なら空の配列が返る | 0件のとき `[]` が返る |
| 正常系: deps の値の使い方 | `clock.now()` や `idGenerator` の値が、ドメインに渡って保存される | 着手時刻が `clock.now()` の値になる |
| 異常系: 見つからない | NotFound のエラーが発生し、保存のメソッドを呼ばない | `TaskNotFoundError` が発生し、`put` が呼ばれない |
| 異常系: 詰め替え | 想定する異常系ごとに、ユースケースのエラーが発生する。保存の前に起きる異常系なら、保存のメソッドを呼ばない（保存そのものが業務のエラーを投げるなら、そのあとの手順を呼ばない） | `TaskNotStartableError` が発生し、`put` が呼ばれない |
| 異常系: 詰め替えの `cause` | ユースケースのエラーの `cause` に、元のドメインのエラーが入る | `cause` が `TaskStatusMismatchError` |
| 異常系: 想定外のエラーの伝播 | 詰め替えないドメインのエラーがそのままの class で発生し、保存のメソッドを呼ばない | `TaskStartedBeforeCreationError` が発生し、`put` が呼ばれない |
| 異常系: 手前で止まること | 保存の前に失敗したら、その後の deps を呼ばない | Project が無ければ採番しない |
| 正常系: 握りつぶし（依頼がベストエフォートを求めたときだけ） | 指定したエラーのときも、ほかのメソッドが返した新しい値は保存され、どのメソッドも成功しなかった集約は保存されない | 指定したエラーのときも、ほかの集約は保存される |
| 異常系: 握りつぶさないエラー（依頼がベストエフォートを求めたときだけ） | 指定外のエラーはそのまま発生する | 指定外のドメインのエラーが発生する |
| 正常系: エラー class | ユースケースのエラー class のインスタンス・プロパティ・`name` | `TaskNotFoundError` |

**詰め替えは、想定する異常系ごと（ユースケースのエラーの class ごと）に確かめる。** 呼び出し側が分岐する単位なので、1つでも抜けると分岐が壊れる。複数のドメインのエラーを1つの class にまとめたときは、まとめたドメインのエラーの class ごとに1件ずつ確かめる。`instanceof` の並びから1つ抜けても、ほかの入力のテストでは見つからない。`cause` は `rejects.toMatchObject({ cause: expect.any(ドメインのエラーの class) })` で class を見る。元のエラーのプロパティ（`{ cause: { expected: "backlog" } }`）も見てよい。deps のモックが投げるエラーなら、そのインスタンスを変数に持ち、`rejects.toSatisfy((error) => error instanceof 詰め替えた class && error.cause === そのインスタンス)` で、作り直していないことまで確かめる。
**想定外のエラーの伝播は、`try` ごとに、そこで詰め替えないエラーを1つ選んで確かめれば足りる。** 詰め替えを広げすぎていないことを確かめるのが目的で、ドメインの判定の網羅ではない。deps の呼び出し（採番など）を `try` で囲んで詰め替えるなら、その deps が投げる想定外のエラー（通信の失敗など）が、そのまま発生することを1つ確かめる（`example/usecase/CreateTaskUseCase.test.ts`）。
**Result DTO のマッピングは、状態ごとにテーブル駆動で確かめる。** 任意プロパティが無いときにキーごと無いことも確かめる。配列のプロパティは、ドメインの配列そのものでないこと（`expect(result.labels).not.toBe(task.labels)`）も確かめる。要素がエンティティなら、要素もドメインのものでないこと（`expect(result.comments[0]).not.toBe(task.comments[0])`）を確かめる。

deps のインターフェースが投げる想定外の例外（リポジトリの失敗）は、`try` で囲まない呼び出しなら、詰め替えず伝播させるだけなので、ユースケースごとには確かめない。
保存を `await` し忘れても、即座に成功するモックではテストが通る。`await` 忘れは linter（`@typescript-eslint/no-floating-promises`、Biome の `noFloatingPromises`。どちらも型情報が要り、設定で有効にする）で止める。
2つ以上の集約を保存するユースケースで、2つ目の保存の失敗で何が残るかを確かめるとき（確かめるかは任意）だけは、保存のメソッドを `mockRejectedValueOnce` で失敗させる（下の「呼ばれていないことは `not.toHaveBeenCalled()` で確かめる」の段落）。

## deps のモック

**deps は `vi.fn()` で作り、テストの Given に書く。** モックを作る関数をヘルパーに置かない。どんな値を返すかがテストの本質である。

```ts
const mockGet = vi.fn();
mockGet.mockResolvedValueOnce(createDummyBacklogTask());
const mockPut = vi.fn();
mockPut.mockResolvedValueOnce(undefined);
const usecase = createStartTaskUseCase({
	taskRepository: { get: mockGet, listByProject: vi.fn(), put: mockPut },
	clock: { now: () => createDummyTimestamp(5_000) },
});
```

- **モックの変数名は `mock` から始める**（`mockGet`・`mockPut`・`mockNext`）
- **`vi.fn()` に型引数を付けない。** そのまま deps のインターフェースに渡せる。`as` を書かない
- 使わないメソッドも、インターフェースを満たすために `vi.fn()` で埋める（`listByProject: vi.fn()`）
- 応答は `mockResolvedValueOnce`、失敗は `mockRejectedValueOnce` で与える
- clock と idGenerator は固定の値を返す関数にする（`{ now: () => createDummyTimestamp(5_000) }`）。足した子の ID を確かめるテストの idGenerator だけは、呼ぶたびに違う値を返すモックにする（上の表の「足した子の ID」）
- ドメインの値は、ドメインのダミー生成ヘルパー（`createDummyBacklogTask`・`createDummyTaskId`）で作る

**保存するものや戻り値を比べる正常系では、保存するものや戻り値に流れる props の値を、ダミー生成ヘルパーの既定値やほかのプロパティの値と違うものにする。** 同じ値だと、プロパティを取り違えた実装（`creatorId` に `project.leadId` を入れるなど）でもテストが通る。
リポジトリやドメインサービスに渡す引数（件数・ID）が結果を変えるなら、`toHaveBeenCalledWith` で確かめる。モックは引数を見ずに値を返すので、保存したものだけでは取り違えが分からない。

**保存したものは `mockPut.mock.calls[0]?.[0]` を、期待するドメインの値と `toStrictEqual` で比べる。** 期待値はヘルパーで作る（`createDummyInProgressTask({ startedAt: 5_000 })`）。戻り値（Result DTO や作った ID）はプリミティブだけなので、期待値をリテラルで書いてよい。
リポジトリごとに保存が1回のユースケースは、正常系のいずれか1つで `expect(mockPut).toHaveBeenCalledTimes(1)` も確かめる。2回目の保存で古い値を上書きする誤りは、1回目の引数だけでは見つからない。2回以上保存するなら、呼び出しの並び全体（`mock.calls`）を確かめる。
期待値をテスト対象と同じドメインのメソッドで作らない（`Task.start(task, ...)` の戻り値と比べない）。期待値と実装が同じ誤り（渡す引数の取り違えなど）を共有し、テストが誤りを見逃す。

**呼ばれていないことは `not.toHaveBeenCalled()` で確かめる。** 保存を呼ばないことを確かめるのは、握りつぶさないエラーで保存の前にユースケースが終わるとき（NotFound・ドメインのメソッドのエラー）である。2つ目の保存の失敗を確かめるなら、1つ目が保存済みで残るので、何が保存されたかを実際の保存順のとおりに確かめる。

## 置き場と命名

- テストは対象の横に `XxxUseCase.test.ts` で置く
- `describe` はユースケースごとに `describe("XxxUseCase.run")` を1つ立てる。エラー class は class ごとに `describe("TaskNotFoundError")` を立て、ファイルの末尾に置く
- `usecase/shared-errors.ts` のエラー class のテストは `usecase/shared-errors.test.ts` に置く
- `test` を使い、`it` は使わない
- テスト名は `正常系: ` `異常系: ` で始め、「条件なら結果」を述語で終える（`異常系: Task が無ければ TaskNotFoundError が発生し、保存しない`）
- 失敗を確かめるテストの名前には、エラーの class 名を入れる。モックが投げる素の `Error`（保存先の失敗など）なら `Error` と入れる（`異常系: TaskNumberIssuer が想定外の Error を投げたら、その Error がそのまま発生し、保存しない`）
- `describe` の中は正常系 → 異常系の順に並べる

## Given / When / Then

すべてのテストに `// Given: 説明` `// When: 説明` `// Then: 説明` をこの順で書き、セクションを空行で区切る。
Given から Then までを続けて読むと1つの文になるように書く。

| セクション | 置くもの | 説明の終わり |
|---|---|---|
| Given | deps のモックとユースケースの組み立て | 「〜で」「〜があるとき」 |
| When | `run` の呼び出し | 「〜すると」「〜を始めると」 |
| Then | 検証 | 「〜が保存される」「〜が返される」「〜が発生する」 |

**失敗を確かめるときは、When で Promise を受け取り、Then で `await` する。**

```ts
// When: 着手を始めると
const pending = usecase.run({ taskId: createDummyTaskId(), assigneeId: createDummyUserId() });

// Then: TaskNotFoundError が発生し、保存は呼ばれない
await expect(pending).rejects.toThrow(TaskNotFoundError);
expect(mockPut).not.toHaveBeenCalled();
```

`rejects` は必ず `await` する。

## 1つのテストで確かめること

1つのテストは、1つの前提で1つの契約を確かめる。

| まとめてよい | 分ける |
|---|---|
| エラーが発生することと、そのとき保存しないこと | 保存するもの / 戻り値（独立に変わりうる） |
| 保存した Task 全体の一致 | 状態ごとの Result（テーブル駆動にする） |

## assertion の選び方

| 確かめたいこと | 使う | 使わない |
|---|---|---|
| エラーの種別 | `rejects.toThrow(具象の class)` | `toThrow()`、`toThrow(Error)`、`toThrow(UseCaseError)`、`toThrow(DomainError)` |
| オブジェクトの一致 | `toStrictEqual` | `toEqual`（`undefined` のプロパティを見逃す） |
| エラーのプロパティ | `toMatchObject`（operation と渡した値だけを部分一致で見る） | `toStrictEqual`（`message` や `cause` まで比べることになり、渡した値だけを見る意図が読めなくなる） |
| キーが無いこと | `expect("pullRequestUrl" in result).toBe(false)` | `toBeUndefined()` |
| 呼ばれていないこと | `not.toHaveBeenCalled()` | 手書きのカウンタ |

## エラー class のテスト

ユースケースのエラー class ごとに、次の3つを確かめる（`example/usecase/shared-errors.test.ts`）。

- `UseCaseError` かつ `Error` のインスタンスになる
- `operation` と、対象の ID などのプロパティが、渡した値のまま残る。詰め替える class なら、`cause` が渡したエラーそのもの（`toBe`）になる
- `name` が class 名と同じになる
