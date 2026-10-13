import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-faikout';

test('the Unreleased section moves under the released version', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A thing.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.0', '2026-10-13');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-10-13\n\n### Added\n\n- A thing\./,
  );
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.0\\.0\\]: ${REPO}/releases/tag/v1\\.0\\.0`));
});

test('a release without changes still gets its heading, and compares with the previous tag', () => {
  const before = `## [Unreleased]\n\n## [1.0.0] - 2026-10-13\n\n- x\n\n[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n[1.0.0]: ${REPO}/releases/tag/v1.0.0\n`;
  const after = rollChangelog(before, '1.0.1', '2026-10-14');
  assert.match(
    after,
    /## \[1\.0\.1\] - 2026-10-14\n\n- Maintenance release, no functional change\./,
  );
  assert.match(after, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.0\\.1`));
  assert.equal(rollChangelog(after, '1.0.1', '2026-10-14'), after, 'idempotent');
});

test('the repository changelog has an Unreleased section and its link', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
  assert.match(text, /^\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-faikout\//m);
});

test('a mention of the heading in the intro text is not the section', () => {
  // gladys-xbox 1.0.1 wrote its release section inside an intro quoting the heading.
  const before =
    '# Changelog\n\nDescribe each change under `## [Unreleased]` as you make it.\n\n' +
    `## [Unreleased]\n\n### Added\n\n- Something new.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.0', '2026-10-13');
  assert.match(
    after,
    /under `## \[Unreleased\]` as you make it\.\n\n## \[Unreleased\]\n\n## \[1\.0\.0\]/,
  );
  assert.match(after, /## \[1\.0\.0\] - 2026-10-13\n\n### Added\n\n- Something new\./);
});

test('a version only mentioned in the text is still released', () => {
  const before = `## [Unreleased]\n\n- Prepares \`## [2.0.0]\` docs.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  assert.match(rollChangelog(before, '2.0.0', '2026-10-13'), /^## \[2\.0\.0\] - 2026-10-13$/m);
});
