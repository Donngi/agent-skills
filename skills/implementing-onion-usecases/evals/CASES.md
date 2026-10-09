# eval ケース一覧（26件）

設計の理由は `README.md`、回し方は `RUNNING.md` にある。ここは何を測るかの一覧である。

題材は図書館（貸出 Loan・蔵書 Book・利用者 Member）。`files` に渡す既存コードは `fixtures/` にある（`fixtures/README.md`）。
`基` は基準ケース（参照実装の写しで通ってよい回帰検出）、`識` は識別ケース。合否の基準はどちらも同じで、スキルありで全採点項目が通ること。

- 生成・誘惑のケースは、独立した誘導を1つだけ入れる。レビュー・修正は違反ごとに採点する
- 合格条件は SKILL.md・references に書いてあることと、依頼が明示した要件だけにする
- 規則で満たせない明示要件は「満たせなかった要件として分けて書く／ドメインに要る部品を示す」を合格の経路にする

## 生成（gen）8件

| # | name | 種 | 依頼 / fixture | 固有に測るもの |
|---|---|---|---|---|
| 1 | gen-update-lend | 基 | 予約済の貸出を貸し出す（`Loan.lend`）。返却期限は props で受ける。`usecase/shared-errors.ts` は渡さない | 貸出日を `deps.clock.now()` で渡す。`Loan.lend` の戻り値を保存し、戻り値は `void`。後勝ちを `run` の JSDoc に書く。`UseCaseError`（`DomainError` を継承しない）を書く。`Loan.lend` の3つのエラー（状態・利用者・期限。どれも業務の異常系）を `UseCaseError` 継承の class に詰め替え、`cause` に入れる。props はどれもドメインの型で、`InvalidInputError` に詰め替えるエラーは無い。`LoanNotFoundError` はファイル末尾（この行だけは example の写しでは通らない） |
| 2 | gen-create-via-owner | 基 | 予約を作る。`Member.reserveLoan`（退会済みなら拒否し、中で `Loan.create`。JSDoc に `operation は Loan.create。` 付きの `@throws` を書いておく）と `LoanNumberIssuer` を渡す。memo は任意 | `Loan.create` を直接呼ばない。利用者が無ければ採番しない。採番 → `Member.reserveLoan` → put。欠番を JSDoc と回答に書く。作った貸出番号を返す。memo は `string` のまま受け、値があるときだけ渡す。`MemberWithdrawnError`（退会済み。業務の異常系）はパターンの class に、`InvalidCreationParamError`（memo などの入力の形）は `usecase/shared-errors.ts` の `InvalidInputError` に詰め替える。`@throws` はユースケースが投げるエラーだけ |
| 3 | gen-query-single | 基 | 「画面表示用に貸出を1件取得するユースケース」 | Result DTO が status の union。reserved の `holdUntil` が lent/returned に無い。ドメインモデルを返さない。memo が無ければキーごと無い。マッピングを export しない関数に出し、`switch (status)` で全ケースを返して `default` を置かない。全状態のテーブル駆動テストと、キー不在を `in` で確かめるテスト |
| 4 | gen-query-list | 識 | 利用者の貸出一覧（利用者と件数を props で受ける） | 両方を `listByMember` に渡す。並び順を保ち、並べ替え・絞り込み・独自の上限を足さない（16番と意図的に重複。こちらは通常の生成で見る。落ちたら16番を先に疑う）。Result の配列を作り直す。空なら空配列 |
| 5 | gen-multi-aggregate | 識 | 返却したら蔵書を `onShelf` に戻す（`Book.returnToShelf` を渡す） | 両方のドメインのメソッドが成功してから両方を保存する（1つ目の put の後に2つ目のメソッドを呼ばない）。`LoanStatusMismatchError` と `BookStatusMismatchError` は詰め替え、`LoanReturnedBeforeLendingError`（clock の値）は伝播させ、`@throws` に書かない。2つ目の保存で失敗すると1つ目は保存済みで残ることを JSDoc と回答に書き（2つ目の保存の結果は断定しない）、実装の保存順と一致する。トランザクションを発明しない。戻り値は `void` |
| 6 | gen-tests | 識 | 正しい5番の実装（`LoanNotReturnableError`・`BookNotShelvableError` に詰め替え、`LoanReturnedBeforeLendingError` は伝播）を渡し、テストだけ書かせる。**依頼文に「返却済みの Loan では失敗し、何も保存しないことと、蔵書を戻せないときも両方を保存しないことを確かめて」と書く**（(c) と Book 側の観点を求める根拠を依頼に置く）。採点用の誤実装（モデルに渡さない。どれも公開された振る舞いが変わる）: (a) `Loan.return` の前に Loan を put する（返却済みの Loan で失敗しても put が呼ばれる）、(b) 1つの `try` で両方を囲み、想定外のエラーまで `LoanNotReturnableError` に詰め替える（Book の失敗と clock の失敗の class が変わる）、(c) `Loan.reconstruct` で返却済みを作り状態の判定を飛ばす（返却済みの Loan でも成功する）、(d) clock を使わず `Date.now()` を使う（保存した返却時刻が clock の値にならない） | 実装を変更しない。保存するもの・NotFound・詰め替えと `cause`・想定外の伝播・失敗時に put を呼ばない。期待値をヘルパーで作り、同じドメインのメソッドで作らない。誤実装4種をそれぞれ落とせる。`Book.returnToShelf` が失敗したら Loan も Book も put しないことを確かめる。ユースケースを書かないので空虚になる `tests-exist`、実装を変えないことを固有行で見るので重なる `no-invention` を `excludes` で外す |
| 7 | gen-add-child | 識 | 蔵書に書評を足す。`Book.addReview` が deps で ID と投稿時刻を決め、JSDoc に「新しい書評を先頭に置く」と書いてある。`Review.create` も公開されている | `Review.create` を直接呼ばない。clock・idGenerator を deps のまま渡す。足した書評の ID を先頭から取る（既存の書評が1件以上ある入力で、新しい ID が返る）。取り出せない分岐は `FatalUnreachableError` で、`@throws` に書かない。`Book.addReview` の5つのエラーのうち、`InvalidCreationParamError`（書いた利用者か本文の入力の形）は `usecase/shared-errors.ts` の `InvalidInputError` に詰め替え、ほかの4つ（idGenerator・clock が原因の想定外）は詰め替えずに伝播させ、`@throws` に書かない |
| 8 | gen-distinct-errors | 識 | 閲覧（1件取得）と変更（返却 = `Loan.return`）の2つのユースケース。権限サービスのインターフェース（`canView` / `canRecordReturn`。どちらも false を返しうる）を渡す。`LoanNotFoundError` を入れた `usecase/shared-errors.ts` も渡す | 権限サービスの false をユースケースのエラーにする。閲覧の拒否と変更の拒否を別の class にし、それぞれのユースケースのファイル末尾に置く。1つの class に `kind` プロパティで両方を載せる形は不合格。返却側は `Loan.return` の `LoanStatusMismatchError` を詰め替え、`LoanReturnedBeforeLendingError` は伝播させて `@throws` に書かない |

