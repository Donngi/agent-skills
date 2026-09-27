# エラー

エラーの種別・投げる場所・メッセージ・エラー class の書き方の規則。
実物は `example/domain/shared-errors.ts`（共有の5つ）と、各モデルのファイルの「エラー」セクション（`example/domain/entity/Task.ts` など）。

**プロジェクトにエラーの規則があれば、それに従う。** 実装前に `CLAUDE.md`、`docs/`、既存のドメイン層を確認する。
`Result<T, E>` を返す方針、独自のエラー基底、エラーコード体系のどれかが見つかったら、そちらを優先する。
以下は定めが無い場合の既定である。

**エラーの class は、その失敗を定める規則・約束の持ち主のファイルに置く。** 使う箇所の数で置き場を決めない。

- **共有のファイル `domain/shared-errors.ts` に置くのは、基底と、失敗の意味がモデルに依らない5つだけ**である:
  `DomainError`・`InvalidCreationParamError`・`InvalidReconstructParamError`・`InvalidClockValueError`・`FatalUnreachableError`。
  **共有のファイルはどのモデルの型も import しない**（`import type * as z from "zod"` だけ）。モデルの型を持つ項目が要る class は、共有のファイルに置けない
- 特定のモデルの業務の規則を表す class は、そのモデルのファイルの「エラー」セクション（「公開 API」の1つ上）に置く（`TaskStatusMismatchError` は `Task.ts`）
- 特定のインターフェースの約束（そのインターフェースが `@throws` で宣言する失敗）を表す class は、そのインターフェースのファイルに置く（`ListLimitOutOfRangeError` は `TaskRepository.ts`、`InvalidTaskNumberResponseError` と `TaskNumberExhaustedError` は `TaskNumberIssuer.ts`）
- 依存が返した識別子の不正は、**識別子の型ごとに class を分け**、その値を確かめる `create` のあるモデルのファイルに置く（`InvalidGeneratedCommentIdError` は `Comment.ts`）。時計が返す値は型が1つ（`Timestamp`）なので、共有の `InvalidClockValueError` 1つで足りる
- 名前付きで export する。モデルの公開 API のオブジェクトには入れない（`Task.StatusMismatchError` のようにしない）。別のファイルから再 export しない。受け取る側は、定義したファイルから import する
- **モデルは class で書かないが、エラーの class はモデルのファイルに置いてよい。** `Error` の継承と `instanceof` のために class が要るのはエラーだけで、エラーはそのモデルの契約の一部だからである

| 種別 | 投げる場所 | 意味 |
|------|-----------|------|
| `InvalidCreationParamError` | `create` の検証 | 渡された値が不正。呼び出し側が直せる |
| `InvalidReconstructParamError` | `reconstruct` と DTO の `from` の検証 | 保存されている値が壊れている。呼び出し側には直せない |

**既定はこの2つだけ。** どちらも「渡された値が形を満たさなかった」という同じ失敗で、
`create` と `reconstruct` のどちらで起きたかによって呼び出し側の打つ手が変わるので分けている。

**それ以外の失敗には、何が起きたかを表す名前の class を足す。**
`PreconditionError` のような包括的な名前を既定に置かない。置くと、性質の違う失敗が全部そこに集まり、
受け取る側は結局メッセージを読むことになる。参照実装では次を足している。

