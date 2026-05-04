unit App;

interface

procedure RunAnimals;

implementation

uses Animals;

procedure RunAnimals;
var
  D: TDog;
begin
  D := TDog.Create;
  D.Speak;
  D.Breathe;
end;

end.
