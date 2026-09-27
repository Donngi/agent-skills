# 期待違反の一覧: review-tests（ケース26）

対象は `fixtures/warehouse/reviewed-tests/`。ドメイン層は `fixtures/warehouse/domain/`（正しい実装）で、
テストだけがレビューの対象である。

**このファイルをモデルに渡さない。** 採点役だけが読む。
実行役に渡すのは `evals.src.json` の `files` に並べたファイルだけである。

> このディレクトリ名に `key` を入れていないのは、サンドボックスの read deny パターン
> `**/*key*` が、採点役からこのファイルを読めなくしてしまうからである。

検出の単位は「この fixture の、この場所の、この違反」である。
規則 ID を並べただけでは検出にしない。**場所・問題の内容・現行の規則にもとづく根拠が
対応していて初めて検出とする。** 根拠が現行の規則と食い違う指摘は、検出に数えない。
ID の完全一致は求めない。採点役が指摘を ID へ対応付ける。

行番号は fixture を整形したあとの値である。fixture を直したら行番号も直す。

## 期待する違反（9件）

| # | 規則 ID | 場所 | 何が違反か |
|---|---|---|---|
| V1 | no-expect-in-catch（副: caught-position） | `entity/StockItem.test.ts` 337〜353行 `StockItem.hold` の「held の StockItem なら StockItemStatusMismatchError が発生する」 | `try { StockItem.hold(...) } catch (error) { expect(error).toBeInstanceOf(...) }` と、`expect` が `catch` の中にしか無い。対象が例外を投げなければ `expect` は1つも実行されず、何も確かめずに通る。When で `let caught: unknown;` に捕まえて Then で見る |
| V2 | no-not-tothrow | `value-object/WarehouseCode.test.ts` 21〜28行 `WarehouseCode.create` の「大文字英字6文字なら受け入れる」 | 成功を `expect(() => WarehouseCode.create(value)).not.toThrow()` で確かめている。戻り値を見ていないので、値を取り違えて返す誤実装が通る。戻り値の値で確かめる |
| V3 | throw-concrete | `entity/StockItem.test.ts` 150〜157行 `StockItem.reconstruct` の「引き当てた数量が置いてある数量を超えるなら DomainError が発生する」 | `toThrow(DomainError)` と基底の class を渡している。どの業務エラーでも通るので、種別を確かめたことにならない。`toThrow(InvalidReconstructParamError)` にする。**テスト名と Then の説明が `DomainError` と書いてあることも、同じ箇所なので V3 に含めて1件とする** |
| V4 | test-oracle-independent（副: one-call） | `entity/StockItem.test.ts` 256〜280行 `StockItem.hold` の正常系1つ目、`const expected = StockItem.hold(...)` | 期待値を検査対象の `StockItem.hold` で作っている。対象が壊れていても両辺が同じに壊れるので落ちない。期待値は `createDummyHeldStockItem` で独立に組む。**対象操作を2回呼んでいるという指摘も同じ箇所なので V4 に含めて1件とする** |
| V5 | helper-reconstruct | `entity/StockItem.helper.test.ts` 18〜32行 `createDummyAvailableStockItem` | ダミーを `StockItem.create` で作っている。`create` が壊れると `hold` / `release` / `StockItemSchema` / `equalsById` のテストまで落ち、`create` 自身のテストの期待値も `create` から出る。`reconstruct` で作る。**この帰結として `StockItem.create` の正常系（28〜38行）の期待値が `create` から出ていることを指摘した場合も V5 の1件として数え、V4 とは別に数えない** |
| V6 | table-same-contract（副: table-no-branch, test-name-prefix） | `entity/StockItem.test.ts` 308〜335行 `StockItem.hold` の `test.for` に `shortage: false` と `shortage: true` の行 | 成功を期待する行と `StockQuantityShortageError` を期待する行を1つの表に混ぜている。混ぜたために `if (shortage)` の分岐と、例外の行なのに `正常系:` で始まるテスト名が生じている。成功と例外は別の表にする。**分岐・接頭辞・Then の説明が2つの結果を並べていること、のどれを挙げても同じ箇所なので V6 の1件として数える** |
| V7 | gwt-accurate | `entity/StockItem.test.ts` 400〜414行 `StockItem.hold` の「不変性: 結果が凍結されている」 | テスト名と `// Then: 凍結された StockItem になる` は凍結を述べているが、コードは `expect(result.status).toBe("held")` で状態を見ている。凍結は確かめられていない。`Object.isFrozen(result)` を見るか、説明を直す |
| V8 | key-absent-in（副: state-key） | `entity/StockItem.test.ts` 451〜461行 `StockItem.release` の「引き当てを外した StockItem は heldFor のキーを持たない」 | キーの不在を `expect(Reflect.get(result, "heldFor")).toBeUndefined()` で見ている。`heldFor: undefined` とキーが残る誤実装でも通る。`expect("heldFor" in result).toBe(false)` にする。**`Reflect.get` で型を迂回していることへの指摘も同じ行なので V8 に含めて1件とする** |
| V9 | ts-expect-error-scope（副: type-test-file） | `entity/StockItem.test.ts` 67〜78行 `StockItem.create` の「warehouseCode が小文字なら InvalidCreationParamError が発生する」の `// @ts-expect-error` | `*.test.ts` の中で `@ts-expect-error` を使い、型が拒否する生の文字列を `create` に渡して実行時の検査に持ち込んでいる。型で止まることは `Xxx.test-d.ts` で、実行時の拒否は生の値を受ける `reconstruct` か、`unknown` を受ける `StockItemSchema` の `safeParse` で確かめる |

