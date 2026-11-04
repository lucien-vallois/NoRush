with Hal_Types;
with Payload_Codec;
with Test_Harness; use Test_Harness;

package body Test_Payload is

   use type Hal_Types.Byte;
   use Payload_Codec;

   subtype BA is Hal_Types.Byte_Array;

   Empty : constant BA (1 .. 0) := (others => 0);

   --  Vetores de ouro: saida real de Payload_Codec.Encode, fixada nos docs
   --  (docs/componentes/boia-a-oleo.md e boia-b-interface.md).
   --  Se estes bytes mudarem, os docs precisam mudar junto.

   Golden_A : constant BA (0 .. 11) :=
     (16#00#, 16#01#, 16#2A#, 16#01#,
      16#09#, 16#24#, 16#01#, 16#1D#,
      16#55#, 16#33#, 16#64#, 16#0D#);

   Golden_B : constant BA (0 .. 11) :=
     (16#00#, 16#02#, 16#17#, 16#09#,
      16#07#, 16#3A#, 16#01#, 16#0C#,
      16#4E#, 16#2F#, 16#5F#, 16#CA#);

   function Frame_A return Payload_Codec.Frame is
     (Device_Id  => 1,
      Seq        => 42,
      Flags      => (Calib_Valid  => True,
                     Alert_Active => False,
                     Battery_Low  => False,
                     Interface_Ok => False),
      Position   => 2340,
      Temp       => 285,
      Battery    => 85,
      Rssi       => (Known => True, Dbm => -78),
      Confidence => 100);

   function Frame_B return Payload_Codec.Frame is
     (Device_Id  => 2,
      Seq        => 23,
      Flags      => (Calib_Valid  => True,
                     Alert_Active => False,
                     Battery_Low  => False,
                     Interface_Ok => True),
      Position   => 1850,
      Temp       => 268,
      Battery    => 78,
      Rssi       => (Known => True, Dbm => -82),
      Confidence => 95);

   procedure Check_Bytes (Got      : Payload_Codec.Frame_Bytes;
                          Expected : BA;
                          Msg      : String)
   is
      Same : Boolean := True;
   begin
      for I in Expected'Range loop
         if Got (Got'First + (I - Expected'First)) /= Expected (I) then
            Same := False;
         end if;
      end loop;
      Check (Same, Msg);
   end Check_Bytes;

   procedure Run is
      Enc : Payload_Codec.Frame_Bytes;
      Dec : Payload_Codec.Frame_Option;
      Bad : BA (0 .. 11);
   begin
      Section ("payload_codec");

      --  Vetores de ouro ------------------------------------------------
      Enc := Payload_Codec.Encode (Frame_A);
      Check_Bytes (Enc, Golden_A, "vetor de ouro Boia A");
      Enc := Payload_Codec.Encode (Frame_B);
      Check_Bytes (Enc, Golden_B, "vetor de ouro Boia B");

      --  Round-trip ----------------------------------------------------
      Dec := Payload_Codec.Decode (Golden_A);
      Check (Dec.Present, "decode do vetor A: presente");
      if Dec.Present then
         Check (Dec.Value = Frame_A, "decode do vetor A = frame original");
      end if;

      Dec := Payload_Codec.Decode (Golden_B);
      Check (Dec.Present, "decode do vetor B: presente");
      if Dec.Present then
         Check (Dec.Value = Frame_B, "decode do vetor B = frame original");
      end if;

      --  Comprimento incorreto -----------------------------------------
      Dec := Payload_Codec.Decode (BA'(0 .. 10 => 0));
      Check (not Dec.Present, "11 bytes rejeitado");
      Dec := Payload_Codec.Decode (BA'(0 .. 12 => 0));
      Check (not Dec.Present, "13 bytes rejeitado");
      Dec := Payload_Codec.Decode (Empty);
      Check (not Dec.Present, "0 bytes rejeitado");

      --  CRC incorreto -------------------------------------------------
      Bad := Golden_A;
      Bad (11) := Bad (11) xor 16#FF#;
      Dec := Payload_Codec.Decode (Bad);
      Check (not Dec.Present, "CRC corrompido rejeitado");

      Bad := Golden_A;
      Bad (5) := Bad (5) xor 16#01#;   --  muda posicao, CRC nao fecha
      Dec := Payload_Codec.Decode (Bad);
      Check (not Dec.Present, "dado corrompido com CRC invalido rejeitado");

      --  Campos fora de faixa ------------------------------------------
      --  position = 5001 (> Position_Mm'Last)
      Bad := Golden_A;
      Bad (4) := 16#13#;               --  0x1389 = 5001
      Bad (5) := 16#89#;
      Bad (11) := Payload_Codec.Crc8 (Bad (0 .. 10));
      Dec := Payload_Codec.Decode (Bad);
      Check (not Dec.Present, "position 5001 rejeitado");

      --  battery = 200 (> 100)
      Bad := Golden_A;
      Bad (8) := 200;
      Bad (11) := Payload_Codec.Crc8 (Bad (0 .. 10));
      Dec := Payload_Codec.Decode (Bad);
      Check (not Dec.Present, "battery 200 rejeitado");

      --  rssi_enc = 200 (fora de 0..129)
      Bad := Golden_A;
      Bad (9) := 200;
      Bad (11) := Payload_Codec.Crc8 (Bad (0 .. 10));
      Dec := Payload_Codec.Decode (Bad);
      Check (not Dec.Present, "rssi_enc 200 rejeitado");

      --  Temperatura fora de faixa: -30,0 oC -> 65236 em u16
      Bad := Golden_A;
      Bad (6) := 16#FF#;
      Bad (7) := 16#38#;
      Bad (11) := Payload_Codec.Crc8 (Bad (0 .. 10));
      Dec := Payload_Codec.Decode (Bad);
      Check (not Dec.Present, "temp -30.0 oC rejeitada");

      --  Temperatura negativa valida: -10,0 oC -> 65436 -> FF 9C
      declare
         F : Payload_Codec.Frame := Frame_A;
      begin
         F.Temp := -100;
         Enc := Payload_Codec.Encode (F);
         Dec := Payload_Codec.Decode (Enc);
         Check (Dec.Present, "temp -10.0 oC aceita");
         if Dec.Present then
            Check_Eq (Dec.Value.Temp, -100, "temp -10.0 oC round-trip");
         end if;
      end;

      --  RSSI desconhecido ---------------------------------------------
      declare
         F : Payload_Codec.Frame := Frame_A;
      begin
         F.Rssi := Hal_Types.Rssi_Unknown;
         Enc := Payload_Codec.Encode (F);
         Check (Enc (9) = 0, "rssi desconhecido codifica como byte 0");
         Dec := Payload_Codec.Decode (Enc);
         Check (Dec.Present, "frame com rssi desconhecido decodifica");
         if Dec.Present then
            Check (not Dec.Value.Rssi.Known, "rssi permanece desconhecido");
         end if;
      end;

      --  Bits de flags -------------------------------------------------
      declare
         F : Payload_Codec.Frame := Frame_A;
      begin
         F.Flags := (Calib_Valid  => True,
                     Alert_Active => True,
                     Battery_Low  => True,
                     Interface_Ok => True);
         Enc := Payload_Codec.Encode (F);
         Check (Enc (3) = 16#0F#, "4 bits de flags mapeados em 0x0F");
         Dec := Payload_Codec.Decode (Enc);
         Check (Dec.Present, "flags 0x0F decodifica");
         if Dec.Present then
            Check (Dec.Value.Flags.Calib_Valid  and then
                   Dec.Value.Flags.Alert_Active and then
                   Dec.Value.Flags.Battery_Low  and then
                   Dec.Value.Flags.Interface_Ok,
                   "4 bits de flags preservados");
         end if;
      end;

      --  Bits reservados sao ignorados (nao causam rejeicao) -----------
      Bad := Golden_A;
      Bad (3) := 16#F1#;               --  bit 0 + bits 4..7
      Bad (11) := Payload_Codec.Crc8 (Bad (0 .. 10));
      Dec := Payload_Codec.Decode (Bad);
      Check (Dec.Present, "bits reservados nao causam rejeicao");
      if Dec.Present then
         Check (Dec.Value.Flags.Calib_Valid, "bit 0 preservado com reservados");
      end if;

      --  Limite DR0 ----------------------------------------------------
      Check (Payload_Codec.Fits_Dr0 (Payload_Codec.Frame_Size),
             "frame de 12 bytes cabe em DR0 (limite 19)");
      Check (not Payload_Codec.Fits_Dr0 (20),
             "20 bytes nao cabem em DR0");
   end Run;

end Test_Payload;
