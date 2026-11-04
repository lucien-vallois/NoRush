with Ada.Text_IO;    use Ada.Text_IO;
with Ada.Command_Line;

package body Test_Harness is

   Checks_Ctr   : Natural := 0;
   Failures_Ctr : Natural := 0;

   procedure Section (Name : String) is
   begin
      New_Line;
      Put_Line ("=== " & Name & " ===");
   end Section;

   procedure Check (Cond : Boolean; Msg : String) is
   begin
      Checks_Ctr := Checks_Ctr + 1;
      if Cond then
         Put_Line ("  ok   " & Msg);
      else
         Failures_Ctr := Failures_Ctr + 1;
         Put_Line ("  FAIL " & Msg);
      end if;
   end Check;

   procedure Check_Eq (Got      : Integer;
                       Expected : Integer;
                       Msg      : String) is
   begin
      if Got = Expected then
         Check (True, Msg);
      else
         Check (False, Msg & " [esperado=" & Integer'Image (Expected)
                & " obtido=" & Integer'Image (Got) & "]");
      end if;
   end Check_Eq;

   procedure Check_Eq_N (Got      : Natural;
                         Expected : Natural;
                         Msg      : String) is
   begin
      Check_Eq (Got, Expected, Msg);
   end Check_Eq_N;

   function Total_Checks return Natural is
   begin
      return Checks_Ctr;
   end Total_Checks;

   function Total_Failures return Natural is
   begin
      return Failures_Ctr;
   end Total_Failures;

   procedure Summary is
   begin
      New_Line;
      Put_Line ("--------------------------------------------------");
      if Failures_Ctr = 0 then
         Put_Line ("TODOS OS TESTES PASSARAM ("
                   & Natural'Image (Checks_Ctr) & " checks)");
         Ada.Command_Line.Set_Exit_Status (Ada.Command_Line.Success);
      else
         Put_Line ("FALHAS:" & Natural'Image (Failures_Ctr)
                   & " de" & Natural'Image (Checks_Ctr) & " checks");
         Ada.Command_Line.Set_Exit_Status (Ada.Command_Line.Failure);
      end if;
   end Summary;

end Test_Harness;
