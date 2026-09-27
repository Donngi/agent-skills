# Zod 4.6 以上と TypeScript の落とし穴

すべて実行して確認した挙動。知らずに書くと踏む。
Zod 4.6.5 と TypeScript 6.0.3 で確かめた挙動を前提にする（このスキルの対応範囲は Zod 4.6 以上。参照実装の型検査とテストは 4.6.0 でも通る）。
版を上げたら確かめ直す。

---

## 値を変える API

### z.url() は前後の空白を暗黙に除去する

```ts
z.url().parse(" https://example.com/a "); // "https://example.com/a"
```

**後ろに `refine` を置いても拒否できない。** `refine` が見るのは除去後の値だから。

### z.url() は値の途中の改行・タブ・CR を取り除く

`"https://github.com/org/repo/pull/\n12"` を渡すと、`\t` `\n` `\r` を取り除いた `"https://github.com/org/repo/pull/12"` を返す。
壊れた値が完成値になり、`reconstruct` に渡した保存値が黙って別の URL に補正される。

値の途中の半角空白は除去されず、そのまま受理される（`"https://github.com/a b"` が通る）。
前後の制御文字（U+0000〜U+001F）、`\`、ゼロ幅空白も、書き換えずにそのまま受理する（実測。`"\u0001https://github.com/a"`・`"https://github.com\\a"` が入力のまま返る）。
参照実装の `PullRequestUrl` は、空白とバックスラッシュを除く印字可能な ASCII 文字だけを受け入れる `refine` を手前に置いて、これらをまとめて拒否している。

**`z.url()` に渡す前に、前後の空白と `[\t\n\r]` を含む値を拒否する。**

```ts
// ✗ 効かない
z.url().refine((v) => v === v.trim());

// ✓ 手前に置く
z.string()
	.refine((v) => v === v.trim(), {
		error: "URL の前後に空白を含めることはできません",
	})
	.refine((v) => !/[\t\n\r]/.test(v), {
		error: "URL に改行やタブを含めることはできません",
	})
	.pipe(z.url({ protocol: /^https?$/ }));
```

**検証専用かどうかは API 名の禁止リストだけで判定しない。** 使う版でその API が入力値を変えないことを確かめる。版を上げたら確かめ直す。

### .default() は既定値を検証しない

```ts
z.string().min(3).default("ab").parse(undefined); // "ab" が返る
z.string().min(3).prefault("ab").parse(undefined); // 例外
```

どちらもドメインでは使わない。既定値は呼び出し側に書かせる。

---

## 形式の検証

### z.uuid({ version: "v4" }) は大文字を通す

```ts
z.uuid({ version: "v4" }).safeParse("3F1A8C2E-9B47-4D6A-8E21-5C7B0F9D1A34")
	.success; // true
```

そのまま返るので、大文字小文字だけ違う同じ UUID が別の値として共存する。`===` も保存キーも分裂する。
UUID は大文字小文字を同一視する形式なので、受け入れる表記を小文字に決めるなら、小文字を要求する `refine` を足す。

```ts
z.uuid({ version: "v4" }).refine((v) => v === v.toLowerCase(), {
	error: "ID は小文字です",
});
```

### z.templateLiteral は構成要素の refine を実行しない

```ts
const inner = z.uuid({ version: "v4" }).refine((v) => v === v.toLowerCase());
z.string().pipe(z.templateLiteral(["cmt_", inner]));
// 大文字の UUID が通る
```

制約は完成した文字列側に書く。

数値の構成要素は、`z.number().int().positive()` の `positive` だけが検査されない。
`int` は検査され、`PROJ-1.5` は拒否される。`PROJ-0` `PROJ-01` `PROJ--1` は通る（実測）。
`z.string()` の `regex` は効く。

### z.templateLiteral の構成要素で regex と min/max を併用すると min/max が無視される

```ts
// min/max だけ → 効く
z.string().pipe(z.templateLiteral(["PROJ-", z.string().min(3).max(3)]));
// "PROJ-12" → false

