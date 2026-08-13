import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "dist", "client", "games");

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const copyBuild = (slug) => {
  const gameRoot = path.join(root, "games", slug);
  const buildRoot = path.join(gameRoot, "dist");

  run("npm", ["ci", "--no-audit", "--no-fund"], gameRoot);
  run("npm", ["run", "build"], gameRoot);
  cpSync(buildRoot, path.join(outputRoot, slug), { recursive: true });
};

if (!existsSync(path.join(root, "dist", "client", "index.html"))) {
  console.error("Build the root Starweaver game before assembling the collection.");
  process.exit(1);
}

if (!existsSync(path.join(root, "games", "pokemon-clone", "vendor", "pokeyellow", "constants"))) {
  console.error("Pokemon source data is missing. Run: git submodule update --init --recursive");
  process.exit(1);
}

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });

const neonRoot = path.join(outputRoot, "best-game");
mkdirSync(neonRoot, { recursive: true });
cpSync(path.join(root, "games", "best-game", "index.html"), path.join(neonRoot, "index.html"));

for (const slug of ["pokemon-clone", "pubg-clone", "z-clone"]) {
  copyBuild(slug);
}

console.log(`Assembled game collection at ${outputRoot}`);
