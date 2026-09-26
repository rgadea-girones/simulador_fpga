document.addEventListener('DOMContentLoaded', function () {
    const tbEditorContainer = document.getElementById('sim-avanzado-editor-tb');
    const designEditorContainer = document.getElementById('sim-avanzado-editor-design');
    const consoleEl = document.getElementById('sim-avanzado-console');
    const statusBadge = document.getElementById('sim-avanzado-status-badge');
    const vcdBadge = document.getElementById('vcd-status-badge');
    const ejecutarBtn = document.querySelector('.sim-avanzado-run');
    const limpiarBtn = document.querySelector('.sim-avanzado-clear');

    const tabConsoleBtn = document.getElementById('tab-btn-console');
    const tabVcdBtn = document.getElementById('tab-btn-vcd');
    const consolePane = document.getElementById('sim-avanzado-console-pane');
    const vcdPane = document.getElementById('sim-avanzado-vcd-pane');
    const reloadVcdBtn = document.getElementById('sim-avanzado-reload-vcd');
    const surferIframe = document.getElementById('sim-avanzado-surfer-iframe');

    if (!tbEditorContainer || !designEditorContainer || !consoleEl || !ejecutarBtn) {
        return;
    }

    let ws = null;
    let currentVcdUrl = null;
    let currentVcdFile = null;

    const defaultTbCode = `module tb_shifter_2d;
  parameter TAM = 4;
  logic clock;
  logic reset;
  logic enable;
  logic [7:0] entrada_serie;
  logic clear;
  logic shift;
  logic [7:0] salida_serie;

  shifter_2d #(
    .tamanyo(TAM)
  ) dut (
    .clock        (clock),
    .reset        (reset),
    .enable       (enable),
    .entrada_serie(entrada_serie),
    .clear        (clear),
    .shift        (shift),
    .salida_serie (salida_serie)
  );

  always #5 clock = ~clock;

  initial begin
    $dumpfile("wave.vcd");
    $dumpvars(0, tb_shifter_2d);

    clock = 0; reset = 0; enable = 1; clear = 0; shift = 0; entrada_serie = 8'h00;
    $display("--- SIMULACIÓN SHIFTER 2D ---");

    #12; reset = 1;
    shift = 1;
    entrada_serie = 8'hA1; #10;
    entrada_serie = 8'hB2; #10;
    entrada_serie = 8'hC3; #10;
    entrada_serie = 8'hD4; #10;
    $display("[%0t ns] Salida serie: 0x%0h", $time, salida_serie);

    shift = 0; #10;
    clear = 1; #10;
    $display("[%0t ns] Tras Clear: 0x%0h", $time, salida_serie);

    $display("--- FIN DE SIMULACIÓN ---");
    $finish;
  end
endmodule`;

    const defaultDesignCode = `module shifter_2d(clock, reset, enable, clear, shift, entrada_serie, salida_serie);
  parameter tamanyo = 32;
  input clock;
  input reset;
  input enable;
  input [7:0] entrada_serie;
  input clear;
  input shift;
  output [7:0] salida_serie;

  logic [tamanyo-1:0][7:0] aux;

  always_ff @(posedge clock or negedge reset) begin
    if (!reset)
      aux <= {tamanyo{8'b0}};
    else if (!clear) begin
      if (shift == 1'b1)
        aux <= {entrada_serie, aux[tamanyo-1:1]};
    end else
      aux <= {tamanyo{8'b0}};
  end

  assign salida_serie = aux[0];
endmodule`;

    function updateStatus(connected) {
        if (!statusBadge) return;
        if (connected) {
            statusBadge.textContent = 'Conectado';
            statusBadge.className = 'status-indicator connected';
        } else {
            statusBadge.textContent = 'Desconectado';
            statusBadge.className = 'status-indicator disconnected';
        }
    }

    function addLine(message, type) {
        const line = document.createElement('div');
        line.className = 'sim-transcript-line ' + (type || 'ok');
        line.textContent = message;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    function setTranscript(text, isError) {
        consoleEl.innerHTML = '';
        addLine(text, isError ? 'error' : 'ok');
    }

    function resetConsole(message) {
        consoleEl.innerHTML = '';
        addLine(message || '> Console transcript limpia.', 'ok');
    }

    function getTbValue() {
        if (window.simAvanzadoTbEditor && typeof window.simAvanzadoTbEditor.getValue === 'function') {
            return window.simAvanzadoTbEditor.getValue();
        }
        return defaultTbCode;
    }

    function getDesignValue() {
        if (window.simAvanzadoDesignEditor && typeof window.simAvanzadoDesignEditor.getValue === 'function') {
            return window.simAvanzadoDesignEditor.getValue();
        }
        return defaultDesignCode;
    }

    function buildAbsoluteUrl(relativeOrAbs) {
        if (!relativeOrAbs) return '';
        if (relativeOrAbs.startsWith('http://') || relativeOrAbs.startsWith('https://')) {
            return relativeOrAbs;
        }
        const vcdBase = (typeof SIMULADOR_AVANZADO_CONFIG !== 'undefined' && SIMULADOR_AVANZADO_CONFIG.vcd_base_url)
            ? SIMULADOR_AVANZADO_CONFIG.vcd_base_url
            : 'http://localhost:8000';
        return vcdBase.replace(/\/$/, '') + '/' + relativeOrAbs.replace(/^\//, '');
    }

    function switchTab(tabName) {
        if (tabName === 'console') {
            tabConsoleBtn.classList.add('active');
            tabVcdBtn.classList.remove('active');
            consolePane.classList.add('active');
            vcdPane.classList.remove('active');
        } else if (tabName === 'vcd' && !tabVcdBtn.hasAttribute('disabled')) {
            tabVcdBtn.classList.add('active');
            tabConsoleBtn.classList.remove('active');
            vcdPane.classList.add('active');
            consolePane.classList.remove('active');
        }
    }

    function enableVcdTab(vcdUrl, vcdFile) {
        currentVcdUrl = buildAbsoluteUrl(vcdUrl);
        currentVcdFile = vcdFile || 'wave.vcd';

        tabVcdBtn.removeAttribute('disabled');
        tabVcdBtn.classList.remove('disabled');
        if (vcdBadge) {
            vcdBadge.textContent = 'Ondas OK';
            vcdBadge.className = 'vcd-badge available';
        }
        if (reloadVcdBtn) {
            reloadVcdBtn.style.display = 'inline-block';
        }

        const surferBaseUrl = (typeof SIMULADOR_AVANZADO_CONFIG !== 'undefined' && SIMULADOR_AVANZADO_CONFIG.surfer_url)
            ? SIMULADOR_AVANZADO_CONFIG.surfer_url
            : 'http://localhost:8000/surfer/index.html';

        function sendLoadCommand() {
            if (surferIframe && surferIframe.contentWindow && currentVcdUrl) {
                try {
                    surferIframe.contentWindow.postMessage({
                        command: 'LoadUrl',
                        url: currentVcdUrl
                    }, '*');
                } catch (e) {
                    console.error('Error postMessage Surfer:', e);
                }
            }
        }

        if (surferIframe) {
            if (surferIframe.src === 'about:blank' || !surferIframe.src.includes('/surfer/')) {
                surferIframe.src = surferBaseUrl;
                surferIframe.onload = function () {
                    setTimeout(sendLoadCommand, 800);
                };
            } else {
                sendLoadCommand();
                setTimeout(sendLoadCommand, 600);
            }
        }

        // Cambiar automáticamente a la pestaña VCD
        switchTab('vcd');
        addLine('> 📈 Forma de onda VCD cargada. Mostrando visor Surfer.', 'vcd-notify');
    }

    function disableVcdTab() {
        tabVcdBtn.setAttribute('disabled', 'true');
        tabVcdBtn.classList.add('disabled');
        tabVcdBtn.classList.remove('active');
        if (vcdBadge) {
            vcdBadge.textContent = 'Sin VCD';
            vcdBadge.className = 'vcd-badge';
        }
        if (reloadVcdBtn) {
            reloadVcdBtn.style.display = 'none';
        }
        switchTab('console');
    }

    function connectWebSocket() {
        const wsUrl = (typeof SIMULADOR_AVANZADO_CONFIG !== 'undefined' && SIMULADOR_AVANZADO_CONFIG.ws_url)
            ? SIMULADOR_AVANZADO_CONFIG.ws_url
            : 'ws://localhost:8000/ws';

        if (ws && ws.readyState === WebSocket.OPEN) {
            return;
        }

        ws = new WebSocket(wsUrl);

        ws.onopen = function () {
            updateStatus(true);
            setTranscript('> Conectado al servidor de simulación.', false);
            ws.send(JSON.stringify({ accion: 'check_vcd' }));
        };

        ws.onclose = function () {
            updateStatus(false);
            setTranscript('> WebSocket desconectado.', true);
        };

        ws.onerror = function () {
            updateStatus(false);
            setTranscript('> Error de conexión WebSocket con el backend.', true);
        };

        ws.onmessage = function (event) {
            let payload;
            try {
                payload = JSON.parse(event.data);
            } catch (error) {
                addLine(event.data, 'ok');
                return;
            }

            if (payload.status === 'error_compilacion' || payload.tipo === 'linter_error') {
                const errorMsg = payload.detalles || payload.transcript || 'Error de compilación.';
                setTranscript(errorMsg, true);
                disableVcdTab();
                return;
            }

            if (payload.status === 'compilado_ok' || payload.status === 'simulacion_ok') {
                setTranscript(payload.transcript || '✓ Simulación ejecutada correctamente.', false);
                if (payload.has_vcd && payload.vcd_url) {
                    enableVcdTab(payload.vcd_url, payload.vcd_file);
                } else {
                    disableVcdTab();
                }
                return;
            }

            if (payload.tipo === 'vcd_status') {
                if (payload.has_vcd && payload.vcd_url) {
                    enableVcdTab(payload.vcd_url, payload.vcd_file);
                } else {
                    disableVcdTab();
                }
                return;
            }

            if (payload.transcript) {
                addLine(payload.transcript, false);
            }

            if (payload.has_vcd && payload.vcd_url) {
                enableVcdTab(payload.vcd_url, payload.vcd_file);
            }
        };
    }

    function initMonacoEditors() {
        if (window.simAvanzadoTbEditor && window.simAvanzadoDesignEditor) {
            return;
        }

        function createEditors() {
            if (!window.simAvanzadoTbEditor && tbEditorContainer) {
                window.simAvanzadoTbEditor = monaco.editor.create(tbEditorContainer, {
                    value: defaultTbCode,
                    language: 'verilog',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    lineNumbersMinChars: 3
                });
            }

            if (!window.simAvanzadoDesignEditor && designEditorContainer) {
                window.simAvanzadoDesignEditor = monaco.editor.create(designEditorContainer, {
                    value: defaultDesignCode,
                    language: 'verilog',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    lineNumbersMinChars: 3
                });
            }
        }

        if (window.monaco && window.monaco.editor) {
            createEditors();
            return;
        }

        const existingLoader = document.querySelector('script[data-sim-avanzado-monaco="true"]');
        if (existingLoader) {
            existingLoader.addEventListener('load', createEditors, { once: true });
            return;
        }

        const loader = document.createElement('script');
        loader.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js';
        loader.setAttribute('data-sim-avanzado-monaco', 'true');
        loader.onload = function () {
            require.config({
                paths: {
                    vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs'
                }
            });
            require(['vs/editor/editor.main'], function () {
                createEditors();
            });
        };
        document.head.appendChild(loader);
    }

    initMonacoEditors();
    connectWebSocket();

    // Manejadores de eventos de pestañas
    if (tabConsoleBtn) {
        tabConsoleBtn.addEventListener('click', function () {
            switchTab('console');
        });
    }

    if (tabVcdBtn) {
        tabVcdBtn.addEventListener('click', function () {
            switchTab('vcd');
        });
    }

    ejecutarBtn.addEventListener('click', function () {
        const tbCode = getTbValue().trim();
        const designCode = getDesignValue().trim();

        if (!tbCode && !designCode) {
            setTranscript('> Error: Los editores están vacíos.', true);
            return;
        }

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connectWebSocket();
        }

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            setTranscript('> WebSocket no disponible. Comprueba la conexión con el backend.', true);
            return;
        }

        setTranscript('> Iniciando simulación con QuestaSim...', false);
        ws.send(JSON.stringify({
            accion: 'compilar',
            simulador: 'questasim',
            codigo: designCode || tbCode,
            testbench: tbCode || designCode
        }));
    });

    limpiarBtn.addEventListener('click', function () {
        resetConsole('> Console transcript limpia.');
        disableVcdTab();
        if (window.simAvanzadoTbEditor) {
            window.simAvanzadoTbEditor.setValue(defaultTbCode);
        }
        if (window.simAvanzadoDesignEditor) {
            window.simAvanzadoDesignEditor.setValue(defaultDesignCode);
        }
    });

    if (reloadVcdBtn) {
        reloadVcdBtn.addEventListener('click', function () {
            if (currentVcdUrl) {
                enableVcdTab(currentVcdUrl, currentVcdFile);
            }
        });
    }
});
