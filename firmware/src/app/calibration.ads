--  Calibracao do sensor de posicao: offset + ganho, com persistencia.
--
--  Procedimento documentado em docs/componentes/boia-a-oleo.md:
--    1. Posicionar a boia em posicao conhecida
--    2. Registrar o valor bruto do sensor
--    3. Calcular o offset de calibracao
--    4. Validar em multiplos pontos
--
--  O modelo e' de dois pontos (offset + ganho), suficiente para corrigir
--  deslocamento do zero e erro de escala do encodador. O ganho e' armazenado
--  em milissimos para evitar ponto-flutuante.
--
--  Serializacao (64 bytes, formato do Hal_Types.Cal_Blob):
--      0..1   offset_mm      i16 big-endian, complemento de dois
--      2..3   gain_x1000     u16 big-endian
--      4      valid          0 ou 1
--      5..62  reservado      zeros
--      63     crc8           CRC-8/ATM sobre os bytes 0..62

with Hal_Types;

package Calibration with SPARK_Mode => On is

   type Params is record
      Offset_Mm  : Integer range -5_000 .. 5_000 := 0;
      Gain_x1000 : Integer range 500 .. 1_500    := 1_000;
      Valid      : Boolean                       := False;
   end record;

   Default : constant Params :=
     (Offset_Mm => 0, Gain_x1000 => 1_000, Valid => False);

   type Params_Option (Present : Boolean := False) is record
      case Present is
         when True  => Value : Params;
         when False => null;
      end case;
   end record;

   No_Params : constant Params_Option := (Present => False);

   --  Aplica a calibracao ao valor bruto e satura em Position_Mm.
   --  Sem calibracao valida, o valor bruto atravessa sem alteracao.
   function Apply (P : Params; Raw_Mm : Hal_Types.Position_Mm)
                   return Hal_Types.Position_Mm
     with Post => (if not P.Valid then Apply'Result = Raw_Mm);

   --  Serializa para o bloco persistido.
   function Serialize (P : Params) return Hal_Types.Cal_Blob;

   --  Desserializa, validando CRC e faixas. Devolve No_Params quando o
   --  bloco esta corrompido ou fora de faixa.
   function Deserialize (B : Hal_Types.Cal_Blob) return Params_Option;

end Calibration;
