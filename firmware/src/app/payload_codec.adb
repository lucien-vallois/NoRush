package body Payload_Codec with SPARK_Mode => On is

   use type Hal_Types.Device_Id;

   --  ---------------------------------------------------------------------------
   --  CRC-8/ATM
   --  ---------------------------------------------------------------------------

   function Crc8 (Data : Hal_Types.Byte_Array) return Hal_Types.Byte is
      Crc : Hal_Types.Byte := 0;
   begin
      for I in Data'Range loop
         Crc := Crc xor Data (I);
         for Bit_N in 1 .. 8 loop
            --  Desloca 1 bit para a esquerda descartando o MSB, e aplica o
            --  polinomio quando o bit descartado era 1.
            if (Crc and 16#80#) /= 0 then
               Crc := ((Crc and 16#7F#) * 2) xor 16#07#;
            else
               Crc := (Crc and 16#7F#) * 2;
            end if;
         end loop;
      end loop;
      return Crc;
   end Crc8;

   --  ---------------------------------------------------------------------------
   --  Codificacao
   --  ---------------------------------------------------------------------------

   function Encode (F : Frame) return Frame_Bytes is
      B : Frame_Bytes := (others => 0);

      --  Campo de temperatura em complemento de dois de 16 bits (big-endian).
      --  A faixa declarada (-100 .. 600) cabe em i16 sem ambiguidade.
      Temp_U16 : constant Natural :=
        (if F.Temp >= 0 then F.Temp else F.Temp + 65536);

      --  RSSI: byte 0 = desconhecido; senao Dbm + 129 (resulta 1 .. 129).
      Rssi_U8 : constant Hal_Types.Byte :=
        (if F.Rssi.Known
         then Hal_Types.Byte (F.Rssi.Dbm + 129)
         else 0);

      Flags_U8 : constant Hal_Types.Byte :=
        (if F.Flags.Calib_Valid  then 1 else 0)
        or (if F.Flags.Alert_Active then 2 else 0)
        or (if F.Flags.Battery_Low  then 4 else 0)
        or (if F.Flags.Interface_Ok then 8 else 0);
   begin
      B (0)  := Hal_Types.Byte (F.Device_Id / 256);
      B (1)  := Hal_Types.Byte (F.Device_Id mod 256);
      B (2)  := Hal_Types.Byte (F.Seq);
      B (3)  := Flags_U8;
      B (4)  := Hal_Types.Byte (F.Position / 256);
      B (5)  := Hal_Types.Byte (F.Position mod 256);
      B (6)  := Hal_Types.Byte (Temp_U16 / 256);
      B (7)  := Hal_Types.Byte (Temp_U16 mod 256);
      B (8)  := Hal_Types.Byte (F.Battery);
      B (9)  := Rssi_U8;
      B (10) := Hal_Types.Byte (F.Confidence);
      B (11) := Crc8 (B (0 .. 10));
      return B;
   end Encode;

   --  ---------------------------------------------------------------------------
   --  Decodificacao
   --  ---------------------------------------------------------------------------

   function Decode (Raw : Hal_Types.Byte_Array) return Frame_Option is
      B : Frame_Bytes := (others => 0);
   begin
      --  Comprimento errado e' a causa mais comum de frame invalido (corte
      --  na recepcao, ou pacote que nao e' nosso). Tratado antes de indexar.
      if Raw'Length /= Frame_Size then
         return No_Frame;
      end if;

      --  Copia para indice local 0 .. 11. Como Raw'Length = 12 (verificado
      --  acima), vale Raw'First + K <= Raw'First + 11 = Raw'Last para todo
      --  K em Frame_Index.
      for K in Frame_Index loop
         B (K) := Raw (Raw'First + K);
      end loop;

      --  Integridade: CRC sobre os 11 primeiros bytes.
      if Crc8 (B (0 .. 10)) /= B (11) then
         return No_Frame;
      end if;

      --  Campos com faixa restrita: o fio carrega tipos de 8/16 bits, mas o
      --  dominio e' menor. Fora de faixa = frame corrompido.
      declare
         Pos_U16  : constant Natural :=
           Natural (B (4)) * 256 + Natural (B (5));
         Temp_U16 : constant Natural :=
           Natural (B (6)) * 256 + Natural (B (7));
      begin
         if Pos_U16 > Hal_Types.Position_Mm'Last then
            return No_Frame;
         end if;
         if Natural (B (8)) > Hal_Types.Battery_Pct'Last then
            return No_Frame;
         end if;
         if Natural (B (10)) > Hal_Types.Confidence_Pct'Last then
            return No_Frame;
         end if;

         declare
            Temp_Signed : constant Integer :=
              (if Temp_U16 < 32768 then Temp_U16 else Temp_U16 - 65536);
            Rssi : Hal_Types.Rssi_Reading;
         begin
            if Temp_Signed not in Hal_Types.Temp_DegC_x10 then
               return No_Frame;
            end if;

            --  Byte 9: 0 = desconhecido, 1 .. 129 = Dbm + 129, resto invalido.
            if Natural (B (9)) = 0 then
               Rssi := Hal_Types.Rssi_Unknown;
            elsif Natural (B (9)) <= 129 then
               Rssi := (Known => True,
                        Dbm   => Integer (B (9)) - 129);
            else
               return No_Frame;
            end if;

            return
              (Present => True,
               Value   =>
                 (Device_Id  => Hal_Types.Device_Id (B (0)) * 256
                                + Hal_Types.Device_Id (B (1)),
                  Seq        => Hal_Types.Seq_Number (B (2)),
                  Flags      =>
                    (Calib_Valid  => (B (3) and 1) /= 0,
                     Alert_Active => (B (3) and 2) /= 0,
                     Battery_Low  => (B (3) and 4) /= 0,
                     Interface_Ok => (B (3) and 8) /= 0),
                  Position   => Pos_U16,
                  Temp       => Temp_Signed,
                  Battery    => Natural (B (8)),
                  Rssi       => Rssi,
                  Confidence => Natural (B (10))));
         end;
      end;
   end Decode;

end Payload_Codec;
