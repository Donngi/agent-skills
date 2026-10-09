# ユースケースのコードの書き方

ファイルの構成、Props・Deps・Result の書き方、手順の型ごとの書き方。実物は `example/usecase/`。

## 目次

- ファイルの構成
- 命名
- Props
- Deps
- Result
- 手順の型ごとの書き方
- 時刻と ID
- 任意プロパティ
- 保存と失敗
- やらないこと

---

## ファイルの構成

1ファイル1ユースケース。セクションは次の順に並べ、`// ----` の区切りと見出しを付ける。当たらないセクションは置かない。

| セクション | 置くもの |
|---|---|
| 型定義 | `XxxUseCaseProps`・`XxxUseCaseResult`・`XxxUseCase` |
| ファクトリー関数 | `XxxUseCaseDeps`・`createXxxUseCase` |
| Result DTO へのマッピング | ドメインモデルから Result への変換関数（参照のユースケースだけ）。export しない |
| エラー | そのユースケースだけが投げるエラー class（`references/errors.md`） |

`run` の中身は `createXxxUseCase` の中に `run: async (props) => { ... }` で書く。手順が長くなっても、手順ごとに関数を分けない。
**取得・NotFound の判定・保存の手順を、ユースケース間で共有する関数にしない。** 「取得して無ければ NotFound」も各ユースケースの `run` に書く。共有する関数を作ると、ユースケースを読むときにその関数を開かないと手順が分からず、1つのユースケースの都合で直すと、ほかのユースケースの手順も変わる。ユースケース間で共有してよいのは、エラー class（`references/errors.md`）である。
上から読めば手順の順に並んでいることが、ユースケースの読みやすさである。Result DTO へのマッピングだけは、手順ではなく形の変換なので関数に出す。

## 命名

| 対象 | 名前 |
|---|---|
| ユースケースの型 | `XxxUseCase`（`CreateTaskUseCase`）。`Xxx` は「動詞 + 対象」 |
| ファクトリー関数 | `createXxxUseCase` |
| `run` の引数の型 | `XxxUseCaseProps`。引数名は `props` |
| deps の型 | `XxxUseCaseDeps`。引数名は `deps` |
| 戻り値の型 | `XxxUseCaseResult`。戻り値が `void` なら作らない |
| 一覧の要素の型 | `XxxUseCaseResultItem`。`XxxUseCaseResult` はその配列の型（`readonly XxxUseCaseResultItem[]`） |
| 状態で共通する Result の補助の型 | `CommonXxxResult`（`Xxx` はモデル名。`CommonTaskResult`）。export しない |
| ファイル | `XxxUseCase.ts`、テストは `XxxUseCase.test.ts` |
| エラーの `operation` | `"XxxUseCase.run"` |

型はすべて `Readonly<{ ... }>` で書く。

## Props

**`run` の引数は `props` 1つにする。** 引数が1つしかなくても `{ taskId }` のオブジェクトで受け取る。
引数を増やしたときに呼び出し側の並びが壊れず、名前で渡すので取り違えない。

**プロパティはドメインの型で受け取る。** ID は `TaskId`、優先度は `Priority`、ラベルは `Labels` のように、ドメインが公開している型を使う。
ドメインのモデルが `string` のまま持つプロパティ（タイトル・本文など）は `string` で受け取り、検証はドメインの `create` やメソッドに任せる。
外から来た文字列を `TaskId.create` などで検証するのは UI 層の仕事である。ユースケースが `string` を受け取って中で `create` すると、
UI 層とユースケースのどちらが検証したのかが型から分からなくなり、二重に検証するか、どちらもしないかになる。

各プロパティに JSDoc で何を渡すかを書く（`/** 着手するタスクの ID */`）。

## Deps

**deps に置くのは、そのユースケースが使うものだけである。** 型はドメインが公開するインターフェース（`TaskRepository`・`TaskNumberIssuer`）で書く。
インフラ層の実装（`TaskRepositoryImpl`）を import しない。依存の向きが外向きになる。

`clock` と `idGenerator` は deps に型をその場で書く。

