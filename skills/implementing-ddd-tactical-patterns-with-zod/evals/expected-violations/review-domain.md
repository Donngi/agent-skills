# 期待違反の一覧: review-domain（ケース21）

対象は `fixtures/warehouse/review-domain/`。

**このファイルをモデルに渡さない。** 採点役だけが読む。
実行役に渡すのは `evals.src.json` の `files` に並べたファイルだけである。

> このディレクトリ名に `key` を入れていないのは、サンドボックスの read deny パターン
> `**/*key*` が、採点役からこのファイルを読めなくしてしまうからである。

検出の単位は「この fixture の、この場所の、この違反」である。
規則 ID を並べただけでは検出にしない。**場所・問題の内容・現行の規則にもとづく根拠が
対応していて初めて検出とする。** 根拠が現行の規則と食い違う指摘は、検出に数えない。
ID の完全一致は求めない。採点役が指摘を ID へ対応付ける。

## 期待する違反（14件）

| # | 規則 ID | 場所 | 何が違反か |
|---|---|---|---|
| V1 | safe-parse（副: throws） | `value-object/Sku.ts` の `createSku` | `parse` を呼んでいる。失敗すると素の `ZodError` が層の外に出る。`safeParse` で受けて `InvalidCreationParamError` に包む。**`@throws` が無いという指摘も V1 に含めて1件として数える** |
| V2 | no-transform | `value-object/Sku.ts` の `SkuSchema` | 完成値スキーマが `.transform((v) => v.toUpperCase())` で入力を正規化している。`create` の受理集合と完成値スキーマの受理集合がずれる |
| V3 | brand-symbol | `value-object/Quantity.ts` の `QuantitySchema` | ブランドが `.brand<"Quantity">()` の文字列。同名の文字列ブランドは別々に宣言しても相互代入できる。`unique symbol` で宣言する |
| V4 | no-cast（副: no-silent-clamp） | `value-object/Quantity.ts` の `addQuantity` | `as Quantity` で型を付けている。あわせて `Math.min(..., QUANTITY_MAX)` が上限超過を黙って丸めており、失敗が呼び出し側に伝わらない。**同じ関数なので、`as` と暗黙の丸めのどちらを指摘しても1件として数える** |
| V5 | jsdoc-no-copy | `entity/StockItem.ts` の `StockItemFields.quantity` | JSDoc が `0以上9999以下` と制約を書き写している。`QuantitySchema` を読めば分かる |
| V6 | no-op-schema | `entity/StockItem.ts` の `ShipStockItemParamsSchema` と `shipStockItem` | 業務操作の引数に Zod スキーマを置いている。スキーマは完成値と create の第1引数の2つだけ。前提条件は関数冒頭の `if` で書く |
| V7 | create-error | `entity/StockItem.ts` の `shipStockItem` | 出庫の失敗に `InvalidCreationParamError` を流用している。`InvalidCreationParamError` を投げるのは `createXxx` の中だけである。在庫不足には何が起きたかを表す名前の class を足す |
| V8 | no-throw-in-check（副: precondition-missing） | `entity/StockItem.ts` の `StockItemSchema` の `superRefine`、および `receiveStockItem` | 横断検証から `Quantity.create` を呼んでいる。数量がロットの件数を下回ると、issue が積まれるかわりに例外が飛ぶ。`safeParse` は例外を捕まえないので、この完成値スキーマを検証しているすべての場所に漏れる。`if (spare < 0)` は到達しない。**あわせて `receiveStockItem` に不変条件の先取りが無く、数量0で新しいロットを入庫すると呼び出し側の入力で末尾の `FatalUnreachableError` に到達する。どちらを指摘しても V8 の1件として数える** |
| V9 | readonly-nested | `entity/StockItem.ts` の `StockItemFields.lots` | 配列に `.readonly()` が無い。`.readonly()` の凍結は1階層だけなので、外側に付けても入れ子の配列は保護されない |
| V10 | error-naming | `errors.ts` の `PreconditionError` | 包括的な名前の class を置いている。性質の違う失敗が全部そこに集まり、受け取る側はメッセージを読むことになる。何が起きたかを表す名前にする |
| V11 | throws | `entity/StockItem.ts` の `receiveStockItem` | `LotLimitExceededError` を投げるのに `@throws` が無い |
| V12 | props-readonly | `entity/StockItem.ts` の `CreateStockItemPropsSchema` | `.readonly()` が無い。完成値が読み取り専用なのに、手前の入力だけ書き換えられる |
| V13 | error-message-form | `entity/StockItem.ts` の `superRefine`（`数量はロットの件数を下回れません`）と `adjustStockItem`（`数量をロットの件数より少なくすることはできません`） | 同じ規則を検査しているのに文言が違う。利用者は別の規則だと読む |
| V14 | deps（規則7） | `entity/StockItem.ts` の `CreateStockItemPropsSchema` と `createStockItem` | `create` が作る値の最初の時刻 `updatedAt` を、`CreateStockItemProps` で呼び出し側から受け取っている。`create` が作る値の作成時刻は `deps.clock` から取る。第1引数から `updatedAt` を外し、`clock` を依存として注入する |

