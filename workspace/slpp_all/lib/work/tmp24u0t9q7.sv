
module top_system (
    input CLOCK_50,
    input [2:0] KEY,
    output [3:0] LEDG,
    output [3:0] LEDR
);
    wire w_en, w_dir;
    wire rst_n;
    wire btn_up;
    assign rst_n = KEY[0];
    assign btn_up = KEY[2];

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
            count <= 4'b0000;
        else if (en) begin
            if (dir)
                count <= count + 1'b1;
            else
                count <= count - 1'b1;
        end
    end
    assign TC = dir ? (count == 4'b1111) & en : (count == 4'b0000) & en;
endmodule

module FSM_MOORE (
    input clk, input reset_n, input KEY2, input TC,
    output reg enable_cnt, output [2:0] estado, output reg up_down_n
);
    assign estado = 3'b001;
endmodule