## 生成・誘惑（trap）14件

| # | name | 種 | 依頼が誘うこと | 合格 |
|---|---|---|---|---|
| 9 | trap-business-if | 識 | 「延滞中の利用者への貸出を防ぎたい。対象はユースケース層」。判定のメソッドもサービスも無い（中心の操作 `Loan.lend` はある） | 足りないのが操作の可否を決める判定なので、ユースケースのコードを書かない（延滞を計算する `if` を書く実装も、判定を省いた貸出の実装も不合格）。判定はドメインサービスのインターフェースか `Loan.lend` の引数として、入力・契約を回答で示し、要件は未達として分ける。提案した部品を fixture に足さない。コードを書かないので、共通プロファイルは配らない（固有の行だけで採点する） |
| 10 | trap-missing-domain-operation | 識 | 「返却期限を延長するユースケース」。延長のメソッドが無い（中心の操作が無い） | ユースケースのコードを書かない（取得だけで成功する実装・未変更の Loan を保存する実装も不合格）。スプレッド・リテラル・`reconstruct` で Loan を作らない。要る `Loan.extend...` の入力・契約・`@throws` を回答で示す。コードを書かないので、共通プロファイルは回答の行（`answer-missing-parts`・`answer-requirements`）だけを配る |
| 11 | trap-raw-input | 識 | 「API から文字列の貸出番号を受ける。取得ユースケースを実装して」 | props は `LoanNumber`。ユースケースの中で `LoanNumber.create` しない。検証は UI 層だと回答に書く。UI 層は実装しない |
| 12 | trap-infra-import | 識 | DynamoDB のリポジトリ実装を fixture に同梱し「これを使って返却のユースケースを」。clock は実行役が `now: () => Timestamp` の型で deps に書く | deps の型が `LoanRepository`。実装を import しない。実装をつなぐのは composition root だと回答に書く（「composition root でつなぐことで満たす」と書くのも可） |
| 13 | trap-raw-clock | 識 | `now(): number` のシステム clock を fixture に同梱し「この clock を使って返却のユースケースを」 | deps の clock が `now: () => Timestamp`。ユースケースの中で `Timestamp.create` を呼ばない。`Timestamp` を返すようにラップするのは composition root だと回答に書く |
| 14 | trap-transaction | 識 | 「貸出と蔵書の更新は必ず両方成功させたい。渡した部品で作れる暫定の実装も書いて」。原子性の手段は fixture に無い | トランザクションの仕組みを発明しない。逐次の保存を原子的と説明しない。リポジトリに要るもの（例: 両方を受ける保存）を示し、要件を未達として分ける。暫定の実装は逐次の保存と、片方だけ残りうることの JSDoc |
| 15 | trap-best-effort | 識 | 「`Book.returnToShelf` が `BookStatusMismatchError` を投げても、返却は成立させたい」 | catch するのは `BookStatusMismatchError` だけで、ほかは再 throw する。Loan 側のエラーと NotFound は伝播する。`BookStatusMismatchError` のときは Loan を保存し、Book の put は呼ばない。保存先の失敗は伝播させ、そのとき保存済みで残るものを実際の保存順に合わせて JSDoc に書く（保存順は問わない。保存先の失敗で返却が残らない順序でも、JSDoc がその事実と一致していれば可）。握りつぶす class を JSDoc と回答に書き、`@throws` から除く。`Loan.return` の `LoanStatusMismatchError` は握りつぶさず詰め替える。戻り値は `void`（依頼に通知の要求が無い） |
| 16 | trap-query-order | 識 | 「利用者の貸出一覧を返却期限が近い順に返して」。`listByMember` は貸出番号順 | ユースケースで sort しない。リポジトリに要るメソッド（引数と順序の約束）を示し、並び順を未達として分ける |
| 17 | trap-resilience | 識 | 「保存先はときどき失敗する」という背景付きの返却の依頼 | 依頼されていないリトライ・ログ・補償処理を足さない |
| 18 | trap-foreign-terms | 識 | 「コントローラから呼ぶインタラクターを書いて。貸出番号で1件取得する。ポートは LoanRepository」 | ファイル名・型名が `XxxUseCase`。自分の説明・JSDoc・識別子にインタラクター・ポート・コントローラを使わない（依頼の語との対応を示す引用は可） |
| 19 | trap-helper-steps | 識 | 貸出と返却の既存ユースケース2本（`library-notfound-shared/`。`LoanNotFoundError` は共有ファイルにある）を渡し、「共通する『取得して無ければエラー』を関数にまとめたい」 | 取得と NotFound の判定は各 `run` に残す。ユースケース間で共有する関数を作らない。ほかのユースケースを呼ばない。NotFound の class は `shared-errors.ts` で共有してよい。手順の共通化は未達として理由を書く |
| 20 | trap-convention-shape | 基 | 既存のユースケース2本（`execute` メソッド・`application/` フォルダ・既存のテスト書式） | 既存の形に合わせる。合わせた項目と出どころを回答に書く。既存の流儀とぶつかる共通の採点項目は、`evals.src.json` の `excludes` で外す。既存のテストに前例の無い assertion（オブジェクトの比較・キーが無いこと）は既定どおり採点する |
| 21 | trap-convention-result | 基 | 既存のユースケース2本が `Result<T, E>` を返し、ドメインのエラーをどこまで `Result` に変換するかが fixture でわかる | 例外を投げず `Result` で返す範囲が既存と同じ。テストを `Result` の失敗に読み替え、読み替えた項目と出どころを回答に書く。既存の流儀とぶつかる共通の採点項目は、`evals.src.json` の `excludes` で外す |
| 22 | trap-underspecified | 基 | `files` 空で「図書館のユースケース層を実装して」だけ | ユースケースのコードを書かず、操作とドメインの契約を特定する質問を返す。操作名や props の候補を質問として並べるのは可。共通プロファイルを外す |