## おとり（正しい。指摘したら偽陽性）

| # | 場所 | 違反に見える理由 | なぜ正しいか |
|---|---|---|---|
| D1 | `entity/StockItem.ts` の `receiveStockItem` の `[...item.lots, params.lot].sort(compareLotNumbers)` | ドメインで正規化しているように見える | 禁じているのは受け取った入力を直して受理することである。操作が結果を組み立てるときに並び順を整えるのは導出であって正規化ではない。比較関数 `compareLotNumbers` は `lots` の昇順の検査（`<=`）と同じ比較で、規則5にも合っている |
| D2 | `LOT_LIMIT` を `lots` の `.max(LOT_LIMIT)` と `receiveStockItem` 冒頭の `if` の両方で使っていること | 同じ条件を2箇所に書いているように見える | 完成値の不変条件を操作の冒頭で先取りしてよい。目的はエラーの種別を分けることで、上限の定数は共有されている |

## 採点項目との対応

このケースは、skill-creator の標準の形（採点項目ごとに passed / failed）で採点する。件数の集計はしない。
この文書の「偽陽性」は、`[no-false-positive]` を failed にする誤った指摘を指す。

- **V / I の各項目**: その違反に、場所・問題の内容・現行の規則にもとづく根拠が対応している指摘があれば passed。
  箇所は合っていても、現行の規則と逆の方向に直せと述べている指摘（是正案だけが逆向きの場合を含む）では passed にしない
- **D の各項目**: そのおとりを問題として指摘していなければ passed
- **`[no-false-positive]`**: この一覧に無い箇所を、規則違反または具体的な不具合として主張した指摘が無ければ passed。次は誤った指摘に数えない
  - 仕様が読み取れないことへの質問（「こうすべき」と主張していないもの）
  - 出力が「任意の改善提案」として自分で格下げした節。`SKILL.md` は「レビューを頼まれたら、規則違反・具体的な不具合・任意の改善提案を分けて書く」と指示しているので、いちばん下の段を数えるとスキルの指示に従うほど不合格になる。ただし格下げの節に置いてあっても「規則に反する」と根拠づけているものは数える
  - 一覧に無いが、`SKILL.md` と `references/` の現行の規則に照らして、場所・内容・根拠がそろって規則違反だと確かめられる指摘。見つけたら evidence に場所と根拠を書く（一覧か fixture を直す候補になる）
  - おとりへの指摘と逆向きの是正案。それぞれ D の項目と V / I の項目で数えるので、ここでは数えない

1つの指摘が複数の箇所に触れているときは、箇所ごとに分けて判定する。誤った主張が併記されていることを理由に、別の箇所の正しい検出を消さない。

**逆向きの是正案の例**（V / I の項目を passed にしない）
- 業務操作の引数を Zod スキーマで検証すべきだ（規則は関数冒頭の `if`）
- DTO の検証がドメインより緩いので制約を足すべきだ（規則は DTO に業務の制約を写さない）
- `z.codec` を残して保存側で `encode` を呼ぶべきだ（規則は `to` / `from` の2関数）
- 包括的な名前のエラーに寄せて統一すべきだ（規則は何が起きたかを表す名前）

## 判定で気をつけること

- **エラーの置き場は数えない。** この fixture は、全部のエラーを `errors.ts` に置いた古い置き方のままである（`LotLimitExceededError` のようなモデルのエラーも共有のファイルにある）。これを「モデルのエラーは持ち主のファイルに置く」「共有のファイルは `shared-errors.ts`」という置き場の規則の違反として指摘しても、規則に照らして確かめられる正当な指摘なので偽陽性に数えない。指摘しなくても落とさない（一覧に入れていないのは、この課題が測るのはモデルのコードの違反だからである）。`PreconditionError` の包括的な名前は、置き場とは別に V10 で数える
- **テストの欠落は数えない。** この fixture のドメイン層にはテスト（`Xxx.test.ts`・`Xxx.test-d.ts`・`Xxx.helper.test.ts`）が1つも無い。「ドメイン層にテストが無い」「`Quantity` にテストが無い」という指摘は、`SKILL.md` の進め方（実装のあとにテストを書く）と、テストを対象と同じ場所に置く規則で裏付けられる正当な指摘なので偽陽性に数えない。指摘しなくても落とさない（一覧に入れていないのは、この課題が測るのはモデルのコードの違反だからである）
- `as const`、`import ... as`、レビュー本文が引用した `as` を V4 の検出と混同しない
- V4 は同じ関数（`addQuantity`）に2つの問題（`as` と暗黙の丸め）が付く。どちらか一方の指摘で検出とし、両方挙げても2件に数えない
- `.refine` を使っていることや `superRefine` でないことを理由に違反としない
- **`superRefine` の中の `Quantity.create` が例外を投げるため、`reconstruct` が `InvalidReconstructParamError` ではなく
  `InvalidCreationParamError`（operation は `Quantity.create`）を漏らす、という指摘も V8 に含めて1件とする。**
  数量0・ロット1件の保存値を `StockItem.reconstruct` に渡すと、実際にそうなる
