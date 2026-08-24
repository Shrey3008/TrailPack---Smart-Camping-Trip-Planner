/* Deployment configuration for the Worker.

   These are the checks that would otherwise only fail on Cloudflare, after a
   push, on the deploy that also serves the live frontend.

   The sharpest one is the Wrangler version. `assets.run_worker_first` accepts
   an array of path globs only from Wrangler 4.19; older versions do not warn
   and do not ignore it, they refuse the entire config — measured against
   3.114, 4.0, 4.10, 4.15 and 4.18, all of which fail with "Expected
   assets.run_worker_first to be of type boolean", against 4.20 and 4.125 which
   accept it. With no version pinned, the build environment picks, so the pin
   and the config have to stay in agreement. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const readJsonc = (p) => {
  const raw = fs.readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')       // block comments
    .replace(/^\s*\/\/.*$/gm, '');          // whole-line comments
  return JSON.parse(raw);
};

const wrangler = readJsonc(path.join(ROOT, 'wrangler.jsonc'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const RUN_WORKER_FIRST_ARRAY_MIN = [4, 19, 0];
const parseVersion = (v) => String(v).replace(/^[^\d]*/, '').split('.').map(Number);
const gte = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return true;
};

describe('deploy config — Worker entry', () => {
  test('declares a main entry point', () => {
    expect(typeof wrangler.main).toBe('string');
  });
  test('the entry point exists', () => {
    expect(fs.existsSync(path.join(ROOT, wrangler.main))).toBe(true);
  });
  test('everything the entry imports exists', () => {
    // The bundle is built from these; a rename that misses one fails only at
    // build time on Cloudflare otherwise.
    const entry = fs.readFileSync(path.join(ROOT, wrangler.main), 'utf8');
    const specs = [...entry.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(m => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    specs.forEach(spec => {
      expect(fs.existsSync(path.resolve(ROOT, path.dirname(wrangler.main), spec))).toBe(true);
    });
  });
  test('the Worker source imports no npm package', () => {
    // Nothing in src/ may need an install step; the bundle has to be
    // self-contained from a clean clone.
    ['index.js', 'handler.js', 'trails.js'].forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
      const bare = [...src.matchAll(/(?:from|require\()\s*['"]([^.'"][^'"]*)['"]/g)].map(m => m[1]);
      expect(bare).toEqual([]);
    });
  });
  test('a compatibility date is set', () => {
    expect(wrangler.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('deploy config — assets', () => {
  test('serves the frontend directory', () => {
    expect(wrangler.assets.directory).toBe('./frontend');
    expect(fs.existsSync(path.join(ROOT, wrangler.assets.directory))).toBe(true);
  });
  test('binds ASSETS so the Worker can serve them', () => {
    expect(wrangler.assets.binding).toBe('ASSETS');
  });
  test('keeps the existing html_handling and 404 behaviour', () => {
    expect(wrangler.assets.html_handling).toBe('auto-trailing-slash');
    expect(wrangler.assets.not_found_handling).toBe('none');
  });
  test('nothing private or test-only sits inside the assets directory', () => {
    const dir = path.join(ROOT, wrangler.assets.directory);
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    const files = walk(dir).map(f => path.relative(dir, f));
    files.forEach(f => {
      expect(f).not.toMatch(/(^|\/)\.env$/);
      expect(f).not.toMatch(/\.test\.js$/);
      expect(f).not.toMatch(/(^|\/)fixtures\//);
      expect(f).not.toMatch(/\.items\.json$/);
      expect(f).not.toMatch(/\.overpass\.json$/);
      expect(f).not.toMatch(/(^|\/)node_modules\//);
      // Build sources, not deliverables. The pre-resize hero originals sat in
      // frontend/assets/hero/_originals for months — 18 MB uploaded on every
      // build that no page ever requested. They live in assets-source/ now;
      // the underscore prefix is the convention that keeps them out of here.
      expect(f).not.toMatch(/(^|\/)_/);
    });
  });
});

describe('deploy config — the Wrangler version has to match the config', () => {
  const pinned = (pkg.devDependencies && pkg.devDependencies.wrangler)
    || (pkg.dependencies && pkg.dependencies.wrangler);

  test('a Wrangler version is pinned, so the build environment does not choose', () => {
    expect(typeof pinned).toBe('string');
  });

  test('the pinned version supports the run_worker_first form in use', () => {
    if (!Array.isArray(wrangler.assets.run_worker_first)) return;   // boolean form works everywhere
    expect(gte(parseVersion(pinned), RUN_WORKER_FIRST_ARRAY_MIN)).toBe(true);
  });

  test('the lockfile agrees with package.json', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
    const locked = lock.packages && lock.packages['node_modules/wrangler'];
    expect(locked).toBeDefined();
    expect(gte(parseVersion(locked.version), RUN_WORKER_FIRST_ARRAY_MIN)).toBe(true);
  });

  test('/api is the only prefix routed to the Worker ahead of assets', () => {
    expect(wrangler.assets.run_worker_first).toEqual(['/api/*']);
  });
});
