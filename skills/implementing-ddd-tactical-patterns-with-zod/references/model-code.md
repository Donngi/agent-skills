# モデルのコードの書き方

値オブジェクト・エンティティ・業務操作のコードをどう書くかの規則。何を作るかの判断と中核の規則は `SKILL.md` にあり、
本文の「規則6」「規則14」などは `SKILL.md` の「中核の規則」の番号である。命名は `references/naming.md`、
エラーは `references/errors.md`、DTO と永続化は `references/persistence.md`、コメントは `references/comments.md` にある。

## この文書の読み方

**この文書は全体を読む。** 読むかどうかは `SKILL.md` の「読む計画」の表が正である。書くものと関係の深い節は次のとおり（目次）。

| 書くもの | 関係の深い節 |
|---|---|
| 値オブジェクト・エンティティの生成と復元 | 「公開の形」「入口を create と reconstruct に絞る」「完成値スキーマの .readonly() と任意項目」「create の第1引数の作り方」「satisfies を付ける場所」「ファイルの書き方」 |
| 業務操作・演算・読み取り | 「ファイルの書き方」「型を置くセクション」「業務操作で Zod を使わない」「決まりごとの置き場」 |
| 横断検証（`refine` / `superRefine`） | 「superRefine に書く条件」「決まりごとの置き場」 |
| 状態ごとに分かれる組み立て（DTO の `to` を含む） | 「分岐の書き方」 |

## 公開の形

**オブジェクトに集めるのは、ドメイン層の値オブジェクト・エンティティと、I/O の無いドメインサービスだけである。**
スキーマと型はファイル直下から名前付きで export する。関数の本体はローカルな `function` 宣言として書き、ファイル末尾の「公開 API」セクションでオブジェクトに集める。

`Task.create` `Task.start` のように、**モデル名で修飾して読めることに意味がある**からこうする。
I/O の無いドメインサービスも同じ形にする。
同じ `create` という語が何十個もあるので、呼び出し箇所でどのモデルの生成かが分かる必要がある。

**インフラ層は、必要なものを名前付きで export するだけにする。「公開 API」のオブジェクトを作らない。**
DTO のスキーマは export しない。理由と export する名前の一覧は `references/persistence.md` の「公開の形」にある。

```ts
// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Estimate = {
	create: createEstimate,
	reconstruct: reconstructEstimate,
	equals: estimateEquals,
	add: addEstimate,
} as const;
```

利用側はこうなる。

```ts
import { Estimate } from "../value-object/Estimate";

const size = Estimate.create({ amount: 3, unit: "point" });
const total = Estimate.add(size, { addend: Estimate.create({ amount: 2, unit: "point" }) });
```

守ること。

- **ローカル関数名は完全名にする。** `create` ではなく `createEstimate`。バンドラは同名のローカル関数に連番を振るため、短い名前だと本番のスタックトレースに `create2` と出る。検索でも一意にならない。
- **オブジェクトのキーはモデル名を落とす。** `create` / `reconstruct` / `equals` / `equalsById`、業務操作と導出は動詞や名詞だけにする。
- **スキーマをオブジェクトの中に置かない。** 完成値の型がオブジェクト自身を参照して `TS2456` と `TS7022` になる。
- **オブジェクトのメソッドで `this` を使わない。** 分割代入で切り出したときに壊れる。ローカル関数を直接呼ぶ。
- **型ガード（`value is Xxx` を返す関数）を書かない。** オブジェクトの中にも外にも置かない。理由は下の「入口を create と reconstruct に絞る」。
- **`import type` で値は呼べない。** `import type { Task }` からは `Task.create` を呼べず `TS1361` になる。値も使うなら `import { Task, type TaskDeps }` と混ぜる。

### 入口を create と reconstruct に絞る

**未検証の入力からブランド付きの完成値を作る入口は、`create` と `reconstruct` の2つだけにする。**
どちらも完成値スキーマの `safeParse` が返す `result.data` を返す。これは Zod が新しく作った
凍結済みのオブジェクトで、渡された入力とは別物である。

**入口を2つに絞っても、型だけではこの保証は成り立たない。** ブランドは型の上の目印で、スプレッドで引き継がれる。
`const bad: Task = { ...task, title: "" }` も `{ ...estimate, amount: -5 }` も型検査を通り、凍結もされない（実測）。
業務操作は引数を再検証しないので、この値はそのまま流れ、止めなければ保存される。以後その集約の読み出しはすべて失敗する。

- **ドメイン層の外で、スプレッドやオブジェクトリテラルで完成値型の値を作らない。** 型注釈や `satisfies Xxx` で完成値型にすることも含む。
  値を変えたいなら、その変更を業務操作としてモデルに足す
- ドメイン層の中でスプレッドで組み立てた値は、必ず完成値スキーマを通してから返す（下の「業務操作で Zod を使わない」の書き方）
- 保存の直前に、DTO の `to` で完成値スキーマを通す（`references/persistence.md`）。規約に反して作られた値を書き込まないための最後の防壁である

次のものは入口に数えない。どれも最後は完成値スキーマの `result.data` を返すか、入口を通る。

| 入口にならないもの | 理由 |
|---|---|
| DTO の `from` | DTO スキーマで形を確かめたあと、最後に `reconstruct` を通る |
| 業務操作・演算 | 検証済みの完成値を受け取り、組み立てた結果を完成値スキーマで検証して `result.data` を返す |
| ドメイン内の導出（`Task.complete` の `WorkPeriodSchema`、`TaskId.projectId` の `ProjectIdSchema`） | 検証済みの部品から組み立て、同じく `result.data` を返す |

