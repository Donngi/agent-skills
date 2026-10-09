# 期待違反の一覧: review-usecase-tests（ケース24）

対象は `fixtures/library-reviewed-tests/usecase/` の**テスト**（`*.test.ts`）。
ユースケースの実装（`LendLoanUseCase.ts`・`ReturnLoanUseCase.ts`・`GetLoanUseCase.ts`・`shared-errors.ts`）と
ドメイン層（`fixtures/library-reviewed-tests/domain/`。`library/domain/` の複製）は規則どおりに書いてあり、レビューの対象ではない。

**このファイルをモデルに渡さない。** 採点役だけが読む。
実行役に渡すのは `evals.src.json` の `files` に並べたファイルだけである。

検出の単位は「この fixture の、この場所の、この違反」である。
規則 ID を並べただけでは検出にしない。**場所・問題の内容・規則にもとづく根拠が
対応していて初めて検出とする。** 根拠が規則と食い違う指摘は、検出に数えない。
ID の完全一致は求めない。採点役が指摘を ID へ対応付ける。

行番号は fixture を整形したあとの値である。fixture を直したら行番号も直す。
パスは `usecase/` からの相対で書く。**テストは全件緑で通る**（4ファイル・31件）。

## 期待する違反（9件）

| # | 規則 ID | 場所 | 何が違反か（根拠） | 正しい形 |
|---|---|---|---|---|
| V1 | expected-not-from-domain-method | `LendLoanUseCase.test.ts` 18〜53行の正常系、44〜51行 `const expected = Loan.lend(createDummyReservedLoan({ memberId: "M-0002" }), { ... })` | 期待値をテスト対象と同じドメインのメソッド `Loan.lend` で作っている。`Loan.lend` が壊れていれば両辺が同じに壊れて通り、保存される値（`lentAt` が clock の値になること、`holdUntil` が消えること）がテストから読めない（`references/testing.md`「deps のモック」の「期待値をテスト対象と同じドメインのメソッドで作らない」、checklist） | `createDummyLentLoan({ memberId: "M-0002", lentAt: 4_000, dueAt: 9_000 })` と `toStrictEqual` で比べる |
| V2 | not-called-on-failure | `LendLoanUseCase.test.ts` 55〜79行「異常系: Loan が無ければ LoanNotFoundError が発生する」 | 失敗したときに保存のメソッドを呼ばないことを確かめていない。`mockPut` を用意しているのに `not.toHaveBeenCalled()` が無い（`references/testing.md`「確かめること」の「異常系: 見つからない」、checklist「保存のメソッドを呼ばないことを確かめている」） | Then に `expect(mockPut).not.toHaveBeenCalled();` を足し、テスト名と Then の説明に「保存しない」を足す |
| V3 | throw-concrete | `ReturnLoanUseCase.test.ts` 141〜167行「異常系: 返却済みの Loan ならユースケースのエラーが発生し、保存しない」の 164行 `rejects.toThrow(UseCaseError)` | 基底の class で確かめている。どのユースケースのエラーでも通り、`LoanNotReturnableError` でなく `BookNotShelvableError` や `LoanNotFoundError` を投げる取り違えでも落ちない（`references/testing.md`「assertion の選び方」、「失敗を確かめるテストの名前には、エラーの class 名を入れる」） | `rejects.toThrow(LoanNotReturnableError)` にし、テスト名と Then の説明に `LoanNotReturnableError` を入れる |
| V4 | strict-equal | `ReturnLoanUseCase.test.ts` 54〜82行「正常系: 棚に戻した Book を保存する」の 79行 `toEqual` | オブジェクトの一致を `toEqual` で比べている。`undefined` のプロパティを見逃す（`references/testing.md`「deps のモック」の「`toStrictEqual` で比べる」、「assertion の選び方」） | `toStrictEqual` にする |
| V5 | key-absent-in | `GetLoanUseCase.test.ts` 93〜111行「正常系: lent の Loan なら holdUntil のキーを持たない」の 110行 `expect(Reflect.get(result, "holdUntil")).toBeUndefined()` | キーが無いことを値の `undefined` で見ている。`holdUntil: undefined` とキーが残る誤ったマッピングでも通る（`references/testing.md`「assertion の選び方」、「任意プロパティが無いときにキーごと無いことも確かめる」） | `expect("holdUntil" in result).toBe(false)` にする |
| V6 | await-rejects | `ReturnLoanUseCase.test.ts` 84〜111行「異常系: Loan が無ければ LoanNotFoundError が発生し、保存しない」の 105〜110行 `expect(pending).rejects.toThrow(LoanNotFoundError).then(() => { ... })` | `rejects` を `await` していない。`then` に繋いだだけで、テストの関数はこの assertion の完了を待たずに終わる。保存を呼ばないことの確認も `then` の中にあり、テストの終了までに実行される保証が無い（`references/testing.md`「Given / When / Then」の「`rejects` は必ず `await` する」） | `await expect(pending).rejects.toThrow(LoanNotFoundError);` のあとに、`then` の外で `expect(mockPutLoan).not.toHaveBeenCalled();` と `expect(mockPutBook).not.toHaveBeenCalled();` を書く |
| V7 | error-class-test | `shared-errors.test.ts` 5〜18行 `describe("LoanNotFoundError")` | エラー class の契約を確かめていない。確かめているのはメッセージに貸出番号が含まれることだけで、`UseCaseError` かつ `Error` のインスタンスになること・`operation` と `loanNumber` が渡した値のまま残ること・`name` が class 名と同じになること、のどれも無い（`references/testing.md`「エラー class のテスト」、checklist「ユースケースのエラー class のテストがある」） | `ReturnLoanUseCase.test.ts` の `describe("BookNotFoundError")`（252〜295行）と同じ3つのテストにする |
| V8 | wrap-test | `ReturnLoanUseCase.test.ts` 195〜221行「異常系: 貸出中でない Book なら BookNotShelvableError が発生し、保存しない」に対して、`BookNotShelvableError` の `cause` に `BookStatusMismatchError` が入ることを確かめるテストが無い | 詰め替えの `cause` を確かめていない。`cause` を入れ忘れた実装や、別のエラーを `cause` に入れた実装でも、class だけを見るテストは通る。`LoanNotReturnableError` 側には 169〜193行で `cause` のテストがあるのに、`BookNotShelvableError` 側には無い（`references/testing.md`「確かめること」の「異常系: 詰め替えの `cause`」と「詰め替えは、想定する異常系ごとに確かめる」、checklist「想定する異常系ごとの詰め替えと `cause`」） | 169〜193行と同じ形で、`onShelf` の Book を返すリポジトリで `run` を始め、`rejects.toMatchObject({ cause: expect.any(BookStatusMismatchError) })` で確かめるテストを足す |
| V9 | wrap-test | `LendLoanUseCase.test.ts` 81〜106行「異常系: 貸出中の Loan なら LoanNotLendableError が発生し、保存しない」と 108〜133行の `cause` のテスト | `LoanNotLendableError` は `LoanStatusMismatchError`・`LoanMemberMismatchError`・`LoanDueBeforeLendingError` の3つをまとめた class なのに、詰め替えと `cause` を `LoanStatusMismatchError` の入力（貸出中の Loan）でしか確かめていない。実装の `instanceof` の並びから `LoanMemberMismatchError` か `LoanDueBeforeLendingError` が抜けて、そのエラーが詰め替えられずにそのまま発生しても、このテストは通る（`references/testing.md`「確かめること」の「複数のドメインのエラーを1つの class にまとめたときは、まとめたドメインのエラーの class ごとに1件ずつ確かめる。`instanceof` の並びから1つ抜けても、ほかの入力のテストでは見つからない。」、checklist「想定する異常系ごとの詰め替えと `cause`」） | 残り2つのドメインのエラーの入力でも確かめる。予約済の Loan（`createDummyReservedLoan()`、利用者 `M-0001`）を `M-0002` に貸し出す入力で `LoanMemberMismatchError` を、`M-0002` が予約した Loan を clock の値 4000 より前の返却期限で貸し出す入力で `LoanDueBeforeLendingError` を起こし、それぞれ `rejects.toThrow(LoanNotLendableError)` と `not.toHaveBeenCalled()`、`rejects.toMatchObject({ cause: expect.any(そのドメインのエラーの class) })` で確かめる。`test.for` のテーブル駆動でもよい |

