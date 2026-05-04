// gitnexus/src/core/ingestion/method-extractors/configs/pascal.ts
// Verified against tree-sitter-pascal probe/ast-base-service.txt

import { SupportedLanguages } from 'gitnexus-shared';
import type { MethodExtractionConfig, ParameterInfo, MethodVisibility } from '../../method-types.js';
import type { SyntaxNode } from '../../utils/ast-helpers.js';

/**
 * Pascal method extraction config.
 *
 * Method nodes come in two varieties:
 *   declProc — forward declaration in a class/interface body
 *   defProc  — implementation in the `implementation` section
 *
 * Class-based path (extract(declType)):
 *   - bodyNodeTypes: ['declClass', 'declIntf']
 *   - extractMethodsFromBody finds declProc as DIRECT children (records, interfaces)
 *   - For visibility-sectioned classes the walk returns nothing; the processor
 *     falls through to extractFromNode (below)
 *
 * extractFromNode handles both declProc and defProc directly and is the primary
 * extraction path for class methods inside declSection wrappers.
 *
 * AST shapes (confirmed from probe/ast-base-service.txt):
 *   declProc:
 *     [kClass] kFunction|kProcedure|kConstructor|kDestructor
 *     name: identifier | genericDot
 *     [args: declArgs > declArg(name:id, type:type)]
 *     [type: typeref]              ← return type (function only)
 *     [attribute: procAttribute > kVirtual|kOverride|kAbstract|kStatic|kFinal]
 *
 *   defProc:
 *     header: declProc
 *     [local: declVars]
 *     body: block
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return the declProc node — either the node itself or defProc.header. */
function getProcHeader(node: SyntaxNode): SyntaxNode | null {
  if (node.type === 'declProc') return node;
  if (node.type === 'defProc') return node.childForFieldName('header') ?? null;
  return null;
}

/** Check whether any procAttribute child of `node` contains `keyword`. */
function hasProcAttribute(node: SyntaxNode, keyword: string): boolean {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child || child.type !== 'procAttribute') continue;
    for (let j = 0; j < child.namedChildCount; j++) {
      if (child.namedChild(j)?.type === keyword) return true;
    }
  }
  return false;
}

const SECTION_VIS: Record<string, MethodVisibility> = {
  kPrivate: 'private',
  kProtected: 'protected',
  kPublic: 'public',
  kPublished: 'public',
};

function sectionVisibility(section: SyntaxNode): MethodVisibility {
  for (let i = 0; i < section.namedChildCount; i++) {
    const child = section.namedChild(i);
    if (!child) continue;
    const vis = SECTION_VIS[child.type];
    if (vis) return vis;
    if (child.type !== 'kStrict') break;
  }
  return 'public';
}

// ── Extractors ────────────────────────────────────────────────────────────────

function extractPascalName(node: SyntaxNode): string | undefined {
  const header = getProcHeader(node);
  if (!header) return undefined;
  const nameNode = header.childForFieldName('name');
  if (!nameNode) return undefined;
  if (nameNode.type === 'identifier') return nameNode.text || undefined;
  // genericDot: TFoo.MethodName — return bare method name (rhs)
  if (nameNode.type === 'genericDot') {
    return nameNode.childForFieldName('rhs')?.text || undefined;
  }
  return undefined;
}

function extractPascalReturnType(node: SyntaxNode): string | undefined {
  const header = getProcHeader(node);
  if (!header) return undefined;
  // Return type is on `type: typeref` (directly typeref, not wrapped in 'type' node)
  const typeRef = header.childForFieldName('type');
  if (!typeRef) return undefined;
  // typeRef is a typeref node; its first named child is either identifier or typerefTpl
  const inner = typeRef.namedChild(0);
  if (!inner) return typeRef.text?.trim() || undefined;
  if (inner.type === 'identifier') return inner.text || undefined;
  const lt = inner.text.indexOf('<');
  return (lt === -1 ? inner.text : inner.text.slice(0, lt)) || undefined;
}

