package body Sim_Control with SPARK_Mode => Off is

   Clock : Hal_Types.Millis := 0;

   function Now return Hal_Types.Millis is
   begin
      return Clock;
   end Now;

   procedure Advance (Ms : Hal_Types.Millis) is
   begin
      Clock := Clock + Ms;
   end Advance;

   procedure Reset is
   begin
      Clock            := 0;
      Position_Mm      := 0;
      Temperature      := 200;
      Conductivity     := 0;
      Has_Conductivity := False;
      Sensor_Fault     := False;
      Battery          := 100;
      Vbat_Mv          := 3_900;
      Joined           := True;
      Tx_Allowed       := True;
      Last_Port        := 1;
      Last_Payload_Len := 0;
      Last_Payload     := (others => 0);
      Stored           := Hal_Types.Empty_Blob;
      Stored_Valid     := False;
      Write_Fails      := False;
   end Reset;

end Sim_Control;
