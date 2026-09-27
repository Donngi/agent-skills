import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		root: import.meta.dirname,
		// ヘルパーはテストを登録しないので、収集すると No test suite found で落ちる
		exclude: [...configDefaults.exclude, "**/*.helper.test.ts"],
		typecheck: {
			// 有効にしないと Xxx.test-d.ts は収集されず、型のテストが1件も走らない
			enabled: true,
			include: ["**/*.test-d.ts"],
		},
		coverage: {
			provider: "v8",
			include: ["**/*.ts"],
			// テスト・ヘルパー・型のテストを数えない。数えると率が実態とずれる
			exclude: ["**/*.test.ts", "**/*.test-d.ts", "*.config.ts"],
		},
	},
});
