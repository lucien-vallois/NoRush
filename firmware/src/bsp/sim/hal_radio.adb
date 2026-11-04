with Sim_Control;

package body Hal_Radio with SPARK_Mode => Off is

   procedure Send (P    : in     Port_Number;
                   Data : in     Hal_Types.Byte_Array;
                   Res  :    out Send_Result)
   is
      Idx : Natural := 0;
   begin
      if not Sim_Control.Joined then
         Res := Not_Joined;
         return;
      end if;

      if not Sim_Control.Tx_Allowed then
         Res := Duty_Cycle_Blocked;
         return;
      end if;

      --  Copia para o buffer de diagnostico do simulador. O comprimento ja'
      --  foi limitado pela precondicao (Data'Length <= Max_Payload).
      Sim_Control.Last_Port        := Hal_Types.Byte (P);
      Sim_Control.Last_Payload     := (others => 0);
      for I in Data'Range loop
         Sim_Control.Last_Payload (Idx) := Data (I);
         Idx := Idx + 1;
      end loop;
      Sim_Control.Last_Payload_Len := Data'Length;

      Res := Sent;
   end Send;

   procedure Receive (Msg : out Rx_Message) is
   begin
      --  O simulador nunca entrega downlink por padrao.
      Msg := (Length => 0, Port => 1, Data => (others => 0));
   end Receive;

   function Last_Rssi return Hal_Types.Rssi_Reading is
   begin
      --  O no nao mede o proprio sinal.
      return Hal_Types.Rssi_Unknown;
   end Last_Rssi;

   function Is_Joined return Boolean is
   begin
      return Sim_Control.Joined;
   end Is_Joined;

   function Can_Transmit return Boolean is
   begin
      return Sim_Control.Tx_Allowed;
   end Can_Transmit;

end Hal_Radio;
