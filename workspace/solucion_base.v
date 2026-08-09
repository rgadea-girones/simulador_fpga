// --- BLOQUE 1: El Contador Up/Down ---
module contador (
    input clk,
    input rst_n,
    input en,
    input dir,
    output reg [3:0] count
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) 
            count <= 4'b0000;
        else if (en) begin
            if (dir) count <= count + 1; // dir=1 -> UP
            else     count <= count - 1; // dir=0 -> DOWN
        end
    end
endmodule

// --- BLOQUE 2: La Máquina de Estados (FSM) ---
module fsm_control (
    input clk,
    input rst_n,
    input up,  // Botón UP (0 al pulsar)
    input dn,  // Botón DOWN (0 al pulsar)
    output reg en,
    output reg dir
);
    // Definición de estados
    localparam IDLE    = 3'd0;
    localparam INC     = 3'd1;
    localparam WAIT_UP = 3'd2; // Espera a que suelten el botón
    localparam DEC     = 3'd3;
    localparam WAIT_DN = 3'd4; // Espera a que suelten el botón

    reg [2:0] state, next_state;

    // Registro de estado
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= IDLE;
        else        state <= next_state;
    end

    // Lógica de próximo estado y salidas (Moore)
    always @(*) begin
        // Valores por defecto
        next_state = state;
        en = 1'b0;
        dir = 1'b1;

        case (state)
            IDLE: begin
                if      (up == 1'b0) next_state = INC;
                else if (dn == 1'b0) next_state = DEC;
            end
            
            INC: begin
                en = 1'b1;
                dir = 1'b1;
                next_state = WAIT_UP;
            end
            
            WAIT_UP: begin
                if (up == 1'b1) next_state = IDLE; // Soltó el botón
            end

            DEC: begin
                en = 1'b1;
                dir = 1'b0;
                next_state = WAIT_DN;
            end

            WAIT_DN: begin
                if (dn == 1'b1) next_state = IDLE; // Soltó el botón
            end
        endcase
    end
endmodule

// --- TOP MODULE (Une todo) ---
module top_system (
    input clk,
    //input rst_n,
    input [2:0] KEY,
    //input btn_dn,
    output [3:0] LEDR
);
    wire w_en, w_dir;
    wire rst_n=KEY[0];
    wire btn_up=KEY[2];
    wire btn_dn=KEY[1];
    fsm_control u_fsm (
        .clk(clk), .rst_n(rst_n), 
        .up(btn_up), .dn(btn_dn), 
        .en(w_en), .dir(w_dir)
    );

    contador u_cnt (
        .clk(clk), .rst_n(rst_n), 
        .en(w_en), .dir(w_dir), 
        .count(LEDR)
    );
endmodule