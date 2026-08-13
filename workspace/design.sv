// Slide 3: Clases y Objetos
package oop_pkg;
    class BusTran;
        // Propiedades de la clase (o variables)
        logic [31:0] addr;
        logic [31:0] crc;
        logic [31:0] data[8];

        // Métodos de la clase
        task display();
            $display("BusTran: addr = %0h, crc = %0h", addr, crc);
        endtask : display

        function void compute_crc();
            crc = addr ^ data[0];
        endfunction : compute_crc
    endclass : BusTran
endpackage : oop_pkg