function extractPascalParameters(node: SyntaxNode): ParameterInfo[] {
  const header = getProcHeader(node);
  if (!header) return [];
  const declArgs = header.childForFieldName('args');
  if (!declArgs) return [];

  const params: ParameterInfo[] = [];
  for (let i = 0; i < declArgs.namedChildCount; i++) {
    const arg = declArgs.namedChild(i);
    if (!arg || arg.type !== 'declArg') continue;
    const nameNode = arg.childForFieldName('name');
    if (!nameNode) continue;

    // Pascal params: type is wrapped in `type > typeref` (unlike return type)
    let typeName: string | null = null;
    const typeWrapper = arg.childForFieldName('type');
    if (typeWrapper) {
      const child = typeWrapper.namedChild(0);
      if (child?.type === 'declString') {
        typeName = 'string';
      } else if (child?.type === 'typeref') {
        const inner = child.namedChild(0);
        if (inner?.type === 'identifier') {
          typeName = inner.text || null;
        } else if (inner) {
          const lt = inner.text.indexOf('<');
          typeName = (lt === -1 ? inner.text : inner.text.slice(0, lt)) || null;
        }
      }
    }

    params.push({
      name: nameNode.text,
      type: typeName,
      rawType: typeName,
      isOptional: false,
      isVariadic: false,
    });
  }
  return params;
}

function extractPascalVisibility(node: SyntaxNode): MethodVisibility {
  // For forward declarations inside a visibility section
  const header = getProcHeader(node) ?? node;
  const parent = header.parent;
  if (parent?.type === 'declSection') return sectionVisibility(parent);
  return 'public';
}

function isPascalStatic(node: SyntaxNode): boolean {
  const header = getProcHeader(node);
  if (!header) return false;
  // class function/procedure: has kClass named child before kFunction/kProcedure
  for (let i = 0; i < header.namedChildCount; i++) {
    const child = header.namedChild(i);
    if (!child) continue;
    if (child.type === 'kClass') return true;
    if (
      child.type === 'kFunction' ||
      child.type === 'kProcedure' ||
      child.type === 'kConstructor' ||
      child.type === 'kDestructor'
    )
      break;
  }
  return false;
}

function isPascalAbstract(node: SyntaxNode, _ownerNode: SyntaxNode): boolean {
  const header = getProcHeader(node);
  return header ? hasProcAttribute(header, 'kAbstract') : false;
}

function isPascalFinal(node: SyntaxNode): boolean {
  const header = getProcHeader(node);
  return header ? hasProcAttribute(header, 'kFinal') : false;
}

function isPascalVirtual(node: SyntaxNode): boolean {
  const header = getProcHeader(node);
  return header ? hasProcAttribute(header, 'kVirtual') : false;
}

function isPascalOverride(node: SyntaxNode): boolean {
  const header = getProcHeader(node);
  return header ? hasProcAttribute(header, 'kOverride') : false;
}

// ── Config ────────────────────────────────────────────────────────────────────

export const pascalMethodConfig: MethodExtractionConfig = {
  language: SupportedLanguages.DelphiPascal,

  // declType is the class-container node (CLASS_CONTAINER_TYPES in ast-helpers.ts)
  typeDeclarationNodes: ['declType'],

  // Both forward declarations and implementations are method nodes
  methodNodeTypes: ['declProc', 'defProc'],

  // Class body containers — extract() finds direct declProc children (records, interfaces)
  // Section-wrapped methods fall back to extractFromNode
  bodyNodeTypes: ['declClass', 'declIntf'],

  // Explicitly opt out of static-owner detection (handled via isPascalStatic)
  staticOwnerTypes: new Set(),

  extractName: extractPascalName,
  extractReturnType: extractPascalReturnType,
  extractParameters: extractPascalParameters,
  extractVisibility: extractPascalVisibility,

  isStatic: isPascalStatic,
  isAbstract: isPascalAbstract,
  isFinal: isPascalFinal,
  isVirtual: isPascalVirtual,
  isOverride: isPascalOverride,
};
