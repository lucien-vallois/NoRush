with Sim_Control;

package body Hal_Power with SPARK_Mode => Off is

   procedure Enter_Sleep (Mode : Sleep_Mode) is
      pragma Unreferenced (Mode);
   begin
      --  No simulador o sono e' instantaneo: o tempo e' controlado pelo
      --  chamador via Hal_Clock.Delay_Ms.
      null;
   end Enter_Sleep;

   function Read_Battery return Hal_Types.Battery_Pct is
   begin
      return Sim_Control.Battery;
   end Read_Battery;

   function Read_Vbat_Mv return Natural is
   begin
      return Sim_Control.Vbat_Mv;
   end Read_Vbat_Mv;

   procedure Set_Sensor_Power (Enabled : Boolean) is
      pragma Unreferenced (Enabled);
   begin
      null;
   end Set_Sensor_Power;

end Hal_Power;
