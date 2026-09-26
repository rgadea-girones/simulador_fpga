document.addEventListener('DOMContentLoaded', function () {
  const root = document.getElementById('simulador-aserciones-root');
  if (!root) return;

  const listEl = root.querySelector('#sva-example-list');
  const detailEl = root.querySelector('#sva-detail');

  const cfg = (typeof SIMULADOR_ASERCIONES_CONFIG !== 'undefined') ? SIMULADOR_ASERCIONES_CONFIG : {};
  const examplesUrl = cfg.examples_url || '';
  const wsUrl = cfg.ws_url || 'ws://localhost:8000/ws';
  const surferUrl = cfg.surfer_url || 'http://localhost:8000/surfer/index.html';
  const vcdBaseUrl = cfg.vcd_base_url || 'http://localhost:8000';

  const sim = {
    ws: null,
    currentVcdUrl: null,
    currentVcdFile: null,
    editorsReady: false,
    pendingExample: null,
    exampleToRun: false,
    designEditor: null,
    tbEditor: null
  };

  let examples = [];
  let selectedId = null;

  const simNodes = {
    designContainer: root.querySelector('#sva-editor-design'),
    tbContainer: root.querySelector('#sva-editor-tb'),
    consoleEl: root.querySelector('#sva-console'),
    statusBadge: root.querySelector('#sva-status-badge'),
    vcdBadge: root.querySelector('#sva-vcd-badge'),
    runBtn: root.querySelector('#sva-sim-run'),
    clearBtn: root.querySelector('#sva-sim-clear'),
    tabConsoleBtn: root.querySelector('#sva-tab-console'),
    tabVcdBtn: root.querySelector('#sva-tab-vcd'),
    consolePane: root.querySelector('#sva-console-pane'),
    vcdPane: root.querySelector('#sva-vcd-pane'),
    reloadVcdBtn: root.querySelector('#sva-reload-vcd'),
    surferIframe: root.querySelector('#sva-surfer-iframe')
  };

  const defaultDesign = `module dut(input logic clk,input logic rst_n,input logic req,output logic ack);
  logic [1:0] sh;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin sh<=0; ack<=0; end
    else begin sh<={sh[0],req}; ack<=sh[1]; end
  end
endmodule`;

  const defaultTb = `module tb;
  logic clk=0,rst_n=0,req,ack;
  dut u0(.clk(clk),.rst_n(rst_n),.req(req),.ack(ack));
  always #5 clk=~clk;

  assert property(@(posedge clk) disable iff(!rst_n) req |-> ##2 ack)
    else $error("ACK no llego a tiempo");

  initial begin
    $dumpfile("wave.vcd");
    $dumpvars(0, tb);
    req=0;
    repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) req<=1;
    @(posedge clk) req<=0;
    repeat(6) @(posedge clk);
    $finish;
  end
endmodule`;

  function normalizeSvCode(rawCode, fallbackCode) {
    const src = (typeof rawCode === 'string' && rawCode.trim()) ? rawCode : fallbackCode;
    if (!src) return '';

    const unescaped = src.replace(/\\n/g, '\n');
    if (unescaped.includes('\n')) {
      return unescaped;
    }

    return formatOneLineSv(unescaped);
  }

  function formatOneLineSv(code) {
    if (!code) return '';

    let text = code.replace(/\s+/g, ' ').trim();

    text = text
      .replace(/;/g, ';\n')
      .replace(/\bmodule\b/g, '\nmodule')
      .replace(/\bendmodule\b/g, '\nendmodule\n')
      .replace(/\bbegin\b/g, 'begin\n')
      .replace(/\bendcase\b/g, '\nendcase')
      .replace(/\bend\b/g, '\nend')
      .replace(/\belse\b/g, '\nelse')
      .replace(/\n{2,}/g, '\n')
      .trim();

    const lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    const out = [];
    let indent = 0;

    lines.forEach(function (line) {
      const lower = line.toLowerCase();
      if (lower.startsWith('end') || lower.startsWith('else') || lower.startsWith('endcase')) {
        indent = Math.max(0, indent - 1);
      }

      out.push('  '.repeat(indent) + line);

      if (lower.endsWith('begin') || lower.startsWith('case ') || lower === 'case') {
        indent += 1;
      }

      if (lower.startsWith('else begin')) {
        indent += 1;
      }
    });

    return out.join('\n');
  }

  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function groupLabel(key) {
    if (key === 'basico') return 'Nivel Basico';
    if (key === 'intermedio') return 'Nivel Intermedio';
    if (key === 'avanzado') return 'Nivel Avanzado';
    return 'Otros';
  }

  function updateStatus(connected) {
    if (!simNodes.statusBadge) return;
    if (connected) {
      simNodes.statusBadge.textContent = 'Conectado';
      simNodes.statusBadge.className = 'sva-status-indicator connected';
    } else {
      simNodes.statusBadge.textContent = 'Desconectado';
      simNodes.statusBadge.className = 'sva-status-indicator disconnected';
    }
  }

  function addLine(message, type) {
    if (!simNodes.consoleEl) return;
    const line = document.createElement('div');
    line.className = 'sva-transcript-line' + (type ? ' ' + type : '');
    line.textContent = message;
    simNodes.consoleEl.appendChild(line);
    simNodes.consoleEl.scrollTop = simNodes.consoleEl.scrollHeight;
  }

  function setTranscript(text, isError) {
    if (!simNodes.consoleEl) return;
    simNodes.consoleEl.innerHTML = '';
    addLine(text, isError ? 'error' : 'ok');
  }

  function switchTab(tabName) {
    if (tabName === 'console') {
      simNodes.tabConsoleBtn.classList.add('active');
      simNodes.tabVcdBtn.classList.remove('active');
      simNodes.consolePane.classList.add('active');
      simNodes.vcdPane.classList.remove('active');
    } else if (tabName === 'vcd' && !simNodes.tabVcdBtn.hasAttribute('disabled')) {
      simNodes.tabVcdBtn.classList.add('active');
      simNodes.tabConsoleBtn.classList.remove('active');
      simNodes.vcdPane.classList.add('active');
      simNodes.consolePane.classList.remove('active');
    }
  }

  function buildAbsoluteUrl(relativeOrAbs) {
    if (!relativeOrAbs) return '';
    if (relativeOrAbs.startsWith('http://') || relativeOrAbs.startsWith('https://')) {
      return relativeOrAbs;
    }
    return vcdBaseUrl.replace(/\/$/, '') + '/' + relativeOrAbs.replace(/^\//, '');
  }

  function enableVcdTab(vcdUrl, vcdFile) {
    sim.currentVcdUrl = buildAbsoluteUrl(vcdUrl);
    sim.currentVcdFile = vcdFile || 'wave.vcd';

    simNodes.tabVcdBtn.removeAttribute('disabled');
    simNodes.tabVcdBtn.classList.remove('disabled');
    simNodes.vcdBadge.textContent = 'Ondas OK';
    simNodes.vcdBadge.className = 'sva-vcd-badge available';
    simNodes.reloadVcdBtn.style.display = 'inline-block';

    function sendLoadCommand() {
      if (!simNodes.surferIframe || !simNodes.surferIframe.contentWindow || !sim.currentVcdUrl) return;
      try {
        simNodes.surferIframe.contentWindow.postMessage({
          command: 'LoadUrl',
          url: sim.currentVcdUrl
        }, '*');
      } catch (e) {
        console.error('Error cargando Surfer', e);
      }
    }

    if (simNodes.surferIframe.src === 'about:blank' || !simNodes.surferIframe.src.includes('/surfer/')) {
      simNodes.surferIframe.src = surferUrl;
      simNodes.surferIframe.onload = function () {
        setTimeout(sendLoadCommand, 800);
      };
    } else {
      sendLoadCommand();
      setTimeout(sendLoadCommand, 600);
    }

    switchTab('vcd');
    addLine('> VCD cargado en Surfer.', 'vcd');
  }

  function disableVcdTab() {
    simNodes.tabVcdBtn.setAttribute('disabled', 'true');
    simNodes.tabVcdBtn.classList.add('disabled');
    simNodes.vcdBadge.textContent = 'Sin VCD';
    simNodes.vcdBadge.className = 'sva-vcd-badge';
    simNodes.reloadVcdBtn.style.display = 'none';
    switchTab('console');
  }

  function getDesignValue() {
    return sim.designEditor ? sim.designEditor.getValue() : defaultDesign;
  }

  function getTbValue() {
    return sim.tbEditor ? sim.tbEditor.getValue() : defaultTb;
  }

  function connectWebSocket() {
    if (sim.ws && sim.ws.readyState === WebSocket.OPEN) return;

    sim.ws = new WebSocket(wsUrl);

    sim.ws.onopen = function () {
      updateStatus(true);
      setTranscript('> Conectado al backend de simulacion.', false);
      sim.ws.send(JSON.stringify({ accion: 'check_vcd' }));
    };

    sim.ws.onclose = function () {
      updateStatus(false);
      setTranscript('> Conexion WebSocket cerrada.', true);
    };

    sim.ws.onerror = function () {
      updateStatus(false);
      setTranscript('> Error de conexion WebSocket.', true);
    };

    sim.ws.onmessage = function (event) {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        addLine(event.data, 'ok');
        return;
      }

      if (payload.status === 'error_compilacion' || payload.tipo === 'linter_error') {
        setTranscript(payload.detalles || payload.transcript || 'Error de compilacion.', true);
        disableVcdTab();
        return;
      }

      if (payload.status === 'compilado_ok' || payload.status === 'simulacion_ok') {
        setTranscript(payload.transcript || 'Simulacion ejecutada correctamente.', false);
        if (payload.has_vcd && payload.vcd_url) enableVcdTab(payload.vcd_url, payload.vcd_file);
        else disableVcdTab();
        return;
      }

      if (payload.tipo === 'vcd_status') {
        if (payload.has_vcd && payload.vcd_url) enableVcdTab(payload.vcd_url, payload.vcd_file);
        else disableVcdTab();
        return;
      }

      if (payload.transcript) addLine(payload.transcript, 'ok');
      if (payload.has_vcd && payload.vcd_url) enableVcdTab(payload.vcd_url, payload.vcd_file);
    };
  }

  function runSimulation() {
    const tbCode = getTbValue().trim();
    const designCode = getDesignValue().trim();

    if (!tbCode && !designCode) {
      setTranscript('> Error: paneles vacios.', true);
      return;
    }

    if (!sim.ws || sim.ws.readyState !== WebSocket.OPEN) connectWebSocket();
    if (!sim.ws || sim.ws.readyState !== WebSocket.OPEN) {
      setTranscript('> Backend no disponible.', true);
      return;
    }

    setTranscript('> Iniciando simulacion con QuestaSim...', false);
    sim.ws.send(JSON.stringify({
      accion: 'compilar',
      simulador: 'questasim',
      codigo: designCode || tbCode,
      testbench: tbCode || designCode
    }));
  }

  function applyExampleToEditors(example, autoRun) {
    if (!example) return;

    if (!sim.editorsReady || !sim.designEditor || !sim.tbEditor) {
      sim.pendingExample = example;
      sim.exampleToRun = !!autoRun;
      return;
    }

    sim.designEditor.setValue(normalizeSvCode(example.design_sv, defaultDesign));
    sim.tbEditor.setValue(normalizeSvCode(example.tb_sv, defaultTb));
    setTranscript('> Ejemplo cargado: ' + (example.id || '-') + ' - ' + (example.title || ''), false);

    if (autoRun) {
      setTimeout(runSimulation, 120);
    }
  }

  function initMonacoEditors() {
    if (!simNodes.designContainer || !simNodes.tbContainer) return;

    function createEditors() {
      if (!sim.designEditor) {
        sim.designEditor = monaco.editor.create(simNodes.designContainer, {
          value: defaultDesign,
          language: 'verilog',
          theme: 'vs-dark',
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false
        });
      }

      if (!sim.tbEditor) {
        sim.tbEditor = monaco.editor.create(simNodes.tbContainer, {
          value: defaultTb,
          language: 'verilog',
          theme: 'vs-dark',
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false
        });
      }

      sim.editorsReady = true;

      if (sim.pendingExample) {
        const ex = sim.pendingExample;
        const run = sim.exampleToRun;
        sim.pendingExample = null;
        sim.exampleToRun = false;
        applyExampleToEditors(ex, run);
      }
    }

    if (window.monaco && window.monaco.editor) {
      createEditors();
      return;
    }

    const existingLoader = document.querySelector('script[data-sva-monaco="true"]');
    if (existingLoader) {
      existingLoader.addEventListener('load', function () {
        require(['vs/editor/editor.main'], createEditors);
      }, { once: true });
      return;
    }

    const loader = document.createElement('script');
    loader.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js';
    loader.setAttribute('data-sva-monaco', 'true');
    loader.onload = function () {
      require.config({
        paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs' }
      });
      require(['vs/editor/editor.main'], createEditors);
    };
    document.head.appendChild(loader);
  }

  function renderList() {
    if (!listEl) return;

    const groups = { basico: [], intermedio: [], avanzado: [], otros: [] };

    examples.forEach(function (ex) {
      if (groups[ex.difficulty]) groups[ex.difficulty].push(ex);
      else groups.otros.push(ex);
    });

    let html = '';
    ['basico', 'intermedio', 'avanzado', 'otros'].forEach(function (g) {
      if (!groups[g].length) return;
      html += '<div class="sva-group-label">' + groupLabel(g) + '</div>';
      groups[g].forEach(function (ex) {
        const active = ex.id === selectedId ? ' active' : '';
        html += '<button class="sva-example-btn' + active + '" data-id="' + escapeHtml(ex.id) + '">';
        html += '<span class="sva-example-id">' + escapeHtml(ex.id) + '</span>';
        html += '<span class="sva-example-title">' + escapeHtml(ex.title) + '</span>';
        html += '</button>';
      });
    });

    listEl.innerHTML = html;

    listEl.querySelectorAll('.sva-example-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        selectExample(id);
      });
    });
  }

  function renderDetail(example) {
    if (!detailEl || !example) return;

    const concepts = Array.isArray(example.concepts) ? example.concepts : [];

    detailEl.innerHTML = '' +
      '<h3>' + escapeHtml(example.id + ' - ' + example.title) + '</h3>' +
      '<div class="sva-meta"><strong>Dificultad:</strong> ' + escapeHtml(example.difficulty || 'n/a') + '</div>' +
      '<div><strong>Teoria breve:</strong> ' + escapeHtml(example.theory || '') + '</div>' +
      '<div style="margin-top:8px;"><strong>Conceptos:</strong><br>' +
      concepts.map(function (c) { return '<span class="sva-chip">' + escapeHtml(c) + '</span>'; }).join('') +
      '</div>' +
      '<div class="sva-practice-box">' +
      '<h4>Enunciado</h4>' +
      '<p>' + escapeHtml(example.exercise || '') + '</p>' +
      '<h4>Solucion de referencia</h4>' +
      '<p>' + escapeHtml(example.solution || '') + '</p>' +
      '</div>' +
      '<div class="sva-actions">' +
      '<button class="sva-btn primary" id="sva-load-btn">Cargar ejemplo en el simulador</button>' +
      '<button class="sva-btn success" id="sva-load-run-btn">Cargar y ejecutar</button>' +
      '<button class="sva-btn secondary" id="sva-copy-btn">Copiar JSON</button>' +
      '</div>';

    const loadBtn = detailEl.querySelector('#sva-load-btn');
    const loadRunBtn = detailEl.querySelector('#sva-load-run-btn');
    const copyBtn = detailEl.querySelector('#sva-copy-btn');

    if (loadBtn) {
      loadBtn.addEventListener('click', function () {
        applyExampleToEditors(example, false);
        const simPanel = root.querySelector('.sva-sim-plugin');
        if (simPanel) simPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    if (loadRunBtn) {
      loadRunBtn.addEventListener('click', function () {
        applyExampleToEditors(example, true);
        const simPanel = root.querySelector('.sva-sim-plugin');
        if (simPanel) simPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        const text = JSON.stringify(example, null, 2);
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.textContent = 'Copiado';
          setTimeout(function () { copyBtn.textContent = 'Copiar JSON'; }, 1500);
        }).catch(function () {
          copyBtn.textContent = 'No se pudo copiar';
          setTimeout(function () { copyBtn.textContent = 'Copiar JSON'; }, 1500);
        });
      });
    }
  }

  function selectExample(id) {
    selectedId = id;
    const ex = examples.find(function (item) { return item.id === id; });
    renderList();
    renderDetail(ex);
  }

  function wireSimulatorButtons() {
    if (simNodes.tabConsoleBtn) {
      simNodes.tabConsoleBtn.addEventListener('click', function () {
        switchTab('console');
      });
    }

    if (simNodes.tabVcdBtn) {
      simNodes.tabVcdBtn.addEventListener('click', function () {
        switchTab('vcd');
      });
    }

    if (simNodes.runBtn) {
      simNodes.runBtn.addEventListener('click', runSimulation);
    }

    if (simNodes.clearBtn) {
      simNodes.clearBtn.addEventListener('click', function () {
        setTranscript('> Consola limpia.', false);
        disableVcdTab();
        if (sim.designEditor) sim.designEditor.setValue(defaultDesign);
        if (sim.tbEditor) sim.tbEditor.setValue(defaultTb);
      });
    }

    if (simNodes.reloadVcdBtn) {
      simNodes.reloadVcdBtn.addEventListener('click', function () {
        if (sim.currentVcdUrl) enableVcdTab(sim.currentVcdUrl, sim.currentVcdFile);
      });
    }
  }

  function initExamples() {
    if (!examplesUrl) {
      listEl.innerHTML = '<div class="sva-error">No se encontro URL de ejemplos.</div>';
      return;
    }

    fetch(examplesUrl)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) throw new Error('Catalogo vacio');
        examples = data;
        selectedId = data[0].id;
        renderList();
        renderDetail(data[0]);
      })
      .catch(function (err) {
        listEl.innerHTML = '<div class="sva-error">No se pudieron cargar los ejemplos: ' + escapeHtml(err.message) + '</div>';
      });
  }

  initMonacoEditors();
  connectWebSocket();
  wireSimulatorButtons();
  initExamples();
});
