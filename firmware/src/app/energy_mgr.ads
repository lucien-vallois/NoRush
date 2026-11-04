--  Modelo de energia do no: consumo por ciclo e autonomia de bateria.
--
--  Existe porque o doc de hardware v1.2 afirmava "autonomia de 30-45 dias"
--  sem que a aritimetica fechasse. Este modulo torna o calculo executavel:
--  os testes em tests/test_energy.adb confrontam a autonomia declarada nos
--  docs com a que o perfil de consumo realmente produz.
--
--  Unidades adotadas (deliberadamente inteiras, sem ponto-flutuante):
--    tempo     -> milissegundos (ms)
--    corrente  -> microamperes  (uA); 1 mA = 1000 uA
--    energia   -> uA * ms
--
--  Capacidade de bateria:
--    1 mAh = 1000 uA durante 3600 s = 3.6e9 uA*ms

package Energy_Mgr with SPARK_Mode => On is

   Ms_Per_Day : constant := 86_400_000;

   --  1 mAh expresso em uA*ms.
   Mah_In_Ua_Ms : constant Long_Long_Integer := 3_600_000_000;

   type Cycle_Profile is record
      Wake_Ms   : Natural range 0 .. 60_000   := 25;
      Wake_Ua   : Natural range 0 .. 500_000  := 25_000;
      Tx_Ms     : Natural range 0 .. 60_000   := 270;
      Tx_Ua     : Natural range 0 .. 500_000  := 45_000;
      Rx_Ms     : Natural range 0 .. 60_000   := 540;
      Rx_Ua     : Natural range 0 .. 500_000  := 5_500;
      Sleep_Ua  : Natural range 0 .. 10_000   := 20;
      Period_Ms : Natural range 1_000 .. 3_600_000 := 60_000;
   end record;

   --  Fracao de capacidade utilizavel, em percentual.
   subtype Pct is Natural range 1 .. 100;

   --  Tempo ativo total de um ciclo (medicao + TX + janelas RX).
   function Active_Ms (P : Cycle_Profile) return Natural
     with Post => Active_Ms'Result <= 180_000;

   --  Energia de um ciclo completo, incluindo o sleep ate o proximo tick.
   --  O so' e' considerado quando ha tempo de sobra no periodo.
   function Cycle_Energy (P : Cycle_Profile) return Long_Long_Integer
     with Pre  => Active_Ms (P) <= P.Period_Ms,
          Post => Cycle_Energy'Result >= 0;

   --  Corrente media consumida, em uA.
   function Average_Current (P : Cycle_Profile) return Natural
     with Pre => Active_Ms (P) <= P.Period_Ms;

   --  Autonomia em dias inteiros, considerando uma degradacao de uso real.
   --  Usable_Fraction_Pct e' a fracao da capacidade nominal que de fato
   --  pode ser extraida (corte de desligamento, envelhecimento).
   function Autonomy_Days
     (P                   : Cycle_Profile;
      Capacity_Mah        : Natural;
      Usable_Fraction_Pct : Pct := 80) return Natural
     with Pre  => Active_Ms (P) <= P.Period_Ms
                  and then Capacity_Mah > 0,
          Post => Autonomy_Days'Result <= 36_500;

   --  Perfis que batem com a tabela em docs/componentes/*.md
   function Boia_A_Profile return Cycle_Profile;
   function Boia_B_Profile return Cycle_Profile;

end Energy_Mgr;