// regex を併用 → min/max が無視される
z.string().pipe(
	z.templateLiteral([
		"PROJ-",
		z
			.string()
			.min(3)
			.max(3)
			.regex(/^[0-9]+$/),
	]),
);
// "PROJ-12" → true
```

桁数は `regex` の中に `{6}` のように書き切る。

### z.templateLiteral を先頭に置くと入力型が絞られる

```ts
// z.input は `${string}-${number}`
z.templateLiteral([ProjectIdSchema, "-", z.number().int().positive()]);

// z.input は string
z.string().pipe(z.templateLiteral([ProjectIdSchema, "-", ...]));
```

境界で `as` が必要になるので、`z.string()` で受けてから `pipe` する。

---

## 例外の漏れ

### 非同期の検証は同期の safeParse で例外になる

```ts
z.string().refine(async () => true).safeParse("x");
// throws: Encountered Promise during synchronous parse. Use .parseAsync() instead.
```

コールバック自身が例外を投げなくても、Promise を返すだけで同期の `safeParse` が落ちる。
`create` / `reconstruct` / 業務操作が失敗を名前の付いたエラーに包めなくなるので、完成値スキーマに非同期の検証を入れない。

### refine や check の中の例外は safeParse からも漏れる

```ts
const S = z
	.string()
	.refine((v) => v === encodeURIComponent(decodeURIComponent(v)));
