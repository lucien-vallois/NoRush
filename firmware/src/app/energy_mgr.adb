package body Energy_Mgr with SPARK_Mode => On is

   function Active_Ms (P : Cycle_Profile) return Natural is
     (P.Wake_Ms + P.Tx_Ms + P.Rx_Ms);

   function Cycle_Energy (P : Cycle_Profile) return Long_Long_Integer is
      Active_Energy : constant Long_Long_Integer :=
        Long_Long_Integer (P.Wake_Ms) * Long_Long_Integer (P.Wake_Ua)
        + Long_Long_Integer (P.Tx_Ms) * Long_Long_Integer (P.Tx_Ua)
        + Long_Long_Integer (P.Rx_Ms) * Long_Long_Integer (P.Rx_Ua);
      Sleep_Ms      : constant Natural := P.Period_Ms - Active_Ms (P);
      Sleep_Energy  : constant Long_Long_Integer :=
        Long_Long_Integer (Sleep_Ms) * Long_Long_Integer (P.Sleep_Ua);
   begin
      return Active_Energy + Sleep_Energy;
   end Cycle_Energy;

   function Average_Current (P : Cycle_Profile) return Natural is
      Cycles_Per_Day : constant Long_Long_Integer :=
        Long_Long_Integer (Ms_Per_Day) / Long_Long_Integer (P.Period_Ms);
      Daily_Ua_Ms    : constant Long_Long_Integer :=
        Cycles_Per_Day * Cycle_Energy (P);
   begin
      return Natural (Daily_Ua_Ms / Long_Long_Integer (Ms_Per_Day));
   end Average_Current;

   function Autonomy_Days
     (P                   : Cycle_Profile;
      Capacity_Mah        : Natural;
      Usable_Fraction_Pct : Pct := 80) return Natural
   is
      Capacity_Ua_Ms : constant Long_Long_Integer :=
        (Long_Long_Integer (Capacity_Mah) * Mah_In_Ua_Ms
         * Long_Long_Integer (Usable_Fraction_Pct)) / 100;
      Daily_Ua_Ms    : constant Long_Long_Integer :=
        (Long_Long_Integer (Ms_Per_Day) / Long_Long_Integer (P.Period_Ms))
        * Cycle_Energy (P);
   begin
      if Daily_Ua_Ms <= 0 then
         return 0;
      end if;
      return Natural (Capacity_Ua_Ms / Daily_Ua_Ms);
   end Autonomy_Days;

   --  Perfis conforme a tabela "Orcamento de Energia" de
   --  docs/componentes/boia-a-oleo.md e boia-b-interface.md.

   function Boia_A_Profile return Cycle_Profile is
     (Wake_Ms   => 25,     --  acordar + leitura do magnetostrutivo + processar
      Wake_Ua   => 25_000,
      Tx_Ms     => 270,    --  12 bytes em SF9BW125
      Tx_Ua     => 45_000,
      Rx_Ms     => 540,    --  janelas RX1/RX2 classe A
      Rx_Ua     => 5_500,
      Sleep_Ua  => 20,     --  STM32L4 STOP2 + SX1262 sleep
      Period_Ms => 60_000);

   function Boia_B_Profile return Cycle_Profile is
     (Wake_Ms   => 30,     --  condutividade + posicao + processar
      Wake_Ua   => 12_000,
      Tx_Ms     => 160,    --  12 bytes em SF8BW125 a +10 dBm
      Tx_Ua     => 30_000,
      Rx_Ms     => 430,
      Rx_Ua     => 5_500,
      Sleep_Ua  => 15,     --  STM32L0 STOP + SX1262 sleep
      Period_Ms => 60_000);

end Energy_Mgr;
