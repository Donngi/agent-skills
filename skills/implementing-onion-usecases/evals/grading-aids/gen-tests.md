# 6番 gen-tests の採点用の誤実装

**モデルには渡さない。** このディレクトリのファイルはどれも採点役だけが使う。

提出されたテストが「誤実装を落とせるか」を、形の判定ではなく**実行**して見るための道具である。
fixture の `usecase/ReturnLoanWithBookUseCase.ts`（正解の実装）を、誤実装に1つずつ差し替えて提出されたテストを走らせる。

正解の実装は、`Loan.return` の `LoanStatusMismatchError` を `LoanNotReturnableError` に、`Book.returnToShelf` の `BookStatusMismatchError` を `BookNotShelvableError` に、
それぞれ呼び出し1つを囲む `try` で `instanceof` により限定して詰め替え、元のエラーを `cause` に入れる。`LoanReturnedBeforeLendingError`（clock が貸出日より前の値を返した）は想定外なので詰め替えずに伝播させ、`run` の `@throws` には書かない。

## ファイル

| ファイル | 中身 |
|---|---|
| `gen-tests.mutant-a-put-before-return.ts` | (a) `Loan.return` の前に、取得した Loan を put する |
| `gen-tests.mutant-b-wrap-unexpected-error.ts` | (b) 1つの `try` で `Loan.return` と `Book.returnToShelf` を囲み、どのエラーも `LoanNotReturnableError` に詰め替える（想定外まで詰め替える） |
| `gen-tests.mutant-c-reconstruct-skips-status-check.ts` | (c) `Loan.reconstruct` で returned を作り、状態の判定を飛ばす |
| `gen-tests.mutant-d-date-now.ts` | (d) clock を使わず `Date.now()` で返却日を決める |
| `gen-tests.reference.test.ts` | 参照テスト。正解で全部通り、各誤実装で狙った契約の assertion が落ちることを確かめた |

誤実装はどれも `ReturnLoanWithBookUseCase.ts` を丸ごと置き換えるファイルで、`usecase/` に置いたときの相対パスで import している。
正解との差は `run` の中の該当箇所（と、それに要る import や class の定義）だけである。4種とも正解と同じ名前のエラー class を export するので、提出されたテストの import は変えずに走る。

## 手順

1. 作業用の場所（run のディレクトリの外）に、渡した fixture（`evals/fixtures/library/`）と提出された成果物を複製する。
   `outputs/` そのものは変えない。`node_modules` は依存を入れた場所へのシンボリックリンクで用意する
2. まず複製をそのまま実行し、**提出されたテストが全部通ること**と、`tsc` が通ることを確かめる。
   ここで落ちるなら、誤実装を落とせるかの採点項目はどれも failed にし、evidence にその旨を書く
3. 正解の実装を退避し、誤実装を1つずつ当てて実行する。終わったら正解に戻す

```bash
W=<作業用の場所>/library
A=<スキルのルート>/evals/grading-aids
cd "$W"
cp usecase/ReturnLoanWithBookUseCase.ts ../ReturnLoanWithBookUseCase.correct.ts
for m in a-put-before-return b-wrap-unexpected-error c-reconstruct-skips-status-check d-date-now; do
  echo "===== $m"
  cp "$A/gen-tests.mutant-$m.ts" usecase/ReturnLoanWithBookUseCase.ts
  npx tsc -p tsconfig.json && echo "tsc ok"
  npx vitest run <提出されたテストのパス> --reporter=verbose
done
cp ../ReturnLoanWithBookUseCase.correct.ts usecase/ReturnLoanWithBookUseCase.ts
```

4. 誤実装ごとの採点項目の evidence に、落ちたテストの名前と落ち方（assertion の失敗か、import・収集・ヘルパーの初期化の失敗か）を書く

参照テストで手順そのものを確かめるときは、`gen-tests.reference.test.ts` を `usecase/` に置いて同じように走らせる（下の「参照テストの結果」）。

## 検出成功の条件

**正解の実装では通り、型検査を通る誤実装で、どれかのテストの assertion が落ちること。**
狙った契約を確かめるテストで落ちても、別のテスト（成功時の保存の値・呼ばれた回数、別の入力での失敗）で落ちても、検出成功とする。どのテストで落ちたかを evidence に書く。

import の失敗・テストの収集の失敗・ヘルパーの初期化の失敗は、検出成功に**数えない**。
これらは誤実装の中身と関係なく落ちるので、テストの検出力を示さない。
4種とも、誤実装そのものは `tsc` を通る。(b) は `cause` の型を変えるので、提出されたテストが `error.cause` を型付きで読んでいると型検査で落ちうる。型検査の失敗は検出成功に数えない（vitest の実行で判定する）。

## (a) Loan.return の前に Loan を put する

```ts
await deps.loanRepository.put(loan);
let returned: Loan;
try {
	returned = Loan.return(loan, { at: deps.clock.now() });
} catch (error) { ... }
```

**狙う契約**: ドメインのメソッドが失敗したら、何も保存しない。
返却済みの Loan（または貸出中でない Book）で失敗させ、`loanRepository.put` が呼ばれていないことを確かめるテストがあれば落ちる。

成功時も、取得した Loan と返却した Loan で put が2回呼ばれる。
保存した値を `mock.calls[0]?.[0]` で見るテストや、呼ばれた回数を確かめるテストも落ちる。
`toHaveBeenCalledWith(期待値)` で比べるテストは、2回目の呼び出しが一致するので落ちない。
成功時のテストだけで落ちても検出成功とする。どのテストで落ちたかを evidence に書く。

## (b) 1つの try で両方を囲み、どのエラーも LoanNotReturnableError に詰め替える