**型ガード（`value is Xxx` を返す関数）を書かない。**

```ts
// ✗ safeParse が作った凍結済みの値を捨てて、渡された元の入力に Estimate の型を与えている
function isEstimate(value: unknown): value is Estimate {
	return EstimateSchema.safeParse(value).success;
}
```

型ガードで narrow した値は凍結されていない。元のオブジェクトを書き換えると、
`Estimate` 型を名乗ったまま不変条件を破る値になる（実測: `isEstimate` が `true` を返した値の
`amount` を書き換えられ、書き換えたあとは `EstimateSchema` を通らない）。
業務操作は「境界で検証された値を受け取る契約」で入り口の再検証をしないので、この破れはどこでも検出されない。

**既存の完成値を状態で絞る述語も書かない**（`task is Extract<Task, { status: "done" }>`）。
`if (task.status === "done")` と書けば、TypeScript の制御フロー解析で同じように絞れる。

型ガードが担っていた用途は、次で置き換える。

| 欲しいもの | 使うもの |
|---|---|
| 保存値（`unknown`）からドメインの値 | DTO の `fromXxxDTO(raw)` |
| 外部入力からドメインの値 | 境界で入力を検証し、`Xxx.create(props)` に渡す |
| 検証済みの値を状態で分岐する | 判別子の比較（`task.status === "done"`） |
| 完成値スキーマの振る舞いのテスト | テストで `XxxSchema.safeParse(value).success` を直接見る。テストは対象の横にあるので、ドメイン層の中である |

**ドメイン層の外から完成値スキーマを直接呼ばない。** `XxxSchema` は、ほかのモデルがフィールドの定義や
導出に使うので export を外せない。型では止まらないので、規約で止める。
例外は DTO の `to` での検査だけである。値を作らずに確かめるだけなので、入口を増やさない。

**`reconstruct` を呼んでよいのは、保存先から読んだ値を復元するとき（DTO の `from` など、インフラ層の読み出し）と、テスト（ダミー生成ヘルパーを含む）だけである。**
`reconstruct` は保存済みの値を戻すための入口なので、どの状態の値でも受け入れる。
アプリケーション層や UI 層から呼ぶと、`create` が強制する初期状態・作成時刻・採番を経ずに、
`Task.reconstruct({ status: "done", ... })` のように遷移の前提条件を飛ばした値を作れてしまう。
アプリケーション層と UI 層は、`create` と業務操作だけを使う。外から受け取った識別子のような単一の値も `create` で作る。
インフラ層でも、保存先の値を材料に**新しい値を作る**処理（採番した番号から識別子を組み立てるなど）は復元ではないので、`create` を通す。

**不正な要素を黙って捨てる絞り込み（`values.filter(...)`）を書かない。** 一覧の中に壊れた値があったとき、
全体を失敗させるか、除外して記録に残すかは、その境界の仕様として明示的に決める。

## 完成値スキーマの .readonly() と任意項目

### .readonly() の付け方

**スキーマの中にその場で書いた `z.strictObject` / `z.array` ごとに、1回ずつ付ける。**
`.readonly()` の凍結は1階層だけなので、外側に付けても、その場で書いた入れ子の配列とオブジェクトは凍らない（実測）。

- 要素がプリミティブや列挙だけの配列は、配列に付ければ足りる
- 要素をその場で書いたオブジェクトの配列は、配列と要素のオブジェクトの両方に付ける（`z.array(z.strictObject({ ... }).readonly()).readonly()`）
- 別の完成値スキーマを参照している箇所には重ねない。参照先のスキーマが自分の値を凍結する（`z.array(CommentSchema).readonly()` の要素）
- 状態別ユニオンは、枝ごとではなく外側に1回付ける（`z.discriminatedUnion([...]).readonly()`）。枝の中にその場で書いた配列やオブジェクトには、それぞれ付ける

`Date` のような可変のインスタンスは完成値に持たせない。凍結しても `setTime` で中身が変わるので、日時は `number` のような不変の値で持つ。
対象はドメインの完成値で、DTO には付けない。

### 任意項目

**任意項目は `.exactOptional()` で宣言する。`.optional()` は使わない。**
`.optional()` は `{ key: undefined }` を通し、完成値に項目が残る。`strictObject` は定義に無い項目しか見ないので止まらない（実測）。
`.exactOptional()` は項目ごと無いことだけを許し、`z.output` も `key?: T` になる。
**型でも止めたいなら、そのプロジェクトで `exactOptionalPropertyTypes` を有効にする。**
無効なら `undefined` の代入は型では通り、実行時にだけ止まる（実測）。

## create の第1引数の作り方

**`createXxx` が第1引数に受け取る、呼び出し側が用意する値のことである。** 第2引数の `deps`（クロック・IDジェネレーター）は含まない。
この節では2回目以降を「第1引数」と書く。テストの `// Given:` では「入力」と書く（`references/test-style.md`）。

完成値の項目を、値がどこから来るかで4つに分ける。第1引数に入れるのは (a) と、完成値に無い (e) である。

| 種別 | 値の出どころ | 例 |
|------|------|------|
| (a) 外部入力 | 呼び出し側 | `title`、`creatorId`、外から渡す `id` |
| (b) 生成器 | `deps` の `idGenerator` / `clock` | 内部採番の `id`、`createdAt` |
| (c) 初期値 | `create` の中の固定値 | `status: "backlog"`、`comments: []` |
| (d) 導出値 | 他の項目からの計算 | 合計、期間 |

完成値に無いが `create` が受け取る項目を (e) と呼ぶ。(d) の材料になるときだけ存在する。

