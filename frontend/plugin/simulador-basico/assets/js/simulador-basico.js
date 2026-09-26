document.addEventListener('DOMContentLoaded', function () {
    const editorContainer = document.getElementById('sim-basico-editor');
    const consoleEl = document.getElementById('sim-basico-console');
    const ejecutarBtn = document.querySelector('.sim-basico-run');
    const limpiarBtn = document.querySelector('.sim-basico-clear');

    if (!editorContainer || !consoleEl || !ejecutarBtn || !limpiarBtn) {
        return;
    }

    let ws = null;

    const defaultCode = `module tb_basico;
  initial begin
    $display("QuestaSim: inicio de simulación");
    $display("Valor A = %0d", 10);
    $display("Valor B = %0d", 20);
    $display("Resultado = %0d", 10 + 20);
  end
endmodule`;

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

    function getEditorValue() {
        if (window.simBasicoEditor && typeof window.simBasicoEditor.getValue === 'function') {
            return window.simBasicoEditor.getValue();
        }
        return defaultCode;
    }

    function connectWebSocket() {
        const wsUrl = (typeof SIMULADOR_BASICO_CONFIG !== 'undefined' && SIMULADOR_BASICO_CONFIG.ws_url)
            ? SIMULADOR_BASICO_CONFIG.ws_url
            : 'ws://localhost:8000/ws';

        if (ws && ws.readyState === WebSocket.OPEN) {
            return;
        }

        ws = new WebSocket(wsUrl);

        ws.onopen = function () {
            setTranscript('> Questasim: conectado al backend.', false);
        };

        ws.onclose = function () {
            setTranscript('> Questasim: WebSocket desconectado.', true);
        };

        ws.onerror = function () {
            setTranscript('> Questasim: error de conexión con el backend.', true);
        };

        ws.onmessage = function (event) {
            let payload;
            try {
                payload = JSON.parse(event.data);
            } catch (error) {
                appendTranscript(event.data, false);
                return;
            }

            if (payload.status === 'error_compilacion' || payload.tipo === 'linter_error') {
                const errorMsg = payload.detalles || payload.transcript || 'Error de compilación.';
                setTranscript(errorMsg, true);
                return;
            }

            if (payload.status === 'linter_ok') {
                setTranscript(payload.transcript || 'QuestaSim: sintaxis OK.', false);
                return;
            }

            if (payload.status === 'compilado_ok') {
                setTranscript(payload.transcript || 'QuestaSim: simulación finalizada correctamente.', false);
                return;
            }

            if (payload.tipo === 'transcript') {
                appendTranscript(payload.contenido || payload.transcript || '', false);
                return;
            }

            if (payload.transcript) {
                appendTranscript(payload.transcript, false);
            }
        };
    }

    function appendTranscript(message, isError) {
        const line = document.createElement('div');
        line.className = 'sim-transcript-line ' + (isError ? 'error' : 'ok');
        line.textContent = message;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    function initMonaco() {
        if (window.simBasicoEditor) {
            return;
        }

        if (window.monaco && window.monaco.editor) {
            window.simBasicoEditor = monaco.editor.create(editorContainer, {
                value: defaultCode,
                language: 'verilog',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                lineNumbersMinChars: 3
            });
            return;
        }

        const existingLoader = document.querySelector('script[data-sim-basico-monaco="true"]');
        if (existingLoader) {
            existingLoader.addEventListener('load', initMonaco, { once: true });
            return;
        }

        const loader = document.createElement('script');
        loader.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js';
        loader.setAttribute('data-sim-basico-monaco', 'true');
        loader.onload = function () {
            require.config({
                paths: {
                    vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs'
                }
            });

            require(['vs/editor/editor.main'], function () {
                window.simBasicoEditor = monaco.editor.create(editorContainer, {
                    value: defaultCode,
                    language: 'verilog',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    lineNumbersMinChars: 3
                });
            });
        };
        document.head.appendChild(loader);
    }

    initMonaco();
    connectWebSocket();

    ejecutarBtn.addEventListener('click', function () {
        const contenido = getEditorValue().trim();

        if (!contenido) {
            setTranscript('> Questasim: error, el banco de pruebas está vacío.', true);
            addLine('> Introduce un bloque de código para ejecutar.', 'error');
            return;
        }

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connectWebSocket();
        }

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            setTranscript('> Questasim: WebSocket no disponible. Revisa la conexión del backend.', true);
            return;
        }

        setTranscript('> Questasim: compilando...', false);
        ws.send(JSON.stringify({
            accion: 'compilar',
            codigo: contenido,
            testbench: contenido
        }));
    });

    limpiarBtn.addEventListener('click', function () {
        resetConsole('> Console transcript limpia.');
        if (window.simBasicoEditor) {
            window.simBasicoEditor.setValue(defaultCode);
        }
    });
});
