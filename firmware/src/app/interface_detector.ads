--  Deteccao de interface agua/oleo (apenas Boia B).
--
--  A boia NAO compara fluidos: ela se posiciona na fronteira por diferenca
--  de densidade. O que este modulo faz e' decidir, a partir da serie de
--  posicoes medidas, se a posicao atual e' confiavel o suficiente para ser
--  reportada como "interface".
--
--  Dois sinais independentes:
--    1. Estabilidade da posicao (janela de History_Depth amostras).
--    2. Condutividade (> Water_Conductivity_Min uS/cm confirma agua).
--
--  A versao anterior deste algoritmo (pseudocodigo no doc v1.2) devolvia
--  estabilidade NEGATIVA quando a amplitude excedia a tolerancia, porque
--  calculava `1 - amplitude/tolerancia` sem saturar em zero.

with Hal_Types;

package Interface_Detector with SPARK_Mode => On is

   --  Janela deslizante. Maior que Min_Samples de proposito: da' ao
   --  detector uma margem de amostras antes de o requisito minimo ser
   --  alcancado, e mantem a janela de estabilidade com mais contexto.
   History_Depth        : constant := 12;
   --  Janela de estabilidade: 10 mm.
   Tolerance_Mm         : constant := 10;
   Min_Samples          : constant := 10;
   --  Estabilidade minima (0..100) para considerar a posicao estavel.
   Stability_Min        : constant := 80;
   --  Score minimo (0..100) para reportar a interface como detectada.
   Confidence_Threshold : constant := 85;
   --  Acima deste valor a condutividade caracteriza agua.
   Water_Conductivity_Min : constant := 500;

   type History is array (0 .. History_Depth - 1) of Hal_Types.Position_Mm;

   type State is record
      Buf   : History := (others => 0);
      Count : Natural range 0 .. History_Depth := 0;
   end record;

   --  Insere uma amostra. Acima de History_Depth, descarta a mais antiga.
   procedure Push (S : in out State; Pos : Hal_Types.Position_Mm)
     with Post => S.Count = (if S'Old.Count < History_Depth
                             then S'Old.Count + 1
                             else History_Depth);

   --  Amplitude (max - min) da janela. Zero se ha menos de duas amostras.
   function Amplitude (S : State) return Natural;

   --  Estabilidade em 0..100. Saturada em 100 para amplitude zero e em 0
   --  quando a amplitude atinge ou ultrapassa Tolerance_Mm.
   function Stability (S : State) return Natural
     with Post => Stability'Result <= 100;

   --  Score de confianca em 0..100.
   --    Sem celula de condutividade: igual a Stability.
   --    Com celula: media entre Stability e a confirmacao de agua.
   function Confidence (S            : State;
                        Conductivity : Hal_Types.Conductivity_uS;
                        Has_Cell     : Boolean) return Natural
     with Post => Confidence'Result <= 100;

   --  Posicao media da janela (estimador mais estavel que a ultima amostra).
   function Mean_Position (S : State) return Hal_Types.Position_Mm;

   procedure Detect
     (S            : in     State;
      Conductivity : in     Hal_Types.Conductivity_uS;
      Has_Cell     : in     Boolean;
      Detected     :    out Boolean;
      Score        :    out Natural;
      Position     :    out Hal_Types.Position_Mm)
     with
       Post =>
         Score <= 100
         and then (if not Detected then Score < Confidence_Threshold
                                    or else S.Count < Min_Samples
                                    or else Stability (S) < Stability_Min);

end Interface_Detector;
