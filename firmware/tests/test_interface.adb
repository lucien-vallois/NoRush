with Hal_Types;
with Interface_Detector;
with Test_Harness; use Test_Harness;

package body Test_Interface is

   use Interface_Detector;

   --  Enche a janela com um valor constante.
   procedure Fill_Flat (S : in out State; Pos : Hal_Types.Position_Mm; N : Natural) is
   begin
      for I in 1 .. N loop
         Push (S, Pos);
      end loop;
   end Fill_Flat;

   procedure Run is
      S     : State;
      Det   : Boolean;
      Score : Natural;
      Pos   : Hal_Types.Position_Mm;
   begin
      Section ("interface_detector");

      --  Janela vazia: nao detecta por falta de amostras ----------------
      Detect (S, 0, False, Det, Score, Pos);
      Check (not Det, "janela vazia nao detecta");
      Check_Eq_N (Score, 100, "estabilidade de janela vazia e' 100 (sem ruido)");

      --  Estabilidade com amplitude zero -------------------------------
      S := (Buf => (others => 1000), Count => 0);
      Fill_Flat (S, 1000, History_Depth);
      Check_Eq_N (Amplitude (S), 0, "amplitude zero para valor constante");
      Check_Eq_N (Stability (S), 100, "estabilidade 100 para amplitude zero");

      --  Estabilidade com amplitude de 5 mm ----------------------------
      S := (Buf => (others => 0), Count => 0);
      Push (S, 1000);
      Push (S, 1005);
      Push (S, 1003);
      Push (S, 1001);
      Push (S, 1004);
      Check_Eq_N (Amplitude (S), 5, "amplitude 5 mm na janela");
      Check_Eq_N (Stability (S), 50, "estabilidade 50 para amplitude 5 mm");

      --  Estabilidade satura em zero quando a amplitude atinge a tolerancia
      S := (Buf => (others => 0), Count => 0);
      Push (S, 1000);
      Push (S, 1010);
      Check_Eq_N (Amplitude (S), 10, "amplitude 10 mm na janela");
      Check_Eq_N (Stability (S), 0,
                  "estabilidade 0 quando amplitude atinge a tolerancia");

      --  Regressao da versao v1.2: estabilidade nunca pode ser negativa.
      S := (Buf => (others => 0), Count => 0);
      Push (S, 1000);
      Push (S, 1500);
      Check_Eq_N (Amplitude (S), 500, "amplitude 500 mm na janela");
      Check_Eq_N (Stability (S), 0,
                  "estabilidade satura em 0 (nunca negativa)");

      --  Deteccao exige Min_Samples -----------------------------------
      S := (Buf => (others => 0), Count => 0);
      Fill_Flat (S, 2000, Min_Samples - 1);
      Detect (S, 0, False, Det, Score, Pos);
      Check (not Det, "nao detecta com menos de Min_Samples amostras");

      --  Deteccao sem celula de condutividade -------------------------
      S := (Buf => (others => 0), Count => 0);
      Fill_Flat (S, 1850, Min_Samples);
      Detect (S, 0, False, Det, Score, Pos);
      Check (Det, "detecta com janela estavel e sem celula");
      Check_Eq_N (Score, 100, "score 100 sem celula, janela estavel");
      Check_Eq_N (Pos, 1850, "posicao reportada = media da janela");

      --  Com celula: condutividade confirma agua ----------------------
      S := (Buf => (others => 0), Count => 0);
      Fill_Flat (S, 1850, Min_Samples);
      Detect (S, 600, True, Det, Score, Pos);
      Check (Det, "detecta com condutividade acima do limiar (agua)");
      Check_Eq_N (Score, 100, "score 100 com agua confirmada");

      --  Com celula: condutividade indica oleo, nao e' interface -------
      S := (Buf => (others => 0), Count => 0);
      Fill_Flat (S, 1850, Min_Samples);
      Detect (S, 100, True, Det, Score, Pos);
      Check (not Det, "nao detecta com condutividade de oleo");
      Check_Eq_N (Score, 50, "score cortado pela metade sem confirmacao");

      --  Janela instavel nao detecta ----------------------------------
      S := (Buf => (others => 0), Count => 0);
      for I in 1 .. Min_Samples loop
         Push (S, 1850 + (if I mod 2 = 0 then 30 else 0));
      end loop;
      Check (Stability (S) = 0, "janela com ruido de 30 mm tem estabilidade 0");
      Detect (S, 600, True, Det, Score, Pos);
      Check (not Det, "nao detecta com janela instavel");

      --  Limiar de confianca ------------------------------------------
      Check_Eq_N (Confidence_Threshold, 85, "limiar de confianca = 85");
      Check_Eq_N (Water_Conductivity_Min, 500, "limiar de condutividade = 500");
   end Run;

end Test_Interface;
