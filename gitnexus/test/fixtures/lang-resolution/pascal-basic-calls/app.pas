unit App;

interface

procedure Run;

implementation

uses Models;

procedure Run;
begin
  Validate;
  Persist;
end;

end.