**時刻の出どころは規則7で決まる。** `create` が作る値の作成時刻（`Task.create` の `createdAt` など）は (b) で、`deps.clock` から取る。
業務操作が記録する出来事の時刻（`Task.start` の `params.at` など）は `create` の項目ではなく、操作の引数で呼び出し側から受け取る。
業務操作の中で子エンティティを `create` するときは、その時刻は子の作成時刻なので `deps.clock` から取る
（`Task.addComment` が作る `Comment` の `postedAt`）。
クロックは、前に返した値より小さい値を返さない時刻源を前提にする。それを満たすのは、依存を組み立てる側の責任である。
それでも、保存済みの値が別の時刻源で作られていれば、前後が食い違うことはある。集約はその食い違いを検出して拒否する
（`Task.addComment` の `CommentPostedBeforePreviousCommentError`）。

**`create` が検証しなければならないオブジェクトは2つある。受け取った `props` と、組み立てた完成値である。**
`props` は第1引数のスキーマで、完成値は完成値スキーマで検証する。
項目を拾い直す、初期値や生成器の戻り値を足す、導出値を作る、のどれかをすると、
完成値は `props` とは別のオブジェクトになり、**完成値スキーマは `props` を一度も見ない**。
余剰キーは黙って通り、`props` が `null` なら `TypeError` になり、完成値に残らない (e) の項目は
どこでも検証されない（実測）。値オブジェクトかエンティティかでも、`deps` の有無でも決まらない。
固定の初期値を1つ足すだけで同じことが起きる。

**#1 の「1つのプリミティブ値を包むモデル」だけは、第1引数のスキーマを作らず、完成値スキーマの1回で済ませる。**
包む値そのものが完成値なので、検証すべきオブジェクトが2つに分かれない。生の型で受けるのもこの段だけである。

**#2〜#4 では、`props` をそのまま完成値スキーマに渡せる場合も、第1引数のスキーマを省かない。**
境界の検証をモデルの種類によらず同じ位置に置く。
この場合は同じ検査が二度走り、第1引数のスキーマで止まると完成値スキーマの横断検証まで進まないぶん
`issues` が減る（実測）。**第1引数のスキーマには、完成値スキーマと同じ項目のスキーマを使う。**
検査を弱めた別物を置くと、減る `issues` が増える。

**検証と生成の順序は次のとおりとし、無い処理は飛ばす。** 失敗の種別は、段ではなく、その段で着きうる原因で決まる。

1. `props` の検証（失敗したら `InvalidCreationParamError`）
2. `props` だけで決まる導出
3. 生成器の呼び出しと、戻り値の検証。戻り値は生の値のまま受け取り、取った直後に完成値と同じ項目のスキーマで確かめる
   （クロックなら `TimestampSchema`、IDジェネレーターなら `CommentIdSchema`）。不正なら `InvalidClockValueError` / 識別子の型ごとの class（`InvalidGeneratedCommentIdError` など）。
   生成器そのものが投げた例外は包まずにそのまま伝える。「値を返せなかった」と「返した値が不正だった」は別の失敗である
4. 生成器の戻り値を使う導出と、`props` と生成器の値の関係で決まる規則の検証（失敗は、その規則を表す名前のエラー）
5. 組み立てた完成値の検証

**5 の失敗の種別は、5 に着く原因が残っているかで決める。**
完成値スキーマに、`props` の値だけで違反しうる検査（項目をまたぐ `refine`、コレクションの件数・重複）があるなら、
5 は入力の不正を判定する場所なので `InvalidCreationParamError` を投げる（`WorkPeriod`・`Labels`）。
`props` を 1 で、生成器の値を 3 で、両者の関係を 4 で確かめ終えていて、5 に着く原因が残っていないなら、
5 の失敗は実装の不具合なので `FatalUnreachableError` を投げる（`Task`・`Comment`・`Project`・`Estimate`）。
「末尾だから `FatalUnreachableError`」とは決めない。

**`create` の依存は、副作用の無いもの（クロック、UUID の IDジェネレーター）に限る。**
保存先のカウンタを進める採番のように、永続状態を変える依存や外部の資源を消費する依存は `create` に渡さない。
それは `create` の外で呼び、結果を第1引数で渡す（参照実装の `TaskNumberIssuer` の番号は、`Task.create` の第1引数の `id` として渡る。
`TaskNumberIssuer` は「欠番を許す」と約束している）。

項目単体の不正は 1 で止まるので、そのときは生成器を呼ばない。
完成値の項目どうしの不整合（完成値スキーマの横断の `refine`）は、第1引数のスキーマが持たないので、生成器を呼んだあとの 5 で見つかる。
依存は副作用の無いものに限っているので、そのとき生成器を呼んでいても害は無い。
第1引数のスキーマを置く理由は、生成器を呼ばずに済ませることではない。

**別の集約の状態で決まる生成の前提は、その集約（生成する側）の業務操作に置く。**
「アーカイブ済みのプロジェクトにはタスクを作れない」は、`Task.create` ではなく `Project.createTask` に置く
（下の「ファイルの書き方」の「生成する側の集約の操作」の段落）。`create` の第1引数に別の集約を持ち込まない。

**上から順に見て、最初に当てはまったものを使う。選ばない。**

