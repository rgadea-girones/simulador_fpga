

// Testbench VERILOG PURO para detector 1011 (Moore)
module tb;
  reg clk = 0;
  reg rst = 0;
  reg din = 0;
  wire detect;
  wire detect_golden;



reg veredicto;


localparam USER_SEQ= 11'b10111011111 ;
localparam USER_LENGTH = 11;
localparam [3:0]SECUENCIA_A_DETECTAR = 4'b1011; // Máximo número de bits en la secuencia de prueba


  fsm dut(.clk(clk), .rst(rst), .din(din), .detect(detect));

  always #5 clk = ~clk;

  initial begin
    veredicto = 1'b1; // Asumimos que el test pasa hasta que se demuestre lo contrario
    clk=1'b0;
    rst=1'b1;
    #2;
    rst = 0;
    $dumpfile("wave.vcd");
    $dumpvars(0, tb);

    @(negedge clk);
    rst = 1;

    test_sequence(USER_SEQ, USER_LENGTH);

      @(negedge clk);
    if (veredicto)      $display("TEST PASSED");
    else      $display("TEST FAILED");
    $finish;
  end
  reg [3:0] golden;

  // Golden shift register
  always @(posedge clk or negedge rst) begin
    if (!rst)
      golden <= 4'b0;
    else
      golden <= {golden[2:0], din};
  end

assign detect_golden = (golden == SECUENCIA_A_DETECTAR) ? 1'b1 : 1'b0; // Detecta la secuencia '1011


always @(negedge clk) 
     if (detect !== detect_golden ) begin
        $display("Error: detect = %b, expected = %b at time %t", detect, detect_golden, $time);
        veredicto = 1'b0;

    end

  task automatic test_sequence(input reg [31:0] seq, input integer length);
    integer i;
    begin
      for (i = length - 1; i >= 0; i = i - 1) begin
        din = seq[i];
        @(negedge clk);
      end
    end
endtask
endmodule