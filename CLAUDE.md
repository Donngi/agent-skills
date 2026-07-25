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

## `.agent-skills/` の位置づけ（混同しないこと）

スキルが実行時に読み書きする**消費側のローカル層**として `.agent-skills/<skill-name>/`（オーバーレイは専用拡張子 `.overlay.md`／フィードバックは `feedback.md`）を規約に持つ。開発リポジトリ内の以下2つとは役割が異なるので混同しないこと。

- `.agent-skills/`（消費側）… スキル利用者の端末/プロジェクト（`<repo root>/` と `$HOME/`）に置く、ユーザーのカスタマイズ設定とフィードバックログ。スキル本体には含めず、`references/` には「規約・様式」だけを持つ。
- `.local/`（消費側）… terraform 系スキルが使う再生成可能なキャッシュ。
- `.skill-workspaces/`（開発側）… skill-creator の評価・ベンチ成果物。

overlay/feedback の実装は横断的な共有スキルにせず、**各スキルの `references/` に自己完結でカプセル化**する（リファレンス実装は `skills/commit/`）。オーバーレイは専用拡張子 `.overlay.md` で**2系統**（予約名 `<既定ファイル名>.overlay.md` は同名の既定 references ファイルの差し替え、それ以外の `*.overlay.md` は必ず追加読み込み）。feedback は**コミットさせない**ため、root の `.gitignore` ではなく `.agent-skills/<skill>/.gitignore`（中身 `feedback.md`）で自己完結に除外する（overlay 系はコミット可能なまま）。
