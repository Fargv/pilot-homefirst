import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePersonalization } from "../src/kitchen/personalizationContract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../catalog-packs");
const files = (await fs.readdir(root)).filter((name) => name.endsWith(".json")).sort();
const report = { directory: "backend/catalog-packs", files: files.length, dishes: 0, withPersonalization: 0, validPersonalization: 0, invalidPersonalization: 0, missingPersonalization: 0, invalid: [] };
for (const file of files) {
  const pack = JSON.parse(await fs.readFile(path.join(root, file), "utf8"));
  for (const [index, dish] of (Array.isArray(pack.dishes) ? pack.dishes : []).entries()) {
    report.dishes += 1;
    if (dish.personalization === undefined) {
      report.missingPersonalization += 1;
      continue;
    }
    report.withPersonalization += 1;
    const result = validatePersonalization(dish.personalization);
    if (result.valid) report.validPersonalization += 1;
    else {
      report.invalidPersonalization += 1;
      report.invalid.push({ file, dishIndex: index, errors: result.errors });
    }
  }
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
