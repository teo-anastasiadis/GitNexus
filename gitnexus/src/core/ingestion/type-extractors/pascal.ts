/**
 * Pascal/Delphi type extractor — Tiers 0 and 1.
 *
 * Tier 0: Explicit type annotations
 *   var LFoo: TFoo;         (declVar  — name: identifier, type: type)
 *   FName: string;          (declField — same structure)
 *   procedure P(A: TFoo);   (declArg  — same structure, handled via extractParameter)
 *
 * Tier 1: Constructor inference
 *   LFoo := TFoo.Create;         (assignment, rhs=exprDot, method=Create)
 *   LFoo := TFoo.Create('hello'); (assignment, rhs=exprCall, entity=exprDot)
 *
 * Tier 2 propagation and for-loop extraction are not implemented yet.
 * The `foreach` loop variable's type is already captured via its `declVar`
 * declaration in the preceding `var` block (Pascal requires pre-declaration).
 */

import type { SyntaxNode } from '../utils/ast-helpers.js';
import type {
  LanguageTypeConfig,
  TypeBindingExtractor,
  ParameterExtractor,
  ConstructorBindingScanner,
} from './types.js';

// ── Node-type sets ─────────────────────────────────────────────────────────

const PASCAL_DECLARATION_NODE_TYPES: ReadonlySet<string> = new Set(['declVar', 'declField']);

/** Constructor method names that signal `LHS := ClassName.Create(...)`. */
const PASCAL_CONSTRUCTOR_NAMES: ReadonlySet<string> = new Set([
  'Create',
  'CreateWith',
  'CreateFrom',
  'New',
]);

// ── Type-name extraction ───────────────────────────────────────────────────

/**
 * Extract the simple class/type name from a Pascal `type` AST node.
 *
 * The `type` node (lowercase) produced by tree-sitter-pascal wraps one of:
 *   - `typeref` → `identifier`           — e.g. `TFoo`, `Integer`
 *   - `typeref` → `typerefTpl`           — e.g. `TList<TObject>` (return base: `TList`)
 *   - `declString`                        — the built-in `string` type
 */
function extractPascalTypeName(typeNode: SyntaxNode): string | undefined {
  const child = typeNode.namedChild(0);
  if (!child) return undefined;

  if (child.type === 'declString') return 'string';

  if (child.type === 'typeref') {
    const inner = child.namedChild(0);
    if (!inner) return undefined;
    if (inner.type === 'identifier') return inner.text || undefined;
    // typerefTpl — strip generic type parameters to get the base class name
    const lt = inner.text.indexOf('<');
    const base = lt === -1 ? inner.text : inner.text.slice(0, lt);
    return base || undefined;
  }

  return undefined;
}

// ── Tier 0: Explicit type annotations ────────────────────────────────────

const extractPascalDeclaration: TypeBindingExtractor = (node, env) => {
  const nameNode = node.childForFieldName('name');
  const typeNode = node.childForFieldName('type');
  if (!nameNode || !typeNode) return;
  const varName = nameNode.text;
  const typeName = extractPascalTypeName(typeNode);
  if (varName && typeName) env.set(varName, typeName);
};

const extractPascalParameter: ParameterExtractor = (node, env) => {
  // Parameter node type is `declArg` — same field layout as declVar
  const nameNode = node.childForFieldName('name');
  const typeNode = node.childForFieldName('type');
  if (!nameNode || !typeNode) return;
  const varName = nameNode.text;
  const typeName = extractPascalTypeName(typeNode);
  if (varName && typeName) env.set(varName, typeName);
};

// ── Tier 1: Constructor inference ─────────────────────────────────────────

const scanPascalConstructorBinding: ConstructorBindingScanner = (node) => {
  if (node.type !== 'assignment') return undefined;

  const lhs = node.childForFieldName('lhs');
  if (!lhs || lhs.type !== 'identifier') return undefined;
  const varName = lhs.text;
  if (!varName) return undefined;

  const rhs = node.childForFieldName('rhs');
  if (!rhs) return undefined;

  // x := TFoo.Create  (no arguments — rhs is exprDot)
  if (rhs.type === 'exprDot') {
    const methodIdent = rhs.childForFieldName('rhs');
    if (methodIdent && PASCAL_CONSTRUCTOR_NAMES.has(methodIdent.text)) {
      const classIdent = rhs.childForFieldName('lhs');
      if (classIdent?.text) return { varName, calleeName: classIdent.text };
    }
    return undefined;
  }

  // x := TFoo.Create(...)  (with arguments — rhs is exprCall wrapping exprDot)
  if (rhs.type === 'exprCall') {
    const entity = rhs.childForFieldName('entity');
    if (entity?.type === 'exprDot') {
      const methodIdent = entity.childForFieldName('rhs');
      if (methodIdent && PASCAL_CONSTRUCTOR_NAMES.has(methodIdent.text)) {
        const classIdent = entity.childForFieldName('lhs');
        if (classIdent?.text) return { varName, calleeName: classIdent.text };
      }
    }
    return undefined;
  }

  return undefined;
};

// ── Export ────────────────────────────────────────────────────────────────

export const pascalTypeConfig: LanguageTypeConfig = {
  declarationNodeTypes: PASCAL_DECLARATION_NODE_TYPES,
  extractDeclaration: extractPascalDeclaration,
  extractParameter: extractPascalParameter,
  scanConstructorBinding: scanPascalConstructorBinding,
};