| # | 条件 | 書き方 |
|---|------|--------|
| 1 | 1つのプリミティブ値を包む | `createXxx(value: string)` のように生の型で受ける。第1引数のスキーマも `XxxSchemaInput` も作らない（`z.input` が `string` そのものなので置く意味がない）。ブランドを作る葉なので、ここだけは生の値を受ける |
| 2 | 受け取る項目が**すべて**、完成値にも同じ名前・同じスキーマで存在する（完成値の項目の一部だけを受け取ってもよい）。完成値に無い項目や、名前・表現を変える項目を1つでも受け取るなら4にする | `z.strictObject(XxxFields).pick({ ... }).readonly()` |
| 3 | コレクション | `z.array(要素スキーマ).readonly()`。要素のスキーマは完成値と共有し、件数・重複・順序のような横断検証は完成値スキーマに置いたままにする |
| 4 | それ以外 | 独立した `z.strictObject({ ... }).readonly()` |

`.readonly()` を付けるのは、完成値が読み取り専用なのに手前の入力だけ書き換えられるのを避けるためである。
付けないと `z.output` から取った型に `readonly` が乗らない（実測）。

```ts
// 2. フィールド定義の部品から pick する
export const CreateProjectPropsSchema = z
	.strictObject(ProjectFields)
	.pick({ id: true, name: true, leadId: true })
	.readonly();

// 2. 状態別ユニオンでも同じ。派生元が XxxCommonFields になるだけ
export const CreateTaskPropsSchema = z
	.strictObject(TaskCommonFields)
	.pick({
		id: true,
		title: true,
		priority: true,
		labels: true,
		creatorId: true,
		pullRequestUrl: true,
	})
	.readonly();

// 2. 全項目を受け取るモデルも同じ形で書く
export const CreateWorkPeriodPropsSchema = z
	.strictObject(WorkPeriodFields)
	.pick({ startedAt: true, completedAt: true })
	.readonly();

// 3. コレクションは要素のスキーマを共有する
export const CreateLabelsPropsSchema = z.array(LabelSchema).readonly();
```

2と3に落ちるモデルは、完成値スキーマのフィールド定義を `XxxFields` 定数（コレクションなら要素のスキーマ）に出し、
完成値も第1引数もそこから組み立てる。項目のスキーマと JSDoc が1箇所に残る。

**状態別ユニオンで、生成直後の状態にだけある項目も受け取るなら、その枝の項目も定数に出して
共通の部品と合わせてから pick する。** `z.strictObject({ ...XxxCommonFields, ...Xxx<状態名>Fields }).pick({ ... })`
と書き、完成値のその枝も同じ定数から組み立てる。共通の部品に無い項目があることを理由に3へ落とさない。
項目の名前もスキーマも完成値と同じなので、条件は2のままである。

4を使うのは、完成値に無い項目を受け取るとき、1つの入力から複数の完成値項目を作るとき、
同名でも入力側の表現が違うときである。独立させても**項目のスキーマは必ず再利用する**。
`PrioritySchema` を `z.enum([...])` と書き直さない。
**完成値に残らない (e) の項目と、その項目どうしの制約は、この第1引数のスキーマでしか検証できない。**

**`z.output` から取れば取り違えが止まるのは、その項目がブランドを持つときだけである。**
ブランドの無い文字列項目や列挙は、生の値がそのまま通る。全項目が守られると思わない。

**どの段になるかは、値オブジェクトかエンティティかでは決まらない。**
RGB の3値を持つ値オブジェクトのように、カラーコード1つを受け取って
`r` `g` `b` を導出する形なら4に落ちる。カラーコードは完成値に残らないので、
第1引数のスキーマを省くと、大文字や桁数の違いが検証されないまま別の色になる（実測）。

守ること。理由は Zod 4.6.5 で実測した挙動である。

| 規則 | 理由 |
|------|------|
| `XxxSchema.unwrap().pick()` で派生させない | 完成値のオブジェクトに横断検証が1つ足された瞬間、実行時例外に変わる。`unwrap()` しても `refine` は残るので回避できない |
| `.extend()` / `.safeExtend()` を使わない | 同名キーを黙って上書きする。`safeExtend` が型エラーで止めるのは型の合わない上書きだけで、制約を足すような互換のある上書きは型でも実行時でも黙って通る |
| `.omit()` で派生させない | 完成値に項目が増えると、第1引数に黙って流れ込む |
| `options[n]` の添字で枝から取らない | 枝を並べ替えると別の状態から取り出す |
| `z.object` から派生させない | `pick` した結果が余剰キーを通す。`strictObject` からなら拒否する |
| 第1引数のスキーマにオブジェクトレベルの `refine` を付けない。**例外は、完成値に残らない項目 (e) どうしの制約だけである** | 横断条件は完成値スキーマに1箇所だけ置く。ただし (e) の項目は完成値に無いので、完成値スキーマでは書けない。その制約は第1引数のスキーマに置くほかない |

## satisfies を付ける場所

**判断はモデルの種類ではない。オブジェクトリテラルを `parse` や `safeParse` に直接渡しているかどうかで決まる。**
`parse` の引数は `unknown` なので、そこだけ型検査が抜ける。

```ts
// ✓ satisfies が要る。リテラルを直接 safeParse に渡している
const result = TaskSchema.safeParse({
	id: input.id,
	title: input.title,
	priority: input.priority,
	labels: input.labels,
	creatorId: input.creatorId,
	createdAt: createdAt.data,
	comments: [],
	status: "backlog",
} satisfies TaskSchemaInput);

// ✓ 値オブジェクトの組み立てでも同じ。ここも unknown を通る
const period = WorkPeriodSchema.safeParse({
	startedAt: task.startedAt,
	completedAt: params.at,
} satisfies WorkPeriodSchemaInput);

// 要らない。リテラルではなく、検証を通った値をそのまま渡しているので形は決まっている
function createEstimate(props: CreateEstimateProps): Estimate {
	const input = CreateEstimatePropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("Estimate.create", input.error);
	}
	const result = EstimateSchema.safeParse(input.data);
	if (!result.success) {
		throw new FatalUnreachableError("Estimate.create", result.error);
	}
	return result.data;
}
```

