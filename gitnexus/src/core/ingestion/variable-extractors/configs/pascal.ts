// gitnexus/src/core/ingestion/variable-extractors/configs/pascal.ts

import { SupportedLanguages } from 'gitnexus-shared';
import type { VariableExtractionConfig, VariableVisibility } from '../../variable-types.js';
import type { SyntaxNode } from '../../utils/ast-helpers.js';

/**
 * Pascal variable/constant extraction config.
 *
 * Module-level declarations:
 *   interface section  → public (visible across units)
 *   implementation section → private (unit-internal)
 *
 * Both declVar (mutable) and declConst (constant) nodes are captured.
 * Variables inside class bodies (declSection > declVars > declVar) are also
 * captured by the query; visibility is derived from the enclosing section.
 *
 * AST shapes:
 *   declVar:   name: identifier, [type: type]
 *   declConst: name: identifier, [type: type], [defaultValue: defaultValue]
 */

function extractPascalVarType(node: SyntaxNode): string | undefined {
  const typeNode = node.childForFieldName('type');
  if (!typeNode) return undefined;
  const child = typeNode.namedChild(0);
  if (!child) return undefined;
  if (child.type === 'declString') return 'string';
  if (child.type === 'typeref') {
    const inner = child.namedChild(0);
    if (!inner) return undefined;
    if (inner.type === 'identifier') return inner.text || undefined;
    const lt = inner.text.indexOf('<');
    return (lt === -1 ? inner.text : inner.text.slice(0, lt)) || undefined;
  }
  return undefined;
}

const SECTION_VIS: Record<string, VariableVisibility> = {
  kPrivate: 'private',
  kProtected: 'protected',
  kPublic: 'public',
  kPublished: 'public',
};

function extractPascalVarVisibility(node: SyntaxNode): VariableVisibility {
  let current = node.parent;
  while (current) {
    // Inside a class visibility section
    if (current.type === 'declSection') {
      for (let i = 0; i < current.namedChildCount; i++) {
        const child = current.namedChild(i);
        if (!child) continue;
        const vis = SECTION_VIS[child.type];
        if (vis) return vis;
        if (child.type !== 'kStrict') break;
      }
      return 'public';
    }
    if (current.type === 'interface') return 'public';
    if (current.type === 'implementation') return 'private';
    current = current.parent;
  }
  return 'public';
}

export const pascalVariableConfig: VariableExtractionConfig = {
  language: SupportedLanguages.DelphiPascal,
  constNodeTypes: [],
  staticNodeTypes: [],
  variableNodeTypes: ['declVar', 'declConst'],

  extractName(node: SyntaxNode): string | undefined {
    return node.childForFieldName('name')?.text || undefined;
  },

  extractType: extractPascalVarType,

  extractVisibility: extractPascalVarVisibility,

  isConst(node: SyntaxNode): boolean {
    return node.type === 'declConst';
  },

  isStatic(_node: SyntaxNode): boolean {
    return false;
  },

  isMutable(node: SyntaxNode): boolean {
    return node.type === 'declVar';
  },
};
