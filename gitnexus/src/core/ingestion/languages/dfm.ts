/**
 * DFM Language Provider — stub (Step 1).
 *
 * Standalone regex processor for Delphi Form files (.dfm, .lfm, .xfm).
 * Full implementation added in Step 4.
 */
import { SupportedLanguages } from 'gitnexus-shared';
import { defineLanguage } from '../language-provider.js';

export const dfmProvider = defineLanguage({
  id: SupportedLanguages.DFM,
  parseStrategy: 'standalone',
  extensions: ['.dfm', '.lfm', '.xfm'],
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
