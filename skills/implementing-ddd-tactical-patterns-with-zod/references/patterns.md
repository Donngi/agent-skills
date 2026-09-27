# 実装パターン

パターンの目次と、パターンごとに決めること・注意点を書く。題材は Jira に似たタスク管理ツール。
**コードはここに載せない。書く前に、該当するパターンの「実物」のファイルを `example/` で開いて読むこと。**
実物は型検査とテストが通る状態に保ってあり、ここに写しを置くと片方だけ古くなる。

## 目次

### 値オブジェクト

- プリミティブ型 — `example/domain/value-object/ProjectId.ts`
- プリミティブ型（タイムスタンプ） — `example/domain/value-object/Timestamp.ts`
- プリミティブ型（UUID） — `example/domain/value-object/UserId.ts`
- プリミティブ型（集約内の識別子） — `example/domain/value-object/CommentId.ts`
- プリミティブ型（コレクションの要素） — `example/domain/value-object/Label.ts`
- 接頭辞付き識別子 — `example/domain/value-object/TaskId.ts`
- 列挙 — `example/domain/value-object/Priority.ts`
- URL — `example/domain/value-object/PullRequestUrl.ts`
- 複数値かつ各値はプリミティブ型 — `example/domain/value-object/Estimate.ts`
- 複数値かつ各値が別の値オブジェクト — `example/domain/value-object/WorkPeriod.ts`
- コレクション — `example/domain/value-object/Labels.ts`

### エンティティ

- 単一状態（集約ルート） — `example/domain/entity/Project.ts`
- 複数状態（集約ルート） — `example/domain/entity/Task.ts`
- エンティティがエンティティを内包する — `example/domain/entity/Comment.ts`
- 別の集約を生成する（生成する側の集約の操作） — `example/domain/entity/Project.ts` の `Project.createTask`

### ドメインサービス

- I/O の無い判定 — 実物なし（`SKILL.md`「ドメインサービスにするか」）

### インフラ

- 永続層のインターフェース — `example/domain/repository/TaskRepository.ts`
- ドメインサービスのインターフェース — `example/domain/domain-service/TaskNumberIssuer.ts`
- DTO と変換 — `example/infrastructure/dto/DynamoDBTaskItemDTO.ts`
- インターフェースの実装 — `example/infrastructure/repository-impl/TaskRepositoryImpl.ts`
- ドメインサービスの実装 — `example/infrastructure/domain-service-impl/TaskNumberIssuerImpl.ts`

### エラー

- 共有のエラー定義 — `example/domain/shared-errors.ts`
- モデルのエラー — `example/domain/entity/Task.ts` の「エラー」セクション

## 値オブジェクト

### プリミティブ型

1つのプリミティブ値を包む。**決めること**: 正規化規則、長さの単位、範囲、形式。境界の値をテストで押さえる。
ドメインでは整形しない。整形済みの値だけを受け入れ、`transform` は使わない。
`trim` して比較する検査を置くのは、**形式の検査が前後の空白を弾かない文字列だけである**。
`regex` や `uuid` で形式を固定した識別子（`ProjectId`・`UserId`・`Label`）には要らない。
自由入力の文字列（`Task` の `title`、`Comment` の `body`）と、空白を暗黙に除去する API を使う
`PullRequestUrl` に置く。

実物: `example/domain/value-object/ProjectId.ts`・`ProjectId.test.ts`・`ProjectId.helper.test.ts`

### プリミティブ型（タイムスタンプ）

瞬間か暦日かを先に決める。瞬間なら epoch ミリ秒。**上限（9999-12-31）を置く。** 表現を成り立たせる形式条件なので、依頼に上限が無くても置く
（`SKILL.md`「依頼に書かれていないことの扱い」）。上限が無いと、`Date` が扱えない値（8.64e15 ミリ秒を超える値）で
`toISOString` が `RangeError` を投げ、1万年以上は ISO の文字列が6桁の年になる。マイクロ秒をミリ秒と取り違えた値も止まる。

