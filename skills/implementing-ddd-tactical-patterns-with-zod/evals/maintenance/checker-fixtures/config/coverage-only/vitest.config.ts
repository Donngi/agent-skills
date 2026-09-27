import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		typecheck: {
			enabled: true,
			include: ["nothing/**/*.test-d.ts"],
		},
		coverage: {
			exclude: ["**/*.helper.test.ts"],
		},
	},
});
