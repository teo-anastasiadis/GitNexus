unit TBaseService;

// Probe file: interface declarations, records with methods, nested types,
// class vars/functions, anonymous method type aliases, enums, generics.

{$IFDEF FPC}
  {$MODE DELPHI}
{$ENDIF}

interface

uses
  System.SysUtils,
  System.Classes,
  Generics.Collections;

const
  // Untyped constant
  MaxRetries = 3;
  // Typed constant
  DefaultTimeout: Integer = 5000;
  ServiceVersion = '1.0.0';

type
  // Enum type — verify how (csActive, csInactive, csDeleted) is encoded
  TCustomerStatus = (csActive, csInactive, csDeleted);

  // Record with methods — verify defProc for "TCustomerRecord.IsActive"
  TCustomerRecord = record
    ID: Integer;
    Name: string;
    Status: TCustomerStatus;
    function IsActive: Boolean;
    procedure Reset;
  end;

  // Type alias with generic — TObjectList<TCustomer>
  TCustomerList = TObjectList<TCustomer>;

  // Anonymous method type — "reference to function(...)"
  TFilterFunc = reference to function(const ARecord: TCustomerRecord): Boolean;

  // Interface with GUID and property
  ICustomerService = interface
    ['{DEADBEEF-CAFE-BABE-FACE-0123456789AB}']
    function GetCustomerCount: Integer;
    function FindById(AId: Integer): TCustomerRecord;
    procedure AddCustomer(const ARecord: TCustomerRecord);
    property CustomerCount: Integer read GetCustomerCount;
  end;

  // Class with:
  //   - nested type
  //   - nested var
  //   - class var (static)
  //   - class function (static)
  //   - interface implementation
  TBaseService = class(TInterfacedObject, ICustomerService)
  private
    type
      // Nested type inside class body — verify how tree-sitter scopes this
      TInternalState = (isIdle, isLoading, isSaving);
    var
      FState: TInternalState;
      FCustomers: TCustomerList;
  protected
    procedure SetState(AState: TInternalState); virtual;
  public
    // Class (static) members — verify "class var" and "class function" encoding
    class var InstanceCount: Integer;
    class function CreateDefault: ICustomerService; static;
    constructor Create; virtual;
    destructor Destroy; override;
    // ICustomerService implementation
    function GetCustomerCount: Integer;
    function FindById(AId: Integer): TCustomerRecord;
    procedure AddCustomer(const ARecord: TCustomerRecord);
    property CustomerCount: Integer read GetCustomerCount;
  end;

implementation

{ TCustomerRecord }

function TCustomerRecord.IsActive: Boolean;
begin
  // Comparison: Status = csActive
  Result := Status = csActive;
end;

procedure TCustomerRecord.Reset;
begin
  ID := 0;
  Name := '';
  Status := csInactive;
end;

{ TBaseService }

// Class function implementation — "class function TBaseService.CreateDefault"
class function TBaseService.CreateDefault: ICustomerService;
begin
  // Constructor call: TBaseService.Create
  Result := TBaseService.Create;
end;

constructor TBaseService.Create;
begin
  inherited Create;
  // Constructor call: TCustomerList.Create(True)
  FCustomers := TCustomerList.Create(True);
  FState := isIdle;
  // Class var increment: Inc(InstanceCount)
  Inc(InstanceCount);
end;

destructor TBaseService.Destroy;
begin
  FCustomers.Free;
  Dec(InstanceCount);
  inherited Destroy;
end;

procedure TBaseService.SetState(AState: TInternalState);
begin
  FState := AState;
end;

function TBaseService.GetCustomerCount: Integer;
begin
  // Method call: FCustomers.Count
  Result := FCustomers.Count;
end;

function TBaseService.FindById(AId: Integer): TCustomerRecord;
var
  I: Integer;
begin
  Result.Reset;
  for I := 0 to FCustomers.Count - 1 do
    if FCustomers[I].ID = AId then
    begin
      Result := FCustomers[I];
      Exit;
    end;
end;

procedure TBaseService.AddCustomer(const ARecord: TCustomerRecord);
var
  LNew: TCustomer;
begin
  SetState(isSaving);
  try
    LNew := TCustomer.Create;
    LNew.ID := ARecord.ID;
    LNew.Name := ARecord.Name;
    FCustomers.Add(LNew);
  finally
    SetState(isIdle);
  end;
end;

end.
