--  Gerenciamento de energia e bateria.
--
--  BOUNDARY DE CONFIANCA (SPARK_Mode => Off) -- ver hal_clock.ads.

with Hal_Types;

package Hal_Power with SPARK_Mode => Off is

   type Sleep_Mode is (Stop2, Standby);

   --  Entra em modo de baixo consumo ate o proximo tick de RTC.
   --  Consumo alvo: <= 20 uA (Boia A) / <= 15 uA (Boia B).
   procedure Enter_Sleep (Mode : Sleep_Mode);

   --  Carga estimada da bateria, 0..100 %.
   function Read_Battery return Hal_Types.Battery_Pct;

   --  Tensao da celula em milivolts (para diagnostico).
   function Read_Vbat_Mv return Natural
     with Post => Read_Vbat_Mv'Result in 2_500 .. 4_250;

   --  Habilita/desabilita a alimentacao do sensor magnetostrutivo.
   --  Manter desligado quando fora da janela de medicao economiza ~3 mA.
   procedure Set_Sensor_Power (Enabled : Boolean);

end Hal_Power;
