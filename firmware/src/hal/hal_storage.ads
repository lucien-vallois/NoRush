--  Persistencia nao-volatil (flash interna / EEPROM) para calibracao.
--
--  BOUNDARY DE CONFIANCA (SPARK_Mode => Off) -- ver hal_clock.ads.

with Hal_Types;

package Hal_Storage with SPARK_Mode => Off is

   --  Bloco de calibracao serializado. O formato e' definido por
   --  Calibration.Serialize (src/app/calibration.ads).
   subtype Cal_Blob is Hal_Types.Cal_Blob;
   Empty_Blob : constant Cal_Blob := Hal_Types.Empty_Blob;

   --  Le o bloco de calibracao gravado. Valid = False quando a regiao esta
   --  apagada, corrompida ou o checksum nao fecha.
   procedure Load (Data : out Cal_Blob; Valid : out Boolean);

   --  Grava o bloco de calibracao. Ok = False quando a escrita falha
   --  (flash protegida, fim de vida de ciclos, etc).
   procedure Save (Data : in     Cal_Blob; Ok : out Boolean);

   --  Apaga o bloco de calibracao (retorna ao estado de fabrica).
   procedure Erase (Ok : out Boolean);

end Hal_Storage;
