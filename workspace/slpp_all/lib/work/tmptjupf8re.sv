module flipflop_d (
    input  logic clk,
    input  logic rst_n, // Reset as  ncrono activo por bajo
    input logic set_n,
    input  logic d,
    output logic q
);

    always_ff @(posedge clk ,negedge rst_n, negedge set_n) begin
        if (!rst_n)
            q <= 1'b0;
        else if (!set_n)
            q<= 1'b1;
        else
            q <= d;
    end

endmodule