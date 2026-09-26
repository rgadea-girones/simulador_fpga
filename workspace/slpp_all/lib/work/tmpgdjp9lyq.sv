module codificador_prioridad (
    input  logic [3:0] in,
    output logic [1:0] out,
    output logic valid
);

    always_comb begin
        valid = 1'b1;
        if (in[3]) out = 2'd3;
        else if (in[2]) out = 2'd2;
        else if (in[1]) out = 2'd1;
        else if (in[0]) out = 2'd0;
        else begin
            out = 2'd0;
            valid = 1'b0;
        end
    end

endmodule