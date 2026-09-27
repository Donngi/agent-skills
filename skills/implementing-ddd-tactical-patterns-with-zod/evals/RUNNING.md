# eval の回し方（skill-creator）

`implementing-ddd-tactical-patterns-with-zod` の eval は、skill-creator の SKILL.md の
「Running and evaluating test cases」の手順だけで回す。独自の集計や採点の形は使わない。
ここには、このスキルに固有の決まりだけを書く。設計の前提は `README.md`、ケースの一覧は `CASES.md` にある。

## 合否の基準

**スキルありの構成で、全ケースの全採点項目が通ること（pass_rate が 1.0）を合格とする。**
採点項目はすべて同じ重みで、1項目でも落ちたら、スキルか採点項目のどちらかを直す対象にする。
スキルなし（または改善前のスキル）の通過率は、スキルが効いているかを見る参考値である。
合否は skill-creator の `scripts/aggregate_benchmark.py` が出す `benchmark.json` の pass_rate と、
`eval-viewer/generate_review.py` の viewer で見る。

## 作業場所

**リポジトリ直下の `.skill-workspaces/implementing-ddd-tactical-patterns-with-zod/` に置く。**
skill-creator の既定（スキルと同じ階層の `<スキル名>-workspace/`）は使わない（リポジトリの `CLAUDE.md` の方針）。
作業場所は git 管理しない。ケースのディレクトリ名は `eval-<id>-<name>` とし、`<name>` は `CASES.md` の名前を使う。
ディレクトリ名に `key` を含めない（サンドボックスの read deny パターンに当たり、採点役が読めなくなる）。

## evals.json を作り直す

`evals.json` は `evals.src.json` から生成する。手で編集しない。

```bash
python3 -B skills/implementing-ddd-tactical-patterns-with-zod/evals/build.py
# 渡すファイルだけで型検査が通るかも確かめるとき
python3 -B skills/implementing-ddd-tactical-patterns-with-zod/evals/build.py --typecheck --node-modules <example の依存を入れた node_modules>
# 書き換えずに同期だけを確かめるとき
python3 -B skills/implementing-ddd-tactical-patterns-with-zod/evals/build.py --check
# 採点スクリプトの自己テストも走らせるとき（採点の前に必ず通す）
python3 -B skills/implementing-ddd-tactical-patterns-with-zod/evals/build.py --check --check-script --node-modules <example の依存を入れた node_modules>
```

## 実行役に渡すもの

`evals.json` の `prompt` と `files` だけを渡す。`files` は `evals/fixtures/` からの相対パスを保ったまま作業場所に複製させる。
`expected_output`・`expectations`・`expected-violations/`・`grading-aids/` は渡さない（ケースの意図と正解が書いてある）。
成果物のコードは `outputs/` に、利用者への回答文は `outputs/answer.md` に置かせる。
やり取りは1回だけで、回答のあとの質問には答えが返らないことを伝える。質問で止まるべき状況を、依頼に書き足さない。
**`eval_metadata.json` は実行が終わってから書く。** skill-creator の既定では実行の前に置くが、ケースのディレクトリに採点項目があると実行役が読めてしまう。
**実行役の作業場所に、`example/package.json` の依存を入れた `node_modules` を置く**（スキルあり・なしの両方）。型検査やテストを実行役が自分で走らせられる条件を、両方の構成で揃えるためである。
この `node_modules` には `@biomejs/biome`（`fixtures/README.md`「19番の fixture について」の版）も入れる。スキルは書いたコードを formatter で整形させるので、19番で実行役が biome を走らせられないと、整形の手順を満たせない。
**19番（trap-project-structure）では、作業場所に複製した `biome.json` の `root` を `true` に書き換えてから実行役に渡す**（fixture 本体は `false` のまま）。
`root: false` の設定は上にルートの設定があって初めて効く入れ子の設定で、作業場所にはルートが無いので、そのままでは biome が fixture の書式（空白2つ・`'`・セミコロン無し）を無視して既定の書式に書き換える。
採点役が整形を確かめるときも同じく `root: true` の複製で確かめるので、両者の条件が揃う。

