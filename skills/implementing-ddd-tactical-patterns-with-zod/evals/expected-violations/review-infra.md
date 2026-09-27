# 期待違反の一覧: review-infra（ケース22）

対象は `fixtures/warehouse/infrastructure-under-review/` の2ファイル。
`fixtures/warehouse/domain/` は正しいものとして同梱しており、レビューの対象ではない。

**このファイルをモデルに渡さない。** 採点役だけが読む。

> このディレクトリ名に `key` を入れていないのは、サンドボックスの read deny パターン
> `**/*key*` が、採点役からこのファイルを読めなくしてしまうからである。

検出の単位は「この fixture の、この場所の、この違反」である。
規則 ID を並べただけでは検出にしない。**場所・問題の内容・現行の規則にもとづく根拠が
対応していて初めて検出とする。** 根拠が現行の規則と食い違う指摘は、検出に数えない。
ID の完全一致は求めない。採点役が指摘を ID へ対応付ける。

## 期待する違反（14件）

| # | 規則 ID | 場所 | 何が違反か |
|---|---|---|---|
| I1 | dto-shape | `dto/DynamoDBStockItemDTO.ts` の `DynamoDBStockItemDTOSchema` | 値の制約をドメインから写している（`id` の `uuid`、`warehouseCode` と `sku` と `heldFor` の `regex`、`quantity` の `int`/`nonnegative`/`max`、`heldQuantity` の `int`/`positive`）。DTO は保存形式の契約だけを定義する。写すとドメイン側を広げた瞬間に、有効な値の保存がここで落ちる。**保存キーの `PK`/`SK` の `regex` はこれに当たらない（おとり D1）** |
| I2 | no-domain-const | `dto/DynamoDBStockItemDTO.ts` の `QUANTITY_MAX` の import | 業務の上限定数をドメインの entity から import している。**正しい直し方は `max(QUANTITY_MAX)` を制約ごと落として import も消すことである。** この上限は業務の上限であって保存形式固有の値ではないので、インフラ層に同じ定数を複製するのも誤りである（インフラ層が自分で持ってよいのは、保存キーの固定桁のように保存形式だけが必要とする定数である） |
| I3 | dto-enum（副: no-cast、undefined-key、dto-literal-check） | `dto/DynamoDBStockItemDTO.ts` の `status` と `heldFor` / `heldQuantity` / `heldAt` | 判別子が `z.string()` で、状態別の項目を任意にした単一オブジェクトになっている。判別子は `literal`、構造は状態別ユニオンにする。この設計の帰結として次も起きている。**どれを指摘しても I3 の項目を passed にする。** (a) `from` が `as unknown as StockItemSchemaInput` で型を通している。(b) `to` が任意項目に `undefined` を代入しており、引き当てていない在庫でも `heldFor` などのキーが残る（実測で `Object.hasOwn` が true）。キーごと落とすには条件付きスプレッドか分割代入を使う。(c) 状態ごとに `switch` で `return` する組み立て関数を分けていないので、キーの書き忘れが戻り値の位置で止まらない。`to` がオブジェクトリテラルを `satisfies` も戻り値型の注釈も無しに `safeParse` へ直接渡していることへの指摘も (c) に含める（DTO には `XxxSchemaInput` を作らず、戻り値型を注釈した組み立て関数で検査するのが `references/persistence.md` の形なので、同じ欠落の別の言い方である）。**状態別の項目を `.exactOptional()` ではなく `.optional()` で宣言していること（`heldFor` / `heldQuantity` / `heldAt` の3か所）への指摘も、同じ単一オブジェクトの設計の一部なので I3 の1件に含める（(a)(b)(c) の数には入れない）** |
| I4 | no-codec | `dto/DynamoDBStockItemDTO.ts` の `UpdatedAtCodec` | `z.codec` を使っている。`to` / `from` の2つの関数で書く。**あわせて向きを取り違えており、`to` が `safeParse` で decode した数値を返すため、書き込んだ値を `from` が読めない（実測で `from` が失敗する）** |
| I5 | convert-error | `dto/DynamoDBStockItemDTO.ts` の `fromDynamoDBStockItemDTO` | `from` の失敗を `InvalidCreationParamError` に包んでいる。`unknown` を受ける境界の失敗は `InvalidReconstructParamError` である。JSDoc の `@throws` も同じ誤りを書いている |
| I6 | key-integrity | `dto/DynamoDBStockItemDTO.ts` | 保存キーと本体の整合を検証する `superRefine` が無い。`PK`/`SK` が `warehouseCode`/`sku` から導出できるのに、食い違った保存値をそのまま復元する |
| I7 | key-one-place | `dto/DynamoDBStockItemDTO.ts` の `toDynamoDBStockItemDTOPartitionKey` と `toDynamoDBStockItemDTOKey`、`repository-impl/DynamoDBStockItemRepository.ts` の `get` と `listByWarehouse` | 同じキー文字列の組み立てが4箇所にある。リポジトリ実装が `WAREHOUSE#` と `STOCK#` を手で書いている。DTO のファイルに1箇所だけ置き、他はそれを呼ぶ |
| I8 | impl-storage-neutral（副: impl-factory-name、impl-deps-name） | `repository-impl/DynamoDBStockItemRepository.ts` のファイル名・`createDynamoDBStockItemRepository`・`DynamoDBStockItemRepositoryDeps` | 実装名に保存先の名前が入り、`Impl` が付いていない。`StockItemRepositoryImpl.ts` / `createStockItemRepositoryImpl` / `StockItemRepositoryImplDeps` にする |
| I9 | get-undefined（副: error-placement、error-fields） | `repository-impl/DynamoDBStockItemRepository.ts` の `get` と `StockItemNotFoundError` | 見つからないときに例外を投げている。1件取得は `undefined` を返す。インターフェースの JSDoc も「無ければ undefined」と約束している。**あわせてドメインのエラー class をインフラ層のファイルで定義しており、分岐に使う倉庫コードと品番を `readonly` フィールドに持たせていない。そのメッセージの語尾（「〜の在庫がありません」は「です」でも「できません」でもない）への指摘も含め、どれを指摘しても I9 の1件として数える** |
| I10 | section-placement | `dto/DynamoDBStockItemDTO.ts` の `toDynamoDBStockItemDTOPartitionKey` と `toDynamoDBStockItemDTOKey` | 「スキーマ・型定義」のセクションに関数を置いている。関数は役割ごとのセクションに入れる。保存キーを作る関数はドメインの値から保存先の表現を作るので、`to` / `from` と同じ「変換」のセクションに置く |
| I11 | dto-plain-export | `dto/DynamoDBStockItemDTO.ts:109` の `export const DynamoDBStockItemDTO = { key, partitionKey, to, from }` | インフラ層で公開 API のオブジェクトを作っている。オブジェクトに集めるのはドメイン層の値オブジェクトとエンティティだけで、インフラ層は名前付きで export する。**あわせて、この const が同名の型 `DynamoDBStockItemDTO` と衝突しており、`import { DynamoDBStockItemDTO }` がどちらを指すか読めない。どちらを指摘しても I11 の1件として数える** |
| I12 | dto-minimal-export | `dto/DynamoDBStockItemDTO.ts:42` の `export const DynamoDBStockItemDTOSchema` | DTO スキーマを export している。検証はこのファイルの中で完結させ、外から `from` を迂回して `safeParse` させない |
| I13 | key-naming | `dto/DynamoDBStockItemDTO.ts` の `toDynamoDBStockItemDTOKey` / `toDynamoDBStockItemDTOPartitionKey` ほか | DynamoDB の保存キーの名前が `PK` / `SK` / `PKSK` で揃っていない。`Key` とだけ書くと、PK だけなのか両方なのかが呼び出し箇所から読めない |
| I14 | dto-to-check | `dto/DynamoDBStockItemDTO.ts` の `toDynamoDBStockItemDTO` | 保存形式に組み立てる前に、渡された `StockItem` を完成値スキーマで検証していない。ブランドはスプレッドで引き継がれるので、ドメイン層の外で `{ ...item, quantity: -1 }` と作った値も `StockItem` 型で渡ってくる。DTO スキーマは業務の制約を持たないので、そのまま書き込まれ、以後の読み出しがすべて失敗する。冒頭で `StockItemSchema.safeParse` し、失敗を `FatalUnreachableError` に包む |

