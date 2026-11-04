with Sim_Control;

package body Hal_Storage with SPARK_Mode => Off is

   procedure Load (Data : out Cal_Blob; Valid : out Boolean) is
   begin
      Data  := Sim_Control.Stored;
      Valid := Sim_Control.Stored_Valid;
   end Load;

   procedure Save (Data : in     Cal_Blob; Ok : out Boolean) is
   begin
      if Sim_Control.Write_Fails then
         Ok := False;
         return;
      end if;
      Sim_Control.Stored       := Data;
      Sim_Control.Stored_Valid := True;
      Ok := True;
   end Save;

   procedure Erase (Ok : out Boolean) is
   begin
      if Sim_Control.Write_Fails then
         Ok := False;
         return;
      end if;
      Sim_Control.Stored       := Hal_Types.Empty_Blob;
      Sim_Control.Stored_Valid := False;
      Ok := True;
   end Erase;

end Hal_Storage;
