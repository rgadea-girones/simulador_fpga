document.addEventListener('DOMContentLoaded', function () {
  const root = document.getElementById('evaluacion-aserciones-root');
  if (!root) return;

  const cfg = (typeof EVALUACION_ASERCIONES_CONFIG !== 'undefined') ? EVALUACION_ASERCIONES_CONFIG : {};
  const reportEndpoint = cfg.report_endpoint || '';
  const wsUrl = cfg.ws_url || 'ws://localhost:8000/ws';
  const surferUrl = cfg.surfer_url || 'http://localhost:8000/surfer/index.html';
  const vcdBaseUrl = cfg.vcd_base_url || 'http://localhost:8000';
  const rawTaskBank = Array.isArray(cfg.task_bank) ? cfg.task_bank : [];
  const studentStorageKey = 'evaluacion_aserciones_student_v1';
  const assignmentStorageKey = 'evaluacion_aserciones_assignment_v1';

  const nodes = {
    studentName: root.querySelector('#eva-student-name'),
    studentEmail: root.querySelector('#eva-student-email'),
    studentGroup: root.querySelector('#eva-student-group'),
    studentSubject: root.querySelector('#eva-student-subject'),
    studentLabel: root.querySelector('#eva-student-label'),
    assignmentSummary: root.querySelector('#eva-assignment-summary'),
    taskList: root.querySelector('#eva-task-list'),
    transcript: root.querySelector('#eva-transcript'),
    score: root.querySelector('#eva-score'),
    feedback: root.querySelector('#eva-global-feedback'),
    refreshAssignment: root.querySelector('#eva-refresh-assignment'),
    generateTranscripts: root.querySelector('#eva-generate-transcripts'),
    submitBtn: root.querySelector('#eva-submit'),
    downloadBtn: root.querySelector('#eva-download-report'),
    copyBtn: root.querySelector('#eva-copy-report'),
    solutionPanel: root.querySelector('#eva-solution-panel')
  };

  const state = {
    student: loadStudentProfile(),
    assignmentNonce: 0,
    assignedCase: null,
    transcript: '',
    submitted: false,
    report: null,
    tbEditor: null,
    monacoReady: false,
    ws: null,
    wsReady: false,
    wsPending: null,
    wsPendingTimer: null,
    currentVcdUrl: '',
    currentVcdFile: ''
  };

  function makeClientId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'eva-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
  }

  function hashString(text) {
    let hash = 2166136261;
    const str = String(text || '');
    for (let index = 0; index < str.length; index += 1) {
      hash ^= str.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function loadStudentProfile() {
    const defaults = {
      name: '',
      email: '',
      group: '',
      subject: '',
      clientId: makeClientId()
    };

    try {
      const raw = localStorage.getItem(studentStorageKey);
      const stored = raw ? JSON.parse(raw) : {};
      const merged = Object.assign({}, defaults, (stored && typeof stored === 'object') ? stored : {});
      const wpUser = cfg.current_user || {};
      if (!merged.name && wpUser.display_name) merged.name = wpUser.display_name;
      if (!merged.email && wpUser.user_email) merged.email = wpUser.user_email;
      return merged;
    } catch (_) {
      const wpUser = cfg.current_user || {};
      if (wpUser.display_name) defaults.name = wpUser.display_name;
      if (wpUser.user_email) defaults.email = wpUser.user_email;
      return defaults;
    }
  }

  function saveStudentProfile(profile) {
    state.student = Object.assign({}, state.student, profile || {});
    try {
      localStorage.setItem(studentStorageKey, JSON.stringify(state.student));
    } catch (_) {
      // Ignorar errores de almacenamiento local.
    }
  }

  function syncStudentLabel() {
    const label = state.student.name || state.student.email || 'Sin identificar';
    if (nodes.studentLabel) nodes.studentLabel.textContent = label;
    return label;
  }

  function loadAssignmentNonce() {
    try {
      const raw = localStorage.getItem(assignmentStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return Number(parsed && parsed.nonce ? parsed.nonce : 0) || 0;
    } catch (_) {
      return 0;
    }
  }

  function saveAssignmentNonce(nonce) {
    state.assignmentNonce = nonce;
    try {
      localStorage.setItem(assignmentStorageKey, JSON.stringify({ nonce: nonce }));
    } catch (_) {
      // Ignorar errores de almacenamiento local.
    }
  }

  function getAssignmentSeed() {
    const label = state.student.name || state.student.email || state.student.clientId;
    return hashString(label + '|' + state.student.clientId + '|' + state.assignmentNonce);
  }

  function isCounterCorrect(truth, chosenCounter) {
    const value = String(truth || '').toLowerCase();
    if (value === 'both_ok') return true;
    if (value === 'both_bad') return false;
    if (value === 'a_bad_b_ok') return chosenCounter === 'B';
    if (value === 'a_ok_b_bad') return chosenCounter === 'A';
    return false;
  }

  function normalizeCounterModule(code) {
    if (!code) return '';
    return String(code).replace(/module\s+\w+\s*\(/, 'module counter_dut(');
  }

  function buildTbTemplate() {
    return [
      'module tb;',
      '  logic clk = 0;',
      '  logic enable = 0;',
      '  logic updown = 1;',
      '  logic reset_n = 0;',
      '  logic areset_n = 0;',
      '  logic terminal_count_en;',
      '  logic terminal_count_free;',
      '  logic [3:0] count;',
      '  logic [3:0] prev_count;',
      '',
      '  counter_dut dut (',
      '    .clk(clk),',
      '    .enable(enable),',
      '    .updown(updown),',
      '    .reset_n(reset_n),',
      '    .areset_n(areset_n),',
      '    .terminal_count_en(terminal_count_en),',
      '    .terminal_count_free(terminal_count_free),',
      '    .count(count)',
      '  );',
      '',
      '  always #5 clk = ~clk;',
      '',
      '  // TODO_EVA_ASSERTION: agrega o reemplaza aserciones para justificar tu decision.',
      '',
      '  initial begin',
      '    areset_n = 0; reset_n = 0; enable = 0; updown = 1;',
      '    repeat (2) @(posedge clk);',
      '    areset_n = 1; reset_n = 1;',
      '',
      '    // Fase 1: estimulo de conteo ascendente de 0 a 12.',
      '    enable = 1; updown = 1;',
      '    repeat (12) @(posedge clk);',
      '    #1;',
      '',
      '    // Fase 2: estimulo de conteo descendente de 12 a 0.',
      '    updown = 0; enable = 1;',
      '    repeat (12) @(posedge clk);',
      '    #1;',
      '',
      '    // Fase 3: estimulo con enable=0 (mantener valor).',
      '    prev_count = count;',
      '    enable = 0; updown = 1;',
      '    @(posedge clk);',
      '    #1;',
      '',
      '    // Fase 4: estimulo de reset sincronico activo bajo.',
      '    enable = 1; updown = 1; reset_n = 0;',
      '    @(posedge clk);',
      '    #1;',
      '    reset_n = 1;',
      '',
      '    // Fase 5: estimulo de reset asincronico activo bajo.',
      '    prev_count = count;',
      '    enable = 1; updown = 1;',
      '    @(posedge clk);',
      '    #1;',
      '    areset_n = 0;',
      '    #1;',
      '    areset_n = 1;',
      '    reset_n = 1;',
      '    repeat (4) @(posedge clk);',
      '    $finish;',
      '  end',
      'endmodule'
    ].join('\n');
  }

  function buildSingleCounterExplanation(taskExplanation, counterSlot, truthCorrect) {
    const decisionText = truthCorrect ? 'CORRECTO' : 'INCORRECTO';
    const base = String(taskExplanation || '').trim();
    const prefix = 'En esta evaluacion solo se analiza el contador asignado. La decision esperada para este contador es ' + decisionText + '.';
    return base ? (prefix + ' ' + base) : prefix;
  }

  function buildVariantPool() {
    const seedOrder = ['A', 'B', 'A', 'B', 'A'];
    return rawTaskBank.slice(0, 5).map(function (task, index) {
      const chosenCounter = seedOrder[index % seedOrder.length];
      const correct = isCounterCorrect(task.truth, chosenCounter);
      const rawCounter = chosenCounter === 'A' ? task.counter_a : task.counter_b;
      const counterCode = normalizeCounterModule(rawCounter);
      const transcriptLines = [];
      const lines = Array.isArray(task.transcript_lines) ? task.transcript_lines : [];
      lines.forEach(function (line) {
        if (line.includes('[stimulus]')) transcriptLines.push(line);
        if (chosenCounter === 'A' && line.includes('[A]')) transcriptLines.push(line);
        if (chosenCounter === 'B' && line.includes('[B]')) transcriptLines.push(line);
      });
      transcriptLines.push('[checker] Decision esperada para este contador: ' + (correct ? 'CORRECTO' : 'INCORRECTO'));

      return {
        id: 'assigned',
        title: task.title || ('Caso ' + String(index + 1)),
        summary: task.summary || 'Analiza si el contador cumple la especificacion.',
        truthCorrect: correct,
        counterSlot: chosenCounter,
        transcript_lines: transcriptLines,
        counter_code: counterCode,
        testbench_template: buildTbTemplate(),
        explanation: buildSingleCounterExplanation(task.explanation, chosenCounter, correct)
      };
    });
  }

  function pickAssignedCase(variants) {
    if (!variants.length) return null;
    const rng = mulberry32(getAssignmentSeed());
    const index = Math.floor(rng() * variants.length);
    return Object.assign({}, variants[index]);
  }

  function createTranscript(variant) {
    return Array.isArray(variant.transcript_lines) ? variant.transcript_lines.join('\n') : '';
  }

  function inferCorrectFromTranscript(text) {
    const src = String(text || '');
    const hasFailure = hasAssertionFailure(src);
    return !hasFailure;
  }

  function hasAssertionFailure(text) {
    const src = String(text || '');
    const lines = src.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      const lower = line.toLowerCase();
      if (!lower) continue;

      if (lower.includes('mismatch')) return true;
      if (lower.includes('$error')) return true;
      if (lower.includes('fatal')) return true;
      if (/assert(ion)?[^\n]*fail(ed)?/i.test(line)) return true;

      const looksLikeError = /^\*\*\s*error\b/i.test(line) || /\berror\s*:/i.test(line);
      const zeroErrorSummary = /\berrors?\s*:\s*0\b/i.test(line) || /\b0\s+errors?\b/i.test(line) || /\bno\s+errors?\b/i.test(line);
      if (looksLikeError && !zeroErrorSummary) return true;
    }

    return false;
  }

  function evidenceLooksValid(text) {
    const src = String(text || '').trim();
    if (!src) return false;
    if (/timeout|no se obtuvo respuesta/i.test(src)) return false;
    return true;
  }

  function hasAssertionAttempt(tbCode) {
    const src = String(tbCode || '');
    return /\bassert\b|\bcover\b|\$error|\bproperty\b/i.test(src);
  }

  function countCountRelatedAssertions(tbCode) {
    const src = String(tbCode || '');
    const blocks = src.split(/assert\s+property/ig);
    if (blocks.length <= 1) return 0;

    let count = 0;
    for (let index = 1; index < blocks.length; index += 1) {
      const block = blocks[index].slice(0, 500);
      if (/(^|[^a-z_])(count|terminal_count_en|terminal_count_free)([^a-z_]|$)/i.test(block)) {
        count += 1;
      }
    }
    return count;
  }

  function parseAssertionCoverage(text) {
    const src = String(text || '');
    const match = src.match(/=== ASSERT COVERAGE BEGIN ===([\s\S]*?)=== ASSERT COVERAGE END ===/i);
    const section = match ? match[1] : '';
    const lines = section.split(/\r?\n/).map(function (line) {
      return line.trim();
    }).filter(Boolean);

    let unevaluatedAssertions = 0;
    let coveredAssertions = 0;
    let unavailable = false;

    lines.forEach(function (line) {
      const lower = line.toLowerCase();
      if (lower.includes('assert_coverage_unavailable')) {
        unavailable = true;
      }
      if (/\b(inactive|disabled|never triggered|not evaluated)\b/i.test(line) || /\b0\s+(attempts|attempt)\b/i.test(line) || /\battempts?\s*[:=]\s*0\b/i.test(line)) {
        unevaluatedAssertions += 1;
      }
      if (/\b(pass|fail|attempt|covered|success)\b/i.test(line)) {
        coveredAssertions += 1;
      }
    });

    return {
      found: !!section,
      unavailable: unavailable,
      lines: lines,
      coveredAssertions: coveredAssertions,
      unevaluatedAssertions: unevaluatedAssertions
    };
  }

  function buildAbsoluteUrl(relativeOrAbs) {
    if (!relativeOrAbs) return '';
    if (/^https?:\/\//i.test(relativeOrAbs)) return relativeOrAbs;
    return vcdBaseUrl.replace(/\/$/, '') + '/' + String(relativeOrAbs).replace(/^\//, '');
  }

  function loadVcdInSurfer(iframeId, vcdUrl) {
    const iframe = document.getElementById(iframeId);
    if (!iframe || !vcdUrl) return;

    function sendLoad() {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.postMessage({
        command: 'LoadUrl',
        url: vcdUrl
      }, '*');
    }

    const iframeSrc = iframe.getAttribute('src') || '';
    if (!iframeSrc || iframeSrc === 'about:blank' || iframeSrc.indexOf('/surfer/') === -1) {
      iframe.setAttribute('src', surferUrl);
      iframe.onload = function () {
        setTimeout(sendLoad, 700);
      };
      return;
    }

    sendLoad();
    setTimeout(sendLoad, 500);
  }

  function clearWsPending() {
    if (state.wsPendingTimer) {
      clearTimeout(state.wsPendingTimer);
      state.wsPendingTimer = null;
    }
    state.wsPending = null;
  }

  function finishWsPendingWithError(message) {
    if (!state.wsPending) return;
    const pending = state.wsPending;
    clearWsPending();
    pending.reject(new Error(message || 'Fallo de comunicacion con el backend de simulacion.'));
  }

  function connectSimulationSocket() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN && state.wsReady) {
      return Promise.resolve(state.ws);
    }

    if (state.ws && state.ws.readyState === WebSocket.CONNECTING) {
      return new Promise(function (resolve, reject) {
        const start = Date.now();
        const timer = setInterval(function () {
          if (state.ws && state.ws.readyState === WebSocket.OPEN && state.wsReady) {
            clearInterval(timer);
            resolve(state.ws);
            return;
          }
          if (!state.ws || state.ws.readyState === WebSocket.CLOSED || Date.now() - start > 8000) {
            clearInterval(timer);
            reject(new Error('No se pudo abrir el WebSocket del simulador.'));
          }
        }, 100);
      });
    }

    return new Promise(function (resolve, reject) {
      try {
        const ws = new WebSocket(wsUrl);
        state.ws = ws;
        state.wsReady = false;

        ws.onopen = function () {
          state.wsReady = true;
          resolve(ws);
        };

        ws.onmessage = function (event) {
          let payload = null;
          try {
            payload = JSON.parse(event.data);
          } catch (_) {
            payload = { transcript: String(event.data || '') };
          }

          if (!state.wsPending) return;

          if (payload.status === 'error_compilacion') {
            const details = payload.detalles || payload.transcript || 'Error de compilacion/simulacion.';
            const pending = state.wsPending;
            clearWsPending();
            pending.reject(new Error(details));
            return;
          }

          if (payload.status === 'simulacion_ok' || payload.status === 'compilado_ok') {
            const transcript = String(payload.transcript || '').trim();
            const vcdUrl = payload.has_vcd && payload.vcd_url ? buildAbsoluteUrl(payload.vcd_url) : '';
            const pending = state.wsPending;
            clearWsPending();
            pending.resolve({
              transcript: transcript,
              hasVcd: !!(payload.has_vcd && vcdUrl),
              vcdUrl: vcdUrl,
              vcdFile: payload.vcd_file || ''
            });
            return;
          }
        };

        ws.onerror = function () {
          state.wsReady = false;
          finishWsPendingWithError('Error de conexion con el backend de simulacion.');
        };

        ws.onclose = function () {
          state.wsReady = false;
          finishWsPendingWithError('Conexion WebSocket cerrada.');
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  function requestRealTranscript(variant) {
    if (!variant) return Promise.reject(new Error('No hay caso asignado.'));
    if (state.wsPending) return Promise.reject(new Error('Ya hay una simulacion en curso.'));

    const designCode = (variant.counter_code || '').trim();
    const testbenchCode = (getTbValue() || variant.testbench_template || '').trim();

    if (!designCode) {
      return Promise.reject(new Error('No hay codigo de diseno para simular.'));
    }
    if (!testbenchCode) {
      return Promise.reject(new Error('El testbench esta vacio.'));
    }

    return connectSimulationSocket().then(function (ws) {
      return new Promise(function (resolve, reject) {
        state.wsPending = { resolve: resolve, reject: reject };
        state.wsPendingTimer = setTimeout(function () {
          finishWsPendingWithError('Timeout: el backend no devolvio transcript a tiempo.');
        }, 45000);

        ws.send(JSON.stringify({
          accion: 'compilar',
          simulador: 'questasim',
          assert_coverage: true,
          codigo: designCode,
          testbench: testbenchCode
        }));
      });
    });
  }

  function updateTranscriptViews() {
    if (state.assignedCase) {
      const pre = root.querySelector('[data-transcript-for="assigned"]');
      if (pre) pre.textContent = state.transcript || 'Transcript pendiente.';
    }
    renderTranscriptPanel();
  }

  async function generateTranscriptForAssignedCase() {
    if (!state.assignedCase) {
      renderFeedback('No hay caso asignado.', true);
      return false;
    }

    renderFeedback('Ejecutando simulacion real en backend...', false);
    try {
      state.assignedCase.testbench = getTbValue();
      const simulationResult = await requestRealTranscript(state.assignedCase);
      state.transcript = simulationResult && simulationResult.transcript ? simulationResult.transcript : '';
      state.currentVcdUrl = simulationResult && simulationResult.vcdUrl ? simulationResult.vcdUrl : '';
      state.currentVcdFile = simulationResult && simulationResult.vcdFile ? simulationResult.vcdFile : '';
      updateTranscriptViews();
      renderFeedback(state.currentVcdUrl ? 'Transcript y VCD generados desde el backend real.' : 'Transcript generado desde el backend real (sin VCD detectado).', false);
      return true;
    } catch (error) {
      renderFeedback('Fallo al generar transcript real: ' + error.message, true);
      return false;
    }
  }

  function renderStudentFields() {
    if (nodes.studentName) nodes.studentName.value = state.student.name || '';
    if (nodes.studentEmail) nodes.studentEmail.value = state.student.email || '';
    if (nodes.studentGroup) nodes.studentGroup.value = state.student.group || '';
    if (nodes.studentSubject) nodes.studentSubject.value = state.student.subject || '';
    syncStudentLabel();
  }

  function buildAssignmentSummary() {
    if (!nodes.assignmentSummary) return;
    if (!state.assignedCase) {
      nodes.assignmentSummary.textContent = 'Aun no hay caso asignado.';
      return;
    }
    nodes.assignmentSummary.textContent = 'Caso asignado correctamente (1 de 5 variantes).';
  }

  function renderTranscriptPanel() {
    if (!nodes.transcript) return;
    if (!state.assignedCase) {
      nodes.transcript.textContent = 'Esperando asignacion...';
      return;
    }
    const header = '=== Caso de evaluacion asignado ===';
    nodes.transcript.textContent = header + '\n' + (state.transcript || 'Transcript pendiente.');
  }

  function renderSolutionPanel() {
    if (!nodes.solutionPanel) return;
    if (!state.submitted || !state.report || !state.assignedCase) {
      nodes.solutionPanel.classList.add('hidden');
      nodes.solutionPanel.innerHTML = '';
      return;
    }

    const score = (state.report && typeof state.report.score === 'number') ? state.report.score : 0;
    const detail = (state.report && state.report.detail) ? state.report.detail : {};
    const reason = detail.finalReason || 'Sin motivo disponible.';

    nodes.solutionPanel.innerHTML = '' +
      '<div class="eva-card-title">Resumen del envio</div>' +
      '<div class="eva-solution-block">' +
      '<p><strong>Calificacion:</strong> ' + String(score) + '/10</p>' +
      '<p><strong>Motivo:</strong> ' + escapeHtml(reason) + '</p>' +
      '<p><strong>Contador verificado:</strong> contador asignado en este intento.</p>' +
      '<pre>' + escapeHtml(state.assignedCase.counter_code || '') + '</pre>' +
      '<div class="eva-mini-title">Cronograma (VCD)</div>' +
      (state.currentVcdUrl
        ? '<div class="eva-surfer-wrap"><iframe id="eva-surfer-iframe" src="about:blank" title="Cronograma VCD"></iframe></div>' +
          '<p class="eva-surfer-note">VCD: ' + escapeHtml(state.currentVcdFile || 'wave.vcd') + '</p>'
        : '<p class="eva-surfer-note">No se detecto VCD en este envio. Revisa que la simulacion haya terminado correctamente.</p>') +
      '</div>';
    nodes.solutionPanel.classList.remove('hidden');

    if (state.currentVcdUrl) {
      loadVcdInSurfer('eva-surfer-iframe', state.currentVcdUrl);
    }
  }

  function renderScore(score, total) {
    if (!nodes.score) return;
    nodes.score.textContent = 'Puntuacion: ' + String(score) + '/' + String(total);
  }

  function renderFeedback(message, isError) {
    if (!nodes.feedback) return;
    nodes.feedback.textContent = message;
    nodes.feedback.className = 'eva-feedback ' + (isError ? 'error' : 'ok');
  }

  function getStudentDecision() {
    const node = root.querySelector('#eva-counter-correct');
    return !!(node && node.checked);
  }

  function getTbValue() {
    if (state.tbEditor) return state.tbEditor.getValue();
    const fallback = root.querySelector('#eva-testbench-fallback');
    return fallback ? fallback.value : '';
  }

  function ensureMonaco(text) {
    const editorNode = root.querySelector('#eva-monaco-tb');
    if (!editorNode) return;

    function createEditor() {
      if (!window.monaco || !window.monaco.editor) return;
      if (state.tbEditor) {
        state.tbEditor.setValue(text || '');
        return;
      }
      state.tbEditor = window.monaco.editor.create(editorNode, {
        value: text || '',
        language: 'verilog',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false
      });
      state.monacoReady = true;
    }

    if (window.monaco && window.monaco.editor) {
      createEditor();
      return;
    }

    const existingLoader = document.querySelector('script[data-eva-monaco="true"]');
    if (existingLoader) {
      existingLoader.addEventListener('load', function () {
        require(['vs/editor/editor.main'], createEditor);
      }, { once: true });
      return;
    }

    const loader = document.createElement('script');
    loader.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js';
    loader.setAttribute('data-eva-monaco', 'true');
    loader.onload = function () {
      require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs' } });
      require(['vs/editor/editor.main'], createEditor);
    };
    document.head.appendChild(loader);
  }

  function renderAssignedCase() {
    if (!nodes.taskList) return;

    if (!state.assignedCase) {
      nodes.taskList.innerHTML = '<div class="eva-task-card"><p>No hay caso asignado.</p></div>';
      return;
    }

    const variant = state.assignedCase;
    const transcript = state.transcript || 'Pendiente de generacion.';
    const checked = variant.selectedCorrect ? 'checked' : '';

    nodes.taskList.innerHTML = '' +
      '<div class="eva-task-card" data-case-id="asignado">' +
      '<div class="eva-task-head">' +
      '<div>' +
      '<div class="eva-task-kicker">Caso asignado</div>' +
      '<h3>Analisis de contador asignado</h3>' +
      '</div>' +
      '<span class="eva-pill">1 caso por alumno</span>' +
      '</div>' +
      '<p class="eva-task-summary">Marca si el contador es correcto. Si no marcas la casilla, estas indicando que es incorrecto.</p>' +
      '<div class="eva-answer-box" style="margin-top:12px;">' +
      '<label><input id="eva-counter-correct" type="checkbox" ' + checked + '> El contador asignado es correcto</label>' +
      '</div>' +
      '<div class="eva-sim-box" style="margin-top:12px;">' +
      '<div class="eva-mini-title">Contador asignado</div>' +
      '<pre class="eva-transcript-task">Se mostrara unicamente despues del envio.</pre>' +
      '<div class="eva-mini-title">Simulador (testbench editable)</div>' +
      '<div class="eva-monaco-wrap"><div id="eva-monaco-tb" class="eva-monaco-editor"></div></div>' +
      '<textarea id="eva-testbench-fallback" class="eva-testbench-fallback" style="display:none;">' + escapeHtml(variant.testbench_template || '') + '</textarea>' +
      '<div class="eva-mini-title">Transcript</div>' +
        '<pre class="eva-transcript-task" data-transcript-for="assigned">' + escapeHtml(transcript) + '</pre>' +
      '<button type="button" class="eva-btn secondary" id="eva-generate-case-transcript">Generar transcript</button>' +
      '</div>' +
      '<div class="eva-task-feedback" id="eva-task-feedback"></div>' +
      '</div>';

    ensureMonaco(variant.testbench_template || '');

    const transcriptBtn = root.querySelector('#eva-generate-case-transcript');
    if (transcriptBtn) {
      transcriptBtn.addEventListener('click', async function () {
        transcriptBtn.disabled = true;
        await generateTranscriptForAssignedCase();
        transcriptBtn.disabled = false;
      });
    }
  }

  function assignCase(forceNewNonce) {
    if (forceNewNonce) {
      saveAssignmentNonce(state.assignmentNonce + 1);
    } else if (typeof state.assignmentNonce !== 'number') {
      state.assignmentNonce = loadAssignmentNonce();
    }

    const variants = buildVariantPool();
    state.assignedCase = pickAssignedCase(variants);
    state.transcript = '';
    state.submitted = false;
    state.report = null;
    state.currentVcdUrl = '';
    state.currentVcdFile = '';

    buildAssignmentSummary();
    renderAssignedCase();
    renderTranscriptPanel();
    renderSolutionPanel();
    renderScore(0, 10);
    renderFeedback('Caso asignado. Escribe tu asercion en el testbench y genera transcript.', false);
  }

  async function evaluateCase() {
    if (!state.assignedCase) {
      renderFeedback('No hay caso asignado.', true);
      return;
    }

    state.assignedCase.selectedCorrect = getStudentDecision();
    state.assignedCase.testbench = getTbValue();
    if (!state.transcript) {
      renderFeedback('Genera primero el transcript real antes de enviar.', true);
      return;
    }

    const inferredCorrect = inferCorrectFromTranscript(state.transcript);
    const evidenceOk = evidenceLooksValid(state.transcript);
    const decisionMatchesTruth = state.assignedCase.selectedCorrect === state.assignedCase.truthCorrect;
    const assertionFailureDetected = hasAssertionFailure(state.transcript);
    const expectedAssertionFailure = !state.assignedCase.truthCorrect;
    const assertionEvidenceMatches = expectedAssertionFailure ? assertionFailureDetected : !assertionFailureDetected;
    const assertionAttemptDetected = hasAssertionAttempt(state.assignedCase.testbench);
    const countRelatedAssertions = countCountRelatedAssertions(state.assignedCase.testbench);
    const coverage = parseAssertionCoverage(state.transcript);
    const countAssertionsMissedFault = expectedAssertionFailure && countRelatedAssertions > 0 && !assertionFailureDetected;
    const hasUnevaluatedAssertions = coverage.found && !coverage.unavailable && coverage.unevaluatedAssertions > 0;
    const verdictHalfOk = decisionMatchesTruth && evidenceOk && assertionEvidenceMatches;
    const assertionHalfOk = assertionAttemptDetected && assertionEvidenceMatches && !countAssertionsMissedFault && !hasUnevaluatedAssertions;
    const verdictScore = verdictHalfOk ? 5 : 0;
    const assertionScore = !assertionAttemptDetected ? 0 : (assertionHalfOk ? 5 : 2.5);
    const score = verdictScore + assertionScore;
    const fullOk = score === 10;

    const taskFeedback = root.querySelector('#eva-task-feedback');
    if (taskFeedback) {
      let feedbackText = '';
      let feedbackClass = 'error';

      if (fullOk) {
        feedbackText = 'Intento valido: veredicto y aserciones coherentes con la simulacion.';
        feedbackClass = 'ok';
      } else if (!evidenceOk) {
        feedbackText = 'No se pudo validar evidencia suficiente en el transcript para calificar este intento.';
      } else if (hasUnevaluatedAssertions) {
        feedbackText = 'Calificacion parcial: hay aserciones que no llegaron a evaluarse segun el reporte de cobertura de Questa.';
      } else if (countAssertionsMissedFault) {
        feedbackText = 'Calificacion parcial: hay aserciones sobre las salidas del contador que no detectaron el fallo esperado.';
      } else {
        feedbackText = 'Calificacion parcial: revisa si el veredicto coincide con el transcript y si las aserciones se activaron correctamente.';
      }

      taskFeedback.textContent = feedbackText;
      taskFeedback.className = 'eva-task-feedback ' + feedbackClass;
    }

    state.submitted = true;
    state.report = {
      source: 'evaluacion_aserciones',
      generatedAt: new Date().toISOString(),
      student: Object.assign({}, state.student, {
        label: state.student.name || state.student.email || 'Sin identificar'
      }),
      assignment: {
        nonce: state.assignmentNonce,
        caseId: 'assigned'
      },
      score: score,
      detail: {
        selectedCorrect: state.assignedCase.selectedCorrect,
        decisionMatchesTruth: decisionMatchesTruth,
        verdictScore: verdictScore,
        assertionFailureDetected: assertionFailureDetected,
        expectedAssertionFailure: expectedAssertionFailure,
        assertionEvidenceMatches: assertionEvidenceMatches,
        assertionAttemptDetected: assertionAttemptDetected,
        countRelatedAssertions: countRelatedAssertions,
        countAssertionsMissedFault: countAssertionsMissedFault,
        coverageFound: coverage.found,
        coverageUnavailable: coverage.unavailable,
        coveredAssertions: coverage.coveredAssertions,
        unevaluatedAssertions: coverage.unevaluatedAssertions,
        hasUnevaluatedAssertions: hasUnevaluatedAssertions,
        assertionScore: assertionScore,
        inferredCorrectFromTranscript: inferredCorrect,
        expectedCorrect: state.assignedCase.truthCorrect,
        finalReason: taskFeedback ? taskFeedback.textContent : '',
        evidenceOk: evidenceOk,
        transcript: state.transcript,
        testbench: state.assignedCase.testbench || ''
      }
    };

    renderScore(score, 10);
    renderFeedback(fullOk ? 'Evaluacion completada: 10/10.' : 'Evaluacion completada: 0/10.', false);
    renderTranscriptPanel();
    renderSolutionPanel();

    if (reportEndpoint) {
      fetch(reportEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.report)
      }).then(function (resp) {
        return resp.json().then(function (data) {
          if (!resp.ok || !data || !data.ok) {
            throw new Error((data && data.message) ? data.message : ('HTTP ' + resp.status));
          }
          renderFeedback((fullOk ? 'Evaluacion completada: 10/10. ' : 'Evaluacion completada: 0/10. ') + 'Reporte guardado #' + data.report_id + '.', false);
        });
      }).catch(function (error) {
        renderFeedback('No se pudo guardar el reporte: ' + error.message, true);
      });
    }
  }

  function downloadJson(filename, dataObj) {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function copyJson(dataObj) {
    return navigator.clipboard.writeText(JSON.stringify(dataObj, null, 2));
  }

  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function bindStudentInputs() {
    [nodes.studentName, nodes.studentEmail, nodes.studentGroup, nodes.studentSubject].forEach(function (input) {
      if (!input) return;
      input.addEventListener('input', function () {
        saveStudentProfile({
          name: nodes.studentName ? nodes.studentName.value.trim() : '',
          email: nodes.studentEmail ? nodes.studentEmail.value.trim() : '',
          group: nodes.studentGroup ? nodes.studentGroup.value.trim() : '',
          subject: nodes.studentSubject ? nodes.studentSubject.value.trim() : ''
        });
        syncStudentLabel();
      });
    });
  }

  function bindButtons() {
    if (nodes.refreshAssignment) {
      nodes.refreshAssignment.addEventListener('click', function () {
        assignCase(true);
      });
    }

    if (nodes.generateTranscripts) {
      nodes.generateTranscripts.addEventListener('click', async function () {
        nodes.generateTranscripts.disabled = true;
        await generateTranscriptForAssignedCase();
        nodes.generateTranscripts.disabled = false;
      });
    }

    if (nodes.submitBtn) {
      nodes.submitBtn.addEventListener('click', async function () {
        nodes.submitBtn.disabled = true;
        await evaluateCase();
        nodes.submitBtn.disabled = false;
      });
    }

    if (nodes.downloadBtn) {
      nodes.downloadBtn.addEventListener('click', function () {
        if (!state.report) evaluateCase();
        downloadJson('reporte_evaluacion_aserciones.json', state.report || {});
      });
    }

    if (nodes.copyBtn) {
      nodes.copyBtn.addEventListener('click', function () {
        if (!state.report) evaluateCase();
        copyJson(state.report || {}).then(function () {
          renderFeedback('Reporte copiado al portapapeles.', false);
        }).catch(function () {
          renderFeedback('No se pudo copiar el reporte.', true);
        });
      });
    }
  }

  function init() {
    renderStudentFields();
    bindStudentInputs();
    bindButtons();
    state.assignmentNonce = loadAssignmentNonce();
    assignCase(false);
  }

  init();
});
