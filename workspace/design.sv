module counter_dut(
  input  logic clk,
  input  logic enable,
  input  logic updown,
  input  logic reset_n,
  input  logic areset_n,
  output logic terminal_count_en,
  output logic terminal_count_free,
  output logic [3:0] count
);
  always_ff @(posedge clk or negedge areset_n) begin
    if (!areset_n) count <= 4'd0;
    else if (!reset_n) count <= 4'd0;
    else begin
      if (updown) count <= (count == 4'd12) ? 4'd0 : count + 4'd1;
      else count <= (count == 4'd0) ? 4'd12 : count - 4'd1;
    end
  end
  assign terminal_count_free = (updown && (count == 4'd12)) || (!updown && (count == 4'd0));
  assign terminal_count_en = enable && terminal_count_free;
endmodule