/**
 * Delphi Pascal Language Provider — stub (Step 1).
 *
 * parseStrategy and full implementation added in Step 2–8.
 */
import { SupportedLanguages } from 'gitnexus-shared';
import { defineLanguage } from '../language-provider.js';

export const pascalProvider = defineLanguage({
  id: SupportedLanguages.DelphiPascal,
  parseStrategy: 'standalone',
  extensions: ['.pas', '.dpr', '.dpk', '.pp', '.lpr'],
  entryPointPatterns: [],
  astFrameworkPatterns: [],
  treeSitterQueries: '',
  typeConfig: {
    declarationNodeTypes: new Set(),
    extractDeclaration: () => null,
    extractParameter: () => null,
  },
  exportChecker: () => false,
  importResolver: () => null,
});
