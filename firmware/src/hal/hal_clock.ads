--  Relogio de sistema.
--
--  BOUNDARY DE CONFIANCA: este pacote e' declarado SPARK_Mode => Off porque
--  modela estado externo (hardware). O codigo de aplicacao (SPARK_Mode => On)
--  que o chama continua verificavel -- o GNATprove trata cada chamada de um
--  subprograma nao-SPARK de forma conservadora, assumindo que o resultado e'
--  qualquer valor dentro do subtipo declarado.
--
--  Corpos: src/bsp/sim/hal_clock.adb (host) | src/bsp/stm32l4/hal_clock.adb

with Hal_Types;

package Hal_Clock with SPARK_Mode => Off is

   --  Milissegundos desde o boot (wrap a ~49,7 dias).
   function Now return Hal_Types.Millis;

   --  Dorme por pelo menos Ms milissegundos. A acordar por interrupcao
   --  (RTC ou radio), retorna antes. Retorna o tempo realmente decorrido.
   function Delay_Ms (Ms : Hal_Types.Millis) return Hal_Types.Millis
     with Pre => Ms <= 60_000;

end Hal_Clock;
