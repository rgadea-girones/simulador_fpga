<?php
/**
 * Plugin Name: SIMULADOR-AVANZADO
 * Description: Simulador avanzado con doble editor superior (Testbench a la izquierda, Diseño a la derecha) y panel inferior superponible para la consola transcript y el visor de ondas Surfer VCD.
 * Version: 1.1.0
 * Author: Antigravity
 */

if (!defined('ABSPATH')) {
    exit;
}

class SimuladorAvanzadoPlugin {
    public static function init() {
        add_shortcode('simulador_avanzado', array(__CLASS__, 'render_shortcode'));
        add_action('wp_enqueue_scripts', array(__CLASS__, 'enqueue_assets'));
    }

    public static function enqueue_assets() {
        $css_path = plugin_dir_path(__FILE__) . 'assets/css/simulador-avanzado.css';
        $js_path = plugin_dir_path(__FILE__) . 'assets/js/simulador-avanzado.js';
        $css_ver = file_exists($css_path) ? filemtime($css_path) : '1.1.0';
        $js_ver = file_exists($js_path) ? filemtime($js_path) : '1.1.0';

        wp_enqueue_style(
            'simulador-avanzado-style',
            plugin_dir_url(__FILE__) . 'assets/css/simulador-avanzado.css',
            array(),
            $css_ver
        );

        wp_enqueue_script(
            'simulador-avanzado-script',
            plugin_dir_url(__FILE__) . 'assets/js/simulador-avanzado.js',
            array(),
            $js_ver,
            true
        );

        wp_localize_script('simulador-avanzado-script', 'SIMULADOR_AVANZADO_CONFIG', array(
            'ws_url' => apply_filters('simulador_avanzado_ws_url', 'ws://localhost:8000/ws'),
            'surfer_url' => apply_filters('simulador_avanzado_surfer_url', 'http://localhost:8000/surfer/index.html'),
            'vcd_base_url' => apply_filters('simulador_avanzado_vcd_base_url', 'http://localhost:8000')
        ));
    }

    public static function render_shortcode() {
        ob_start();
        ?>
        <div class="simulador-avanzado-plugin">
            <div class="simulador-avanzado-header">
                <div class="simulador-avanzado-title">
                    <span class="sim-title-main">SIMULADOR-AVANZADO</span>
                    <span class="sim-badge">DUAL-EDITOR & SURFER VCD</span>
                </div>
                <div class="simulador-avanzado-actions">
                    <button type="button" class="sim-avanzado-run">▶ Ejecutar Simulación</button>
                    <button type="button" class="sim-avanzado-clear secondary">🧹 Limpiar</button>
                </div>
            </div>

            <!-- FILA SUPERIOR: Doble Editor (Izq: Testbench, Der: Diseño) -->
            <div class="simulador-avanzado-top-layout">
                <section class="sim-panel sim-panel-left">
                    <div class="panel-title">
                        <span>🧪 Banco de pruebas (Testbench)</span>
                        <span class="panel-subtitle">testbench.sv</span>
                    </div>
                    <div id="sim-avanzado-editor-tb" class="monaco-editor-container" aria-label="Editor de banco de pruebas"></div>
                </section>

                <section class="sim-panel sim-panel-right">
                    <div class="panel-title">
                        <span>⚙️ Módulo de Diseño (Design)</span>
                        <span class="panel-subtitle">design.sv</span>
                    </div>
                    <div id="sim-avanzado-editor-design" class="monaco-editor-container" aria-label="Editor de diseño"></div>
                </section>
            </div>

            <!-- FILA INFERIOR: Panel Superponible / Pestañas (Consola / Visor Surfer VCD) -->
            <div class="simulador-avanzado-bottom-layout">
                <div class="bottom-panel-header">
                    <div class="bottom-tabs">
                        <button type="button" id="tab-btn-console" class="tab-btn active">
                            💻 Console Transcript
                            <span id="sim-avanzado-status-badge" class="status-indicator">Desconectado</span>
                        </button>
                        <button type="button" id="tab-btn-vcd" class="tab-btn disabled" disabled>
                            📈 Formas de Onda (Surfer VCD)
                            <span id="vcd-status-badge" class="vcd-badge">Sin VCD</span>
                        </button>
                    </div>
                    <div class="bottom-panel-actions">
                        <button type="button" id="sim-avanzado-reload-vcd" class="vcd-btn-sm" style="display: none;" title="Recargar Ondas">🔄 Recargar</button>
                    </div>
                </div>

                <div class="bottom-panel-content">
                    <!-- Vista 1: Consola Transcript -->
                    <div id="sim-avanzado-console-pane" class="bottom-pane active">
                        <div id="sim-avanzado-console" class="sim-console" aria-live="polite">
                            <div class="sim-transcript-line">&gt; Esperando ejecución de simulación...</div>
                        </div>
                    </div>

                    <!-- Vista 2: Visor Surfer WASM -->
                    <div id="sim-avanzado-vcd-pane" class="bottom-pane">
                        <div class="vcd-iframe-container">
                            <iframe id="sim-avanzado-surfer-iframe" src="about:blank" title="Visor Surfer WASM"></iframe>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
}

SimuladorAvanzadoPlugin::init();