配列だけの完成値（`Labels`）には付けない。要素は `Label` 型で渡ってくるので、
`satisfies LabelsSchemaInput`（`string[]`）を付けても新しく止まるものがない。
付けるのはキーを持つオブジェクトリテラルだけである。

単一値の値オブジェクトは `create` が受け取った値をそのまま渡すだけなので出番がない。
リテラルを組み立てるのは、エンティティの生成と状態遷移、コレクションの操作、導出関数。
**入れ子の値オブジェクトを含むリテラルほど付ける価値が高い。** 内側の項目を生の値で書くので、取り違えても型で止まらない。

**DTO には `XxxSchemaInput` を作らない。** DTO のリテラルをどこで検査するかは `references/persistence.md` にある。

**`satisfies Xxx` と書かない。必ず `satisfies XxxSchemaInput` にする。**
書き手が組み立てているのは検証前の値なので、相手も検証前の型にする。

**`satisfies` が見るのは型だけである。** 値の制約を検査しないし、スプレッドで引き継いだ
ブランドを無効にもしない。`{ ...task } satisfies Task` も `{ ...task } satisfies TaskSchemaInput` も、
余剰キーを含むオブジェクトをスプレッドした値も、すべてコンパイルを通る（実測）。
止まるのは項目の書き忘れと型違いだけで、実行時の制約とスプレッド元から混ざった余剰キーは
完成値スキーマが落とす。

`satisfies` は型注釈と違って推論結果を保つ。`const x: TaskSchemaInput = {...}` と書くと型が広がるが、
`satisfies` なら書いたリテラルの型のまま検査だけが走る。

**型アサーションを書かない。** `as`（`as const` を除く）が要るなら、スキーマか関数の
引数型が食い違っている。型を直して消す。消せないなら、その API をこの層で使わない。
参照実装が `z.templateLiteral` を先頭に置かないのも、保存キーを `string` + `regex` で
書くのも、`as` が要らない形を選んだ結果である。


## ファイルの書き方

1ファイル1概念。そのモデルの業務の規則を表すエラー class も、そのモデルの契約の一部なので同じファイルに置く（`references/errors.md`）。セクションはコメントで区切る。

**既存のコードに区切りの流儀があれば、それに合わせる。** なければ次を使う。

```ts
// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

// -------------------------------------------------
// エラー
// -------------------------------------------------

// -------------------------------------------------
// 公開 API
// -------------------------------------------------
```

「エラー」はそのモデルの業務の規則を表すエラー class があるときだけ置き、「公開 API」の1つ上に置く（足したセクションがあっても、その後ろ）。エラー class は名前付きで export し、「公開 API」のオブジェクトには入れない。
必要に応じて `等価性` `読み取り` `比較` `業務操作` `演算` `変換` を足す。ここに無い名前を足してよいが、
同じ種類の関数を別の名前のセクションに分けない。「エラー」を置くなら「公開 API」の直前、「公開 API」は必ず最後に置く。
インターフェースのファイル（リポジトリ・ドメインサービス）には「公開 API」が無いので、「型定義」の後ろ、ファイルの最後に「エラー」を置く。

**「スキーマ・型定義」に関数を置かない。** ここに入るのは `Fields` 定数・スキーマ・型・定数だけである。
関数は役割ごとのセクションに入れる。**どのセクションかは、その関数の役割で決まる。**
DTO の保存キーを作る `to<DTO 名>PKSK` / `to<DTO 名>PK` は、ドメインの値から
保存先の表現を作るので `to` / `from` と同じ「変換」に置く。横断検証から呼ぶ
検証前の文字列を受ける版（`toPKSKFromRawId`）も、同じ役割なので同じセクションに置く。

スキーマの `superRefine` から呼ぶ関数を後ろに置いてよい。`function` 宣言は巻き上げられ、
`superRefine` のコールバックが走るのはパース時なので、モジュールの評価時には呼ばれない。

**読み取りの関数は、モデルだけが知っている規則を隠すときだけ置く。** 識別子の形式を分解する、
単位や丸めの規則を適用する、といった「呼び出し側に書き写させたくない処理」がある場合である。

```ts
// ✓ 置く。PROJ-1 という形式を知っているのはこのモデルだけ
function taskIdProjectId(id: TaskId): ProjectId {
	const [prefix] = id.split("-");
	const result = ProjectIdSchema.safeParse(prefix);
	if (!result.success) {
		throw new FatalUnreachableError("TaskId.projectId", result.error);
	}
	return result.data;
}

// ✗ 置かない。呼び出し側が task.comments.length と書けば済む
function taskCommentCount(task: Task): number {
	return task.comments.length;
}
```

**取れないはずの値を既定値でごまかさない。** `?? ""` や `?? 0` で型の都合を埋めると、
不変条件が壊れたときに誤った値が下流へ流れる。上の例で空文字を返すと、呼び出し側は
存在しないプロジェクトの保存キーを組み立てる。検証済みの値からの導出なら取れないことは無いので、
`FatalUnreachableError` を投げる（`references/errors.md` を参照）。到達しないのでテストは書けなくてよい。
取れない場合が本当にあるなら、それは検証済みの値ではない。何が起きたかを表す名前のエラーにする。

