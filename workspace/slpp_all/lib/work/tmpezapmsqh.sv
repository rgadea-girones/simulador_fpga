module codificador_prioridad (
    input  logic [3:0] in,
    output logic [1:0] out
);

    always_comb begin

  case(in)
    4'b1000: out =2'd3;
    4'b0100: out =2'd2;
    4'b0010: out =2'd1;
    4'b0001: out =2'd0;
    default: out=2'bx;
  endcase
    end

endmodule