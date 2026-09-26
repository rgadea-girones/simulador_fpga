module detector_secuencia_101 (
    input  logic clk,
    input  logic rst_n,
    input  logic bit_in,
    output logic detect_out
);

    enum logic [1:0] {S0=2'd0,S1=2'd1,S2=2'd2}current_state, next_state;

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) current_state <= S0;
        else current_state <= next_state;
    end

    always_comb begin


        case (current_state)
            S0: if (bit_in) next_state = S1;
            S1: if (!bit_in) next_state = S2;
            S2: if (bit_in) begin
                    next_state = S1;
                     detect_out = 1'b1;
                end else next_state = S0;

        endcase
    end

endmodule