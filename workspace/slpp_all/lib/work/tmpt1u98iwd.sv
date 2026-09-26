module mux21 (
    input  logic a,
    input  logic b,
    input  logic sel,
    output logic y2,
    output logic y
);

    assign y = sel ? b : a;

    always_comb 
        if(sel)
            y2=b;


endmodule