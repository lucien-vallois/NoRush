--  Estado do dispositivo e montagem do frame de telemetria.
--
--  Mantido separado do Payload_Codec de proposito: o codec conhece o
--  formato do fio, este pacote conhece o ESTADO do no. Assim o codec nao
--  precisa saber nada sobre sensores, bateria ou alertas.

with Hal_Types;
with Payload_Codec;

package Device_State with SPARK_Mode => On is

   --  Abaixo deste percentual o bit "bateria baixa" e' sinalizado no frame.
   Battery_Low_Threshold : constant := 20;

   function Is_Battery_Low (B : Hal_Types.Battery_Pct) return Boolean
     is (B <= Battery_Low_Threshold);

   type Snapshot is record
      Device_Id    : Hal_Types.Device_Id      := 0;
      Seq          : Hal_Types.Seq_Number     := 0;
      Position     : Hal_Types.Position_Mm    := 0;
      Temp         : Hal_Types.Temp_DegC_x10  := 0;
      Battery      : Hal_Types.Battery_Pct    := 0;
      Rssi         : Hal_Types.Rssi_Reading   := Hal_Types.Rssi_Unknown;
      Confidence   : Hal_Types.Confidence_Pct := 100;
      Calib_Valid  : Boolean := False;
      Alert_Active : Boolean := False;
      Interface_Ok : Boolean := False;
   end record;

   --  Monta o frame de telemetria. O bit de bateria baixa e' derivado do
   --  valor medido, nao pode ser definido livremente pelo chamador.
   function Build (S : Snapshot) return Payload_Codec.Frame
     with Post =>
       Build'Result.Battery = S.Battery
       and then Build'Result.Flags.Battery_Low = Is_Battery_Low (S.Battery)
       and then Build'Result.Flags.Calib_Valid = S.Calib_Valid
       and then Build'Result.Position = S.Position;

   --  Avanca o contador de uplink (reinicia em 255 -> 0).
   function Next_Seq (S : Hal_Types.Seq_Number) return Hal_Types.Seq_Number
     is (S + 1);

end Device_State;
