# エラー

ユースケースが投げるエラー、その置き場、ドメインのエラーの扱い、`@throws` の書き方。
実物は `example/usecase/shared-errors.ts` と `example/usecase/CreateTaskUseCase.ts` の「エラー」セクション。

**プロジェクトにエラーの規則があれば、それに従う。** 既存のユースケースが `Result<T, E>` を返す、独自のエラー基底を持つ、のどちらかなら、そちらに合わせる。外してよいのは `references/checklist.md` の「既存の流儀で外せる規則」の表の範囲だけである（`DomainError` を継承しない、例外で投げる流儀なら呼び出し側が対処できる失敗を詰め替える、想定外を詰め替えない、`cause` を残す、は外せない）。既存の基底 class が `DomainError` を継承しているなら、それは使わずに `UseCaseError` を作り、そのことを回答に書く。
以下は定めが無い場合の既定である。

## 基底 class

ユースケースが投げるエラーは `UseCaseError` を継承する。`usecase/shared-errors.ts` に置く。

```ts
export abstract class UseCaseError extends Error {
	abstract override readonly name: string;

	/** 失敗した操作 */
	readonly operation: string;

	constructor(operation: string, message: string, options?: ErrorOptions) {
		super(`${operation}: ${message}`, options);
		this.operation = operation;
	}
}
```

**`DomainError` を継承しない。** `DomainError` はドメイン層が投げるエラーの基底で、ユースケースの失敗はドメインの規則ではない。
呼び出し側は、ドメインの失敗かユースケースの失敗かを基底 class で見分けられる。
`operation` は `"StartTaskUseCase.run"` の形にする。

## ユースケースが投げるエラー

**ユースケースが自分で投げるのは、ユースケースが失敗と決めたものだけである。**

| 失敗 | 例 |
|---|---|
| リポジトリが「無い」を返したのを失敗にする | `TaskRepository.get` が `undefined` を返した → `TaskNotFoundError` |
| ドメインサービスのインターフェースが返した値を失敗にする | 権限の確認が `false` を返した → 依頼に沿った名前のエラー |
| 呼び出し側が対処できる業務の異常系を、ドメインのエラーから詰め替える | `Task.start` が `TaskStatusMismatchError` を投げた → `TaskNotStartableError`（下の「ドメインのエラーの扱い」） |
| 入力の形の不正を、ドメインのエラーから詰め替える | `Task.create` が `InvalidCreationParamError` を投げた → `InvalidInputError`（下の「ドメインのエラーの扱い」） |

業務の規則に反したかどうかは、ドメインのメソッドが判定して投げる。ユースケースで同じ判定をしてエラーを投げない（判定をドメインに置く理由は `SKILL.md` の規則4）。
ユースケースは、ドメインが投げたエラーを受けて、呼び出し側に伝える異常系のパターンに詰め替えるだけである。

**何が起きたかを表す名前にし、失敗1つにつき class を1つ置く。** 対象の ID など、受け取る側が使う値をプロパティに持たせる。型はドメインの型（`TaskId`）にする。

```ts
export class TaskNotFoundError extends UseCaseError {
	override readonly name: string = "TaskNotFoundError";

	/** 指定されたタスクの ID */
	readonly taskId: TaskId;

	constructor(operation: string, taskId: TaskId) {
		super(operation, `タスク ${taskId} が見つかりません`);
		this.taskId = taskId;
	}
}
```

**ドメインのエラーから詰め替える class は、`cause` をドメインのエラーの型で受け取る。** 呼び出し側は `error.cause` を型付きで読める。まとめたなら union にする。
`override readonly cause` のフィールド宣言は、`super()` のあとで `cause` を `undefined` に定義し直す（`useDefineForClassFields`）。そのためコンストラクターで `this.cause = options.cause` と入れ直す。

