import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const userscriptPath = path.join(repoRoot, 'vBlockTube.user.js');
const heroPath = path.join(repoRoot, 'assets', 'readme', 'hero.svg');

const userscript = await readFile(userscriptPath, 'utf8');
const versionMatch = userscript.match(/@version\s+([0-9]+(?:\.[0-9]+)*)/);

if (!versionMatch) {
  throw new Error(`Could not find @version in ${userscriptPath}`);
}

const version = versionMatch[1];
const heroSvg = await readFile(heroPath, 'utf8');
const updatedHeroSvg = heroSvg.replace(
  /(<text id="hero-version"[^>]*>)([^<]*)(<\/text>)/,
  `$1v${version} · Active Updates$3`,
);

if (updatedHeroSvg === heroSvg) {
  console.log(`hero.svg already matches v${version}`);
} else {
  await writeFile(heroPath, updatedHeroSvg, 'utf8');
  console.log(`Updated hero.svg to v${version}`);
}