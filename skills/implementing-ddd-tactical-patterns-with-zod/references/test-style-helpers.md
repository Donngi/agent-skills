# テストの書き方: ダミー生成ヘルパー

`references/test-style.md` の規則（置き場と命名、Given / When / Then など）に加えて読む。**何を確かめるか**は `references/testing.md` にある。

---

## ダミー生成ヘルパー

テストの本質ではないが、組み立てないと対象を呼べない値がある。
それを毎回書かないために、**モデルごとに `Xxx.helper.test.ts` を置き、既定値の入った値を返す関数を公開する。**

**値オブジェクトとエンティティのすべてに、例外なく置く。** DTO、エラー定義、インターフェース、インターフェースの実装には置かない。

### 何を通して作るか

**ダミーの完成値は `reconstruct` で作る。**

- `reconstruct` は完成値スキーマで不変条件をすべて検証するので、作った値は必ず制約を満たす値になる
- どの状態の値でも直接作れて、全項目を上書きできる
- 上書きする値を生の値で書ける。入れ子の値オブジェクトを組み立て直さなくてよい
- `create` や遷移関数で作ると、ダミーがテスト対象の操作に依存する。`Task.start` が壊れると、
  `start` と関係ない `addComment` や DTO のテストまで落ちる。採番やクロックから来る項目も自由に決められない
- `create` と遷移関数だけが守っているのは「直前の状態との関係」（遷移の前提条件）で、
  1つの値が制約を満たすかどうかではない。`reconstruct` で作った値も、保存されうる制約を満たす値である

| 関数 | 返すもの | 作り方 | 使う場面 |
|---|---|---|---|
| `createDummyXxx` | 完成値 | `Xxx.reconstruct` | 対象操作に渡す値、期待値 |
| `createDummy<状態>Xxx` | 状態別ユニオンの、その状態の完成値 | `Xxx.reconstruct` | 同上 |
| `createDummyCreateXxxProps` | `create` の第1引数 | 項目ごとに値オブジェクトのヘルパーを呼んだリテラル | `create` のテスト |
| `createDummyXxxDeps` | 固定値を返す依存 | 定数を返す関数を持つリテラル | `create` のテスト |

**`create` は、`create` 自体がテストの対象のときにだけ、テストの When で直接呼ぶ。** そのテストでは `create` の第1引数が本質である。
確かめる項目は `createDummyCreateTaskProps({ title: "" })` のように引数で明示し、テストに関係しない残りの項目だけをヘルパーの既定値で埋める。
依存も同じで、確かめるもの（呼び出しを記録する IDジェネレーターなど）は明示して渡し、関係しないものだけを `createDummyXxxDeps` の既定値に任せる。

**`reconstruct` 自身のテストでは、期待値にヘルパーを使わない。** `createDummyXxx` は
`Xxx.reconstruct` で作るので、`reconstruct` の結果を `createDummyXxx()` と比べると
**検査対象で期待値を作る循環になり、`reconstruct` が何を返しても一致する。**
このテストでは期待値を仕様から書き下ろす。他のモデルのテストで `Xxx` の完成値が要るときは、
検査対象ではないのでヘルパーでよい。

```ts
// ✗ 期待値を reconstruct で作っている（createDummyEstimate の中身が reconstruct）
expect(Estimate.reconstruct({ amount: 3, unit: "point" })).toStrictEqual(
	createDummyEstimate({ amount: 3, unit: "point" }),
);

// ✓ 期待値は項目ごとに確かめる
const result = Estimate.reconstruct({ amount: 3, unit: "point" });
expect(result.amount).toBe(3);
expect(result.unit).toBe("point");
```

**DTO はヘルパーにせず、テストの Given に仕様から書き下ろす。** テストファイルの中にもダミーを作る関数を置かない。
`to` の出力から作らない。`to` の出力で `from` を確かめると、両方で同じ取り違えをした実装が通る。
保存キーも仕様どおりに文字列で書く。1つのテストの中で一部だけを変えるなら、そのテストで書き下ろした値をスプレッドして上書きしてよい。

### 引数の形

**引数は、既定値を上書きしたい項目だけを入れる1つのパラメータオブジェクトにする。**
渡した項目が既定値を上書きする。上書きは浅い。入れ子や配列は値ごと渡す。

