// gitnexus/src/core/ingestion/class-extractors/configs/pascal.ts

import { SupportedLanguages } from 'gitnexus-shared';
import type { ClassExtractionConfig, ClassLikeNodeLabel } from '../../class-types.js';
import type { SyntaxNode } from '../../utils/ast-helpers.js';

/**
 * Pascal class extraction config.
 *
 * The @definition.class query captures `declType` nodes (not `declClass` directly).
 * `declType` has `name: identifier` and `type: declClass | declIntf | declHelper`.
 *
 * The factory's default extractTypeNameFromNode uses `childForFieldName('name')`
 * which correctly returns the class name from `declType`.
 *
 * `extractType` inspects the `type` child to distinguish Class from Interface.
 */

const BODY_TYPE_TO_LABEL: Record<string, ClassLikeNodeLabel> = {
  declClass: 'Class',
  declIntf: 'Interface',
  declHelper: 'Class',
};

export const pascalClassConfig: ClassExtractionConfig = {
  language: SupportedLanguages.DelphiPascal,
  typeDeclarationNodes: ['declType'],
  ancestorScopeNodeTypes: ['declType'],

  extractType(node: SyntaxNode): ClassLikeNodeLabel | undefined {
    const typeBody = node.childForFieldName('type');
    if (!typeBody) return undefined;
    return BODY_TYPE_TO_LABEL[typeBody.type];
  },
};
