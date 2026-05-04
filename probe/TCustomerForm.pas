unit TCustomerForm;

// Probe file: exercises every construct the GitNexus Pascal extractor must handle.
// This unit has a companion TCustomerForm.dfm and is listed in MyComponents.dpk.
//
// IFDEF asymmetry cases (four distinct patterns):
//   A) One-sided {$IFDEF} with N calls, no {$ELSE}  → constructor DEBUG block
//   B) Class-level {$IFDEF} wrapping method *declarations* (no $ELSE)
//   C) True asymmetric {$IFDEF}/{$ELSE}: TRIAL branch has 4 calls, FULL has 1
//   D) {$IFNDEF} guard where the {$ELSE} branch has more calls than the positive branch

{$IFDEF FPC}
  {$MODE DELPHI}
{$ENDIF}

interface

uses
  // interface-section uses clause — each ident is a separate import
  System.SysUtils,
  System.Classes,
  Vcl.Forms,
  Vcl.Controls,
  Vcl.StdCtrls,
  Vcl.Grids,
  Generics.Collections;

type
  // Forward declaration (declProc-less class ref — verify how tree-sitter represents this)
  TCustomer = class;

  // Interface declaration
  ICustomerObserver = interface
    ['{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}']
    procedure OnCustomerChanged(const ACustomer: TCustomer);
  end;

  // ── Main form class ──────────────────────────────────────────────────────────
  // Heritage: extends TForm, implements ICustomerObserver
  TCustomerForm = class(TForm, ICustomerObserver)
  strict private
    // Generic field — verify how TObjectList<TCustomer> is encoded
    FCustomers: TObjectList<TCustomer>;
    FCurrentIndex: Integer;
    // Conditional field — does {$IFDEF} appear as an AST node inside a class body?
    {$IFDEF DEBUG}
    FDebugLog: TStringList;
    {$ENDIF}
  private
    procedure LoadCustomers;
    procedure ClearForm;
    // [B] One-sided $IFDEF wrapping forward method declarations — no $ELSE.
    // Key question: does tree-sitter include or exclude these declProc nodes
    // when the grammar sees the {$IFDEF} directive inline?
    {$IFDEF LOGGING}
    procedure WriteLog(const AMsg: string);
    procedure FlushLog;
    {$ENDIF}
  protected
    procedure DoShow; override;
  public
    constructor Create(AOwner: TComponent); override;
    destructor Destroy; override;
    // Method that satisfies ICustomerObserver
    procedure OnCustomerChanged(const ACustomer: TCustomer);
  published
    // Published fields (VCL form components)
    btnLoad: TButton;
    btnSave: TButton;
    grdCustomers: TStringGrid;
    cmbStatus: TComboBox;
    memoLog: TMemo;
    pnlStatus: TPanel;
    lblCount: TLabel;
    // Event handlers declared in published section
    procedure btnLoadClick(Sender: TObject);
    procedure btnSaveClick(Sender: TObject);
    procedure FormCreate(Sender: TObject);
    procedure cmbStatusChange(Sender: TObject);
    procedure lblCountClick(Sender: TObject);
  end;

var
  // Unit-scope variable
  CustomerForm: TCustomerForm;

implementation

// DFM resource link — how does tree-sitter represent {$R *.dfm}?
{$R *.dfm}

uses
  // implementation-section uses clause (second declUses in same file)
  System.UITypes,
  Vcl.Dialogs;

{ TCustomerForm }

// ── Constructor ──────────────────────────────────────────────────────────────
// Qualified method name: verify defProc encodes "TCustomerForm" + "Create"
constructor TCustomerForm.Create(AOwner: TComponent);
begin
  inherited Create(AOwner);
  // Constructor call: TObjectList<TCustomer>.Create(True)
  FCustomers := TObjectList<TCustomer>.Create(True);
  FCurrentIndex := -1;

  // [A] One-sided {$IFDEF}: DEBUG branch has 3 calls; no $ELSE means 0 calls
  // on the other path. Asymmetry: 3 vs 0.
  {$IFDEF DEBUG}
  FDebugLog := TStringList.Create;
  FDebugLog.Add('TCustomerForm created at ' + DateTimeToStr(Now));
  VerifyInvariant;
  {$ENDIF}
end;

