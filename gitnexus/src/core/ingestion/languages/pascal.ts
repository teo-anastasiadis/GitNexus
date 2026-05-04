/**
 * Delphi Pascal Language Provider — Step 5 (import resolver wired).
 *
 * Remaining stubs (typeConfig, exportChecker, extractors) are wired in Steps 6–8.
 */
import { SupportedLanguages } from 'gitnexus-shared';
import { defineLanguage } from '../language-provider.js';
import { PASCAL_QUERIES } from '../tree-sitter-queries.js';
import { createImportResolver } from '../import-resolvers/resolver-factory.js';
import { pascalImportConfig } from '../import-resolvers/configs/pascal.js';
import { pascalTypeConfig } from '../type-extractors/pascal.js';

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
});