| 種別 | 何が起きたか | 置き場 |
|------|-------------|------|
| `TaskStatusMismatchError` | その操作を許さない状態のタスクに対して処理を実行しようとした | `Task.ts` |
| `TaskStartedBeforeCreationError` | 着手のタイムスタンプに、タスクの作成より前の値を渡した | `Task.ts` |
| `TaskCompletedBeforeStartError` | 完了のタイムスタンプに、着手より前の値を渡した | `Task.ts` |
| `InvalidTaskTitleError` | 表題を書き換える操作に、表題の形を満たさない値を渡した | `Task.ts` |
| `InvalidClockValueError` | `create` の中で、クロックが返した値がタイムスタンプとして不正だった | `shared-errors.ts` |
| `InvalidGeneratedCommentIdError` | `create` の中で、IDジェネレーターが返した値がコメントの識別子として不正だった | `Comment.ts` |
| `CommentPostedBeforePreviousCommentError` | コメントの投稿のタイムスタンプとしてクロックが返した値が、直前のコメントより前だった | `Task.ts` |
| `CommentPostedBeforeTaskCreationError` | コメントの投稿のタイムスタンプとしてクロックが返した値が、タスクの作成より前だった | `Task.ts` |
| `DuplicateCommentError` | 追加するコメントとして採番した識別子が、すでに追加されているコメントと重複した | `Task.ts` |
| `EstimateUnitMismatchError` | 単位が異なる見積りを足そうとした | `Estimate.ts` |
| `ProjectAlreadyArchivedError` | すでにアーカイブされているプロジェクトをアーカイブしようとした | `Project.ts` |
| `TaskCreationOnArchivedProjectError` | アーカイブ済みのプロジェクトにタスクを作ろうとした | `Project.ts` |
| `TaskIdProjectMismatchError` | 別のプロジェクトの識別子を持つタスクを、このプロジェクトに作ろうとした | `Project.ts` |
| `EstimateAmountOutOfRangeError` | 見積りの合計が `Number.MAX_SAFE_INTEGER` を超えた | `Estimate.ts` |
| `CommentLimitExceededError` | コメントを追加すると件数が上限を超えるため、追加を拒否した | `Task.ts` |
| `LabelsLimitExceededError` | ラベルを追加すると件数が上限を超えるため、追加を拒否した | `Labels.ts` |
| `InvalidTaskNumberResponseError` | 保存先の採番結果が、番号として不正だった（数でない、正の整数でない、結果が無い） | `TaskNumberIssuer.ts` |
| `TaskNumberExhaustedError` | 採番した番号がタスク番号の上限を超えた。以後の採番もすべて上限を超える | `TaskNumberIssuer.ts` |
| `ListLimitOutOfRangeError` | 一覧の取得件数に、0以上の整数でない値を指定した | `TaskRepository.ts` |

**業務の規則1つにつき class を1つ置く。** タイムスタンプの前後の規則が4つあるなら、class も4つにする。
1つの class にまとめてメッセージだけを呼び出し側から受け取ると、どの規則に違反したのかが型から分からず、
受け取る側はメッセージを読むことになる。同じ規則の文言が呼び出し箇所ごとにずれても止まらない。

**状態の不一致は1つの class で表す（`TaskStatusMismatchError`）。** 着手・完了・再オープンの可否は、3つの規則ではなく、
「状態の遷移表にある遷移だけができる」という1つの業務の規則だからである。上の規則をそのまま当てはめた結果であって、例外ではない。
期待した状態と実際の状態をフィールドに持たせるので、どの遷移を拒んだかは型の付いた値で分かる。

リポジトリの1件取得で「見つからない」と、保存の「競合」も既定に入れない。リポジトリ層の関心であり（1件取得は `undefined` を返す）、必要になったプロジェクトが足す。
**集約の中の子が識別子で見つからないのは、これとは別である。** 業務操作の前提の違反なので、何が起きたかを表す名前のエラーを集約ルートのファイルに置く（`references/model-code.md` の「ファイルの書き方」）。

**`DomainError` は、`@throws` に書いて呼び出し側に想定させる失敗の基底 class である。「利用者に見せてよい失敗」という意味ではない。**
呼び出し側が直せるか、利用者に見せるかは具象の class ごとに次の表で決める。受け取る側は具象の class を `instanceof` で見て扱いを決める。

| 種別 | 呼び出し側が直せるか | 利用者に見せるか |
|---|---|---|
| `InvalidCreationParamError` / `InvalidTaskTitleError` / `ListLimitOutOfRangeError` | 直せる（入力を直す） | 見せる。`issues` や項目で直す箇所を示す |
| 業務の規則ごとの class（`TaskStatusMismatchError` など） | 操作や対象の状態を変えれば直せる | 見せる |
| `InvalidReconstructParamError` | 直せない（保存されている値が壊れている） | 見せない。障害として記録する |
| `InvalidClockValueError` / `InvalidGeneratedCommentIdError` | 直せない（注入した依存の実装の不具合） | 見せない。障害として記録する |
| `CommentPostedBeforePreviousCommentError` / `CommentPostedBeforeTaskCreationError` / `DuplicateCommentError` | 直せない（依存が返した値が、集約に保存済みの値と整合しなかった） | 見せない。記録する。時計のずれや採番の衝突が原因なら、もう一度実行すると通りうる |
| `InvalidTaskNumberResponseError` | 直せない（保存先の採番結果が不正） | 見せない。記録する |
| `TaskNumberExhaustedError` | 直せない（番号の範囲を使い切った。桁を増やすなど、番号の決め方を見直す判断が要る） | 見せない。記録し、運用で対処する。もう一度実行しても通らない |
| `FatalUnreachableError` | 直せない（実装の不具合） | 見せない。障害として記録する |
| 包まずに伝わる例外（SDK の例外、依存そのものが投げた例外） | 直せない | 見せない。障害として記録する |

