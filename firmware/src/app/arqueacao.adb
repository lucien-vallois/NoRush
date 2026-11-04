package body Arqueacao with SPARK_Mode => On is

   function Volume (T : Table; Level_Mm : Hal_Types.Position_Mm) return Natural is
   begin
      --  Abaixo da primeira marca: a boia esta no fundo, mas a tabela so'
      --  comeca em Level_Mm do primeiro ponto. Devolvemos esse volume, sem
      --  extrapolar para baixo.
      if Level_Mm <= T (T'First).Level_Mm then
         return T (T'First).Volume_L;
      end if;

      --  Acima da ultima marca: saturar no ultimo ponto, sem extrapolar.
      if Level_Mm >= T (T'Last).Level_Mm then
         return T (T'Last).Volume_L;
      end if;

      for I in T'First .. T'Last - 1 loop
         if Level_Mm <= T (I + 1).Level_Mm then
            declare
               --  Is_Monotonic garante L1 > L0 e V1 >= V0.
               L0 : constant Long_Long_Integer :=
                 Long_Long_Integer (T (I).Level_Mm);
               L1 : constant Long_Long_Integer :=
                 Long_Long_Integer (T (I + 1).Level_Mm);
               V0 : constant Long_Long_Integer :=
                 Long_Long_Integer (T (I).Volume_L);
               V1 : constant Long_Long_Integer :=
                 Long_Long_Integer (T (I + 1).Volume_L);

               DL : constant Long_Long_Integer := L1 - L0;   -- >= 1
               DV : constant Long_Long_Integer := V1 - V0;   -- >= 0
               DX : constant Long_Long_Integer :=
                 Long_Long_Integer (Level_Mm) - L0;          -- em 0 .. DL-1

               --  V0 + DV * DX / DL. DV <= Max_Volume_L, DX <= 5000, DL >= 1:
               --  o produto fica abaixo de 5e8, cabe com folga em 64 bits.
               V  : constant Long_Long_Integer := V0 + (DV * DX) / DL;
            begin
               return Natural (V);
            end;
         end if;
      end loop;

      --  Inalcancavel: Level_Mm esta estritamente entre o primeiro e o
      --  ultimo ponto, e os niveis sao estritamente crescentes.
      return T (T'Last).Volume_L;
   end Volume;

end Arqueacao;
