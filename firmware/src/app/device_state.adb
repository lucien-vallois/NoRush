package body Device_State with SPARK_Mode => On is

   function Build (S : Snapshot) return Payload_Codec.Frame is
     (Device_Id  => S.Device_Id,
      Seq        => S.Seq,
      Flags      =>
        (Calib_Valid  => S.Calib_Valid,
         Alert_Active => S.Alert_Active,
         Battery_Low  => Is_Battery_Low (S.Battery),
         Interface_Ok => S.Interface_Ok),
      Position   => S.Position,
      Temp       => S.Temp,
      Battery    => S.Battery,
      Rssi       => S.Rssi,
      Confidence => S.Confidence);

end Device_State;
