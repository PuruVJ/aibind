import { execSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Publish order: dependencies first, then dependents
const publishOrder = [
  "common",
  "markdown",
  "svelte",
  "vue",
  "solid",
  "sveltekit",
  "nuxt",
  "solidstart",
];

const args = process.argv.slice(2).join(" "); // e.g. --dry-run

for (const pkg of publishOrder) {
  const pkgDir = join("packages", pkg);
  const jsrConfig = join(pkgDir, "jsr.json");

  if (!existsSync(jsrConfig)) {
    console.log(`⏭  Skipping ${pkg} (no jsr.json)`);
    continue;
  }

  console.log(`\n📦 Publishing @aibind/${pkg}...`);
  try {
    execSync(`npx jsr publish ${args}`, {
      cwd: pkgDir,
      stdio: "inherit",
    });
    console.log(`✅ @aibind/${pkg} published`);
  } catch (err) {
    console.error(`❌ @aibind/${pkg} failed`);
    process.exit(1);
  }
}

console.log("\n🎉 All packages published to JSR");
