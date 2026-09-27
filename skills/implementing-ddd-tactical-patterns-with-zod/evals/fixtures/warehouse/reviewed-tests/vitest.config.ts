import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		root: import.meta.dirname,
		// ヘルパーはテストを登録しないので、収集すると No test suite found で落ちる
		exclude: [...configDefaults.exclude, "**/*.helper.test.ts"],
	},
});