destructor TCustomerForm.Destroy;
begin
  {$IFDEF DEBUG}
  FDebugLog.Free;
  {$ENDIF}
  // Method call: FCustomers.Free
  FCustomers.Free;
  inherited Destroy;
end;

procedure TCustomerForm.LoadCustomers;
var
  LCustomer: TCustomer;
  I: Integer;
begin
  // Method call on field: FCustomers.Clear
  FCustomers.Clear;
  try
    for I := 0 to 9 do
    begin
      // Constructor call: TCustomer.Create
      LCustomer := TCustomer.Create;
      // Property assignment via method call: IntToStr(I)
      LCustomer.Name := 'Customer ' + IntToStr(I);
      // Method call: FCustomers.Add(LCustomer)
      FCustomers.Add(LCustomer);
    end;
  except
    on E: Exception do
      // Direct call: ShowMessage(...)
      ShowMessage('Error loading customers: ' + E.Message);
  end;
end;

procedure TCustomerForm.ClearForm;
begin
  // Chained member access: grdCustomers.Rows[0].Clear
  grdCustomers.Rows[0].Clear;
  // Two-level method call: grdCustomers.Columns.Clear
  grdCustomers.Columns.Clear;
end;

procedure TCustomerForm.DoShow;
begin
  inherited DoShow;
  LoadCustomers;
end;

procedure TCustomerForm.OnCustomerChanged(const ACustomer: TCustomer);
begin
  if Assigned(ACustomer) then
    // Method call on field: grdCustomers.Invalidate
    grdCustomers.Invalidate;
end;

procedure TCustomerForm.btnLoadClick(Sender: TObject);
begin
  LoadCustomers;
  ClearForm;
  // Property assignment using field: FCustomers.Count
  grdCustomers.RowCount := FCustomers.Count + 1;
end;

procedure TCustomerForm.btnSaveClick(Sender: TObject);
var
  LStream: TFileStream;
begin
  // [D] {$IFNDEF}: the negative (ELSE) branch has more calls than the guard body.
  // Asymmetry: DISABLE_SAVE branch = 1 call; normal branch = 3 calls.
  {$IFNDEF DISABLE_SAVE}
  try
    // Constructor call: TFileStream.Create
    LStream := TFileStream.Create('customers.dat', fmCreate);
    try
      // Two method calls inside the guarded path
      LStream.Write(FCustomers.Count, SizeOf(Integer));
      LogOperation('save', FCustomers.Count);
    finally
      LStream.Free;
    end;
  except
    on E: EFCreateError do
      ShowMessage('Cannot create file: ' + E.Message);
  end;
  {$ELSE}
  // DISABLE_SAVE path: only one call — fewer than the positive branch
  ShowMessage('Saving is disabled in this build configuration.');
  {$ENDIF}
end;

procedure TCustomerForm.FormCreate(Sender: TObject);
begin
  Caption := 'Customer Manager';

  // [C] True asymmetric {$IFDEF}/{$ELSE}:
  // TRIAL branch: 4 calls (assignment + 3 method calls, one with a nested call)
  // FULL  branch: 1 assignment only
  {$IFDEF TRIAL}
  Caption := Caption + ' (Trial)';
  ShowTrialBanner;
  StartTrialTimer;
  ShowMessage('Trial version — ' + IntToStr(GetTrialDaysRemaining) + ' days remaining.');
  {$ELSE}
  Caption := Caption + ' (Full)';
  {$ENDIF}
end;

procedure TCustomerForm.cmbStatusChange(Sender: TObject);
begin
  LoadCustomers;
end;

procedure TCustomerForm.lblCountClick(Sender: TObject);
begin
  ShowMessage(lblCount.Caption);
end;

// [B continued] Conditional method implementations — only compiled when LOGGING is defined.
// These defProc nodes mirror the conditional declProc declarations in the class body.
{$IFDEF LOGGING}
procedure TCustomerForm.WriteLog(const AMsg: string);
begin
  FDebugLog.Add(FormatDateTime('hh:nn:ss', Now) + ' ' + AMsg);
end;

procedure TCustomerForm.FlushLog;
begin
  FDebugLog.SaveToFile('customerform.log');
  FDebugLog.Clear;
end;
{$ENDIF}

initialization
  // Initialization section — standalone call at unit scope
  RegisterClass(TCustomerForm);

finalization
  { nothing to clean up }

end.
