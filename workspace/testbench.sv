module tb_fsm;

    logic clk, rst_n, bit_in, detect_out;

    detector_secuencia_101 uut (.*);

    always #5 clk = ~clk;

    initial begin
        $display("=== Simulación FSM Detector '101' ===");
        $monitor("T=%0t | in=%b state=%b => detect=%b", $time, bit_in, uut.current_state, detect_out);

        clk = 0; rst_n = 0; bit_in = 0;
        #12 rst_n = 1;
        
        // Secuencia input: 0, 1, 0, 1, 1, 0, 1, 0
        #10 bit_in = 0;
        #10 bit_in = 1;
        #10 bit_in = 0;
        #10 bit_in = 1; // Aquí se detecta 101
        #10 bit_in = 1; 
        #10 bit_in = 0;
        #10 bit_in = 1; // Aquí se detecta otro 101
        #10 bit_in = 0;
        
        #20 $finish;
    end
endmodule