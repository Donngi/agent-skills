import { defineConfig } from "vitest/config";

// exclude: ["**/*.helper.test.ts"]
/*
 * typecheck: { enabled: true }
 */
export default defineConfig({
	test: {
		exclude: [],
		typecheck: {
			enabled: false,
		},
	},
});
