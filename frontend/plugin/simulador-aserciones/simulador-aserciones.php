<?php
/**
 * Plugin Name: Simulador Aserciones SVA
 * Description: Laboratorio virtual de aserciones concurrentes SystemVerilog con catalogo de ejemplos y carga directa al simulador avanzado.
 * Version: 1.0.0
 * Author: Antigravity
 */

if (!defined('ABSPATH')) {
    exit;
}

class SimuladorAsercionesPlugin {
    public static function init() {
        add_shortcode('simulador_aserciones', array(__CLASS__, 'render_shortcode'));
        add_action('init', array(__CLASS__, 'register_content_type'));
        add_action('rest_api_init', array(__CLASS__, 'register_rest_routes'));
    }

    public static function register_content_type() {
        register_post_type('sva_report', array(
            'labels' => array(
                'name' => 'SVA Reports',
                'singular_name' => 'SVA Report'
            ),
            'public' => false,
            'show_ui' => false,
            'show_in_menu' => false,
            'show_in_rest' => false,
            'supports' => array('title', 'editor'),
            'capability_type' => 'post',
            'map_meta_cap' => true,
            'has_archive' => false,
            'rewrite' => false,
            'query_var' => false,
            'exclude_from_search' => true
        ));
    }

    public static function register_rest_routes() {
        register_rest_route('simulador-aserciones/v1', '/reports', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'handle_report_submission'),
            'permission_callback' => '__return_true'
        ));
    }

    private static function get_current_user_payload() {
        $user = wp_get_current_user();
        if (!$user || !$user->exists()) {
            return array();
        }

        return array(
            'user_id' => $user->ID,
            'display_name' => $user->display_name,
            'user_login' => $user->user_login,
            'user_email' => $user->user_email
        );
    }

    public static function handle_report_submission(WP_REST_Request $request) {
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            return new WP_REST_Response(array(
                'ok' => false,
                'message' => 'Payload invalido.'
            ), 400);
        }

        $entries = isset($payload['entries']) && is_array($payload['entries']) ? $payload['entries'] : array();
        if (empty($entries)) {
            return new WP_REST_Response(array(
                'ok' => false,
                'message' => 'No se recibieron entradas de reporte.'
            ), 400);
        }

        $student = isset($payload['student']) && is_array($payload['student']) ? $payload['student'] : array();
        $student_label = trim((string) ($student['name'] ?? ''));
        if ($student_label === '' && !empty($student['code'])) {
            $student_label = (string) $student['code'];
        }
        if ($student_label === '' && !empty($student['email'])) {
            $student_label = (string) $student['email'];
        }
        if ($student_label === '') {
            $student_label = 'Sin identificar';
        }

        $report_title = 'SVA Report - ' . $student_label . ' - ' . wp_date('Y-m-d H:i:s');
        $report_id = wp_insert_post(array(
            'post_type' => 'sva_report',
            'post_status' => 'private',
            'post_title' => $report_title,
            'post_content' => wp_json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        ), true);

        if (is_wp_error($report_id)) {
            return new WP_REST_Response(array(
                'ok' => false,
                'message' => $report_id->get_error_message()
            ), 500);
        }

        update_post_meta($report_id, '_sva_report_source', 'simulador_aserciones');
        update_post_meta($report_id, '_sva_report_payload', wp_json_encode($payload, JSON_UNESCAPED_UNICODE));
        update_post_meta($report_id, '_sva_report_count', count($entries));
        update_post_meta($report_id, '_sva_report_created_at', current_time('mysql'));
        update_post_meta($report_id, '_sva_report_student', wp_json_encode($student, JSON_UNESCAPED_UNICODE));

        return new WP_REST_Response(array(
            'ok' => true,
            'message' => 'Reporte almacenado.',
            'report_id' => $report_id,
            'report_title' => $report_title
        ), 200);
    }

    private static function enqueue_assets() {
        $css_path = plugin_dir_path(__FILE__) . 'assets/css/simulador-aserciones.css';
        $js_path = plugin_dir_path(__FILE__) . 'assets/js/simulador-aserciones.js';
        $css_ver = file_exists($css_path) ? filemtime($css_path) : '1.0.0';
        $js_ver = file_exists($js_path) ? filemtime($js_path) : '1.0.0';

        wp_enqueue_style(
            'simulador-aserciones-style',
            plugin_dir_url(__FILE__) . 'assets/css/simulador-aserciones.css',
            array(),
            $css_ver
        );

        wp_enqueue_script(
            'simulador-aserciones-script',
            plugin_dir_url(__FILE__) . 'assets/js/simulador-aserciones.js',
            array(),
            $js_ver,
            true
        );

        wp_localize_script('simulador-aserciones-script', 'SIMULADOR_ASERCIONES_CONFIG', array(
            'examples_url' => plugin_dir_url(__FILE__) . 'data/sva_examples.json',
            'simulator_page_url' => apply_filters('simulador_aserciones_simulator_page_url', ''),
            'ws_url' => apply_filters('simulador_aserciones_ws_url', 'ws://localhost:8000/ws'),
            'surfer_url' => apply_filters('simulador_aserciones_surfer_url', 'http://localhost:8000/surfer/index.html'),
            'vcd_base_url' => apply_filters('simulador_aserciones_vcd_base_url', 'http://localhost:8000'),
            'report_endpoint' => apply_filters('simulador_aserciones_report_endpoint', rest_url('simulador-aserciones/v1/reports'))
            , 'current_user' => self::get_current_user_payload()
        ));
    }

    public static function render_shortcode() {
        self::enqueue_assets();

        ob_start();
        ?>
        <div class="simulador-aserciones-plugin" id="simulador-aserciones-root">
            <div class="sva-header">
                <div>
                    <h2>Laboratorio Virtual de Aserciones Concurrentes</h2>
                    <p>Selecciona un ejemplo y cargalo en el simulador con testbench a la izquierda y design a la derecha.</p>
                </div>
                <div class="sva-header-badge">SystemVerilog + SVA</div>
            </div>

            <div class="sva-layout">
                <aside class="sva-sidebar">
                    <div class="sva-sidebar-title">Catalogo de ejemplos</div>
                    <div id="sva-example-list" class="sva-example-list">
                        <div class="sva-loading">Cargando ejemplos...</div>
                    </div>
                </aside>

                <section class="sva-content">
                    <div id="sva-detail" class="sva-detail">
                        <h3>Selecciona un ejemplo</h3>
                        <p>El panel mostrara teoria, conceptos y codigo para design.sv y testbench.sv.</p>
                    </div>
                </section>
            </div>

            <div class="sva-embed-wrapper">
                <div class="sva-embed-header">
                    <h3>Simulador online (Questa + Surfer)</h3>
                    <p>Panel izquierdo: testbench.sv, panel derecho: design.sv. Usa el boton "Cargar ejemplo" para precargar ambos archivos.</p>
                </div>
                <div class="sva-embed-body">
                    <div class="sva-sim-plugin">
                        <div class="sva-sim-header">
                            <div class="sva-sim-title">
                                <span class="sva-sim-main">SIMULADOR SVA INTEGRADO</span>
                                <span class="sva-sim-badge">DUAL EDITOR + SURFER VCD</span>
                            </div>
                            <div class="sva-sim-actions">
                                <button type="button" id="sva-sim-run" class="sva-sim-run">Ejecutar Simulacion</button>
                                <button type="button" id="sva-sim-clear" class="sva-sim-clear">Limpiar</button>
                            </div>
                        </div>

                        <div class="sva-sim-top-layout">
                            <section class="sva-sim-panel sva-sim-panel-left">
                                <div class="sva-sim-panel-title">
                                    <span>Testbench</span>
                                    <span class="sva-sim-panel-subtitle">testbench.sv</span>
                                </div>
                                <div id="sva-editor-tb" class="sva-monaco-editor"></div>
                            </section>

                            <section class="sva-sim-panel">
                                <div class="sva-sim-panel-title">
                                    <span>Design</span>
                                    <span class="sva-sim-panel-subtitle">design.sv</span>
                                </div>
                                <div id="sva-editor-design" class="sva-monaco-editor"></div>
                            </section>
                        </div>

                        <div class="sva-sim-bottom-layout">
                            <div class="sva-bottom-header">
                                <div class="sva-bottom-tabs">
                                    <button type="button" id="sva-tab-console" class="sva-tab-btn active">
                                        Console
                                        <span id="sva-status-badge" class="sva-status-indicator">Desconectado</span>
                                    </button>
                                    <button type="button" id="sva-tab-vcd" class="sva-tab-btn disabled" disabled>
                                        Ondas (Surfer)
                                        <span id="sva-vcd-badge" class="sva-vcd-badge">Sin VCD</span>
                                    </button>
                                </div>
                                <div class="sva-bottom-actions">
                                    <button type="button" id="sva-reload-vcd" class="sva-vcd-btn" style="display:none;">Recargar</button>
                                </div>
                            </div>

                            <div class="sva-bottom-content">
                                <div id="sva-console-pane" class="sva-bottom-pane active">
                                    <div id="sva-console" class="sva-console">
                                        <div class="sva-transcript-line">&gt; Esperando simulacion...</div>
                                    </div>
                                </div>
                                <div id="sva-vcd-pane" class="sva-bottom-pane">
                                    <div class="sva-vcd-iframe-wrap">
                                        <iframe id="sva-surfer-iframe" src="about:blank" title="Visor Surfer"></iframe>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
}

SimuladorAsercionesPlugin::init();