S.safeParse("%"); // URIError を投げる。失敗結果を返さない
```

`new URL()`、`decodeURIComponent`、`JSON.parse` のように不正入力で投げる処理は、その呼び出しだけを `try/catch` で包んで `false` を返す。

### 横断検証から例外を投げうる関数を呼ぶと safeParse が例外を投げる

```ts
// ✗ totalOfEstimates が内部で例外を投げる
.superRefine((v, ctx) => {
	if (v.subtasks.length === 0) return;
	if (!estimateEquals(v.totalEstimate, totalOfEstimates(v.subtasks))) {
		/* ... */
	}
})
```

単位混在、桁あふれの入力で `safeParse` が例外を投げる。**導出関数は `Xxx | undefined` を返す形にする。**

```ts
function totalOfEstimates(subtasks: readonly Subtask[]): Estimate | undefined {
	// noUncheckedIndexedAccess の下では、長さの判定だけでは添字の undefined が消えない。
	// 先頭要素を取り出して undefined を判定する
	const first = subtasks[0];
	if (first === undefined) return undefined;
	if (new Set(subtasks.map((s) => s.estimate.unit)).size !== 1)
		return undefined;
	let amount = 0;
	for (const subtask of subtasks) amount += subtask.estimate.amount;
	if (!Number.isSafeInteger(amount)) return undefined;
	const parsed = EstimateSchema.safeParse({
		amount,
		unit: first.estimate.unit,
	} satisfies EstimateSchemaInput);
	return parsed.success ? parsed.data : undefined;
}
```

### 要素が個別に有効でも演算結果が有効とは限らない

```ts
const subtasks = Subtasks.create([
	{
		id: "PROJ-2",
		estimate: { amount: Number.MAX_SAFE_INTEGER, unit: "point" },
	},
	{ id: "PROJ-3", estimate: { amount: 1, unit: "point" } },
]);
// createSubtasks は成功する。各サブタスクは有効なので当然
```

長さを確かめるだけでは足りない。積や和の範囲も確かめる。

---

## 検証の順序

### 非継続の issue が出ると横断検証は走らない

| 子の失敗 | オブジェクトの `refine` / `check` / `superRefine` |
|---|---|
| `too_small` / `too_big`（長さ・範囲の違反） | 走る |
| `invalid_format`（`regex`・`uuid` などの形式違反） | 走る |
| 子の `refine` の失敗（`custom`） | 走る |
| `invalid_type`（型違反。キーの欠落も含む） | 走らない |
| `invalid_value`（列挙・`literal` の外の値） | 走らない |
| `unrecognized_keys`（`strictObject` の余剰キー） | 走る。`unrecognized_keys` と横断検証の issue が両方積まれる |

**型は仮定してよいが、長さ・範囲・形式は仮定してはいけない。余剰キーが無いことも仮定しない。**
余剰キーを含む入力でも横断検証が走る。横断検証の中では、定義した項目の型だけを頼りにする。

**余剰キーと横断検証の違反を同時に含む入力で、issue の件数や一覧を期待値にしない。** 版を上げたときに
変わった実績がある。テストでは、失敗することと `unrecognized_keys` が含まれることだけを確かめる。
横断検証そのものは、余剰キーの無い入力で確かめる。

### check の issue は既定で後続を止める。superRefine は続行する

用途で選ぶ。単一の issue なら `refine`、複数積むなら `superRefine`、issue の中身を細かく制御するなら `check`。

---

## 型の挙動

### parse の引数は unknown

```ts
Schema.parse({ id, status: "backlog" }); // title を書き忘れてもコンパイルは通る
```

`satisfies XxxSchemaInput` を付けて形を検査する。`satisfies` が形を見て、`parse` が値の中身を見る。

### .brand() を inout にすると XxxSchemaInput が生の値で書けなくなる

エンティティのブランドは出力側だけに付ける。`inout` にすると、`reconstruct` に渡す保存値のような生の値が `XxxSchemaInput` を通らなくなる。

### create の第1引数の型は z.output から取る

```ts
export type CreateTaskProps = z.output<typeof CreateTaskPropsSchema>;
```

`z.input` から取ると参照する識別子の型が `string` になり、生の値も別種の識別子も渡せてしまう。

**`XxxSchemaInput` が `z.input` なのは意図的である。** こちらは `reconstruct` に渡す保存値と、
組み立てたリテラルに付ける `satisfies` の型なので、各項目まで生の型で書ける必要がある。
2つの型で `z.input` と `z.output` を使い分けていることに理由がある。

### refine を付けたオブジェクトに .omit() や .pick() を呼ぶと実行時例外

`.pick() cannot be used on object schemas containing refinements` になる。
**`.unwrap()` しても `refine` は残るので回避できない。** `.readonly()` を剥がしたあとの `pick` も同じ例外になる。

派生元は横断的な条件を付ける前の部品に限る。フィールド定義を定数に出し、
`z.strictObject(XxxFields).pick({ ... })` と書く。

### readonly() のままでは pick を呼べない

`z.strictObject({...}).readonly()` に `.pick` は存在しない（型エラーになり、実行時も `undefined`）。
**`.unwrap().pick()` で回避しない。** 今は通っても、完成値に横断的な `refine` を1つ足した時点で上の実行時例外に変わる。
派生は完成値スキーマからではなく、フィールド定義の定数から `z.strictObject(XxxFields).pick({ ... }).readonly()` と書く。
`discriminatedUnion` には `.pick` も `.shape` も無く、`.options` だけがある。

### .extend() は同名キーを黙って上書きする

```ts
z.strictObject({ a: z.string() }).pick({ a: true }).extend({ a: z.number() }); // 例外にならない。a は number になる
```

**`.safeExtend()` も実行時には同名キーを上書きし、例外にならない。** 違うのは型だけで、
元の項目と互換の無い型での上書き（`string` を `number` に）は型エラーで止まる。
互換のある上書き（`z.string()` を `z.string().min(2)` に）は型でも実行時でも通り、制約が黙って変わる。

`refine` を付けたオブジェクトへの `.extend()` は、例外にならずに通り、`refine` も残る。

create の第1引数を `extend` でも `safeExtend` でも組み立てない。

### z.object から pick すると余剰キーを通す

`strictObject` から pick した結果は strict のままだが、`z.object` からだと余剰キーを受理する。

### .readonly() は入口にも出口にも readonly を付け、凍結は1階層だけ

入れ子の配列やオブジェクトは凍らない。各階層に個別に付ける（付け方は `references/model-code.md` の「.readonly() の付け方」）。

### .optional() に undefined を渡すと項目が残る

```ts
z.strictObject({ b: z.number().optional() }).parse({ b: undefined });
// Object.hasOwn(out, "b") === true
```

多くの保存先がこれを拒否する。`strictObject` は定義に無い項目しか見ないので、これは止まらない（実測）。

**任意項目は `.exactOptional()` で宣言する。** 項目ごと無いことだけを許し、`undefined` は
`invalid_type` の issue で拒否する。issue の `path` はその項目を指す。

```ts
z.strictObject({ b: z.number().exactOptional() }).parse({ b: undefined });
// 拒否される（path は ["b"]）
```

`.exactOptional()` の `z.output` は `b?: number`（`| undefined` が付かない）になる。
`exactOptionalPropertyTypes` を有効にした tsconfig なら、`{ b: undefined }` の代入も型で止まる。

値が「無いかもしれない変数」から完成値を組み立てるときは、条件付きスプレッドで項目ごと落とす。

```ts
...(value !== undefined ? { key: value } : {})
```

### ブランドはスプレッドで引き継がれる

```ts
const broken: Task = { ...task, title: 壊れた値 }; // 型検査を通る
const ok = { ...task } satisfies Task; // これも通る
```

値を変更したら必ず完成値スキーマに通し直す。
**`satisfies` の相手に完成値の型を選ばない。** スプレッドがブランドを運ぶので検査にならない。
`satisfies` は型しか見ないので、相手を `XxxSchemaInput` にしてもスプレッドの値は通る。
止まるのは項目の書き忘れと型違いだけである。

### 識別子の取り違えは実行時に検出されない

同じ形式の識別子は、ブランドが違っても実行時には区別が付かない。

```ts
const CommentIdSchema = z
	.uuid({ version: "v4" })
	.brand<typeof CommentIdBrand>();
