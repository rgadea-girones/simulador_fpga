module top_system(
    input clk,
    input [3:0] KEY,
    input [9:0] SW,
    output [9:0] LEDR,
    output [9:0] LEDG,
    output [6:0] HEX0, HEX1, HEX2, HEX3, HEX4, HEX5, HEX6, HEX7
);
    // Ejemplo: LEDs y HEX reaccionan a los switches
    assign LEDR = SW;
    assign LEDG = ~SW; // LED Verde inverso
    assign HEX0 = SW[0] ? 7'b1000000 : 7'b1111111;
    assign HEX1 = SW[1] ? 7'b1111001 : 7'b1111111;
    assign HEX2 = SW[2] ? 7'b0100100 : 7'b1111111;
    assign HEX3 = SW[3] ? 7'b0110000 : 7'b1111111;
    assign HEX4 = SW[4] ? 7'b0011001 : 7'b1111111;
    assign HEX5 = SW[5] ? 7'b0010010 : 7'b1111111;
    assign HEX6 = SW[6] ? 7'b0000010 : 7'b1111111;
    assign HEX7 = SW[7] ? 7'b1111000 : 7'b1111111;
endmodule