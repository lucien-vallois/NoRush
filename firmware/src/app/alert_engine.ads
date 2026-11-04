--  Motor de alertas: gatilho por limiar com histerese e cooldown.
--
--  Modela exatamente a configuracao descrita em
--  docs/componentes/gateway-roteador-privado.md:
--
--      "threshold", "hysteresis", "cooldown"
--
--  Propriedade central (a razao de existir da histerese):
--
--      Clears  ==>  not Triggers
--
--  Ou seja, existe uma faixa morta entre o ponto de disparo e o ponto de
--  limpeza. Sem ela, um valor oscilando exatamente sobre o limiar faria o
--  alerta alternar Active/Normal a cada leitura (alert storm).
--
--  Unidade dos valores: a mesma do alerta (mm de nivel, % de bateria,
--  uS/cm de condutividade). O motor e' agnostico a unidade.

with Hal_Types;

package Alert_Engine with SPARK_Mode => On is

   subtype Threshold_Value is Natural range 0 .. 1_000_000;
   subtype Hysteresis_Value is Natural range 0 .. 100_000;
   subtype Cooldown_S is Natural range 0 .. 86_400;

   --  Rising: dispara quando o valor SOBE ate o limiar (nivel alto,
   --  temperatura alta). Falling: dispara quando o valor CAI ate o limiar
   --  (nivel baixo, bateria baixa).
   --
   --  Os tipos levam o prefixo Alert_ para nao colidir com os nomes dos
   --  componentes dos registros abaixo (Ada nao permite que o nome de um
   --  componente seja usado como tipo dentro da mesma declaracao).
   type Alert_Direction is (Rising, Falling);
   type Alert_Status is (Normal, Active);

   type Config is record
      Enabled    : Boolean         := True;
      Direction  : Alert_Direction := Rising;
      Threshold  : Threshold_Value := 0;
      Hysteresis : Hysteresis_Value := 0;
      Cooldown   : Cooldown_S      := 300;
   end record;

   type Alert_Data is record
      Status      : Alert_Status     := Normal;
      Last_Notify : Hal_Types.Millis := 0;
      Has_Notify  : Boolean          := False;
   end record;

   --  O valor dispara o alerta?
   function Triggers (Cfg : Config; Value : Threshold_Value) return Boolean
     is (case Cfg.Direction is
            when Rising  => Value >= Cfg.Threshold,
            when Falling => Value <= Cfg.Threshold);

   --  O valor limpa o alerta? A diferenca entre Triggers e Clears e' justa-
   --  mente a histerese: Clears implica not Triggers.
   function Clears (Cfg : Config; Value : Threshold_Value) return Boolean
     is (case Cfg.Direction is
            when Rising  => Value + Cfg.Hysteresis < Cfg.Threshold,
            when Falling => Value > Cfg.Threshold + Cfg.Hysteresis);

   --  Avalia uma leitura e decide se e' hora de notificar.
   --
   --  Should_Notify e' True quando:
   --    * o alerta acabou de se tornar ativo (transicao Normal -> Active), ou
   --    * o alerta ja' estava ativo e ja' decorreu o cooldown desde a ultima
   --      notificacao (evita repetir a cada minuto).
   procedure Eval
     (Cfg           : in     Config;
      Value         : in     Threshold_Value;
      Now           : in     Hal_Types.Millis;
      Data          : in out Alert_Data;
      Should_Notify :    out Boolean)
     with
       Post =>
         --  O estado obedece estritamente as regras de gatilho e histerese.
         (if Data'Old.Status = Normal then
             Data.Status = (if Triggers (Cfg, Value) then Active else Normal))
         and then
           (if Data'Old.Status = Active then
               Data.Status = (if Clears (Cfg, Value) then Normal else Active))
         and then
           --  Nunca notifica com o alerta inativo.
           (not Should_Notify or else Data.Status = Active)
         and then
           --  A saida de notificacao so' acontece quando o alerta esta ativo.
           (if Should_Notify then Data.Status = Active);

   type Kind is (Level_High, Level_Low, Battery_Low, Interface_Anomaly);

   type Config_Array is array (Kind) of Config;
   type Data_Array is array (Kind) of Alert_Data;

end Alert_Engine;