```ts
export class TaskNotStartableError extends UseCaseError {
	override readonly name: string = "TaskNotStartableError";
	override readonly cause: TaskStatusMismatchError;

	/** 着手しようとしたタスクの ID */
	readonly taskId: TaskId;

	constructor(
		operation: string,
		taskId: TaskId,
		options: Readonly<{ cause: TaskStatusMismatchError }>,
	) {
		super(operation, `タスク ${taskId} に着手できません`, options);
		this.cause = options.cause;
		this.taskId = taskId;
	}
}
```

## 置き場

**エラー class は、その失敗を決めている持ち主のファイルに置く。import される箇所の数や、将来使いそうという予測では決めない。**

1. **1つのユースケースだけが投げるエラーは、そのユースケースのファイルの末尾の「エラー」セクションに置く**（`ProjectNotFoundError` は `CreateTaskUseCase.ts`）。`InvalidInputError` だけは、契約がユースケースに依らないので、はじめから `usecase/shared-errors.ts` に置く
2. **将来ほかのユースケースが使いそう、という予測では共有ファイルに置かない**
3. **2つ目のユースケースが同じ失敗を投げることになったら、共通の契約かを見直す。** 次の3つがすべて一致するなら、`usecase/shared-errors.ts` に移して1つの class にする
   - 失敗の条件（「指定された ID のタスクが無い」）
   - 呼び出し側に伝える意味
   - 持たせるプロパティ
4. **ユースケースのファイル同士でエラーを import しない。** 別のユースケースのファイルにあるエラーが要るなら、3 の見直しをする
5. **名前・HTTP ステータス・数値がたまたま同じというだけでは共有しない。** 閲覧の拒否と編集の拒否は、どちらも 403 になっても、権限の約束が別なら別の class にする

`TaskNotFoundError` は、Start・AddComment・Get の3つのユースケースが「指定された ID のタスクが無い」という同じ契約で投げるので、`usecase/shared-errors.ts` にある。
どのユースケースで起きたかは `operation` で分かるので、ユースケースごとに class を分けない。
同名の class を各ファイルに定義すると、`instanceof` が揃わず、呼び出し側は class の数だけ分岐を書くことになる。

`shared-errors.ts` に移したら、それまでの定義を消し、import しているテストも直す。

**ドメインやインターフェースが投げるエラーは、そのファイルに残す。** `TaskStatusMismatchError` は `Task.ts` にある。受け取るユースケースが増えても動かさない。

## ドメインのエラーの扱い

ドメインのメソッドや deps が投げるエラーを、**呼び出し側（props を渡した側）が対処できる失敗か**で分ける。対処とは、入力を直す・操作をやめる・別の操作をすることである。

| 分類 | 例 | 扱い |
|---|---|---|
| 呼び出し側が対処できる: 業務の異常系 | ドメインのメソッドが props か集約の状態から業務の規則で判定して投げるもの（状態の不一致 `TaskStatusMismatchError`、上限 `CommentLimitExceededError`、アーカイブ済み `TaskCreationOnArchivedProjectError`）。deps のインターフェースが契約に業務の失敗として書いたもの（採番の上限 `TaskNumberExhaustedError`） | 異常系のパターンごとのユースケースのエラーに詰め替える。元のエラーは `cause` に入れる |
| 呼び出し側が対処できる: 入力の形の不正 | props で `string` や `number` のまま受けて渡した値の形や範囲が不正なもの（`InvalidCreationParamError`、`Task.rename` の `InvalidTaskTitleError`、`TaskRepository.listByProject` の `ListLimitOutOfRangeError`） | 共有の `InvalidInputError` に詰め替える。元のエラーは `cause` に入れる |
| 呼び出し側には直せない（想定外） | deps が返した値が契約に反したもの（`InvalidClockValueError`、clock が作成より前を返した `TaskStartedBeforeCreationError`、採番が別のプロジェクトの ID を返した `TaskIdProjectMismatchError`、保存先の応答の形の不正 `InvalidTaskNumberResponseError`）、保存先の壊れ（`InvalidReconstructParamError`）、通信の失敗 | catch せず、そのまま伝播させる |