実物: `example/domain/value-object/Timestamp.ts`・`Timestamp.test.ts`・`Timestamp.helper.test.ts`

### プリミティブ型（UUID）

外部が発行する UUID を受ける。UUID は大文字小文字を同一視する形式なので、受け入れる表記を1つに決める。
`z.uuid()` は大文字を通すので、参照実装は小文字に決めて `refine` を足している。
決めないと、大文字小文字だけが違う同じ識別子が2つ共存し、`===` も保存キーも分裂する。
大文字小文字の違いで別の識別子を表す形式なら、表記を揃えない（`SKILL.md` の「何を作るか決める」）。

実物: `example/domain/value-object/UserId.ts`・`UserId.test.ts`・`UserId.helper.test.ts`

### プリミティブ型（集約内の識別子）

子エンティティの識別子。形は UUID と同じだが、一意なのは集約の中だけである。
この値オブジェクトは形式だけを見る。重複しないことは集約ルート（`Task` の `comments` の `refine`）が確かめる。

実物: `example/domain/value-object/CommentId.ts`・`CommentId.test.ts`・`CommentId.helper.test.ts`

### プリミティブ型（コレクションの要素）

コレクション（`Labels`）に入れる要素。1つの値だけで決まる長さと文字種はここに書き、
件数・重複・順序はコレクションの側に書く。

実物: `example/domain/value-object/Label.ts`・`Label.test.ts`・`Label.helper.test.ts`

### 接頭辞付き識別子

`z.templateLiteral` を先頭に置くと入力型が固定され、境界で `as` が要る。`z.string()` で受けてから `pipe` する。`templateLiteral` は構成要素の `refine` と `positive` のような範囲の check を実行しないので、形式の制約は別に書く。

実物: `example/domain/value-object/TaskId.ts`・`TaskId.test.ts`・`TaskId.helper.test.ts`

### 列挙

`z.enum` は値そのものが型になるのでブランドを付けない。順序が要るなら、比較のためだけの表を持ち、保存はしない。

実物: `example/domain/value-object/Priority.ts`・`Priority.test.ts`・`Priority.helper.test.ts`

### URL

`z.url()` は前後の空白を落とし、値の途中の改行・タブ・CR も取り除いて値を書き換える。
制御文字・`\`・途中の空白は、書き換えずにそのまま受理する。どちらも `pipe` の前に拒否する。後ろに置くと除去後の値しか見えない。
参照実装は、空白とバックスラッシュを除く印字可能な ASCII 文字に限っている。
`protocol` の判定は大文字小文字を区別せず、`//` の無い形や認証情報付きの URL も通す（`references/pitfalls.md`）。
形を限るなら、`https://` で始まること、認証情報を含まないこと、ホスト名が小文字であることを、それぞれ `refine` で足す。
ホスト名を小文字に限っても止まるのはホスト名の大文字小文字の揺れだけで、既定のポート付き（`:443`）や `..` を含むパスのように同じ先を指す別の表記は通る。
表記を1つに決める必要があるなら、それを業務で決めてから検査を足す。
拒否のテストでは、使える文字の違反を `https://` のあとに置く。先頭の空白や制御文字は書き出しの検査も同時に破る（`references/testing.md` の冒頭の、独立した制約の扱い）。

実物: `example/domain/value-object/PullRequestUrl.ts`・`PullRequestUrl.test.ts`・`PullRequestUrl.helper.test.ts`

### 複数値かつ各値はプリミティブ型

`strictObject` + `readonly` + `brand`。等価性は構造で比べる関数を必ず置く。単位が違うものは演算で弾き、何が起きたかを表す名前のエラーを投げる。

実物: `example/domain/value-object/Estimate.ts`・`Estimate.test.ts`・`Estimate.helper.test.ts`・`Estimate.test-d.ts`

### 複数値かつ各値が別の値オブジェクト

項目どうしの関係は、両方が揃ってから `refine` で確かめる。項目側には書けない。`path` を指定して、どの項目の問題かを伝える。

実物: `example/domain/value-object/WorkPeriod.ts`・`WorkPeriod.test.ts`・`WorkPeriod.helper.test.ts`・`WorkPeriod.test-d.ts`