## おとり（正しい。指摘したら偽陽性）

| # | 場所 | 違反に見える理由 | なぜ正しいか |
|---|---|---|---|
| D1 | `ReturnLoanUseCase.test.ts` 24〜52行「正常系: clock.now() の値で返却した Loan を保存する」の 49〜51行 `toStrictEqual(createDummyReturnedLoan({ returnedAt: 5_000 }))` | 期待値がドメインの値で、テスト対象の結果と同じものを別の経路で作っているように見える。`reconstruct` を使うヘルパーで作っている | 期待値はドメインのダミー生成ヘルパーで作るのが規則である（`references/testing.md`「deps のモック」の「期待値はヘルパーで作る」）。`Loan.return` を呼んでいないので、V1 の形ではない |
| D2 | `GetLoanUseCase.test.ts` 73〜91行「正常系: メモの無い Loan なら memo のキーを持たない」の 90行 `expect("memo" in result).toBe(false)` | 型の上では `memo` を `result.memo` で読めるのに、`in` で見ていて回りくどい | キーが無いことは `in` で確かめるのが規則である（`references/testing.md`「assertion の選び方」）。`toBeUndefined()` に変えろという指摘は逆向きで偽陽性 |

## 採点項目との対応

このケースは、skill-creator の標準の形（採点項目ごとに passed / failed）で採点する。件数の集計はしない。
この文書の「偽陽性」は、`[no-false-positive]` を failed にする誤った指摘を指す。

