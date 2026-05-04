# Adding Delphi Pascal Support to GitNexus

**Status:** Step 5 complete — ready for Step 6  
**Scope:** Full language support at parity with existing tree-sitter languages (Dart, Swift)

---

## Architecture Primer

Every language plugs into a fixed `LanguageProvider` interface via the Strategy pattern.
The `providers` table in `languages/index.ts` uses `satisfies Record<SupportedLanguages, LanguageProvider>`,
so adding an enum member without a provider is a **compiler error** — run `tsc --noEmit` after each step
to get an exhaustive list of remaining dispatch tables.

The tree-sitter grammar is `tree-sitter-pascal@0.0.1` (xuanhoa88/Isopod).
Its node names use a `decl*`/`def*`/`expr*` prefix convention:

| Concept | Node type |
|---|---|
| Class definition | `declClass` |
| Interface definition | `declIntf` |
| Class helper | `declHelper` |
| Procedure/function declaration (in type body) | `declProc` |
| Procedure/function implementation (with body) | `defProc` |
| Field inside class/record | `declField` |
| Variable declaration | `declVar` / `declVars` |
| Constant declaration | `declConst` / `declConsts` |
| Type alias | `declType` / `declTypes` |
| Uses clause | `declUses` |
| Call expression | `exprCall` |
| Member access | `exprDot` |

---

## Special Topics

### DFM Files

Delphi form modules (`.dfm`) are **text resource files** that describe the visual layout of forms.
There is no `tree-sitter-dfm` grammar. However, the DFM text format is regular enough for a
standalone regex processor (the same approach used for COBOL).

**Why it matters:** DFM files contain event-handler bindings like `OnClick = ButtonClickHandler`.
These are implicit call edges from form components to Pascal methods — edges that the tree-sitter
call extractor cannot see. Without them, every VCL/FMX form's event-driven logic is invisible to
the call graph.

**Approach:** Treat DFM as a separate `standalone` language (`parseStrategy: 'standalone'`),
similar to `SupportedLanguages.Cobol`. A lightweight regex processor extracts:

1. **Object hierarchy** — `object Name: TClass ... end` → class-like symbols
2. **Event-handler bindings** — `OnXxx = HandlerName` → call edges from the component
   to the Pascal method `HandlerName` in the companion `.pas` file
3. **The top-level form object** — treated as an entry point (it is the root of a UI flow)

The DFM processor does *not* need tree-sitter. It walks the text with a simple state machine
(track `object`/`end` nesting depth, emit captures for each property line).

**File extensions:** `.dfm` (Delphi), `.lfm` (Lazarus), `.xfm` (cross-platform FMX).

**Companion linking:** The DFM processor knows its companion `.pas` file by the naming convention
(`Unit1.dfm` ↔ `Unit1.pas`). When emitting event-handler call edges, the target is resolved as
`ClassName.HandlerName` in the companion file.

**Enum member to add:** `DFM = 'dfm'` in `SupportedLanguages` (marked standalone, no tree-sitter).

---

### Package Files (`.dpk`) as Entry Points

Delphi package files define the unit boundary of a component package:

```pascal
package MyPackage;

requires
  rtl,
  vcl;

contains
  MyUnit in 'MyUnit.pas',
  AnotherUnit in 'AnotherUnit.pas';

end.
```

The `contains` clause is a **root unit list** — analogous to `package.json`'s `main` field or a
`.csproj`'s `<Compile Include=...>` list. Units listed here are the public entry points of the
package, so procedures/functions in those files should receive a boosted entry-point score when
the analyzer builds execution flows (processes).

**Approach:** Use the `implicitImportWirer` hook on the Pascal provider. This hook is called with
all Pascal-language files and a callback to add implicit import edges. During that call:

1. Scan for sibling `.dpk` files in the project.
2. Parse the `contains` clause (simple regex — the format is regular).
3. For each unit listed in `contains`, add an implicit import edge *from the package file to the unit*.
4. Separately, flag those unit files in a package-root set.

Entry-point scoring picks up the package-root flag via a small extension to
`entry-point-scoring.ts`: a multiplier (e.g. `1.5×`) for any function/procedure whose file is
a package-root unit. This makes flow detection produce one process per package-exported entry
rather than one per deeply-nested internal helper.

**`.dpr` project files** (the application entry point, analogous to `main.go`) get the same
treatment: the `program` block's initialization `begin...end` is an unconditional entry point.

