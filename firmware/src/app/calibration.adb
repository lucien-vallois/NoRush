with Payload_Codec;

package body Calibration with SPARK_Mode => On is

   use type Hal_Types.Byte;

   Crc_Index : constant Hal_Types.Blob_Index := Hal_Types.Cal_Blob_Size - 1;

   function Apply (P : Params; Raw_Mm : Hal_Types.Position_Mm)
                   return Hal_Types.Position_Mm
   is
   begin
      if not P.Valid then
         return Raw_Mm;
      end if;

      declare
         V : constant Long_Long_Integer :=
           (Long_Long_Integer (Raw_Mm) * Long_Long_Integer (P.Gain_x1000))
             / 1_000
           + Long_Long_Integer (P.Offset_Mm);
      begin
         if V <= 0 then
            return 0;
         elsif V > Long_Long_Integer (Hal_Types.Position_Mm'Last) then
            return Hal_Types.Position_Mm'Last;
         else
            return Hal_Types.Position_Mm (V);
         end if;
      end;
   end Apply;

   function Serialize (P : Params) return Hal_Types.Cal_Blob is
      B : Hal_Types.Cal_Blob := (others => 0);

      --  Offset em complemento de dois de 16 bits.
      Off_U16 : constant Natural :=
        (if P.Offset_Mm >= 0 then P.Offset_Mm else P.Offset_Mm + 65_536);
      Gain    : constant Natural := P.Gain_x1000;
   begin
      B (0) := Hal_Types.Byte (Off_U16 / 256);
      B (1) := Hal_Types.Byte (Off_U16 mod 256);
      B (2) := Hal_Types.Byte (Gain / 256);
      B (3) := Hal_Types.Byte (Gain mod 256);
      B (4) := (if P.Valid then 1 else 0);
      B (Crc_Index) := Payload_Codec.Crc8 (B (0 .. Crc_Index - 1));
      return B;
   end Serialize;

   function Deserialize (B : Hal_Types.Cal_Blob) return Params_Option is
   begin
      if Payload_Codec.Crc8 (B (0 .. Crc_Index - 1)) /= B (Crc_Index) then
         return No_Params;
      end if;

      declare
         Off_U16 : constant Natural :=
           Natural (B (0)) * 256 + Natural (B (1));
         Gain    : constant Natural :=
           Natural (B (2)) * 256 + Natural (B (3));
         Offset  : constant Integer :=
           (if Off_U16 < 32_768 then Off_U16 else Off_U16 - 65_536);
      begin
         if Offset not in -5_000 .. 5_000 then
            return No_Params;
         end if;
         if Gain not in 500 .. 1_500 then
            return No_Params;
         end if;
         if Natural (B (4)) > 1 then
            return No_Params;
         end if;

         return
           (Present => True,
            Value   => (Offset_Mm  => Offset,
                        Gain_x1000 => Gain,
                        Valid      => B (4) = 1));
      end;
   end Deserialize;

end Calibration;
