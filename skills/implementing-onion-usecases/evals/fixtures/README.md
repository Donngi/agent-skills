# fixture

`files` で実行役に渡す既存コード。設計の理由は `../README.md`、ケースの一覧は `../CASES.md` にある。
期待違反の一覧は `../expected-violations/`、採点用の誤実装は `../grading-aids/` にあり、ここには置かない。

| root | 使うケース | 中身 |
|---|---|---|
| `library/domain/` | ほぼすべて | 図書館のドメイン層（正本）。Loan・Book・Review・Member、リポジトリとドメインサービスのインターフェース、ダミー生成ヘルパー |
| `library/usecase/shared-errors.ts` | 2〜7・9〜18・25 | `UseCaseError` だけ |
| `library/usecase/ReturnLoanWithBookUseCase.ts` | 6 | 正解の実装（テストは受験者が書く）。`LoanStatusMismatchError` を `LoanNotReturnableError` に、`BookStatusMismatchError` を `BookNotShelvableError` に詰め替え、`LoanReturnedBeforeLendingError` は伝播させる |
| `library/usecase/LendLoanUseCase.ts`・`.test.ts` | 25 | 末尾に `LoanNotFoundError` と、`Loan.lend` の3つのエラーを詰め替える `LoanNotLendableError` を持つ貸出のユースケース。6番と25番は別々に渡すので、`ReturnLoanWithBookUseCase.ts` の末尾にも `LoanNotFoundError` がある |
| `library/infrastructure/repository-impl/` | 12 | DynamoDB のリポジトリ実装（SDK 非依存のスタブ） |
| `library/infrastructure/clock/` | 13 | `now(): number` のシステム clock |
| `library/application/` | 20 | 既定と違う流儀の既存ユースケース2本とテスト2本（`execute`・`makeXxxService`・`errors.ts` の `ApplicationError`・`__tests__/*.spec.ts`・`it`） |
| `library-notfound-shared/` | 8・19 | `usecase/shared-errors.ts` に `LoanNotFoundError` を持つ。19番の既存ユースケース2本（`Loan.lend`・`Loan.return` の業務のエラーをそれぞれ `LoanNotLendableError`・`LoanNotReturnableError` に詰め替える）とテストもここにある |
| `library-result/` | 21 | `Result<T, E>` を返す既存ユースケース2本とテスト。Err にするのは NotFound と呼んだドメインのメソッドの `@throws` のエラー（同じ class のまま入れる）で、リポジトリの reject は Err にしない。reject を確かめる2つのテストは、Err にしない範囲を示すために置いている |
| `library-nonconforming/` | 26 | 規約に沿っていないユースケース2本（`throw new Error("not found")`・`Date.now`・ドメインモデルを返す・`Loan.lend` の業務のエラーを詰め替えない） |
| `library-review/` | 23 | 違反とおとりを仕込んだユースケース一式。`usecase/shared-errors.ts` に `InvalidInputError` がある |
| `library-reviewed-tests/` | 24 | 違反とおとりを仕込んだテスト。実装は規則どおり（業務のエラーを詰め替え、`cause` を持つ）で、テストは緑で通る |

各 root には `package.json`・`tsconfig.json`・`vitest.config.ts`・`biome.json` を置き、`library/` のものと同じ中身にする（期待違反の行番号は `biome.json` の整形に依存する）。同期のスクリプトは `domain/` だけを見るので、設定ファイルは手で揃える。`library-*` の `domain/` は `library/domain/` の複製で、
このスキルの開発リポジトリでは、リポジトリ直下の `scripts/sync-skill-examples.mjs` が一致を確かめる。

## `library/domain/` の中身

Loan と値オブジェクトは、`implementing-ddd-tactical-patterns-with-zod` の `evals/fixtures/library/domain/` と題材が同じだが、同期はしていない独立の fixture である。この fixture では次のようにしている。

- `Loan.memo` は `.exactOptional()` で、`Loan.create` は値があるときだけ memo を置く（任意プロパティの扱いを測るため）
- `LoanRepository.put` の JSDoc に、同時更新を検出しない（後勝ち）ことを書いている
- `shared-errors.ts` に `InvalidClockValueError` がある（`Book.addReview` が clock を使うため）
- `Loan.lend` の3つのエラーと `Loan.return`・`Book.returnToShelf` の状態の不一致・`Member.reserveLoan` の `MemberWithdrawnError` は、ユースケースが詰め替える業務の異常系。`Member.reserveLoan`（`Loan.create`）と `Book.addReview`（`Review.create`）の `InvalidCreationParamError` は、props で `string` のまま受けた memo・本文で起きる入力の形の不正で、`InvalidInputError` に詰め替える。`LoanReturnedBeforeLendingError` と `Book.addReview` のほかの4つのエラーは、clock・idGenerator に起因する想定外のエラーで、詰め替えずに伝播させ、`@throws` に書かない
- `entity/Book.ts`（`returnToShelf`・`addReview`。新しい書評を先頭に置く）、`entity/Review.ts`、`entity/Member.ts`（`reserveLoan`）、`value-object/ReviewId.ts`、
  `repository/BookRepository.ts`・`MemberRepository.ts`、`domain-service/LoanNumberIssuer.ts`・`LoanPermission.ts`、すべてのモデルのダミー生成ヘルパー（`*.helper.test.ts`）がある

## 守っていること

- 題材を参照実装から外している。`example/` のタスク管理の語彙を使わない
- `tsc` が通る。テストを置いた root はテストも通る（違反を仕込んだ `library-reviewed-tests/` も緑）
- Lend 系のテストでは、props の `memberId` をダミー生成ヘルパーの既定値（`M-0001`）と違う値にし、Loan の `memberId` と props の取り違えを検出できるようにしている
- 正解のテストは渡さない（6番は実装だけ、24・25番はテストそのものが材料）
