import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**", ".scratch/**"],
    pool: "threads",
    maxWorkers: 1,
  },
});
