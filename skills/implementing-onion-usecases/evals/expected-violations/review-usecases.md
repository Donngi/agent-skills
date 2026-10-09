# 期待違反の一覧: review-usecases（ケース23）

対象は `fixtures/library-review/usecase/`。ドメイン層は `fixtures/library-review/domain/`（`library/domain/` の複製で、規則どおり）で、
ユースケースだけがレビューの対象である。`infrastructure/DynamoLoanRepository.ts` は V13 を成立させるためのスタブで、レビューの対象ではない。

**このファイルをモデルに渡さない。** 採点役だけが読む。
実行役に渡すのは `evals.src.json` の `files` に並べたファイルだけである。

検出の単位は「この fixture の、この場所の、この違反」である。
規則 ID を並べただけでは検出にしない。**場所・問題の内容・規則にもとづく根拠が
対応していて初めて検出とする。** 根拠が規則と食い違う指摘は、検出に数えない。
ID の完全一致は求めない。採点役が指摘を ID へ対応付ける。

行番号は fixture を整形したあとの値である。fixture を直したら行番号も直す。
パスは `usecase/` からの相対で書く。

## 期待する違反（21件）

| # | 規則 ID | 場所 | 何が違反か（根拠） | 正しい形 |
|---|---|---|---|---|
| V1 | no-business-if | `LendLoanUseCase.ts` 13〜14行 `MAX_LOAN_PERIOD`、67〜73行の `if (props.dueAt - at > MAX_LOAN_PERIOD)`、118〜132行 `LoanPeriodTooLongError` | 「返却期限は貸出日から14日以内」という業務の判定をユースケースの `if` で書いている。ほかの経路（別のユースケース）はこの規則を通らずにすり抜ける（SKILL.md 規則4、`references/usecase-code.md`「やらないこと」、`references/errors.md`「ユースケースが投げるエラー」の「業務の規則に反したかどうかは、ドメインのメソッドが判定して投げる」） | `Loan.lend`（またはドメインサービス）に期間の判定を足すことを回答で示し（要る判定と投げるエラーの `@throws`）、ドメインに足したうえでユースケースの `if`・定数・`LoanPeriodTooLongError` を消す。ドメインに判定が無いまま `if` だけを消して14日の制限を外す直し方はしない |
| V2 | no-reconstruct | `ChangeLoanMemoUseCase.ts` 47行 `Loan.reconstruct({ ...loan, memo: props.memo })` | `reconstruct` は保存先から読んだ値の復元専用である。ユースケースが呼ぶと、生成やドメインのメソッドの判定を通らない値を作れる（SKILL.md 規則5、`references/usecase-code.md`「やらないこと」） | メモを変えるドメインのメソッド（`Loan` の memo を変える操作）が無いので、中心の操作がドメインに無い。ユースケースのコードで代わりに作らず、要るメソッドの入力・契約・`@throws` を回答で示す（SKILL.md「依頼に書かれていないことの扱い」） |
| V3 | no-spread-domain | `ReturnLoanWithReviewUseCase.ts` 91行 `const shelved: Book = { ...book, status: "onShelf" }` | スプレッドでドメインの値を作っている。ブランドが引き継がれるので型検査は通るが、`Book.returnToShelf` の判定（貸出中でなければ `BookStatusMismatchError`）をすり抜け、`onShelf` や `lost` の蔵書も棚に戻る（SKILL.md 規則5、`references/usecase-code.md`「やらないこと」） | `Book.returnToShelf(book)` を呼び、`BookStatusMismatchError` を `UseCaseError` 継承の class に詰め替える。`ReturnLoanUseCase.ts` の末尾にある `BookNotShelvableError` と同じ契約になるので、`shared-errors.ts` に移して両方から使う（`references/errors.md`「置き場」の3）。`ReturnLoanUseCase.ts` から import する、同名の class をもう1つ作る、は誤った直し方 |
| V4 | clock-from-deps | `AddBookReviewUseCase.ts` 75行 `{ clock: { now: () => Date.now() }, ... }` | `Date.now()` を直接呼んでいる。テストで投稿時刻を固定できない（SKILL.md 規則9、`references/usecase-code.md`「時刻と ID」） | `AddBookReviewUseCaseDeps` に `clock` を置き、`{ clock: deps.clock, idGenerator: deps.idGenerator }` を `Book.addReview` に渡す |
| V5 | result-primitive | `GetLoanUseCase.ts` 23行 `Promise<Loan>`、41行 `return loan` | 参照のユースケースがドメインモデルを返している。UI 層が `Loan.lend` などのメソッドや `reconstruct` に触れられる（SKILL.md 規則7、`references/usecase-code.md`「Result」） | プリミティブだけの `GetLoanUseCaseResult` を `status` の union で定め、export しないマッピング関数（`toGetLoanUseCaseResult`）で `switch (loan.status)` して返す。memo は値があるときだけ置く |
| V6 | no-wrap-unexpected-error（try-single-call） | `ReturnLoanWithReviewUseCase.ts` 93〜105行の `try { Book.addReview(...) } catch (error) { throw new ReviewRejectedError(...) }`、115〜130行 `ReviewRejectedError`、36行の `@throws ReviewRejectedError` | `Book.addReview` が投げるのは、入力の形の不正（`InvalidCreationParamError`。本文は props で `string` のまま受けた値）と、idGenerator や clock が契約に反する値を返したときのエラー（`InvalidGeneratedReviewIdError`・`InvalidClockValueError`・`DuplicateReviewError`・`ReviewPostedBeforeLatestReviewError`）である。後の4つは呼び出し側には直せない想定外なのに、`catch (error)` で class を限定せず、すべてを `ReviewRejectedError` に詰め替えているので、不具合が呼び出し側の対処できる失敗に見えて隠れる。`ReviewRejectedError` は `cause` の型も持たない（SKILL.md 規則8、`references/errors.md`「ドメインのエラーの扱い」の表と「`catch (error)` で全部を1つのユースケースのエラーにしない」） | `Book.addReview` の呼び出し1つを `try` で囲み、`instanceof InvalidCreationParamError` のときだけ `shared-errors.ts` の `InvalidInputError` に `{ cause: error }` で詰め替え、それ以外は再 throw する（`AddBookReviewUseCase.ts` 70〜84行と同じ形）。`ReviewRejectedError` を消し、36行を `@throws InvalidInputError 本文が不正なとき。cause は InvalidCreationParamError。` に替える。想定外の4つは `@throws` に書かない |
| V7 | save-after-domain | `ReturnLoanWithReviewUseCase.ts` 89行 `await deps.loanRepository.put(returned)`（`Book.addReview` を呼ぶ 94行より前） | 1つ目の集約を保存したあとで、2つ目の集約のメソッドを呼んでいる。`Book.addReview` が失敗すると、返却済みの Loan だけが保存されて残る（SKILL.md 規則6、`references/usecase-code.md`「保存と失敗」） | `Loan.return` と（`Book.returnToShelf` と）`Book.addReview` を呼び終えてから、Loan と Book を保存する。2つ目の保存で失敗すると1つ目だけ残ることを `run` の JSDoc に書く |
| V8 | error-shared-by-contract | `LendLoanUseCase.ts` 105〜116行と `ReturnLoanUseCase.ts` 123〜134行の `LoanNotFoundError` | 同じ契約（指定された貸出番号の貸出が無い・同じプロパティ）の同名の class を2つのファイルに定義している。`shared-errors.ts` 27〜38行にも同じ class があり、`GetLoanUseCase`・`ReturnLoanWithReviewUseCase` はそちらを投げる。`instanceof` が揃わず、呼び出し側は class の数だけ分岐を書くことになる（`references/errors.md`「置き場」、checklist「同名の class を複数のファイルに定義していない」） | 2つの定義を消し、`./shared-errors` の `LoanNotFoundError` を import する |
| V9 | no-rule-comment | `ReserveLoanUseCase.ts` 69行 `// ユースケースは Loan.create を直接呼ばず、生成の入口の Member.reserveLoan を通す` | スキルの規則（生成の入口を通す）の言い直しで、その行のコードについてのコードから読めないことではない（SKILL.md「コメントと用語」、`references/comments.md`「スキルの規則をコードに書かない」） | コメントを消す |
| V10 | onion-terms | `GetLoanUseCase.ts` 17行 `ドライビングアダプタ（REST のコントローラ）から呼ばれ、LoanRepository ポートから読み出す。` | ヘキサゴナルアーキテクチャの用語（アダプタ・コントローラ・ポート）を使っている（SKILL.md「コメントと用語」、`references/comments.md`「アーキテクチャの用語」） | `貸出を1件取得する。` だけにする。外側の層に触れるなら「UI 層」、`LoanRepository` は「リポジトリのインターフェース」と書く |
| V11 | terms-not-over-translated | `ReserveLoanUseCase.ts` 39行 `採番器で番号を取ったあとで失敗すると、その番号は欠番になる。` | コードの識別子 `LoanNumberIssuer` を「採番器」と訳している。検索で見つからない（`references/comments.md`「用語」の表「`TaskNumberIssuer` / 採番器」） | `採番に成功したあとで失敗すると、その番号は欠番になる。` か、`LoanNumberIssuer` と名前で書く。欠番を書くこと自体は正しい |
| V12 | throws-no-unexpected | `LendLoanUseCase.ts` 39行 `@throws InvalidReconstructParamError 保存されている貸出が壊れているとき。operation は Loan.reconstruct。` | deps のインターフェース（`LoanRepository.get`）が投げる想定外のエラーを `run` の `@throws` に書いている。`@throws` に書くのはユースケースが投げるエラーだけである。想定外のエラーは呼び出し側が分岐するものではなく、deps の実装の変更で増減する（SKILL.md 規則8、`references/errors.md`「`@throws`」の「書かないもの」） | 39行を消す |
| V13 | no-infra-import（deps-interface-only） | `ReturnLoanUseCase.ts` 9行 `import type { DynamoLoanRepository } from "../infrastructure/DynamoLoanRepository"`、50行 `loanRepository: DynamoLoanRepository` | インフラ層の実装を import して deps の型にしている。依存の向きが外向きになる（SKILL.md 規則3、`references/usecase-code.md`「Deps」） | `import type { LoanRepository } from "../domain/repository/LoanRepository"` にし、`loanRepository: LoanRepository` と書く。実装をつなぐのは composition root |
| V14 | no-shared-step-function | `book-steps.ts` 6〜17行 `findBookOrThrow`。使う側は `AddBookReviewUseCase.ts` 63〜67行と `ReturnLoanWithReviewUseCase.ts` 70〜74行 | 「取得して無ければ NotFound」の手順を、ユースケース間で共有する関数にしている。`run` を読むのに別ファイルを開くことになり、1つのユースケースの都合で直すとほかの手順も変わる（`references/usecase-code.md`「ファイルの構成」、checklist「取得・判定・保存の手順を、ユースケース間で共有する関数にしていない」） | 各 `run` に `const book = await deps.bookRepository.get(...); if (book === undefined) throw new BookNotFoundError(...)` を書き、`book-steps.ts` を消す。共有してよいのは `BookNotFoundError`（`shared-errors.ts`）だけ |
| V15 | no-other-usecase-call | `ChangeLoanMemoUseCase.ts` 4行の import と 43〜45行 `createGetLoanUseCase({ ... }).run(...)` | ほかのユースケースを呼んでいる（`references/usecase-code.md`「やらないこと」）。手順が別ファイルに分かれ、`GetLoanUseCase` の戻り値を変えるとこのユースケースが壊れる | `deps.loanRepository.get` で取得し、無ければ `shared-errors.ts` の `LoanNotFoundError` を投げる手順を `run` に書く |
| V16 | clock-timestamp | `LendLoanUseCase.ts` 50〜53行の `now: () => number`、66行 `Timestamp.create(deps.clock.now())` | clock が `number` を返す型なので、ユースケースの中で `Timestamp.create` を呼んでいる。clock が返す値の検証と `InvalidCreationParamError`（operation は `Timestamp.create`）をユースケースが背負う（`references/usecase-code.md`「Deps」、checklist「clock が `now: () => Timestamp` になっている」） | deps の clock を `now: () => Timestamp` にし、`at: deps.clock.now()` を `Loan.lend` に渡す。`import { Timestamp }` は `import type` にする |
| V17 | jsdoc-tags | `ReserveLoanUseCase.ts` 40行 `@param props 予約する利用者・蔵書・館・取り置きの期限とメモ` | `@param` を使っている。使うタグは `@throws` と `@deprecated` だけ（`references/comments.md`「コメントに書くこと」） | 40行を消す。各プロパティの説明は Props の JSDoc にある |
| V18 | no-step-comment | `AddBookReviewUseCase.ts` 62行 `// 蔵書を取得する`、69行 `// 書評を足す`、91行 `// 保存する` | 手順の各行に何をしているかのコメントを付けている（`references/comments.md`「手順の各行に、何をしているかのコメントを付けない」） | 3行を消す。85行のコメントは残す（D4 の行の説明。下の「判定で気をつけること」） |
| V19 | wrap-expected-domain-error | `ReserveLoanUseCase.ts` 70〜75行の `Member.reserveLoan(member, { ... })`（`try` で囲んでいない）と、42行の `@throws MemberWithdrawnError` | `Member.reserveLoan` が投げる `MemberWithdrawnError`（退会済みの利用者で予約した）は、利用者の状態で起きる業務の規則違反で、ユースケースが想定する異常系である。詰め替えずにそのまま伝播させ、`@throws` にも書いているので、呼び出し側はドメインの class を知って分岐することになる（SKILL.md 規則8、`references/errors.md`「ドメインのエラーの扱い」の表と「詰め替える単位」） | `Member.reserveLoan` の呼び出し1つを `try` で囲み、`instanceof MemberWithdrawnError` のときだけ `UseCaseError` 継承の class（例: `MemberNotReservableError`。`override readonly cause: MemberWithdrawnError` と `memberId` を持つ）に `{ cause: error }` で詰め替え、それ以外は再 throw する。`@throws` には詰め替えた class を `cause は MemberWithdrawnError。` 付きで書き、`MemberWithdrawnError` は消す。同じ `try` で、V21 の `InvalidCreationParamError` も `InvalidInputError` に詰め替える |
| V20 | throws-no-unexpected | `ReturnLoanUseCase.ts` 40行と `ReturnLoanWithReviewUseCase.ts` 35行の `@throws LoanReturnedBeforeLendingError clock が貸出日より前のタイムスタンプを返したとき。` | `Loan.return` の `@throws` にある `LoanReturnedBeforeLendingError` を、`run` の `@throws` に写している。clock が契約に反する値を返したときの想定外のエラーで、ユースケースが投げるエラーではない。呼び出し側が分岐するものではなく、ドメインや deps の実装の変更で増減する（SKILL.md 規則8「`run` の `@throws` には、ユースケースが投げるエラーだけを書く」、`references/errors.md`「`@throws`」の「書かないもの」） | 2つの行を消す。`LoanReturnedBeforeLendingError` を詰め替えずに伝播させているコードはそのままでよい |
| V21 | wrap-invalid-input | `ReserveLoanUseCase.ts` 70〜75行の `Member.reserveLoan(member, { ... })`（`try` で囲んでいない）と、43行の `@throws InvalidCreationParamError 貸出の入力が不正なとき。operation は Loan.create。` | `Member.reserveLoan` の `@throws` は `InvalidCreationParamError` を「貸出の入力が不正なとき」とし、`InvalidCreationParamError` の JSDoc も「呼び出し側が入力を直せる」としている。props で `string` のまま受けた memo（1〜200文字）をそのまま渡しているので、呼び出し側が入力を直せる入力の形の不正である。詰め替えずに伝播させ、`@throws` にドメインの class を書いているので、呼び出し側（UI 層）はドメインの class を知って分岐することになる（SKILL.md 規則8、`references/errors.md`「ドメインのエラーの扱い」の表の「入力の形の不正」と「入力の形の不正は、`usecase/shared-errors.ts` の `InvalidInputError` に詰め替える」） | V19 と同じ `try` で、`instanceof InvalidCreationParamError` のときに `shared-errors.ts` の `InvalidInputError`（72〜81行）に `{ cause: error }` で詰め替える。43行を `@throws InvalidInputError 貸出の入力が不正なとき。cause は InvalidCreationParamError。` に替える |

