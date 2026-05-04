program MyApp;

// Probe file: .dpr project file — tests program block, application entry point,
// and the VCL framework detection patterns (TApplication.Initialize, Application.Run).

uses
  Vcl.Forms,
  // Unit list with "in 'path'" form — same encoding as .dpk contains clause
  TCustomerForm in 'TCustomerForm.pas' {CustomerForm},
  TBaseService in 'TBaseService.pas',
  StringUtils in 'StringUtils.pas';

{$R *.res}

begin
  // begin...end at program scope = unconditional entry point
  // Three VCL framework calls to detect application type:
  Application.Initialize;
  Application.MainFormOnTaskbar := True;
  Application.CreateForm(TCustomerForm, CustomerForm);
  Application.Run;
end.
