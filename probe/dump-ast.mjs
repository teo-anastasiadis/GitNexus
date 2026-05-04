/**
 * AST dump script for Step 0 grammar probe.
 * Usage:
 *   cd gitnexus
 *   npm install tree-sitter-pascal --no-save
 *   node ../probe/dump-ast.mjs ../probe/TCustomerForm.pas > ../probe/ast-customer-form.txt
 *   node ../probe/dump-ast.mjs ../probe/TBaseService.pas  > ../probe/ast-base-service.txt
 *   node ../probe/dump-ast.mjs ../probe/StringUtils.pas   > ../probe/ast-string-utils.txt
 *
 * Then grep for patterns we care about:
 *   grep -E '^\s+\[(decl|def|expr)' ../probe/ast-customer-form.txt | sort -u
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);

const [, , file] = process.argv;
if (!file) {
  console.error('Usage: node dump-ast.mjs <file.pas>');
  process.exit(1);
}

let Parser, Pascal;
try {
  Parser = require('tree-sitter');
  Pascal = require('tree-sitter-pascal');
} catch (e) {
  console.error(
    'tree-sitter-pascal not installed.\n' +
    'Run inside gitnexus/: npm install tree-sitter-pascal --no-save\n' +
    `Error: ${e.message}`,
  );
  process.exit(1);
}

const src = readFileSync(file, 'utf8');
const parser = new Parser();
parser.setLanguage(Pascal);
const tree = parser.parse(src);

// ── Walk helpers ──────────────────────────────────────────────────────────────

/** Trim and collapse whitespace for inline preview */
function preview(text, max = 70) {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Return the field name that parent uses to reference this child, or null */
function fieldNameOf(node) {
  const parent = node.parent;
  if (!parent) return null;
  for (const [fname, fnode] of Object.entries(parent.fields ?? {})) {
    if (Array.isArray(fnode) ? fnode.includes(node) : fnode === node) return fname;
  }
  return null;
}

function walk(node, depth = 0) {
  const indent = '  '.repeat(depth);
  const field = fieldNameOf(node);
  const fieldTag = field ? ` .${field}=` : '';
  const named = node.isNamed ? '' : ' (anon)';
  const text = preview(node.text);
  console.log(`${indent}[${node.type}]${named}${fieldTag} "${text}"`);
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) walk(child, depth + 1);
  }
}

// ── Targeted summary of key patterns ─────────────────────────────────────────

function printSection(title) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`=== ${title}`);
  console.log('='.repeat(72) + '\n');
}

function findAll(node, type, results = []) {
  if (node.type === type) results.push(node);
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) findAll(child, type, results);
  }
  return results;
}

// Print the full AST
printSection(`Full AST for ${path.basename(file)}`);
walk(tree.rootNode);

// Print targeted subtrees for patterns we need to verify
const PROBE_TYPES = [
  'defProc',     // method implementation — especially qualified names
  'declClass',   // class definition — heritage, sections
  'declUses',    // imports
  'exprCall',    // call expressions
  'declField',   // field declarations
];

for (const nodeType of PROBE_TYPES) {
  const nodes = findAll(tree.rootNode, nodeType);
  if (nodes.length === 0) continue;
  printSection(`First ${Math.min(nodes.length, 3)} "${nodeType}" node(s)`);
  for (const n of nodes.slice(0, 3)) {
    walk(n);
    console.log();
  }
}

// Parse errors — surface these immediately
const errors = findAll(tree.rootNode, 'ERROR');
if (errors.length > 0) {
  printSection(`PARSE ERRORS (${errors.length})`);
  for (const e of errors) {
    console.log(`  line ${e.startPosition.row + 1}: "${preview(e.text)}"`);
  }
} else {
  console.log('\n[OK] No parse errors.');
}
