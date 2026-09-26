module detector_secuencia_101 (
    input  logic clk,
    input  logic rst_n,
    input  logic bit_in,
    output logic detect_out
);

    localparam S0 = 4'b0001;
    localparam S1 = 4'b0010;
    localparam S2 = 4'b0100;
    localparam S3 = 4'b1000;
    logic [1:0] current_state, next_state;

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) current_state <= S0;
        else current_state <= next_state;
    end

    always_comb begin
        next_state = current_state;
        detect_out = 1'b0;

        case (current_state)
            S0: if (bit_in) next_state = S1;
            S1: if (!bit_in) next_state = S2;
            S2: if (bit_in) begin
                    next_state = S3;
                end else next_state = S0;
            S3: begin
                    detect_out = 1'b1;
                    if (bit_in) next_state = S1;
                    else next_state = S2;
                end
        endcase
    end

endmodule