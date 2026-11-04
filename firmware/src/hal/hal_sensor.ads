--  Sensores embarcados: posicao (magnetostrutiva), temperatura, condutividade.
--
--  BOUNDARY DE CONFIANCA (SPARK_Mode => Off) -- ver hal_clock.ads.

with Hal_Types;

package Hal_Sensor with SPARK_Mode => Off is

   --  Erro de leitura do barramento SSI/RS485 do sensor de posicao.
   type Read_Status is (Ok, Sensor_Fault, Sensor_Timeout, Out_Of_Range);

   --  Le a posicao do flutuador em milimetros.
   --  Saturado no subtipo Position_Mm (0..5000).
   procedure Read_Position (Pos : out Hal_Types.Position_Mm;
                            St  : out Read_Status)
     with Post => (if St = Ok then Pos in Hal_Types.Position_Mm);

   --  Temperatura do fluido em decimos de grau.
   procedure Read_Temperature (T  : out Hal_Types.Temp_DegC_x10;
                               St : out Read_Status);

   --  Condutividade (apenas Boia B). Em equipamento sem a celula, retorna
   --  Ok com 0 e a logica de interface trata como "nao aplicavel".
   procedure Read_Conductivity (C  : out Hal_Types.Conductivity_uS;
                                St : out Read_Status);

   --  Indica se este equipamento tem celula de condutividade.
   function Has_Conductivity_Cell return Boolean;

end Hal_Sensor;