## おとり（正しい。指摘したら偽陽性）

| # | 場所 | 違反に見える理由 | なぜ正しいか |
|---|---|---|---|
| D1 | `PK: z.string().regex(/^WAREHOUSE#[^#]+$/)` と `SK: z.string().regex(/^STOCK#[^#]+$/)` | DTO に `regex` があるので I1 と同じに見える | 禁じているのは業務上の文字種と長さの転記である。保存キーの接頭辞と区切りの検証は保存形式そのものの条件なので置いてよい |
| D2 | `toDynamoDBStockItemDTO` が失敗を `FatalUnreachableError` に包んでいること | 外部境界で `FatalUnreachableError` を使っているように見える | `to` の入力は完成値なので、DTO スキーマを通らないのは実装の不具合である。`FatalUnreachableError` が誤りになるのは `from` や外部応答の検証に使ったときで、判定単位はファイルではなく失敗の分岐である |

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

- I14 と D2 を取り違えない。D2 は `to` の末尾で DTO スキーマの失敗を `FatalUnreachableError` に包んでいることで、正しい。I14 は冒頭で完成値スキーマを通していないことである
- I1 の検出に D1 を含めていないか確かめる。保存キーの `regex` を違反として挙げていれば、それは偽陽性である
- `ScanIndexForward: true` が品番の昇順を保証していることを違反としない。インターフェースの約束どおりである
- AWS SDK のスタブのセクションは fixture の都合なので、レビュー対象にしない
- `domain/` への指摘は、対象外を宣言してあるので偽陽性に数える
- **直し方が複数書かれている指摘は、最終的に推奨している案で判定する。** 逆向きの案を同等に推奨していれば
  逆向きの主張に数える。検討したうえで明示的に退けた案は数えない。書かれた順番では判定しない