## おとり（正しい。指摘したら偽陽性）

| # | 場所 | 違反に見える理由 | なぜ正しいか |
|---|---|---|---|
| D1 | `ReserveLoanUseCase.ts` 63〜66行 `if (member === undefined) throw new MemberNotFoundError(...)`。同じ形が `GetLoanUseCase.ts` 37〜40行、`ReturnLoanUseCase.ts` 76〜79行、`ReturnLoanWithReviewUseCase.ts` 63〜69行、`LendLoanUseCase.ts` 61〜64行にもある | ユースケースに `if` があり、業務の判定に見える | リポジトリが `undefined` を返したのを失敗にするのはユースケースの判断である（SKILL.md「見つからないときの扱いが依頼に無いなら、NotFound のエラーを投げる」、`references/errors.md`「ユースケースが投げるエラー」）。業務の判定ではない。`LendLoanUseCase.ts`・`ReturnLoanUseCase.ts` の `if` が投げる class の重複は V8 で、`if` そのものは正しい |
| D2 | `ReserveLoanUseCase.ts` 87〜98行 `MemberNotFoundError` | NotFound のエラーなのに `shared-errors.ts` に無い | 投げるのは `ReserveLoanUseCase` だけである。1つのユースケースだけが投げるエラーはそのファイルの末尾に置き、将来ほかが使いそうという予測では共有ファイルに置かない（`references/errors.md`「置き場」1・2） |
| D3 | `ReturnLoanUseCase.ts` 33〜34行の `run` の JSDoc と、113〜114行（`Loan.return` と `Book.returnToShelf` のあとに `put` を2回） | 2つの集約を順に保存していて原子的でない。トランザクションが要るように見える | ドメインのメソッドをすべて呼び終えてから保存している（規則6）。原子性は依頼に無いので、リポジトリの約束どおりに逐次で保存し、2つ目で失敗すると1つ目は保存済みで残ることを JSDoc に書くのが規則どおりである（SKILL.md「同時更新や複数の保存の原子性が依頼に無いなら」、`references/usecase-code.md`「保存と失敗」）。トランザクションを足せという指摘は偽陽性 |
| D4 | `AddBookReviewUseCase.ts` 85〜89行の `FatalUnreachableError` と、35〜39行の `@throws` にそれが無いこと | 投げうるエラーが `@throws` から漏れているように見える | 足した書評が先頭にあることは `Book.addReview` の約束で、取り出せない分岐は到達しない。`FatalUnreachableError` は `@throws` に書かない（`references/errors.md`「`@throws`」の「書かないもの」と「到達しない分岐」、`references/usecase-code.md`「子エンティティを足す」） |
| D5 | `ReturnLoanUseCase.ts` 64〜74行 `if (!permitted) throw new ReturnNotPermittedError(...)` と 136〜150行 `ReturnNotPermittedError` | ユースケースに権限の判定の `if` があり、業務の判定に見える。エラーを `DomainError` でなく `UseCaseError` にしている | 判定は `LoanPermission.canRecordReturn`（ドメインサービスのインターフェース）が行い、ユースケースはその `false` を失敗にしているだけである（`references/errors.md`「ユースケースが投げるエラー」の表「ドメインサービスのインターフェースが返した値を失敗にする」）。投げるのはこのユースケースだけなのでファイルの末尾に置くのも正しい |
| D6 | `ReturnLoanUseCase.ts` 85〜112行の2つの `try`/`catch`（`Loan.return` → `LoanNotReturnableError`、`Book.returnToShelf` → `BookNotShelvableError`）、152〜169行の `BookNotShelvableError` と `shared-errors.ts` 53〜70行の `LoanNotReturnableError`、38〜39行の `@throws` | ドメインのエラーを catch してユースケースのエラーにしているのでラップに見える。`try` が2つあり冗長に見える。`LoanReturnedBeforeLendingError` だけ詰め替えていないのが抜けに見える。`LoanNotReturnableError` が `shared-errors.ts` にあるのが、1つのユースケースだけのエラーを共有ファイルに置いたように見える | 想定する業務の異常系（状態の不一致）を、異常系のパターンごとに `UseCaseError` 継承の class に詰め替え、元のエラーを `cause` に入れている。`try` は詰め替えるエラーを投げる呼び出し1つだけを囲み、`instanceof` で限定し、それ以外は再 throw している。`LoanReturnedBeforeLendingError` は clock が契約に反する値を返したときのエラーで想定外なので、詰め替えずに伝播させるのが正しい（それを40行の `@throws` に写しているのは V20）。詰め替えた class は `cause は Xxx。` 付きで `@throws` に書き、詰め替えたドメインの class は書かない（SKILL.md 規則8、`references/errors.md`「ドメインのエラーの扱い」「`@throws`」）。`LoanNotReturnableError` は `ReturnLoanUseCase` と `ReturnLoanWithReviewUseCase` が同じ契約（貸出中でない貸出を返却しようとした・`loanNumber`・`cause` が `LoanStatusMismatchError`）で投げるので、`shared-errors.ts` に1つ置くのが正しい（`references/errors.md`「置き場」3）。「1つの `try` にまとめる」「`catch (error)` で全部を詰め替える」「ドメインのエラーをそのまま伝播させる」と直せという指摘は逆向きで偽陽性 |
| D7 | `AddBookReviewUseCase.ts` 70〜84行の `try`/`catch`（`InvalidCreationParamError` だけを `InvalidInputError` に詰め替え、ほかは再 throw）、35〜39行の `@throws`（`BookNotFoundError` と `InvalidInputError` だけ）、`shared-errors.ts` 72〜81行の `InvalidInputError` | `Book.addReview` の `@throws` の5つのうち1つしか詰め替えず、`@throws` にもほかの4つが無いので、詰め替えと `@throws` が漏れているように見える。投げるのが `AddBookReviewUseCase` だけなのに `InvalidInputError` が `shared-errors.ts` にあり、置き場の規則に反するように見える。`InvalidInputError` が ID のプロパティを持たない | `InvalidCreationParamError` は書いた利用者か本文（props の値）が不正なときのエラーで、呼び出し側が入力を直せる入力の形の不正なので、`InvalidInputError` に詰め替えて `cause` に入れる。ほかの4つは idGenerator や clock が契約に反する値を返したときの想定外のエラーで、詰め替えずに伝播させ、`@throws` には書かない（SKILL.md 規則8、`references/errors.md`「ドメインのエラーの扱い」の表と「`@throws`」の「書かないもの」）。入力の形の不正はどのユースケースでも「渡された入力が不正」という同じ契約なので、`InvalidInputError` は `usecase/shared-errors.ts` に1つ置き、`cause` の型は `DomainError` にする（`references/errors.md`「ドメインのエラーの扱い」）。「4つも詰め替える」「`@throws` に `Book.addReview` の `@throws` を写す」「`InvalidInputError` をこのファイルの末尾に移す」と直せという指摘は逆向きで偽陽性 |

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
- V1 を「14日の判定をユースケースに残し、`LoanPeriodTooLongError` を `DomainError` 継承にする」と直す（規則は判定をドメインに置き、ユースケースから消す）
- V1 を「`if` と定数と `LoanPeriodTooLongError` を消す」とだけ直し、ドメインに判定を足すことを示さない（判定が失われ、14日の制限が外れる。規則は、操作の可否を決める判定が足りないならユースケースのコードで代わりに書かず、ドメインに要る判定を示す）
- V2 を「`reconstruct` の代わりにスプレッドで作る」「`Loan.create` で作り直す」と直す（規則はドメインのメソッドを示し、ユースケースで代わりに作らない）
- V6 を「`ReviewRejectedError` に `cause` の型を付ける」「`DomainError` 継承にする」「`try` を消して5つともそのまま伝播させ、`@throws` に `Book.addReview` の `@throws` を写す」と直す（入力の形の不正は `InvalidInputError` に詰め替え、想定外の4つは詰め替えずに伝播させ、`@throws` に書かない）
- V7 を「トランザクションの仕組みを足す」「Loan の保存を Book のあとに移すだけで、`Book.addReview` は保存のあいだに残す」と直す（規則はメソッドをすべて呼び終えてから保存する）
- V8 を「各ユースケースで名前を変える（`LendLoanNotFoundError` など）」と直す（規則は同じ契約なら `shared-errors.ts` の1つの class）
- V14 を「`findBookOrThrow` を `shared-errors.ts` に移す」「ドメインのリポジトリに `getOrThrow` を足す」と直す（規則は各 `run` に書く）
- V15 を「`GetLoanUseCase` を deps で注入する」と直す（注入してもほかのユースケースを呼ぶことに変わりない）
- V16 を「`Timestamp.create` を `Timestamp.reconstruct` に変える」「`Timestamp.create` の `InvalidCreationParamError` を `InvalidInputError` に詰め替える」と直す（規則は clock が `Timestamp` を返す型。clock が返した値で起きる失敗は呼び出し側には直せない）
- V19 を「`catch (error)` で全部を詰め替える」「`InvalidCreationParamError` も `MemberWithdrawnError` と同じ class に詰め替える」「`MemberWithdrawnError` を `cause` に入れずメッセージに写す」と直す（業務の異常系は `instanceof` で限定してパターンごとの class に、入力の形の不正は `InvalidInputError` に詰め替え、元のエラーは `cause` に入れる）
- V20 を「`LoanReturnedBeforeLendingError` をユースケースのエラーに詰め替え、その class を `@throws` に書く」と直す（想定外のエラーは詰め替えず、`@throws` にも書かない）
- V21 を「`InvalidCreationParamError` をそのまま伝播させ、`@throws` に残す」「ユースケースで memo の長さを確かめてから `Member.reserveLoan` を呼ぶ」「`ReserveLoanUseCase.ts` の末尾に入力の不正の class を新しく置く」と直す（規則は共有の `InvalidInputError` に詰め替える。入力の判定はドメインが行う）
- D1 を「NotFound の判定をドメインに移す」と直す
- D3 を「トランザクションでまとめる」と直す
- D4 を「`@throws FatalUnreachableError` を足す」と直す
- D5 を「権限の判定を `Loan` のメソッドに移す」「`ReturnNotPermittedError` を `shared-errors.ts` に移す」と直す
- D6 を「`try` を1つにまとめる」「`LoanReturnedBeforeLendingError` も詰め替える」「ドメインのエラーをそのまま伝播させる」と直す
- D7 を「`Book.addReview` の残りの4つも `UseCaseError` に詰め替える」「`@throws` に残りの4つを足す」「`InvalidInputError` を `AddBookReviewUseCase.ts` の末尾に移す」と直す

