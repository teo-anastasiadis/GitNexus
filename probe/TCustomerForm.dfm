object TCustomerForm: TCustomerForm
  Left = 0
  Top = 0
  // [1] Escaped single quote — '' encodes a literal ' inside a DFM string
  Caption = 'It''s a Customer Form'
  ClientHeight = 520
  ClientWidth = 640
  Color = clBtnFace
  Font.Charset = DEFAULT_CHARSET
  Font.Color = clWindowText
  Font.Height = -11
  Font.Name = 'Tahoma'
  Font.Style = []
  OnCreate = FormCreate
  PixelsPerInch = 96
  TextHeight = 13
  object btnLoad: TButton
    Left = 8
    Top = 8
    Width = 75
    Height = 25
    Caption = 'Load'
    // [2] Multiline string via #13#10 escape — two string literals concatenated
    // by the DFM parser without a '+' operator (implicit concatenation)
    Hint = 'Load customers'#13#10'from the database'
    ParentShowHint = False
    ShowHint = True
    TabOrder = 0
    OnClick = btnLoadClick
  end
  object btnSave: TButton
    Left = 89
    Top = 8
    Width = 75
    Height = 25
    Caption = 'Save'
    Enabled = False
    // [3] Empty string value
    Hint = ''
    TabOrder = 1
    OnClick = btnSaveClick
  end
  object grdCustomers: TStringGrid
    Left = 0
    Top = 40
    Width = 640
    Height = 370
    // [4] Set-valued property — comma-separated identifiers in square brackets
    Anchors = [akLeft, akTop, akRight, akBottom]
    ColCount = 3
    FixedCols = 1
    RowCount = 2
    TabOrder = 2
    // No event bindings on this component — tests that the extractor emits
    // zero call edges here and does not confuse property lines with handlers
  end
  object cmbStatus: TComboBox
    Left = 8
    Top = 416
    Width = 150
    Height = 21
    // [5a] TStrings list property — multi-line block terminated by ')'
    Items.Strings = (
      'Active'
      'Inactive'
      'Deleted')
    ItemIndex = 0
    TabOrder = 3
    // Event on a component that has no OnClick — different event name
    OnChange = cmbStatusChange
  end
  object memoLog: TMemo
    Left = 170
    Top = 416
    Width = 462
    Height = 60
    Anchors = [akLeft, akRight, akBottom]
    // [5b] TStrings list with mixed escape sequences:
    //   ''  = escaped single quote inside a string
    //   #9  = tab character
    //   #13#10 = CRLF embedded mid-string (concatenated without +)
    Lines.Strings = (
      'Log initialized.'
      'Ready to load customers.'
      'Note: it''s case-sensitive.'
      'Tab'#9'separated value'
      'CR/LF embedded: '#13#10'second line of same entry')
    ReadOnly = True
    ScrollBars = ssVertical
    TabOrder = 4
  end
  // [6] Three-level nesting: form -> pnlStatus -> label children
  object pnlStatus: TPanel
    Left = 0
    Top = 485
    Width = 640
    Height = 35
    Align = alBottom
    // [3 again] Empty string on a panel caption
    Caption = ''
    TabOrder = 5
    object lblCount: TLabel
      Left = 8
      Top = 10
      Width = 100
      Height = 16
      Caption = '0 customers'
      // Event at depth 3 — tests that handler resolution walks up to the form
      OnClick = lblCountClick
    end
    object lblVersion: TLabel
      Left = 540
      Top = 10
      Width = 80
      Height = 16
      Caption = 'v1.0.0'
      // No event bindings — negative test: zero call edges expected
    end
  end
end
