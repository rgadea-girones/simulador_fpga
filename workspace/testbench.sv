module tb_mailbox_comm;
    import oop_pkg::*;
    initial begin
        $display("=== Curiosidad: Paso de Objetos vía Mailbox ===");
        begin
            mailbox mbx = new(1); // Buzón de tamaño 1
            Transaccion tx_env = new(77);
            Transaccion tx_rec;
            
            mbx.put(tx_env);
            mbx.get(tx_rec);
            
            $display("Transacción recibida del mailbox exitosamente con ID: %0d", tx_rec.id);
        end
    end
endmodule