**例外は横断検証から呼ばれる導出関数だけである。** そこでは投げずに `Xxx | undefined` を
返す（規則6）。`refine` の中で添字を使うなら、既定値を置くかわりに `undefined` を
そのまま判定する。

```ts
// ✗ 前の要素が無いときに "" と比べてしまう
.refine((ls) => ls.every((l, i) => i === 0 || (ls[i - 1] ?? "") <= l))

// ✓ 無いことをそのまま判定する
.refine((ls) =>
	ls.every((l, i) => {
		const prev = ls[i - 1];
		return prev === undefined || prev <= l;
	}),
)
```

**フィールドを読むだけの関数を並べない。** 値は `readonly` で公開されているので、
包み直しても呼び出し側の書く量が増えるだけである。

**業務操作は、第1引数に更新の対象になるモデル、第2引数にそれ以外の入力をまとめたパラメータオブジェクトを取る。**
生成器を使う業務操作は、第3引数に依存を取る（`create(props, deps)` と同じく依存を最後に置く）。

```ts
Task.start(task, { assigneeId, at });
Task.complete(task, { at });
Task.addComment(task, { authorId, body }, deps); // 子の Comment を作るので、Comment の依存を受け取る
Task.reopen(task); // 対象以外の入力が無ければ第2引数を置かない
```

判断が「対象か、対象以外か」の1回で終わる。任意項目が増えても、同じ型の引数が並んでも、
項目を足しても署名の形が変わらない。位置引数だけにすると、任意項目を飛ばせず、
同じ型の引数の取り違えも止まらない。

生成・復元・等価性は固定の形なので、この規則の対象外。
`create(props, deps)` / `reconstruct(value)` / `equals(a, b)`。

**子エンティティを作る入口は、集約ルートの業務操作に置く。** アプリケーション層は子の `create` を直接呼ばず、
集約ルートの操作（`Task.addComment`）を呼ぶ。操作が子の `create` を中から呼び、子の識別子と作成時刻は、
操作が受け取った依存から決まる。子を外で作って渡す形（`Task.addComment(task, { comment })`）にすると、
子の採番と時刻が集約の外で決まり、集約ルートは出来上がった子を後から確かめることしかできない。
同じ子の値を2つの集約に足すことも止まらない。
子の `create` は子のファイルに置いて公開したままにし（集約ルートとテストが呼ぶ）、JSDoc に集約の外から呼ばないことを書く。
子の `create` が投げたエラー（`InvalidCreationParamError`、依存の値が不正なときの `InvalidGeneratedCommentIdError` / `InvalidClockValueError`）は、
操作からそのまま伝わる。操作の `@throws` にも書く（`references/errors.md`、`references/comments.md`）。

**集約の中の子を書き換える業務操作は、集約ルートに置き、子を識別子で探す。**
`Task.editComment(task, { commentId, body })` のように、第2引数で子の識別子と新しい値を受け取り、集約ルートが子を探して書き換えた集約を返す。
子のファイルに書き換えの関数を置くなら、集約ルートの操作がそれを中から呼ぶ（子を作る入口と同じ考え方）。
**識別子の子が集約の中に無いのは、業務操作の前提の違反である。** 何が起きたかを表す名前のエラー（例: `CommentNotFoundError`）を投げ、
集約の識別子と探した子の識別子を項目に持たせる。元の値をそのまま返したり、`FatalUnreachableError` にしたりしない。
呼び出し側の入力の誤りでも起きるからである。このエラーは集約ルートのファイルに置く。

**生成する側の集約の操作（ファクトリメソッド）は、第1引数に生成する側の集約を取り、新しい集約を返す。生成する側は変えない。**
別の集約の状態で決まる生成の前提（「アーカイブ済みのプロジェクトにはタスクを作れない」）は、生成する側の集約の操作に置く。
`Project.createTask(project, params, deps)` は、アーカイブ済みでないこと、渡されたタスクの識別子がそのプロジェクトのものであることを確かめてから、
中で `Task.create(params, deps)` を呼んで新しい `Task` を返す。`Project` は変わらないので、保存するのは作った `Task` だけである。
**そのパラメータの型は、生成されるモデルの `CreateXxxProps` を別名で使ってよい**（`CreateTaskInProjectParams = CreateTaskProps`）。
中身が生成されるモデルの第1引数そのものなので、項目の一覧を手で書き直すと2か所に分かれてずれる。入力の検証は生成されるモデルの `create` が行い、
失敗はそのまま伝わる（子の `create` と同じ）。
確かめるのは渡された集約の状態なので、確かめたあとに別の操作がその集約を変えた場合（確かめたあとのアーカイブ）は防がない。
同時更新は楽観ロックでよい、という要件のもとで許す（`references/persistence.md` の「同時更新」）。
生成されるモデルの `create` は公開したままにする（生成する側の操作とテストが呼ぶ）。JSDoc に、作る入口は生成する側の操作だと書く。

**演算も同じ形にする。** `Estimate.add(estimate, { addend })`、
`Labels.add(labels, { label })` のように、第2引数はパラメータオブジェクトにする。
入力が1つでも同じである。名前が付くぶん呼び出し側で取り違えにくくなる。

**状態が変わらない呼び出しをどう扱うかを決める。** すでに追加されているラベルをもう一度足す、
すでにアーカイブしたものをもう一度アーカイブする、といった呼び出しを成功として受け入れるか、
前提条件の違反として拒否するかは仕様である。受け入れるなら、元の値をそのまま返すことも
契約に含める。上限の検査より先に受け入れるかどうかで結果が変わるなら、その順序も仕様である。

### 型を置くセクション