const UserIdSchema = z.uuid({ version: "v4" }).brand<typeof UserIdBrand>();
// id と authorId を入れ替えても safeParse は成功する
```

`XxxSchemaInput` では両方 `string` なので型でも止まらない。止められるのは
`CreateXxxProps` を `z.output` から取っている入口だけである。

### 余剰プロパティ検査はリテラル直書きにしか効かない

```ts
const a: Props = { ...valid, extra: 1 }; // コンパイルエラー
const src = { ...valid, extra: 1 };
const b: Props = src; // 通る
```

実行時は `strictObject` が止める。

### DTO の列挙を string にすると復元の引数型に合わない

```ts
unit: z.string(); // ✗ "point" | "hour" を要求する引数に渡せない
unit: z.enum(ESTIMATE_UNITS); // ✓
```

判別子と列挙は値の制約ではなく型である。DTO から値の制約を落としても、この2つは残す。
これは保存側の列挙を変換せずドメインへ渡す場合の話である。保存側の表現が違うなら、
型を合わせるのは変換を終えて `reconstruct` に渡す位置になる。

---

## codec

**この指針では使わない。** 保存の変換は `to` / `from` の2つの関数で書く。
他所で `z.codec` を読むときの参照として残している。

### コールバックの型

| 関数 | 引数 | 戻り値 |
|------|------|--------|
| `decode` | `z.output<A>` | `z.input<B>` |
| `encode` | `z.input<B>` | `z.output<A>` |
| `z.decode(codec, v)` | `z.input<A>` | `z.output<B>` |
| `z.encode(codec, v)` | `z.output<B>` | `z.input<A>` |

### encode の引数からはブランドが外れる

`encode` が受け取るのは `z.input<B>` なので、モデルのブランドも各項目のブランドも付いていない。
`TaskId` のようなブランド付きの型を要求する関数（保存キーの生成など）にそのままでは渡せない。
対応するスキーマの `safeParse` の成功結果を使えば型アサーションなしで渡せる（実測）が、
保存のためだけの再検証と、そこで失敗したときの分岐が増える。

### z.safeDecode は unknown を受け取れない

`z.safeDecode(codec, raw)` の引数は `z.input<A>` なので、`unknown` を渡すと型エラーになる（実測）。
保存先の応答を復元するなら `codec.safeParse(raw)` を使う。

### encode の戻り値型を注釈しないとリテラルが拡大する

`"META"` が `string` になってコンパイルエラーになる。リテラルを直接返しても起きる。
`encode: (v): Xxx => ({ ... })` と戻り値型を注釈し、リテラルを直接返せば止まる（実測）。
中間の変数に入れてから返すと、注釈があっても変数の時点で `string` に拡大して止まらない。
変数にも型を付けるか `as const` を付ける。

## JSON Schema

`z.toJSONSchema()` は制約が多い。

- `transform` を含むと失敗する
- `z.instanceof()` のような独自型を含むと失敗する
- `{ io: "input" }` を渡せば通ることがあるが、得られるのは入力側のスキーマ
- 自分で書いた `refine` と `check` の条件は生成物から消える。組み込みの `check` は残る

ドキュメントの自動生成や外部への公開を期待しない。必要なら境界専用のスキーマを別に定義する。

---

## 文字列と URL

### z.email() は大文字を通し、前後の空白は拒否する

`"USER@Example.COM"` は通る。`" user@example.com "` は通らない。つまり大文字小文字は呼び出し側の仕様として決める必要があり、Zod は決めてくれない。一意性の判定に使うなら、小文字化するのか、大文字違いを別人として扱うのかを業務で決めてから書く。ドメインでは正規化しないので、正規化が要るならアダプタ層で済ませてからドメインに渡す。

### z.url({ protocol }) のスキーム判定は大文字小文字を区別しない

`z.url({ protocol: /^https?$/ })` は `HTTPS://example.com` も通す。値は入力のまま返るので、
`"HTTPS://GitHub.com/a"` と `"https://github.com/a"` が別の値として共存する。スキームやホストを小文字に限りたいなら、`refine` で元の文字列を直接見る。

