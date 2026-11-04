with Arqueacao;
with Test_Harness; use Test_Harness;

package body Test_Arqueacao is

   use Arqueacao;

   --  Tabela de exemplo: tanque de 5 m com perfil convexo.
   T : constant Table (1 .. 6) :=
     ((Level_Mm =>    0, Volume_L =>     0),
      (Level_Mm => 1000, Volume_L =>  1000),
      (Level_Mm => 2000, Volume_L =>  2500),
      (Level_Mm => 3000, Volume_L =>  4500),
      (Level_Mm => 4000, Volume_L =>  7000),
      (Level_Mm => 5000, Volume_L => 10000));

   --  Tabela invalida: niveis nao estritamente crescentes.
   Bad_T : constant Table (1 .. 3) :=
     ((Level_Mm => 0,    Volume_L => 0),
      (Level_Mm => 1000, Volume_L => 500),
      (Level_Mm => 1000, Volume_L => 900));

   --  Tabela invalida: volume decrescente.
   Bad_T2 : constant Table (1 .. 3) :=
     ((Level_Mm => 0,    Volume_L => 0),
      (Level_Mm => 1000, Volume_L => 500),
      (Level_Mm => 2000, Volume_L => 400));

   --  Tabela cuja primeira marca nao e' zero: serve para testar saturacao.
   T_Off : constant Table (1 .. 2) :=
     ((Level_Mm => 100, Volume_L => 50),
      (Level_Mm => 900, Volume_L => 950));

   procedure Run is
   begin
      Section ("arqueacao");

      Check (Is_Monotonic (T), "tabela valida e' monotona");
      Check (not Is_Monotonic (Bad_T), "niveis repetidos rejeitados");
      Check (not Is_Monotonic (Bad_T2), "volume decrescente rejeitado");

      --  Nos pontos de marca, o valor e' exato.
      Check_Eq_N (Volume (T, 0),    0, "volume em 0 mm");
      Check_Eq_N (Volume (T, 1000), 1000, "volume em 1000 mm");
      Check_Eq_N (Volume (T, 2000), 2500, "volume em 2000 mm");
      Check_Eq_N (Volume (T, 5000), 10000, "volume em 5000 mm");

      --  Interpolacao linear entre marcas.
      --  Entre (1000,1000) e (2000,2500): 1000 + 1500*500/1000 = 1750.
      Check_Eq_N (Volume (T, 1500), 1750, "interpolacao em 1500 mm");
      --  Entre (3000,4500) e (4000,7000): 4500 + 2500*250/1000 = 5125.
      Check_Eq_N (Volume (T, 3250), 5125, "interpolacao em 3250 mm");
      --  Entre (4000,7000) e (5000,10000): 7000 + 3000*999/1000 = 9997.
      Check_Eq_N (Volume (T, 4999), 9997, "interpola ate o fim do range");

      --  Extrapolacao e' saturada, nunca projetada.
      Check_Eq_N (Volume (T_Off, 0),  50, "abaixo da primeira marca satura");
      Check_Eq_N (Volume (T_Off, 4000), 950, "acima da ultima marca satura");

      --  Monotonicidade do resultado: mais nivel nunca gera menos volume.
      declare
         Prev : Natural := 0;
         Ok   : Boolean := True;
      begin
         for Lvl in 0 .. 5000 loop
            if Volume (T, Lvl) < Prev then
               Ok := False;
            end if;
            Prev := Volume (T, Lvl);
         end loop;
         Check (Ok, "volume e' nao-decrescente em todo o range 0..5000");
      end;
   end Run;

end Test_Arqueacao;