22番は基準ケースとする。スキルが無くても質問を返しやすい依頼で、コードを書かずに質問する経路の回帰検出に使う。

## レビュー（review）2件

| # | name | 渡すもの | 測るもの |
|---|---|---|---|
| 23 | review-usecases | 図書館のユースケース一式。違反: 業務の if、reconstruct、スプレッド、`Date.now`、ドメインモデルを返す、想定外のエラーまで class を限定せずに詰め替える、メソッド前の保存、同名 NotFound の重複定義、規則の言い直しコメント、ヘキサゴナルの用語、技術用語の訳しすぎ、`@throws` にリポジトリのエラー、`@throws` に `Loan.return` の想定外のエラーを写す、インフラ実装の import、ユースケース間で共有する手順の関数、ほかのユースケースの呼び出し、ユースケース内の `Timestamp.create`、`@param`、手順コメント、想定する業務の異常系（`MemberWithdrawnError`）を詰め替えない、入力の形の不正（`Member.reserveLoan` の `InvalidCreationParamError`）を `InvalidInputError` に詰め替えない。おとり: NotFound の if、末尾に置いた単独のエラー、JSDoc 付きの順次2保存、`FatalUnreachableError` を `@throws` に書かない、ドメインサービスの false を `UseCaseError` にする `if`、状態の不一致を `cause` 付きで詰め替える正しい `try`/`catch`、`Book.addReview` の入力の形の不正だけを `InvalidInputError` に詰め替え、想定外の4つは伝播させて `@throws` に書かない | 期待違反ごとの検出、おとりを指摘しない、一覧に無い誤った指摘をしない。違反・不具合・任意の改善を分ける |
| 24 | review-usecase-tests | 緑で通るテスト。違反: 期待値を同じドメインのメソッドで作る、失敗時の put 未確認、`toThrow(UseCaseError)`、`toEqual`、キー不在を `toBeUndefined`、rejects の await 忘れ、エラー class の契約未検査、詰め替えの `cause` 未確認、3つのドメインのエラーをまとめた class の詰め替えを1つの入力だけで確かめる。おとり: ヘルパー製の期待値、`"memo" in result` | 同上 |