**例外は「観点の欠落」である。これは一般則として偽陽性に数えない。**
「このユースケースのテストが無い」「`shared-errors.test.ts` が無い」のように、**渡したコードに無いものを足せという指摘**は偽陽性に数えない。
この fixture には意図してテストを置いていない（`references/testing.md` の観点はこのケースで測らない）。

## 判定で気をつけること

- **V3 の是正案が「`Book.returnToShelf` を呼び、`BookStatusMismatchError` はそのまま伝播させる」なら、`Book.returnToShelf` に直す指摘として V3 は passed にする。** 伝播させると述べた部分は V3 の採点に使わない（状態の不一致は想定する異常系なので、本来は詰め替える）

- **違反が起こす具体的な不具合として挙げた指摘は、その V の検出に数える。** 規則違反の節と不具合の節のどちらに置いてもよい。代表例:
  - V3: `onShelf`・`inRepair`・`lost` の蔵書でも返却と書評が通る
  - V6: idGenerator や clock の不具合が `ReviewRejectedError` に見えて隠れる。呼び出し側が、入力の不正と想定外の不具合を `instanceof` で見分けられない
  - V7: `Book.addReview` が失敗すると、返却済みの Loan だけが残る。`run` の JSDoc に片方だけ残ることが書かれていない、という指摘も V7 に含めて1件とする
  - V16: clock が不正な値を返すと `InvalidCreationParamError`（operation は `Timestamp.create`）になる
  - V19: 呼び出し側（UI 層）が `MemberWithdrawnError` のドメインの class で分岐することになる
  - V21: 呼び出し側（UI 層）が `InvalidCreationParamError` のドメインの class で分岐することになる。ほかのユースケースの入力の不正（`InvalidInputError`）と同じ扱いにできない
