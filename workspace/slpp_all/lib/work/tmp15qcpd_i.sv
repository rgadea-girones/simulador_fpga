module flipflop_d (
    input  logic clk,
    input  logic rst_n, // Reset as  ncrono activo por bajo
    input  logic d,
    output logic q
);

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            q <= 1'b0;
        else
            q <= d;
    end

endmodule