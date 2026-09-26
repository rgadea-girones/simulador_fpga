<?php
/**
 * Plugin Name: Simulador FPGA ASM - Terasic DE-Series v1.0
 * Description: Entorno interactivo Verilog con editor Monaco y simulador de periféricos Terasic DE-Series (LEDS, Switches, Keys, Displays HEX) y visor de esquemas Yosys.
 * Version: 1.0.0
 * Author: Tu Nombre
 */

if (!defined('ABSPATH')) {
    exit;
}

class SimuladorASM_Plugin {

    public function __construct() {
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
            'monaco-loader',
            'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/loader.min.js',
            array(),
            '0.36.1',
            true
        );

        wp_enqueue_script(
            'simulador-asm-editor',
            plugin_dir_url(__FILE__) . 'assets/js/editor-asm.js',
            array('svg-pan-zoom', 'monaco-loader'),
            filemtime(plugin_dir_path(__FILE__) . 'assets/js/editor-asm.js'),
            true
        );

        wp_localize_script('simulador-asm-editor', 'SV_ASM_CONFIG', array(
            'ws_url' => apply_filters('simulador_asm_ws_url', 'ws://localhost:8000/ws')
        ));
    }

    public function render_shortcode() {
        $this->enqueue_assets();
        ob_start();
        ?>
        <style>
          .asm-spinner {
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: #ffffff;
            animation: asm-spin 0.8s linear infinite;
            margin-right: 6px;
            vertical-align: middle;
          }

          @keyframes asm-spin {
            to { transform: rotate(360deg); }
          }

          .asm-btn {
            border: none;
            padding: 10px 20px;
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

          .asm-btn:hover {
            opacity: 0.9;
          }

          .asm-btn:disabled {
            background-color: #7f8c8d !important;
            cursor: not-allowed;
            opacity: 0.75;
          }
        </style>

        <div class="simulador-asm-wrapper" style="max-width: 1400px; margin: 20px auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            
            <!-- ESQUEMA (ARRIBA) -->
            <div style="border: 2px solid #333; border-radius: 8px; overflow: hidden; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.2);">
                <div style="background-color: #2c3e50; color: white; padding: 12px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                    <span>🎨 Esquema Sintetizado (Yosys RTL)</span>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <select id="asm-sintesis-engine" class="asm-btn" style="background-color: #34495e; color: white; border: 1px solid #555; padding: 6px 10px; cursor: pointer; font-size: 13px; border-radius: 4px; outline: none;">
                            <option value="yosys">⚡ Yosys Nativo</option>
                            <option value="surelog_uhdm" selected>🚀 Synlig + Yosys (Avanzado)</option>
                        </select>
                        <button id="btn-ver-esquema" class="asm-btn" style="background-color: #0073aa; color: white; padding: 6px 12px;">
                            👁️ Ver Esquema de Hardware
                        </button>
                    </div>
                </div>
                <!-- La pizarra interactiva -->
                <div id="visor-esquema" style="width: 100%; height: 500px; border-top: 1px solid #ccc; background-color: #fafafa; overflow: hidden; position: relative;">
                    <p style="text-align: center; color: #888; margin-top: 230px; font-family: sans-serif;">
                        Pulsa el botón para sintetizar el circuito.
                    </p>
                </div>
            </div>

            <!-- EDITOR Y PLACA DE PERIFÉRICOS (ABAJO) -->
            <div style="display: grid; grid-template-columns: 1fr; gap: 20px; margin-bottom: 20px;">
                
                <!-- EDITOR DE CÓDIGO -->
                <div style="border: 2px solid #333; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.2);">
                    <div style="background-color: #2c3e50; color: white; padding: 12px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                        <span>📝 Editor Verilog (Terasic DE-Series)</span>
                        <div>
                            <span style="font-size: 11px; margin-right: 15px; color: #bdc3c7;">Tip: Pulsa Ctrl+S para compilar</span>
                            <button id="btn-compilar-simular" class="asm-btn" style="background-color: #27ae60; color: white; padding: 8px 15px;">
                                <span id="asm-btn-spinner" class="asm-spinner" style="display: none;"></span>
                                <span id="asm-btn-texto">⚙️ Compilar y Simular</span>
                            </button>
                        </div>
                    </div>
                    <div id="editor_monaco" style="height: 450px; width: 100%;"></div>
                </div>

                <!-- PLACA TERASIC DE-SERIES -->
                <div style="background-color: #2c3e50; color: white; padding: 25px; border-radius: 12px; border: 5px solid #1a252f; box-shadow: 0 15px 30px rgba(0,0,0,0.4);">
                    <div id="estado_ws" style="text-align: right; margin-bottom: 15px; font-size: 13px; font-weight: bold; color: #f1c40f;">
                        🟠 Inicializando...
                    </div>
                    
                    <!-- Displays de 7 Segmentos HEX -->
                    <div id="hex_container" style="display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; background: #1a252f; padding: 20px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #34495e;">
                    </div>
                    
                    <!-- Leds de la placa -->
                    <div style="background: #34495e; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
                        <div id="ledr_container" style="display: flex; justify-content: center; gap: 8px; margin-bottom: 15px;"></div>
                        <div id="ledg_container" style="display: flex; justify-content: center; gap: 8px;"></div>
                    </div>
                    
                    <!-- Interruptores SW y Pulsadores KEY -->
                    <div style="display: flex; justify-content: space-between; align-items: center; background-color: #1a252f; padding: 20px; border-radius: 8px; flex-wrap: wrap; gap: 15px;">
                        <div id="sw_container" style="display: flex; gap: 12px;"></div>
                        <div id="key_container" style="display: flex; gap: 20px;"></div>
                    </div>
                </div>

            </div>

        </div>
        <?php
        return ob_get_clean();
    }
}

new SimuladorASM_Plugin();
