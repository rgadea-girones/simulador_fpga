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

  // TODO_EVA_ASSERTION: agrega o reemplaza aserciones para justificar tu decision.

  sequence rgadea_enable;
  logic [3:0]cnt;
  logic updown_local;
  (1, updown_local=updown, cnt=count)  ##1 count == (updown_local?( (cnt==4'b1100) ?4'b0:(cnt + 4'b1)):((cnt==4'b0000)? 4'b1100:(cnt - 4'b1)));
  endsequence  
    assert property (@(posedge clk)
  disable iff (areset_n!==1'b1) enable&&reset_n |-> rgadea_enable)  else $error("Error: El contador no esta contando correctamente");

 assert property (@(posedge clk)
  disable iff (areset_n!==1'b1) !enable&&reset_n |=> $stable(count))  else $error("Error: El contador no permanece estable cuando no esta habilitado");


  assert property (@(posedge clk)
  disable iff (areset_n!==1'b1)  !reset_n |=> count==4'b0) else $error("Error: El contador no se resetea correctamente");

  assert property (@(posedge clk)
  disable iff (areset_n!==1'b1)  terminal_count_free== (count==4'b0&&updown==1'b0 || count==4'd12&&updown==1'b1)) else $error("Error: El contador no indica correctamente el estado de terminacion enable free")    ;

  assert property (@(posedge clk)
  disable iff (areset_n!==1'b1)  terminal_count_en== (enable==1'b1&&(count==4'b0&&updown==1'b0 || count==4'd12&&updown==1'b1))) else $error("Error: El contador no indica correctamente el estado de terminacion con enable");


  initial begin
    areset_n = 0; reset_n = 0; enable = 0; updown = 1;
    repeat (2) @(posedge clk);
    areset_n = 1; reset_n = 1;

    // Fase 1: estimulo de conteo ascendente de 0 a 12.
    enable = 1; updown = 1;
    repeat (12) @(posedge clk);
    #1;

    // Fase 2: estimulo de conteo descendente de 12 a 0.
    updown = 0; enable = 1;
    repeat (12) @(posedge clk);
    #1;

    // Fase 3: estimulo con enable=0 (mantener valor).
    prev_count = count;
    enable = 0; updown = 1;
    @(posedge clk);
    #1;

    // Fase 4: estimulo de reset sincronico activo bajo.
    enable = 1; updown = 1; reset_n = 0;
    @(posedge clk);
    #1;
    reset_n = 1;

    // Fase 5: estimulo de reset asincronico activo bajo.
    prev_count = count;
    enable = 1; updown = 1;
    @(posedge clk);
    #1;
    areset_n = 0;
    #1;
    areset_n = 1;
    reset_n = 1;
    repeat (4) @(posedge clk);
    $finish;
  end
endmodule