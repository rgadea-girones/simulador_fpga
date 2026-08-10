/**
 * Simulador FPGA - Client Engine (4 Quadrants)
 * Acciones independientes: Linter (Ctrl+S), Compilación y Simulación por separado.
 */

(function () {
    let ws = null;
    let panZoomInstance = null;

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
            if (tx) tx.innerText = 'Compilando...';
        } else if (tipo === 'simular') {
            const sp = document.getElementById('btn-spinner-simular');
            const tx = document.getElementById('btn-simular-texto');
            if (sp) sp.style.display = 'inline-block';
            if (tx) tx.innerText = 'Simulando...';
        }
    }

    function restaurarEstadoBotones() {
        cambiarEstadoBotones(false);
        
        const btnLinter = document.getElementById('btn-linter');
        if (btnLinter) btnLinter.innerText = '🔍 Comprobando (Linter)';

        const spCompilar = document.getElementById('btn-spinner-compilar');
        const txCompilar = document.getElementById('btn-compilar-texto');
        if (spCompilar) spCompilar.style.display = 'none';
        if (txCompilar) txCompilar.innerText = '✅ Verificar';

        const spSimular = document.getElementById('btn-spinner-simular');
        const txSimular = document.getElementById('btn-simular-texto');
        if (spSimular) spSimular.style.display = 'none';
        if (txSimular) txSimular.innerText = '▶️ Simular';
    }

    function initSimulador() {
        const containerDesign = document.getElementById('editor_design');
        const containerTB = document.getElementById('editor_tb');
        if (!containerDesign || !containerTB) return;

        // --- 1. WEBSOCKET ---
        const wsUrl = (typeof SV_SIMULATOR_CONFIG !== 'undefined' && SV_SIMULATOR_CONFIG.ws_url)
            ? SV_SIMULATOR_CONFIG.ws_url
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

            // Restaurar siempre botones ante cualquier respuesta final
            if (r.status || r.tipo === "error" || r.tipo === "esquema_svg") {
                restaurarEstadoBotones();
            }

            // A. RESPUESTA DE LINTER O ERRORES DE SINTAXIS
            if (r.status === "error_compilacion" || r.tipo === "linter_error") {
                if (est) { est.innerText = "🔴 ERROR EN CÓDIGO"; est.style.color = "#e74c3c"; }
                const errorMsg = r.detalles || r.transcript || "Error detectado.";
                setTranscript(errorMsg, true);
                aplicarLinter(errorMsg);
            } 
            
            // B. RESPUESTA DE LINTER CORRECTA
            else if (r.status === "linter_ok") {
                if (est) { est.innerText = "🟢 CÓDIGO CORRECTO"; est.style.color = "#2ecc71"; }
                limpiarMarcadores();
                setTranscript(r.transcript || "✓ Sintaxis verificada correctamente sin errores.", false);
            }

            // C. RESPUESTA DE COMPILACIÓN CORRECTA (SIN SIMULACIÓN)
            else if (r.status === "compilado_ok") {
                if (est) { est.innerText = "🟢 COMPILADO OK"; est.style.color = "#2ecc71"; }
                limpiarMarcadores();
                setTranscript(r.transcript || "=== Compilación finalizada correctamente ===", false);
            } 

            // D. RESPUESTA DE SIMULACIÓN INICIADA
            else if (r.status === "simulacion_ok") {
                if (est) { est.innerText = "🟢 SIMULACIÓN EN EJECUCIÓN"; est.style.color = "#2ecc71"; }
                setTranscript(r.transcript || "=== Simulación iniciada en QuestaSim ===", false);
            }
            
            // E. RESPUESTA DE TRANSCRIPT EN TIEMPO REAL
            else if (r.tipo === "transcript") {
                appendTranscript(r.contenido || r.transcript, false);
            } 
            
            // F. ESQUEMA SVG YOSYS
            else if (r.tipo === "esquema_svg") {
                renderizarEsquemaSVG(r.contenido_svg);
            } else if (r.tipo === "error") {
                mostrarErrorSintesis(r.mensaje);
            } else if (r.tipo === "autocompletar_respuesta") {
                const targetIframe = r.id === 'tb' ? iframeTB : iframeDesign;
                if (targetIframe && targetIframe.contentWindow) {
                    targetIframe.contentWindow.postMessage({
                        accion: "respuesta_autocompletar",
                        texto: r.completion
                    }, "*");
                }
            }
        };

        // --- 2. IFRAMES CON MONACO EDITORS ---
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

                            // CTRL + S O CMD + S -> EJECUTA ÚNICAMENTE EL LINTER
                            window.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
                                window.parent.postMessage({ accion: 'linter' }, '*');
                            });

                            let completionResolve = null;
                            window.addEventListener('message', function(event) {
                                if (event.data && event.data.accion === "respuesta_autocompletar") {
                                    if (completionResolve) {
                                        let text = event.data.texto;
                                        // clean text if needed
                                        completionResolve({ items: [{ insertText: text }] });
                                        completionResolve = null;
                                    }
                                }
                            });

                            monaco.languages.registerInlineCompletionsProvider('verilog', {
                                provideInlineCompletions: async function(model, position, context, token) {
                                    const textUntilPosition = model.getValueInRange({
                                        startLineNumber: 1,
                                        startColumn: 1,
                                        endLineNumber: position.lineNumber,
                                        endColumn: position.column
                                    });
                                    
                                    return new Promise(resolve => {
                                        completionResolve = resolve;
                                        window.parent.postMessage({
                                            accion: "solicitar_autocompletado",
                                            texto: textUntilPosition,
                                            origen: '${idInstancia}'
                                        }, "*");
                                    });
                                },
                                freeInlineCompletions: function(completions) {}
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

        
        const examples = {
            flipflop: {
                design: `module flipflop_d (
    input  logic clk,
    input  logic rst_n, // Reset asíncrono activo por bajo
    input  logic d,
    output logic q
);

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            q <= 1'b0;
        else
            q <= d;
    end

endmodule`,
                tb: `module tb_flipflop_d;

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

endmodule`
            },
            multiplexor: {
                design: `module mux21 (
    input  logic a,
    input  logic b,
    input  logic sel,
    output logic y
);

    assign y = sel ? b : a;

endmodule`,
                tb: `module tb_mux21;

    logic a, b, sel;
    logic y;

    mux21 uut (.a(a), .b(b), .sel(sel), .y(y));

    initial begin
        $display("=== Simulación Multiplexor 2:1 ===");
        $monitor("T=%0t | sel=%b a=%b b=%b => y=%b", $time, sel, a, b, y);
        
        a = 0; b = 1; sel = 0;
        #10 sel = 1;
        #10 sel = 0; a = 1; b = 0;
        #10 sel = 1;
        #10 $finish;
    end
endmodule`
            },
            codificador: {
                design: `module codificador_prioridad (
    input  logic [3:0] in,
    output logic [1:0] out,
    output logic valid
);

    always_comb begin
        valid = 1'b1;
        if (in[3]) out = 2'd3;
        else if (in[2]) out = 2'd2;
        else if (in[1]) out = 2'd1;
        else if (in[0]) out = 2'd0;
        else begin
            out = 2'd0;
            valid = 1'b0;
        end
    end

endmodule`,
                tb: `module tb_codificador;

    logic [3:0] in;
    logic [1:0] out;
    logic valid;

    codificador_prioridad uut (.in(in), .out(out), .valid(valid));

    initial begin
        $display("=== Simulación Codificador Prioridad ===");
        $monitor("in=%b => out=%d, valid=%b", in, out, valid);

        in = 4'b0000; #10;
        in = 4'b0001; #10;
        in = 4'b0010; #10;
        in = 4'b0100; #10;
        in = 4'b1000; #10;
        in = 4'b0110; #10;
        in = 4'b1111; #10;
        $finish;
    end
endmodule`
            },
            contador: {
                design: `module contador_sync #(
    parameter WIDTH = 4
)(
    input  logic clk,
    input  logic rst_n,
    input  logic enable,
    output logic [WIDTH-1:0] count
);

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            count <= '0;
        else if (enable)
            count <= count + 1'b1;
    end

endmodule`,
                tb: `module tb_contador;

    logic clk, rst_n, enable;
    logic [3:0] count;

    contador_sync #(.WIDTH(4)) uut (
        .clk(clk), .rst_n(rst_n), .enable(enable), .count(count)
    );

    always #5 clk = ~clk;

    initial begin
        $display("=== Simulación Contador ===");
        $monitor("T=%0t | rst_n=%b enable=%b => count=%d", $time, rst_n, enable, count);

        clk = 0; rst_n = 0; enable = 0;
        #12 rst_n = 1;
        #10 enable = 1;
        #50 enable = 0; // Pausa
        #20 enable = 1; // Reanuda
        #30 rst_n = 0; // Reset asíncrono
        #10 $finish;
    end
endmodule`
            },
            registro: {
                design: `module shift_register #(
    parameter WIDTH = 8
)(
    input  logic clk,
    input  logic rst_n,
    input  logic load_en,
    input  logic [WIDTH-1:0] d_in,
    input  logic shift_in,
    output logic [WIDTH-1:0] q_out
);

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            q_out <= '0;
        else if (load_en)
            q_out <= d_in;
        else
            q_out <= {q_out[WIDTH-2:0], shift_in};
    end

endmodule`,
                tb: `module tb_shift_register;

    logic clk, rst_n, load_en, shift_in;
    logic [7:0] d_in, q_out;

    shift_register #(.WIDTH(8)) uut (
        .* 
    );

    always #5 clk = ~clk;

    initial begin
        $display("=== Simulación Registro Desplazamiento ===");
        $monitor("T=%0t | load=%b shift_in=%b => q_out=%b", $time, load_en, shift_in, q_out);

        clk=0; rst_n=0; load_en=0; shift_in=0; d_in=8'hA5;
        #12 rst_n=1;
        #10 load_en=1; // Cargar 10100101
        #10 load_en=0; shift_in=1;
        #10 shift_in=0;
        #10 shift_in=1;
        #30 $finish;
    end
endmodule`
            },
            alu: {
                design: `module alu (
    input  logic [3:0] a, b,
    input  logic [1:0] op,
    output logic [4:0] res
);

    always_comb begin
        case (op)
            2'b00: res = a + b;
            2'b01: res = a - b;
            2'b10: res = a & b;
            2'b11: res = {1'b0, a | b};
            default: res = '0;
        endcase
    end

endmodule`,
                tb: `module tb_alu;

    logic [3:0] a, b;
    logic [1:0] op;
    logic [4:0] res;

    alu uut (.*);

    initial begin
        $display("=== Simulación ALU ===");
        $monitor("a=%d b=%d op=%b => res=%d", a, b, op, res);

        a = 4; b = 3;
        op = 2'b00; #10; // Suma
        op = 2'b01; #10; // Resta
        op = 2'b10; #10; // AND
        op = 2'b11; #10; // OR
        
        a = 15; b = 1;
        op = 2'b00; #10; // Prueba overflow suma
        
        $finish;
    end
endmodule`
            },
            fsm: {
                design: `module detector_secuencia_101 (
    input  logic clk,
    input  logic rst_n,
    input  logic bit_in,
    output logic detect_out
);

    localparam S0 = 2'd0;
    localparam S1 = 2'd1;
    localparam S2 = 2'd2;
    localparam S3 = 2'd3;
    logic [1:0] current_state, next_state;

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) current_state <= S0;
        else current_state <= next_state;
    end

    always_comb begin
        next_state = current_state;
        detect_out = 1'b0;

        case (current_state)
            S0: if (bit_in) next_state = S1;
            S1: if (!bit_in) next_state = S2;
            S2: if (bit_in) begin
                    next_state = S3;
                end else next_state = S0;
            S3: begin
                    detect_out = 1'b1;
                    if (bit_in) next_state = S1;
                    else next_state = S2;
                end
        endcase
    end

endmodule`,
                tb: `module tb_fsm;

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
endmodule`
            }
        };

        const iframeTB = crearFrameMonaco(containerTB, 'tb', examples.flipflop.tb);
        const iframeDesign = crearFrameMonaco(containerDesign, 'design', examples.flipflop.design);

        // Actualizar editores al seleccionar un ejemplo
        const selectEjemplo = document.getElementById('ejemplos-basicos');
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
                    limpiarMarcadores();
                    setTranscript("=== Código cargado desde ejemplos ===", false);
                }
            });
        }


        // --- 3. EVENTOS Y ACCIONES ---
        window.addEventListener('message', (event) => {
            if (!event.data || !event.data.accion) return;
            if (event.data.accion === 'linter') {
                ejecutarLinter();
            } else if (event.data.accion === 'solicitar_autocompletado') {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        accion: "autocompletar",
                        texto: event.data.texto,
                        id: event.data.origen
                    }));
                }
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

        function limpiarMarcadores() {
            [iframeDesign, iframeTB].forEach(iframe => {
                if (iframe.contentWindow && iframe.contentWindow.monaco && iframe.contentWindow.editor) {
                    const win = iframe.contentWindow;
                    win.monaco.editor.setModelMarkers(win.editor.getModel(), 'verilog', []);
                }
            });
        }

        // --- ACCIONES WEBSOCKET ---
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

        function compilarCodigo() {
            const codeDesign = obtenerCodigo(iframeDesign);
            const codeTB = obtenerCodigo(iframeTB);

            if (!ws || ws.readyState !== WebSocket.OPEN) {
                setTranscript("❌ Error: WebSocket desconectado.", true);
                return;
            }

            mostrarCargando('compilar');
            if (est) { est.innerText = "⏳ COMPILANDO..."; est.style.color = "#f1c40f"; }

            limpiarMarcadores();
            setTranscript("⚙️ Compilando módulos con vlog...", false);

            ws.send(JSON.stringify({
                accion: "compilar",
                codigo: codeDesign,
                testbench: codeTB
            }));
        }

        function simularCodigo() {
            const codeDesign = obtenerCodigo(iframeDesign);
            const codeTB = obtenerCodigo(iframeTB);

            if (!ws || ws.readyState !== WebSocket.OPEN) {
                setTranscript("❌ Error: WebSocket desconectado.", true);
                return;
            }

            mostrarCargando('simular');
            if (est) { est.innerText = "⏳ EJECUTANDO SIMULACIÓN..."; est.style.color = "#f1c40f"; }

            setTranscript("▶️ Iniciando simulación con vsim en QuestaSim...", false);

            ws.send(JSON.stringify({
                accion: "simular",
                codigo: codeDesign,
                testbench: codeTB
            }));
        }

        function solicitarEsquema() {
            const codeDesign = obtenerCodigo(iframeDesign);
            if (!ws || ws.readyState !== WebSocket.OPEN || !codeDesign) return;

            const visor = document.getElementById('visor-esquema');
            if (visor) {
                visor.innerHTML = '<p style="text-align:center; color:#555; margin-top:170px;">⚙️ Sintetizando Jerarquía...</p>';
            }

            ws.send(JSON.stringify({
                accion: "ver_esquema",
                codigo: codeDesign,
                modulo: "auto"
            }));
        }

        function renderizarEsquemaSVG(contenidoSVG) {
            const contenedor = document.getElementById("visor-esquema");
            if (!contenedor) return;

            contenedor.innerHTML = contenidoSVG;
            const elementoSvg = contenedor.querySelector('svg');
            if (!elementoSvg) return;

            elementoSvg.style.width = "100%";
            elementoSvg.style.height = "100%";

            if (panZoomInstance) panZoomInstance.destroy();
            if (typeof svgPanZoom !== 'undefined') {
                panZoomInstance = svgPanZoom(elementoSvg, {
                    zoomEnabled: true,
                    controlIconsEnabled: true,
                    fit: true,
                    center: true,
                    minZoom: 0.5,
                    maxZoom: 15
                });
            }
        }

        function mostrarErrorSintesis(msg) {
            const visor = document.getElementById("visor-esquema");
            if (visor) {
                visor.innerHTML = `
                    <div style="color: #d32f2f; padding: 15px; font-family: monospace; white-space: pre-wrap; background: #ffebee; height: 100%; overflow: auto; font-size: 11px;">
                        <strong>❌ Error de Síntesis (Yosys):</strong><br><br>${msg}
                    </div>
                `;
            }
        }

        // --- 4. BINDINGS ---
        const btnLinter = document.getElementById('btn-linter');
        if (btnLinter) btnLinter.addEventListener('click', ejecutarLinter);

        const btnCompilar = document.getElementById('btn-compilar');
        if (btnCompilar) btnCompilar.addEventListener('click', compilarCodigo);

        const btnSimular = document.getElementById('btn-simular');
        if (btnSimular) btnSimular.addEventListener('click', simularCodigo);

        const btnEsquema = document.getElementById('btn-ver-esquema');
        if (btnEsquema) btnEsquema.addEventListener('click', solicitarEsquema);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initSimulador();
    } else {
        document.addEventListener('DOMContentLoaded', initSimulador);
    }
})();