import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { fetchWgerCatalog, normalizeWgerCatalog } from "./wger-adapter";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const rawDirectory = resolve(projectRoot, ".scratch", "catalog");
const rawFile = resolve(rawDirectory, "wger.json");
const snapshotFile = resolve(projectRoot, "apps", "web", "public", "catalog", "v1.json");
const command = process.argv[2];

if (command === "fetch") {
  const catalog = await fetchWgerCatalog();
  await mkdir(rawDirectory, { recursive: true });
  await writeFile(rawFile, JSON.stringify(catalog, null, 2), "utf8");
  console.log(`Saved ${catalog.results?.length ?? 0} raw wger records to ${rawFile}`);
} else if (command === "build") {
  const raw: unknown = JSON.parse(await readFile(rawFile, "utf8"));
  const exercises = normalizeWgerCatalog(raw);
  await mkdir(resolve(projectRoot, "apps", "web", "public", "catalog"), { recursive: true });
  await writeFile(
    snapshotFile,
    JSON.stringify({ version: 1, provider: "wger", generatedAt: new Date().toISOString(), exercises }, null, 2),
    "utf8",
  );
  console.log(`Built ${exercises.length} normalized exercises at ${snapshotFile}`);
} else {
  throw new Error("Use `npm run catalog:fetch` or `npm run catalog:build`");
}