- **V の各項目**: その違反に、場所・問題の内容・規則にもとづく根拠が対応している指摘があれば passed。
  箇所は合っていても、規則と逆の方向に直せと述べている指摘（是正案だけが逆向きの場合を含む）では passed にしない
- **D の各項目**: そのおとりを問題として指摘していなければ passed
- **`[review-separate]`**: 指摘を、規則違反・具体的な不具合・任意の改善提案に分けて書いていれば passed（SKILL.md「回答」）。節の名前は問わない
- **`[no-false-positive]`**: この一覧に無い箇所を、規則違反または具体的な不具合として主張した指摘が無ければ passed。次は誤った指摘に数えない
  - 仕様が読み取れないことへの質問（「こうすべき」と主張していないもの）
  - 出力が「任意の改善提案」として自分で格下げした節。`SKILL.md` は「レビューを頼まれたら、規則違反・具体的な不具合・任意の改善提案を分けて書く」と指示しているので、いちばん下の段を数えるとスキルの指示に従うほど不合格になる。ただし格下げの節に置いてあっても「規則に反する」と根拠づけているものは数える
  - 一覧に無いが、`SKILL.md` と `references/` の規則に照らして、場所・内容・根拠がそろって規則違反だと確かめられる指摘。見つけたら evidence に場所と根拠を書く（一覧か fixture を直す候補になる）
  - おとりへの指摘と逆向きの是正案。それぞれ D の項目と V の項目で数えるので、ここでは数えない

1つの指摘が複数の箇所に触れているときは、箇所ごとに分けて判定する。誤った主張が併記されていることを理由に、別の箇所の正しい検出を消さない。