**VCL/FMX framework detection** (`astFrameworkPatterns`):
- Presence of `TApplication.Initialize` / `TApplication.Run` → VCL application
- Presence of `TForm`, `TFrame`, `TDataModule` → form-based entry points
- Presence of `TRESTClient`, `TFDConnection` → data/service layer

---

## Step-by-Step Implementation Plan

### Step 0 — Probe the grammar ✅ COMPLETE

Probe files in `probe/` (`.pas`, `.dfm`, `.dpk`, `.dpr`). AST dumps in `probe/ast-*.txt`.

**`nan@2.14.0` verdict — must vendor.**
`tree-sitter-pascal@0.0.1` uses `nan@2.14.0` which calls the removed `v8::ArrayBuffer::GetContents()`
API. Fails to compile on any Node ≥ 13 (including Node 18 and 22). Resolution: vendor under
`gitnexus/vendor/tree-sitter-pascal/` with a fresh N-API binding (like Dart/Swift). For the probe,
the grammar was compiled via `tree-sitter build` (CLI WASM path); the `*.so` is in
`gitnexus/node_modules/tree-sitter-pascal/pascal.so` (not committed).

**Actual node shapes — differences from initial assumptions:**

| Question | Assumed | Actual |
|---|---|---|
| `defProc` qualified name | `(procName (ident))` | `header: (declProc name: (genericDot lhs: (identifier) rhs: (identifier)))` |
| Top-level function | `(defProc (procName . (ident)))` | `header: (declProc name: (identifier))` (no `genericDot`) |
| `declClass` heritage | separate `typeref` / `interfaces` nodes | repeated `parent:` field — first = base class, rest = interfaces |
| `declUses` child | bare `(ident)` | `(moduleName (identifier)(kDot)(identifier))` for dotted names |
| Import query | `(declUses (ident) @import.source)` | `(declUses (moduleName) @import)` — grab last `identifier` child for unit name |
| No-paren proc call | only `exprCall` | ALSO `(statement (exprDot ...))` and `(statement (identifier))` — Delphi allows `Foo.Free` without `()` |
| `{$IFDEF}` in AST | unknown | `(pp ...)` nodes — present as siblings, no children, can't distinguish directive type from node alone |
| Visibility section | `kPrivate` etc. directly on fields | `(declSection (kStrict?)(kPrivate/kPublic/...) children...)` wrapper node |

**New call-extraction insight:**
Delphi allows procedure calls without parentheses. Three call patterns to capture:
1. `(exprCall entity: (identifier) @name)` — `ShowMessage('x')`
2. `(exprCall entity: (exprDot rhs: (identifier) @name))` — `FList.Add(x)`
3. `(statement (exprDot rhs: (identifier) @name))` — `FList.Free` (no parens)
4. `(statement (identifier) @name)` — `VerifyInvariant` (standalone bare call)

**`pp` nodes:** Always opaque — no children in named tree. Cannot distinguish `{$IFDEF X}` from
`{$ENDIF}` by type alone. Code inside a conditional block appears as normal siblings, so the call
extractor sees those calls unconditionally. Acceptable for a first implementation.

Also probe a simple `.dfm` file to confirm the regex state-machine approach is sufficient.

---

### Step 1 — Enum registration (10 min)

**`gitnexus-shared/src/languages.ts`**

```typescript
DelphiPascal = 'delphi',
DFM = 'dfm',           // standalone, no tree-sitter
```

Run `tsc --noEmit` — compiler errors list every dispatch table to update.

---

### Step 2 — Tree-sitter grammar loader (30 min)

**`gitnexus/src/core/tree-sitter/parser-loader.ts`**

```typescript
[SupportedLanguages.DelphiPascal]: {
  load: () => _require('tree-sitter-pascal'),
  optional: true,
  severity: 'error',
  unavailableNote:
    'Delphi Pascal parsing disabled: `tree-sitter-pascal` could not be loaded. ' +
    'Run `npm install tree-sitter-pascal` or check the native binding.',
},
```

`DFM` needs no entry here (standalone processor, no tree-sitter).

**`gitnexus/package.json`** — add `"tree-sitter-pascal": "0.0.1"` under `optionalDependencies`
(or `"file:./vendor/tree-sitter-pascal"` if vendored).

---

### Step 3 — Tree-sitter queries (2–4 hours)

**`gitnexus/src/core/ingestion/tree-sitter-queries.ts`**

Add `PASCAL_QUERIES` constant. Node names confirmed by `probe/ast-*.txt` dumps.

