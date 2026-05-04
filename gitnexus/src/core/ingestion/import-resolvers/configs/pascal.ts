/**
 * Pascal/Delphi import resolution config.
 *
 * Pascal `uses` clauses reference units by name rather than by path.
 * The `@import` capture is the text of the `moduleName` tree-sitter node,
 * which may be a simple name (`SysUtils`) or a dotted namespace-qualified
 * name (`System.SysUtils`, `Vcl.Controls`).
 *
 * Strategy chain:
 *   1. pascalSystemUnitStrategy — absorbs RTL/VCL/FMX/Win32 standard units
 *      by returning an empty file list (no import edge created). Stops the
 *      chain for those so the unit-name strategy never wastes time scanning.
 *   2. pascalUnitNameStrategy — case-insensitive scan for `${unitName}.pas`,
 *      `.pp`, `.dpr`, `.dpk` in the repository file list, where `unitName`
 *      is the last identifier in the dotted module name.
 */

import { SupportedLanguages } from 'gitnexus-shared';
import type { ImportResolutionConfig, ImportResolverStrategy } from '../types.js';

// ── System unit skip-list ──────────────────────────────────────────────────

/**
 * Dotted-prefix namespaces whose units are always part of the Delphi RTL/VCL/FMX
 * or the Win32 API. No file in a user project will ever resolve to these.
 */
const SYSTEM_NAMESPACES: ReadonlySet<string> = new Set([
  'System',
  'Vcl',
  'FMX',
  'Winapi',
  'Web',
  'REST',
  'Data',
  'FireDAC',
  'IBX',
  'Xml',
  'Soap',
  'IdHttp',
  'IdGlobal',
]);

/**
 * Simple (un-namespaced) unit names that belong to the Delphi RTL/VCL runtime.
 * This covers `uses SysUtils` (no namespace prefix) in pre-XE Delphi style.
 */
const SYSTEM_UNITS: ReadonlySet<string> = new Set([
  // RTL
  'SysUtils', 'Classes', 'Types', 'Math', 'StrUtils', 'DateUtils',
  'SysConst', 'SysInit', 'System', 'Variants', 'VarUtils',
  'IOUtils', 'RegularExpressions', 'Generics.Collections', 'Generics.Defaults',
  'Character', 'AnsiStrings', 'WideStrings',
  // Win32 / WinAPI (legacy bare names)
  'Windows', 'Messages', 'ShellAPI', 'Registry', 'ComObj', 'ActiveX',
  'ShlObj', 'CommCtrl', 'CommDlg', 'WinInet', 'WinSock',
  // VCL (legacy bare names)
  'Forms', 'Controls', 'StdCtrls', 'ExtCtrls', 'Buttons', 'Menus',
  'Dialogs', 'Graphics', 'ComCtrls', 'Grids', 'DBGrids',
  'Mask', 'CheckLst', 'Spin', 'ClipBrd', 'ImgList',
  'AppEvnts', 'ActnList', 'ActnMan', 'ActnCtrls',
  // DB/ADO (legacy bare names)
  'DB', 'ADODB', 'DBTables', 'BDE', 'IBDatabase', 'IBQuery', 'IBTable',
  // Network/Internet
  'IdHttp', 'IdTCPClient', 'IdTCPServer', 'IdSMTP', 'IdFTP',
  // Misc
  'FileCtrl', 'HelpIntfs', 'Contnrs', 'IniFiles', 'RxRichEd',
]);

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extract the last identifier segment from a possibly-dotted unit name.
 *  "System.SysUtils" → "SysUtils",  "SysUtils" → "SysUtils" */
function unitBaseName(rawName: string): string {
  const dot = rawName.lastIndexOf('.');
  return dot === -1 ? rawName : rawName.slice(dot + 1);
}

/** True if the import should be treated as a standard library unit. */
function isSystemUnit(rawName: string): boolean {
  // Check dotted namespace prefix: "Vcl.Controls" → prefix "Vcl"
  const dot = rawName.indexOf('.');
  if (dot !== -1) {
    const prefix = rawName.slice(0, dot);
    if (SYSTEM_NAMESPACES.has(prefix)) return true;
  }
  // Check bare simple name
  return SYSTEM_UNITS.has(unitBaseName(rawName));
}

// ── Strategies ─────────────────────────────────────────────────────────────

/**
 * Drop standard RTL/VCL/FMX/Win32 units — no import edge created.
 * Returns empty-files result (stops chain) for system units;
 * returns null (continue chain) for unknown units.
 */
export const pascalSystemUnitStrategy: ImportResolverStrategy = (rawImportPath) => {
  if (isSystemUnit(rawImportPath)) return { kind: 'files', files: [] };
  return null;
};

/** Pascal source file extensions to probe during unit-name resolution. */
const PASCAL_EXTENSIONS = ['.pas', '.pp', '.dpr', '.dpk'];

/**
 * Resolve a unit name to a source file by case-insensitive suffix scan.
 * `uses MyUnit` → looks for any `MyUnit.pas`, `MyUnit.pp`, etc. in the repo.
 */
export const pascalUnitNameStrategy: ImportResolverStrategy = (rawImportPath, _filePath, ctx) => {
  const baseName = unitBaseName(rawImportPath).toLowerCase();
  for (const ext of PASCAL_EXTENSIONS) {
    const suffix = baseName + ext; // e.g. "myunit.pas"
    for (const fp of ctx.allFileList) {
      if (fp.toLowerCase().endsWith('/' + suffix) || fp.toLowerCase() === suffix) {
        return { kind: 'files', files: [fp] };
      }
    }
  }
  return null;
};

// ── Config ─────────────────────────────────────────────────────────────────

export const pascalImportConfig: ImportResolutionConfig = {
  language: SupportedLanguages.DelphiPascal,
  strategies: [pascalSystemUnitStrategy, pascalUnitNameStrategy],
};
