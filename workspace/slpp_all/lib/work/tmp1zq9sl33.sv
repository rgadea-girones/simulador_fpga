module mux21 (
    input  logic a,
    input  logic b,
    input  logic sel,
    output logic y
);

    always_comb
    if(sel)
    y=a;
    else
    y=b;

endmodule