### コレクション

空・最大件数・重複・順序の4つを決める。依頼に無い最大件数は置かず、要否を回答で確認する（`SKILL.md`「依頼に書かれていないことの扱い」）。
制約ごとに `refine` を分ける。まとめると issue が1件になり、どれに触れたか分からない。
**並び順を不変条件にするかを決める。** 順序に意味が無いなら、並び順を不変条件にせず、等価性は並び順を無視して比べる
（参照実装の `Labels`）。並び順を不変条件にすると、比較の仕方を変えたときに保存済みの値を `reconstruct` できなくなる。
保存と比較を安定させるために並び順を固定すると決めたなら、`create` で並べ替えてよい（中核の規則5）。
並べ替えるのは渡された配列の写しで、重複の除去や値の書き換えはしない。
**比較関数を明示し、完成値スキーマの順序の検査と同じ比較を使う。** 引数なしの `sort()` は要素を文字列として比べるので、数値の集合では `[9, 10]` が `[10, 9]` に並び、昇順の検査に落ちる。`reconstruct` は並べ替えず、決めた順でない保存値を拒否する。

**集約が持つコレクションを変えるときは、集約の業務操作から値オブジェクトの演算を呼ぶ**（`Task.addLabel` が `Labels.add` を呼ぶ）。
業務操作が無いと、利用側は `{ ...task, labels: Labels.add(task.labels, …) }` のようにスプレッドで組み立てるしかなく、規則14に反する。

実物: `example/domain/value-object/Labels.ts`・`Labels.test.ts`・`Labels.helper.test.ts`・`Labels.test-d.ts`

#### 要素をインラインのオブジェクトで持つ配列

要素がそれ自体では業務の概念にならず、独立したモデルに切り出さないときは、配列の中に
`z.strictObject` を直接書く。**このとき `.readonly()` は配列と要素の両方に要る。**
`.readonly()` は自分が生成した値だけを `Object.freeze` するので、配列に付けても要素は凍らない（実測）。
型も同じで、要素側に付けないと `entries[0].note = "x"` がコンパイルを通る。

```ts
// ✗ 配列は凍るが、要素のオブジェクトは凍らない。型でも書き換えが通る
entries: z
	.array(z.strictObject({ at: TimestampSchema, note: z.string().min(1) }))
	.readonly(),

// ✓ 要素にも付ける
entries: z
	.array(
		z
			.strictObject({ at: TimestampSchema, note: z.string().min(1) })
			.readonly(),
	)
	.readonly(),
```

要素が `CommentSchema` のような別の完成値スキーマなら、その側で `.readonly()` が付いているので重ねない
（`example/domain/entity/Task.ts` の `comments` がこの形）。
この形の実物は `example/` に無い。凍らせ方を示すための例であって、モデルを増やして見せるものではない。
要素がプリミティブや列挙だけなら、凍らせる対象が配列しかないので、配列に1回で足りる。

## エンティティ

### 単一状態（集約ルート）

状態が1つなら `XxxCommonFields` は作らない。create の第1引数を `pick` で派生させるなら、フィールド定義を `XxxFields` に切り出す。等価性は識別子だけで比べる。業務操作は第1引数に対象、第2引数にパラメータオブジェクト。

実物: `example/domain/entity/Project.ts`・`Project.test.ts`・`Project.helper.test.ts`・`Project.test-d.ts`

### 複数状態（集約ルート）

`discriminatedUnion` で表す。その状態に存在しない項目はキーごと持たない。
値オブジェクトに切り出していない項目（表題など）を書き換える操作は、検証されていない値を受け取るので、
その項目のスキーマで確かめる（`Task.rename`。`references/model-code.md` の「業務操作で Zod を使わない」）。**2つ以上の項目を同時に見ないと判定できない条件だけ** `superRefine` に置く。**横断検証から例外を投げる関数を呼ばない**。呼ぶと `safeParse` からも漏れ、その完成値スキーマを検証しているすべての場所で意図しない例外になる。

