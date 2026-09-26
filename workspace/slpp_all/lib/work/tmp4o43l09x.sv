module shift_register #(
    parameter WIDTH = 8
)(
    input  logic clk,
    input  logic rst_n,
    input  logic [3:0] d_in,
    input  logic shift_en,
    output logic [3:0] q_out
);
    logic [WIDTH-1:0][3:0] aux;
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            aux <= '0;
        else if (shift_en)
            aux <= {aux[WIDTH-2:0], d_in};
    end
assign q_out=aux[WIDTH-1]
endmodule