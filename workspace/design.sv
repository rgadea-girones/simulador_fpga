module fsm (
    input clk,
    input rst,
    input din,
    output reg detect
);

    // Definición de estados (Moore FSM)
    parameter S0 = 3'b000; // Nada detectado
    parameter S1 = 3'b001; // Detectado '1'
    parameter S2 = 3'b010; // Detectado '10'
    parameter S3 = 3'b011; // Detectado '101'
    parameter S4 = 3'b100; // Detectado '1011'

    reg [2:0] current_state, next_state;

    // Lógica de transición de estado secuencial
    always @(posedge clk or negedge rst) begin
        if (!rst)
            current_state <= S0;
        else
            current_state <= next_state;
    end

    // Lógica del próximo estado (Combinacional)
    always @(*) begin
        case (current_state)
            S0: next_state = din ? S1 : S0;
            S1: next_state = din ? S1 : S2;
            S2: next_state = din ? S3 : S0;
            S3: next_state = din ? S4 : S2;
            S4: next_state = din ? S1 : S2; // Permite solapamiento (overlapping)
            default: next_state = S0;
        endcase
    end

    // Lógica de salida (Moore: depende sólo del estado actual)
    always @(*) begin
        if (current_state == S4)
            detect = 1'b1;
        else
            detect = 1'b0;
    end

endmodule