実物: `example/domain/entity/Task.ts`・`Task.helper.test.ts`・`Task.test-d.ts` は全体を読む。`Task.test.ts` は長いので、`describe("Task.create")`・`describe("Task.reconstruct")`・`describe("TaskSchema")`・`describe("Task.equalsById")`・`describe("Task.start")`（異常系に `// And:` の実物がある）と、書く操作にいちばん近い業務操作の `describe` だけを読む

### エンティティがエンティティを内包する

別の集約ルートの境界内に属し、そのルートを通して整合性と保存を管理するなら子エンティティ。単体では保存せず、集約ごと保存する。**作るのも集約ルートの業務操作を通す。** アプリケーション層は子の `create` を直接呼ばず、集約ルートの操作（`Task.addComment`）を呼び、子の識別子と作成時刻はその操作に渡した依存から決まる（`references/model-code.md`「ファイルの書き方」）。識別子の一意性は集約の中だけで保証する。**変わらなくても子エンティティである。** `Comment` は投稿されたあと変わらないが、本文と著者と時刻が同じでも別の投稿なら別物として扱う。

**集約の中の子を書き換える操作も集約ルートに置き、子を識別子で探す。** 見つからないのは業務操作の前提の違反なので、名前の付いたエラーにする（`references/model-code.md` の「ファイルの書き方」）。この形の実物は `example/` に無い。

実物: `example/domain/entity/Comment.ts`・`Comment.test.ts`・`Comment.helper.test.ts`・`Comment.test-d.ts`

### 別の集約を生成する（生成する側の集約の操作）

別の集約の状態で決まる生成の前提（「アーカイブ済みのプロジェクトにはタスクを作れない」）は、生成する側の集約の業務操作に置く。
`Project.createTask(project, params, deps)` は、前提を確かめてから中で `Task.create` を呼び、新しい `Task` を返す。`Project` は変えないので、保存するのは作った `Task` だけである。
生成される側（`Task`）は独立した集約ルートのままで、子エンティティにはならない。生成する側の集約をオブジェクトで持たず、識別子で参照する。
渡されたタスクの識別子が、そのプロジェクトのものであることも確かめる（`TaskIdProjectMismatchError`）。
採番（`TaskNumberIssuer`）は呼び出し側が先に行うので、前提に反して失敗した番号は欠番になる。採番が欠番を許すと約束しているので、それを許す。
形の決まりは `references/model-code.md` の「ファイルの書き方」の「生成する側の集約の操作」の段落にある。

実物: `example/domain/entity/Project.ts` の `Project.createTask` と、`Project.test.ts`・`Project.test-d.ts` の `describe("Project.createTask")` とそのエラーの `describe`

## ドメインサービス

### I/O の無い判定

状態が変わるモデルにも、生成する側の集約にも置けない判定だけをここに置く。作る条件は `SKILL.md`「ドメインサービスにするか」にある。
判定に要る集約はすべて引数で受け取り、同期で書く。リポジトリも外部も呼ばない。

参照実装にこの形の実物は無い。作ることになったときは、業務操作（`example/domain/entity/Task.ts` の業務操作）の形に倣い、
その条件に当たると判断した理由を回答に書く。実物に無い業務の規則を、例を補うために足さない。

## インフラ

### 永続層のインターフェース

引数と戻り値はドメインの型だけで表す。DTO も保存先の語彙もここには出さない。
1件取得は「無かった」を `undefined` で表す。エラーにしない。

実物: `example/domain/repository/TaskRepository.ts`

### ドメインサービスのインターフェース

1つのモデルでは決められず、保存先や外部の助けが要る処理をインターフェースにする。実装はインフラ層に置く。
ドメインサービスにしてよいかは、先に `SKILL.md`「ドメインサービスにするか」で確かめる。

実物: `example/domain/domain-service/TaskNumberIssuer.ts`

### DTO と変換

