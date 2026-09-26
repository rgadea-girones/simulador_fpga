module shift_register #(
    parameter WIDTH = 8
)(
    input  logic clk,
    input  logic rst_n,
    input  logic load_en,
    input  logic [WIDTH-1:0] d_in,
    input  logic shift_in,
    output logic [WIDTH-1:0] q_out
);

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            q_out <= '0;
        else if (load_en)
            q_out <= d_in;
        else
            q_out <= {q_out[WIDTH-2:0], shift_in};
    end

endmodule