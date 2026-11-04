--  Tipos de dominio compartilhados entre a logica (SPARK) e o hardware.
--
--  Regra: todos os valores sao inteiros com FAIXA EXPLICITA. Nao ha tipos
--  ponto-flutuante neste nivel -- isso torna os contratos verificaveis e
--  elimina erro de arredondamento no alvo.

package Hal_Types with SPARK_Mode => On is
   pragma Pure;

   --  Posicao do flutuador em milimetros (0 = zero mecanico do sensor).
   subtype Position_Mm is Natural range 0 .. 5000;

   --  Temperatura em decimos de grau Celsius (285 = 28,5 oC).
   subtype Temp_DegC_x10 is Integer range -100 .. 600;

   --  Carga estimada da bateria.
   subtype Battery_Pct is Natural range 0 .. 100;

   --  Sinal recebido (informacional). 0 dBm e' o maximo fisico plausivel.
   subtype Rssi_Value is Integer range -128 .. 0;

   --  Score de confianca da deteccao de interface (100 = nao aplicavel).
   subtype Confidence_Pct is Natural range 0 .. 100;

   --  Condutividade eletrica em microsiemens por centimetro.
   subtype Conductivity_uS is Natural range 0 .. 2000;

   --  Identificador logico do dispositivo.
   type Device_Id is mod 65536;

   --  Contador de uplink (reinicia em 255 -> 0).
   type Seq_Number is mod 256;

   --  Tempo decorrido desde o boot, em milissegundos.
   --  Modular de 32 bits: reinicia a ~49,7 dias. A subtracao modular
   --  produz o intervalo correto mesmo apos o reinicio do contador.
   type Millis is mod 2 ** 32;

   type Byte is mod 256;
   type Byte_Array is array (Natural range <>) of Byte;

   --  O no nao mede o proprio sinal: o RSSI pode ser desconhecido.
   --  A faixa de Dbm ja garante Dbm <= 0.
   type Rssi_Reading is record
      Known : Boolean    := False;
      Dbm   : Rssi_Value := 0;
   end record;

   Rssi_Unknown : constant Rssi_Reading := (Known => False, Dbm => 0);

   --  Bloco de calibracao persistido em flash. O formato interno e'
   --  definido por Calibration.Serialize (src/app/calibration.ads).
   --  Mesmo tipo de Byte_Array para que fatias possam ser passadas
   --  diretamente para Payload_Codec.Crc8.
   Cal_Blob_Size : constant := 64;
   subtype Blob_Index is Natural range 0 .. Cal_Blob_Size - 1;
   subtype Cal_Blob is Byte_Array (Blob_Index);
   Empty_Blob : constant Cal_Blob := (others => 0);

end Hal_Types;
