unit Models;

interface

procedure Validate;
procedure Persist;

type
  TUser = class
  public
    Name: string;
    procedure Save;
  end;

implementation

procedure Validate;
begin
end;

procedure Persist;
begin
  Validate;
end;

procedure TUser.Save;
begin
  Validate;
end;

end.