**逆向きの是正案の例**（V の項目を passed にしない）
- V1 を「`Loan.lend` の呼び出しを Given に移す」「期待値を `Loan.reconstruct` で作る」と直す（規則はダミー生成ヘルパー。Given に移しても同じドメインのメソッドで作ることに変わりない）
- V3 を「`toThrow(DomainError)` にする」「`toThrow(LoanStatusMismatchError)` にする」「`toThrow()` にする」と直す（規則はユースケースが投げる具象の class。`LoanStatusMismatchError` は詰め替えられて `cause` に入るので、`toThrow` で見る class ではない）
- V5 を「`toBeUndefined()` のまま `toHaveProperty` を足す」と直す（規則は `"holdUntil" in result` が `false`）
- V6 を「`return expect(pending).rejects...` にする」「`expect.assertions(n)` を足す」と直す（規則は `await`）
- V7 を「メッセージの全文を `toBe` で比べる」と直す（規則はインスタンス・プロパティ・`name` の3つ）
- V8 を「`toThrow(BookNotShelvableError)` のテストの中で `error.cause.message` を文字列で比べる」「`cause` を `toStrictEqual` でドメインのエラーのインスタンスと比べる」と直す（規則は `rejects.toMatchObject({ cause: expect.any(ドメインのエラーの class) })`）
- V9 を「ユースケースのテストでは1つの入力で足り、残りはドメインのテストに任せる」「`rejects.toThrow(LoanMemberMismatchError)`・`rejects.toThrow(LoanDueBeforeLendingError)` で確かめる」と直す（規則は、まとめたドメインのエラーの class ごとに、ユースケースのテストで詰め替えと `cause` を確かめる。ドメインのエラーは `cause` に入るので、`toThrow` で見る class ではない）
- D1 を「期待値を `Loan.return` で作る」「リテラルで書き下ろすべき」と直す
- D2 を「`toBeUndefined()` にする」と直す

**例外は「観点の欠落」である。これは一般則として偽陽性に数えない。**
「`clock.now()` の値を使うことを別のテストで確かめていない」
「`GetLoanUseCase` の returned で memo がある場合のテストが無い」のように、**渡したテストに書かれていない観点を足せという指摘**は、
すべて偽陽性に数えない。依頼は渡したテストのレビューであり、観点の網羅は V2（失敗時の保存の確認）・V7（エラー class の3つ）・V8（詰め替えの `cause`）・V9（まとめた class の、ドメインのエラーごとの詰め替え）以外は測っていない。
`LendLoanUseCase.test.ts` に `LoanMemberMismatchError`・`LoanDueBeforeLendingError` の入力のテストが無いという指摘は、観点の欠落ではなく V9 の検出として判定する。

## 判定で気をつけること

- **保存が1回のユースケースのテストに `toHaveBeenCalledTimes(1)` が無いこと、props の loanNumber が既定値のままで取得の引数を確かめていないことは、規則違反だが一覧には入れていない。** 挙げた指摘は、`references/testing.md` に根拠がそろうので偽陽性に数えない（V の検出にも数えない）

- **V6 は Vitest 5 の検出を避けた形である。** Vitest 5 は、`then` も `await` も付けずに放置した `expect(...).rejects` を、テストの終了時に「was not awaited」で失敗にする。
  fixture を緑で通すために、`await` を書かず `then` に繋いだ形にしている。`then` を呼ぶと Vitest はその assertion を記録済みとして扱い、`rejects` の失敗そのものはテストの失敗として拾うが、
  テストの関数は完了を待たずに終わり、`then` の中の `not.toHaveBeenCalled()` がテストの終了までに走る保証は無い。
  「`await` が無い」「`then` の中に保存の確認がある」「Promise を返していない」のどれを挙げても V6 の1件として数える