**到達しないはずの分岐には `FatalUnreachableError` を置く。この class は必ず定義する。**
`DomainError` を継承させない。呼び出し側に想定させる失敗ではなく実装の不具合なので、
`@throws` にも、ドメインのエラーをまとめて拾う層にも入れない。

```ts
/**
 * 絶対に通らないはずだが、型の都合で書かざるを得ない分岐に入った。
 * `DomainError` を継承しないので、業務の失敗として扱う層には拾われない。
 */
export class FatalUnreachableError extends Error {
	override readonly name: string = "FatalUnreachableError";

	/** どの操作の分岐か。`"Task.start"` のようにモデル名を含める。 */
	readonly operation: string;

	constructor(operation: string, cause?: unknown) {
		super(
			`${operation}: 到達しないはずの分岐に入りました`,
			cause === undefined ? undefined : { cause },
		);
		this.operation = operation;
	}
}
```

**使ってよいのは、既知の失敗を手前ですべて分けたあとの、絶対に通らないと言い切れる分岐だけである。** 呼び出し側の入力でも、
外部の応答でも、クロックや採番の戻り値でも到達しうるなら使わない。
業務操作の末尾で完成値スキーマを `safeParse` する箇所が典型である。引数はブランド付きで、
呼び出し側に原因がある分岐は冒頭の `if` で弾いてあるので、ここで失敗するのは
ドメインの実装が壊れている場合だけになる。外部から来た値を検証する `create`・`reconstruct`・
DTO の `from`・外部応答の検証・依存が返した値の検証には使わない。

**規約に反して作られた値が渡されたときだけ到達する分岐も、実装の不具合として含める。**
DTO の `to` が保存形式にする前に完成値スキーマで値を確かめる箇所がこれに当たる（`references/persistence.md`）。
引数は完成値の型なので、ここで失敗するのは、ドメインの外でスプレッドやリテラルで完成値を作る規約違反があったときだけである。
呼び出し側が実行時に直せる入力の誤りではないので、`InvalidCreationParamError` のような業務のエラーにしない。

**`createXxx` の末尾で完成値スキーマを `safeParse` する箇所の種別は、そこに着く原因が残っているかで決める**
（`references/model-code.md` の「create の第1引数の作り方」）。
入力は1段目で、依存が返した値は取った直後に確かめるので、完成値スキーマに入力だけで違反しうる検査
（項目をまたぐ `refine`、コレクションの件数・重複）が無ければ、末尾に着く原因は残らない。
そのときは `FatalUnreachableError` を投げる（`Task`・`Comment`・`Project`・`Estimate`）。
入力だけで違反しうる検査があるなら、末尾は入力の不正を判定する場所なので `InvalidCreationParamError` を投げる（`WorkPeriod`・`Labels`）。

**依存が返した値の不正は、入力の不正と分ける。** `create` の中でクロックや IDジェネレーターから取った値は、
取った直後に完成値と同じ項目のスキーマで確かめ、不正なら `InvalidClockValueError` / `InvalidGeneratedCommentIdError` を投げる。
`InvalidCreationParamError` にすると、呼び出し側が直せない失敗を「入力を直せ」と報告してしまう。
依存そのものが投げた例外は包まずにそのまま伝える。「値を返せなかった」と「返した値が不正だった」は別の失敗である。

`FatalUnreachableError` は `@throws` には書かない。呼び出し側が対処できる失敗ではないからである。

