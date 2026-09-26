<?php
/**
 * Plugin Name: SIMULADOR-BASICO
 * Description: Simulador básico con dos paneles: banco de pruebas a la izquierda y console transcript a la derecha.
 * Version: 1.0.0
 * Author: Copilot
 */

if (!defined('ABSPATH')) {
    exit;
}

class SimuladorBasicoPlugin {
    public static function init() {
        add_shortcode('simulador_basico', array(__CLASS__, 'render_shortcode'));
        add_action('wp_enqueue_scripts', array(__CLASS__, 'enqueue_assets'));
    }

    public static function enqueue_assets() {
        wp_enqueue_style(
            'simulador-basico-style',
            plugin_dir_url(__FILE__) . 'assets/css/simulador-basico.css',
            array(),
            '1.0.0'
        );

        wp_enqueue_script(
            'simulador-basico-script',
            plugin_dir_url(__FILE__) . 'assets/js/simulador-basico.js',
            array(),
            '1.0.0',
            true
        );

        wp_localize_script('simulador-basico-script', 'SIMULADOR_BASICO_CONFIG', array(
            'ws_url' => apply_filters('simulador_basico_ws_url', 'ws://localhost:8000/ws')
        ));
    }

    public static function render_shortcode() {
        ob_start();
        ?>
        <div class="simulador-basico-plugin">
            <div class="simulador-basico-header">
                <div class="simulador-basico-title">SIMULADOR-BASICO</div>
                <div class="simulador-basico-actions">
                    <button type="button" class="sim-basico-run">Ejecutar</button>
                    <button type="button" class="sim-basico-clear secondary">Limpiar</button>
                </div>
            </div>

            <div class="simulador-basico-layout">
                <section class="sim-panel sim-panel-left">
                    <div class="panel-title">Banco de pruebas (Monaco)</div>
                    <div id="sim-basico-editor" aria-label="Editor de banco de pruebas"></div>
                </section>

                <section class="sim-panel sim-panel-right">
                    <div class="panel-title">Console Transcript (QuestaSim)</div>
                    <div id="sim-basico-console" class="sim-console" aria-live="polite">
                        <div class="sim-transcript-line">&gt; Questasim: esperando ejecución...</div>
                    </div>
                </section>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
}

SimuladorBasicoPlugin::init();