```ts
export type StartTaskUseCaseDeps = Readonly<{
	taskRepository: TaskRepository;
	clock: Readonly<{
		/** 現在のタイムスタンプを返す。前回より小さい値を返さない。 */
		now: () => Timestamp;
	}>;
}>;
```

**`clock.now()` はドメインの `Timestamp` を返す型にする。** ユースケースは時刻をドメインのメソッドの引数（`Task.start` の `at`）に渡すので、
ブランド付きの値が要る。`number` を返す型にすると、ユースケースの中で `Timestamp.create` を呼ぶことになり、
clock が返す値の検証と、その `@throws`（`InvalidCreationParamError`）をユースケースが背負う。
`Timestamp` を返す clock の実装は composition root で組み立てる。値の検証に失敗したら、clock が不正な値を返したことを表す `InvalidClockValueError` を投げる。
`now: () => Timestamp.create(Date.now())` とすると、失敗したときに `InvalidCreationParamError` が出る。ユースケースはこれを入力の形の不正として `InvalidInputError` に詰め替えるので、clock の不具合が入力の誤りに見えてしまう。

```ts
now: () => {
	const result = TimestampSchema.safeParse(Date.now());
	if (!result.success) {
		throw new InvalidClockValueError("SystemClock.now", result.error);
	}
	return result.data;
},
```

この実装は値を検証してブランドを付けるだけで、前回より小さい値を返さないことは保証しない。clock の型の JSDoc が前回より小さい値を返さないと約束するなら、実装の側で前回の値を下回らないようにする。
`Timestamp` は `number` に代入できるので、同じ clock をドメインの `create` の deps（`now: () => number`）にもそのまま渡せる。
clock を deps としてドメインに渡すだけのユースケース（`AddTaskCommentUseCase`）でも `Timestamp` を返す型にする。composition root が1つの clock を全部のユースケースに渡せる。

idGenerator は、ID の型が集約ごとに違うので、ドメインに合わせて書く。ドメインがブランド付きの ID を引数で受けるなら、`next` がその型を返す型にし、ブランドを付けるのは composition root にする。ドメインが deps で受けて中で検証するなら、ドメインの deps の型（`next: () => string`）に合わせる。

ドメインの `create` やメソッドが deps を受け取るなら、ユースケースは自分の deps から必要なものを渡す（`{ clock: deps.clock }`）。
ドメインの deps の型（`TaskDeps`）をユースケースの deps に丸ごと埋め込まない。ユースケースが何に依存しているかが、ドメインのファイルを開かないと読めなくなる。

## Result

| 手順 | 戻り値 |
|---|---|
| 参照する | プリミティブだけの Result DTO（`XxxUseCaseResult`） |
| 作る | 作ったものの ID など、呼び出し側が次に使う最小の値（`{ taskId: string }`） |
| 子エンティティを足す | 足した子の ID（`{ commentId: string }`）。更新が主の手順で、子を足すのが付随なら、依頼が子の ID を求めたときだけ返し、ほかは `void` |
| 更新する・削除する | `void` |

**ドメインモデルを返さない。** 返すと、UI 層がドメインモデルのメソッドを呼んだり、`reconstruct` で値を作り直したりできてしまう。
Result DTO のプロパティは `string`・`number`・`boolean`・リテラル型・それらの配列とオブジェクトで書く。ブランド付きの型を使わない。
ブランド付きの値は `string` や `number` に代入できるので、マッピングでは値をそのまま入れればよい。

**状態でプロパティが変わる集約は、Result も `status` の union にする。** 状態にないプロパティを `undefined` で埋めない（`example/usecase/GetTaskUseCase.ts`）。
状態に共通するプロパティは、export しない補助の型（`CommonTaskResult`）に出して、各状態の型と交差させてよい。
Result DTO をドメインモデルと同じ形にする必要はない。UI 層が使いやすい形にしてよい（`workPeriod.startedAt` を `startedAt` に平らにするなど）。

列挙のプロパティはリテラル型の union で書く（`"highest" | "high" | "medium" | "low" | "lowest"`）。
ドメインの列挙に、Result のリテラルに無い値が増えれば、マッピングの代入で型検査が止める。