- **`ReturnLoanWithReviewUseCase` の戻り値が `void` であることは違反ではない。** 返却（更新）が主の手順で、依頼は書評の ID を求めていない（SKILL.md 規則7「更新が主の手順で、子を足すのが付随なら、依頼が子の ID を求めたときだけ返す」）。「足した書評の ID を返すべき」と挙げたら偽陽性
- **`@throws` のずれは、その原因の V に含める。** 別の件として数えない
  - `LendLoanUseCase` の `@throws` に `LoanPeriodTooLongError` があることは V1、`InvalidReconstructParamError` があることは V12
  - `ReturnLoanWithReviewUseCase` の `@throws` に `ReviewRejectedError` があり `InvalidInputError` が無いことは V6。`LoanReturnedBeforeLendingError`（35行）があることは V20。`Book.returnToShelf` 由来の詰め替えた class が無いことは V3（`Book.returnToShelf` を呼んでいない）
  - `ReserveLoanUseCase` の `@throws` に `MemberWithdrawnError`（42行）があることは V19、`InvalidCreationParamError`（43行）があることは V21
  - `ChangeLoanMemoUseCase` の `@throws InvalidReconstructParamError`（25行）は V2 の帰結である。V12（deps のエラー）と混同しない。V2 の検出に数え、V12 には数えない。throws-no-unexpected の根拠でこの行を挙げても、偽陽性にはしない