`to` は保存形式にする前に、渡された値を完成値スキーマで確かめ、失敗を `FatalUnreachableError` に包む（`references/persistence.md`）。
保存形式の契約だけを書く。必須キー、型、状態別の構造、余剰キーの拒否、保存上の列挙、保存キーの形式と本体との整合である。長さ・形式・範囲・件数はドメインから写さない。`from` の出口の `reconstruct` がかけ直すからである。状態別ユニオンにすると、戻すときに `as` が要らない。保存キーは `string` + `regex` で書く。`templateLiteral` にすると出力型が固定され、組み立て側で `as` が要る。連番の桁数はドメインから import せず、保存形式の定数として DTO が持つ。

実物: `example/infrastructure/dto/DynamoDBTaskItemDTO.ts`・`DynamoDBTaskItemDTO.test.ts`

### インターフェースの実装

DTO の変換と保存キーの組み立てを呼び、保存先の API に渡す。キー文字列を自分で組み立てない。「無い」を返すのは保存先が無いと言ったときだけ。壊れた値は復元側で落とす。

実物: `example/infrastructure/repository-impl/TaskRepositoryImpl.ts`・`TaskRepositoryImpl.test.ts`

### ドメインサービスの実装

保存先の都合をここに閉じる。外から来た値は、ドメインの識別子に埋め込む前に、ドメインが公開する上限（`TASK_NUMBER_MAX`）で検証する。

実物: `example/infrastructure/domain-service-impl/TaskNumberIssuerImpl.ts`・`TaskNumberIssuerImpl.test.ts`

## エラー

### 共有のエラー定義

共有のファイル `shared-errors.ts` には、基底と、どのモデルにも依らない5つだけを置く。モデルの型を import しない。それ以外のエラー class は、その失敗を定める規則・約束の持ち主のファイルに置く（`references/errors.md`）。`Symbol.hasInstance` を実装せず、`instanceof` の意味を変えない。判定用の関数も作らない。既定は生成と復元の2種別だけで、それ以外は**何が起きたかを表す名前**の class を足す。
到達しないはずの分岐に置く `FatalUnreachableError` だけは必ず定義し、`DomainError` を継承させない。

実物: `example/domain/shared-errors.ts`・`shared-errors.test.ts`（共有のエラー class を書く・足すときだけ読む）

### モデルのエラー

モデルのファイルの「公開 API」の1つ上に「エラー」のセクションを置き、そのモデルの業務の規則を表す class を並べる。名前付きで export し、公開 API のオブジェクトには入れない。インターフェースが `@throws` で宣言する失敗は、そのインターフェースのファイルに置く。

実物: `example/domain/entity/Task.ts` の「エラー」セクション、そのテストは `Task.test.ts` の末尾の class ごとの `describe`、型のテストは `Task.test-d.ts` の `TaskStatusMismatchError の型`（エラー class を書く・足すときだけ読む）。インターフェースの例は `example/domain/repository/TaskRepository.ts`・`TaskRepository.test.ts`・`TaskRepository.test-d.ts`

## 公開 API を型で検査する（任意）

書き忘れを型で止めたいなら、契約型を1つ置いて `satisfies` させる。メンバーの欠落は `TS1360` になる。

```ts
type ValueApi<
	Value,
	CreateArgs extends unknown[],
	ReconstructInput,
> = Readonly<{
	create: (...args: CreateArgs) => Value;
	reconstruct: (input: ReconstructInput) => Value;
}>;

type EntityApi<
	Value,
	CreateArgs extends unknown[],
	ReconstructInput,
> = ValueApi<Value, CreateArgs, ReconstructInput> &
	Readonly<{ equalsById: (a: Value, b: Value) => boolean }>;
```

`reconstruct` の引数は `XxxSchemaInput` なので、`unknown` に固定すると `TS1360` になる。
`unknown` を受けるのは DTO の `from` だけである。

追加の操作を持つモデルは、交差型でそのシグネチャも並べる。契約型だけを渡すと余剰プロパティ検査で `TS2353` になる。この検査が保証するのはメンバーの存在とシグネチャだけで、同じスキーマを使っていることや型述語が正しいことは保証しない。そこはテストで担保する。
