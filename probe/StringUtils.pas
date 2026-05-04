unit StringUtils;

// Probe file: standalone procedures/functions at unit scope (no class wrapper),
// overloads, default params, conditional compilation of a whole function,
// unit-scope var/const blocks, initialization section.
// No companion .dfm — tests that the extractor handles plain non-form units.

{$IFDEF FPC}
  {$MODE DELPHI}
{$ENDIF}

interface

uses
  System.SysUtils;

const
  // Untyped constant
  MaxStringLength = 255;
  // Typed constant
  EmptyString: string = '';
  Delimiter = ',';

var
  // Unit-scope variable
  GlobalFormatter: TFormatSettings;

// Standalone function declarations
function Capitalize(const S: string): string;

// Overloaded pair — verify both declProc nodes share the same name
function Truncate(const S: string; MaxLen: Integer): string; overload;
function Truncate(const S: string; MaxLen: Integer; Ellipsis: Boolean): string; overload;

function SplitString(const S, Delimiter: string): TArray<string>;
procedure TrimAll(var Strings: TArray<string>);

// Conditionally compiled function — verify the whole declProc is gated
{$IFDEF UNICODE}
function WideToUtf8(const S: UnicodeString): AnsiString;
{$ENDIF}

implementation

function Capitalize(const S: string): string;
begin
  if S = '' then
    Exit('');
  // Two direct calls: UpperCase, LowerCase, Copy
  Result := UpperCase(S[1]) + LowerCase(Copy(S, 2, MaxInt));

  // [E] One-sided {$IFDEF} mid-function body: 3 debug calls vs 0 on release path.
  // The calls are after the Result assignment so they do not change the return value —
  // tests that the extractor still sees them as call edges regardless of control flow.
  {$IFDEF EXTENDED_DEBUG}
  Assert(Result <> '', 'Capitalize: result must be non-empty for non-empty input');
  DebugOutputString('Capitalize input:  ' + S);
  DebugOutputString('Capitalize result: ' + Result);
  {$ENDIF}
end;

// First overload delegates to the second — direct call to sibling function
function Truncate(const S: string; MaxLen: Integer): string;
begin
  Result := Truncate(S, MaxLen, False);
end;

function Truncate(const S: string; MaxLen: Integer; Ellipsis: Boolean): string;
const
  // Local typed constant — verify this doesn't get confused with a field
  EllipsisStr = '...';
begin
  if Length(S) <= MaxLen then
    Exit(S);
  if Ellipsis and (MaxLen > Length(EllipsisStr)) then
    // Call: Copy(S, 1, MaxLen - Length(EllipsisStr))
    Result := Copy(S, 1, MaxLen - Length(EllipsisStr)) + EllipsisStr
  else
    Result := Copy(S, 1, MaxLen);
end;

function SplitString(const S, Delimiter: string): TArray<string>;
begin
  // Method call on string value: S.Split([Delimiter])
  Result := S.Split([Delimiter]);
end;

procedure TrimAll(var Strings: TArray<string>);
var
  I: Integer;
begin
  for I := Low(Strings) to High(Strings) do
    // Direct call: Trim(Strings[I])
    Strings[I] := Trim(Strings[I]);
end;

{$IFDEF UNICODE}
function WideToUtf8(const S: UnicodeString): AnsiString;
begin
  // Direct call: UTF8Encode
  Result := UTF8Encode(S);
end;
{$ENDIF}

initialization
  // Direct call at unit scope: TFormatSettings.Create
  GlobalFormatter := TFormatSettings.Create('en-US');

end.