**`InvalidCreationParamError` を投げるのは `createXxx` の中だけである。**
集約ルートの業務操作が子エンティティの `create` を呼ぶときは、子の `create` が投げたもの
（`InvalidCreationParamError`・`InvalidGeneratedCommentIdError`・`InvalidClockValueError`）がそのまま伝わる。
operation は子の `create` になる（`Task.addComment` で本文が不正なら `"Comment.create"`）。
業務操作が自分で投げるのではないので、下の流用には当たらない。業務操作の `@throws` には書く（`references/comments.md`）。
業務操作が検証されていない生の値を受け取るとき（値オブジェクトに切り出していない項目の書き換え）は、
その項目を表す名前のエラーを投げる（`Task.rename` の `InvalidTaskTitleError`。`references/model-code.md` の「業務操作で Zod を使わない」）。
操作だけが持つ引数の条件（使うポイント数は1以上の整数）も、冒頭の `if` で弾き、その規則だけを表す名前のエラーを投げる。
引数用の値オブジェクトを作ってその `create` の `InvalidCreationParamError` に任せない。
**`InvalidReconstructParamError` を投げるのは `reconstructXxx` と、DTO からドメインへ
変換する `fromXxx` の中だけである。** 業務操作・演算・読み取りに流用しない。
流用すると、呼び出し側は `create` していないのに `"Estimate.create"` という operation の
エラーを受け取り、どこで何をして失敗したのかが分からなくなる。
`from` が例外なのは、失敗の中身が `reconstruct` と同じ「保存されている値が壊れている」で、
呼び出し側の打つ手も同じだからである。

結果を検証したいだけなら、完成値スキーマを直接 `safeParse` して、
何が起きたかを表す名前のエラーを投げる。

**`safeParse` の失敗を特定の名前のエラーに言い換えてよいのは、その `safeParse` が
失敗しうる理由が1つしか残っていないときだけである。** 手前の `if` と引数の型で他の理由を
消してから言い換える。理由が2つ以上残るなら、呼び出し側に原因がある分岐を冒頭の `if` で
1つずつ弾き、残りを `FatalUnreachableError` にする。

```ts
// ✗ add なのに create のエラーが飛ぶ
function addEstimate(estimate: Estimate, params: AddEstimateParams): Estimate {
	return createEstimate({
		amount: estimate.amount + params.addend.amount,
		unit: estimate.unit,
	});
}

// ✓ 何が起きたかを表すエラーを投げる
function addEstimate(estimate: Estimate, params: AddEstimateParams): Estimate {
	if (estimate.unit !== params.addend.unit) {
		throw new EstimateUnitMismatchError(
			"Estimate.add",
			estimate.unit,
			params.addend.unit,
		);
	}
	const result = EstimateSchema.safeParse({
		amount: estimate.amount + params.addend.amount,
		unit: estimate.unit,
	} satisfies EstimateSchemaInput);
	if (!result.success) {
		throw new EstimateAmountOutOfRangeError("Estimate.add", result.error);
	}
	return result.data;
}
```

失敗が到達しない操作なら `FatalUnreachableError` を使う。更新後の値が
不変条件を満たさないのは、ドメインの実装が壊れている場合だけだからである。

**スキーマに書くメッセージは、その検査が実際に見ていることを書く。**
`min(1)` は長さの下限であって「必須」ではない。キーが無いときは `invalid_type` という
別の issue になるので、`min` のメッセージがそれを説明することはない。
利用者はメッセージを読んで入力を直すので、実際の検査とずれていると直しようがない。

```ts
// ✗ 検査は長さを見ているのに、欠落の話をしている
.min(1, { error: "表題は必須です" })

// ✓ 検査どおりに書く。max のメッセージとも揃う
.min(1, { error: "表題は1文字以上です" })
.max(200, { error: "表題は200文字までです" })
```

**メッセージは、受け入れる形を「です」で、拒む操作を「できません」で言い切る。**
`〜で指定してください` `〜に並べてください` のような依頼の形にしない。
一覧に並んだときに語尾が揃い、どれが形の説明でどれが拒否かが読み分けられる。
`〜は置けません` `〜が重複しています` `〜でした` のような、どちらでもない語尾にもしない。
前後の空白を拒むなら `表題の前後に空白を含めることはできません`、重複を拒むなら `コメント ID は一意です` と書く。

**この規則を当てるのは、利用者が読むメッセージのすべてである。** スキーマの `error` / `message` と、
`DomainError` の具象がコンストラクタで組み立てるメッセージの両方に当てる
（`渡されたのは done でした` ではなく `渡されたタスクは done です`）。
`FatalUnreachableError` のメッセージは実装の不具合を開発者に知らせるもので、利用者には見せないので対象外とする。

```ts
// ✗ 依頼の形。並べると語尾がばらつく
.regex(/^[a-z-]+$/, { error: "コメント ID は小文字で指定してください" })

// ✓ 受け入れる形を言い切る
.regex(/^[a-z-]+$/, { error: "コメント ID は小文字です" })
```

