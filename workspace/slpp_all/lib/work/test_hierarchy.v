module top_system (
    input CLOCK_50,
    input [2:0] KEY,
    output [3:0] LEDG,
    output [3:0] LEDR
);
    wire w_en, w_dir;
    wire rst_n=KEY[0];
    wire btn_up=KEY[2];

    FSM_MOORE u_fsm (
        .clk(CLOCK_50), .reset_n(rst_n), 
        .KEY2(btn_up),
        .TC(LEDG[3]),
        .estado(LEDG[2:0]),
        .enable_cnt(w_en), .up_down_n(w_dir)
    );

    contador u_cnt (
        .clk(CLOCK_50), .rst_n(rst_n), 
        .en(w_en), .dir(w_dir), 
        .TC(LEDG[3]),
        .count(LEDR)
    );
endmodule

module contador (
    input clk,
    input rst_n,
    input en,
    input dir,
    output TC,
    output reg [3:0] count
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) 
            count <= 4'b0000;
        else if (en) begin
            if (dir) count <= count + 1;
            else     count <= count - 1;
        end
    end
    assign TC=dir?(count==4'b1111)&en: (count==4'b0000)&en;
endmodule

module FSM_MOORE(
    input wire clk,
    input wire reset_n,
    input wire KEY2,
    input wire TC,
    output reg enable_cnt,
    output [2:0]estado,
    output reg up_down_n
);
    parameter S0 = 3'b000, S1 = 3'b001, S2 = 3'b010, S3 = 3'b011, S4 = 3'b100, S5 = 3'b101, S2pre=3'b110, S3pre=3'b111;
    reg [2:0] state;
    wire [1:0] aux_input={KEY2,TC};

    always@(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            state <= S0;
        end else begin
            case (state)
                S0: if (aux_input[1]==1'b0)state <= S2;
                S1: if (aux_input[1]== 1'b0) state<=S3; 
                S2: if (aux_input==2'b10) state<=S0; else if (aux_input==2'b01) state<=S3pre; else state<=S4;
                S3: if (aux_input==2'b10) state<=S1; else if (aux_input==2'b01) state<=S2pre; else state<=S5;
                S2pre: state<=S2;
                S3pre: state<=S3;
                S4: begin if (aux_input[1]== 1'b1) state<=S0; end
                S5: begin if (aux_input[1]== 1'b1) state<=S1; end
                default: state <= S0;
            endcase
        end
    end
    always@(state,aux_input) begin
        enable_cnt = 1'b0;
        up_down_n = 1'b1;
        case (state)
            S2, S2pre: begin enable_cnt = 1'b1; up_down_n = 1'b1; end
            S3, S3pre: begin enable_cnt = 1'b1; up_down_n = 1'b0; end
            S0,S4: begin enable_cnt = 1'b0; up_down_n = 1'b1; end
            S1,S5: begin enable_cnt = 1'b0; up_down_n = 1'b0; end   
            default: begin enable_cnt = 1'b0; up_down_n = 1'b1; end 
        endcase
    end
    assign estado=state;
endmodule
