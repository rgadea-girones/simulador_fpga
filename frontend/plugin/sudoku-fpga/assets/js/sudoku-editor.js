/**
 * Sudoku FPGA - Motor de Cliente
 * Layout: Testbench (sup-izq) | Clase (sup-der) | Transcript (inf-izq) | Visor (inf-der)
 * Protocolo WS idéntico al de simulador-fpga (linter / compilar / simular).
 */

(function () {
    'use strict';

    let ws = null;

    // Colección de sudokus generados en la sesión
    const sudokusSesion = [];
    let indiceActual    = -1;

    // ══════════════════════════════════════════════════════════════
    // 1. UTILIDADES DE ESTADO Y BOTONES
    // ══════════════════════════════════════════════════════════════
    function bloquearBotones(bloquear) {
        document.querySelectorAll('.sdk-btn').forEach(b => b.disabled = bloquear);
    }

    function mostrarCargando(tipo) {
        bloquearBotones(true);
        if (tipo === 'linter') {
            const b = document.getElementById('sdk-btn-linter');
            if (b) b.innerText = '🔍 Comprobando...';
        } else if (tipo === 'compilar') {
            _spinner('sdk-sp-compilar', true);
            _texto('sdk-tx-compilar', 'Compilando...');
        } else if (tipo === 'simular') {
            _spinner('sdk-sp-simular', true);
            _texto('sdk-tx-simular', 'Generando...');
        }
    }

    function restaurarBotones() {
        bloquearBotones(false);
        const b = document.getElementById('sdk-btn-linter');
        if (b) b.innerText = '🔍 Comprobar (Linter)';
        _spinner('sdk-sp-compilar', false);
        _texto('sdk-tx-compilar', '✅ Verificar');
        _spinner('sdk-sp-simular', false);
        _texto('sdk-tx-simular', '🎲 Generar Sudoku');
    }

    function _spinner(id, show) {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? 'inline-block' : 'none';
    }
    function _texto(id, txt) {
        const el = document.getElementById(id);
        if (el) el.innerText = txt;
    }

    function setEstadoWS(texto, color) {
        const el = document.getElementById('sdk-estado-ws');
        if (el) { el.innerText = texto; el.style.color = color; }
    }
    function setTranscriptStatus(texto) {
        const el = document.getElementById('sdk-transcript-status');
        if (el) el.innerText = texto;
    }

    // ══════════════════════════════════════════════════════════════
    // 2. TRANSCRIPT
    // ══════════════════════════════════════════════════════════════
    function setTranscript(texto, esError) {
        const t = document.getElementById('sdk-transcript');
        if (!t) return;
        t.innerHTML = `<span style="color:${esError ? '#e74c3c' : '#2ecc71'};">${_esc(texto)}</span>`;
        t.scrollTop = t.scrollHeight;
    }

    function appendTranscript(texto, esError) {
        const t = document.getElementById('sdk-transcript');
        if (!t) return;
        t.innerHTML += `<span style="color:${esError ? '#e74c3c' : '#2ecc71'};">${_esc(texto)}</span>\n`;
        t.scrollTop = t.scrollHeight;
        // Intentar parsear si contiene datos de sudoku
        intentarParsearSudoku(texto);
    }

    function _esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // ══════════════════════════════════════════════════════════════
    // 3. PARSER Y VISOR DE SUDOKU
    // ══════════════════════════════════════════════════════════════

    // Buffer acumulador de filas mientras llegan en streaming
    let _bufferFilas = {};

    function intentarParsearSudoku(texto) {
        // Buscamos líneas con formato:  SUDOKU_ROW_N:DDDDDDDDD
        const re = /SUDOKU_ROW_(\d):([1-9]{9})/g;
        let m;
        while ((m = re.exec(texto)) !== null) {
            const fila  = parseInt(m[1], 10);
            const celdas = m[2].split('').map(Number);
            _bufferFilas[fila] = celdas;
        }

        // Si tenemos las 9 filas → grilla completa
        if (Object.keys(_bufferFilas).length === 9) {
            const grid = [];
            for (let r = 0; r < 9; r++) {
                grid.push(_bufferFilas[r] || Array(9).fill(0));
            }
            _bufferFilas = {};  // reset para el siguiente sudoku
            registrarSudoku(grid);
        }
    }

    function registrarSudoku(grid) {
        const valido = validarSudoku(grid);
        sudokusSesion.push({ grid, valido });
        indiceActual = sudokusSesion.length - 1;
        actualizarNavegacion();
        renderizarSudoku(grid, valido);
    }

    function validarSudoku(grid) {
        const ok = arr => new Set(arr).size === 9 && arr.every(v => v >= 1 && v <= 9);
        // Filas
        for (let r = 0; r < 9; r++)
            if (!ok(grid[r])) return false;
        // Columnas
        for (let c = 0; c < 9; c++)
            if (!ok(grid.map(row => row[c]))) return false;
        // Cajas 3×3
        for (let br = 0; br < 3; br++)
            for (let bc = 0; bc < 3; bc++) {
                const caja = [];
                for (let r = 0; r < 3; r++)
                    for (let c = 0; c < 3; c++)
                        caja.push(grid[br * 3 + r][bc * 3 + c]);
                if (!ok(caja)) return false;
            }
        return true;
    }

    function renderizarSudoku(grid, valido) {
        const contenedor = document.getElementById('sdk-visor-sudoku');
        if (!contenedor) return;

        // Badge de validez
        const badge = document.getElementById('sdk-visor-badge');
        if (badge) {
            badge.style.display = 'inline-block';
            badge.textContent   = valido ? '✓ Válido' : '✘ Inválido';
            badge.style.background = valido ? '#27ae60' : '#e74c3c';
        }

        // Colores de celdas por valor (1→9)
        const COLORES_VALOR = [
            '', '#c0392b','#e67e22','#f1c40f','#27ae60',
            '#1abc9c','#2980b9','#8e44ad','#c0392b','#7f8c8d'
        ];

        // Construir la cuadrícula CSS
        const wrapper = document.createElement('div');
        wrapper.className = 'sudoku-grid';
        wrapper.style.width  = 'min(290px, 90%)';
        wrapper.style.margin = '0 auto';

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const v    = grid[r][c];
                const caja = (Math.floor(r / 3)) * 3 + Math.floor(c / 3);
                const cell = document.createElement('div');
                cell.className = 'sudoku-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.dataset.box = caja;
                cell.textContent = v > 0 ? v : '';
                if (v > 0) cell.style.color = COLORES_VALOR[v];

                // Hover interactivo: resaltar mismo número
                cell.addEventListener('mouseenter', () => {
                    document.querySelectorAll('.sudoku-cell').forEach(el => {
                        el.classList.toggle('highlight', parseInt(el.textContent) === v && v > 0);
                    });
                });
                cell.addEventListener('mouseleave', () => {
                    document.querySelectorAll('.sudoku-cell').forEach(el => el.classList.remove('highlight'));
                });

                wrapper.appendChild(cell);
            }
        }

        // Leyenda
        const leyenda = document.createElement('p');
        leyenda.style.cssText = 'font-size:11px; color:#7f8c8d; margin-top:8px; text-align:center;';
        leyenda.textContent   = `Sudoku #${indiceActual + 1} de ${sudokusSesion.length} — Pasa el ratón para resaltar valores`;

        contenedor.innerHTML = '';
        contenedor.appendChild(wrapper);
        contenedor.appendChild(leyenda);
    }

    function actualizarNavegacion() {
        const n        = sudokusSesion.length;
        const bAnt     = document.getElementById('sdk-btn-anterior');
        const bSig     = document.getElementById('sdk-btn-siguiente');
        const contador = document.getElementById('sdk-visor-contador');

        if (bAnt)     bAnt.style.display     = n > 1 ? 'inline-flex' : 'none';
        if (bSig)     bSig.style.display     = n > 1 ? 'inline-flex' : 'none';
        if (contador) {
            contador.style.display = n > 1 ? 'inline-block' : 'none';
            contador.textContent   = `${indiceActual + 1} / ${n}`;
        }
    }

    // ══════════════════════════════════════════════════════════════
    // 4. SNIPPETS SV PARA RCSG / CLASES
    // ══════════════════════════════════════════════════════════════
    function getSnippets() {
        const J = lines => lines.join('\n');
        return [
            // ── Clase ──
            { label:'class',     detail:'Clase SV con constructor',
              insertText: J(['class ${1:MiClase};','    rand ${2:int} ${3:dato};','','    function new();','    endfunction','','    function void print();','        $display("%0d", ${3:dato});','    endfunction','endclass']) },
            { label:'class_ext', detail:'Herencia (extends)',
              insertText: J(['class ${1:Hija} extends ${2:Base};','    function new(); super.new(); endfunction','endclass']) },

            // ── Rand / Constraints ──
            { label:'rand',        detail:'Propiedad rand', insertText:'rand ${1:int} ${2:val};' },
            { label:'randc',       detail:'Propiedad randc (cíclica)', insertText:'randc ${1:bit [3:0]} ${2:op};' },
            { label:'constraint',  detail:'Bloque constraint básico',
              insertText: J(['constraint ${1:c_nombre} {','    ${2:val} inside {[${3:0}:${4:8}]};','}']) },
            { label:'c_foreach',   detail:'Constraint con foreach (array)',
              insertText: J(['constraint ${1:c_arr} {','    foreach (${2:arr}[i])','        ${2:arr}[i] inside {[${3:1}:${4:9}]};','}']) },
            { label:'c_unique',    detail:'Constraint de unicidad entre pares',
              insertText: J(['constraint ${1:c_unico} {','    foreach (${2:arr}[i])','        foreach (${2:arr}[j])','            if (i < j) ${2:arr}[i] != ${2:arr}[j];','}']) },
            { label:'c_dist',      detail:'Constraint con distribución',
              insertText: J(["constraint ${1:c_dist} {","    ${2:v} dist { 1 := 30, 5 := 40, 9 := 30 };","}"]) },
            { label:'rand_with',   detail:'randomize() with inline',
              insertText: J(['if (!${1:obj}.randomize() with {','    ${2:cond};','}) $fatal(1, "randomize() falló");']) },
            { label:'randomize',   detail:'Llamada a randomize() con check',
              insertText: J(['if (!${1:obj}.randomize())','    $fatal(1, "${2:Randomize fallido}");']) },

            // ── Clase Sudoku completa ──
            { label:'sudoku_class', detail:'Clase SudokuGenerator completa (RCSG)',
              insertText: J([
                'class SudokuGenerator;',
                '    rand bit [3:0] grid [0:8][0:8];',
                '',
                '    // R1: valores 1-9',
                '    constraint c_rango {',
                "        foreach (grid[i,j]) grid[i][j] inside {[4'd1:4'd9]};",
                '    }',
                '    // R2: unicidad por filas',
                '    constraint c_filas {',
                '        foreach (grid[f]) unique {grid[f]};',
                '    }',
                '    // R3: unicidad por columnas',
                '    constraint c_cols {',
                '        foreach (grid[,c]) unique {grid[0][c], grid[1][c], grid[2][c], grid[3][c], grid[4][c], grid[5][c], grid[6][c], grid[7][c], grid[8][c]};',
                '    }',
                '    // R4: unicidad en cada caja 3x3',
                '    constraint c_cajas {',
                '        foreach (grid[r,c]) if (r%3==0 && c%3==0)',
                '            unique {grid[r][c], grid[r][c+1], grid[r][c+2], grid[r+1][c], grid[r+1][c+1], grid[r+1][c+2], grid[r+2][c], grid[r+2][c+1], grid[r+2][c+2]};',
                '    }',
                '',
                '    function void mostrar();',
                '        for (int f = 0; f < 9; f++) begin',
                '            for (int c = 0; c < 9; c++) $write("%0d", grid[f][c]);',
                '            $display("");',
                '        end',
                '    endfunction',
                '',
                '    function void exportar();',
                '        for (int f = 0; f < 9; f++) begin',
                '            $write("SUDOKU_ROW_%0d:", f);',
                '            for (int c = 0; c < 9; c++) $write("%0d", grid[f][c]);',
                '            $display("");',
                '        end',
                '    endfunction',
                'endclass'
              ])
            },

            // ── Testbench ──
            { label:'tb_sudoku', detail:'Banco de pruebas para SudokuGenerator',
              insertText: J([
                'module tb_sudoku;',
                '    initial begin',
                '        SudokuGenerator sdk = new();',
                '        if (sdk.randomize()) begin',
                '            $display("=== SUDOKU GENERADO ===");',
                '            sdk.mostrar();',
                '            sdk.exportar();',
                '        end else',
                '            $display("randomize() falló");',
                '        $finish;',
                '    end',
                'endmodule'
              ])
            },

            // ── Construcciones generales ──
            { label:'foreach',    detail:'Foreach sobre array 2D',
              insertText: J(['foreach (${1:arr}[${2:i},${3:j}]) begin','    ${0}','end']) },
            { label:'display',    detail:'$display básico', insertText:'$display("${1:%0d}", ${2:val});' },
            { label:'write',      detail:'$write (sin newline)', insertText:'$write("${1:%0d}", ${2:val});' },
            { label:'fatal',      detail:'$fatal con mensaje', insertText:'$fatal(1, "${1:Error: %0s}", ${2:msg});' },
            { label:'for9',       detail:'Bucle for 0..8',
              insertText: J(['for (int ${1:i} = 0; ${1:i} < 9; ${1:i}++) begin','    ${0}','end']) },
        ];
    }

    // ══════════════════════════════════════════════════════════════
    // 5. CÓDIGO INICIAL POR DEFECTO
    // ══════════════════════════════════════════════════════════════
    const CODIGO_CLASE = `// ─────────────────────────────────────────────────────────────
// sudoku_pkg.sv  –  Paquete con la clase SudokuGenerator
//                   (Random Constraint Solving Generation)
// Importar en el testbench con: import sudoku_pkg::*;
// ─────────────────────────────────────────────────────────────
package sudoku_pkg;

class SudokuGenerator;

    // Cuadrícula 9×9: valores 4 bits (1-9)
    rand bit [3:0] grid [0:8][0:8];

    // ── R1: Todos los valores entre 1 y 9 ────────────────────
    constraint c_rango {
        foreach (grid[i,j])
            grid[i][j] inside {[4'd1 : 4'd9]};
    }

    // ── R2: Unicidad por filas ────────────────────────────────
    constraint c_filas {
        foreach (grid[f]) {
            unique {grid[f][0], grid[f][1], grid[f][2], grid[f][3], grid[f][4], grid[f][5], grid[f][6], grid[f][7], grid[f][8]};
        }
    }

    // ── R3: Unicidad por columnas ─────────────────────────────
    constraint c_columnas {
        foreach (grid[, c]) {
            unique {grid[0][c], grid[1][c], grid[2][c], grid[3][c], grid[4][c], grid[5][c], grid[6][c], grid[7][c], grid[8][c]};
        }
    }

    // ── R4: Unicidad en cada caja 3×3 ────────────────────────
    constraint c_cajas {
        unique {grid[0][0], grid[0][1], grid[0][2], grid[1][0], grid[1][1], grid[1][2], grid[2][0], grid[2][1], grid[2][2]};
        unique {grid[0][3], grid[0][4], grid[0][5], grid[1][3], grid[1][4], grid[1][5], grid[2][3], grid[2][4], grid[2][5]};
        unique {grid[0][6], grid[0][7], grid[0][8], grid[1][6], grid[1][7], grid[1][8], grid[2][6], grid[2][7], grid[2][8]};

        unique {grid[3][0], grid[3][1], grid[3][2], grid[4][0], grid[4][1], grid[4][2], grid[5][0], grid[5][1], grid[5][2]};
        unique {grid[3][3], grid[3][4], grid[3][5], grid[4][3], grid[4][4], grid[4][5], grid[5][3], grid[5][4], grid[5][5]};
        unique {grid[3][6], grid[3][7], grid[3][8], grid[4][6], grid[4][7], grid[4][8], grid[5][6], grid[5][7], grid[5][8]};

        unique {grid[6][0], grid[6][1], grid[6][2], grid[7][0], grid[7][1], grid[7][2], grid[8][0], grid[8][1], grid[8][2]};
        unique {grid[6][3], grid[6][4], grid[6][5], grid[7][3], grid[7][4], grid[7][5], grid[8][3], grid[8][4], grid[8][5]};
        unique {grid[6][6], grid[6][7], grid[6][8], grid[7][6], grid[7][7], grid[7][8], grid[8][6], grid[8][7], grid[8][8]};
    }

    // ── Constructor ───────────────────────────────────────────
    function new();
    endfunction

    // ── Mostrar cuadrícula (legible) ─────────────────────────
    function void mostrar();
        $display("┌───────┬───────┬───────┐");
        for (int f = 0; f < 9; f++) begin
            if (f == 3 || f == 6)
                $display("├───────┼───────┼───────┤");
            $write("│ ");
            for (int c = 0; c < 9; c++) begin
                $write("%0d ", grid[f][c]);
                if (c == 2 || c == 5) $write("│ ");
            end
            $display("│");
        end
        $display("└───────┴───────┴───────┘");
    endfunction

    // ── Exportar (para el visor del simulador) ────────────────
    function void exportar();
        for (int f = 0; f < 9; f++) begin
            $write("SUDOKU_ROW_%0d:", f);
            for (int c = 0; c < 9; c++)
                $write("%0d", grid[f][c]);
            $display("");
        end
    endfunction

    // ── Validación manual ─────────────────────────────────────
    function bit validar();
        bit [9:1] visto;
        // Filas
        for (int f = 0; f < 9; f++) begin
            visto = 0;
            for (int c = 0; c < 9; c++) visto[grid[f][c]] = 1;
            if (visto !== 9'b1_1111_1111) return 0;
        end
        // Columnas
        for (int c = 0; c < 9; c++) begin
            visto = 0;
            for (int f = 0; f < 9; f++) visto[grid[f][c]] = 1;
            if (visto !== 9'b1_1111_1111) return 0;
        end
        // Cajas 3×3
        for (int br = 0; br < 3; br++)
            for (int bc = 0; bc < 3; bc++) begin
                visto = 0;
                for (int r = 0; r < 3; r++)
                    for (int cc = 0; cc < 3; cc++)
                        visto[grid[br*3+r][bc*3+cc]] = 1;
                if (visto !== 9'b1_1111_1111) return 0;
            end
        return 1;
    endfunction

endclass

endpackage : sudoku_pkg`;

    const CODIGO_TB = `// ─────────────────────────────────────────────────────────────
// tb_sudoku.sv  –  Banco de pruebas: generación por RCSG
//                  Llama a randomize() de forma inteligente y
//                  muestra el resultado en la consola.
// ─────────────────────────────────────────────────────────────
import sudoku_pkg::*;  // importar clase SudokuGenerator

module tb_sudoku;

    initial begin : banco_pruebas

        SudokuGenerator sdk;
        int num_intentos;
        int exitos;

        sdk          = new();
        num_intentos = 3;   // ← cambia para más sudokus
        exitos       = 0;

        $display("╔══════════════════════════════════════════╗");
        $display("║   GENERADOR DE SUDOKU  —  RCSG (SV)      ║");
        $display("╚══════════════════════════════════════════╝");

        for (int i = 0; i < num_intentos; i++) begin

            $display("\\n[%0d/%0d] Ejecutando randomize()...", i+1, num_intentos);

            if (sdk.randomize()) begin

                $display("✔ Sudoku %0d generado correctamente.", i+1);

                // Validación extra
                if (sdk.validar())
                    $display("✔ Validación: Sudoku CORRECTO");
                else
                    $display("✘ Validación: Sudoku INVÁLIDO (bug en constraints)");

                // Cuadrícula legible en el transcript
                sdk.mostrar();

                // Datos en formato máquina → alimenta el visor
                $display("--- DATOS VISOR ---");
                sdk.exportar();
                $display("--- FIN DATOS ---");

                exitos++;

            end else begin
                $display("✘ randomize() falló en intento %0d", i+1);
            end

        end // for intentos

        $display("\\n=== RESUMEN: %0d/%0d sudokus generados ===", exitos, num_intentos);
        $finish;

    end

endmodule`;

    // ══════════════════════════════════════════════════════════════
    // 6. INICIALIZACIÓN PRINCIPAL
    // ══════════════════════════════════════════════════════════════
    function initSudoku() {
        const containerTB    = document.getElementById('sdk-editor-tb');
        const containerClase = document.getElementById('sdk-editor-clase');
        if (!containerTB || !containerClase) return;

        // ── 6a. WebSocket ──────────────────────────────────────
        const wsUrl = (typeof SUDOKU_FPGA_CONFIG !== 'undefined' && SUDOKU_FPGA_CONFIG.ws_url)
            ? SUDOKU_FPGA_CONFIG.ws_url
            : 'ws://localhost:8000/ws';

        ws = new WebSocket(wsUrl);

        ws.onopen  = () => setEstadoWS('🟢 CONECTADO', '#2ecc71');
        ws.onclose = () => { setEstadoWS('🔴 DESCONECTADO', '#e74c3c'); restaurarBotones(); };
        ws.onerror = () => restaurarBotones();

        ws.onmessage = (e) => {
            let r;
            try { r = JSON.parse(e.data); } catch { return; }

            // Restaurar botones ante cualquier respuesta final
            if (r.status || r.tipo === 'error') restaurarBotones();

            switch (true) {
                // Error de linter / compilación
                case (r.status === 'error_compilacion' || r.tipo === 'linter_error'): {
                    setEstadoWS('🔴 ERROR', '#e74c3c');
                    const msg = r.detalles || r.transcript || 'Error detectado.';
                    setTranscript(msg, true);
                    setTranscriptStatus('❌ Error de compilación');
                    break;
                }
                // Linter OK
                case (r.status === 'linter_ok'): {
                    setEstadoWS('🟢 CÓDIGO CORRECTO', '#2ecc71');
                    setTranscript(r.transcript || '✓ Sintaxis correcta.', false);
                    setTranscriptStatus('✔ Linter OK');
                    break;
                }
                // compilado_ok → QuestaSim terminó (compile + vsim)
                // Es la respuesta real de "Generar Sudoku"
                case (r.status === 'compilado_ok'): {
                    var textoSim = r.transcript || '';
                    if (textoSim.indexOf('⚠️ Timeout') !== -1) {
                        setEstadoWS('🔴 TIMEOUT', '#e74c3c');
                        setTranscript(textoSim, true);
                        setTranscriptStatus('❌ Timeout QuestaSim');
                    } else {
                        setEstadoWS('🟢 SIMULACIÓN OK', '#2ecc71');
                        setTranscript(textoSim, false);
                        setTranscriptStatus('✔ Sudoku generado');
                        // Parsear todas las filas del transcript completo
                        _bufferFilas = {};
                        intentarParsearSudoku(textoSim);
                    }
                    break;
                }
                // simulacion_ok → Icarus (no usado para Sudoku, por compatibilidad)
                case (r.status === 'simulacion_ok'): {
                    setEstadoWS('🟢 SIMULACIÓN EN CURSO', '#2ecc71');
                    setTranscript(r.transcript || '▶ Simulación iniciada...', false);
                    setTranscriptStatus('▶ Simulando...');
                    _bufferFilas = {};
                    break;
                }
                // Transcript en tiempo real (streaming)
                case (r.tipo === 'transcript'): {
                    appendTranscript(r.contenido || r.transcript, false);
                    setTranscriptStatus('📡 Recibiendo salida...');
                    break;
                }
                // Error genérico
                case (r.tipo === 'error'): {
                    appendTranscript('❌ ' + (r.mensaje || 'Error desconocido'), true);
                    setTranscriptStatus('❌ Error');
                    break;
                }
            }
        };

        // ── 6b. Editores Monaco en iframes ────────────────────
        const snippetsJSON = JSON.stringify(getSnippets());

        function crearEditor(contenedor, codigoInicial) {
            contenedor.innerHTML = '';
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'width:100%; height:100%; border:none;';
            contenedor.appendChild(iframe);

            const doc = iframe.contentDocument || iframe.contentWindow.document;
            const html = `<!DOCTYPE html><html>
<head>
<style>
  html,body,#ed{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:#1e1e1e;}
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/loader.min.js"></script>
</head>
<body><div id="ed"></div>
<script>
require.config({paths:{vs:'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs'}});
require(['vs/editor/editor.main'],function(){
    window.editor = monaco.editor.create(document.getElementById('ed'),{
        value: ${JSON.stringify(codigoInicial)},
        language: 'verilog',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap:{enabled:false},
        suggestOnTriggerCharacters:true,
        quickSuggestions:{other:true,comments:false,strings:false}
    });
    // Ctrl+S → linter desde el iframe
    window.editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyS,function(){
        window.parent.postMessage({accion:'linter'},'*');
    });
    // Snippets RCSG
    const SNIPPETS = ${snippetsJSON};
    monaco.languages.registerCompletionItemProvider('verilog',{
        triggerCharacters:['c','e','f','r','s','t','n','w'],
        provideCompletionItems:function(model,position){
            const word=model.getWordUntilPosition(position);
            const range={startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,
                         startColumn:word.startColumn,endColumn:word.endColumn};
            return{suggestions:SNIPPETS.map(function(s){return{
                label:s.label,kind:monaco.languages.CompletionItemKind.Snippet,
                detail:s.detail,insertText:s.insertText,
                insertTextRules:monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range:range
            };})};
        }
    });
});
</script></body></html>`;

            doc.open();
            doc.write(html);
            doc.close();
            return iframe;
        }

        const iframeTB    = crearEditor(containerTB,    CODIGO_TB);
        const iframeClase = crearEditor(containerClase, CODIGO_CLASE);

        // ── 6c. Helpers de lectura ─────────────────────────────
        function leerEditor(iframe) {
            try { return iframe.contentWindow.editor.getValue(); } catch { return ''; }
        }

        function wsEnviar(payload) {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                setTranscript('❌ WebSocket desconectado.', true);
                return false;
            }
            ws.send(JSON.stringify(payload));
            return true;
        }

        // ── 6d. Acciones ───────────────────────────────────────
        function ejecutarLinter() {
            const clase = leerEditor(iframeClase);
            const tb    = leerEditor(iframeTB);
            if (!wsEnviar({ accion:'linter', codigo:clase, testbench:tb })) return;
            mostrarCargando('linter');
            setTranscript('🔍 Comprobando sintaxis...', false);
        }

        function compilarCodigo() {
            // "Verificar" = solo linter (rápido, sin ejecutar QuestaSim)
            const clase = leerEditor(iframeClase);
            const tb    = leerEditor(iframeTB);
            if (!wsEnviar({ accion:'linter', codigo:clase, testbench:tb })) return;
            mostrarCargando('compilar');
            setEstadoWS('⏳ COMPROBANDO SINTAXIS...', '#f1c40f');
            setTranscript('🔍 Verificando sintaxis con vlog -lint...', false);
        }

        function simularCodigo() {
            // Inyectar el número de intentos seleccionado en el testbench
            const _selIntentos = document.getElementById('sdk-num-intentos');
            const numIntentos = _selIntentos ? _selIntentos.value : '3';
            let clase = leerEditor(iframeClase);
            let tb    = leerEditor(iframeTB);

            // Reemplazar num_intentos dinámicamente si el usuario no lo cambió a mano
            tb = tb.replace(/num_intentos\s*=\s*\d+;/, `num_intentos = ${numIntentos};`);

            // "Generar Sudoku" usa compilar → vlog + vsim (QuestaSim)
            // Icarus no soporta classes/constraints de SystemVerilog
            if (!wsEnviar({ accion:'compilar', codigo:clase, testbench:tb })) return;
            mostrarCargando('simular');
            setEstadoWS('⏳ EJECUTANDO QUESTASIM...', '#f1c40f');
            setTranscript('▶️ Compilando y ejecutando randomize() en QuestaSim...\n⏳ El solver de restricciones puede tardar (espera hasta 60s)...', false);
            setTranscriptStatus('▶ QuestaSim en ejecución...');
            // Reset colección para esta sesión de simulación
            _bufferFilas = {};
        }

        function limpiarTodo() {
            setTranscript('// Transcript limpiado.', false);
            setTranscriptStatus('Esperando acción...');
            const visor = document.getElementById('sdk-visor-sudoku');
            if (visor) {
                visor.innerHTML = '<p style="text-align:center;color:#7f8c8d;font-size:13px;font-style:italic;">Pulsa <strong>🎲 Generar Sudoku</strong> para visualizar el resultado.</p>';
            }
            const badge = document.getElementById('sdk-visor-badge');
            if (badge) badge.style.display = 'none';
            sudokusSesion.length = 0;
            indiceActual = -1;
            actualizarNavegacion();
            _bufferFilas = {};
        }

        // ── 6e. Navegación entre sudokus ───────────────────────
        var _bAnt = document.getElementById('sdk-btn-anterior');
        if (_bAnt) _bAnt.addEventListener('click', function() {
            if (indiceActual > 0) {
                indiceActual--;
                var _s = sudokusSesion[indiceActual];
                renderizarSudoku(_s.grid, _s.valido);
                actualizarNavegacion();
            }
        });

        var _bSig = document.getElementById('sdk-btn-siguiente');
        if (_bSig) _bSig.addEventListener('click', function() {
            if (indiceActual < sudokusSesion.length - 1) {
                indiceActual++;
                var _s = sudokusSesion[indiceActual];
                renderizarSudoku(_s.grid, _s.valido);
                actualizarNavegacion();
            }
        });

        // ── 6f. Bindings de botones principales ───────────────
        var _bLint = document.getElementById('sdk-btn-linter');
        if (_bLint) _bLint.addEventListener('click', ejecutarLinter);
        var _bComp = document.getElementById('sdk-btn-compilar');
        if (_bComp) _bComp.addEventListener('click', compilarCodigo);
        var _bSim  = document.getElementById('sdk-btn-simular');
        if (_bSim)  _bSim.addEventListener('click', simularCodigo);
        var _bLimp = document.getElementById('sdk-btn-limpiar');
        if (_bLimp) _bLimp.addEventListener('click', limpiarTodo);

        // Ctrl+S desde iframes propaga al linter
        window.addEventListener('message', (event) => {
            if (event.data && event.data.accion === 'linter') ejecutarLinter();
        });
    }

    // ── Arrancar cuando el DOM esté listo ─────────────────────
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initSudoku();
    } else {
        document.addEventListener('DOMContentLoaded', initSudoku);
    }

})();