### z.url({ protocol }) は認証情報付きの URL を通し、`//` の無い URL は正規表現によって通す

`hostname: z.regexes.domain` を併せて指定したときの結果（実測）。

| 入力 | `protocol: /^https?$/` | `protocol: /^https$/` |
|---|---|---|
| `"https:github.com/a"`（`//` が無い） | 拒否 | 受理 |
| `"https://user:pw@github.com/a"`（認証情報付き） | 受理 | 受理 |
| `"HTTPS://GitHub.com/a"`（大文字のスキーム） | 受理 | 受理 |

`//` の無い形を通すかどうかは、`protocol` の正規表現で変わる。認証情報付きの URL は、どちらでも通る。
形を限りたいなら、`v.startsWith("https://")` のような検査を `refine` で足す（参照実装の `PullRequestUrl` は、
`https://` で始まること・認証情報を含まないこと・ホスト名が小文字であることを、それぞれ `refine` で足している）。

### new URL はホスト名を小文字にする

`new URL("https://EXAMPLE.com").hostname` は `example.com` を返す。URL を分解して比較や検証をすると、入力になかった正規化が入り込む。完成値スキーマの中で `new URL` を使うと、受理集合が「見た目どおり」でなくなる。

### 長さの単位はコードポイント

`z.string().min` / `max` / `length` は、コードポイントで数える。サロゲートペア（`"😀"` や `"𠮷"`）も1と数え、`z.string().max(1)` は受理する。
見た目が1文字でも、複数のコードポイントでできた文字は複数と数える。`e` に結合アクセントを付けた `"é"` は2、
ZWJ でつないだ `"👨‍👩‍👧"` は5になり、`max(1)` は拒否する（実測）。
境界の文字数ちょうどの値にサロゲートペアを含めたテストで、この単位を固定しておく。