**引数や依存の型は、それを使う関数と同じセクションに置く。** スキーマ・型定義の節にまとめない。

| 型 | 置くセクション |
|----|---------------|
| `CreateXxxPropsSchema` / `CreateXxxProps` | ファクトリー関数 |
| `XxxDeps` | ファクトリー関数 |
| `<ローカル関数名>Params` | 業務操作 |
| `Xxx` / `XxxSchemaInput` / 完成値スキーマ | スキーマ・型定義 |
| そのモデルのエラー class | エラー |

離れた場所にあると、関数を読むために上に戻ることになる。

### 業務操作で Zod を使わない

**Zod スキーマを定義するのは「完成値」と「create の第1引数」の2つだけ。操作用の入力スキーマは書かない。**

**例外は、値オブジェクトに切り出していない項目を書き換える操作である。** 表題のような項目は生の `string` のまま持つので、
操作の引数もブランドの付かない値で届き、下の「境界で検証された値を受け取る契約」が成り立たない。
新しいスキーマは定義せず、完成値と同じ項目のスキーマ（`TaskCommonFields.title`）で `safeParse` し、
失敗は何が起きたかを表す名前のエラー（`InvalidTaskTitleError`。`issues` を持つ）に包む。
長さや前後の空白の制約を操作の側に書き写さない。実物は `example/domain/entity/Task.ts` の `renameTask`。

**もう1つの例外は、操作だけが持つ引数の条件である。** 「使うポイント数は1以上の整数」のように、完成値のどの項目の制約とも違い、
その操作の引数にだけ掛かる条件は、その操作の前提条件として扱う。引数は生の値（`points: number`）で受け、
**関数冒頭の `if` で確かめ、その規則だけを表す名前のエラー（`InvalidRedeemPointsError` のように）で拒否する。**
スキーマは作らない。**条件を持たせるためだけに、引数用の値オブジェクトを作らない。** 作ると違反はその値オブジェクトの `create` が投げる
`InvalidCreationParamError` になり、どの操作のどの規則に反したのかが種別から読めない（`SKILL.md` の「型で取り違えを止めたいという理由だけで切り出さない」と同じ）。
似た条件でも規則が違えば class を分ける（使うポイント数の不正と、調整で置き換える残高の不正）。どちらの規則かを呼び出し側から渡す文で区別しない。
調整で置き換える残高のように、引数がそのまま完成値の項目になるなら、上の書き換えと同じく項目のスキーマで検証して名前のエラーに包む。

遷移の前提条件は関数冒頭の素の `if` で書く。TypeScript の制御フロー解析で対象が絞れるので、
`refine` の型述語も、状態を再確認する死んだ分岐も要らない。

```ts
// 抜粋。全体は example/domain/entity/Task.ts の startTask
function startTask(task: Task, params: StartTaskParams): Task {
	if (task.status !== "backlog") {
		throw new TaskStatusMismatchError("Task.start", task.id, "backlog", task.status);
	}
	// 作成より前の着手時刻も、ここで TaskStartedBeforeCreationError として弾く
	const result = TaskSchema.safeParse({
		...task,
		status: "inProgress",
		assigneeId: params.assigneeId,
		startedAt: params.at,
	} satisfies TaskSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Task.start", result.error);
	}
	return result.data;
}
```

**業務操作は、境界で検証された値を受け取る契約とし、引数の形式を入り口で再検証しない。**
引数はブランド付きで渡ってくるので、呼び出し側は完成値スキーマを通した値を渡す約束になっている。
操作に固有の前提条件は冒頭の `if` で、組み立てた結果の不変条件は完成値スキーマで検証する。
ただし**ブランドが付いているだけでは、生成・復元関数の戻り値だとは言い切れない。**
スプレッドで作った値も同じ型になり、凍結もされない（実測）。型ガードを書かない（規則14）のは、この穴を公開 API から開けないためである。ドメインの外でスプレッドして完成値を作ることも、同じ規則14で禁じている。
外から来た変更可能なオブジェクトを保持するなら、生成・復元関数が返した値を使う。`strictObject` で包み直しても集約全体を走査するだけで、
新しく止まる呼び出しはない。操作スキーマが買っていたのは `ZodError` という型だけだった。

**`createXxx` が create の第1引数のスキーマで `props` を検証するのは、この契約の対象外である。**
`CreateXxxPropsSchema` は `create` が何を受け取るかの定義そのもので、外から来た値を初めて受ける
境界の検証にあたる。完成値スキーマに渡すのは `props` から組み直した別のオブジェクトになりうるので、
`props` そのものを検証できる場所はここしかない。`CreateXxxProps` がブランド付きでも消さない。

パラメータの型は手で書く。プロパティに JSDoc を書けば呼び出し側のホバーに届く（実測で確認）。

**遷移先の状態に無い項目は、分割代入で外してから組み立てる。**
`const { startedAt: _startedAt, ...rest } = task` の形にする。`undefined` を代入すると
キーが残って `strictObject` が落とし、`delete` は引数を書き換える。

### 決まりごとの置き場

**種類ごとに1箇所に固定する。** 同じ条件を2箇所に書かない。

ただし、**完成値の不変条件を操作の冒頭の `if` で先取りして検査してよい。**
目的はエラーの種別を分けることである。冒頭で弾けば「呼び出し側の誤り」を表す名前のエラーで
投げられ、`superRefine` まで来た違反は実装の不具合だけになる。
先取りするときは、完成値スキーマと同じ違反を検出する条件にする。式は同じでなくてよいが、
上限などの定数は共有する。`.max(COMMENT_LIMIT)` と `if (length >= COMMENT_LIMIT)` は
同じ件数制約を見ている。数字を2箇所に書くと片方だけ直る。
「2箇所に書かない」が禁じているのは、遷移の前提条件を完成値スキーマに持ち込むことと、
値の範囲・形式を集約側に書き写すことである。

