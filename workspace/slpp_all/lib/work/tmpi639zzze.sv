module codificador_prioridad (
    input  logic [3:0] in,
    output logic [1:0] out
);

    always_comb begin

unique case (in)
4'b1xxx: out=2'd3;
4'bx1xx: out=2'd2;
4'bxx1x: out=2'd1;
4'bxxx1: out=2'd0;
default: out=2'bxx;
endcase
    end

endmodule