**同じ規則は、どこで検査しても同じ文言にする。** 完成値スキーマの `refine` で止める場合と、
操作の中で先に投げる場合の両方があっても、文は1つに決める。文が違うと、
利用者は別の規則だと読む。主語を省かず `〜のタイムスタンプは〜より前にはできません` のように、
何と何を比べたかが分かる形で書く。

**例外は、完成値スキーマが集合全体の性質として述べる規則を、操作側が「いま足す1件と、比べる相手の1件」
という2つの値の関係として先取りするときである。** 完成値スキーマは完成した値しか見えないので、
集合や並びが「どうあるべきか」としか言えない。操作の冒頭で先取りする側は、
どれを足そうとしていて何と比べたかを名指しできる。**このときだけ文が違ってよい。
違ってよいのは述べる粒度だけで、比べている条件と向きは変えない。**

| 規則 | 完成値スキーマ（集合の性質） | 操作側（2つの値の関係） |
|---|---|---|
| 識別子が重複しない | `コメント ID は一意です` | `コメント ${commentId} は2度追加できません` |
| 投稿順に並ぶ | `コメントは投稿順です` | `コメントのタイムスタンプは直前のコメントより前にはできません` |

**粒度が同じなら、文は1つに決める。** 参照実装で文言が一致しているのはこの5組で、
どちらの側も同じ粒度で述べている。

| 規則 | 粒度 | 文 |
|---|---|---|
| コメントの件数の上限 | どちらも集合の性質 | `コメントは${COMMENT_LIMIT}件までです` |
| ラベルの件数の上限 | どちらも集合の性質 | `ラベルは${LABEL_LIMIT}件までです` |
| 着手は作成以降 | どちらも2つの値の関係 | `着手のタイムスタンプは作成より前にはできません` |
| 完了は着手以降 | どちらも2つの値の関係 | `完了のタイムスタンプは着手より前にはできません` |
| コメントは作成以降 | どちらも2つの値の関係 | `コメントのタイムスタンプは作成より前にはできません` |

**判定は、両方の文を並べて粒度を見るだけでよい。** 粒度が同じなのに文が違うなら、
それは言い換えであって例外に当たらない。利用者に別の規則だと読ませる。

書き方は次のとおり。実物は `example/domain/shared-errors.ts` と、各モデルのファイルの「エラー」セクションを写す。

- 基底は `abstract class DomainError extends Error`。`operation` を持ち、`name` を `abstract override readonly` で宣言する
- **JSDoc や説明で class を指すときは `class` まで書く。** `ドメイン層が投げるエラーの基底 class。` と書き、`基底。` で止めない。
  `基底` だけでは、class なのか、スキーマなのか、型なのかが読めない。`クラス` とは書かず `class` と書く
- 具象は `override readonly name: string = "XxxError"` を1箇所だけ書く。**書き忘れると tsc が TS2515 で落とす**
- メッセージの接頭辞は基底で1回だけ付ける。具象は本文だけ渡す
- **具象のメッセージは class の中で決める。** 呼び出し側から文を受け取らない。値を埋め込むなら、その値を引数で受け取って class の中で組み立てる
- `Symbol.hasInstance` を実装しない。`instanceof` の意味を変えない
- 判定用の関数（`isDomainError` など）を作らない。利用側には `instanceof` だけを使わせる
- `ZodError` はコンストラクタで受け取り、`cause` は class の中で設定する。呼び出し側に `{ cause }` を書かせない
- `ZodError` を包む業務のエラーは `issues` に元の issue 一覧をそのまま持たせる。`path` と件数を落とさない。`FatalUnreachableError` は例外で、渡された原因を `cause` にだけ持つ
- `issues` の型は Zod の issue の型（`z.core.$ZodIssue`）のままにし、独自の型に詰め替えない。受け取る側が issue の `code` や `path` を読むと Zod の issue の形に依存するが、これは許容している。規則9が止めるのは、素の `ZodError` を throw して層の外に出すことである
- **失敗した対象を特定できる情報を、渡せる限り持たせる。** 運用でログだけを見て、どのデータで失敗したのかを追えるようにするためである。`operation` は「どの操作か」しか示さないので、これだけでは対象を特定できない。エンティティの操作なら、その識別子を第2引数で受け取って `readonly` に持たせる（`Task.start` なら `taskId`、`Project.archive` なら `projectId`）。**識別子を持たないモデル（`Estimate` や `Labels` のような値オブジェクト）は、渡せる識別子が無いので持たせない。** これは例外規定ではなく、同じ規則が「渡せるものが無い」ときに何も足さないだけである。`create` と `reconstruct` の失敗も持たせない。**失敗の原因が入力そのものなので、そこにある識別子を信用できない**（`create` は識別子がまだ決まっていないこともある）。対象は `issues` の `path` が指す
- 呼び出し側が分岐や表示に使う値（期待した状態、上限の件数、重複した要素の識別子）も、メッセージに埋め込むだけでなく `readonly` のフィールドに持たせる。メッセージを parse させない。持たせるのは失敗の時点で分かっている値だけで、状態の一覧や期待値を発明してエラーに書き込まない。呼び出し側が知っている期待値は、引数で受け取って持たせればよい
- **検証済みのドメイン値は、エラーのフィールドと引数でも元の型のまま持つ。** 生の `string` / `number` に落とさない。落とすと `new TaskStatusMismatchError("Task.start", project.id, …)` が型で止まらなくなり、**取り違えを型で防ぐという中核の保護がエラーだけ外れる。** 受け取った側も、その値でリポジトリを引くときに作り直さずに済む。
  モデルのエラーはそのモデルのファイルに置くので、モデルの型をそのまま参照できる。共有のファイルはモデルの型を持つ項目を持たないので、型の循環は生まれない。
  型を持たない値（上限の件数のような定数）と、Zod の `issues` はそのままでよい