**判定の材料は、ドメインのエラーの JSDoc と `@throws` の説明である。** 「渡した値」「入力」が原因なら呼び出し側が対処できる。「clock」「idGenerator」「保存されている値」のような、deps が契約に反して返した値（形の不正、別のプロジェクトの ID など）が原因なら直せない。deps のインターフェースが `@throws` に業務の失敗として宣言したもの（採番の上限）は、deps が返した値に関わっても業務の異常系として詰め替える。
ドメインの JSDoc の「渡した」は、ドメインのメソッドの引数のことである。その引数の値を、ユースケースが props から取ったか deps（clock など）から取ったかで決める（`Task.start` の `at` は clock から取るので、`TaskStartedBeforeCreationError` は直せない）。
ドメインの共有のエラーは、JSDoc にどちらかを書いている（`InvalidCreationParamError` は「呼び出し側が入力を直せる」、`InvalidClockValueError` は直せない）。
同じ「日時の前後」の判定でも、比べる日時を呼び出し側が渡したなら対処できる失敗（渡した期限が集約の開始日時より前、渡した期限が clock の現在より前）で、clock が返した日時が原因なら直せない。
対処できる日時の判定は、ドメインの型で受けた値どうしや集約の状態との関係なので、業務の異常系（パターンごとの class）に詰め替える。`InvalidInputError` に詰め替えるのは、props で `string` や `number` のまま受けた値の形の不正だけである。
deps の実装（composition root の clock など）が、入力の形の不正と同じ class（`InvalidCreationParamError`）を投げないようにする（`references/usecase-code.md` の clock の実装）。
1つのドメインの呼び出しが、同じ class を props 由来の引数でも deps 由来の引数でも投げうるなら、詰め替えずに伝播させ、class を分けることをドメインに求める旨を回答に書く。

呼び出し側（UI 層）は、ユースケースのエラー（業務の異常系の class と `InvalidInputError`）の `instanceof` で分岐する。ドメインのエラーの class を知らなくて済む。
それ以外のエラーは想定外として、まとめて扱う（HTTP なら 500）。詰め替えずに届くので、スタックトレースと `operation` がそのまま残る。

**入力の形の不正は、`usecase/shared-errors.ts` の `InvalidInputError` に詰め替える。** どのユースケースでも「渡された入力が不正」という同じ契約なので、投げるユースケースが1つでも `usecase/shared-errors.ts` に置き、1つの class を共有する（上の「置き場」の例外）。
対象の ID のプロパティは持たない。どの入力がどう不正かは、`cause`（Zod の `issues` など）から読む。

```ts
export class InvalidInputError extends UseCaseError {
	override readonly name: string = "InvalidInputError";
	override readonly cause: DomainError;

	constructor(operation: string, options: Readonly<{ cause: DomainError }>) {
		super(operation, "渡された入力が不正です", options);
		this.cause = options.cause;
	}
}
```

**詰め替える単位は、ユースケースが呼び出し側に伝える異常系のパターンである。** ドメインのエラー1つにつき1つではない。
業務の異常系では、同じ意味の失敗になる複数のドメインのエラーを、1つのユースケースのエラーにまとめてよい。名前は、呼び出し側に伝える異常系を表す（`TaskNotStartableError`・`ProjectArchivedError`）。

**元のドメインのエラーは `cause` にそのまま入れる。** メッセージに写したり、プロパティを抜き出して捨てたりしない。
ドメインのエラーが持つプロパティ（`expected`・`actual` など）は、`cause` から読める。呼び出し側が分岐や表示に使う値（対象の ID など）は、ユースケースのエラーのプロパティにも持たせる。

**`try` は、詰め替えるエラーを投げる呼び出し1つだけを囲み（その引数を作る式、`deps.clock.now()` などは含めてよい）、詰め替える class を限定する。** それ以外は再 throw する。deps の呼び出し（採番など）が契約として投げる業務のエラーも、同じ形で詰め替える（`example/usecase/CreateTaskUseCase.ts`）。

