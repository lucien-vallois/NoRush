package body Alert_Engine with SPARK_Mode => On is

   use type Hal_Types.Millis;

   procedure Eval
     (Cfg           : in     Config;
      Value         : in     Threshold_Value;
      Now           : in     Hal_Types.Millis;
      Data          : in out Alert_Data;
      Should_Notify :    out Boolean)
   is
      Prev : constant Alert_Status := Data.Status;
   begin
      --  Transicao de estado. A histerese esta embutida em Clears: quando o
      --  valor esta na faixa entre Clears e Triggers, o estado nao muda.
      if Prev = Normal then
         Data.Status := (if Triggers (Cfg, Value) then Active else Normal);
      else
         Data.Status := (if Clears (Cfg, Value) then Normal else Active);
      end if;

      --  Decisao de notificacao.
      if Data.Status /= Active or else not Cfg.Enabled then
         Should_Notify := False;

      elsif Prev = Normal then
         --  Acabou de disparar: notificar sempre.
         Should_Notify := True;
         Data.Last_Notify := Now;
         Data.Has_Notify  := True;

      elsif not Data.Has_Notify then
         --  Estado ativo mas sem notificacao registrada (primeiro ciclo
         --  apos um reset do dispositivo).
         Should_Notify := True;
         Data.Last_Notify := Now;
         Data.Has_Notify  := True;

      else
         --  Ja' ativo e ja' notificado: so' repetir apos o cooldown.
         declare
            Elapsed : constant Hal_Types.Millis := Now - Data.Last_Notify;
            Gap     : constant Hal_Types.Millis :=
              Hal_Types.Millis (Cfg.Cooldown) * 1000;
         begin
            Should_Notify := Elapsed >= Gap;
            if Should_Notify then
               Data.Last_Notify := Now;
            end if;
         end;
      end if;
   end Eval;

end Alert_Engine;
