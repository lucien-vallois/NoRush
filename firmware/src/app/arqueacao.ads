--  Tabela de arqueacao: converte nivel (mm) em volume (litros).
--
--  A tabela e' uma funcao de lookup com interpolacao linear por trecho.
--  Duas propriedades sao verificaveis e devem valer sempre:
--
--    1. Os niveis sao ESTRITAMENTE crescentes (garante divisor != 0).
--    2. Os volumes sao crescentes (mais nivel = mais volume).
--
--  A interpolacao usa Long_Long_Integer no passo intermediario para que o
--  produto (delta_volume * delta_nivel) nunca estoure, mesmo com a tabela
--  na faixa maxima.

with Hal_Types;

package Arqueacao with SPARK_Mode => On is

   --  Volume maximo suportado, em litros (100 m3).
   Max_Volume_L : constant := 100_000;

   type Point is record
      Level_Mm : Hal_Types.Position_Mm := 0;
      Volume_L : Natural range 0 .. Max_Volume_L := 0;
   end record;

   type Table is array (Positive range <>) of Point;

   --  Niveis estritamente crescentes e volumes crescentes.
   function Is_Monotonic (T : Table) return Boolean
     is (T'Length >= 2
         and then
           (for all I in T'First .. T'Last - 1 =>
              T (I).Level_Mm < T (I + 1).Level_Mm
              and then T (I).Volume_L <= T (I + 1).Volume_L));

   --  Volume interpolado para um nivel. Abaixo do primeiro ponto devolve o
   --  volume do primeiro ponto; acima do ultimo, o do ultimo (sem extrapolar).
   function Volume (T : Table; Level_Mm : Hal_Types.Position_Mm) return Natural
     with
       Pre  => Is_Monotonic (T),
       Post => Volume'Result <= T (T'Last).Volume_L
               and then Volume'Result >= T (T'First).Volume_L;

end Arqueacao;