「10文字まで」が業務上どの単位なのかを決めてから書く。**単位が業務上の意味を持つなら `min` / `max` に任せず、
単位を明示した `refine` を自分で書く。** コードポイントなら `[...v].length`、書記素なら `Intl.Segmenter` で数える。
保存先の上限（バイト数など）に合わせるなら、その単位で数える。

---

## 数値

### 積み上がる値の桁あふれは number では検査が要る

`z.int()` の上限は `Number.MAX_SAFE_INTEGER`。サブタスクの見積りの合計のように積み上がる値は、加算の途中で `Number.MAX_SAFE_INTEGER` を超えうる。導出関数の中で `Number.isSafeInteger` を確認し、超えたら `undefined` を返す。

**`bigint` を選べば、この検査自体が不要になる。** 保存先で文字列にする手間と引き換えに、桁あふれの分岐が消える。どちらを選ぶかは、保存先が `bigint` をどう扱うかで決める。

### 引数なしの sort() は要素を文字列として比べる

`[10, 9, 100].sort()` は `[10, 100, 9]` になる（JavaScript の仕様）。コレクションを並べ替えてから順序の `refine`（`prev <= v`）で検査すると、
数値の集合では並べ替えの結果が検査に落ちる。比較関数を渡し、`refine` と同じ比較にそろえる。文字列でも、`localeCompare` は `<=` と順序が違うので混ぜない。

---

## 公開の形にまつわる TypeScript の挙動

### 完成値スキーマを公開オブジェクトの中に置くと型が循環する

```ts
// ✗
export type Task = z.output<typeof Task.Schema>;
export const Task = {
	Schema: z.strictObject({ ... }),
	reconstruct(v: unknown): Task { return Task.Schema.parse(v); },
};
```

`TS2456 Type alias 'Task' circularly references itself` と `TS7022` になる。スキーマはオブジェクトの外で `const` として宣言する。

### 公開オブジェクトにネストした型は置けない

`export type Task` と `export const Task` を同時に出しても、`Task.CreateProps` を型として書くと `TS2702 'Task' only refers to a type, but is being used as a namespace here` になる。型だけの `namespace` を足せば書けるが、その namespace に値を1つでも入れると `TS2300 Duplicate identifier` で壊れる。**型は平置きで export する。** `CreateTaskProps` のように名前にモデル名を含める。

### import type から値の操作は呼べない

`import type { Task }` で入れた `Task` から `Task.create()` を呼ぶと `TS1361 'Task' cannot be used as a value because it was imported using 'import type'` になる。値も使う箇所は `import { Task, type TaskDeps }` と混ぜて書く。

### @ts-expect-error はエラーが出る行の直上に置く

関数にオブジェクトを渡した場合、項目の型が合わないエラーは呼び出しの行ではなく**問題のあるプロパティの行**に出る。

```ts
Task.create(
	{
		...base,
		// @ts-expect-error 別種の識別子は渡せない
		creatorId: TaskId.create(TID),
	},
	deps,
);
```

呼び出しの行の上に置くと `TS2578 Unused '@ts-expect-error' directive` になり、
本来検出したかったエラーは別に残る。整形ツールが1行を複数行に折り返した拍子に壊れることがある。

### 短いローカル関数名はバンドルで連番になる

複数のモデルがローカル関数 `create` を持つと、esbuild は `create` / `create2` / `create3` と改名する。minify していない Lambda のバンドルでは、スタックトレースが `at Object.create2 [as create]` になり、どのモデルか分からない。ローカル関数名は `createTask` のように完全名にする。minify すると差は消えるので、これは非 minify のビルドでの話。

### 公開オブジェクトを使うと未使用の操作も同梱される

`Task.equalsById(...)` のようにオブジェクト経由で1つでも使うと、`create` も `complete` も落ちない。実測したモデルでは raw で約 490 バイト、gzip で約 170 バイトの差だった。発見しやすさと引き換えのコストとして受け入れる。

### 公開オブジェクトは循環参照に弱い

