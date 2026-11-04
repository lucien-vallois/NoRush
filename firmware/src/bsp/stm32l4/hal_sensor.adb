--  Corpo de ALVO do HAL de sensores para a Boia A (STM32L432KC).
--
--  Este arquivo NAO e' compilado no build host (boias.gpr usa src/bsp/sim).
--  Ele compila apenas com boias_target.gpr, que requer o cross toolchain
--  arm-eabi. Ver firmware/README.md, secao 4.
--
--  O que este arquivo mostra: como a logica em src/app chama, atraves do
--  contrato de src/hal/hal_sensor.ads, um driver C real (c/mag_sensor).
--  Nenhum codigo de aplicacao muda quando se troca de BSP.

with Interfaces.C;
with Hal_Types;

package body Hal_Sensor with SPARK_Mode => Off is

   use type Interfaces.C.int;
   use type Interfaces.C.unsigned_char;

   --  Status devolvido pelo driver C (c/mag_sensor/mag_sensor.h).
   MAG_OK        : constant Interfaces.C.int := 0;
   MAG_ERR_RANGE : constant Interfaces.C.int := 4;

   subtype C_Uint16 is Interfaces.C.unsigned_short;
   subtype C_Int16  is Interfaces.C.short;

   --  Binding direto do driver C. `access` corresponde a `uint16_t *`.
   function Mag_Read_Position (Out_Mm : access C_Uint16) return Interfaces.C.int
     with Import => True, Convention => C,
          External_Name => "mag_read_position_mm";

   function Mag_Read_Temperature (Out_C10 : access C_Int16) return Interfaces.C.int
     with Import => True, Convention => C,
          External_Name => "mag_read_temperature_c10";

   function Mag_Read_Status (Out_St : access C_Uint16) return Interfaces.C.int
     with Import => True, Convention => C,
          External_Name => "mag_read_status";

   function Has_Conductivity_Cell return Boolean is
   begin
      --  A Boia A nao tem celula de condutividade.
      return False;
   end Has_Conductivity_Cell;

   procedure Read_Position (Pos : out Hal_Types.Position_Mm;
                            St  : out Read_Status)
   is
      Raw : aliased C_Uint16 := 0;
      Rc  : Interfaces.C.int;
   begin
      Rc := Mag_Read_Position (Raw'Access);

      if Rc = MAG_OK then
         --  O driver ja' satura em 0..5000 e devolve MAG_ERR_RANGE quando
         --  satura; aqui apenas convertemos.
         Pos := Hal_Types.Position_Mm (Raw);
         St  := Ok;

      elsif Rc = MAG_ERR_RANGE then
         --  Acima da faixa: reportamos o teto e sinalizamos, para que a
         --  logica de alerta possa distinguir "no teto" de "leitura valida".
         Pos := Hal_Types.Position_Mm'Last;
         St  := Out_Of_Range;

      else
         Pos := 0;
         St  := Sensor_Fault;
      end if;
   end Read_Position;

   procedure Read_Temperature (T  : out Hal_Types.Temp_DegC_x10;
                               St : out Read_Status)
   is
      Raw : aliased C_Int16 := 0;
      Rc  : Interfaces.C.int;
   begin
      Rc := Mag_Read_Temperature (Raw'Access);

      if Rc = MAG_OK then
         T  := Hal_Types.Temp_DegC_x10 (Raw);
         St := Ok;
      elsif Rc = MAG_ERR_RANGE then
         --  Satura no extremo mais proximo do valor medido.
         if Raw < 0 then
            T := Hal_Types.Temp_DegC_x10'First;
         else
            T := Hal_Types.Temp_DegC_x10'Last;
         end if;
         St := Out_Of_Range;
      else
         T  := 0;
         St := Sensor_Fault;
      end if;
   end Read_Temperature;

   procedure Read_Conductivity (C  : out Hal_Types.Conductivity_uS;
                                St : out Read_Status) is
   begin
      --  A Boia A nao tem celula. A logica trata Has_Conductivity_Cell
      --  como autoridade; estes valores nunca devem ser consumidos.
      C  := 0;
      St := Sensor_Fault;
   end Read_Conductivity;

end Hal_Sensor;
