/**
 * Simulador FPGA ASM (Terasic DE-Series) - Motor de Cliente
 */

(function () {
    let ws = null;
    let panZoomInstance = null;

    function compactarValorParametro(rawValue) {
        if (!rawValue) return '';
        const valor = rawValue.trim();

        let m = valor.match(/^(?:s?\d+)?'h([0-9a-fA-F_]+)$/);
        if (m) {
            return `0x${m[1].replace(/_/g, '').toUpperCase()}`;
        }

        m = valor.match(/^(?:s?\d+)?'d(-?\d+)$/i);
        if (m) {
            return m[1];
        }

        m = valor.match(/^(?:s?\d+)?'b([01_]+)$/i);
        if (m) {
            const bits = m[1].replace(/_/g, '');
            try {
                const dec = BigInt(`0b${bits}`);
                const hex = dec.toString(16).toUpperCase();
                return bits.length > 8 ? `0x${hex}` : `${dec}`;
            } catch (_) {
                return `0b${bits.slice(0, 16)}${bits.length > 16 ? '...' : ''}`;
            }
        }

        // Algunos flujos de Yosys emiten binario como 32'0101... sin 'b explícita.
        m = valor.match(/^(?:s?\d+)?'([01_]+)$/i);
        if (m) {
            const bits = m[1].replace(/_/g, '');
            try {
                const dec = BigInt(`0b${bits}`);
                const hex = dec.toString(16).toUpperCase();
                return bits.length > 8 ? `0x${hex}` : `${dec}`;
            } catch (_) {
                return `0b${bits.slice(0, 16)}${bits.length > 16 ? '...' : ''}`;
            }
        }

        return valor.length > 20 ? `${valor.slice(0, 20)}...` : valor;
    }

    function compactarLiteralesEnTexto(texto) {
        if (!texto) return '';
        return texto.replace(/(?:s?\d+)?'(?:h[0-9a-fA-F_]+|d-?\d+|b[01_]+|[01_]+)/g, (lit) => compactarValorParametro(lit));
    }

    function nombreModuloVisible(moduleName) {
        if (!moduleName) return '';

        const limpio = moduleName.startsWith('\\') ? moduleName.slice(1) : moduleName;

        if (limpio.startsWith('$paramod$')) {
            const trozosHash = limpio.split('\\').filter(Boolean);
            return compactarLiteralesEnTexto(trozosHash[trozosHash.length - 1] || limpio);
        }

        if (limpio.startsWith('$paramod')) {
            const trozos = limpio.split('\\').filter(Boolean);
            const base = trozos[1] || trozos[0] || limpio;
            const params = [];
            for (let i = 2; i < trozos.length; i++) {
                const idx = trozos[i].indexOf('=');
                if (idx > 0) {
                    const k = trozos[i].slice(0, idx);
                    const v = trozos[i].slice(idx + 1);
                    params.push(`${k}=${compactarValorParametro(v)}`);
                }
            }
            if (!params.length) return compactarLiteralesEnTexto(base);
            const vista = params.slice(0, 2).join(', ');
            return `${base}<${vista}${params.length > 2 ? ', ...' : ''}>`;
        }

        const normalized = limpio.split('\\').pop();
        return compactarLiteralesEnTexto(normalized || limpio);
    }

    function esModuloJerarquico(moduleName, visualType) {
        if (!moduleName || moduleName === 'generic') return false;
        if (visualType !== 'generic') return false;
        return !moduleName.startsWith('$_') && !moduleName.startsWith('$auto$');
    }

    function cambiarEstadoBotones(bloquear) {
        const botones = document.querySelectorAll('.asm-btn');
        botones.forEach(btn => btn.disabled = bloquear);
    }

    function mostrarCargando(tipo) {
        cambiarEstadoBotones(true);
        if (tipo === 'compilar') {
            const sp = document.getElementById('asm-btn-spinner');
            const tx = document.getElementById('asm-btn-texto');
            if (sp) sp.style.display = 'inline-block';
            if (tx) tx.innerText = 'Compilando y Simulando...';
        }
    }

    function restaurarEstadoBotones() {
        cambiarEstadoBotones(false);
        const sp = document.getElementById('asm-btn-spinner');
        const tx = document.getElementById('asm-btn-texto');
        if (sp) sp.style.display = 'none';
        if (tx) tx.innerText = '⚙️ Compilar y Simular';
    }

    // --- GENERACIÓN DE HARDWARE EN LA VISTA ---
    function crearHEX(id) {
        return `<div style="text-align:center;"><svg id="${id}" width="45" height="70" viewBox="0 0 40 60" style="background: #000; padding: 5px; border-radius: 4px;">
            <polygon id="${id}_0" points="10,5 30,5 25,10 15,10" fill="#222" /> <polygon id="${id}_1" points="32,7 32,27 27,25 27,9" fill="#222" /> <polygon id="${id}_2" points="32,33 32,53 27,51 27,35" fill="#222" /> <polygon id="${id}_3" points="10,55 30,55 25,50 15,50" fill="#222" /> <polygon id="${id}_4" points="8,33 8,53 13,51 13,35" fill="#222" /> <polygon id="${id}_5" points="8,7 8,27 13,25 13,9" fill="#222" /> <polygon id="${id}_6" points="10,30 30,30 25,27 15,27 10,30" fill="#222" /> </svg><div style="font-size:10px; color:#bdc3c7; margin-top:5px;">${id}</div></div>`;
    }

    function initHTMLPlaca() {
        const hexC = document.getElementById('hex_container');
        if (hexC) {
            hexC.innerHTML = '';
            for (let i = 7; i >= 0; i--) hexC.innerHTML += crearHEX(`HEX${i}`);
        }

        const lrC = document.getElementById('ledr_container');
        const lgC = document.getElementById('ledg_container');
        if (lrC && lgC) {
            lrC.innerHTML = '';
            lgC.innerHTML = '';
            for (let i = 9; i >= 0; i--) {
                lrC.innerHTML += `<div style="text-align:center;"><div id="LEDR${i}" style="width:18px;height:18px;border-radius:50%;background:#300;border:1px solid #000;"></div><div style="font-size:9px;color:#e74c3c;">R${i}</div></div>`;
                lgC.innerHTML += `<div style="text-align:center;"><div id="LEDG${i}" style="width:18px;height:18px;border-radius:50%;background:#030;border:1px solid #000;"></div><div style="font-size:9px;color:#2ecc71;">G${i}</div></div>`;
            }
        }

        const swC = document.getElementById('sw_container');
        if (swC) {
            swC.innerHTML = '';
            for (let i = 9; i >= 0; i--) {
                swC.innerHTML += `<div id="sw-wrapper-${i}" style="text-align:center;cursor:pointer;"><div id="SW${i}" style="width:22px;height:45px;background:#000;border:2px solid #555;position:relative;"><div id="SW${i}_p" style="width:100%;height:50%;background:#ecf0f1;position:absolute;bottom:0;transition:0.1s;"></div></div><div style="font-size:10px;margin-top:5px;">SW${i}</div></div>`;
            }
        }

        const keyLabels = ["Reset (rst_n)", "KEY1", "KEY2", "KEY3"];
        const kC = document.getElementById('key_container');
        if (kC) {
            kC.innerHTML = '';
            for (let i = 3; i >= 0; i--) {
                kC.innerHTML += `<div style="text-align:center;"><button id="btn-key-${i}" style="width:45px;height:45px;border-radius:50%;background:#bdc3c7;border:4px solid #7f8c8d;cursor:pointer;box-shadow:0 4px #2c3e50;"></button><div style="font-size:10px;font-weight:bold;margin-top:8px;">KEY${i}</div><div style="font-size:9px;color:#bdc3c7;">${keyLabels[i]}</div></div>`;
            }
        }
    }

    function initSimulador() {
        initHTMLPlaca();

        const containerMonaco = document.getElementById('editor_monaco');
        if (!containerMonaco) return;

        // --- 1. WEBSOCKET ---
        const wsUrl = (typeof SV_ASM_CONFIG !== 'undefined' && SV_ASM_CONFIG.ws_url)
            ? SV_ASM_CONFIG.ws_url
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
                est.innerText = "🔴 DESCONECTADO (Reinicia el server)";
                est.style.color = "#e74c3c";
            }
            restaurarEstadoBotones();
        };
        ws.onerror = () => { restaurarEstadoBotones(); };

        // --- 2. MONACO EDITOR ---
        // Cargar Monaco Editor de forma diferida usando require
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' } });
        require(['vs/editor/editor.main'], function () {
            window.editor = monaco.editor.create(containerMonaco, {
                value: `module top_system(
    input clk,
    input [3:0] KEY,
    input [9:0] SW,
    output [9:0] LEDR,
    output [9:0] LEDG,
    output [6:0] HEX0, HEX1, HEX2, HEX3, HEX4, HEX5, HEX6, HEX7
);
    // Ejemplo: LEDs y HEX reaccionan a los switches
    assign LEDR = SW;
    assign LEDG = ~SW; // LED Verde inverso
    assign HEX0 = SW[0] ? 7'b1000000 : 7'b1111111;
    assign HEX1 = SW[1] ? 7'b1111001 : 7'b1111111;
    assign HEX2 = SW[2] ? 7'b0100100 : 7'b1111111;
    assign HEX3 = SW[3] ? 7'b0110000 : 7'b1111111;
    assign HEX4 = SW[4] ? 7'b0011001 : 7'b1111111;
    assign HEX5 = SW[5] ? 7'b0010010 : 7'b1111111;
    assign HEX6 = SW[6] ? 7'b0000010 : 7'b1111111;
    assign HEX7 = SW[7] ? 7'b1111000 : 7'b1111111;
endmodule`,
                language: 'verilog',
                theme: 'vs-dark',
                automaticLayout: true
            });

            window.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
                enviarCodigo();
            });
        });

        // --- 3. RECEPCIÓN DE MENSAJES WEBSOCKET ---
        ws.onmessage = (e) => {
            let r;
            try { r = JSON.parse(e.data); } catch (err) { return; }

            // Restaurar siempre botones ante cualquier respuesta final
            if (r.status || r.tipo === "error" || r.tipo === "esquema_svg") {
                restaurarEstadoBotones();
            }

            // 1. SI ES UN DIBUJO DE YOSYS
            if (r.tipo === "esquema_svg") {
                renderizarEsquema(r.contenido_svg);
                return;
            }

            // 2. SI YOSYS DA ERROR DE SINTAXIS
            if (r.tipo === "error") {
                mostrarErrorSintesis(r.mensaje);
                return;
            }

            // 3. SI ES RESPUESTA DE COMPILACIÓN
            if (r.status === "error_compilacion") {
                if (est) { est.innerText = "🔴 ERROR DE COMPILACIÓN"; est.style.color = "#e74c3c"; }
                aplicarLinter(r.detalles);
            } else if (r.status === "compilado_ok") {
                if (est) { est.innerText = "🟢 CIRCUITO ACTIVO"; est.style.color = "#2ecc71"; }
                limpiarMarcadores();
            }

            // 4. SI ES ACTUALIZACIÓN DE HARDWARE VIVO
            if (r.ledr) actualizarBus(r.ledr, "LEDR", "#f00", "#300");
            if (r.ledg) actualizarBus(r.ledg, "LEDG", "#2ecc71", "#030");
            if (r.hex) {
                Object.keys(r.hex).forEach(h => {
                    const bits = r.hex[h];
                    for (let b = 0; b < 7; b++) {
                        const segment = document.getElementById(`${h}_${b}`);
                        if (segment) {
                            segment.setAttribute("fill", bits[6 - b] === '0' ? "#f00" : "#222");
                        }
                    }
                });
            }
        };

        // --- 4. CONTROLADORES DE INTERRUPTORES Y PULSADORES ---
        let sws = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        window.toggleSW = function (i) {
            sws[i] = sws[i] ? 0 : 1;
            const togglePart = document.getElementById(`SW${i}_p`);
            if (togglePart) togglePart.style.bottom = sws[i] ? '50%' : '0';
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ accion: "set_sw", sw_array: sws.reverse().join("") }));
                sws.reverse();
            }
        };

        for (let i = 0; i < 10; i++) {
            const swEl = document.getElementById(`sw-wrapper-${i}`);
            if (swEl) {
                swEl.addEventListener('click', () => toggleSW(i));
            }
        }

        window.pressKEY = function (i, v) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ accion: "set_key", key_index: i, valor: v }));
            }
        };

        for (let i = 0; i < 4; i++) {
            const keyEl = document.getElementById(`btn-key-${i}`);
            if (keyEl) {
                keyEl.addEventListener('mousedown', () => pressKEY(i, 0));
                keyEl.addEventListener('mouseup', () => pressKEY(i, 1));
                keyEl.addEventListener('mouseleave', () => pressKEY(i, 1));
            }
        }

        // --- 5. BINDINGS DE ACCIONES SUPERIORES ---
        const btnCompilar = document.getElementById('btn-compilar-simular');
        if (btnCompilar) {
            btnCompilar.addEventListener('click', enviarCodigo);
        }

        const btnEsquema = document.getElementById('btn-ver-esquema');
        if (btnEsquema) {
            btnEsquema.addEventListener('click', solicitarEsquema);
        }
    }

    function enviarCodigo() {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const est = document.getElementById('estado_ws');
        if (est) {
            est.innerText = "⏳ COMPILANDO...";
            est.style.color = "#f1c40f";
        }
        mostrarCargando('compilar');
        limpiarMarcadores();
        ws.send(JSON.stringify({ accion: "compilar", codigo: window.editor.getValue() }));
    }

    function solicitarEsquema() {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const selectorEngine = document.getElementById('asm-sintesis-engine');
        const engine = selectorEngine ? selectorEngine.value : 'surelog_uhdm';

        const visor = document.getElementById('visor-esquema');
        if (visor) {
            visor.innerHTML = '<p style="text-align:center; color:#555; margin-top:230px;">⚙️ Sintetizando Jerarquía...</p>';
        }
        ws.send(JSON.stringify({
            accion: "ver_esquema",
            codigo: window.editor.getValue(),
            modulo: "auto",
            motor: engine
        }));
    }

    function renderizarEsquema(contenidoSvg) {
        const contenedor = document.getElementById("visor-esquema");
        if (!contenedor) return;
        contenedor.innerHTML = contenidoSvg;

        const elementoSvg = contenedor.querySelector('svg');
        if (!elementoSvg) return;
        elementoSvg.style.width = "100%";
        elementoSvg.style.height = "100%";

        const celdas = elementoSvg.querySelectorAll('g');
        celdas.forEach(celda => {
            const tipoVisual = celda.getAttribute('s:type');
            const moduloExacto = celda.getAttribute('data-module');
            let tipoModulo = moduloExacto || tipoVisual;
            if (!tipoModulo && celda.getAttribute('s:generic') === 'body') {
                const parent = celda.parentElement;
                if (parent) tipoModulo = parent.getAttribute('s:type');
            }

            if (tipoVisual === 'generic') {
                const textosCaja = celda.querySelectorAll('text');
                if (textosCaja.length > 0) {
                    const etiquetaOriginal = textosCaja[0].textContent.trim();
                    if (!moduloExacto && etiquetaOriginal && etiquetaOriginal !== 'generic') {
                        tipoModulo = etiquetaOriginal;
                    }
                    textosCaja[0].textContent = nombreModuloVisible(tipoModulo || etiquetaOriginal);
                    textosCaja[0].style.fontSize = '12px';
                    textosCaja[0].style.fontWeight = 'bold';
                    textosCaja[0].style.fill = '#0e6655';
                }
            }

            if (esModuloJerarquico(tipoModulo, tipoVisual)) {
                const rect = celda.querySelector('rect');
                if (rect) {
                    rect.style.fill = '#e8f8f5';
                    rect.style.stroke = '#1abc9c';
                    rect.style.cursor = 'pointer';
                }

                const titulo = document.createElementNS("http://www.w3.org/2000/svg", "title");
                titulo.textContent = "🖱️ Doble clic para entrar al módulo: " + nombreModuloVisible(tipoModulo);
                celda.appendChild(titulo);

                celda.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const selectorEngine = document.getElementById('asm-sintesis-engine');
                    const engine = selectorEngine ? selectorEngine.value : 'surelog_uhdm';

                    if (contenedor) {
                        contenedor.innerHTML = `<p style="text-align:center; color:#555; margin-top:230px;">🔍 Entrando al submódulo ${tipoModulo}...</p>`;
                    }
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            accion: "ver_esquema",
                            codigo: window.editor.getValue(),
                            modulo: tipoModulo,
                            motor: engine
                        }));
                    }
                });
            }
        });

        if (panZoomInstance) { panZoomInstance.destroy(); }
        panZoomInstance = svgPanZoom(elementoSvg, {
            zoomEnabled: true,
            controlIconsEnabled: true,
            fit: true,
            center: true,
            dblClickZoomEnabled: false,
            minZoom: 0.5,
            maxZoom: 15
        });
    }

    function mostrarErrorSintesis(mensaje) {
        const visor = document.getElementById("visor-esquema");
        if (visor) {
            visor.innerHTML = `
                <div style="color: #d32f2f; padding: 20px; font-family: monospace; white-space: pre-wrap; background: #ffebee; height: 100%; overflow: auto;">
                    <strong>❌ Error de Síntesis (Yosys):</strong><br><br>${mensaje}
                </div>
            `;
        }
    }

    function aplicarLinter(errorText) {
        if (!errorText || !window.editor) return;
        const markers = [];
        const regex = /ejercicio_fsm\.v\((\d+)\):\s*(.*)/g;
        let m;
        while ((m = regex.exec(errorText)) !== null) {
            markers.push({
                startLineNumber: parseInt(m[1]), startColumn: 1,
                endLineNumber: parseInt(m[1]), endColumn: 100,
                message: m[2], severity: monaco.MarkerSeverity.Error
            });
        }
        monaco.editor.setModelMarkers(window.editor.getModel(), 'verilog', markers);
    }

    function limpiarMarcadores() {
        if (window.editor) {
            monaco.editor.setModelMarkers(window.editor.getModel(), 'verilog', []);
        }
    }

    function actualizarBus(bits, prefix, onColor, offColor) {
        for (let i = 0; i < bits.length; i++) {
            const el = document.getElementById(prefix + (bits.length - 1 - i));
            if (el) el.style.background = bits[i] === '1' ? onColor : offColor;
        }
    }

    // Arrancar cuando el DOM esté listo
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initSimulador();
    } else {
        document.addEventListener('DOMContentLoaded', initSimulador);
    }
})();
