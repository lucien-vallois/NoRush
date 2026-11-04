--  Radio LoRaWAN (classe A) -- camada de acesso ao SX1262.
--
--  BOUNDARY DE CONFIANCA (SPARK_Mode => Off) -- ver hal_clock.ads.
--
--  O uplink carrega o frame binario de 12 bytes definido em
--  firmware/docs/payload.md. O limite de payload de aplicacao em DR0 e'
--  19 bytes -- qualquer frame maior deve ser rejeitado antes de chamar Send.

with Hal_Types;

package Hal_Radio with SPARK_Mode => Off is

   subtype Port_Number is Hal_Types.Byte range 1 .. 223;

   --  fPort 1 = telemetria | fPort 2 = identificacao do dispositivo
   Port_Telemetry : constant Port_Number := 1;
   Port_Device_Id : constant Port_Number := 2;

   --  Maior payload de aplicacao suportado (maior que o maximo LoRaWAN
   --  de DR0 = 19 bytes de proposito: a verificacao de tamanho e' do
   --  chamador, e aqui apenas garantimos que o buffer nunca estoura).
   Max_Payload : constant := 51;

   subtype Payload_Index is Natural range 0 .. Max_Payload - 1;
   type Payload is array (Payload_Index) of Hal_Types.Byte;

   type Send_Result is
     (Sent,
      Not_Joined,
      Tx_Error,
      Duty_Cycle_Blocked,
      Payload_Too_Large);

   type Rx_Message is record
      Length : Natural range 0 .. Max_Payload := 0;
      Port   : Port_Number                     := 1;
      Data   : Payload                         := (others => 0);
   end record;

   --  Transmite um uplink. Data pode ter qualquer comprimento de 0 a
   --  Max_Payload; comprimentos fora do intervalo valido do LoRaWAN
   --  devem ser barrados pelo chamador.
   procedure Send (P    : in     Port_Number;
                   Data : in     Hal_Types.Byte_Array;
                   Res  :    out Send_Result)
     with Pre => Data'Length <= Max_Payload;

   --  Le downlink pendente das janelas RX1/RX2. Se nao houver, Length = 0.
   procedure Receive (Msg : out Rx_Message);

   --  Nivel de sinal da ultima transmissao/recepcao, se disponivel.
   function Last_Rssi return Hal_Types.Rssi_Reading;

   --  Estado da juncao LoRaWAN.
   function Is_Joined return Boolean;

   --  Sinaliza se o duty cycle regional permite transmitir agora.
   function Can_Transmit return Boolean;

end Hal_Radio;