**完成値が1つの値（プリミティブや配列）のモデルだけは、パラメータオブジェクトにしない。**
その値を任意の引数で受ける。`createDummyProjectId({ value: "PROJ" })` と書かせても情報が増えない。

| モデル | 引数 |
|---|---|
| 1つの値（`ProjectId`、`Priority`、`Labels`） | 生の値。既定値付き（`value = "PROJ"`） |
| 複数の項目（`Estimate`、`Comment`） | `Partial<XxxSchemaInput>` |
| 状態別ユニオン（`Task`） | `Partial<Omit<Extract<TaskSchemaInput, { status: "…" }>, "status">>` |
| `create` の第1引数 | `Partial<CreateXxxProps>` |
| 依存 | `Partial<XxxDeps>` |

**完成値のヘルパーの上書きは生の値のままである。`create` の第1引数がブランド付きでも、そちらに合わせない。**
完成値のヘルパーは `reconstruct` を通すので、引数の型は `reconstruct` が受ける `XxxSchemaInput` に従う。
`createDummyWorkPeriod({ startedAt: 1_000 })` と書けて、`Timestamp.create(1_000)` を書かずに済む。
ブランド付きを渡すのは、`create` の第1引数を作る `createDummyCreateXxxProps` のほうである。

状態別ユニオンの上書きに `Partial<TaskSchemaInput>` を使わない。ユニオンの `Partial` をスプレッドすると
`status` がユニオンに広がり、どの枝にも代入できず TS2345 になる（実測）。状態ごとに関数を分ける。

```ts
// Task.helper.test.ts
import { createDummyLabels } from "../value-object/Labels.helper.test";
import { createDummyTaskId } from "../value-object/TaskId.helper.test";
import { createDummyUserId } from "../value-object/UserId.helper.test";
import {
	type CreateTaskProps,
	Task,
	type TaskDeps,
	type TaskSchemaInput,
} from "./Task";

type BacklogTaskSchemaInput = Extract<TaskSchemaInput, { status: "backlog" }>;

export function createDummyBacklogTask(
	params: Partial<Omit<BacklogTaskSchemaInput, "status">> = {},
): Task {
	return Task.reconstruct({
		id: "PROJ-1",
		title: "ダミーの表題",
		priority: "medium",
		labels: [],
		creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
		createdAt: 1_000,
		comments: [],
		...params,
		status: "backlog",
	});
}

export function createDummyCreateTaskProps(
	params: Partial<CreateTaskProps> = {},
): CreateTaskProps {
	return {
		id: createDummyTaskId(),
		title: "ダミーの表題",
		priority: "medium",
		labels: createDummyLabels(),
		creatorId: createDummyUserId(),
		...params,
	};
}

export function createDummyTaskDeps(params: Partial<TaskDeps> = {}): TaskDeps {
	return {
		clock: { now: () => 1_000 },
		...params,
	};
}
```

```ts
// ProjectId.helper.test.ts
import { ProjectId } from "./ProjectId";

export function createDummyProjectId(value = "PROJ"): ProjectId {
	return ProjectId.reconstruct(value);
}
```

守ること。

- **生成したあとでスプレッドして項目を差し替えない。** 検証を通っていない値ができる。上書きは引数で渡す
- **`as` で型を合わせない。**
- **関係する項目を黙って補正しない。** `startedAt` だけを `createdAt` より前にしたら、`reconstruct` が失敗してよい。
  上書きする側が整合する値を渡す
- **呼び出し回数を確かめる依存はヘルパーに置かない。** 呼ばれないことがテストの本質なので、
  テストの Given で `vi.fn` を作って渡す
- **ヘルパー自身のテストは書かない。** 壊れれば、使っているテストが落ちる

```ts
describe("Comment.create", () => {
	test("異常系: 本文が空なら IDジェネレーターを呼ばない", () => {
		// Given: 本文が空の入力と、呼び出しを記録する IDジェネレーターで
		const props = createDummyCreateCommentProps({ body: "" });
		const mockNext = vi.fn(() => "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f");
		const deps = createDummyCommentDeps({ idGenerator: { next: mockNext } });

		// When: Comment の生成を試みると
		try {
			Comment.create(props, deps);
		} catch {
			// 失敗の種別は「異常系: 本文が空なら InvalidCreationParamError が発生する」のテストで確かめる
		}

		// Then: その IDジェネレーターは呼ばれていない
		expect(mockNext).not.toHaveBeenCalled();
	});
});
```