`export const Task = {...}` は評価されるまで TDZ にある。相互 import で初期化中に `Task.create` を参照すると `ReferenceError: Cannot access 'Task' before initialization` になり、esbuild でバンドルすると `TypeError: Cannot read properties of undefined` に変わる。関数宣言は巻き上げられるので、名前付き export ならこの範囲では動く。ただし完成値スキーマが未初期化なら結局どちらも失敗する。**集約から子へ、子から値オブジェクトへ、という一方向の依存を保つ。** 逆向きが要るなら識別子で参照する。

---

## コメントと IDE

### スキーマのプロパティに書いた JSDoc は推論された型まで届く

`z.strictObject` のリテラルに書いた JSDoc は、`z.output` と `.brand()` と `.readonly()` と `z.discriminatedUnion` を通り抜けて、利用側のホバーに出る。実測で、判別可能ユニオンの分岐に書いた項目もブランド付きの完成値型の項目も、説明が保たれた。項目の単位や範囲は、モデル全体のコメントではなくプロパティ側に書くほうが届く。

### ローカル関数の JSDoc は「呼び出し」に出る。素の参照には出ない

`export const Task = { create: createTask }` としたとき、`Task.create(props, deps)` の `create` にホバーすると `createTask` の JSDoc が出る。ところが `const f = Task.create;` のように関数を値として参照しただけの位置では出ない。実測では前者だけが説明を返した。書いても無駄になるわけではないが、コールバックとして渡す場所では説明が見えないことは知っておく。

### .meta() は IDE のホバーに出ない

`.meta({ description })` は実行時に `Schema.meta()?.description` で読め、`z.toJSONSchema()` の出力にも入るが、エディタのホバーには出ない。逆に JSDoc は実行時に読めない。**説明文を読み出すコードが実際にあるときだけ `.meta()` を使う。** 無いなら JSDoc だけでよい。JSDoc はビルドで消えるので、説明文がバンドルに載らない利点もある。

`.meta()` は `.brand()` と `.refine()` の前後どちらに置いても保たれ、型付き registry の登録も `.brand()` 後の値で引ける。ただし registry は**登録し忘れを検出しない**ので、網羅性が要るなら全スキーマを列挙して確認するテストを書く。

---

## 型の絞り込み

### refine に型述語を渡すと出力型が絞れる

```ts
const CompleteTaskPropsSchema = z
	.strictObject({ task: TaskSchema, at: TimestampSchema })
	.refine(
		(
			p,
		): p is { task: Extract<Task, { status: "inProgress" }>; at: Timestamp } =>
			p.task.status === "inProgress",
		{ path: ["task", "status"], error: "着手中のタスクだけを完了できます" },
	);
```

`parse` の戻り値が絞り込み後の型になる。実測で、判別可能ユニオンの片方の枝に絞れることを確認した。

**ただしこの指針では使わない。** 業務操作に入力スキーマを置かず、前提条件は関数冒頭の素の `if` で書く。
`if (task.status !== "inProgress") throw ...` と書けば TypeScript の制御フロー解析で同じ絞り込みが得られ、
Zod を通す必要がない。ここに載せているのは、他所で見かけたときに読めるようにするためである。

**型述語と条件の中身は照合されない。** 述語が `status is "b"` と言っていて条件が
`v.status === "a"` を通す実装でも、型検査も実行時検証も止めない。実測では `status: "a"` の値が
そのまま通り、型の上では存在するはずの項目が `undefined` になった。**述語と条件は必ず同じ形にする。**
この危険も、素の `if` を使えば起きない。
テストで、絞り込んだ状態以外を渡すと拒否されることを確かめること。

**入力型は絞られない。** `z.input` は元の型のままなので、
呼び出し側は絞り込み前の値を渡せる。ただし `z.output` から props の型を取ると絞り込み後の型になって渡せなくなる。
**前提条件を付ける前の部品スキーマから `Readonly<z.output<typeof Base>>` で取る。**
手で書くと、項目の JSDoc が呼び出し側のホバーに届かず、
スキーマに項目を足したときの直し忘れも型で止まらない。どちらも実測で確認した。