- **V8 の後半（数量0の入庫で末尾の `FatalUnreachableError` に到達する）は、`superRefine` の例外を
  直したあとで到達する経路である。** いまの fixture では `superRefine` が先に例外を投げるので、
  実行してもそこへは届かない。この前提を踏まえた指摘なら V8 の検出に数える
- **1つの指摘が複数の箇所に触れているときは、箇所ごとに分けて判定する。** たとえば「型で保証済みなので
  再検証は冗長」として `createStockItem` と `shipStockItem` をまとめて挙げた指摘は、
  `shipStockItem` の側に V6 の根拠（操作の引数に Zod スキーマを置いている）が対応していれば V6 の検出、
  `createStockItem` の側は下の偽陽性に数える。誤った主張が併記されていることを理由に、
  別の箇所の正しい検出を消さない
- **`createStockItem` が create の第1引数のスキーマを `safeParse` で再検証していることを、冗長だとして
  指摘するのは偽陽性である。** これは規約が定める `createXxx` の形であり、引数の型が
  `CreateXxxProps` でも、呼び出し側が型を迂回した値を渡しうる
- **`createStockItem` の末尾（完成値スキーマの `safeParse` の失敗）が `FatalUnreachableError` を投げているのは正しい。**
  数量0・ロット0件を固定で組むので、生成時に `superRefine`（数量はロットの件数以上）は偽になりえず、
  ほかの項目は第1引数のスキーマで確かめ済みである。末尾に着く原因が残っていないので、生成の失敗
  （`InvalidCreationParamError`）ではなく到達しない分岐として扱う。これを「生成の失敗を投げるべき」と
  指摘したものは偽陽性に数える。V8（`superRefine` の中の `Quantity.create`）と混同しない
- **`Quantity` を値オブジェクトに切り出していること自体は違反ではない。** 数量は業務の言葉で
  名前が付く概念である。単一プリミティブに `===` の等価性関数（`quantityEquals`）を
  置いていることも、この指針は禁じていない。どちらへの指摘も偽陽性である
- **`adjustStockItem` の形は正しい。** パラメータ型が `AdjustStockItemParams` として
  名前付きで export され、前提条件が冒頭の `if` にあり、末尾の `FatalUnreachableError` は
  そこまで来る失敗が実装の不具合だけになっている。これらへの指摘は偽陽性である。
  **ただし、この関数が投げている `PreconditionError` は V10 の違反である。**
  「`adjustStockItem` が包括的な名前のエラーを投げている」という指摘は V10 の検出に数える
- **`PreconditionError` が対象の在庫の識別子を持たないことの指摘も V10 に含めて1件とする。** 同じ class の欠陥で、何が起きたかを表す名前の class に分ければ識別子も持たせることになる
- **V14 は `create` の時刻だけである。** 業務操作（`shipStockItem`・`adjustStockItem`・`receiveStockItem`）が
  出来事の時刻を `params.at` で呼び出し側から受け取っているのは、規則7のとおりで正しい。これを「clock を注入すべき」と
  指摘したものは偽陽性に数える。`createStockItem` の識別子 `id` を第1引数で受け取っていることも、参照実装の
  `Project.create` と同じ形なので V14 に含めず、違反としても数えない
- **V14 を V12（`CreateStockItemPropsSchema` に `.readonly()` が無い）と混同しない。** 同じスキーマへの指摘でも、
  `.readonly()` の欠落は V12、`updatedAt` を受け取っていることは V14 である
- **`superRefine` のメッセージ（`数量はロットの件数を下回れません`）が「です」「できません」の形になっていないことの指摘は V13 に含めて1件とする。** V13 と同じ文言の箇所である
- **ロットを出庫で減らさないこと（数量がロットの件数を下回れず、全量出庫ができないこと、ロットの上限にいずれ達すること）は、fixture の仕様である。**
  `StockItem` の JSDoc に「ロットは入荷の追跡の記録で、出庫では減らさない。そのため数量はロットの件数を下回れず、全量出庫はこのモデルの範囲外である（意図した制限）」と書いてある。
  この挙動の説明（「数量5・ロット1件から5個は出庫できない」など）と、仕様への質問（「全量出庫が要るなら、ロットを外す操作が要るのではないか」）は偽陽性に数えない。
  **不具合と断定する指摘（「具体的な不具合」の節に置く、「業務上の不具合」と書くなど）だけを偽陽性に数える。** 質問に回した直し方が添えてあっても、指摘の本体が不具合と断定していれば偽陽性である