| 決まりごと | 置き場 | 例 |
|------------|--------|-----|
| 状態の不変条件。1つの完成値だけを見て決まる | 完成値スキーマ（`superRefine` 含む）のみ | 着手のタイムスタンプは作成以降。その状態に無いキーを拒否する |
| 遷移の前提条件。操作前の状態との関係が要る | その操作関数の冒頭の `if` のみ | バックログのタスクだけ着手できる |
| 操作の引数だけに掛かる条件。完成値のどの項目の制約とも違う | その操作関数の冒頭の `if` のみ（上の「業務操作で Zod を使わない」） | 使うポイント数は1以上の整数 |
| 値そのものの範囲・形式 | その項目の完成値スキーマ。値オブジェクトに切り出した項目はその値オブジェクト、切り出さない項目は持ち主のエンティティのフィールド定義 | 日時の非負整数と上限は `TimestampSchema`、表題の長さと前後の空白は `TaskCommonFields.title` |

「着手のタイムスタンプは作成以降」を `start` にだけ書くと、壊れた保存値を `reconstruct` が通してしまう。
完成値だけで判定できる条件は、必ず完成値スキーマに置く。

逆に「バックログのタスクだけ着手できる」は完成値スキーマには書けない。
完成値スキーマは完成した1つの値しか見えず、どの状態から来たかを知らないためである。

### superRefine に書く条件

**独立した条件は、どれに違反したかを区別できる形で検証する。**
複数の条件を1つの真偽値と共通メッセージにまとめない。オブジェクトの横断検証では、
問題のある項目を `path` に指定する。受け取った側が、どこを直せばよいか分かる。

**`superRefine` に書くのは、2つ以上の項目を同時に見ないと判定できない条件だけ。** 1つの項目だけで決まる条件は、その項目のスキーマに書く。値オブジェクトが持てる条件は値オブジェクトに寄せる。

| 条件 | 置き場 |
|------|--------|
| 着手のタイムスタンプは作成以降 | `superRefine`。`startedAt` と `createdAt` の両方が要る |
| コメントの識別子が重複しない | `comments` の `refine`。配列全体を見ないと分からない |
| コメントは投稿順に並ぶ | `comments` の `refine`。隣り合う要素の関係 |
| 表題は1文字以上200文字以下 | `TaskCommonFields.title`。1つの値だけで決まる |
| コメントは50件まで | `comments` の `.max(COMMENT_LIMIT)`。その項目だけで決まる |
| 完了のタイムスタンプは着手以降 | `WorkPeriod` のスキーマ。その値オブジェクトの中で閉じる |

**検証は同期で完結させる。** `refine` / `superRefine` / `check` のコールバックから Promise を返さない。
入れ子のスキーマも同じである。同期の `safeParse` は非同期の検証に出会うと例外を投げるので（実測）、
`create` / `reconstruct` / 業務操作が失敗を名前の付いたエラーに包めなくなる。
外部への問い合わせが要る条件は、スキーマの外で扱う。

**`superRefine` に書けるのは検証だけである。** 値を変えない。例外を投げる関数を呼ばない。呼ぶと `safeParse` を素通りして、その完成値スキーマを検証しているすべての場所で意図しない例外になる（規則6）。

判定に使ってよいのは、渡ってきた値の型だけである。
**形式も仮定しない。** `regex` や `uuid` の違反は継続する issue なので、`superRefine` は
その項目が形式を満たしていなくても走る。項目を分解する関数を呼ぶなら、壊れた文字列を
渡しても例外を投げないことを確かめる。壊れた文字列から作った値が不一致になって
余分な issue が積まれるのは許容する。**要素の有無と計算結果は仮定しない。** 配列の添字は `?.` で受け、足し算の結果が `Number.MAX_SAFE_INTEGER` に収まるかは自分で確かめる。

### 分岐の書き方

**三項演算子はネストさせない。3つ以上に分かれるなら `switch` にする。**
判別子を持つユニオンを状態ごとに組み立てる場面が該当する。
ネストした三項は、どの条件がどの枝に対応するかを字下げだけで表すので、
枝が増えるほど読み違える。

**`switch` には `default` を必ず置き、判別子を `satisfies never` で検査してから
`FatalUnreachableError` を投げる。** すべての判別子を書いてあれば `default` には来ない。
判別子を1つ足して `case` を書き忘れると `satisfies never` がコンパイルを止める。
`default` で投げるだけでは止まらない。`default` が `return` の代わりになるので、
`noImplicitReturns` も通ってしまう（実測）。

```ts
// 抜粋。全体は example/infrastructure/dto/DynamoDBTaskItemDTO.ts の toDynamoDBTaskItemDTOFields
switch (task.status) {
	case "backlog":
		return { ...common, status: "backlog" };
	case "inProgress":
		return { ...common, status: "inProgress", assigneeId: task.assigneeId, startedAt: task.startedAt };
	case "done":
		return { ...common, status: "done", assigneeId: task.assigneeId, workPeriod: { /* … */ } };
	default:
		task satisfies never;
		throw new FatalUnreachableError("DynamoDBTaskItemDTO.to");
}
```

`switch` は値を返す式ではないので、組み立てと検証は関数を分ける。
組み立てる関数が `switch` で `return` し、呼ぶ側が `safeParse` する。
