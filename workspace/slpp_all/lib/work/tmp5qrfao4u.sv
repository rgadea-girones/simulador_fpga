module alu (
    input  logic [3:0] a, b,
    input  logic [1:0] op,
    output logic [4:0] res
);

    always_comb begin
        case (op)
            2'b00: res = a + b;
            2'b01: res = a - b;
            2'b10: res = a & b;
            2'b11: res = {1'b0, a | b};
            default: res = '0;
        endcase
    end

endmodule