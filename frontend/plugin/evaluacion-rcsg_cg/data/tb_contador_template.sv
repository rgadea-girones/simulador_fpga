`ifdef CG_ENABLE
//aquí va tu codigo
`endif
module tb;
  logic clk = 0;
  logic enable = 0;
  logic updown = 1;
  logic reset_n = 0;
  logic areset_n = 0;
  logic terminal_count_en;
  logic terminal_count_free;
  logic [3:0] count;
  logic [3:0] prev_count;

  counter_dut dut (
    .clk(clk),
    .enable(enable),
    .updown(updown),
    .reset_n(reset_n),
    .areset_n(areset_n),
    .terminal_count_en(terminal_count_en),
    .terminal_count_free(terminal_count_free),
    .count(count)
  );

  always #5 clk = ~clk;

  // Secuencias
  sequence subir_normal;
    logic [3:0] cnt;
    (1, cnt = count) ##1 count == cnt + 4'b1;
  endsequence

  sequence subir_final;
    logic [3:0] cnt;
    (1, cnt = count) ##1 count == 4'b0000;
  endsequence

  sequence bajar_normal;
    logic [3:0] cnt;
    (1, cnt = count) ##1 count == cnt - 4'b1;
  endsequence

  sequence bajar_final;
    logic [3:0] cnt;
    (1, cnt = count) ##1 count == 4'b1100;
  endsequence

  // Aserciones
  subir1: assert property (@(posedge clk)
    disable iff (areset_n !== 1'b1) enable && reset_n && updown && count != 4'b1100 |-> subir_normal
  ) else $error("Error: El contador no esta incrementando correctamente en situacion normal");

  subir2: assert property (@(posedge clk)
    disable iff (areset_n !== 1'b1) enable && reset_n && updown && count == 4'b1100 |-> subir_final
  ) else $error("Error: El contador no esta incrementando correctamente en situacion final");

  bajar1: assert property (@(posedge clk)
    disable iff (areset_n !== 1'b1) enable && reset_n && !updown && count != 4'b0000 |-> bajar_normal
  ) else $error("Error: El contador no esta decrementando correctamente en situacion normal");

  bajar2: assert property (@(posedge clk)
    disable iff (areset_n !== 1'b1) enable && reset_n && !updown && count == 4'b0000 |-> bajar_final
  ) else $error("Error: El contador no esta decrementando correctamente en situacion final");

  inhabilitado: assert property (@(posedge clk)
    disable iff (areset_n !== 1'b1) !enable && reset_n |=> $stable(count)
  ) else $error("Error: El contador no permanece estable cuando no esta habilitado");

  reset: assert property (@(posedge clk)
    disable iff (areset_n !== 1'b1) !reset_n |=> count == 4'b0
  ) else $error("Error: El contador no se resetea correctamente");

  reset_a: assert property (@(posedge clk)
    !areset_n |-> count == 4'b0
  ) else $error("Error: El contador no se resetea asincronicamente correctamente");

  CEP: assert property (@(posedge clk)
    disable iff (areset_n !== 1'b1) (count == 4'b0 && updown == 1'b0 || count == 4'd12 && updown == 1'b1) |-> terminal_count_free
  ) else $error("Error: El contador no indica correctamente el estado de terminacion enable free");

  CET: assert property (@(posedge clk)
    disable iff (areset_n !== 1'b1) (enable == 1'b1 && (count == 4'b0 && updown == 1'b0 || count == 4'd12 && updown == 1'b1)) |-> terminal_count_en == 1'b1
  ) else $error("Error: El contador no indica correctamente el estado de terminacion con enable");

  // ============================================================================
  // Covergroup para verificación funcional del Contador Módulo 13
  // ============================================================================
  covergroup cg_counter_mod13 @(posedge clk);
    option.per_instance = 1;
    option.name         = "cg_counter_mod13";
    option.comment      = "Cobertura funcional de estados, transiciones, prioridades y terminal count";

    // 1. Cobertura de Estados del Contador (Módulo 13: 0 a 12)
    cp_count: coverpoint count {
      bins valid_states[]    = {[0:12]};
      illegal_bins out_range = {[13:15]};
    }

    // 2. Transiciones de Conteo (Ascendente, Descendente, Rollover y Hold)
    cp_transitions: coverpoint count {
      bins count_up[]    = (0 => 1), (1 => 2), (2 => 3), (3 => 4),
                           (4 => 5), (5 => 6), (6 => 7), (7 => 8),
                           (8 => 9), (9 => 10), (10 => 11), (11 => 12);
      bins rollover_up   = (12 => 0);

      bins count_down[]  = (12 => 11), (11 => 10), (10 => 9), (9 => 8),
                           (8 => 7), (7 => 6), (6 => 5), (5 => 4),
                           (4 => 3), (3 => 2), (2 => 1), (1 => 0);
      bins rollover_down = (0 => 12);

      bins hold[]        = (0 => 0), (1 => 1), (2 => 2), (3 => 3),
                           (4 => 4), (5 => 5), (6 => 6), (7 => 7),
                           (8 => 8), (9 => 9), (10 => 10), (11 => 11), (12 => 12);
    }

    // 3. Señales de Control
    cp_enable:   coverpoint enable   { bins low = {0}; bins high = {1}; }
    cp_updown:   coverpoint updown   { bins down = {0}; bins up = {1}; }
    cp_reset_n:  coverpoint reset_n  { bins active = {0}; bins inactive = {1}; }
    cp_areset_n: coverpoint areset_n { bins active = {0}; bins inactive = {1}; }

    // 4. Señales de Terminal Count
    cp_tc_free: coverpoint terminal_count_free { bins inactive = {0}; bins active = {1}; }
    cp_tc_en:   coverpoint terminal_count_en   { bins inactive = {0}; bins active = {1}; }

    // 5. Prioridades de Control: areset_n > reset_n > enable
    cross_control_priority: cross cp_areset_n, cp_reset_n, cp_enable, cp_updown {
      bins areset_active     = binsof(cp_areset_n.active);
      bins sync_reset_active = binsof(cp_areset_n.inactive) && binsof(cp_reset_n.active);
      bins count_up_en       = binsof(cp_areset_n.inactive) && binsof(cp_reset_n.inactive) &&
                               binsof(cp_enable.high) && binsof(cp_updown.up);
      bins count_down_en     = binsof(cp_areset_n.inactive) && binsof(cp_reset_n.inactive) &&
                               binsof(cp_enable.high) && binsof(cp_updown.down);
      bins count_hold        = binsof(cp_areset_n.inactive) && binsof(cp_reset_n.inactive) &&
                               binsof(cp_enable.low);
    }

    // 6. Efecto de Reset Síncrono sobre el Contador
    cross_sync_reset_effect: cross cp_areset_n, cp_reset_n, cp_count {
      bins reset_to_zero = binsof(cp_areset_n.inactive) &&
                           binsof(cp_reset_n.active) &&
                           binsof(cp_count) intersect {0};
    }

    // 7. Modos de Conteo vs Valor de Cuenta
    cross_modes_vs_count: cross cp_enable, cp_updown, cp_count {
    }

    // 8. Terminal Count Free
    cross_tc_free_behavior: cross cp_count, cp_updown, cp_tc_free {
      bins tc_free_up_active   = binsof(cp_count) intersect {12} &&
                                 binsof(cp_updown.up) &&
                                 binsof(cp_tc_free.active);
      bins tc_free_down_active = binsof(cp_count) intersect {0} &&
                                 binsof(cp_updown.down) &&
                                 binsof(cp_tc_free.active);
      bins tc_free_normal_0    = binsof(cp_count) intersect {[1:11]} &&
                                 binsof(cp_tc_free.inactive);
    }

    // 9. Independencia de 'enable' para terminal_count_free
    cross_tc_free_vs_enable: cross cp_tc_free, cp_enable {
      bins tc_free_with_enable_0 = binsof(cp_tc_free.active) && binsof(cp_enable.low);
      bins tc_free_with_enable_1 = binsof(cp_tc_free.active) && binsof(cp_enable.high);
    }

    // 10. Comportamiento de terminal_count_en
    cross_tc_en_gating: cross cp_tc_free, cp_enable, cp_tc_en {
      bins tc_en_active           = binsof(cp_tc_free.active)   && binsof(cp_enable.high) && binsof(cp_tc_en.active);
      bins tc_en_gated_by_enable  = binsof(cp_tc_free.active)   && binsof(cp_enable.low)  && binsof(cp_tc_en.inactive);
      bins tc_en_inactive_regular = binsof(cp_tc_free.inactive) && binsof(cp_enable.high) && binsof(cp_tc_en.inactive);
    }
  endgroup

  // Covergroup para ver si se produce el reset asincrono a 0
  covergroup cg_reset_states @(negedge areset_n);
    cp_count: coverpoint count {
      bins values = {[1:15]};
    }
  endgroup

  // Instanciación de covergroups
  cg_counter_mod13 cg_inst = new();
  cg_reset_states  cg_rst_inst = new();
  
`ifndef CG_ENABLE
  initial begin
    areset_n = 0;
    reset_n = 0;
    enable = 0;
    updown = 1;
    repeat (2) @(posedge clk);
    areset_n = 1;
    reset_n = 1;

    // Fase 1: subir desde 0 hasta 12 y verificar terminal_count en el extremo superior.
    enable = 1;
    updown = 1;
    repeat (12) @(posedge clk);
    #1;
    if (count !== 4'd12)
      $error("UP_COUNT_FAIL: no se alcanzo count=12");
    if (!(terminal_count_free && terminal_count_en))
      $error("TC_UP_12_FAIL: terminal_count no activo en count=12");

    // Fase 2: bajar desde 12 hasta 0 y verificar terminal_count en el extremo inferior.
    updown = 0;
    enable = 1;
    repeat (12) @(posedge clk);
    #1;
    if (count !== 4'd0)
      $error("DOWN_COUNT_FAIL: no se alcanzo count=0");
    if (!(terminal_count_free && terminal_count_en))
      $error("TC_DOWN_0_FAIL: terminal_count no activo en count=0");

    // Fase 3: enable=0 debe mantener el valor sin cambios.
    prev_count = count;
    enable = 0;
    updown = 1;
    @(posedge clk);
    #1;
    if (count !== prev_count)
      $error("HOLD_FAIL: count cambio con enable=0");
    if (terminal_count_en)
      $error("TC_EN_GATE_FAIL: terminal_count_en debe estar desactivado con enable=0");

    // Fase 4: reset sincronico activo bajo debe imponerse en el flanco de reloj.
    enable = 1;
    updown = 1;
    reset_n = 0;
    @(posedge clk);
    #1;
    if (count !== 4'd0)
      $error("SYNC_RESET_FAIL: reset sincronico no llevo count a 0");
    reset_n = 1;

    // Fase 4: reset asincrono activo bajo debe imponerse inmediatamente.
    prev_count = count;
    enable = 1;
    updown = 1;
    @(posedge clk);
    #1;
    if (count === prev_count)
      $error("SETUP_FAIL: no se pudo preparar una condicion distinta antes del reset asinc");
    areset_n = 0;
    #1;
    if (count !== 4'd0)
      $error("ARESET_FAIL: reset asincrono no llevo count a 0");
    areset_n = 1;
    reset_n = 1;
    repeat (4) @(posedge clk);
    $info("FIN VALIDACION");
    $display("Cobertura funcional total = %0.2f%%", $get_coverage());

    $finish;
  end
  `else
  //quí va tu código va tu codigo
    initial begin
          areset_n = 0;
    reset_n = 0;
    enable = 0;
    updown = 1;
    repeat (2) @(posedge clk);
    //codigo del alumno

    areset_n = 1;
    reset_n = 1;
      repeat (100) @(posedge clk);
      $info("FIN VALIDACION");
      $display("Cobertura funcional total = %0.2f%%", $get_coverage());
      $finish;
    end
  `endif
endmodule