- `FatalUnreachableError` は、この箇条書きの対象外とする。`Error` を直接継承し、`cause` を `unknown` で受け、`issues` も分岐用の項目も持たない。誰も捕まえない前提だからである

| フィールド | 型 |
|---|---|
| 識別子 | `TaskId` / `ProjectId` / `CommentId` |
| 日時 | `Timestamp` |
| 状態 | `Task["status"]` |
| 列挙の値 | `Estimate["unit"]` |
| 上限の件数 | `number` |
| 検証の詳細 | `readonly z.core.$ZodIssue[]` |

**エラーを定義したファイルの型のテスト（`Task.test-d.ts` など）で、コンストラクタに生の値と別種の識別子を渡せないことを確かめる。** 型で止めるのが目的なので、
止まっていることを型のテストで固定する。実物は `example/domain/entity/Task.test-d.ts` の `TaskStatusMismatchError の型` にある。

```ts
// ✗ operation しか無い。ログを見てもどのタスクか分からない
throw new TaskStatusMismatchError("Task.start", "backlog", task.status);

// ✓ 呼び出し側が task を持っているので、識別子を渡せる
throw new TaskStatusMismatchError("Task.start", task.id, "backlog", task.status);

// ✓ Labels は識別子を持たないので、渡せるものが無い。比べた値だけを持たせる
throw new LabelsLimitExceededError("Labels.add", LABEL_LIMIT);
```

**`parse` ではなく `safeParse` を使い、失敗を包んで投げる。** 素の `ZodError` を throw して層の外に出さない。
包む処理は数行なので、共通の関数にまとめずその場に書く。

```ts
function completeTask(task: Task, params: CompleteTaskParams): Task {
	if (task.status !== "inProgress") {
		throw new TaskStatusMismatchError(
			"Task.complete",
			task.id,
			"inProgress",
			task.status,
		);
	}
	const period = WorkPeriodSchema.safeParse({
		startedAt: task.startedAt,
		completedAt: params.at,
	} satisfies WorkPeriodSchemaInput);
	if (!period.success) {
		throw new TaskCompletedBeforeStartError(
			"Task.complete",
			task.id,
			params.at,
			task.startedAt,
		);
	}
	const { startedAt: _startedAt, ...rest } = task;
	const result = TaskSchema.safeParse({
		...rest,
		status: "done",
		workPeriod: period.data,
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.complete", result.error);
	}
	return result.data;
}
```

**呼び出し側に原因がある分岐は、冒頭の `if` で弾く。**
そうすると末尾まで来る失敗は実装の不具合だけになり、種別の選び方が一意に決まる。

**知っておく限界を規則として書く。** どちらも `instanceof` が成立しない。

- エラーがワーカーやプロセスの境界を越えると、構造化複製が `name` / `message` / `stack` しか運ばない。境界の手前で受け止める
- 同じドメインパッケージが `node_modules` に2つ入っている。依存解決の不具合なので `workspace:*` 参照・`peerDependencies`・dedupe で直す
