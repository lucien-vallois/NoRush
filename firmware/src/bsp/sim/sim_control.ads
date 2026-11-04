--  Estado do simulador de hardware (build host).
--
--  Este pacote so' existe no BSP de simulacao. Ele permite aos testes
--  injetar leituras de sensor, nivel de bateria, estado do radio e
--  conteudo da flash, de modo que a logica de aplicacao possa ser exercida
--  de ponta a ponta sem hardware.

with Hal_Types;

package Sim_Control with SPARK_Mode => Off is

   --  Sensor
   Position_Mm      : Hal_Types.Position_Mm    := 0;
   Temperature      : Hal_Types.Temp_DegC_x10  := 200;
   Conductivity     : Hal_Types.Conductivity_uS := 0;
   Has_Conductivity : Boolean := False;
   Sensor_Fault     : Boolean := False;

   --  Bateria
   Battery : Hal_Types.Battery_Pct          := 100;
   Vbat_Mv : Natural range 2_500 .. 4_250   := 3_900;

   --  Radio
   Joined           : Boolean := True;
   Tx_Allowed       : Boolean := True;
   Last_Port        : Hal_Types.Byte := 1;
   Last_Payload_Len : Natural := 0;
   Last_Payload     : Hal_Types.Byte_Array (0 .. 50) := (others => 0);

   --  Flash de calibracao
   Stored       : Hal_Types.Cal_Blob := Hal_Types.Empty_Blob;
   Stored_Valid : Boolean := False;
   Write_Fails  : Boolean := False;

   --  Relogio simulado
   function Now return Hal_Types.Millis;
   procedure Advance (Ms : Hal_Types.Millis);

   --  Volta todo o estado simulado aos valores padrao.
   procedure Reset;

end Sim_Control;
