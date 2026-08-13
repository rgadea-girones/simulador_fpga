/**
 * Simulador OOP SystemVerilog (Has-A / Is-A) - Client Engine
 * 4 Frames Layout: Testbench (sup-izq), Design (sup-der), Transcript (inf-izq), Curiosidades (inf-der)
 */

(function () {
    let ws = null;

    // --- MANEJO DE ESTADOS Y BOTONES ---
    function cambiarEstadoBotones(bloquear) {
        const botones = document.querySelectorAll('.sim-btn');
        botones.forEach(btn => btn.disabled = bloquear);
    }

    function mostrarCargando(tipo) {
        cambiarEstadoBotones(true);
        if (tipo === 'linter') {
            const btn = document.getElementById('btn-linter');
            if (btn) btn.innerText = '🔍 Comprobando...';
        } else if (tipo === 'compilar') {
            const sp = document.getElementById('btn-spinner-compilar');
            const tx = document.getElementById('btn-compilar-texto');
            if (sp) sp.style.display = 'inline-block';
            if (tx) tx.innerText = 'Verificando...';
        }
    }

    function restaurarEstadoBotones() {
        cambiarEstadoBotones(false);
        
        const btnLinter = document.getElementById('btn-linter');
        if (btnLinter) btnLinter.innerText = '🔍 Comprobar (Linter)';

        const spCompilar = document.getElementById('btn-spinner-compilar');
        const txCompilar = document.getElementById('btn-compilar-texto');
        if (spCompilar) spCompilar.style.display = 'none';
        if (txCompilar) txCompilar.innerText = '✅ Verificar';

        const btnAI = document.getElementById('btn-ai-autocomplete');
        if (btnAI) btnAI.innerText = '🤖 Completar IA';
    }

    function initSimulador() {
        const containerDesign = document.getElementById('editor_design');
        const containerTB = document.getElementById('editor_tb');
        if (!containerDesign || !containerTB) return;

        // --- 1. WEBSOCKET ---
        const wsUrl = (typeof SV_HAS_A_IS_A_CONFIG !== 'undefined' && SV_HAS_A_IS_A_CONFIG.ws_url)
            ? SV_HAS_A_IS_A_CONFIG.ws_url
            : 'ws://localhost:8000/ws';

        ws = new WebSocket(wsUrl);
        const est = document.getElementById('estado_ws');

        ws.onopen = () => { 
            if (est) { 
                est.innerText = "🟢 CONECTADO"; 
                est.style.color = "#2ecc71"; 
            } 
        };
        ws.onclose = () => { 
            if (est) { 
                est.innerText = "🔴 DESCONECTADO"; 
                est.style.color = "#e74c3c"; 
            }
            restaurarEstadoBotones();
        };
        ws.onerror = () => { restaurarEstadoBotones(); };

        ws.onmessage = (e) => {
            let r;
            try { r = JSON.parse(e.data); } catch (err) { return; }

            if (r.status || r.tipo === "error") {
                restaurarEstadoBotones();
            }

            if (r.status === "error_compilacion" || r.tipo === "linter_error") {
                if (est) { est.innerText = "🔴 ERROR EN CÓDIGO"; est.style.color = "#e74c3c"; }
                const errorMsg = r.detalles || r.transcript || "Error detectado.";
                setTranscript(errorMsg, true);
                aplicarLinter(errorMsg);
            } 
            else if (r.status === "linter_ok") {
                if (est) { est.innerText = "🟢 CÓDIGO CORRECTO"; est.style.color = "#2ecc71"; }
                limpiarMarcadores();
                setTranscript(r.transcript || "✓ Sintaxis verificada correctamente sin errores.", false);
            }
            else if (r.status === "compilado_ok") {
                if (est) { est.innerText = "🟢 VERIFICACIÓN COMPLETADA"; est.style.color = "#2ecc71"; }
                limpiarMarcadores();
                setTranscript(r.transcript || "=== Verificación completada ===", false);
            }
            else if (r.tipo === "transcript") {
                appendTranscript(r.contenido || r.transcript, false);
            }
            else if (r.tipo === "autocompletar_respuesta") {
                restaurarEstadoBotones();
                insertarAutocompletado(r.completion, r.id);
            }
        };

        // --- 2. MONACO IFRAMES GENERATOR ---
        function crearFrameMonaco(container, idInstancia, codigoInicial) {
            container.innerHTML = '';
            const iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            container.appendChild(iframe);

            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        html, body, #editor-internal {
                            width: 100%; height: 100%; margin: 0; padding: 0;
                            overflow: hidden; background-color: #1e1e1e;
                        }
                    </style>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/loader.min.js"></script>
                </head>
                <body>
                    <div id="editor-internal"></div>
                    <script>
                        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' } });
                        require(['vs/editor/editor.main'], function () {
                            window.editor = monaco.editor.create(document.getElementById('editor-internal'), {
                                value: \`${codigoInicial}\`,
                                language: 'verilog',
                                theme: 'vs-dark',
                                automaticLayout: true,
                                minimap: { enabled: false }
                            });

                            window.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
                                window.parent.postMessage({ accion: 'linter' }, '*');
                            });
                        });
                    </script>
                </body>
                </html>
            `;

            iframeDoc.open();
            iframeDoc.write(htmlContent);
            iframeDoc.close();

            return iframe;
        }

        // --- 3. DEFINICIÓN DE EJEMPLOS UVM DIAPOSITIVAS Y EXTRAS ---
        const examples = {
            clases: {
                design: `// Slide 3: Clases y Objetos
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
endpackage : oop_pkg`,
                tb: `module tb_classes;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Declaración de Clase (Slide 3) ===");
        // La simulación de instancias de esta clase se realiza en el siguiente ejemplo
    end
endmodule`,
                info: `<h3>Slide 3: Clases y Objetos</h3>
                <p>Las clases agrupan variables (propiedades) y subrutinas (métodos) bajo un mismo tipo de dato.</p>
                <ul>
                    <li>Las propiedades definen el estado del objeto.</li>
                    <li>Los métodos definen el comportamiento de este.</li>
                </ul>`
            },
            objetos: {
                design: `// Slide 4: Objetos
package oop_pkg;
    class BusTran;
        logic [31:0] addr;
        logic [31:0] crc;
        logic [31:0] data[8];

        task display();
            $display("BusTran: addr = %0h, crc = %0h", addr, crc);
        endtask : display

        function void compute_crc();
            crc = addr ^ data[0];
        endfunction : compute_crc
    endclass : BusTran
endpackage : oop_pkg`,
                tb: `module tb_objects;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Creación de Objetos (Slide 4) ===");
        begin
            BusTran btran; // Declara un handle null (valor null)
            btran = new;   // Crea un objeto BusTran y hace que btran apunte a él
                           // Inicializa todas las variables del objeto a 'X o valor por defecto
            
            btran.addr = 32'h127;
            btran.data[0] = 32'hA5A5;
            btran.compute_crc();
            
            btran.display();
        end
    end
endmodule`,
                info: `<h3>Slide 4: Objetos e Instanciación</h3>
                <p>Un handle de objeto es como un puntero seguro. Declarar <code>BusTran btran;</code> no crea espacio en memoria (es <code>null</code>).</p>
                <p>La llamada a <code>new</code> crea el objeto dinámicamente en memoria y hace que el handle apunte a él.</p>`
            },
            constructor_sin_args: {
                design: `// Slide 5 Izq: Constructor sin argumentos
package oop_pkg;
    class BusTran;
        logic [31:0] addr;
        logic [31:0] crc;
        logic [31:0] data[8];

        // Constructor sin argumentos
        function new();
            addr = 0;
            foreach (data[i]) data[i] = 0;
        endfunction : new

        task display();
            $display("BusTran (Sin Args): addr = %0d, data[0] = %0d", addr, data[0]);
        endtask
    endclass : BusTran
endpackage : oop_pkg`,
                tb: `module tb_constructor_sin_args;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Constructor sin argumentos (Slide 5 Izq) ===");
        begin
            BusTran btran;
            btran = new(); // Llama al constructor personalizado
            btran.display();
        end
    end
endmodule`,
                info: `<h3>Slide 5 Izq: Constructor sin Argumentos</h3>
                <p>La función <code>new()</code> inicializa el objeto. No tiene tipo de retorno explícito y devuelve el objeto construido.</p>
                <p>En este ejemplo, se definen valores iniciales seguros para evitar indeterminaciones <code>'X</code>.</p>`
            },
            constructor_con_args: {
                design: `// Slide 5 Der: Constructor con argumentos
package oop_pkg;
    class BusTran;
        logic [31:0] addr;
        logic [31:0] crc;
        logic [31:0] data[8];

        // Constructor con argumentos y valores por defecto
        function new(logic [31:0] addr = 0, logic [31:0] val = 0);
            this.addr = addr;
            foreach (this.data[i]) this.data[i] = val;
        endfunction : new

        task display();
            $display("BusTran (Con Args): addr = %0h, data[0-7] = %0h", addr, data[0]);
        endtask
    endclass : BusTran
endpackage : oop_pkg`,
                tb: `module tb_constructor_con_args;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Constructor con argumentos (Slide 5 Der) ===");
        begin
            BusTran btran;
            btran = new(.addr('h42), .val('hFF)); // Llama especificando argumentos
            btran.display();
        end
    end
endmodule`,
                info: `<h3>Slide 5 Der: Constructor con Argumentos</h3>
                <p>Permite pasar parámetros al inicializar. Podemos usar <code>this.propiedad</code> para distinguir los nombres si colisionan con los argumentos.</p>`
            },
            gestion_memoria: {
                design: `// Slide 6: Gestión de la memoria
package oop_pkg;
    class BusTran;
        logic [31:0] addr;
        
        function new(logic [31:0] addr = 0);
            this.addr = addr;
        endfunction
    endclass : BusTran
endpackage : oop_pkg`,
                tb: `module tb_memory_management;
    import oop_pkg::*;
    task do_something;
        BusTran b;
        b = new('h111);
        $display("  [do_something] b creado con addr = %0h", b.addr);
    endtask : do_something

    initial begin
        $display("=== Simulación: Gestión de Memoria (Slide 6) ===");
        begin
            BusTran btran;
            $display("1. Creando primer objeto...");
            btran = new;
            
            $display("2. Creando segundo objeto...");
            btran = new; 
            
            $display("3. Asignando handle a null...");
            btran = null;
            
            $display("4. Ejecutando tarea con ámbito local:");
            do_something();
            $display("Fin de la demostración.");
        end
    end
endmodule`,
                info: `<h3>Slide 6: Gestión de Memoria</h3>
                <p>SystemVerilog tiene recolección automática de basura (Garbage Collector). Cuando un objeto ya no tiene ningún handle apuntándole, el simulador libera su memoria automáticamente.</p>`
            },
            variables_estaticas: {
                design: `// Slide 8: Variables estáticas de clase
package oop_pkg;
    class BusTran;
        static int count = 0;
        
        logic [31:0] addr;
        int id;

        function new(logic [31:0] addr = 0);
            id = ++count;
            this.addr = addr;
        endfunction : new
    endclass : BusTran
endpackage : oop_pkg`,
                tb: `module tb_static_variables;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Variables Estáticas (Slide 8) ===");
        begin
            BusTran::count = 10;
            $display("Count inicializado a %0d", BusTran::count);

            begin
                BusTran b1, b2;
                b1 = new('hAAAA);
                $display("b1 creado: id=%0d, count=%0d", b1.id, b1.count);
                
                b2 = new('hBBBB);
                $display("b2 creado: id=%0d, count=%0d", b2.id, b2.count);
            end
        end
    end
endmodule`,
                info: `<h3>Slide 8: Variables de Clase Estáticas</h3>
                <p>Las propiedades declaradas con <code>static</code> son compartidas por todas las instancias de la clase. Hay una sola copia física en memoria.</p>`
            },
            variables_constantes: {
                design: `// Slide 9: Variables de clase constantes
package oop_pkg;
    class Packet;
        const int MAX_SIZE = 1024;
        const int SIZE;
        byte payload[];

        function new(int size_in = 100);
            SIZE = (size_in > MAX_SIZE) ? MAX_SIZE : size_in;
            payload = new[SIZE];
        endfunction : new
    endclass : Packet
endpackage : oop_pkg`,
                tb: `module tb_constant_variables;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Variables Constantes (Slide 9) ===");
        begin
            Packet p1 = new(50);
            Packet p2 = new(2000);
            
            $display("Packet 1: SIZE=%0d (Max: %0d)", p1.SIZE, p1.MAX_SIZE);
            $display("Packet 2: SIZE=%0d (Limitado por MAX_SIZE)", p2.SIZE);
        end
    end
endmodule`,
                info: `<h3>Slide 9: Variables Constantes</h3>
                <p>Una variable <code>const</code> no puede modificarse tras su inicialización.</p>
                <ul>
                    <li>Constantes globales/estáticas: Se asignan en su declaración.</li>
                    <li>Constantes de instancia: Se pueden asignar una sola vez en el constructor.</li>
                </ul>`
            },
            metodos_estaticos: {
                design: `// Slide 10: Métodos Estáticos
package oop_pkg;
    class BusTran;
        static int count = 0;
        
        static function int next_id();
            next_id = ++count;
        endfunction : next_id
    endclass : BusTran
endpackage : oop_pkg`,
                tb: `module tb_static_methods;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Métodos Estáticos (Slide 10) ===");
        begin
            int next;
            next = BusTran::next_id();
            $display("ID siguiente obtenido estáticamente: %0d", next);
        end
    end
endmodule`,
                info: `<h3>Slide 10: Métodos Estáticos</h3>
                <p>Un método <code>static</code> puede llamarse usando el nombre de la clase (<code>Clase::metodo()</code>). No tiene acceso a propiedades o métodos no estáticos.</p>`
            },
            encapsulacion: {
                design: `// Slide 11 & 12: Encapsulación
package oop_pkg;
    class BusTran;
        local int id;
        
        function new(int id);
            this.id = id;
        endfunction

        function int compare_id(BusTran b);
            compare_id = (this.id == b.id);
        endfunction : compare_id
    endclass : BusTran
endpackage : oop_pkg`,
                tb: `module tb_encapsulation;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Encapsulación (Slide 11) ===");
        begin
            BusTran b1 = new(45);
            BusTran b2 = new(45);
            
            if (b1.compare_id(b2)) begin
                $display("Los IDs de las transacciones coinciden!");
            end else begin
                $display("Los IDs son diferentes.");
            end
        end
    end
endmodule`,
                info: `<h3>Slide 11 & 12: Data Hiding y Encapsulación</h3>
                <p>Por defecto, todos los miembros de una clase son públicos.</p>
                <ul>
                    <li><code>local</code>: Solo accesible desde métodos de la misma clase.</li>
                    <li><code>protected</code>: Accesible desde la clase y sus derivadas (subclases).</li>
                </ul>`
            },
            relacion_has_a: {
                design: `// Slide 13: Subclases (Relación "Has a")
package oop_pkg;
    class Statistics;
        time start_time;
        static int ntrans = 0;

        task start();
            start_time = $time;
        endtask

        function time duration();
            ntrans++;
            return $time - start_time;
        endfunction
    endclass : Statistics

    class BusTran;
        logic [31:0] addr;
        Statistics stats;

        function new();
            stats = new();
        endfunction : new

        task send_packet();
            stats.start();
            #25;
            $display("Transmisión finalizada. Duración: %0t ns (Total Transacciones: %0d)", stats.duration(), stats.ntrans);
        endtask : send_packet
    endclass : BusTran
endpackage : oop_pkg`,
                tb: `module tb_has_a;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Relación 'Has a' (Slide 13) ===");
        begin
            BusTran btran = new();
            btran.send_packet();
        end
    end
endmodule`,
                info: `<h3>Slide 13: Relación "Has A" (Composición)</h3>
                <p>Ocurre cuando una clase contiene una propiedad que hace referencia a una instancia de otra clase. Útil para delegar responsabilidades.</p>`
            },
            relacion_is_a: {
                design: `// Slide 14 & 15: Clases Derivadas (Relación "Is a")
package oop_pkg;
    class BusTran;
        logic [31:0] addr;
        logic [31:0] crc;
        logic [31:0] data[8];
        int id;
        
        function new();
            id = 99;
        endfunction
    endclass : BusTran

    class PCITran extends BusTran;
        logic [31:0] pci_data;

        function new();
            super.new();
            pci_data = 32'hC0DE;
        endfunction : new
    endclass : PCITran
endpackage : oop_pkg`,
                tb: `module tb_is_a;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Herencia 'Is a' (Slide 14-15) ===");
        begin
            BusTran b;
            PCITran p;
            
            b = new(); 
            p = new();
            
            b.data[0] = 7;
            
            // ATENCIÓN: La línea de abajo causará un fallo de compilación si se descomenta:
            // b.pci_data = 9; // ILEGAL: El padre no tiene pci_data.
            
            $display("ID en la clase padre: %0d", b.id);
            $display("ID en la clase derivada (hija): %0d", p.id);
        end
    end
endmodule`,
                info: `<h3>Slide 14 & 15: Herencia y "Is A"</h3>
                <p><strong>¿Por qué fallaba el ejemplo de la diapositiva?</strong></p>
                <p>En el código original de la diapositiva 14 se intenta hacer <code>b.data = 9;</code>. Como <code>b</code> es de tipo <code>BusTran</code> y su propiedad <code>data</code> está declarada como un array (<code>data[8]</code>), asignar un número escalar directamente es ilegal y provoca un fallo de compilación.</p>
                <p>Hemos comentado esa sección para que el código compile, y puedes probar a descomentarla para observar el error del compilador.</p>`
            },
            downcasting: {
                design: `// Slide 16: Downcasting seguro con $cast
package oop_pkg;
    class MiClaseBase;
        virtual function void print_tipo();
            $display("Soy un objeto MiClaseBase");
        endfunction
    endclass

    class MiClaseDerivada extends MiClaseBase;
        function void print_tipo();
            $display("Soy un objeto MiClaseDerivada (Hijo)");
        endfunction
        
        function void metodo_hijo();
            $display("Método exclusivo del hijo ejecutado con éxito.");
        endfunction
    endclass
endpackage : oop_pkg`,
                tb: `module tb_downcasting;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Downcasting seguro ($cast) (Slide 16) ===");
        begin
            MiClaseBase handle_base;
            MiClaseDerivada handle_derivado;
            MiClaseDerivada obj_derivado = new();

            handle_base = obj_derivado; // Upcasting automático

            if ($cast(handle_derivado, handle_base)) begin
                $display("¡Downcasting exitoso!");
                handle_derivado.metodo_hijo();
            end else begin
                $display("Error: Downcasting fallido.");
            end
        end
    end
endmodule`,
                info: `<h3>Slide 16: Casting con $cast</h3>
                <p>No se puede asignar un handle base a un handle derivado directamente. Se debe usar la función del sistema <code>$cast(destino, origen)</code> para realizar la comprobación en tiempo de ejecución de manera segura.</p>`
            },
            shallow_copy: {
                design: `// Slide 18: Shallow Copy (Copia Superficial)
package oop_pkg;
    class Header;
        int len = 15;
    endclass

    class Packet;
        Header hdr;
        int id;

        function new();
            id = 1;
            hdr = new();
        endfunction
    endclass
endpackage : oop_pkg`,
                tb: `module tb_shallow_copy;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Copia Superficial (Slide 18) ===");
        begin
            Packet p1 = new();
            Packet p2;
            
            $display("[Inicial] p1.id=%0d, p1.hdr.len=%0d", p1.id, p1.hdr.len);
            
            p2 = new p1; // Copia superficial
            $display("[Copia] p2.id=%0d, p2.hdr.len=%0d", p2.id, p2.hdr.len);
            
            p2.hdr.len = 99;
            p2.id = 25;
            
            $display("--- Después de modificar p2 ---");
            $display("[Resultado p2] p2.id=%0d, p2.hdr.len=%0d", p2.id, p2.hdr.len);
            $display("[Resultado p1] p1.id=%0d, p1.hdr.len=%0d (¡Cabecera compartida modificada!)", p1.id, p1.hdr.len);
        end
    end
endmodule`,
                info: `<h3>Slide 18: Shallow Copy</h3>
                <p>La expresión <code>destino = new origen;</code> copia las variables por valor, pero para objetos anidados solo copia su handle (referencia), por lo que ambos objetos terminan compartiendo la misma sub-instancia.</p>`
            },
            deep_copy: {
                design: `// Slide 20: Deep Copy (Copia Profunda)
package oop_pkg;
    class Header;
        int len = 15;
        
        function void copy(Header other);
            this.len = other.len;
        endfunction
    endclass

    class Packet;
        Header hdr;
        int id;

        function new();
            id = 1;
            hdr = new();
        endfunction

        function void copy(Packet other);
            this.id = other.id;
            this.hdr.copy(other.hdr);
        endfunction
    endclass
endpackage : oop_pkg`,
                tb: `module tb_deep_copy;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Copia Profunda (Slide 20) ===");
        begin
            Packet p1 = new();
            Packet p2 = new();
            
            $display("[Inicial] p1.id=%0d, p1.hdr.len=%0d", p1.id, p1.hdr.len);
            
            p2.copy(p1);
            $display("[Copia] p2.id=%0d, p2.hdr.len=%0d", p2.id, p2.hdr.len);
            
            p2.hdr.len = 99;
            $display("--- Después de modificar p2 ---");
            $display("[Resultado p2] p2.id=%0d, p2.hdr.len=%0d", p2.id, p2.hdr.len);
            $display("[Resultado p1] p1.id=%0d, p1.hdr.len=%0d (¡Permanece intacto!)", p1.id, p1.hdr.len);
        end
    end
endmodule`,
                info: `<h3>Slide 20: Deep Copy</h3>
                <p>Para copiar los objetos internos y que no compartan referencias, se debe crear un método personalizado (usualmente llamado <code>copy</code>) que replique recursivamente todas las instancias internas.</p>`
            },
            clonado: {
                design: `// Slide 22: Clonado con .clone()
package oop_pkg;
    class Header;
        int len = 15;
        function void copy(Header other);
            this.len = other.len;
        endfunction
    endclass

    class Packet;
        Header hdr;
        int id;

        function new();
            id = 1;
            hdr = new();
        endfunction

        function void copy(Packet other);
            this.id = other.id;
            this.hdr.copy(other.hdr);
        endfunction

        function Packet clone();
            clone = new();
            clone.copy(this);
        endfunction
    endclass
endpackage : oop_pkg`,
                tb: `module tb_clonado;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Clonado (Slide 22) ===");
        begin
            Packet p1 = new();
            Packet p2;
            
            $display("[Inicial] p1.id=%0d, p1.hdr.len=%0d", p1.id, p1.hdr.len);
            
            p2 = p1.clone();
            $display("[Copia] p2.id=%0d, p2.hdr.len=%0d", p2.id, p2.hdr.len);
            
            p2.hdr.len = 99;
            $display("--- Después de modificar p2 ---");
            $display("[Resultado p2] p2.id=%0d, p2.hdr.len=%0d", p2.id, p2.hdr.len);
            $display("[Resultado p1] p1.id=%0d, p1.hdr.len=%0d", p1.id, p1.hdr.len);
        end
    end
endmodule`,
                info: `<h3>Slide 22: Clonación</h3>
                <p>Una buena convención en SystemVerilog consiste en combinar el constructor <code>new</code> con una función de copia profunda en un método <code>clone()</code> para duplicar objetos en una sola línea de código.</p>`
            },
            metodos_virtuales: {
                design: `// Slide 23: Métodos Virtuales y Polimorfismo
package oop_pkg;
    class Animal;
        virtual function void hacerSonido();
            $display("Sonido genérico de animal");
        endfunction
    endclass

    class Perro extends Animal;
        function void hacerSonido();
            $display("Guau!");
        endfunction
    endclass
endpackage : oop_pkg`,
                tb: `module tb_virtual_methods;
    import oop_pkg::*;
    initial begin
        $display("=== Simulación: Métodos Virtuales (Slide 23) ===");
        begin
            Animal a;
            Perro p = new();
            
            a = p; // Upcasting
            
            a.hacerSonido();
        end
    end
endmodule`,
                info: `<h3>Slide 23: Métodos Virtuales</h3>
                <p>La directiva <code>virtual</code> permite el ligamiento dinámico en tiempo de ejecución (Dynamic Dispatch). Sin ella, la llamada se resolvería según el tipo de handle y no según el objeto real.</p>`
            },
            
            // --- CURIOSIDADES EXTRAS ---
            extra_virtual_vs_no: {
                design: `// Curiosidad 1: Métodos virtuales vs no virtuales
package oop_pkg;
    class Animal;
        // SIN 'virtual'
        function void hacerSonido();
            $display("Sonido genérico de animal");
        endfunction
    endclass

    class Perro extends Animal;
        function void hacerSonido();
            $display("Guau!");
        endfunction
    endclass
endpackage : oop_pkg`,
                tb: `module tb_extra_virtual_vs_no;
    import oop_pkg::*;
    initial begin
        $display("=== Curiosidad: Comportamiento SIN la palabra clave 'virtual' ===");
        begin
            Animal a;
            Perro p = new();
            
            a = p; // Upcasting
            
            a.hacerSonido(); // Al no ser virtual, se decide en compilación -> ¡Imprime el padre!
        end
    end
endmodule`,
                info: `<h3>Curiosidad 1: Métodos no virtuales</h3>
                <p>Prueba a ejecutar este ejemplo: Al quitar la palabra <code>virtual</code>, el compilador ignora que el objeto en memoria es un <code>Perro</code> e invoca la subrutina del handle (<code>Animal</code>).</p>
                <p>Esto demuestra por qué <code>virtual</code> es imprescindible en UVM y en cualquier diseño OOP polimórfico.</p>`
            },
            extra_super_args: {
                design: `// Curiosidad 2: super.new con argumentos
package oop_pkg;
    class Base;
        int valor;
        function new(int v);
            valor = v;
        endfunction
    endclass

    class Hija extends Base;
        int multiplicador;
        
        // El constructor debe invocar super.new pasando el argumento correspondiente
        function new(int v, int m);
            super.new(v); // Obligatorio pasar el valor a la clase base
            multiplicador = m;
        endfunction
        
        function int resultado();
            return valor * multiplicador;
        endfunction
    endclass
endpackage : oop_pkg`,
                tb: `module tb_super_args;
    import oop_pkg::*;
    initial begin
        $display("=== Curiosidad: super.new con argumentos ===");
        begin
            Hija h = new(10, 5);
            $display("Resultado del cálculo: %0d", h.resultado());
        end
    end
endmodule`,
                info: `<h3>Curiosidad 2: Inicialización con Argumentos</h3>
                <p>Si la clase base tiene un constructor que requiere argumentos, la clase derivada está obligada a invocar <code>super.new(...)</code> pasándole dichos valores.</p>`
            },
            extra_local_vs_protected: {
                design: `// Curiosidad 3: Local vs Protected
package oop_pkg;
    class Padre;
        local int var_local = 1;
        protected int var_protected = 2;
    endclass

    class Hija extends Padre;
        function void mostrar();
            // $display("var_local = %0d", var_local); // ILEGAL: local no es visible en hijas
            $display("var_protected = %0d (Acceso correcto desde subclase)", var_protected); // LEGAL
        endfunction
    endclass
endpackage : oop_pkg`,
                tb: `module tb_local_protected;
    import oop_pkg::*;
    initial begin
        $display("=== Curiosidad: Local vs Protected ===");
        begin
            Hija h = new();
            h.mostrar();
        end
    end
endmodule`,
                info: `<h3>Curiosidad 3: Encapsulación en Herencia</h3>
                <p>Tanto <code>local</code> como <code>protected</code> ocultan las variables al exterior de la clase.</p>
                <p>Sin embargo, las subclases heredan y tienen acceso a miembros <code>protected</code>, mientras que los miembros <code>local</code> son estrictamente inaccesibles fuera de la clase padre original.</p>`
            },
            extra_shallow_deep_arrays: {
                design: `// Curiosidad 4: Copias con arrays de objetos (handles)
package oop_pkg;
    class Elemento;
        int valor;
        function new(int v);
            valor = v;
        endfunction
    endclass

    class Packet;
        Elemento payload[3];
        
        function new();
            foreach (payload[i]) begin
                payload[i] = new((i+1)*10);
            end
        endfunction
    endclass
endpackage : oop_pkg`,
                tb: `module tb_shallow_deep_arrays;
    import oop_pkg::*;
    initial begin
        $display("=== Curiosidad: Copia superficial con array de OBJETOS ===");
        begin
            Packet p1 = new();
            Packet p2 = new p1; // Copia superficial (crea nuevo array de handles)
            
            p2.payload[0].valor = 99; // Modifica el objeto apuntado por el handle
            
            $display("p1.payload[0].valor = %0d (¡Modificado a 99 porque los handles son compartidos!)", p1.payload[0].valor);
        end
    end
endmodule`,
                info: `<h3>Curiosidad 4: Copias de Arrays de Objetos (Handles)</h3>
                <p>En SystemVerilog, al hacer <code>new</code> de un objeto que tiene un array de handles de objetos (ej. <code>Elemento payload[3]</code>), la copia superficial (<i>Shallow Copy</i>) copia los handles del array por valor (apuntan a las mismas sub-instancias en memoria).</p>
                <p>Por lo tanto, modificar una propiedad dentro de <code>p2.payload[0]</code> afectará también a <code>p1.payload[0]</code>, ya que ambos apuntan al mismo objeto en memoria.</p>`
            },
            extra_mailbox_comunicacion: {
                design: `// Curiosidad 5: Mailbox y Transacciones
package oop_pkg;
    class Transaccion;
        int id;
        function new(int id);
            this.id = id;
        endfunction
    endclass
endpackage : oop_pkg`,
                tb: `module tb_mailbox_comm;
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
endmodule`,
                info: `<h3>Curiosidad 5: Mailboxes en Verificación</h3>
                <p>Los <code>mailbox</code> son canales fifo seguros para hilos (threads) que permiten pasar objetos de transacciones de un componente (ej. Generador) a otro (ej. Driver).</p>`
            },
            extra_constraint_random: {
                design: `// Curiosidad 6: Constraint Randomization
package oop_pkg;
    class Transaccion;
        rand bit [7:0] valor;
        
        constraint c_limite {
            valor inside {[10:50]}; // Rango acotado
        }
    endclass
endpackage : oop_pkg`,
                tb: `module tb_constraint_random;
    import oop_pkg::*;
    initial begin
        $display("=== Curiosidad: Randomización Acotada ===");
        begin
            Transaccion tx = new();
            repeat(3) begin
                if (tx.randomize()) begin
                    $display("Valor aleatorio generado dentro del rango [10:50]: %0d", tx.valor);
                end
            end
        end
    end
endmodule`,
                info: `<h3>Curiosidad 6: Generación Aleatoria de Estímulos</h3>
                <p>La randomización de propiedades declaradas como <code>rand</code> es una característica nativa clave de SystemVerilog para la verificación aleatoria (CRV - Constraint Random Verification).</p>`
            }
        };

        const iframeTB = crearFrameMonaco(containerTB, 'tb', examples.clases.tb);
        const iframeDesign = crearFrameMonaco(containerDesign, 'design', examples.clases.design);

        // Actualizar explicación inicial
        const panelInfo = document.getElementById('panel-explicaciones');
        if (panelInfo) {
            panelInfo.innerHTML = examples.clases.info;
        }

        // Actualizar editores e información al cambiar de ejemplo
        const selectEjemplo = document.getElementById('ejemplos-has-a-is-a');
        if (selectEjemplo) {
            selectEjemplo.addEventListener('change', (e) => {
                const ej = examples[e.target.value];
                if (ej) {
                    if (iframeDesign.contentWindow && iframeDesign.contentWindow.editor) {
                        iframeDesign.contentWindow.editor.setValue(ej.design);
                    }
                    if (iframeTB.contentWindow && iframeTB.contentWindow.editor) {
                        iframeTB.contentWindow.editor.setValue(ej.tb);
                    }
                    if (panelInfo) {
                        panelInfo.innerHTML = ej.info;
                    }
                    limpiarMarcadores();
                    setTranscript("=== Código cargado desde ejemplos ===", false);
                }
            });
        }

        // --- 4. ACCIONES Y ENLACES ---
        window.addEventListener('message', (event) => {
            if (!event.data || !event.data.accion) return;
            if (event.data.accion === 'linter') {
                ejecutarLinter();
            }
        });

        function obtenerCodigo(iframe) {
            if (iframe && iframe.contentWindow && iframe.contentWindow.editor) {
                return iframe.contentWindow.editor.getValue();
            }
            return '';
        }

        function setTranscript(texto, esError = false) {
            const transcript = document.getElementById('simulation-transcript');
            if (!transcript) return;
            const color = esError ? '#e74c3c' : '#2ecc71';
            transcript.innerHTML = `<span style="color: ${color};">${texto}</span>`;
            transcript.scrollTop = transcript.scrollHeight;
        }

        function compilarCodigo() {
            const codeDesign = obtenerCodigo(iframeDesign);
            const codeTB = obtenerCodigo(iframeTB);

            if (!ws || ws.readyState !== WebSocket.OPEN) {
                setTranscript("❌ Error: WebSocket desconectado.", true);
                return;
            }

            mostrarCargando('compilar');
            limpiarMarcadores();
            setTranscript("⚙️ Compilando módulos y ejecutando simulación...", false);

            ws.send(JSON.stringify({
                accion: "compilar",
                codigo: codeDesign,
                testbench: codeTB
            }));
        }

        function appendTranscript(texto, esError = false) {
            const transcript = document.getElementById('simulation-transcript');
            if (!transcript) return;
            const color = esError ? '#e74c3c' : '#2ecc71';
            transcript.innerHTML += `\n<span style="color: ${color};">${texto}</span>`;
            transcript.scrollTop = transcript.scrollHeight;
        }

        function aplicarLinter(errorText) {
            if (!errorText) return;
            [iframeDesign, iframeTB].forEach(iframe => {
                if (!iframe.contentWindow || !iframe.contentWindow.monaco) return;
                const win = iframe.contentWindow;
                const markers = [];
                const regex = /(?:[a-zA-Z0-9_\-\.]+\.(?:v|sv))\((\d+)\):\s*(.*)/gi;
                let m;

                while ((m = regex.exec(errorText)) !== null) {
                    markers.push({
                        startLineNumber: parseInt(m[1], 10),
                        startColumn: 1,
                        endLineNumber: parseInt(m[1], 10),
                        endColumn: 1000,
                        message: m[2].trim(),
                        severity: win.monaco.MarkerSeverity.Error
                    });
                }
                win.monaco.editor.setModelMarkers(win.editor.getModel(), 'verilog', markers);
            });
        }

        // Limpiar errores marcados en el editor
        function limpiarMarcadores() {
            [iframeDesign, iframeTB].forEach(iframe => {
                if (iframe.contentWindow && iframe.contentWindow.monaco && iframe.contentWindow.editor) {
                    const win = iframe.contentWindow;
                    win.monaco.editor.setModelMarkers(win.editor.getModel(), 'verilog', []);
                }
            });
        }

        // Linter
        function ejecutarLinter() {
            const codeDesign = obtenerCodigo(iframeDesign);
            const codeTB = obtenerCodigo(iframeTB);

            if (!ws || ws.readyState !== WebSocket.OPEN) {
                setTranscript("❌ Error: WebSocket desconectado.", true);
                return;
            }

            mostrarCargando('linter');
            limpiarMarcadores();
            setTranscript("🔍 Comprobando sintaxis con vlog -lint...", false);

            ws.send(JSON.stringify({
                accion: "linter",
                codigo: codeDesign,
                testbench: codeTB
            }));
        }

        // --- ACCIONES DE AUTOCOMPLETADO E CONFIGURACIÓN ---
        function insertarAutocompletado(completion, idEditor) {
            const iframe = (idEditor === 'design') ? iframeDesign : iframeTB;
            if (!iframe || !iframe.contentWindow || !iframe.contentWindow.editor) return;
            
            const win = iframe.contentWindow;
            const editor = win.editor;
            const position = editor.getPosition();
            
            const range = new win.monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
            );
            
            const op = {
                range: range,
                text: completion,
                forceMoveMarkers: true
            };
            
            editor.executeEdits("ai-autocomplete", [op]);
            setTranscript("🤖 Código insertado por el Asistente IA.", false);
        }

        function solicitarAutocompletado() {
            // Determinar qué editor tiene foco actualmente (por defecto design)
            let idEditor = 'design';
            let iframe = iframeDesign;
            
            if (iframeTB.contentWindow && iframeTB.contentWindow.editor && iframeTB.contentWindow.editor.hasTextFocus()) {
                idEditor = 'tb';
                iframe = iframeTB;
            }

            if (!iframe || !iframe.contentWindow || !iframe.contentWindow.editor) return;

            const editor = iframe.contentWindow.editor;
            const position = editor.getPosition();
            const model = editor.getModel();
            
            // Obtener todo el texto desde el principio del archivo hasta la posición del cursor
            const offset = model.getOffsetAt(position);
            const textoPrevio = model.getValue().substring(0, offset);

            if (!textoPrevio.trim()) {
                setTranscript("⚠️ Escribe algo de código antes del cursor para poder autocompletar.", true);
                return;
            }

            if (!ws || ws.readyState !== WebSocket.OPEN) {
                setTranscript("❌ Error: WebSocket desconectado.", true);
                return;
            }

            // Obtener credenciales de PoliGPT guardadas en localStorage
            const poligptEnabled = localStorage.getItem('poligpt_enabled') === 'true';
            const poligptApiKey = localStorage.getItem('poligpt_apikey') || '';
            const poligptApiUrl = localStorage.getItem('poligpt_url') || 'https://poligpt.upv.es/api/v1/chat/completions';
            const poligptModel = localStorage.getItem('poligpt_model') || 'gpt-3.5-turbo';

            if (poligptEnabled && !poligptApiKey.trim()) {
                setTranscript("⚠️ Tienes activado PoliGPT pero la clave API está vacía. Configúrala en el botón de Ajustes ⚙️.", true);
                abrirAjustes();
                return;
            }

            cambiarEstadoBotones(true);
            const btnAI = document.getElementById('btn-ai-autocomplete');
            if (btnAI) btnAI.innerText = '🤖 Completando...';
            
            setTranscript("🤖 Solicitando autocompletado al asistente de IA...", false);

            ws.send(JSON.stringify({
                accion: "autocompletar",
                texto: textoPrevio,
                id: idEditor,
                api_key: poligptEnabled ? poligptApiKey : "",
                api_url: poligptEnabled ? poligptApiUrl : "",
                model: poligptEnabled ? poligptModel : ""
            }));
        }

        // --- MANEJO DE MODAL AJUSTES IA ---
        const modal = document.getElementById('settings-modal');
        const enableCheck = document.getElementById('poligpt-enable');
        const apiKeyInput = document.getElementById('poligpt-apikey');
        const urlInput = document.getElementById('poligpt-url');
        const modelInput = document.getElementById('poligpt-model');

        function abrirAjustes() {
            if (!modal) return;
            // Cargar valores de localStorage
            enableCheck.checked = localStorage.getItem('poligpt_enabled') === 'true';
            apiKeyInput.value = localStorage.getItem('poligpt_apikey') || '';
            urlInput.value = localStorage.getItem('poligpt_url') || 'https://poligpt.upv.es/api/v1/chat/completions';
            modelInput.value = localStorage.getItem('poligpt_model') || 'gpt-3.5-turbo';

            modal.style.display = 'flex';
        }

        function cerrarAjustes() {
            if (modal) modal.style.display = 'none';
        }

        function guardarAjustes() {
            localStorage.setItem('poligpt_enabled', enableCheck.checked);
            localStorage.setItem('poligpt_apikey', apiKeyInput.value.trim());
            localStorage.setItem('poligpt_url', urlInput.value.trim());
            localStorage.setItem('poligpt_model', modelInput.value.trim());
            
            cerrarAjustes();
            setTranscript("⚙️ Ajustes de PoliGPT guardados correctamente.", false);
        }

        // --- BINDINGS ---
        const btnLinter = document.getElementById('btn-linter');
        if (btnLinter) btnLinter.addEventListener('click', ejecutarLinter);

        const btnCompilar = document.getElementById('btn-compilar');
        if (btnCompilar) btnCompilar.addEventListener('click', compilarCodigo);

        const btnAI = document.getElementById('btn-ai-autocomplete');
        if (btnAI) btnAI.addEventListener('click', solicitarAutocompletado);

        const btnSettings = document.getElementById('btn-settings');
        if (btnSettings) btnSettings.addEventListener('click', abrirAjustes);

        const btnCancel = document.getElementById('settings-cancel');
        if (btnCancel) btnCancel.addEventListener('click', cerrarAjustes);

        const btnSave = document.getElementById('settings-save');
        if (btnSave) btnSave.addEventListener('click', guardarAjustes);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initSimulador();
    } else {
        document.addEventListener('DOMContentLoaded', initSimulador);
    }
})();
