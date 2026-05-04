/**
 * Delphi Pascal Language Provider — Step 8 complete.
 *
 * Features wired in this step:
 *   entryPointPatterns, astFrameworkPatterns, heritageExtractor,
 *   heritageDefaultEdge, interfaceNamePattern, mroStrategy,
 *   builtInNames, exportChecker, implicitImportWirer
 */
import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { SupportedLanguages } from 'gitnexus-shared';
import { defineLanguage } from '../language-provider.js';
import type { AstFrameworkPatternConfig } from '../language-provider.js';
import { PASCAL_QUERIES } from '../tree-sitter-queries.js';
import { pascalExportChecker } from '../export-detection.js';
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
import { createHeritageExtractor } from '../heritage-extractors/generic.js';

// ── Built-in names ────────────────────────────────────────────────────────────

const PASCAL_BUILT_INS: ReadonlySet<string> = new Set([
  // I/O
  'Write', 'WriteLn', 'Read', 'ReadLn', 'Assign', 'Reset', 'Rewrite', 'Append', 'Close',
  'Flush', 'Eof', 'EoLn', 'SeekEof', 'SeekEoLn', 'BlockRead', 'BlockWrite',
  // String
  'Length', 'SetLength', 'Copy', 'Delete', 'Insert', 'Pos', 'Concat', 'Str', 'Val',
  'UpperCase', 'LowerCase', 'Trim', 'TrimLeft', 'TrimRight', 'StringReplace', 'Format',
  // Numeric / ordinal
  'Inc', 'Dec', 'Ord', 'Chr', 'Pred', 'Succ', 'High', 'Low', 'Abs', 'Sqr', 'Sqrt',
  'Round', 'Trunc', 'Int', 'Frac', 'Exp', 'Ln', 'Sin', 'Cos', 'ArcTan', 'Pi',
  'SizeOf', 'TypeInfo', 'Odd', 'Random', 'Randomize',
  // Conversion
  'StrToInt', 'StrToIntDef', 'IntToStr', 'FloatToStr', 'StrToFloat', 'StrToFloatDef',
  'IntToHex', 'HexToInt', 'BoolToStr', 'StrToBool',
  // Memory
  'New', 'Dispose', 'GetMem', 'FreeMem', 'ReallocMem', 'FillChar', 'Move', 'ZeroMemory',
  // Object
  'Assigned', 'FreeAndNil',
  // Control flow
  'Assert', 'Halt', 'Exit', 'Break', 'Continue',
  // Array / collection helpers
  'SetLength', 'Copy', 'Insert', 'Delete', 'Concat',
]);

// ── Package wirer (.dpk → unit import edges) ─────────────────────────────────

/** Extract bare unit names listed in a .dpk `contains` clause. */
function parseDpkContains(dpkPath: string): string[] {
  let content: string;
  try {
    content = readFileSync(dpkPath, 'utf8');
  } catch {
    return [];
  }
  // Match the contains block up to the closing semicolon or 'end.'
  const containsMatch = /\bcontains\b([\s\S]*?)(?=\bend\s*\.|;(?:\s*\bend\s*\.)?)/i.exec(content);
  if (!containsMatch) return [];

  const block = containsMatch[1];
  const names: string[] = [];
  // Each entry: "UnitName" or "UnitName in 'relative/path.pas'"
  const entryRe = /\b([A-Za-z_][A-Za-z0-9_.]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(block)) !== null) {
    const name = m[1];
    if (/^(?:requires|contains|uses|in|end|begin)$/i.test(name)) continue;
    names.push(name);
  }
  return names;
}

/**
 * Wire implicit import edges from .dpk package files to their contained units.
 * This marks contained units as package entry points for scoring purposes.
 */
function pascalPackageWirer(
  languageFiles: string[],
  _importMap: ReadonlyMap<string, ReadonlySet<string>>,
  addImportEdge: (src: string, target: string) => void,
): void {
  const dpkFiles = languageFiles.filter(f => f.endsWith('.dpk'));
  if (dpkFiles.length === 0) return;

  // Build a lookup: lowercase basename (no ext) → full path
  const byBasename = new Map<string, string>();
  for (const f of languageFiles) {
    byBasename.set(basename(f, extname(f)).toLowerCase(), f);
  }

  for (const dpk of dpkFiles) {
    const dpkDir = dirname(dpk);
    const unitNames = parseDpkContains(dpk);
    for (const name of unitNames) {
      // Prefer an exact-path match from the contains 'in' clause (if we stored it),
      // otherwise fall back to basename lookup.
      const byName = byBasename.get(name.toLowerCase());
      if (byName) {
        addImportEdge(dpk, byName);
        continue;
      }
      // Last resort: try joining dpk's directory with common Pascal extensions
      for (const ext of ['.pas', '.pp', '.dpr']) {
        const candidate = join(dpkDir, name + ext);
        if (languageFiles.includes(candidate)) {
          addImportEdge(dpk, candidate);
          break;
        }
      }
    }
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export const pascalProvider = defineLanguage({
  id: SupportedLanguages.DelphiPascal,
  extensions: ['.pas', '.dpr', '.dpk', '.pp', '.lpr'],

  entryPointPatterns: [
    /^FormCreate$/,
    /^FormShow$/,
    /^FormActivate$/,
    /^Execute$/,
    /^Initialize$/,
    /^Run$/,
    /^ServiceStart$/,
    /^ServiceExecute$/,
    /^ServiceStop$/,
  ],

  astFrameworkPatterns: [
    {
      framework: 'vcl',
      entryPointMultiplier: 2.5,
      reason: 'vcl-form',
      patterns: ['TForm', 'TFrame', 'TDataModule', 'TApplication', 'TButton', 'TEdit'],
    },
    {
      framework: 'fmx',
      entryPointMultiplier: 2.5,
      reason: 'fmx-form',
      patterns: ['FMX.Forms', 'FMX.Controls', 'FireMonkey', 'TApplication'],
    },
  ] satisfies AstFrameworkPatternConfig[],

  treeSitterQueries: PASCAL_QUERIES,
  typeConfig: pascalTypeConfig,
  exportChecker: pascalExportChecker,
  importResolver: createImportResolver(pascalImportConfig),
  importSemantics: 'wildcard-leaf',
  implicitImportWirer: pascalPackageWirer,

  callExtractor: createCallExtractor(pascalCallConfig),
  fieldExtractor: createFieldExtractor(pascalFieldConfig),
  methodExtractor: createMethodExtractor(pascalMethodConfig),
  variableExtractor: createVariableExtractor(pascalVariableConfig),
  classExtractor: createClassExtractor(pascalClassConfig),

  heritageExtractor: createHeritageExtractor(SupportedLanguages.DelphiPascal),
  heritageDefaultEdge: 'EXTENDS',
  interfaceNamePattern: /^I[A-Z]/,
  mroStrategy: 'first-wins',

  builtInNames: PASCAL_BUILT_INS,
});
