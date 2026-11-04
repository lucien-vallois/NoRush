--  Suite de testes do firmware das boias.
--
--    gprbuild -P firmware/gnat/boias.gpr
--    ./firmware/build/host/test_main.exe
--
--  Exit code 0 = todos os checks passaram.

with Ada.Text_IO; use Ada.Text_IO;
with Test_Harness;
with Test_Payload;
with Test_Arqueacao;
with Test_Interface;
with Test_Energy;
with Test_Alerts;
with Test_Calibration;

procedure Test_Main is
begin
   Put_Line ("Suite de testes do firmware das boias");
   Put_Line ("(build host, GNAT nativo -- logica Ada/SPARK)");

   Test_Payload.Run;
   Test_Arqueacao.Run;
   Test_Interface.Run;
   Test_Energy.Run;
   Test_Alerts.Run;
   Test_Calibration.Run;

   Test_Harness.Summary;
end Test_Main;
