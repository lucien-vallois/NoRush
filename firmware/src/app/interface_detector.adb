package body Interface_Detector with SPARK_Mode => On is

   procedure Push (S : in out State; Pos : Hal_Types.Position_Mm) is
   begin
      if S.Count < History_Depth then
         S.Buf (S.Count) := Pos;
         S.Count := S.Count + 1;
      else
         --  Janela deslizante: descarta a amostra mais antiga.
         for I in 0 .. History_Depth - 2 loop
            S.Buf (I) := S.Buf (I + 1);
         end loop;
         S.Buf (History_Depth - 1) := Pos;
      end if;
   end Push;

   function Amplitude (S : State) return Natural is
      Lo : Hal_Types.Position_Mm := Hal_Types.Position_Mm'Last;
      Hi : Hal_Types.Position_Mm := 0;
   begin
      if S.Count < 2 then
         return 0;
      end if;
      for I in 0 .. S.Count - 1 loop
         if S.Buf (I) < Lo then
            Lo := S.Buf (I);
         end if;
         if S.Buf (I) > Hi then
            Hi := S.Buf (I);
         end if;
      end loop;
      return Hi - Lo;
   end Amplitude;

   function Stability (S : State) return Natural is
      A : constant Natural := Amplitude (S);
   begin
      --  Saturado: amplitude zero -> 100, amplitude >= tolerancia -> 0.
      if A >= Tolerance_Mm then
         return 0;
      end if;
      return ((Tolerance_Mm - A) * 100) / Tolerance_Mm;
   end Stability;

   function Confidence (S            : State;
                        Conductivity : Hal_Types.Conductivity_uS;
                        Has_Cell     : Boolean) return Natural
   is
      St : constant Natural := Stability (S);
   begin
      if not Has_Cell then
         return St;
      end if;
      --  Com celula: a condutividade e' uma segunda opiniao independente.
      --  Acima do limiar a amostra e' agua (interface valida); abaixo, ou a
      --  boia esta no oleo ou a interface ainda nao se formou.
      if Conductivity > Water_Conductivity_Min then
         return (St + 100) / 2;
      else
         return St / 2;
      end if;
   end Confidence;

   function Mean_Position (S : State) return Hal_Types.Position_Mm is
      Acc : Long_Long_Integer := 0;
   begin
      if S.Count = 0 then
         return 0;
      end if;
      for I in 0 .. S.Count - 1 loop
         Acc := Acc + Long_Long_Integer (S.Buf (I));
      end loop;
      return Hal_Types.Position_Mm (Acc / Long_Long_Integer (S.Count));
   end Mean_Position;

   procedure Detect
     (S            : in     State;
      Conductivity : in     Hal_Types.Conductivity_uS;
      Has_Cell     : in     Boolean;
      Detected     :    out Boolean;
      Score        :    out Natural;
      Position     :    out Hal_Types.Position_Mm)
   is
      Sc : constant Natural := Confidence (S, Conductivity, Has_Cell);
   begin
      Score    := Sc;
      Position := Mean_Position (S);
      Detected :=
        S.Count >= Min_Samples
        and then Stability (S) >= Stability_Min
        and then Sc >= Confidence_Threshold;
   end Detect;

end Interface_Detector;
