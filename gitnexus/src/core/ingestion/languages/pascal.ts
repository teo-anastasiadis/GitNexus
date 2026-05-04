/**
 * Delphi Pascal Language Provider — Step 7 complete (all extractor configs wired).
 *
 * Step 8 (entryPointPatterns, astFrameworkPatterns, heritageExtractor,
 * implicitImportWirer, exportChecker, builtInNames) are added next.
 */
import { SupportedLanguages } from 'gitnexus-shared';
import { defineLanguage } from '../language-provider.js';
import { PASCAL_QUERIES } from '../tree-sitter-queries.js';
import { createImportResolver } from '../import-resolvers/resolver-factory.js';
import { pascalImportConfig } from '../import-resolvers/configs/pascal.js';
import { pascalTypeConfig } from '../type-extractors/pascal.js';
import { createCallExtractor } from '../call-extractors/generic.js';
import { pascalCallConfig } from '../call-extractors/configs/pascal.js';
import { createFieldExtractor } from '../field-extractors/generic.js';
import { pascalFieldConfig } from '../field-extractors/configs/pascal.js';
import { createMethodExtractor } from '../method-extractors/generic.js';
import { pascalMethodConfig } from '../method-extractors/configs/pascal.js';
import { createVariableExtractor } from '../variable-extractors/generic.js';
import { pascalVariableConfig } from '../variable-extractors/configs/pascal.js';
import { createClassExtractor } from '../class-extractors/generic.js';
import { pascalClassConfig } from '../class-extractors/configs/pascal.js';

export const pascalProvider = defineLanguage({
  id: SupportedLanguages.DelphiPascal,
  extensions: ['.pas', '.dpr', '.dpk', '.pp', '.lpr'],
  entryPointPatterns: [],
  astFrameworkPatterns: [],
  treeSitterQueries: PASCAL_QUERIES,
  typeConfig: pascalTypeConfig,
  exportChecker: () => false,
  importResolver: createImportResolver(pascalImportConfig),
  importSemantics: 'wildcard-leaf',
  callExtractor: createCallExtractor(pascalCallConfig),
  fieldExtractor: createFieldExtractor(pascalFieldConfig),
  methodExtractor: createMethodExtractor(pascalMethodConfig),
  variableExtractor: createVariableExtractor(pascalVariableConfig),
  classExtractor: createClassExtractor(pascalClassConfig),
});