```
; ── Classes (declType wraps name + declClass body) ────────────────────────────
(declType
  name: (identifier) @name
  type: (declClass)) @definition.class

; ── Interfaces ────────────────────────────────────────────────────────────────
(declType
  name: (identifier) @name
  type: (declIntf)) @definition.class

; ── Class method implementations (TFoo.Bar) ───────────────────────────────────
; name field is a genericDot; capture only the rhs (method name)
(defProc
  header: (declProc
    name: (genericDot
      rhs: (identifier) @name))) @definition.method

; ── Top-level function/procedure implementations ──────────────────────────────
; name field is a plain identifier (no dot)
(defProc
  header: (declProc
    name: (identifier) @name)) @definition.function

; ── Forward declarations inside class bodies ──────────────────────────────────
(declProc
  name: (identifier) @name) @definition.method

; ── Field declarations ────────────────────────────────────────────────────────
(declField
  name: (identifier) @name) @definition.property

; ── Property declarations ─────────────────────────────────────────────────────
(declProp
  name: (identifier) @name) @definition.property

; ── Type aliases ──────────────────────────────────────────────────────────────
(declType
  name: (identifier) @name) @definition.type

; ── Constants ─────────────────────────────────────────────────────────────────
(declConst
  name: (identifier) @name) @definition.variable

; ── Variables ─────────────────────────────────────────────────────────────────
(declVar
  name: (identifier) @name) @definition.variable

; ── Imports — capture the whole moduleName node ───────────────────────────────
; Unit name is the last identifier child of moduleName (e.g. "SysUtils" from "System.SysUtils")
(declUses
  (moduleName) @import) @import

; ── Calls: direct with args — ShowMessage('x') ───────────────────────────────
(exprCall
  entity: (identifier) @call.name) @call

; ── Calls: method with args — FList.Add(x) ───────────────────────────────────
(exprCall
  entity: (exprDot
    rhs: (identifier) @call.name)) @call

; ── Calls: no-paren method — FList.Free ──────────────────────────────────────
; Delphi allows procedure calls without (); appears as statement → exprDot
(statement
  (exprDot
    rhs: (identifier) @call.name)) @call

; ── Calls: no-paren bare procedure — VerifyInvariant ─────────────────────────
(statement
  (identifier) @call.name) @call

; ── Heritage: all parents (first = base class, rest = interfaces) ─────────────
; Both "extends" and "implements" use the same parent: field in declClass.
; Capture the enclosing declType name and each parent typeref.
(declType
  name: (identifier) @heritage.class
  type: (declClass
    parent: (typeref
      (identifier) @heritage.parent))) @heritage
```

Add to `LANGUAGE_QUERIES` record:
```typescript
[SupportedLanguages.DelphiPascal]: PASCAL_QUERIES,
[SupportedLanguages.DFM]: '',   // standalone processor
```

---

### Step 4 — DFM standalone processor (2–3 hours)

**`gitnexus/src/core/ingestion/dfm-processor.ts`** *(new)*

Modelled after `cobol-processor.ts`. Key extractions:

```
object TForm1: TMainForm       → @definition.class  (name=TForm1, type=TMainForm)
  object Button1: TButton      → @definition.property  (nested component)
    OnClick = Button1Click     → @call  (calledName=Button1Click, receiver=TForm1)
    Caption = 'OK'             → (ignored — pure data)
  end
end
```

State machine: track `object`/`end` nesting. At each `OnXxx = HandlerName` line inside a
component, emit a call record with `calledName=HandlerName`. The companion `.pas` is identified
by replacing the `.dfm` extension.

**`gitnexus/src/core/ingestion/languages/dfm.ts`** *(new)*

```typescript
export const dfmProvider = defineLanguage({
  id: SupportedLanguages.DFM,
  extensions: ['.dfm', '.lfm', '.xfm'],
  parseStrategy: 'standalone',
  treeSitterQueries: '',
  typeConfig: emptyTypeConfig,
  exportChecker: () => true,
  importResolver: createImportResolver(dfmImportConfig),
  importSemantics: 'wildcard-leaf',
});
```

**`gitnexus/src/core/ingestion/pipeline-phases/dfm.ts`** *(new)*

Pipeline phase that runs the DFM processor on all `.dfm`/`.lfm`/`.xfm` files,
similar to `pipeline-phases/cobol.ts`.

---

### Step 5 — Import resolver (30 min)

**`gitnexus/src/core/ingestion/import-resolvers/configs/pascal.ts`** *(new)*

Pascal `uses` clauses reference units by name, not path. Strategy chain:

1. `pascalSystemUnitStrategy` — drops known RTL/VCL/FMX units (`SysUtils`, `Classes`,
   `Forms`, `Controls`, `StdCtrls`, `Dialogs`, `Windows`, `Messages`, etc.) by returning
   `{ kind: 'files', files: [] }`.
