// gitnexus/src/core/ingestion/field-extractors/configs/pascal.ts

import { SupportedLanguages } from 'gitnexus-shared';
import type { FieldExtractionConfig } from '../generic.js';
import type { FieldVisibility, FieldInfo, FieldExtractorContext } from '../../field-types.js';
import type { SyntaxNode } from '../../utils/ast-helpers.js';

/**
 * Pascal field extraction config.
 *
 * Pascal class bodies use visibility sections:
 *   declType → type: declClass → declSection(kPrivate/kProtected/kPublic/kPublished)
 *                                  → declField | declProp
 *
 * Records use direct child layout:
 *   declType → type: declClass(kRecord) → declField (direct child)
 *
 * The factory's single-level body walk handles records (declField direct in
 * declClass body). `extractPrimaryFields` handles the section-wrapped case.
 * To avoid double-extraction the two paths are kept disjoint:
 *   - factory walk: declField/declProp as DIRECT children of declClass/declIntf
 *   - extractPrimaryFields: declField/declProp inside declSection only
 */

// ── Visibility helper ─────────────────────────────────────────────────────────

const SECTION_VIS: Record<string, FieldVisibility> = {
  kPrivate: 'private',
  kProtected: 'protected',
  kPublic: 'public',
  kPublished: 'public', // published = public + design-time visible
};

function sectionVisibility(section: SyntaxNode): FieldVisibility {
  for (let i = 0; i < section.namedChildCount; i++) {
    const child = section.namedChild(i);
    if (!child) continue;
    const vis = SECTION_VIS[child.type];
    if (vis) return vis;
    if (child.type !== 'kStrict') break;
  }
  return 'public';
}

// ── Type extraction ────────────────────────────────────────────────────────────

function extractFieldType(node: SyntaxNode): string | undefined {
  const typeNode = node.childForFieldName('type');
  if (!typeNode) return undefined;
  // type node wraps typeref or declString
  const child = typeNode.namedChild(0);
  if (!child) return undefined;
  if (child.type === 'declString') return 'string';
  if (child.type === 'typeref') {
    const inner = child.namedChild(0);
    if (!inner) return undefined;
    if (inner.type === 'identifier') return inner.text || undefined;
    // typerefTpl — strip generic parameters to get base class name
    const lt = inner.text.indexOf('<');
    return (lt === -1 ? inner.text : inner.text.slice(0, lt)) || undefined;
  }
  return undefined;
}

// ── Config ────────────────────────────────────────────────────────────────────

export const pascalFieldConfig: FieldExtractionConfig = {
  language: SupportedLanguages.DelphiPascal,
  // declType is the node walked to by seqFindEnclosingOwnerNode (CLASS_CONTAINER_TYPES)
  typeDeclarationNodes: ['declType'],
  // Factory body walk: finds declClass/declIntf as immediate children of declType
  bodyNodeTypes: ['declClass', 'declIntf'],
  // Factory field walk: picks up declField/declProp that are DIRECT children of the body
  // (records and interface bodies); section-wrapped fields are handled by extractPrimaryFields
  fieldNodeTypes: ['declField', 'declProp'],
  defaultVisibility: 'public',

  extractName(node: SyntaxNode): string | undefined {
    return node.childForFieldName('name')?.text || undefined;
  },

  extractType: extractFieldType,

  extractVisibility(node: SyntaxNode): FieldVisibility {
    const parent = node.parent;
    if (parent?.type === 'declSection') return sectionVisibility(parent);
    return 'public';
  },

  isStatic(_node: SyntaxNode): boolean {
    return false;
  },

  isReadonly(_node: SyntaxNode): boolean {
    return false;
  },

  /**
   * Handles fields inside visibility sections (the common class case).
   * Only processes declSection children to avoid duplicating records/interface fields
   * already found by the factory's direct-child walk.
   */
  extractPrimaryFields(ownerNode: SyntaxNode, context: FieldExtractorContext): FieldInfo[] {
    const typeBody = ownerNode.childForFieldName('type');
    if (!typeBody || (typeBody.type !== 'declClass' && typeBody.type !== 'declIntf')) return [];

    const fields: FieldInfo[] = [];

    for (let i = 0; i < typeBody.namedChildCount; i++) {
      const child = typeBody.namedChild(i);
      if (!child || child.type !== 'declSection') continue;

      const vis = sectionVisibility(child);

      for (let j = 0; j < child.namedChildCount; j++) {
        const field = child.namedChild(j);
        if (!field) continue;
        if (field.type !== 'declField' && field.type !== 'declProp') continue;

        const name = field.childForFieldName('name')?.text;
        if (!name) continue;

        fields.push({
          name,
          type: extractFieldType(field) ?? null,
          visibility: vis,
          isStatic: false,
          isReadonly: false,
          sourceFile: context.filePath,
          line: field.startPosition.row + 1,
        });
      }
    }

    return fields;
  },
};
