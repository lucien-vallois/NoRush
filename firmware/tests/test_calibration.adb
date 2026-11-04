with Hal_Types;
with Payload_Codec;
with Calibration;
with Test_Harness; use Test_Harness;

package body Test_Calibration is

   use type Hal_Types.Byte;
   use Calibration;

   procedure Run is
      P    : Params;
      B    : Hal_Types.Cal_Blob;
      Opt  : Params_Option;
   begin
      Section ("calibration");

      --  Sem calibracao valida, o valor bruto atravessa intacto --------
      P := Default;
      Check (not P.Valid, "Default e' invalido (fabrica)");
      Check_Eq_N (Apply (P, 2340), 2340, "sem calibracao: identidade");

      --  Calibracao identidade ----------------------------------------
      P := (Offset_Mm => 0, Gain_x1000 => 1_000, Valid => True);
      Check_Eq_N (Apply (P, 2340), 2340, "ganho 1.0 offset 0: identidade");

      --  Apenas offset ------------------------------------------------
      P := (Offset_Mm => 100, Gain_x1000 => 1_000, Valid => True);
      Check_Eq_N (Apply (P, 2340), 2440, "offset +100");

      P := (Offset_Mm => -200, Gain_x1000 => 1_000, Valid => True);
      Check_Eq_N (Apply (P, 100), 0, "offset -200 satura em 0");

      --  Apenas ganho -------------------------------------------------
      P := (Offset_Mm => 0, Gain_x1000 => 1_500, Valid => True);
      Check_Eq_N (Apply (P, 2340), 3510, "ganho 1.5 sobre 2340 = 3510");

      P := (Offset_Mm => 0, Gain_x1000 => 500, Valid => True);
      Check_Eq_N (Apply (P, 2340), 1170, "ganho 0.5 sobre 2340 = 1170");

      --  Saturacao no topo --------------------------------------------
      P := (Offset_Mm => 0, Gain_x1000 => 1_500, Valid => True);
      Check_Eq_N (Apply (P, 4000), Hal_Types.Position_Mm'Last,
                  "ganho 1.5 sobre 4000 satura em 5000");

      --  Serializacao: round-trip ------------------------------------
      P := (Offset_Mm => -300, Gain_x1000 => 1_250, Valid => True);
      B := Serialize (P);
      Opt := Deserialize (B);
      Check (Opt.Present, "round-trip de serializacao: presente");
      if Opt.Present then
         Check_Eq (Opt.Value.Offset_Mm, -300, "offset -300 preservado");
         Check_Eq_N (Opt.Value.Gain_x1000, 1_250, "ganho 1250 preservado");
         Check (Opt.Value.Valid, "flag Valid preservada");
      end if;

      --  Sem CRC correto, o bloco e' descartado ----------------------
      B := Serialize (P);
      B (Hal_Types.Cal_Blob_Size - 1) :=
        B (Hal_Types.Cal_Blob_Size - 1) xor 16#FF#;
      Opt := Deserialize (B);
      Check (not Opt.Present, "CRC corrompido descarta o bloco");

      B := Serialize (P);
      B (2) := 16#FF#;                  --  muda o ganho, CRC nao fecha
      Opt := Deserialize (B);
      Check (not Opt.Present, "ganho alterado invalida o bloco");

      --  Ganho fora de faixa, mesmo com CRC correto -------------------
      B := (others => 0);
      B (0) := 0;                       --  offset = 0
      B (1) := 0;
      B (2) := 0;                       --  ganho = 100 (abaixo de 500)
      B (3) := 100;
      B (4) := 1;                       --  valid
      B (Hal_Types.Cal_Blob_Size - 1) :=
        Payload_Codec.Crc8 (B (0 .. Hal_Types.Cal_Blob_Size - 2));
      Opt := Deserialize (B);
      Check (not Opt.Present, "ganho 100 fora de faixa e' rejeitado");

      --  Offset fora de faixa ----------------------------------------
      B := (others => 0);
      B (0) := 16#27#;                  --  10000 em u16, acima de 5000
      B (1) := 16#10#;
      B (2) := 16#03#;                  --  ganho 1000
      B (3) := 16#E8#;
      B (4) := 1;
      B (Hal_Types.Cal_Blob_Size - 1) :=
        Payload_Codec.Crc8 (B (0 .. Hal_Types.Cal_Blob_Size - 2));
      Opt := Deserialize (B);
      Check (not Opt.Present, "offset 10000 fora de faixa e' rejeitado");

      --  Flag Valid fora de {0,1} ------------------------------------
      B := Serialize (Default);
      B (4) := 2;
      B (Hal_Types.Cal_Blob_Size - 1) :=
        Payload_Codec.Crc8 (B (0 .. Hal_Types.Cal_Blob_Size - 2));
      Opt := Deserialize (B);
      Check (not Opt.Present, "flag Valid = 2 e' rejeitada");

      --  Formato do bloco: offsets fixos -----------------------------
      P := (Offset_Mm => 0, Gain_x1000 => 1_000, Valid => True);
      B := Serialize (P);
      Check (B (0) = 0 and B (1) = 0, "offset ocupa os bytes 0..1");
      Check (B (2) = 3 and B (3) = 232, "ganho 1000 = 0x03E8 em 2..3");
      Check (B (4) = 1, "flag Valid no byte 4");
   end Run;

end Test_Calibration;
