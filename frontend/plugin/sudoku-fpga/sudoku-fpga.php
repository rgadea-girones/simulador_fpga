<?php
/**
 * Plugin Name: Sudoku FPGA - RCSG v1.0
 * Description: Generador de Sudoku por restricciones (RCSG) con SystemVerilog/QuestaSim.
 *              4 cuadrantes: Testbench (sup-izq), Clase Sudoku (sup-der),
 *              Transcript QuestaSim (inf-izq), Visor Sudoku (inf-der).
 * Version: 1.0.0
 * Author: Tu Nombre
 */

if (!defined('ABSPATH')) {
    exit;
}

class SudokuFPGA_Plugin {

    public function __construct() {
        add_shortcode('sudoku_fpga', array($this, 'render_shortcode'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function enqueue_assets() {
        wp_enqueue_script(
            'sudoku-fpga-editor',
            plugin_dir_url(__FILE__) . 'assets/js/sudoku-editor.js',
            array(),
            '1.0.0',
            true
        );

        wp_localize_script('sudoku-fpga-editor', 'SUDOKU_FPGA_CONFIG', array(
            'ws_url' => apply_filters('sudoku_fpga_ws_url', 'ws://localhost:8000/ws')
        ));
    }

    public function render_shortcode() {
        ob_start();
        ?>
        <style>
          /* ── Spinner de carga ── */
          .sdk-spinner {
            display: inline-block;
            width: 12px; height: 12px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: #ffffff;
            animation: sdk-spin 0.8s linear infinite;
            margin-right: 6px;
            vertical-align: middle;
          }
          @keyframes sdk-spin { to { transform: rotate(360deg); } }

          /* ── Botones ── */
          .sdk-btn {
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            transition: opacity 0.2s;
          }
          .sdk-btn:hover   { opacity: 0.9; }
          .sdk-btn:disabled {
            background-color: #7f8c8d !important;
            cursor: not-allowed;
            opacity: 0.75;
          }

          /* ── Cuadrícula Sudoku ── */
          .sudoku-grid {
            display: grid;
            grid-template-columns: repeat(9, 1fr);
            border: 3px solid #2c3e50;
            border-radius: 4px;
            overflow: hidden;
            user-select: none;
          }
          .sudoku-cell {
            width: 100%;
            aspect-ratio: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: clamp(12px, 2vw, 22px);
            font-weight: bold;
            font-family: 'Segoe UI', sans-serif;
            border: 1px solid #bdc3c7;
            background-color: #fefefe;
            color: #2c3e50;
            transition: background-color 0.3s;
          }
          /* Separadores de cajas 3×3 */
          .sudoku-cell[data-col="2"],
          .sudoku-cell[data-col="5"] { border-right: 3px solid #2c3e50; }
          .sudoku-cell[data-row="2"],
          .sudoku-cell[data-row="5"] { border-bottom: 3px solid #2c3e50; }
          /* Colores por caja para distinción visual */
          .sudoku-cell[data-box="0"] { background-color: #eaf4fb; }
          .sudoku-cell[data-box="1"] { background-color: #fef9e7; }
          .sudoku-cell[data-box="2"] { background-color: #eafaf1; }
          .sudoku-cell[data-box="3"] { background-color: #fef5e7; }
          .sudoku-cell[data-box="4"] { background-color: #f5eef8; }
          .sudoku-cell[data-box="5"] { background-color: #e8f8f5; }
          .sudoku-cell[data-box="6"] { background-color: #fdfefe; }
          .sudoku-cell[data-box="7"] { background-color: #fef5e7; }
          .sudoku-cell[data-box="8"] { background-color: #eaf4fb; }
          .sudoku-cell.highlight     { background-color: #a9cce3 !important; }

          /* ── Badges de estado ── */
          .sdk-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: bold;
          }
        </style>

        <div class="sudoku-fpga-wrapper" style="max-width:1400px; margin:20px auto; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">

            <!-- ╔══ BARRA SUPERIOR ══╗ -->
            <div style="background-color:#2c3e50; color:white; padding:10px 16px; border-radius:8px 8px 0 0;
                        display:flex; justify-content:space-between; align-items:center;
                        border:2px solid #333; border-bottom:none; gap:12px; flex-wrap:wrap;">

                <!-- Título -->
                <div style="font-weight:bold; font-size:15px; white-space:nowrap; flex-shrink:0; display:flex; align-items:center; gap:8px;">
                    🎲 <span>Generador de Sudoku — SystemVerilog RCSG</span>
                </div>

                <!-- Controles derechos -->
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:wrap;">

                    <!-- Estado WebSocket -->
                    <span id="sdk-estado-ws" style="font-size:12px; font-weight:bold; color:#f1c40f; white-space:nowrap; margin-right:4px;">
                        🟠 Conectando...
                    </span>

                    <!-- Linter -->
                    <button id="sdk-btn-linter" class="sdk-btn" style="background-color:#e67e22; color:white;">
                        🔍 Comprobar (Linter)
                    </button>

                    <!-- Compilar -->
                    <button id="sdk-btn-compilar" class="sdk-btn" style="background-color:#2980b9; color:white;">
                        <span id="sdk-sp-compilar" class="sdk-spinner" style="display:none;"></span>
                        <span id="sdk-tx-compilar">✅ Verificar</span>
                    </button>

                    <!-- Simular / Randomize -->
                    <button id="sdk-btn-simular" class="sdk-btn" style="background-color:#27ae60; color:white;">
                        <span id="sdk-sp-simular" class="sdk-spinner" style="display:none;"></span>
                        <span id="sdk-tx-simular">🎲 Generar Sudoku</span>
                    </button>

                    <!-- Número de intentos -->
                    <label style="font-size:12px; color:#bdc3c7; white-space:nowrap;">
                        Intentos:
                        <select id="sdk-num-intentos" style="font-size:12px; padding:3px 6px; border-radius:4px;
                                background:#34495e; color:white; border:1px solid #7f8c8d;">
                            <option value="1">1</option>
                            <option value="3" selected>3</option>
                            <option value="5">5</option>
                            <option value="10">10</option>
                        </select>
                    </label>

                    <!-- Limpiar -->
                    <button id="sdk-btn-limpiar" class="sdk-btn" style="background-color:#7f8c8d; color:white;">
                        🗑️ Limpiar
                    </button>
                </div>
            </div>

            <!-- ╔══ GRID 2×2 ══╗ -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;
                        background-color:#1a252f; padding:10px;
                        border:2px solid #333; border-radius:0 0 8px 8px;">

                <!-- ┌── 1. SUP-IZQ: TESTBENCH ──┐ -->
                <div style="border:1px solid #444; border-radius:6px; overflow:hidden; background-color:#1e1e1e;">
                    <div style="background-color:#1a5276; color:#d6eaf8; padding:6px 12px; font-weight:bold; font-size:13px;
                                display:flex; justify-content:space-between; align-items:center;">
                        <span>🧪 Banco de Pruebas — llamadas a randomize()</span>
                        <span class="sdk-badge" style="background:#1abc9c; color:#fff;" id="sdk-badge-tb">testbench</span>
                    </div>
                    <div id="sdk-editor-tb" style="height:380px; width:100%;"></div>
                </div>

                <!-- ┌── 2. SUP-DER: CLASE SUDOKU ──┐ -->
                <div style="border:1px solid #444; border-radius:6px; overflow:hidden; background-color:#1e1e1e;">
                    <div style="background-color:#6c3483; color:#e8daef; padding:6px 12px; font-weight:bold; font-size:13px;
                                display:flex; justify-content:space-between; align-items:center;">
                        <span>📐 Clase SudokuGenerator — Restricciones (RCSG)</span>
                        <span class="sdk-badge" style="background:#8e44ad; color:#fff;">class / constraints</span>
                    </div>
                    <div id="sdk-editor-clase" style="height:380px; width:100%;"></div>
                </div>

                <!-- ┌── 3. INF-IZQ: TRANSCRIPT ──┐ -->
                <div style="border:1px solid #444; border-radius:6px; overflow:hidden; background-color:#0f1419;">
                    <div style="background-color:#34495e; color:#ecf0f1; padding:6px 12px; font-weight:bold; font-size:13px;
                                display:flex; justify-content:space-between; align-items:center;">
                        <span>💻 Console Transcript — QuestaSim</span>
                        <span id="sdk-transcript-status" style="font-weight:normal; font-size:11px; color:#bdc3c7;">
                            Esperando acción...
                        </span>
                    </div>
                    <div id="sdk-transcript" style="height:380px; width:100%; padding:10px;
                                                   font-family:'Consolas','Courier New',monospace; font-size:12px;
                                                   color:#2ecc71; overflow-y:auto; box-sizing:border-box;
                                                   white-space:pre-wrap; background-color:#0d1117;">
// La salida de QuestaSim aparecerá aquí...
// Las líneas SUDOKU_ROW_N:DDDDDDDDD serán parseadas automáticamente.
                    </div>
                </div>

                <!-- ┌── 4. INF-DER: VISOR SUDOKU ──┐ -->
                <div style="border:1px solid #444; border-radius:6px; overflow:hidden; background-color:#fafafa;">
                    <div style="background-color:#1e8449; color:#eafaf1; padding:6px 12px; font-weight:bold; font-size:13px;
                                display:flex; justify-content:space-between; align-items:center;">
                        <span>🟩 Visor Sudoku — Cuadrícula resultante</span>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <span id="sdk-visor-badge" class="sdk-badge" style="background:#27ae60; color:#fff; display:none;">✓ Válido</span>
                            <button id="sdk-btn-anterior" class="sdk-btn"
                                    style="background:#2980b9; color:white; padding:3px 8px; font-size:11px; display:none;">◀</button>
                            <span id="sdk-visor-contador" style="font-size:11px; color:#a9dfbf; display:none;"></span>
                            <button id="sdk-btn-siguiente" class="sdk-btn"
                                    style="background:#2980b9; color:white; padding:3px 8px; font-size:11px; display:none;">▶</button>
                        </div>
                    </div>
                    <div id="sdk-visor-sudoku" style="height:380px; width:100%; display:flex;
                                                     flex-direction:column; align-items:center;
                                                     justify-content:center; padding:12px; box-sizing:border-box;
                                                     background:#f8f9fa;">
                        <p style="text-align:center; color:#7f8c8d; font-size:13px; font-style:italic;">
                            Pulsa <strong>🎲 Generar Sudoku</strong> para ejecutar el randomize() y visualizar el resultado.
                        </p>
                    </div>
                </div>

            </div><!-- /grid 2×2 -->

        </div><!-- /wrapper -->
        <?php
        return ob_get_clean();
    }
}

new SudokuFPGA_Plugin();
