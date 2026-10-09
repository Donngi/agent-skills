#!/usr/bin/env python3
"""evals.src.json から evals.json を生成する。

出力は skill-creator の evals.json の形式（id / prompt / expected_output / files / expectations）だけにする。
`files` はスキルのルートからの相対パス。保守用のキー（name / category / discriminative / inherits / excludes）は
evals.src.json にだけ置く。設計は README.md、ケースの一覧は CASES.md にある。

- 共通の採点項目をプロファイルから展開し、`[共通] ` を前置して、ケース固有のものと連結する
- `excludes` の規則 ID を継承した採点項目から落とす。継承側に無い ID を書いたらエラーにする
- 継承したプロファイルをまとめたときに、同じ規則 ID が2つあればエラーにする
- `files` はグロブ（`*` / `**`）を書いてよい。展開した結果がスキルのルートからの相対パスで出力される
- `{violations}` はレビューケースの期待違反の一覧のパスに置き換える

整合の検査:
- `files` のファイル（グロブなら1件以上）が実在する
- レビューケースの V / D の採点項目の番号が、expected-violations の一覧の表の行と一致する
- README.md のプロファイルの表の配布先が、各ケースの `inherits` と一致する

`--typecheck --node-modules <dir>` で、各ケースの `files` だけを一時ディレクトリに写して `tsc` を走らせる。
`--check` で、evals.json を書き換えずに生成結果との一致だけを確かめる。
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).parent
SKILL_ROOT = HERE.parent
FIXTURES = HERE / "fixtures"
ID_PATTERN = re.compile(r"^\[([a-z0-9-]+)\]")
REVIEW_ITEM = re.compile(r"^([VD])(\d+): ")
PROFILE_ROW = re.compile(r"^\| `([a-z0-9-]+)` \| [^|]+ \| ([^|]+) \|$")


def assertion_id(assertion: str) -> str | None:
    matched = ID_PATTERN.match(assertion)
    return matched.group(1) if matched else None


def compress(ids: list[int]) -> str:
    runs: list[list[int]] = []
    for i in sorted(ids):
        if runs and runs[-1][-1] + 1 == i:
            runs[-1].append(i)
        else:
            runs.append([i])
    return "・".join(str(r[0]) if len(r) == 1 else f"{r[0]}〜{r[-1]}" for r in runs)


def expand_files(patterns: list[str]) -> tuple[list[str], list[str]]:
    """evals/ からの相対パスのパターンを展開する。戻り値は (evals/ からの相対パス, エラー)。"""
    files: list[str] = []
    errors: list[str] = []
    for pattern in patterns:
        if any(c in pattern for c in "*?["):
            matched = sorted(
                str(p.relative_to(HERE))
                for p in HERE.glob(pattern)
                if p.is_file() and "node_modules" not in p.parts
            )
            if not matched:
                errors.append(f"files のグロブに当たるファイルが無い: {pattern}")
            files.extend(matched)
        elif (HERE / pattern).is_file():
            files.append(pattern)
        else:
            errors.append(f"files のファイルが無い: {pattern}")
    seen: set[str] = set()
    unique = [f for f in files if not (f in seen or seen.add(f))]
    return unique, errors


def build_case(case: dict, profiles: dict) -> tuple[dict, list[str]]:
    errors: list[str] = []
    inherited: list[str] = []
    for name in case["inherits"]:
        if name not in profiles:
            errors.append(f"{case['name']}: 無いプロファイルを継承している: {name}")
            continue
        for assertion in profiles[name]:
            if assertion not in inherited:
                inherited.append(assertion)
    ids = [assertion_id(a) for a in inherited]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        errors.append(f"{case['name']}: 同じ規則 ID が2つ以上入っている: {dup}")
    excludes = case.get("excludes", [])
    missing = [e for e in excludes if e not in ids]
    if missing:
        errors.append(f"{case['name']}: excludes に継承側で見つからない ID がある: {missing}")
    kept = [a for a in inherited if assertion_id(a) not in excludes]
    violations = f"evals/expected-violations/{case['name']}.md"
    expectations = [
        "[共通] " + a.replace("{violations}", violations) for a in kept
    ] + case["assertions"]
    files, file_errors = expand_files(case["files"])
    errors += [f"{case['name']}: {e}" for e in file_errors]
    built = {
        "id": case["id"],
        "prompt": case["prompt"],
        "expected_output": case["expected_output"],
        "files": [f"evals/{f}" for f in files],
        "expectations": expectations,
    }
    return built, errors


def check_review(case: dict) -> list[str]:
    if case["category"] != "review":
        return []
    path = HERE / "expected-violations" / f"{case['name']}.md"
    if not path.is_file():
        return [f"{case['name']}: 期待違反の一覧が無い: {path.relative_to(HERE)}"]
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    for kind in ("V", "D"):
        listed = sorted(set(int(n) for n in re.findall(rf"^\| {kind}(\d+) \|", text, re.M)))
        asserted = sorted(
            int(m.group(2))
            for a in case["assertions"]
            if (m := REVIEW_ITEM.match(a)) and m.group(1) == kind
        )
        if listed != asserted:
            errors.append(
                f"{case['name']}: {kind} の採点項目 {asserted} が一覧の表の行 {listed} と一致しない"
            )
    return errors


def check_profile_table(cases: list[dict], profiles: dict) -> list[str]:
    readme = HERE / "README.md"
    if not readme.is_file():
        return ["README.md が無い"]
    table: dict[str, str] = {}
    for line in readme.read_text(encoding="utf-8").splitlines():
        if (m := PROFILE_ROW.match(line.strip())):
            table[m.group(1)] = m.group(2).strip()
    errors: list[str] = []
    for name in profiles:
        actual = [c["id"] for c in cases if name in c["inherits"]]
        expected = compress(actual) if actual else "なし"
        if table.get(name) != expected:
            errors.append(
                f"README.md のプロファイルの表: {name} の配布先が {table.get(name)!r}、inherits からは {expected!r}"
            )
    return errors


def typecheck(cases: list[dict], built: list[dict], node_modules: pathlib.Path) -> list[str]:
    tsc = node_modules / ".bin" / "tsc"
    if not tsc.is_file():
        return [f"--typecheck: tsc が見つからない: {tsc}"]
    errors: list[str] = []
    for case, out in zip(cases, built):
        ts_files = [f for f in out["files"] if f.endswith(".ts")]
        if not ts_files:
            continue
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            for f in out["files"]:
                dst = root / pathlib.Path(f).relative_to("evals/fixtures")
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(SKILL_ROOT / f, dst)
            for project in {pathlib.Path(f).relative_to("evals/fixtures").parts[0] for f in ts_files}:
                project_dir = root / project
                if not (project_dir / "tsconfig.json").is_file():
                    errors.append(f"{case['name']}: {project}/tsconfig.json を files に入れていない")
                    continue
                (project_dir / "node_modules").symlink_to(node_modules.resolve())
                result = subprocess.run(
                    [str(tsc), "-p", str(project_dir / "tsconfig.json")],
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    errors.append(
                        f"{case['name']}: files だけでは型検査が通らない\n{result.stdout[:2000]}"
                    )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--typecheck", action="store_true")
    parser.add_argument("--node-modules", type=pathlib.Path)
    args = parser.parse_args()

    src = json.loads((HERE / "evals.src.json").read_text(encoding="utf-8"))
    profiles = src["profiles"]
    cases = src["evals"]

    errors: list[str] = []
    for name, assertions in profiles.items():
        for a in assertions:
            if assertion_id(a) is None:
                errors.append(f"プロファイル {name} の assertion に規則 ID が無い: {a[:40]}")
    ids = [c["id"] for c in cases]
    if ids != list(range(1, len(cases) + 1)):
        errors.append(f"id が 1 からの連番になっていない: {ids}")
    built: list[dict] = []
    for case in cases:
        out, case_errors = build_case(case, profiles)
        built.append(out)
        errors += case_errors
        errors += check_review(case)
    errors += check_profile_table(cases, profiles)
    if args.typecheck:
        if args.node_modules is None:
            errors.append("--typecheck には --node-modules が要る")
        else:
            errors += typecheck(cases, built, args.node_modules)
    if errors:
        print("整合の検査で止めた", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1

    output = {"skill_name": src["skill_name"], "evals": built}
    text = json.dumps(output, ensure_ascii=False, indent=2) + "\n"
    target = HERE / "evals.json"
    if args.check:
        if not target.is_file() or target.read_text(encoding="utf-8") != text:
            print("evals.json が evals.src.json の生成結果と違う", file=sys.stderr)
            return 1
    else:
        target.write_text(text, encoding="utf-8")
    print(f"{len(built)} ケース")
    for case, out in zip(cases, built):
        print(f"  {case['id']:>2} {case['name']:<34} {len(out['expectations'])}件 files {len(out['files'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