- **`updatedAt` と `heldAt` の保存表現が違うこと自体を問題として挙げた指摘は偽陽性に数える。**
  保存表現を揃えることは規則ではない。ただし、codec の向きの取り違えによって書き込んだ値を読めないという
  往復の失敗の説明であれば、I4 に含める
- D1 は保存キーの `regex` そのものへの指摘を偽陽性にするもので、写しとして挙げても、緩すぎるとして挙げても
  おとりへの指摘である。保存キーと本体の食い違いを検出しないことの指摘は I6 であり、D1 には当たらない
- **一覧に無いが、現行の規則で裏付けられるので偽陽性に数えない指摘**（どの I の項目にも数えない）。
  - `listByWarehouse` が続きのページ（`LastEvaluatedKey`）を取らず1回の `Query` で返していること、件数の引数 `limit` を問い合わせる前に確かめていないこと（`references/persistence.md`「順序・件数・不在」の「一覧取得は、約束した件数に達するか終わりまで、保存先の続きを取り続ける」と「件数の引数は、受け付ける範囲を JSDoc に書き、問い合わせる前に確かめる」）
  - 実装の各メソッドに `@throws` が無いこと（`references/comments.md` の「インターフェースの実装のメソッドにも同じ規則で書く」。`from` から伝わる `InvalidReconstructParamError` など）。ただし `get` の `StockItemNotFoundError` を `@throws` に書けという是正案は、I9（見つからないときは `undefined` を返す）と逆向きなので I9 の判定で扱う