## 修正（fix）2件

25番は基準ケースとする。渡した `LendLoanUseCase.ts` とテストが規約の見本になるので、写せば通る。2つ目の利用で共有ファイルへ移す判断の回帰検出に使う。

| # | name | 種 | 渡すもの | 測るもの |
|---|---|---|---|---|
| 25 | fix-promote-shared-error | 基 | `LendLoanUseCase.ts`（末尾に `LoanNotFoundError` と `LoanNotLendableError`）とそのテスト（末尾に両方の describe）。「返却のユースケースを足して」 | `LoanNotFoundError` を `usecase/shared-errors.ts` に移し、元の定義を消す。エラー class のテストを `shared-errors.test.ts` に移し、ユースケースの振る舞いのテストは元に残して import を直す。`LendLoanUseCase` だけが投げる `LoanNotLendableError` は動かさない。ユースケース同士で import しない。各 `operation` を保つ |
| 26 | fix-nonconforming-usecase | 識 | 規約に沿っていないユースケース2本（`throw new Error("not found")`・`Date.now` 直呼び・ドメインモデルを返す・位置引数・`Loan.lend` の業務のエラーを詰め替えない）。「ユースケースの書き方の規約に沿って書き直して」と明示 | 規則へ寄せる。戻り値は `GetLoanUseCase` が状態ごとの Result DTO、`LendLoanUseCase` が `void`。`Loan.lend` の3つのエラーは `UseCaseError` 継承の class に詰め替える。`Timestamp.create(Date.now())` は clock に置き換えて消し、`InvalidInputError` に詰め替えるエラーを作らない（props はどれもドメインの型）。`@throws` はユースケースが投げるエラーだけ。戻り値とエラーの契約の変化と、呼び出し側への影響を回答に書く |

## 測っていないもの

- composition root（ユースケースの組み立て）とインフラ層の実装
- 本物の保存先でのトランザクション・同時更新
- 利用者に確認して答えをもらったあとの振る舞い（複数ターン）
- Jest など Vitest 以外のテストの成功経路
- 実装のコードでの `as` の使用（規則が対象をテストのモックに限っている）
- deps のインターフェースが投げる入力の形の不正（件数の範囲など）を `InvalidInputError` に詰め替えること（fixture のリポジトリはこの種のエラーを投げない）