## 採点役に伝えること

- 採点は skill-creator の `agents/grader.md` のとおりで、`grading.json` は標準の形（`expectations` の `text`・`passed`・`evidence` と `summary`）だけにする。`text` は `evals.json` の文言をそのまま入れる
- 採点項目が「〜のときは満たしたものとする」と条件を書いていて、その条件に当たるときは `passed: true` にし、`evidence` を「適用外: 理由」で始める。**生成物を見て条件を作らない**（採点項目に書いてある条件だけを使う）
- 型検査とテストを走らせる採点項目は、`outputs/` を run のディレクトリの外の作業用の場所に複製して実行する。`outputs/` そのものは変えない。環境は `example/package.json` と `example/tsconfig.json` に合わせ、**zod は 4.6 以上**を使う
- **`[tests-run]` の vitest の設定は次のとおり固定する。** 成果物に vitest の設定（`vitest.config.*`、`vite.config.*` の `test`）があれば、それを作業用の場所に置いたまま走らせる。
  無ければ `example/vitest.config.ts` を作業用の場所のルートに写して走らせる（ヘルパーの除外と typecheck を補うためで、実行役がどちらの設定で書いても同じ条件で走らせる）。
  **設定の欠落は `[tests-run]` では数えず、`[helper-exclude]` と `[type-test-config]` だけで数える。** 設定を補って走らせたときは、`evidence` にそう書く。
  スキルは、作業場所に vitest の設定が無ければ vitest.config.ts を新しく作らせ（確認は要らない）、既存の設定を変えるときだけ利用者に確認させる。fixture に vitest の設定を持つのはレビューの26番（`warehouse/reviewed-tests/`）だけなので、テストを書くケースでは設定を作るのが正しい
- **採点に使う check.mjs は、1回の比較の中で1つに固定する。** 採点の前に `build.py --check --check-script` を通した版の `scripts/check.mjs`（スキル直下）を作業場所の外に写し、
  スキルあり・なし（old_skill・with_skill）と、下の「崩れに気づけるか」の崩した版の採点のすべてに、その同じものを使う。評価しているスキルに入っている check.mjs は使わない
- **check.mjs は、採点役が最終成果物（`outputs/`）に対して走らせる。** 実行役が自分で走らせた結果や、回答文に書いた自己申告は採らない
- **〔スクリプト判定〕の印がある採点項目は、固定した `scripts/check.mjs` の結果をそのまま使う。** 型検査のために `outputs/` と渡したファイルを複製した作業用の場所を `--work` に渡して、次を走らせる

  ```bash
  node <固定した check.mjs> \
    --outputs <run のディレクトリ>/outputs --work <作業用の場所> --node-modules <example の依存を入れた node_modules>
  ```

  出力の `results` は規則 ID（`tag`）ごとの `passed` と `evidence` である。採点項目の `[規則 ID]` と同じ `tag` の結果を、
  `grading.json` のその項目の `passed` に写し、`evidence` は「check.mjs: 」に続けてスクリプトの `evidence` を写す。
  `passed` が `null` の項目だけは、スクリプトでは決められなかったので、採点項目の文言どおりに自分で判定する。
  スクリプトの判定の中身は `README.md`「スクリプトで判定する採点項目」にある
- **印の無い採点項目でも、同じ規則 ID の結果がスクリプトの出力にあれば証拠として使う**（`README.md`「証拠として使う判定」の規則）。
  `passed: false` なら、示された箇所が文言に反することを確かめて fail にし、`evidence` にその箇所を写す。
  `passed: null` なら、スクリプトは違反を見つけられなかっただけなので、合格の根拠にせず文言どおりに自分で判定する。
  候補を並べるだけの判定（`README.md`「候補を並べるだけの判定」）は、並んだ箇所から確かめる