```ts
let returned: Loan;
let shelved: Book;
try {
	returned = Loan.return(loan, { at: deps.clock.now() });
	shelved = Book.returnToShelf(book);
} catch (error) {
	throw new LoanNotReturnableError("ReturnLoanWithBookUseCase.run", props.loanNumber, { cause: error });
}
```

`LoanNotReturnableError` は `cause` の型を持たない（`options?: ErrorOptions`）。`BookNotShelvableError` は定義だけ残り、投げられない。

**狙う契約**: 詰め替えは異常系のパターンごとで、想定外のエラーは詰め替えない。
`rejects.toThrow(BookNotShelvableError)`（貸出中でない Book）か、`rejects.toThrow(LoanReturnedBeforeLendingError)`（clock が貸出日より前を返した）のように、具象の class で確かめるテストがあれば落ちる。
`rejects.toThrow()`・`rejects.toThrow(Error)`・`rejects.toThrow(UseCaseError)` だけのテストは落ちない。それも検出失敗として記録する。
返却済みの Loan のテストは、正解でも誤実装でも `LoanNotReturnableError` になるので落ちない。`cause` を `expect.any(LoanStatusMismatchError)` や `expect.any(BookStatusMismatchError)` で見るテストも、元のエラーは `cause` に入っているので落ちない。
put は呼ばれないので、put だけを確かめるテストでは落ちない。

## (c) Loan.reconstruct で returned を作り、状態の判定を飛ばす

```ts
const returned = Loan.reconstruct({
	...loan,
	status: "returned",
	returnedAt: deps.clock.now(),
} as LoanSchemaInput);
```

**狙う契約**: 返却済みの Loan では失敗し、何も保存しない（依頼文で求めている観点）。
返却済みの Loan を返すリポジトリで `run` を呼び、失敗することを確かめるテストがあれば落ちる（返却済みの Loan でも成功し、put が呼ばれる）。

貸出中の Loan では `Loan.return` と同じ値ができるので、成功時のテストでは落ちない。
予約済（reserved）の Loan は `holdUntil` が残って `InvalidReconstructParamError` になるので、
**予約済の Loan で失敗を確かめるテストは、class を問わない書き方だとこの誤実装を落とせない**。
`rejects.toThrow(LoanNotReturnableError)` と書いていれば class の違いで落ちるが、その場合も検出成功とし、どの入力で落ちたかを evidence に書く。
clock が貸出日より前を返す入力では `InvalidReconstructParamError` になるので、`rejects.toThrow(LoanReturnedBeforeLendingError)` の伝播のテストでも落ちる。

## (d) clock を使わず Date.now() を使う

```ts
returned = Loan.return(loan, { at: Timestamp.create(Date.now()) });
```

**狙う契約**: 返却日が `clock.now()` の値になる。
固定の値を返す clock を渡し、保存した Loan の `returnedAt` を独立に組んだ期待値（`createDummyReturnedLoan({ returnedAt: 5_000 })` など）と比べるテストがあれば落ちる。
`Loan.return(loan, { at: clock の値 })` の戻り値と比べるテストも、この誤実装は落とせるが、期待値をテスト対象と同じドメインのメソッドで作っているので別の採点項目で減点する。
`expect.any(Number)` のように返却日を見ないテストは落ちない。
clock が貸出日より前を返す入力の伝播のテストは、`Date.now()` が貸出日より後なので成功してしまい、落ちる（これも検出成功に数える）。

## 参照テストの結果

参照テスト（23件）を、正解と各誤実装に当てたときの結果。4種とも `tsc` は通る。

| 実装 | 結果 | 落ちるテスト | 落ち方 |
|---|---|---|---|
| 正解 | 23 passed | — | — |
| (a) | 4 failed / 19 passed | 正常系: clock.now() の値を返却日にして返却した Loan を保存する | `expected "vi.fn()" to be called 1 times, but got 2 times` |
| | | 異常系: 返却済みの Loan なら LoanNotReturnableError が発生し、何も保存しない | `expected "vi.fn()" to not be called at all, but actually been called 1 times` |
| | | 異常系: 貸出中でない Book なら BookNotShelvableError が発生し、Loan も Book も保存しない | 同上 |
| | | 異常系: clock が貸出日より前を返したら LoanReturnedBeforeLendingError がそのまま発生し、何も保存しない | 同上 |
| (b) | 2 failed / 21 passed | 異常系: 貸出中でない Book なら BookNotShelvableError が発生し、Loan も Book も保存しない | `expected error to be instance of BookNotShelvableError` |
| | | 異常系: clock が貸出日より前を返したら LoanReturnedBeforeLendingError がそのまま発生し、何も保存しない | `expected error to be instance of LoanReturnedBeforeLendingError` |
| (c) | 3 failed / 20 passed | 異常系: 返却済みの Loan なら LoanNotReturnableError が発生し、何も保存しない | `promise resolved "undefined" instead of rejecting` |
| | | 異常系: 返却済みの Loan なら、LoanNotReturnableError の cause に LoanStatusMismatchError が入る | 同上 |
| | | 異常系: clock が貸出日より前を返したら LoanReturnedBeforeLendingError がそのまま発生し、何も保存しない | `expected error to be instance of LoanReturnedBeforeLendingError`（`InvalidReconstructParamError` になる） |
| (d) | 2 failed / 21 passed | 正常系: clock.now() の値を返却日にして返却した Loan を保存する | `toStrictEqual` の不一致（`returnedAt` が clock の値でない） |
| | | 異常系: clock が貸出日より前を返したら LoanReturnedBeforeLendingError がそのまま発生し、何も保存しない | `promise resolved "undefined" instead of rejecting` |

どれも assertion の失敗で、import・収集・ヘルパーの初期化の失敗は無い。