- **V6 の箇所で「保存を呼ばないことを確かめていない」と挙げた指摘は V6 に数え、V2 には数えない。** V2 は `LendLoanUseCase.test.ts` の NotFound のテストだけである
- **`GetLoanUseCase.test.ts` の NotFound のテスト（113〜131行）に `not.toHaveBeenCalled()` が無いのは正しい。** `GetLoanUseCase` は保存しないので、確かめる保存が無い。V2 として挙げたら偽陽性
- **V3 の箇所で、テスト名と Then の説明が「ユースケースのエラー」と書いていて class 名が無いことは、V3 に含めて1件とする**
- **V8 は「`cause` のテストが無い」ことだけが違反である。** 195〜221行のテスト自体（`toThrow(BookNotShelvableError)` と `not.toHaveBeenCalled()`）は正しい。「この1つのテストに `cause` の assertion も足す」と直す指摘も V8 に数える（1つのテストにまとめるか分けるかは問わない）
- **V5 の `Reflect.get` を、型の迂回（`as` の代わり）として別に数えない。** 同じ1行の同じ欠陥（キーの不在を値の `undefined` で見ている）である
- **V5 のテストが、表のテスト（12〜71行）の lent の行と同じことを確かめていて冗長だ、という指摘は偽陽性に数えない（任意の改善）。** 規則違反として挙げたものは、V5 の根拠（`toBeUndefined` を使っている）が添えてあれば V5 の検出に数え、冗長性だけを根拠に「消すべき」と違反扱いしたものは偽陽性に数える
- **V1 は期待値を作る方法だけが違反である。** `toStrictEqual` で比べていることは正しい。Then に期待値を組む処理があることを「Given に移すべき」と言うだけの指摘は V1 の検出にしない（V1 の根拠を欠く）
- **D1 の `createDummyReturnedLoan` が内部で `Loan.reconstruct` を使っていることは正しい。** ダミー生成ヘルパーの作り方はドメイン側の規則（`implementing-ddd-tactical-patterns-with-zod`）で、`reconstruct` で作るのが正しい
- **V4 の箇所の期待値（`createDummyBook({ status: "onShelf" })`）はヘルパー製で正しい。** 違反は `toEqual` だけである
- **`ReturnLoanUseCase.test.ts` の `describe("BookNotFoundError")`（252〜295行）・`describe("LoanNotReturnableError")`（297〜362行）・`describe("BookNotShelvableError")`（364〜429行）が `ReturnLoanUseCase.test.ts` の末尾にあるのは正しい。** どれも `ReturnLoanUseCase.ts` の末尾にある、このユースケースだけのエラーである（`references/testing.md`「置き場と命名」）。詰め替える class の2つは `expect(error.cause).toBe(cause)` で `cause` が渡したエラーそのものであることも確かめていて、規則どおりである。`LendLoanUseCase.test.ts` の `describe("LoanNotLendableError")`（136〜201行）も同じ
- **`ReturnLoanUseCase.test.ts` 223〜249行「異常系: clock が貸出日より前を返したら LoanReturnedBeforeLendingError がそのまま発生し、保存しない」は正しい。** 想定外のエラー（clock が契約に反した値を返した）が詰め替えられずに伝播することを確かめるテストで、1つで足りる（`references/testing.md`「想定外のエラーの伝播は、`try` ごとに、そこで詰め替えないエラーを1つ選んで確かめれば足りる」）。「`LoanReturnedBeforeLendingError` も `UseCaseError` に詰め替えて確かめるべき」という指摘は逆向きで偽陽性
- **`ReturnLoanUseCase.ts` の `run` の `@throws` に `LoanReturnedBeforeLendingError` が無いのは正しい。** `@throws` に書くのはユースケースが投げるエラーだけで、想定外のエラーは書かない（`references/errors.md`「`@throws`」）。223〜249行の伝播のテストと `@throws` が食い違う、`@throws` に足すべき、という指摘は偽陽性に数える
- **V9 は 81〜106行と 108〜133行を合わせて1件とする。** どちらか片方の箇所だけを挙げても、まとめた class の残りのドメインのエラーを確かめていないことが根拠になっていれば V9 に数える。2つのテストを `test.for` にまとめろという指摘は、残りの入力を足す是正案を伴えば V9 に数え、まとめ方だけを述べるものは任意の改善として扱う
- **`LendLoanUseCase.test.ts` に想定外のエラーの伝播のテストが無いのは正しい。** `Loan.lend` が投げる3つはどれも詰め替える想定する異常系で、詰め替えないエラーが無い。「伝播のテストを足せ」という指摘は偽陽性に数える
- **`ReturnLoanUseCase.test.ts` の NotFound のテスト（84〜111行）で Book のリポジトリの `get` を `vi.fn()` のまま渡しているのは正しい。** 呼ばれる前に失敗するので、応答を与える必要が無い
- **`test.for` を使っていること、`$name` のテスト名、Given の説明が「〜で」で終わっていること、を違反としない**
- **各テストで deps のモックを Given に繰り返し書いていることは正しい。** モックを作る関数をヘルパーに置かないのが規則である（`references/testing.md`「deps のモック」）。共通化しろという指摘は偽陽性に数える（任意の改善の節に格下げしてあれば数えない）
- **ユースケースの実装（`*.ts`）とドメイン層への指摘は、この一覧に無ければ `[no-false-positive]` で判定する。** 実装は規則どおりに書いてある
