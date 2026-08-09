module mi_modulo_top(
    input wire sw0,
    output wire led0
);
    // El LED copia el valor del Switch
    assign led0 = sw0;
endmodule
