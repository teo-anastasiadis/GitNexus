#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pascalDir = path.join(__dirname, '..', 'node_modules', 'tree-sitter-pascal');
const bindingGyp = path.join(pascalDir, 'binding.gyp');
const bindingNode = path.join(pascalDir, 'build', 'Release', 'tree_sitter_pascal_binding.node');

try {
  if (!fs.existsSync(bindingGyp) || fs.existsSync(bindingNode)) {
    process.exit(0);
  }

  try {
    require.resolve('node-addon-api');
    require.resolve('node-gyp-build');
  } catch (resolveErr) {
    console.warn(
      '[tree-sitter-pascal] Skipping build: hoisted build deps not resolvable (%s).',
      resolveErr.message,
    );
    console.warn(
      '[tree-sitter-pascal] Pascal parsing will be unavailable. Install without --no-optional and with scripts enabled to build.',
    );
    process.exit(0);
  }

  console.log('[tree-sitter-pascal] Building native binding...');
  execSync('npx node-gyp rebuild', {
    cwd: pascalDir,
    stdio: 'pipe',
    timeout: 180000,
  });
  console.log('[tree-sitter-pascal] Native binding built successfully');
} catch (err) {
  console.warn('[tree-sitter-pascal] Could not build native binding:', err.message);
  console.warn(
    '[tree-sitter-pascal] Pascal parsing will be unavailable. Non-Pascal functionality is unaffected.',
  );
  process.exit(0);
}
