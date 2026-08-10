<?php
/**
 * Plugin Name: Simulador FPGA v5.3.1 (4 Quadrants - Header Ajustado)
 * Description: Entorno HDL con Testbench (izq), Design (der), Transcript y Yosys View.
 * Version: 5.3.1
 * Author: Tu Nombre
 */

if (!defined('ABSPATH')) {
    exit;
}

class SimuladorFPGA_Plugin {

    public function __construct() {
        add_shortcode('simulador_fpga', array($this, 'render_shortcode'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function enqueue_assets() {
        wp_enqueue_script(
            'svg-pan-zoom',
            'https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js',
            array(),
            '3.6.1',
            true
        );

        wp_enqueue_script(
            'simulador-fpga-editor',
            plugin_dir_url(__FILE__) . 'assets/js/editor.js',
            array('svg-pan-zoom'),
            '5.3.1',
            true
        );

        wp_localize_script('simulador-fpga-editor', 'SV_SIMULATOR_CONFIG', array(
            'ws_url' => apply_filters('simulador_fpga_ws_url', 'ws://localhost:8000/ws')
        ));
    }

    public function render_shortcode() {
        ob_start();
        ?>
        <style>
          .sim-spinner {
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: #ffffff;
            animation: sim-spin 0.8s linear infinite;
            margin-right: 6px;
            vertical-align: middle;
          }

          @keyframes sim-spin {
            to { transform: rotate(360deg); }
          }

          .sim-btn {
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

          .sim-btn:hover {
            opacity: 0.9;
          }

          .sim-btn:disabled {
            background-color: #7f8c8d !important;
            cursor: not-allowed;
            opacity: 0.75;
          }
        </style>

        <div class="simulador-fpga-wrapper" style="max-width: 1400px; margin: 20px auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            
            <!-- BARRA SUPERIOR DE ESTADO Y BOTONES -->
            <div style="background-color: #2c3e50; color: white; padding: 10px 16px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; border: 2px solid #333; border-bottom: none; gap: 15px; flex-wrap: wrap;">
                
                <!-- TÍTULO PRINCIPAL (white-space: nowrap evita desbordamientos) -->
                <div style="font-weight: bold; font-size: 15px; white-space: nowrap; flex-shrink: 0; display: flex; align-items: center; gap: 8px;">
                    🛠️ <span>Entorno de Desarrollo y Simulación SystemVerilog</span>
                    <select id="ejemplos-basicos" style="margin-left: 15px; font-size: 12px; padding: 4px 8px; border-radius: 4px; background: #34495e; color: white; border: 1px solid #7f8c8d; cursor: pointer;">
                        <option value="flipflop">Flip-Flop D</option>
                        <option value="multiplexor">Multiplexor 2:1</option>
                        <option value="codificador">Codificador de Prioridad</option>
                        <option value="contador">Contador Síncrono</option>
                        <option value="registro">Registro de Desplazamiento</option>
                        <option value="alu">ALU Básica</option>
                        <option value="fsm">Detector de Secuencia FSM</option>
                    </select>
                </div>

                <!-- CONTENEDOR DERECHO: ESTADO Y BOTONES -->
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    
                    <!-- Estado WebSocket/Linter -->
                    <span id="estado_ws" style="font-size: 12px; font-weight: bold; color: #f1c40f; white-space: nowrap; margin-right: 6px;">
                        🟠 Conectando...
                    </span>
                    
                    <!-- Botón Linter -->
                    <button id="btn-linter" class="sim-btn" style="background-color: #e67e22; color: white;">
                        🔍 Comprobar (Linter)
                    </button>

                    <!-- Botón Verificar -->
                    <button id="btn-compilar" class="sim-btn" style="background-color: #2980b9; color: white;">
                        <span id="btn-spinner-compilar" class="sim-spinner" style="display: none;"></span>
                        <span id="btn-compilar-texto">✅ Verificar</span>
                    </button>

                    <!-- Botón Simular -->
                    <button id="btn-simular" class="sim-btn" style="background-color: #27ae60; color: white;">
                        <span id="btn-spinner-simular" class="sim-spinner" style="display: none;"></span>
                        <span id="btn-simular-texto">▶️ Simular</span>
                    </button>

                    <!-- Botón Yosys -->
                    <button id="btn-ver-esquema" class="sim-btn" style="background-color: #8e44ad; color: white;">
                        👁️ Sintetizar (Yosys)
                    </button>

                </div>
            </div>

            <!-- GRID 2x2 DE CUADRANTES -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background-color: #1a252f; padding: 10px; border: 2px solid #333; border-radius: 0 0 8px 8px;">
                
                <!-- 1. ARRIBA IZQUIERDA: TESTBENCH -->
                <div style="border: 1px solid #444; border-radius: 6px; overflow: hidden; background-color: #1e1e1e;">
                    <div style="background-color: #34495e; color: #ecf0f1; padding: 6px 12px; font-weight: bold; font-size: 13px;">
                        🧪 Banco de Pruebas (Testbench)
                    </div>
                    <div id="editor_tb" style="height: 380px; width: 100%;"></div>
                </div>

                <!-- 2. ARRIBA DERECHA: DISEÑO -->
                <div style="border: 1px solid #444; border-radius: 6px; overflow: hidden; background-color: #1e1e1e;">
                    <div style="background-color: #34495e; color: #ecf0f1; padding: 6px 12px; font-weight: bold; font-size: 13px;">
                        📄 Módulo de Diseño (Design)
                    </div>
                    <div id="editor_design" style="height: 380px; width: 100%;"></div>
                </div>

                <!-- 3. ABAJO IZQUIERDA: TRANSCRIPT -->
                <div style="border: 1px solid #444; border-radius: 6px; overflow: hidden; background-color: #0f1419;">
                    <div style="background-color: #34495e; color: #ecf0f1; padding: 6px 12px; font-weight: bold; font-size: 13px; display: flex; justify-content: space-between;">
                        <span>💻 Console Transcript (QuestaSim)</span>
                        <span id="transcript-status" style="font-weight: normal; font-size: 11px; color: #bdc3c7;">Esperando acción...</span>
                    </div>
                    <div id="simulation-transcript" style="height: 380px; width: 100%; padding: 10px; font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; color: #2ecc71; overflow-y: auto; box-sizing: border-box; white-space: pre-wrap; background-color: #0d1117;">
// La salida del compilador y simulación aparecerá aquí...
                    </div>
                </div>

                <!-- 4. ABAJO DERECHA: ESQUEMA SÍNTESIS YOSYS -->
                <div style="border: 1px solid #444; border-radius: 6px; overflow: hidden; background-color: #fafafa;">
                    <div style="background-color: #34495e; color: #ecf0f1; padding: 6px 12px; font-weight: bold; font-size: 13px;">
                        🎨 Esquema Sintetizado (Yosys RTL)
                    </div>
                    <div id="visor-esquema" style="height: 380px; width: 100%; position: relative; overflow: hidden;">
                        <p style="text-align: center; color: #7f8c8d; margin-top: 170px; font-size: 13px;">
                            Pulsa "Sintetizar (Yosys)" para generar el circuito RTL.
                        </p>
                    </div>
                </div>

            </div>

        </div>
        <?php
        return ob_get_clean();
    }
}

new SimuladorFPGA_Plugin();