配列は `[...task.labels]` や `map` で新しい配列にする。ドメインの配列をそのまま渡すと、UI 層がドメインモデルと同じ配列の参照を持つ。
要素がエンティティや値オブジェクトのオブジェクトなら、`map` でプロパティを写した新しいオブジェクトにする（`task.comments.map((c) => ({ id: c.id, ... }))`）。`[...task.comments]` では要素がドメインモデルのまま渡る。スプレッドだけで済むのは、要素がプリミティブ（ブランド付きの文字列を含む）の配列である。

## 手順の型ごとの書き方

### 集約を作る

`example/usecase/CreateTaskUseCase.ts`

1. 生成する側の集約を取得し、無ければ NotFound のエラーを投げる
2. 採番が要るなら、ドメインサービス（`TaskNumberIssuer.next`）で採番する
3. 生成する側の集約のメソッド（`Project.createTask`）で作る。生成の前提の判定（アーカイブ済みでないか）はそのメソッドが行う
4. 保存する
5. 作ったものの ID を返す

生成する側の集約が無いモデルなら、1 を飛ばし、生成の入口がほかに決まっていない集約の `create` で作る。前提の集約の取得を足さない。

**生成の入口がドメインで決まっているなら、それを通す。** `Task.create` を直接呼ばず `Project.createTask` を呼ぶ。直接呼ぶと、生成の前提の判定をすり抜ける。
採番をドメインのメソッドより前に行うと、メソッドが失敗したときに番号が欠番になる。ドメインが欠番を許すなら、JSDoc にそのことを書く。許さないなら、採番の取り消しや、保存と同時の採番がリポジトリやドメインサービスの契約に要るので、回答で示す。

### 集約を更新する

`example/usecase/StartTaskUseCase.ts`

1. 集約を取得し、無ければ NotFound のエラーを投げる
2. 集約のメソッド（`Task.start`）を呼ぶ。状態の判定はメソッドが行う
3. メソッドが返した新しい値を保存する

ドメインのメソッドは元の値を変えずに新しい値を返す。保存するのは戻り値である。

### 子エンティティを足す

`example/usecase/AddTaskCommentUseCase.ts`

集約ルートのメソッド（`Task.addComment`）に deps を渡して足す。子の ID と作成時刻は、そのメソッドが deps から決める。
子エンティティの `create`（`Comment.create`）を直接呼ばない。子は集約ルートを通して作るのがドメインの約束で、直接作ると件数の上限などの判定をすり抜ける。

足した子の ID を返すなら、ドメインが約束する並び（コメントは投稿順で末尾に足される）から取り出す。取り出せない分岐は到達しないので `FatalUnreachableError` にする。

### 参照する

`example/usecase/GetTaskUseCase.ts`

1. 集約を取得し、無ければ NotFound のエラーを投げる
2. Result DTO にマッピングして返す

マッピングは `toXxxUseCaseResult` のような関数に出す。状態で分かれるなら `switch (task.status)` で全ケースを書く。
`default` を書かずに全ケースを返すと、状態が増えたときに `noImplicitReturns` と戻り値の型で検出できる。

一覧の参照も同じ形である。Result は `type XxxUseCaseResult = readonly XxxUseCaseResultItem[]` のように `readonly` の配列の型にし、要素の型を `Readonly<{ ... }>` で書く。ただし、取得が0件でも NotFound にせず空の配列を返す。NotFound にするのは1件取得だけである。件数の上限や並び順はリポジトリのメソッドの約束に従い、ユースケースで並べ替えたり絞り込んだりしない。
絞り込みが要るなら、リポジトリに要るメソッドを回答に示す。

## 時刻と ID

**ドメインのメソッドが、その操作が起きた時刻を引数で受け取るなら、ユースケースが `deps.clock.now()` で渡す。** 出来事がいつ起きたかを決めるのは、リクエストを受けたユースケースである（`Task.start` の `at`）。
期限や予定日時のように、呼び出し側が決める日時は props で受けてそのまま渡す。`deps.clock.now()` で置き換えない。
**ドメインの `create` やメソッドが deps で clock や idGenerator を受け取るなら、ユースケースは自分の deps から渡す。** 時刻や ID を先に取ってから引数で渡さない。
**採番がドメインサービス（`TaskNumberIssuer.next`）なら、それを deps から呼んで ID を得る。**