- **`grading.json` を書いたら、check.mjs の結果と照合する。** check.mjs の出力を保存しておき、次を走らせる。食い違いがあれば非0で終わるので、`grading.json` を直す

  ```bash
  node skills/implementing-ddd-tactical-patterns-with-zod/evals/scripts/compare-grading.mjs \
    --grading <run のディレクトリ>/grading.json --check <check.mjs の出力を保存した JSON>
  ```

  照合するのは、スクリプトが true / false に決めた〔スクリプト判定〕の項目と、スクリプトが false（確実な違反）を返した印の無い項目である。
  スクリプトが `null` を返した項目は `decidedByGrader` に並ぶので、採点役の `evidence` に根拠が書いてあるかを見る
- **採点役の判断で fail にした項目は、fail を確かめるために、別の採点役にも独立して採点させる。** 前の採点は見せない。
  割れたら、両方の `evidence` を人が読んで決める。自動で pass にしない。これは誤った fail を確かめるための手順で、ぶれの実測の代わりにはしない
  （誤った pass を含むぶれは、下の「採点のぶれを測る」で見る）
- レビューのケース（21・22・26番）は `expected-violations/<name>.md` を、25番は `grading-aids/gen-tests-derived.md` を読んで採点する。どちらも採点項目の文言から参照している
- API 名の一致や文字列検索だけで落とさない（`as` の判定は構文で見る）。判定で気をつけることは `README.md`「判定でやってはいけないこと」にある

## 採点のぶれを測る

どの規則の判定が採点役によって割れるかは、実測してから決める。スクリプトに移す規則や、文言を直す規則を選ぶ根拠にする。

1. 1回分の実行の `outputs/` を固定し、同じ成果物を採点役に2回（できれば3回）、別々の採点役として採点させる。
   採点役には毎回同じ「採点役に伝えること」だけを渡し、前の採点の `grading.json` は見せない
2. 採点ごとの `grading.json` を並べ、採点項目の `[規則 ID]` ごとに、`passed` が回によって違った件数と、その項目が配られた件数を数える。
   〔スクリプト判定〕の項目は同じ結果になるはずなので、違ったらスクリプトか手順の誤りとして先に直す
3. 割れた項目の `evidence` を読み、割れた理由を「文言が2通りに読める」「対象の箇所の見落とし」「条件（〜のときは満たしたものとする）の当てはめ」に分ける。
   文言が原因なら文言を直し（1行に1つの条件にする、例を足す）、構文で決まる部分が原因ならスクリプトの判定に移す
4. 直したら同じ成果物でもう一度2回採点し、割れが減ったことを確かめる

## スキルの崩れに evals が気づけるかを確かめる

採点項目を直したり配り方を変えたりしたときは、スキルや採点スクリプトが崩れたときに evals が落ちることを確かめる。確かめ方は2つに分ける。

**判定器の故障に気づけるか。** check.mjs の判定を1つ無効にした版（`checks` からその規則を外すか、常に true を返すようにする）で
`build.py --check-script` を走らせ、自己テストが落ちることを確かめる。落ちなければ、その規則の違反の例（`maintenance/checker-fixtures/`）が足りない。

**スキルの崩れが生成物に出て、採点で落ちるか。**

1. スキルのディレクトリを作業場所の下に複製し、規約を1つずつ崩した版を作る。例: references の規則の文を消す（`errors.md` の
   「メッセージは受け入れる形を『です』で、拒む操作を『できません』で言い切る」、`test-style.md` の Given / When / Then の文の終わりの表）、
   `example/` のコメントやメッセージを規則に反する形に書き換える。**〔スクリプト判定〕の規則を崩すときは、書く側のスキルの references と
   スキルに入れた check.mjs の両方から消す**（片方だけ消すと、残ったほうから規則が伝わる）
2. 崩した版をスキルとして、skill-creator の手順どおりに with_skill の実行と採点を行う。崩した規則に関わる採点項目が配られたケースを選んで回す。
   採点には、上で固定した check.mjs を使う
3. 崩した規則の採点項目が、そのケースのどれかで fail になるかを見る。ほかの記述や example が崩した規則を補って、正しい成果物が出ることもあるので、
   通ったことだけで採点の欠陥とは決めない。生成物に違反が現れたのに採点が通したときは、採点項目の文言・配る先・スクリプトの判定のどれが足りないかを調べて直す
4. 崩した版の複製と結果は作業場所に置き、スキルのディレクトリには残さない
