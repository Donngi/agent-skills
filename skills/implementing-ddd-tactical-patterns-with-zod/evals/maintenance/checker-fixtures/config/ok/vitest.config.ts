import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, "**/*.helper.test.ts"],
		typecheck: {
			enabled: true,
			include: ["**/*.test-d.ts"],
		},
	},
});