2. `pascalUnitNameStrategy` — case-insensitive scan of `ctx.allFileList` for
   `${unitName}.pas`, `${unitName}.pp`, `${unitName}.dpr`.

`importSemantics: 'wildcard-leaf'` — `uses Foo` brings all public symbols of `Foo` into scope
in one hop (same as Go, Ruby, Swift, Dart).

---

### Step 6 — Type extractor (1–2 hours)

**`gitnexus/src/core/ingestion/type-extractors/pascal.ts`** *(new)*

Pascal is statically typed. Priority tiers:

- **Tier 0** (explicit annotation): `var x: TClass;` — type node is a sibling of the identifier
- **Tier 1** (constructor inference): `x := TClass.Create;` — RHS is `exprCall` on a known class name
- **Tier 0b** (for-loop): `for item: TItem in list do` — explicit annotation on loop variable

Start with Tiers 0 and 1; Tier 2 (assignment chain propagation) can be added in a follow-up.

---

### Step 7 — Extractor configs (2–3 hours, 5 files)

**`call-extractors/configs/pascal.ts`** *(new)*
```typescript
export const pascalCallConfig: CallExtractionConfig = {
  language: SupportedLanguages.DelphiPascal,
};
```

**`field-extractors/configs/pascal.ts`** *(new)*
Map `declField` nodes inside `declClass`/`declIntf` bodies. Visibility is determined by the
nearest preceding visibility keyword (`public`, `private`, `protected`, `published`) among
sibling nodes — walk backward from the field.

**`method-extractors/configs/pascal.ts`** *(new)*
Handle `declProc` (forward declarations in the type section) and `defProc` (implementation
bodies). For `defProc`, strip the `ClassName.` qualifier from the qualified name to get the
bare method name. Extract: return type, parameter list, visibility (section-scan), `isAbstract`
(`abstract` directive present), `isStatic` (`class procedure` / `class function` keywords).

**`variable-extractors/configs/pascal.ts`** *(new)*
Map `declVar` and `declConst` nodes. `declConst` → `isConst: true`. Visibility: `public` if
in the `interface` section, `private` if in `implementation` only.

**`class-extractors/configs/pascal.ts`** *(new)*
```typescript
export const pascalClassConfig: ClassExtractionConfig = {
  language: SupportedLanguages.DelphiPascal,
  typeDeclarationNodes: ['declClass', 'declIntf', 'declHelper'],
  ancestorScopeNodeTypes: ['declClass', 'declIntf'],
};
```

---

### Step 8 — Main language provider (1 hour)

**`gitnexus/src/core/ingestion/languages/pascal.ts`** *(new)*

```typescript
const PASCAL_BUILT_INS: ReadonlySet<string> = new Set([
  'WriteLn', 'Write', 'ReadLn', 'Read', 'Assign', 'Reset', 'Rewrite', 'Close',
  'Inc', 'Dec', 'Length', 'SetLength', 'Copy', 'Pos', 'Concat', 'Delete', 'Insert',
  'StrToInt', 'IntToStr', 'FloatToStr', 'StrToFloat', 'Ord', 'Chr', 'Pred', 'Succ',
  'High', 'Low', 'SizeOf', 'TypeInfo', 'Assigned', 'Nil',
  'New', 'Dispose', 'GetMem', 'FreeMem', 'ReallocMem',
  'Assert', 'Halt', 'Exit', 'Break', 'Continue',
]);

export const delphiPascalProvider = defineLanguage({
  id: SupportedLanguages.DelphiPascal,
  extensions: ['.pas', '.dpr', '.dpk', '.pp'],
  entryPointPatterns: [
    /^FormCreate$/,
    /^FormShow$/,
    /^FormActivate$/,
    /^Execute$/,
    /^Initialize$/,
    /^Run$/,
    /^ServiceStart$/,
    /^ServiceExecute$/,
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
      patterns: ['FMX.Forms', 'FMX.Controls', 'TApplication', 'FireMonkey'],
    },
  ],
  treeSitterQueries: PASCAL_QUERIES,
  typeConfig: pascalTypeConfig,
  exportChecker: pascalExportChecker,   // public if declared in the `interface` section
  importResolver: createImportResolver(pascalImportConfig),
  importSemantics: 'wildcard-leaf',
  implicitImportWirer: pascalPackageWirer,  // reads .dpk contains clause → entry-point edges
  callExtractor: createCallExtractor(pascalCallConfig),
  fieldExtractor: createFieldExtractor(pascalFieldConfig),
  methodExtractor: createMethodExtractor(pascalMethodConfig),
  variableExtractor: createVariableExtractor(pascalVariableConfig),
  classExtractor: createClassExtractor(pascalClassConfig),
  heritageExtractor: createHeritageExtractor(SupportedLanguages.DelphiPascal),
  heritageDefaultEdge: 'EXTENDS',
  interfaceNamePattern: /^I[A-Z]/,   // Delphi IFoo = interface(IBar) convention
  mroStrategy: 'first-wins',
  builtInNames: PASCAL_BUILT_INS,
});
```