`Date.now()`・`new Date()`・`crypto.randomUUID()` をユースケースの中で直接呼ばない。テストで値を固定できなくなる。

## 任意プロパティ

ドメインの `create` やメソッドに任意プロパティを渡すときは、値があるときだけプロパティを置く。

```ts
...(props.pullRequestUrl !== undefined
	? { pullRequestUrl: props.pullRequestUrl }
	: {}),
```

`pullRequestUrl: props.pullRequestUrl` と書くと、値が無いときに `undefined` のプロパティが残る。
ドメインのスキーマが `.exactOptional()` なら検証で落ちる。`exactOptionalPropertyTypes` が無効なプロジェクトでは型検査も止めない。
Result DTO を組み立てるときも同じ書き方にする。

## 保存と失敗

**保存の前に、ドメインのメソッドをすべて呼び終える。依頼が握りつぶすことを求めたメソッドが指定のエラーを投げたときも、すべてのメソッドを呼び終えてから保存する。握りつぶしたメソッドは新しい値を返さないので、その集約は直前の値のまま次の手順に進める。保存するのは、その集約で最後に成功したメソッドが返した値である。1つも成功しなかった集約は、取得した値のまま保存し直さない。** 取得 → メソッド → 保存の順にすれば、メソッドが投げたときには何も保存されていない。複数の集約を更新するときも、1つ目の保存のあとに2つ目のメソッドを呼ばない。握りつぶしの書き方は `references/errors.md` の「ドメインのエラーの扱い」にある。
テストでは、握りつぶさないエラーで保存の前にユースケースが終わるとき（NotFound・ドメインのメソッドのエラー）に、保存のメソッドが呼ばれていないことを確かめる（`references/testing.md`）。

**ユースケースが原子性を保証しない操作は、JSDoc に書く。**

| 起きること | 例 | 書き方 |
|---|---|---|
| 採番のあとで失敗すると番号が欠番になる | `CreateTaskUseCase` | `採番に成功したあとで失敗すると、その番号は欠番になる。` |
| 同時に更新すると後から保存したほうが残る | `StartTaskUseCase`（`TaskRepository.put` が同時更新を検出しない） | `同じタスクを並行して更新すると、後から保存したほうが残る（TaskRepository.put）。` |
| 2つの集約を順に保存し、2つ目で失敗すると1つ目は保存済みで残る | — | どちらが保存済みで残るかを書く。失敗した保存の結果は、リポジトリの約束に無ければ断定しない |

**トランザクションの仕組みを、依頼も既存の仕組みも無いのに足さない。** 原子性が要るなら、リポジトリやドメインサービスのインターフェースに要るものを回答に示す。
同時更新の検出（楽観ロック）もリポジトリの約束である。ユースケースで読み直して比べるような代わりの実装をしない。

## やらないこと

| やらないこと | 代わりに |
|---|---|
| ユースケースに業務の判定の `if` を書く | ドメインのメソッドに置く。無ければ回答で示す |
| `reconstruct` を呼ぶ | `create` とドメインのメソッドで作る。`reconstruct` は保存先から読んだ値の復元専用 |
| スプレッドやリテラルでドメインの値を作る（`{ ...task, title }`） | ドメインのメソッド（`Task.rename`）を呼ぶ |
| 子エンティティの `create` を直接呼ぶ | 集約ルートのメソッドを呼ぶ |
| 想定外のエラーを catch して詰め替える・`catch (error)` で全部を1つのエラーにする・元のエラーを `cause` に入れずに詰め替える | 呼び出し側が対処できる失敗だけを、class を限定して詰め替え、`cause` に入れる。ほかは伝播させる（`references/errors.md`） |
| ドメインのエラーを catch して握りつぶす | 依頼がベストエフォートを求めているときだけ。そのときは何を握りつぶしたかを JSDoc と回答に書く |
| ドメインモデルを返す | Result DTO か ID を返す |
| ログ・リトライ・計測を足す | 依頼かプロジェクトの規約があるときだけ |
| ほかのユースケースを呼ぶ | 共通の手順が要るなら、それはドメインのメソッドかドメインサービスに置くべきものか確かめる |