## おとり（正しい。指摘したら偽陽性）

| # | 場所 | 違反に見える理由 | なぜ正しいか |
|---|---|---|---|
| D1 | `entity/StockItem.test.ts` 80〜95行 `StockItem.create` の operation を確かめるテストの `let caught: unknown;`（85行）。同じ形が 159〜174行、371〜398行、463〜484行、`value-object/WarehouseCode.test.ts` 48〜63行、78〜93行にもある | `// When:` の直下に変数宣言があり、宣言が Given に無い、または `try` の外にある、と見える | 例外を受ける変数は When の `try` の直上に置くのが規則である。Given に置くと、前提なのか結果の受け皿なのかが混ざる |
| D2 | `value-object/WarehouseCode.test.ts` 30〜46行 `WarehouseCode.create` の異常系の `test.for` | 空文字・1文字・7文字（長さ）と、小文字・数字・空白（文字種）で違反する制約が行ごとに違うので、表を分けるべきに見える | 例外を期待する表に求めるのは、全行が同じ操作で同じ具象の class（`InvalidCreationParamError`）を投げることだけである。違反する制約が行ごとに違うのはよい。制約ごとに分けると1行だけの表が並ぶ |
| D3 | `entity/StockItem.test.ts` 355〜369行 `StockItem.hold` の「引き当てる数量が0なら HoldQuantityOutOfRangeError が発生する」。同じ形が 52〜65行、97〜104行、150〜157行（V3 の箇所）、486〜496行、`value-object/WarehouseCode.test.ts` 30〜46行にもある | `// When:` と `// Then:` の間に空行が無く、When に実行するコードが無い | `toThrow` に関数を渡す matcher は Then の中で対象操作を実行するので、`// When:` と `// Then:` を空行なしで隣接させるのが規則である。分けるためだけに `const act = () => ...` を作るほうが違反になる |

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
- V1 を「`catch` の中の `expect` を `expect.assertions(1)` で補えばよい」と直す（規則は When で捕まえて Then で見る）
- V2 を「`not.toThrow()` に加えて `toThrow` の否定も足す」と直す（規則は戻り値の値で確かめる）
- V4 を「期待値をリテラルで全項目書き下ろす」以外は認めない、として `createDummyHeldStockItem` で組むことを拒む（規則はダミー生成ヘルパーで組んでよい）
- V5 を「ダミーは `create` で作るべきで、`held` のダミーも `create` + `hold` で作れ」と直す（規則は `reconstruct`）
- V6 を「`test.each` に変えれば混ぜてよい」と直す（規則は成功と例外を別の表にする。`test.each` は使わない）
- V8 を「`toBeUndefined()` のまま `toHaveProperty` を足す」と直す（規則は `"heldFor" in result` が `false`）
- V9 を「`as` に置き換える」と直す（規則は `as` も `@ts-expect-error` も `create` に渡さない）
- D1 を「`let caught` を Given に移す」と直す
- D2 を「制約ごとに表を分ける」と直す
- D3 を「`const act = () => StockItem.hold(item, params)` を When に置いて空行で分ける」と直す

