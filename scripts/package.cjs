const fs = require('node:fs');
const path = require('node:path');
const zip = require('bestzip');
async function main() {
  const root = path.resolve(__dirname, '..');
  const delivery = path.join(root, 'artifacts');
  fs.mkdirSync(delivery, { recursive: true });
  await zip({ cwd: path.join(root, 'dist'), source: '*', destination: path.join(delivery, 'InitialMasteryScheduler-development.zip') });
  await zip({ cwd: root, source: ['src', 'tests', 'scripts', 'public', 'README.md', 'VALIDATION.md', 'ARCHITECTURE.md', 'DOCS_REVIEW.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'webpack.config.js', 'postcss.config.js', 'tailwind.config.js', '.gitignore', '.nvmrc', '.prettierrc'], destination: path.join(delivery, 'InitialMasteryScheduler-source.zip') });
  console.log('Created plugin and source ZIPs in artifacts/.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
