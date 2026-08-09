module tb_flipflop_d;

    logic clk;
    logic rst_n;
    logic d;
    logic q;

    flipflop_d uut (
        .clk   (clk),
        .rst_n (rst_n),
        .d     (d),
        .q     (q)
    );

    always #5 clk = ~clk;

    initial begin
        clk   = 0;
        rst_n = 0;
        d     = 0;

        $display("=== Inicio de la simulación del Flip-Flop D ===");
        #12 rst_n = 1;
        #8 d = 1;
        #10;
        $display("T=%0t | D=%b => Q=%b", $time, d, q);
        #10 d = 0;
        #10;
        $display("T=%0t | D=%b => Q=%b", $time, d, q);
        #5 rst_n = 0;
        #2;
        $display("T=%0t | Reset asíncrono activado => Q=%b", $time, q);
        #10 rst_n = 1;
        #20;
        $display("=== Fin de la simulación ===");
        $finish;
    end

endmodule