```ts
let started: Task;
try {
	started = Task.start(task, { assigneeId: props.assigneeId, at: deps.clock.now() });
} catch (error) {
	if (error instanceof TaskStatusMismatchError) {
		throw new TaskNotStartableError("StartTaskUseCase.run", props.taskId, {
			cause: error,
		});
	}
	throw error;
}
```

- 複数の呼び出しを1つの `try` に入れない。どの呼び出しのエラーを詰め替えたかが読めなくなり、保存先の失敗を取り違えて詰め替えうる
- `catch (error)` で全部を1つのユースケースのエラーにしない。想定外のエラーまで呼び出し側が対処できる失敗に見え、不具合が隠れる
- 詰め替えたエラーの class を、ドメインの class の名前に寄せて作らない（`TaskStatusMismatchUseCaseError`）。呼び出し側に伝える異常系の名前にする

**既存のユースケースが `Result` で返す流儀なら、ドメインのエラーの扱いは既存に合わせる。** 既存がドメインのエラーを同じ class のまま `Result` の失敗に入れているなら、それに合わせる。例外で投げる流儀では、既存が詰め替えずに伝播させていても、呼び出し側が対処できる失敗は詰め替える。`Result` の失敗にどのエラーまで入れるか（想定外のエラーも入れるか）も既存に合わせる。同じ class のまま失敗に入れるのは詰め替えではない。

**ドメインのエラーを catch して握りつぶすのは、依頼がベストエフォートを求めたときだけにする。** そのときは次のようにする。

- **握りつぶす class を限定して catch し、それ以外は再 throw する。** `catch (error) { if (!(error instanceof 握りつぶすエラーの class)) throw error; }` の形にする。すべてを握りつぶすと、保存先の失敗や実装の不具合まで隠れる
- **握りつぶしたメソッドは新しい値を返さないので、その集約は直前の値のまま次の手順に進める。保存するのは、その集約で最後に成功したメソッドが返した値である。1つも成功しなかった集約は、取得した値のまま保存し直さない**（`references/usecase-code.md` の「保存と失敗」）
- **何を握りつぶすかを JSDoc と回答に書く。** その class が外へ伝播する経路が残らないなら `@throws` から除く
- **握りつぶしたことを呼び出し側に知らせるのは、依頼が求めたときだけにする。** 求めが無ければ戻り値の形を変えない（更新なら `void` のまま）

## `@throws`

`XxxUseCase` の型の `run` の JSDoc に `@throws` を書く。呼び出し側はこの型のホバーで、受け取りうるエラーを知る。

**書くもの:** ユースケースが自分で投げるエラーだけを書く。詰め替えたもの（`InvalidInputError` を含む）は、どのドメインのエラーを `cause` に入れるかも書く（`cause は TaskStatusMismatchError。`）。

**書かないもの:**
- 詰め替えたドメインのエラー。呼び出し側には届かない
- 想定外のエラー。ドメインの関数や deps が投げるものでも書かない。呼び出し側が分岐するものではなく、ドメインや deps の実装の変更で増減する
- `FatalUnreachableError`。呼び出し側に打つ手が無い

呼ぶドメインの関数や deps を足したり消したりしたら、詰め替えの `try` と `@throws` を見直す。

## 到達しない分岐

ドメインの約束から到達しないと言い切れる分岐（足したコメントが末尾に無い、など）は、ドメインの `FatalUnreachableError` を投げる。
ドメインに無ければ、`usecase/shared-errors.ts` に `Error` を継承した `FatalUnreachableError` を置く。呼び出し側が分岐する失敗ではないので、`UseCaseError` は継承しない。`UseCaseError` の継承とエラー class のテストの決まりは、この class には当てはめない。
`@throws` には書かない。呼び出し側の入力や外部の応答で到達しうる分岐には使わない。

## 呼び出し側の扱い

ユースケースは、エラーを HTTP ステータスや画面の表示に変換しない。それは UI 層の仕事である。
UI 層は具象の class の `instanceof` で扱いを決める。`name` やメッセージの文字列で判定させない。
