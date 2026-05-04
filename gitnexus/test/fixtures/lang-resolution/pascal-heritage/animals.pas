unit Animals;

interface

type
  TAnimal = class
  public
    procedure Speak; virtual;
    procedure Breathe;
  end;

  TDog = class(TAnimal)
  public
    procedure Speak; override;
  end;

implementation

procedure TAnimal.Speak;
begin
end;

procedure TAnimal.Breathe;
begin
end;

procedure TDog.Speak;
begin
  WriteLn('Woof');
end;

end.
