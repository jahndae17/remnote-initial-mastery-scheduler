const fs = require('node:fs');
// The SDK's UMD entry expects the browser's global name, even for its pure parser.
globalThis.self = globalThis;
const { parseManifest } = require('@remnote/plugin-sdk');
const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
const result = parseManifest(manifest);
if (!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
if (manifest.id !== 'initial_mastery_scheduler') throw new Error('Unexpected plugin identity');
// SDK 0.0.46 accepts arbitrary URLs; the current installer requires GitHub.
const repository = new URL(manifest.repoUrl);
if (repository.protocol !== 'https:' || repository.hostname !== 'github.com' ||
    repository.port || repository.username || repository.password ||
    repository.search || repository.hash ||
    !/^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/?$/.test(repository.pathname)) {
  throw new Error('repoUrl must identify this plugin\'s own public HTTPS GitHub repository: https://github.com/OWNER/REPOSITORY.');
}
if (/^\/remnoteio\/remnote-plugin-template(?:-react)?(?:\.git)?\/?$/i.test(repository.pathname)) {
  throw new Error('RemNote rejects the template repository. Create this plugin\'s own public GitHub repository and update repoUrl before building.');
}
console.log('RemNote SDK manifest and repository format checks passed. Public availability and ownership must also be verified before upload.');
