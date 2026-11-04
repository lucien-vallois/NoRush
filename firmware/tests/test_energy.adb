with Energy_Mgr;
with Test_Harness; use Test_Harness;

package body Test_Energy is

   use Energy_Mgr;

   procedure Run is
      A : constant Cycle_Profile := Boia_A_Profile;
      B : constant Cycle_Profile := Boia_B_Profile;
   begin
      Section ("energy_mgr");

      --  Os perfis devem caber dentro do periodo (1 leitura/min).
      Check (Active_Ms (A) <= A.Period_Ms, "perfil A cabe no periodo de 60 s");
      Check (Active_Ms (B) <= B.Period_Ms, "perfil B cabe no periodo de 60 s");
      Check_Eq_N (Active_Ms (A), 835,  "tempo ativo do ciclo A = 835 ms");
      Check_Eq_N (Active_Ms (B), 620,  "tempo ativo do ciclo B = 620 ms");

      --  Energia por ciclo (uA*ms).
      Check (Cycle_Energy (A) = 16_928_300,
             "energia do ciclo A = 16928300 uA*ms");
      Check (Cycle_Energy (B) = 8_415_700,
             "energia do ciclo B = 8415700 uA*ms");

      --  Corrente media (uA).
      Check_Eq_N (Average_Current (A), 282, "corrente media A = 282 uA");
      Check_Eq_N (Average_Current (B), 140, "corrente media B = 140 uA");

      --  Autonomia com 80% da capacidade nominal utilizavel.
      --  Boia A: 2600 mAh -> 307 dias (~10 meses).
      --  Boia B: 1000 mAh -> 237 dias (~8 meses).
      Check_Eq_N (Autonomy_Days (A, 2600, 80), 307,
                  "autonomia Boia A = 307 dias");
      Check_Eq_N (Autonomy_Days (B, 1000, 80), 237,
                  "autonomia Boia B = 237 dias");

      --  100% da capacidade, para confrontar com o doc.
      Check_Eq_N (Autonomy_Days (A, 2600, 100), 383,
                  "autonomia Boia A sem degradacao = 383 dias");
      Check_Eq_N (Autonomy_Days (B, 1000, 100), 297,
                  "autonomia Boia B sem degradacao = 297 dias");

      --  SF12 (TX mais longo) reduz drasticamente a autonomia.
      declare
         SF12_A : Cycle_Profile := A;
      begin
         SF12_A.Tx_Ms := 1_500;
         Check (Autonomy_Days (SF12_A, 2600, 80) < 120,
                "SF12 reduz a autonomia A para menos de 120 dias");
      end;

      --  Contraste com a afirmacao do doc v1.2 (30-45 dias).
      --  Com o perfil correto, a autonomia e' de ORDEM DE GRANDEZA
      --  superior: o consumo de sleep declarado (0,5 mA) era o que
      --  produzia ~83 dias.
      Check (Autonomy_Days (A, 2600, 80) > 200,
             "autonomia real supera em muito os 30-45 dias do doc v1.2");
   end Run;

end Test_Energy;
