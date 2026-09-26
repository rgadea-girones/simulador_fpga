module shift_register #(
    parameter WIDTH = 8
)(
    input  logic clk,
    input  logic rst_n,
    input  logic load_en,
    input  logic [3:0] d_in,
    input  logic shift_en,
    output logic [3:0] q_out
);
    // Inicializamos 'aux' a 0 en la declaraci  n para evitar 'X' al arrancar la simulaci  n
    logic [WIDTH-1:0][3:0] aux = '0;
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            aux <= '0;
        end else if (shift_en) begin
            aux <= {aux[WIDTH-2:0], d_in};
        end
    end
    assign q_out = aux[WIDTH-1];
endmodule