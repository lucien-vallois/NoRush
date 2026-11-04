with Sim_Control;

package body Hal_Sensor with SPARK_Mode => Off is

   function Has_Conductivity_Cell return Boolean is
   begin
      return Sim_Control.Has_Conductivity;
   end Has_Conductivity_Cell;

   procedure Read_Position (Pos : out Hal_Types.Position_Mm;
                            St  : out Read_Status) is
   begin
      if Sim_Control.Sensor_Fault then
         Pos := 0;
         St  := Sensor_Fault;
      else
         Pos := Sim_Control.Position_Mm;
         St  := Ok;
      end if;
   end Read_Position;

   procedure Read_Temperature (T  : out Hal_Types.Temp_DegC_x10;
                               St : out Read_Status) is
   begin
      if Sim_Control.Sensor_Fault then
         T  := 0;
         St := Sensor_Fault;
      else
         T  := Sim_Control.Temperature;
         St := Ok;
      end if;
   end Read_Temperature;

   procedure Read_Conductivity (C  : out Hal_Types.Conductivity_uS;
                                St : out Read_Status) is
   begin
      if Sim_Control.Sensor_Fault then
         C  := 0;
         St := Sensor_Fault;
      else
         C  := Sim_Control.Conductivity;
         St := Ok;
      end if;
   end Read_Conductivity;

end Hal_Sensor;
