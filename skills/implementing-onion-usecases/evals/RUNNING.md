# eval の回し方（skill-creator）

skill-creator の SKILL.md の「Running and evaluating test cases」の手順だけで回す。ここには、このスキルに固有の決まりだけを書く。

## 合否の基準

**スキルありの構成で、全ケースの全採点項目が通ること（pass_rate が 1.0）を合格とする。**
スキルなしの通過率は参考値である。集計は skill-creator の `scripts/aggregate_benchmark.py`、確認は `eval-viewer/generate_review.py` の viewer で行う。

## 作業場所

このスキルの開発リポジトリでは、**リポジトリ直下の `.skill-workspaces/implementing-onion-usecases/` に置く**（開発リポジトリの `CLAUDE.md` の方針）。ほかの場所で回すなら、skill-creator の既定の場所でよい。
ケースのディレクトリ名は `eval-<id>-<name>`。

## 実行役に渡すもの

- `evals.json` の `prompt` と `files` だけを渡す。`files` は `evals/fixtures/` からの相対パスを保ったまま、実行役の作業場所に複製させる
- `expected_output`・`expectations`・`expected-violations/`・`grading-aids/` は渡さない
- スキルありの実行役には、`evals/` を除いたスキルの複製を渡す。`evals/` のファイル名も、答えの手がかりになる
- 成果物のコードは `outputs/` に、渡したファイルとの相対パスを保って置かせる。利用者への回答文は `outputs/answer.md` に置かせる
- やり取りは1回だけで、回答のあとの質問には答えが返らないことを伝える
- **`eval_metadata.json` は実行が終わってから書く**（実行役が採点項目を読めないようにする）
- 実行役の作業場所に、`evals/fixtures/library/package.json` の依存（`@biomejs/biome` を含む）を入れた `node_modules` を置く（スキルあり・なしの両方）
- 同時に動かす実行役は3体まで

## 採点役に伝えること

- 採点は skill-creator の `agents/grader.md` のとおり。`grading.json` は標準の形（`expectations` の `text`・`passed`・`evidence` と `summary`）だけにする。`text` は `evals.json` の文言をそのまま入れる
- 採点項目の「〜のときは満たしたものとする」に当たるときは `passed: true` にし、`evidence` を「適用外: 理由」で始める。採点項目に書いてある条件だけを使う
- 型検査・整形・テストを走らせる採点項目（`[typecheck]`・`[formatted]`・`[tests-run]`）は、渡したファイルと `outputs/` を run のディレクトリの外に複製して実行する。`outputs/` そのものは変えない
- 6番は `grading-aids/gen-tests.md` の手順で、誤実装ごとに提出されたテストを走らせる
- レビューのケース（23・24番）は `expected-violations/<name>.md` を読んで採点する
- **採点役の判断で fail にした項目は、別の採点役にも独立して採点させる**（前の採点は見せない）。割れたら人が読んで決める
- API 名の一致や文字列検索だけで落とさない
