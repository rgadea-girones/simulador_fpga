module codificador_prioridad (
    input  logic [3:0] in,
    output logic [1:0] out1,
    output logic [1:0] out2
);

    always_comb begin

        if (in[3]) out = 2'd3;
        else if (in[2]) out = 2'd2;
        else if (in[1]) out = 2'd1;
        else if (in[0]) out = 2'd0;
        else begin
            out = 2'd0;

        end
    end
    always_comb begin

case (1'b1)
   in[3]: out2=2'd3;
   in[2]: out2=2'd2;
   in[1]: out2=2'd1; 
   in[0]: out2=2'd0; 
endcase       
    end    

endmodule