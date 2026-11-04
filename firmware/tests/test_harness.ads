--  Mini-harness de testes (sem dependencias externas: AUnit nao esta
--  instalado neste ambiente). Cada teste registra um "check" e o exit code
--  do processo reflete se algum falhou.

package Test_Harness is

   procedure Section (Name : String);

   procedure Check (Cond : Boolean; Msg : String);

   procedure Check_Eq (Got      : Integer;
                       Expected : Integer;
                       Msg      : String);

   procedure Check_Eq_N (Got      : Natural;
                         Expected : Natural;
                         Msg      : String);

   function Total_Checks   return Natural;
   function Total_Failures return Natural;

   --  Imprime o resumo e define o exit code do processo (0 = sucesso).
   procedure Summary;

end Test_Harness;
