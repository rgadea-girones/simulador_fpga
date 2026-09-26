module codificador_prioridad (
    input  logic [3:0] in,
    output logic [1:0] out
);

    always_comb begin

unique case (1'b1)
in[3]: out=2'd3;
in[2]: out=2'd2;
in[1]: out=2'd1;
in[0]: out=2'd0;
//default: out=2'bxx;
endcase
    end

endmodule