- **`LendLoanUseCase` の `@throws` に `Timestamp.create` の `InvalidCreationParamError` が無いことは正しい。** clock が返した値で起きる想定外のエラーで、`@throws` に書かない。「`@throws` に足す」「`InvalidInputError` に詰め替える」と挙げたら偽陽性（同じ指摘で V16 の箇所と根拠を挙げていれば、V16 の検出は消さない）
- **V12 と V20 は別の件である。** V12 は deps のインターフェース（`LoanRepository.get`）のエラー、V20 はドメインの関数（`Loan.return`）の `@throws` から写したエラーである。V20 は2つのファイルの同じ行で1件で、片方だけを挙げても V20 に数える
- **V19 と V21 は、同じ呼び出し（70〜75行）が投げる別のエラーである。** 1つの指摘で `MemberWithdrawnError` と `InvalidCreationParamError` の両方の詰め替えを述べていれば、両方の検出に数える。片方だけを述べたものは、その片方だけに数える。2つを1つの class にまとめろという是正案は、どちらの検出にも数えない
- **V6 は、是正案が想定外の4つを詰め替えずに伝播させることを述べていれば passed にする。** 入力の形の不正の詰め替え先を `InvalidInputError` と書いていなくても（`ReviewRejectedError` を `InvalidCreationParamError` だけに限定する、など）V6 には数える。`InvalidCreationParamError` もそのまま伝播させる・`@throws` に `Book.addReview` の `@throws` を写すと述べたものは逆向きで passed にしない
- **D7 の `try` の引数にある `Date.now()` は V4 である。** `try` の形（呼び出し1つを囲み、`instanceof` で限定し、それ以外を再 throw）は正しい
- **V2 のスプレッド（`{ ...loan, memo: props.memo }`）を V3 として挙げた指摘は V2 に数える。** 同じ1行で、ドメインの値を作っているのは `reconstruct` である。V3 は `ReturnLoanWithReviewUseCase.ts` 91行だけ
- **`ReserveLoanUseCase.ts` 74行 `...(props.memo !== undefined ? { memo: props.memo } : {})` は正しい。** 任意プロパティを値があるときだけ置く書き方である（`references/usecase-code.md`「任意プロパティ」）。V3 として挙げたら偽陽性
- **`AddBookReviewUseCase.ts` 85行 `// 足した書評は先頭にある（Book.addReview は新しい書評を先頭に置く）` は正しい。** ドメインの約束に頼っている箇所の説明で、`references/comments.md` が書いてよいとする `//` コメントの形である。V18（手順コメント）や V9（規則の言い直し）として挙げたら偽陽性。V18 は 62・69・91行の3行で1件である
- **V4 の deps の不足（`AddBookReviewUseCaseDeps` に `clock` が無い）を挙げた指摘は V4 に数える。** 同じ欠陥の表と裏である
- **V13 は import と deps の型の2箇所で1件である。** `deps-interface-only` と `no-infra-import` の両方で挙げても2件に数えない
- **V14 は定義と2つの使う側で1件である。** `AddBookReviewUseCase` の側だけ、`ReturnLoanWithReviewUseCase` の側だけを挙げても V14 の検出に数える
- **V15 で NotFound が `GetLoanUseCase` 経由で投げられ、`operation` が `GetLoanUseCase.run` になることの指摘は V15 に含める**
- **V5 は戻り値の型と `return loan` で1件である。** Result DTO が無い、マッピング関数が無い、memo のキーの扱いが無い、のどれを挙げても V5 に数える
- **V6 は `try`/`catch`・class・`@throws` で1件である。** 「class を限定していない」「想定外を詰め替えている」「`cause` の型が無い」「`@throws` に `Book.addReview` のエラーが無い」のどれを挙げても V6 に数える
- **`LendLoanUseCase.ts` 76〜95行の `try`/`catch`（`Loan.lend` の3つのエラーを `LoanNotLendableError` に詰め替え）と 134〜159行の `LoanNotLendableError`、`ReturnLoanWithReviewUseCase.ts` 76〜88行の `try`/`catch`（`Loan.return` → `shared-errors.ts` の `LoanNotReturnableError`）は正しい。** D6 と同じ形で、3つのドメインのエラーを1つの異常系のパターンにまとめるのも規則どおりである（`references/errors.md`「詰め替える単位」）。これらを違反として挙げたら偽陽性。`LoanDueBeforeLendingError` は利用者が渡した返却期限で起きる業務の違反なので、詰め替える側で正しい
- **V3 の是正として `BookNotShelvableError` を `shared-errors.ts` へ移す提案は、V3 の検出に数える。** D6 の偽陽性には数えない。`ReturnLoanWithReviewUseCase` が `ReturnLoanUseCase.ts` から import するように直すのは、逆向きの是正案である（`references/errors.md`「置き場」の4）
- **`ReserveLoanUseCase.ts` の `memo?: string` の JSDoc に、無いときの形が書かれていないのは違反ではない。** `exactOptionalPropertyTypes` の下で `?:` から読める
- **`LoanDueBeforeLendingError` を詰め替えるのが正しい根拠**: 判定の主語は呼び出し側が渡した `dueAt` で、ドメインの JSDoc も「貸出日より前の返却期限を渡したとき」としている。呼び出し側が入力を直せば通るので、想定する異常系である（`references/errors.md`「ドメインのエラーの扱い」）
- **`ReturnLoanUseCase` と `ReturnLoanWithReviewUseCase` の手順が似ていることは違反ではない。** 「片方からもう片方を呼ぶ」「共通の関数に出す」と直せという指摘は、V14・V15 の規則と逆向きなので偽陽性に数える
- **`ReturnLoanUseCase` で権限の確認を取得より先に行っていることは違反ではない。** 順序を入れ替えろという指摘は、規則に根拠が無いので偽陽性に数える（任意の改善の節に格下げしてあれば数えない）
- **ドメイン層（`domain/`）の JSDoc の語（「識別子」「クロック」「ID ジェネレーター」）を V11 として挙げたら偽陽性である。** ドメイン層はレビューの対象ではなく、`implementing-ddd-tactical-patterns-with-zod` の流儀で書かれている。V11 はユースケースの `ReserveLoanUseCase.ts` 39行だけ
- **ユースケースの Props の JSDoc の「会員番号」「貸出番号」は訳しすぎではない。** ドメインが `MemberId`・`LoanNumber` に付けた業務の呼び名である（`references/comments.md`「JSDoc・`//` コメント・エラーメッセージでは、業務の言葉として書いてよい」）
- **`infrastructure/DynamoLoanRepository.ts` の中身への指摘は数えない（検出にも偽陽性にもしない）。** V13 を成立させるためのスタブで、インフラ層の実装はこのスキルの範囲外である
- **V8 を「`ReturnLoanUseCase` が `LendLoanUseCase` のエラーを import すべき」と直すのは逆向きである。** ユースケースのファイル同士でエラーを import しない（`references/errors.md`「置き場」4）
- **`LoanNotReturnableError` を「`ReturnLoanUseCase.ts` の末尾に置くべき」と直すのは逆向きである。** `ReturnLoanWithReviewUseCase` も同じ契約で投げるので、`shared-errors.ts` に1つ置くのが規則である（`references/errors.md`「置き場」3）。D6 に数える
