document.addEventListener('DOMContentLoaded', function () {
  const root = document.getElementById('evaluacion-rcsg-cg-root');
  if (!root) return;

  const cfg = (typeof EVALUACION_RCSG_CG_CONFIG !== 'undefined') ? EVALUACION_RCSG_CG_CONFIG : {};
  const reportEndpoint = cfg.report_endpoint || '';
  const wsUrl = cfg.ws_url || 'ws://localhost:8000/ws';
  const rawTaskBank = Array.isArray(cfg.task_bank) ? cfg.task_bank : [];
  const templateCode = cfg.template_code || '';
  const studentStorageKey = 'evaluacion_rcsg_cg_student_v1';

  const nodes = {
    studentName: root.querySelector('#eva-student-name'),
    studentEmail: root.querySelector('#eva-student-email'),
    studentGroup: root.querySelector('#eva-student-group'),
    studentSubject: root.querySelector('#eva-student-subject'),
    studentLabel: root.querySelector('#eva-student-label'),
    assignmentSummary: root.querySelector('#eva-assignment-summary'),
    taskList: root.querySelector('#eva-task-list'),
    transcriptClassic: root.querySelector('#eva-transcript-classic'),
    transcriptStudent: root.querySelector('#eva-transcript-student'),
    score: root.querySelector('#eva-score'),
    feedback: root.querySelector('#eva-global-feedback'),
    generateTranscripts: root.querySelector('#eva-generate-transcripts'),
    submitBtn: root.querySelector('#eva-submit'),
    downloadBtn: root.querySelector('#eva-download-report'),
    copyBtn: root.querySelector('#eva-copy-report'),
    solutionPanel: root.querySelector('#eva-solution-panel')
  };

  const state = {
    student: loadStudentProfile(),
    assignedCase: null,
    classicTranscript: '',
    studentTranscript: '',
    classicCoverage: 0,
    studentCoverage: 0,
    submitted: false,
    report: null,
    tbEditor: null,
    monacoReady: false,
    ws: null,
    wsReady: false,
    wsPending: null,
    wsPendingTimer: null
  };

  function makeClientId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'eva-rcsg-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
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
    } catch (_) {}
  }

  function syncStudentLabel() {
    const label = state.student.name || state.student.email || 'Sin identificar';
    if (nodes.studentLabel) nodes.studentLabel.textContent = label;
    return label;
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
            const pending = state.wsPending;
            clearWsPending();
            pending.resolve({ transcript: transcript });
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

  function requestSimulation(defineMacro) {
    if (!state.assignedCase) return Promise.reject(new Error('No hay caso asignado.'));

    const designCode = (state.assignedCase.counter_code || '').trim();
    const testbenchCode = getTbValue().trim();

    if (!designCode) return Promise.reject(new Error('No hay codigo de diseno.'));
    if (!testbenchCode) return Promise.reject(new Error('El testbench esta vacio.'));

    let finalTestbenchCode = testbenchCode;
    if (defineMacro) {
      finalTestbenchCode = '`define ' + defineMacro + '\n' + testbenchCode;
    }

    return connectSimulationSocket().then(function (ws) {
      return new Promise(function (resolve, reject) {
        state.wsPending = { resolve: resolve, reject: reject };
        state.wsPendingTimer = setTimeout(function () {
          finishWsPendingWithError('Timeout: el backend de simulacion no devolvio respuesta a tiempo.');
        }, 45000);

        const req = {
          accion: 'compilar',
          simulador: 'questasim',
          assert_coverage: true,
          codigo: designCode,
          testbench: finalTestbenchCode
        };

        ws.send(JSON.stringify(req));
      });
    });
  }

  function extractCoverageMetrics(text) {
    const src = String(text || '');

    // 1. Cobertura Funcional (-cvg / Covergroup)
    let cvg = 0;
    const mCvg = src.match(/Cobertura\s+funcional\s+total\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
                 src.match(/Total\s+Covergroup\s+Coverage\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
                 src.match(/Covergroup\s+Coverage\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
    if (mCvg) cvg = parseFloat(mCvg[1]);

    // 2. Cobertura de Aserciones (-assert / Assertions)
    let assertCov = 0;
    const mAssert = src.match(/Assertion\s+Coverage\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
                    src.match(/Total\s+Assertion\s+Coverage\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
                    src.match(/Assertions\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
    if (mAssert) {
      assertCov = parseFloat(mAssert[1]);
    } else {
      if (/assert(ion)?[^\n]*fail(ed)?/i.test(src) || /mismatch/i.test(src)) {
        assertCov = 50.0;
      } else if (/FIN VALIDACION|TEST PASSED|=== ASSERT COVERAGE BEGIN ===/i.test(src)) {
        assertCov = 100.0;
      }
    }

    // 3. Cobertura por Instancia / Total (Instance Coverage)
    let instanceCov = 0;
    const mInst = src.match(/Instance\s+Coverage\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
                  src.match(/Total\s+Coverage\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
                  src.match(/Weighted\s+Coverage\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
    if (mInst) {
      instanceCov = parseFloat(mInst[1]);
    } else {
      instanceCov = cvg > 0 ? parseFloat(((cvg + assertCov) / 2).toFixed(2)) : assertCov;
    }

    return {
      cvg: cvg,
      assert: assertCov,
      instance: instanceCov
    };
  }

  function extractCoveragePercentage(text) {
    return extractCoverageMetrics(text).cvg;
  }

  function checkRcsgSyntax(tbCode) {
    const src = String(tbCode || '');
    const hasClass = /\bclass\s+\w+/i.test(src);
    const hasRand = /\brand\b|\brandc\b/i.test(src);
    const hasRandomize = /\.randomize\s*\(/i.test(src);
    return {
      hasClass: hasClass,
      hasRand: hasRand,
      hasRandomize: hasRandomize,
      validStructure: hasClass && hasRand && hasRandomize
    };
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

  async function generateDualTranscripts() {
    if (!state.assignedCase) {
      renderFeedback('No hay caso asignado.', true);
      return false;
    }

    renderFeedback('Simulando Test Clasico (Sin CG_ENABLE) y Test Alumno RCSG (Con CG_ENABLE)...', false);

    try {
      // 1. Simulación Clásica (Sin CG_ENABLE)
      if (nodes.transcriptClassic) nodes.transcriptClassic.textContent = 'Simulando Test Clasico (Sin `CG_ENABLE`)...';
      const resClassic = await requestSimulation('');
      state.classicTranscript = resClassic ? resClassic.transcript : '';
      state.classicMetrics = extractCoverageMetrics(state.classicTranscript);
      state.classicCoverage = state.classicMetrics.cvg;
      if (nodes.transcriptClassic) nodes.transcriptClassic.textContent = state.classicTranscript || 'Sin salida.';

      // 2. Simulación Alumno RCSG (Con CG_ENABLE)
      if (nodes.transcriptStudent) nodes.transcriptStudent.textContent = 'Simulando Test Alumno (Con `+define+CG_ENABLE`)...';
      const resStudent = await requestSimulation('CG_ENABLE');
      state.studentTranscript = resStudent ? resStudent.transcript : '';
      state.studentMetrics = extractCoverageMetrics(state.studentTranscript);
      state.studentCoverage = state.studentMetrics.cvg;
      if (nodes.transcriptStudent) nodes.transcriptStudent.textContent = state.studentTranscript || 'Sin salida.';

      renderFeedback('Simulacion dual completada.\n' +
                     '• Cobertura Funcional (-cvg): Alumno ' + state.studentMetrics.cvg.toFixed(2) + '% vs Clasico ' + state.classicMetrics.cvg.toFixed(2) + '%\n' +
                     '• Cobertura Aserciones (-assert): Alumno ' + state.studentMetrics.assert.toFixed(2) + '% vs Clasico ' + state.classicMetrics.assert.toFixed(2) + '%\n' +
                     '• Cobertura Instancia (Total): Alumno ' + state.studentMetrics.instance.toFixed(2) + '% vs Clasico ' + state.classicMetrics.instance.toFixed(2) + '%', false);
      return true;
    } catch (error) {
      renderFeedback('Fallo durante la simulacion dual: ' + error.message, true);
      if (nodes.transcriptStudent) nodes.transcriptStudent.textContent = 'Error de compilacion o ejecucion:\n' + error.message;
      return false;
    }
  }

  function evaluateCase() {
    if (!state.classicTranscript || !state.studentTranscript) {
      renderFeedback('Genera primero la comparativa de transcripts antes de evaluar.', true);
      return;
    }

    const tbCode = getTbValue();
    const syntax = checkRcsgSyntax(tbCode);

    let score = 0;
    let feedbackText = '';
    let feedbackClass = 'error';

    const studCvg = (state.studentMetrics && typeof state.studentMetrics.cvg === 'number') ? state.studentMetrics.cvg : state.studentCoverage;
    const clasCvg = (state.classicMetrics && typeof state.classicMetrics.cvg === 'number') ? state.classicMetrics.cvg : state.classicCoverage;

    if (!syntax.hasClass) {
      feedbackText = 'Falta definir la clase con variables randomizables bajo `ifdef CG_ENABLE.';
      score = 2;
    } else if (!syntax.hasRand || !syntax.hasRandomize) {
      feedbackText = 'Falta declarar variables `rand` o invocar `.randomize()` en el bloque de estimulo.';
      score = 4;
    } else if (studCvg <= 0) {
      feedbackText = 'El testbench compila pero no generó cobertura funcional evaluable.';
      score = 5;
    } else if (studCvg < clasCvg) {
      feedbackText = 'La cobertura funcional alcanzada por tu clase RCSG (' + studCvg.toFixed(2) + '%) es menor que la del test clasico (' + clasCvg.toFixed(2) + '%). Ajusta tus restricciones o la secuencia de prueba.';
      score = 7;
    } else {
      feedbackText = '¡Excelente! Tu clase RCSG alcanzó una cobertura funcional (-cvg) de ' + studCvg.toFixed(2) + '%, superando el test clasico (' + clasCvg.toFixed(2) + '%).';
      feedbackClass = 'ok';
      score = 10;
    }

    state.submitted = true;
    state.report = {
      source: 'evaluacion_rcsg_cg',
      generatedAt: new Date().toISOString(),
      student: Object.assign({}, state.student, {
        label: state.student.name || state.student.email || 'Sin identificar'
      }),
      score: score,
      detail: {
        classicCoverage: clasCvg,
        studentCoverage: studCvg,
        classicCvg: state.classicMetrics ? state.classicMetrics.cvg : clasCvg,
        classicAssert: state.classicMetrics ? state.classicMetrics.assert : 0,
        classicInstance: state.classicMetrics ? state.classicMetrics.instance : 0,
        studentCvg: state.studentMetrics ? state.studentMetrics.cvg : studCvg,
        studentAssert: state.studentMetrics ? state.studentMetrics.assert : 0,
        studentInstance: state.studentMetrics ? state.studentMetrics.instance : 0,
        hasClass: syntax.hasClass,
        hasRand: syntax.hasRand,
        hasRandomize: syntax.hasRandomize,
        finalReason: feedbackText,
        classicTranscript: state.classicTranscript,
        studentTranscript: state.studentTranscript,
        testbench: tbCode
      }
    };

    renderScore(score, 10);
    renderFeedback('Evaluacion completada: ' + score + '/10. ' + feedbackText, score >= 5 ? false : true);
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
          renderFeedback('Evaluacion completada: ' + score + '/10. Reporte guardado #' + data.report_id + '.', false);
        });
      }).catch(function (error) {
        renderFeedback('No se pudo guardar el reporte en la base de datos: ' + error.message, true);
      });
    }
  }

  function renderSolutionPanel() {
    if (!nodes.solutionPanel) return;
    if (!state.submitted || !state.report) {
      nodes.solutionPanel.classList.add('hidden');
      nodes.solutionPanel.innerHTML = '';
      return;
    }

    const score = state.report.score || 0;
    const detail = state.report.detail || {};

    nodes.solutionPanel.innerHTML = '' +
      '<div class="eva-card-title">Resumen del envio RCSG-CG</div>' +
      '<div class="eva-solution-block">' +
      '<p><strong>Calificacion:</strong> ' + String(score) + '/10</p>' +
      '<p><strong>Cobertura Clasica:</strong> ' + detail.classicCoverage.toFixed(2) + '%</p>' +
      '<p><strong>Cobertura Alumno RCSG:</strong> ' + detail.studentCoverage.toFixed(2) + '%</p>' +
      '<p><strong>Motivo:</strong> ' + escapeHtml(detail.finalReason || '') + '</p>' +
      '</div>';
    nodes.solutionPanel.classList.remove('hidden');
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

  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderAssignedCase() {
    if (!nodes.taskList) return;

    if (!rawTaskBank.length) {
      nodes.taskList.innerHTML = '<div class="eva-task-card"><p>No hay bateria de tareas configurada.</p></div>';
      return;
    }

    const task = rawTaskBank[0];
    state.assignedCase = task;

    nodes.taskList.innerHTML = '' +
      '<div class="eva-task-card">' +
      '<div class="eva-task-head">' +
      '<div>' +
      '<div class="eva-task-kicker">Tarea RCSG + Covergroup</div>' +
      '<h3>' + escapeHtml(task.title) + '</h3>' +
      '</div>' +
      '<span class="eva-pill">RCSG / Verification</span>' +
      '</div>' +
      '<p class="eva-task-summary">' + escapeHtml(task.summary) + '</p>' +
      '<div class="eva-sim-box" style="margin-top:12px;">' +
      '<div class="eva-mini-title">Editor SystemVerilog (Testbench Editable con `ifdef CG_ENABLE)</div>' +
      '<div class="eva-monaco-wrap"><div id="eva-monaco-tb" class="eva-monaco-editor"></div></div>' +
      '<textarea id="eva-testbench-fallback" class="eva-testbench-fallback" style="display:none;">' + escapeHtml(templateCode || task.testbench_template || '') + '</textarea>' +
      '</div>' +
      '</div>';

    ensureMonaco(templateCode || task.testbench_template || '');
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
    if (nodes.generateTranscripts) {
      nodes.generateTranscripts.addEventListener('click', async function () {
        nodes.generateTranscripts.disabled = true;
        await generateDualTranscripts();
        nodes.generateTranscripts.disabled = false;
      });
    }

    if (nodes.submitBtn) {
      nodes.submitBtn.addEventListener('click', function () {
        evaluateCase();
      });
    }

    if (nodes.downloadBtn) {
      nodes.downloadBtn.addEventListener('click', function () {
        if (!state.report) evaluateCase();
        const blob = new Blob([JSON.stringify(state.report || {}, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'reporte_evaluacion_rcsg_cg.json';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      });
    }

    if (nodes.copyBtn) {
      nodes.copyBtn.addEventListener('click', function () {
        if (!state.report) evaluateCase();
        navigator.clipboard.writeText(JSON.stringify(state.report || {}, null, 2)).then(function () {
          renderFeedback('Reporte copiado al portapapeles.', false);
        });
      });
    }
  }

  function renderStudentFields() {
    if (nodes.studentName) nodes.studentName.value = state.student.name || '';
    if (nodes.studentEmail) nodes.studentEmail.value = state.student.email || '';
    if (nodes.studentGroup) nodes.studentGroup.value = state.student.group || '';
    if (nodes.studentSubject) nodes.studentSubject.value = state.student.subject || '';
    syncStudentLabel();
  }

  function init() {
    renderStudentFields();
    bindStudentInputs();
    bindButtons();
    renderAssignedCase();
  }

  init();
});
