with Hal_Types;
with Alert_Engine;
with Test_Harness; use Test_Harness;

package body Test_Alerts is

   use Alert_Engine;

   Cfg : constant Config :=
     (Enabled    => True,
      Direction  => Rising,
      Threshold  => 100,
      Hysteresis => 10,
      Cooldown   => 5);

   Cfg_Off : constant Config :=
     (Enabled    => False,
      Direction  => Rising,
      Threshold  => 100,
      Hysteresis => 10,
      Cooldown   => 5);

   Cfg_Fall : constant Config :=
     (Enabled    => True,
      Direction  => Falling,
      Threshold  => 20,
      Hysteresis => 5,
      Cooldown   => 5);

   procedure Run is
      D      : Alert_Data;
      Notify : Boolean;
      Flips  : Natural := 0;
      Prev   : Alert_Status := Normal;
   begin
      Section ("alert_engine");

      --  Gatilho ------------------------------------------------------
      D := (Status => Normal, Last_Notify => 0, Has_Notify => False);
      Eval (Cfg, 99, 0, D, Notify);
      Check (D.Status = Normal, "99 < 100: permanece Normal");
      Check (not Notify, "99 < 100: nao notifica");

      Eval (Cfg, 100, 0, D, Notify);
      Check (D.Status = Active, "100 >= 100: dispara");
      Check (Notify, "transicao Normal->Active notifica");

      --  Histerese: nao desativa dentro da faixa morta ----------------
      Eval (Cfg, 95, 1_000, D, Notify);
      Check (D.Status = Active,
             "95 esta na faixa de histerese (95+10 >= 100): continua Active");
      Check (not Notify, "sem notificacao dentro do cooldown");

      --  Limpeza so' abaixo de threshold - hysteresis -----------------
      Eval (Cfg, 89, 2_000, D, Notify);
      Check (D.Status = Normal, "89 (89+10 < 100): limpa o alerta");
      Check (not Notify, "transicao Active->Normal nao notifica");

      --  Cooldown ----------------------------------------------------
      D := (Status => Normal, Last_Notify => 0, Has_Notify => False);
      Eval (Cfg, 150, 0, D, Notify);
      Check (Notify, "disparo inicial notifica");
      Eval (Cfg, 150, 4_999, D, Notify);
      Check (not Notify, "4999 ms < cooldown de 5000 ms: nao repete");
      Eval (Cfg, 150, 5_000, D, Notify);
      Check (Notify, "5000 ms >= cooldown: repete a notificacao");

      --  Anti-oscilacao ----------------------------------------------
      --  Partindo de um alerta ja' ativo, um valor alternando sobre a
      --  fronteira da histerese nao pode causar alert storm.
      D := (Status => Normal, Last_Notify => 0, Has_Notify => False);
      Eval (Cfg, 100, 0, D, Notify);
      Prev := D.Status;
      Flips := 0;
      for I in 1 .. 200 loop
         declare
            V : constant Threshold_Value :=
              (if I mod 2 = 0 then 100 else 95);
         begin
            Eval (Cfg, V, Hal_Types.Millis (I * 100), D, Notify);
            if D.Status /= Prev then
               Flips := Flips + 1;
               Prev := D.Status;
            end if;
         end;
      end loop;
      Check (Flips = 0,
             "alternancia 100/95 nao causa troca de estado (histerese)");

      --  Configuracao desabilitada nunca notifica ---------------------
      D := (Status => Normal, Last_Notify => 0, Has_Notify => False);
      Eval (Cfg_Off, 500, 0, D, Notify);
      Check (not Notify, "alerta desabilitado nao notifica");

      --  Direcao Falling ----------------------------------------------
      D := (Status => Normal, Last_Notify => 0, Has_Notify => False);
      Eval (Cfg_Fall, 25, 0, D, Notify);
      Check (D.Status = Normal, "Falling: 25 > 20 nao dispara");
      Eval (Cfg_Fall, 20, 0, D, Notify);
      Check (D.Status = Active, "Falling: 20 <= 20 dispara");
      Check (Notify, "Falling: transicao notifica");
      Eval (Cfg_Fall, 23, 1_000, D, Notify);
      Check (D.Status = Active,
             "Falling: 23 (23 <= 20+5) esta na histerese");
      Eval (Cfg_Fall, 26, 2_000, D, Notify);
      Check (D.Status = Normal, "Falling: 26 > 20+5 limpa");

      --  Propriedade formal: Clears implica not Triggers --------------
      declare
         Ok : Boolean := True;
      begin
         for V in 0 .. 300 loop
            if Clears (Cfg, V) and then Triggers (Cfg, V) then
               Ok := False;
            end if;
            if Clears (Cfg_Fall, V) and then Triggers (Cfg_Fall, V) then
               Ok := False;
            end if;
         end loop;
         Check (Ok, "Clears implica not Triggers em todo o range");
      end;
   end Run;

end Test_Alerts;
