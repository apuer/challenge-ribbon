import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const repository = process.env.GITHUB_REPOSITORY || "OWNER/challenge-ribbon";
const tag = process.env.GITHUB_REF_NAME || `v${JSON.parse(await readFile("module.json", "utf8")).version}`;
const version = tag.replace(/^v/, "");
const root = process.cwd();
const dist = path.join(root, "dist");
const stage = path.join(dist, "package");

await rm(dist, { recursive: true, force: true });
await mkdir(stage, { recursive: true });

const manifest = JSON.parse(await readFile("module.json", "utf8"));
if (manifest.version !== version) {
  throw new Error(`Tag ${tag} does not match module version ${manifest.version}`);
}

Object.assign(manifest, {
  url: `https://github.com/${repository}`,
  manifest: `https://github.com/${repository}/releases/latest/download/module.json`,
  download: `https://github.com/${repository}/releases/download/${tag}/challenge-ribbon.zip`,
});

await writeFile(path.join(stage, "module.json"), `${JSON.stringify(manifest, null, 2)}\n`);
for (const entry of ["LICENSE", "README.md", "lang", "scripts/challenge-ribbon.js", "scripts/counter-model.js", "styles"]) {
  await cp(path.join(root, entry), path.join(stage, entry), { recursive: true });
}

execFileSync("zip", ["-r", "../challenge-ribbon.zip", ".", "-x", "*.DS_Store"], {
  cwd: stage,
  stdio: "inherit",
});
await cp(path.join(stage, "module.json"), path.join(dist, "module.json"));

console.log(`Built ${path.join(dist, "challenge-ribbon.zip")}`);
console.log(`Manifest: https://github.com/${repository}/releases/latest/download/module.json`);