**例外は「観点の欠落」である。これは一般則として偽陽性に数えない。**
「この値オブジェクトのテストファイルが無い」「共有のエラー class のテストが無い」
「この境界値のテストが無い」のように、**渡したテストに書かれていない観点を足せという指摘**は、
下の「偽陽性にしない」に個別に挙がっているかどうかに関わらず、すべて偽陽性に数えない。
依頼は渡したテストのレビューであり、fixture は既存コードの抜粋なので、観点の網羅は測っていない。
下の列挙は、この一般則に当たる代表例を示したものである。

## 判定で気をつけること

- **V1 と V3 はどちらも `throw-concrete` の周辺だが、別の箇所・別の欠陥である。** V1 は `catch` の中にしか `expect` が無いこと、V3 は基底の class を渡していること。片方の指摘でもう片方を検出にしない
- **V4 と V5 の切り分け。** `StockItem.hold` の正常系1つ目（256〜280行）で `expected` を `StockItem.hold` から作っているのが V4。`createDummyAvailableStockItem` が `create` を使っているのが V5。`StockItem.create` の正常系（29〜39行）の期待値が `createDummyAvailableStockItem`（= `create`）から出ていることを「期待値を対象操作から作っている」と挙げた指摘は、根本がヘルパーにあるので V5 に数える。同じ出力が両方の箇所を挙げていれば V4 と V5 の2件、ヘルパーの箇所を挙げずに `create` の正常系だけを挙げていれば V5 の1件として数える
- **V6 の表に付随する指摘を分けて数えない。** `if (shortage)` の分岐、例外の行なのに `正常系:` で始まる名前、Then の説明が2つの結果を並べていること、は全部 V6 の同じ表に起因する。どれを挙げても V6 の1件で、複数挙げても2件以上に数えない
- **V8 の `Reflect.get` を `no-cast` の違反として別に数えない。** 同じ1行の中の同じ欠陥（キーの不在を値の `undefined` で見ている）である
- **V9 は「`@ts-expect-error` を実行時のテストに置いている」ことが検出の条件である。** 「型のテストが無い（`StockItem.test-d.ts` が無い）」という指摘だけでは V9 の検出にしない。fixture は既存コードの抜粋であり、ファイルの網羅は測っていない。型のテストのファイルが無いことへの指摘は下の「偽陽性にしない」に当たる
- `test.for` を使っていること、`$name` のテスト名、テスト名が引用符付きで展開されること、を違反としない
- **`createDummyHeldStockItem` が `reconstruct` で作っていることは正しい。** V5 は `createDummyAvailableStockItem` の側だけである
- **`StockItem.reconstruct` の正常系（129〜148行）で保存値を `StockItemSchemaInput` の型注釈付きリテラルで書き下ろしていることは正しい。** `as const` を避けるための注釈であり、`as` ではない
- **`StockItem.create` の `warehouseCode` 以外の項目に細かい境界値のテストが無いこと、`StockItemSchema` の検証に型違い・入れ子破壊のケースが無いこと、エラー class のテスト（`shared-errors.test.ts` や、`StockItem.test.ts` の class ごとの `describe`）が無いこと、`Xxx.test-d.ts` が無いことは、この fixture では違反に数えない。** 依頼は渡したテストのレビューであり、観点の網羅は測っていない。**ただし、「型のテストを `Xxx.test-d.ts` に分けるべきで、`*.test.ts` に `@ts-expect-error` を置くべきでない」という形で V9 の箇所を挙げた指摘は V9 の検出に数える**
- **`createDummyAvailableStockItem` の引数が `Partial<CreateStockItemProps>` に `updatedAt` を足した型であることは、V5 の帰結である。** `reconstruct` で作れば `Partial<Omit<AvailableStockItemSchemaInput, "status">>` になる。引数の型だけを挙げた指摘も V5 に数える
- **`StockItem.hold` の正常系2つ目（282〜306行）と `StockItem.release` の正常系1つ目（435〜449行）の期待値は正しい形である。** ヘルパー（`createDummyHeldStockItem` / `createDummyAvailableStockItem`）で組んでいる。`createDummyAvailableStockItem` を通っていることを理由に挙げた場合は V5 に数え、それ以外の理由（「リテラルで書き下ろすべき」など）は偽陽性に数える
- **同じ箇所を複数の規則で挙げても、その箇所の違反1件として数える。** 別の箇所の正しい検出を、併記された誤った主張を理由に消さない
- **`StockItem.release` に `held` 以外の状態が1つしか無いので、状態ごとの `test.for` ではなく単独の `test` になっていることは正しい。** 1行だけの表を作るほうが読みにくい