**Export checker:** A symbol is public if its declaration appears before the `implementation`
keyword in the unit file (i.e., in the `interface` section). Walk the file's AST to find the
byte offset of the `implementation` keyword; symbols whose node start position is before that
offset are public.

**`pascalPackageWirer` (implicitImportWirer):**
```typescript
const pascalPackageWirer: LanguageProvider['implicitImportWirer'] = (
  languageFiles, _importMap, addImportEdge, _projectConfig
) => {
  const dpkFiles = languageFiles.filter(f => f.endsWith('.dpk'));
  for (const dpk of dpkFiles) {
    const units = parseDpkContains(dpk);  // regex-parse 'contains' clause
    for (const unit of units) {
      // Mark unit as package-entry by adding a self-edge with the dpk as source.
      // entry-point-scoring.ts recognizes dpk-sourced files as package roots.
      addImportEdge(dpk, unit);
    }
  }
};
```

Extend `entry-point-scoring.ts` with a `1.5×` multiplier for functions in units that have an
incoming edge from a `.dpk` file. This makes the flow detector produce processes rooted at
package-exported entry points rather than internal helpers.

---

### Step 9 — Registry wiring (15 min)

**`gitnexus/src/core/ingestion/languages/index.ts`**

```typescript
import { delphiPascalProvider } from './pascal.js';
import { dfmProvider } from './dfm.js';
// ...
[SupportedLanguages.DelphiPascal]: delphiPascalProvider,
[SupportedLanguages.DFM]: dfmProvider,
```

---

### Step 10 — Validate (30 min)

```bash
cd gitnexus
npx tsc --noEmit    # must pass cleanly
npm test            # full suite
```

Optionally add a minimal integration test: a `.pas` file with one class, one method, one uses
clause, one `.dfm` with an `OnClick` binding, and one `.dpk` listing the unit. Assert that the
analyzer produces the expected symbols, call edges, and entry-point scores.

---

## File Inventory

| File | Action |
|---|---|
| `gitnexus-shared/src/languages.ts` | Add `DelphiPascal = 'delphi'` and `DFM = 'dfm'` |
| `gitnexus/package.json` | Add `tree-sitter-pascal` to `optionalDependencies` |
| `gitnexus/src/core/tree-sitter/parser-loader.ts` | Add `DelphiPascal` grammar SOURCES entry |
| `gitnexus/src/core/ingestion/tree-sitter-queries.ts` | Add `PASCAL_QUERIES` + both `LANGUAGE_QUERIES` entries |
| `gitnexus/src/core/ingestion/languages/index.ts` | Import + register both providers |
| `gitnexus/src/core/ingestion/pipeline-phases/index.ts` | Export DFM phase |
| `gitnexus/src/core/ingestion/pipeline.ts` | Wire DFM pipeline phase |
| `languages/pascal.ts` | **New** — main Pascal provider |
| `languages/dfm.ts` | **New** — DFM standalone provider |
| `dfm-processor.ts` | **New** — DFM regex state-machine processor |
| `pipeline-phases/dfm.ts` | **New** — DFM pipeline phase |
| `import-resolvers/configs/pascal.ts` | **New** — unit-name resolver |
| `type-extractors/pascal.ts` | **New** — type/variable inference |
| `call-extractors/configs/pascal.ts` | **New** — call extraction config |
| `field-extractors/configs/pascal.ts` | **New** — field extraction config |
| `method-extractors/configs/pascal.ts` | **New** — method extraction config |
| `variable-extractors/configs/pascal.ts` | **New** — variable/const config |
| `class-extractors/configs/pascal.ts` | **New** — class extractor config |
| `entry-point-scoring.ts` | Extend with `.dpk`-root multiplier |

**Effort estimate:**
- Step 0 (grammar probe) + Step 3 (queries) + Step 4 (DFM processor): ~5–7 hours (exploratory)
- Everything else: ~4–5 hours (mechanical wiring)
- Total: ~1.5–2 days for a solid first pass
