with Sim_Control;

package body Hal_Clock with SPARK_Mode => Off is

   function Now return Hal_Types.Millis is
   begin
      return Sim_Control.Now;
   end Now;

   function Delay_Ms (Ms : Hal_Types.Millis) return Hal_Types.Millis is
   begin
      --  No simulador o tempo avanca instantaneamente.
      Sim_Control.Advance (Ms);
      return Ms;
   end Delay_Ms;

end Hal_Clock;
