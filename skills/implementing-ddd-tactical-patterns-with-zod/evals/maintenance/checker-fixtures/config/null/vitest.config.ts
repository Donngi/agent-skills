import { defineConfig } from "vitest/config";
import { sharedExclude, sharedTypecheck } from "./shared";

export default defineConfig({
	test: {
		exclude: sharedExclude,
		typecheck: sharedTypecheck,
	},
});
