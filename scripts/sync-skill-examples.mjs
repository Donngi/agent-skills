#!/usr/bin/env node
// スキル間で共有する example のファイルが、正本と一致しているかを確かめる。
// スキルは単独で配布するので、別のスキルの example を相対パスで参照できない。
// 複製を各スキルに同梱し、正本からの一方向の同期でずれを止める。
//
//   node scripts/sync-skill-examples.mjs        ずれがあれば一覧を出して終了コード1
//   node scripts/sync-skill-examples.mjs --fix  正本で複製を上書きし、正本に無いファイルを消す
//
// Node 20.11 以上（import.meta.dirname を使う）。

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** 正本と複製の組。複製の側は直接編集しない。 */
const PAIRS = [
	{
		source: "skills/implementing-ddd-tactical-patterns-with-zod/example/domain",
		replica: "skills/implementing-onion-usecases/example/domain",
	},
	{
		source: "skills/implementing-onion-usecases/evals/fixtures/library/domain",
		replica: "skills/implementing-onion-usecases/evals/fixtures/library-notfound-shared/domain",
	},
	{
		source: "skills/implementing-onion-usecases/evals/fixtures/library/domain",
		replica: "skills/implementing-onion-usecases/evals/fixtures/library-review/domain",
	},
	{
		source: "skills/implementing-onion-usecases/evals/fixtures/library/domain",
		replica: "skills/implementing-onion-usecases/evals/fixtures/library-reviewed-tests/domain",
	},
	{
		source: "skills/implementing-onion-usecases/evals/fixtures/library/domain",
		replica: "skills/implementing-onion-usecases/evals/fixtures/library-nonconforming/domain",
	},
	{
		source: "skills/implementing-onion-usecases/evals/fixtures/library/domain",
		replica: "skills/implementing-onion-usecases/evals/fixtures/library-result/domain",
	},
];

const IGNORED = new Set(["node_modules", ".DS_Store"]);

// スキルは単独で配布するので、リンクは配布先で切れる。複製の一致とみなさずに止める
function exitOnSymlink(full) {
	if (fs.lstatSync(full).isSymbolicLink()) {
		console.error(`シンボリックリンクは使えません。実体のファイルを置いてください: ${path.relative(ROOT, full)}`);
		process.exit(1);
	}
}

/** パスに何かあるか。壊れたリンクも「ある」とみなす（existsSync はリンク先を見る）。 */
function exists(full) {
	try {
		fs.lstatSync(full);
		return true;
	} catch {
		return false;
	}
}

function listFiles(dir) {
	if (!exists(dir)) return [];
	exitOnSymlink(dir);
	if (!fs.statSync(dir).isDirectory()) {
		console.error(`ディレクトリのはずの場所がファイルです: ${path.relative(ROOT, dir)}`);
		process.exit(1);
	}
	const files = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (IGNORED.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		exitOnSymlink(full);
		if (entry.isDirectory()) {
			for (const child of listFiles(full)) {
				files.push(path.join(entry.name, child));
			}
		} else {
			files.push(entry.name);
		}
	}
	return files.sort();
}

/** dir の下の空のディレクトリを消す。dir そのものは残す。 */
function removeEmptyDirs(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory() || IGNORED.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		removeEmptyDirs(full);
		if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
	}
}

function diffPair({ source, replica }) {
	const sourceDir = path.join(ROOT, source);
	const replicaDir = path.join(ROOT, replica);
	const sourceFiles = listFiles(sourceDir);
	const replicaFiles = new Set(listFiles(replicaDir));
	const changes = [];
	for (const file of sourceFiles) {
		if (!replicaFiles.has(file)) {
			changes.push({ kind: "missing", file });
			continue;
		}
		replicaFiles.delete(file);
		const a = fs.readFileSync(path.join(sourceDir, file));
		const b = fs.readFileSync(path.join(replicaDir, file));
		if (!a.equals(b)) changes.push({ kind: "changed", file });
	}
	for (const file of replicaFiles) changes.push({ kind: "extra", file });
	return changes;
}

const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => arg !== "--fix");
if (unknownArgs.length > 0) {
	console.error(`知らない引数です: ${unknownArgs.join(" ")}（使えるのは --fix だけ）`);
	process.exit(1);
}
const fix = args.includes("--fix");

// 正本と複製のディレクトリまでの途中にリンクがあっても、配布先では切れる。何も変える前に確かめる
for (const { source, replica } of PAIRS) {
	for (const target of [source, replica]) {
		let current = ROOT;
		for (const part of target.split("/")) {
			current = path.join(current, part);
			if (!exists(current)) break;
			exitOnSymlink(current);
		}
	}
}

// 正本が無いと、複製のファイルがすべて extra になり、--fix で全部消えてしまう。何も変える前に止める
const missingSources = PAIRS.filter(
	({ source }) =>
		!fs.existsSync(path.join(ROOT, source)) ||
		listFiles(path.join(ROOT, source)).length === 0,
);
if (missingSources.length > 0) {
	for (const { source } of missingSources) {
		console.error(`正本が無いか空です: ${source}`);
	}
	process.exit(1);
}

let drifted = false;

// 途中でリンクを見つけて止まっても書き換えが半端に残らないように、全組のずれを先に出してから直す
const diffs = PAIRS.map((pair) => ({ pair, changes: diffPair(pair) }));

for (const { pair, changes } of diffs) {
	if (changes.length === 0) continue;
	drifted = true;
	console.log(`${pair.replica} が ${pair.source} とずれています:`);
	for (const { kind, file } of changes) console.log(`  ${kind}\t${file}`);
	if (!fix) continue;
	// ファイルとディレクトリが入れ替わっても上書きできるように、余分なものを消してからコピーする
	const replicaDir = path.join(ROOT, pair.replica);
	for (const { kind, file } of changes) {
		if (kind === "extra") fs.rmSync(path.join(replicaDir, file));
	}
	fs.mkdirSync(replicaDir, { recursive: true });
	removeEmptyDirs(replicaDir);
	for (const { kind, file } of changes) {
		if (kind === "extra") continue;
		const target = path.join(replicaDir, file);
		const parent = path.dirname(target);
		if (fs.existsSync(parent) && !fs.statSync(parent).isDirectory()) fs.rmSync(parent);
		// 無視するもの（.DS_Store など）だけが残ったディレクトリは、一覧にも空のディレクトリにも数えられない
		if (fs.existsSync(target) && fs.statSync(target).isDirectory()) fs.rmSync(target, { recursive: true });
		fs.mkdirSync(parent, { recursive: true });
		fs.copyFileSync(path.join(ROOT, pair.source, file), target);
	}
}

if (drifted && fix) {
	console.log("正本で複製を更新しました。複製側の example で型検査とテストを流してください。");
} else if (drifted) {
	console.log("node scripts/sync-skill-examples.mjs --fix で正本から複製を更新できます。");
	process.exit(1);
} else {
	console.log("すべての複製が正本と一致しています。");
}
