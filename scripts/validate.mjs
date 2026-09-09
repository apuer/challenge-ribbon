import { access, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const requiredFiles = [
  "module.json",
  "scripts/challenge-ribbon.js",
  "scripts/counter-model.js",
  "scripts/layout-model.js",
  "styles/challenge-ribbon.css",
  "lang/en.json",
  "lang/ru.json",
  "README.md",
  "LICENSE",
];

for (const file of requiredFiles) await access(file);

const manifest = JSON.parse(await readFile("module.json", "utf8"));
const english = JSON.parse(await readFile("lang/en.json", "utf8"));
const russian = JSON.parse(await readFile("lang/ru.json", "utf8"));

for (const key of ["id", "title", "description", "version", "compatibility"]) {
  if (!manifest[key]) throw new Error(`module.json is missing ${key}`);
}
if (manifest.id !== "challenge-ribbon") throw new Error("Unexpected module id");
if (manifest.version !== process.env.EXPECTED_VERSION && process.env.EXPECTED_VERSION) {
  throw new Error(`Expected version ${process.env.EXPECTED_VERSION}, got ${manifest.version}`);
}

const englishKeys = Object.keys(english).sort();
const russianKeys = Object.keys(russian).sort();
if (JSON.stringify(englishKeys) !== JSON.stringify(russianKeys)) {
  throw new Error("English and Russian localization keys differ");
}

execFileSync(process.execPath, ["--check", "scripts/challenge-ribbon.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "scripts/counter-model.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "scripts/layout-model.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--test", "tests/*.test.mjs"], { stdio: "inherit" });
console.log(`Challenge Ribbon ${manifest.version}: validation passed.`);
