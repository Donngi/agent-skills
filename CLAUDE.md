# CLAUDE.md

このリポジトリのスキルは `/skill-creator`（Claude Code のスキル開発ワークフロー）で開発・改善する。スキル開発に伴って生まれる **evals** と **workspace** の管理方針を以下に定める。skill-creator を使う際はこの方針に従うこと。

## ディレクトリ構成

```
agent-skills/
├── skills/                          # スキル本体（git 管理）
│   └── <skill-name>/
│       ├── SKILL.md                 # 必須
│       ├── lib/ or scripts/         # 任意: 決定論的な処理
│       ├── references/              # 任意: ドキュメント
│       └── evals/evals.json         # 任意: テスト定義（git 管理する）
└── .skill-workspaces/               # 評価実行の成果物（git 管理しない）
    └── <skill-name>/
        ├── iteration-N/             # ベンチ・採点・実行ログ
        └── skill-snapshot/          # baseline スキルのコピー
```

## evals/ の方針

- スキル本体内の `evals/evals.json`（skill-creator 規約どおり、`SKILL.md` と同階層）に置く。
- **git 管理する**。evals はスキルの仕様・検証項目であり、スキルパッケージにも含まれる（配布先で再実行可能）。スキル本体と一緒にバージョン管理する。

## workspace の方針

- ベンチ・採点・実行ログ・ユーザーフィードバック等、skill-creator がテスト/改善ループで生成する成果物を指す。
- **置き場所**: リポジトリ直下の `.skill-workspaces/<skill-name>/` に集約する。
  - skill-creator のデフォルトはスキルパスの兄弟（`skills/<skill-name>-workspace/`）だが、これは `skills/` 名前空間を汚染するため**使わない**。skill-creator でテスト/ベンチを実行する際は、workspace のルートとして `<repo>/.skill-workspaces/<skill-name>/` を明示的に指定すること。
  - もし `skills/` 配下に `<name>-workspace/` を見つけたら `.skill-workspaces/<name>/` へ移すこと。
- **git 管理しない**。再生成可能な開発者ローカルの作業物であり、`.gitignore` で `/.skill-workspaces/` を除外済み。
