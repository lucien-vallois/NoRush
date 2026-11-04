--  Codificacao / decodificacao do frame binario de uplink LoRaWAN.
--
--  Especificacao completa: firmware/docs/payload.md
--
--  Por que binario: o payload de aplicacao do LoRaWAN em DR0 (SF10BW125)
--  e' limitado a 19 bytes. O frame abaixo tem 12 bytes. Um payload JSON
--  equivalente teria ~180 bytes.
--
--  Este pacote e' a FONTE DE VERDADE do formato. Qualquer reimplantacao
--  (Python no gateway, C no backend) deve ser coberta pelos mesmos casos de
--  teste em tests/test_payload.adb.

with Hal_Types;

package Payload_Codec with SPARK_Mode => On is

   use type Hal_Types.Byte;

   Frame_Size : constant := 12;

   --  Maior payload de aplicacao aceito em DR0 (SF10BW125).
   Max_Dr0_Payload : constant := 19;

   subtype Frame_Index is Natural range 0 .. Frame_Size - 1;

   --  Mesmo tipo de Hal_Types.Byte_Array, com indice fixo 0 .. 11. Isso
   --  permite passar fatias diretamente para Crc8.
   subtype Frame_Bytes is Hal_Types.Byte_Array (Frame_Index);

   --  Bits do byte 3.
   type Flag_Set is record
      Calib_Valid  : Boolean := False;
      Alert_Active : Boolean := False;
      Battery_Low  : Boolean := False;
      Interface_Ok : Boolean := False;
   end record;

   type Frame is record
      Device_Id  : Hal_Types.Device_Id     := 0;
      Seq        : Hal_Types.Seq_Number    := 0;
      Flags      : Flag_Set                := (others => False);
      Position   : Hal_Types.Position_Mm   := 0;
      Temp       : Hal_Types.Temp_DegC_x10 := 0;
      Battery    : Hal_Types.Battery_Pct   := 0;
      Rssi       : Hal_Types.Rssi_Reading  := Hal_Types.Rssi_Unknown;
      Confidence : Hal_Types.Confidence_Pct := 100;
   end record;

   type Frame_Option (Present : Boolean := False) is record
      case Present is
         when True  => Value : Frame;
         when False => null;
      end case;
   end record;

   No_Frame : constant Frame_Option := (Present => False);

   --  CRC-8/ATM: polinomio 0x07, init 0x00, sem reflexao, sem xorout.
   function Crc8 (Data : Hal_Types.Byte_Array) return Hal_Types.Byte
     with Post => (if Data'Length = 0 then Crc8'Result = 0);

   --  Serializa o frame. Devolve sempre exatamente Frame_Size bytes.
   function Encode (F : Frame) return Frame_Bytes;

   --  Desserializa. Devolve No_Frame quando o comprimento nao e' Frame_Size,
   --  quando o CRC nao fecha ou quando algum campo esta fora de faixa.
   function Decode (Raw : Hal_Types.Byte_Array) return Frame_Option
     with Post =>
       (if Decode'Result.Present then Raw'Length = Frame_Size);

   --  O frame cabe como payload de aplicacao em DR0?
   function Fits_Dr0 (N : Natural) return Boolean
     is (N <= Max_Dr0_Payload);

end Payload_Codec;
