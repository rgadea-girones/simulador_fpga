<?php
/**
 * Plugin Name: Evaluacion RCSG CG
 * Description: Evaluacion automatica de verificacion funcional SystemVerilog usando clases randomizables (RCSG) y cobertura funcional con covergroups comparada con test directos clasicos.
 * Version: 1.0.0
 * Author: Antigravity
 */

if (!defined('ABSPATH')) {
    exit;
}

class EvaluacionRcsgCgPlugin {
    public static function init() {
        add_shortcode('evaluacion_rcsg_cg', array(__CLASS__, 'render_shortcode'));
        add_action('init', array(__CLASS__, 'register_content_type'));
        add_action('rest_api_init', array(__CLASS__, 'register_rest_routes'));
        add_action('admin_menu', array(__CLASS__, 'register_admin_menu'));
        add_action('admin_init', array(__CLASS__, 'handle_admin_actions'));
    }

    public static function register_content_type() {
        register_post_type('eva_rcsg_report', array(
            'labels' => array(
                'name' => 'Eva RCSG Reports',
                'singular_name' => 'Eva RCSG Report'
            ),
            'public' => false,
            'show_ui' => true,
            'show_in_menu' => true,
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

    private static function get_template_code() {
        $template_file = plugin_dir_path(__FILE__) . 'data/tb_contador_template.sv';
        if (file_exists($template_file)) {
            return file_get_contents($template_file);
        }
        return '';
    }

    private static function get_task_bank() {
        $template = self::get_template_code();
        return array_slice(array(
            array(
                'id' => 'RCSG_E1',
                'title' => 'Contador Modulo 13 con Verificacion por Clase Randomizable (RCSG)',
                'summary' => 'Diseña una clase SystemVerilog con variables randomizables (rand), restricciones (constraints) y llamadas a .randomize() para maximizar la cobertura funcional respecto al test clasico.',
                'counter_code' => <<<'SV'
module counter_dut(
  input  logic clk,
  input  logic enable,
  input  logic updown,
  input  logic reset_n,
  input  logic areset_n,
  output logic terminal_count_en,
  output logic terminal_count_free,
  output logic [3:0] count
);
  always_ff @(posedge clk or negedge areset_n) begin
    if (!areset_n) count <= 4'd0;
    else if (!reset_n) count <= 4'd0;
    else if (enable) begin
      if (updown) count <= (count == 4'd12) ? 4'd0 : count + 4'd1;
      else count <= (count == 4'd0) ? 4'd12 : count - 4'd1;
    end
  end
  assign terminal_count_free = (updown && (count == 4'd12)) || (!updown && (count == 4'd0));
  assign terminal_count_en = enable && terminal_count_free;
endmodule
SV,
                'testbench_template' => $template,
                'explanation' => 'Se requiere definir la clase Stimulus bajo `ifdef CG_ENABLE con campos rand (enable, updown, reset_n, areset_n) y ejecutar la secuencia random en el initial.'
            )
        ), 0, 5);
    }

    public static function register_rest_routes() {
        register_rest_route('evaluacion-rcsg-cg/v1', '/reports', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'handle_report_submission'),
            'permission_callback' => '__return_true'
        ));
    }

    public static function handle_report_submission(WP_REST_Request $request) {
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            return new WP_REST_Response(array(
                'ok' => false,
                'message' => 'Payload invalido.'
            ), 400);
        }

        $student = isset($payload['student']) && is_array($payload['student']) ? $payload['student'] : array();
        $student_name = sanitize_text_field((string) ($student['name'] ?? ''));
        $student_email = sanitize_email((string) ($student['email'] ?? ''));
        $student_group = sanitize_text_field((string) ($student['group'] ?? ''));
        $student_subject = sanitize_text_field((string) ($student['subject'] ?? ''));

        if ($student_name === '' || $student_email === '' || $student_group === '' || $student_subject === '') {
            return new WP_REST_Response(array(
                'ok' => false,
                'message' => 'Debes completar nombre, correo institucional, grupo y asignatura.'
            ), 400);
        }

        if (!is_email($student_email)) {
            return new WP_REST_Response(array(
                'ok' => false,
                'message' => 'El correo institucional no es valido.'
            ), 400);
        }

        $wp_user = wp_get_current_user();
        if ($wp_user && $wp_user->exists() && !empty($wp_user->user_email)) {
            if (strtolower($student_email) !== strtolower((string) $wp_user->user_email)) {
                return new WP_REST_Response(array(
                    'ok' => false,
                    'message' => 'La identidad del envio debe coincidir con el usuario autenticado.'
                ), 403);
            }
        }

        $ip = isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field((string) $_SERVER['REMOTE_ADDR']) : 'unknown';
        $throttle_key = 'eva_rcsg_submit_' . md5(strtolower($student_email) . '|' . $ip);
        if (get_transient($throttle_key)) {
            return new WP_REST_Response(array(
                'ok' => false,
                'message' => 'Espera 90 segundos antes de enviar otro intento.'
            ), 429);
        }
        set_transient($throttle_key, 1, 90);

        $student['name'] = $student_name;
        $student['email'] = $student_email;
        $student['group'] = $student_group;
        $student['subject'] = $student_subject;

        $student_label = trim((string) ($student['name'] ?? ''));
        if ($student_label === '' && !empty($student['email'])) {
            $student_label = (string) $student['email'];
        }
        if ($student_label === '') {
            $student_label = 'Sin identificar';
        }

        $score = isset($payload['score']) ? floatval($payload['score']) : 0;
        $report_title = 'Eva RCSG Report - ' . $student_label . ' - ' . wp_date('Y-m-d H:i:s');
        $report_id = wp_insert_post(array(
            'post_type' => 'eva_rcsg_report',
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

        $detail = isset($payload['detail']) && is_array($payload['detail']) ? $payload['detail'] : array();

        update_post_meta($report_id, '_eva_report_source', 'evaluacion_rcsg_cg');
        update_post_meta($report_id, '_eva_report_payload', wp_json_encode($payload, JSON_UNESCAPED_UNICODE));
        update_post_meta($report_id, '_eva_report_created_at', current_time('mysql'));
        update_post_meta($report_id, '_eva_report_student', wp_json_encode($student, JSON_UNESCAPED_UNICODE));
        update_post_meta($report_id, '_eva_report_student_email', strtolower($student_email));
        update_post_meta($report_id, '_eva_report_score', $score);

        update_post_meta($report_id, '_eva_report_classic_cov', floatval($detail['classicCoverage'] ?? 0));
        update_post_meta($report_id, '_eva_report_student_cov', floatval($detail['studentCoverage'] ?? 0));
        update_post_meta($report_id, '_eva_report_has_class', !empty($detail['hasClass']) ? 'Sí' : 'No');
        update_post_meta($report_id, '_eva_report_has_randomize', !empty($detail['hasRandomize']) ? 'Sí' : 'No');
        update_post_meta($report_id, '_eva_report_final_reason', sanitize_text_field((string) ($detail['finalReason'] ?? ($payload['feedback'] ?? ''))));
        update_post_meta($report_id, '_eva_report_classic_transcript', (string) ($detail['classicTranscript'] ?? ''));
        update_post_meta($report_id, '_eva_report_student_transcript', (string) ($detail['studentTranscript'] ?? ''));
        update_post_meta($report_id, '_eva_report_testbench', (string) ($detail['testbench'] ?? ''));

        return new WP_REST_Response(array(
            'ok' => true,
            'message' => 'Reporte RCSG-CG almacenado correctamente.',
            'report_id' => $report_id,
            'report_title' => $report_title
        ), 200);
    }

    private static function enqueue_assets() {
        $css_path = plugin_dir_path(__FILE__) . 'assets/css/evaluacion-rcsg-cg.css';
        $js_path = plugin_dir_path(__FILE__) . 'assets/js/evaluacion-rcsg-cg.js';
        $css_ver = file_exists($css_path) ? filemtime($css_path) : '1.0.0';
        $js_ver = file_exists($js_path) ? filemtime($js_path) : '1.0.0';

        wp_enqueue_style(
            'evaluacion-rcsg-cg-style',
            plugin_dir_url(__FILE__) . 'assets/css/evaluacion-rcsg-cg.css',
            array(),
            $css_ver
        );

        wp_enqueue_script(
            'evaluacion-rcsg-cg-script',
            plugin_dir_url(__FILE__) . 'assets/js/evaluacion-rcsg-cg.js',
            array(),
            $js_ver,
            true
        );

        wp_localize_script('evaluacion-rcsg-cg-script', 'EVALUACION_RCSG_CG_CONFIG', array(
            'task_bank' => self::get_task_bank(),
            'template_code' => self::get_template_code(),
            'report_endpoint' => rest_url('evaluacion-rcsg-cg/v1/reports'),
            'ws_url' => apply_filters('evaluacion_rcsg_cg_ws_url', 'ws://localhost:8000/ws'),
            'surfer_url' => apply_filters('evaluacion_rcsg_cg_surfer_url', 'http://localhost:8000/surfer/index.html'),
            'vcd_base_url' => apply_filters('evaluacion_rcsg_cg_vcd_base_url', 'http://localhost:8000'),
            'current_user' => self::get_current_user_payload()
        ));
    }

    public static function render_shortcode() {
        self::enqueue_assets();

        ob_start();
        ?>
        <div class="evaluacion-rcsg-cg-plugin" id="evaluacion-rcsg-cg-root">
            <div class="eva-student-card">
                <div class="eva-card-title">Identificacion del alumno</div>
                <div class="eva-student-grid">
                    <label>Nombre completo<input id="eva-student-name" type="text" placeholder="Nombre y apellidos"></label>
                    <label>Correo electronico institucional<input id="eva-student-email" type="email" placeholder="correo@institucion.edu"></label>
                    <label>Grupo / clase<input id="eva-student-group" type="text" placeholder="Grupo"></label>
                    <label>Asignatura<input id="eva-student-subject" type="text" placeholder="Asignatura"></label>
                </div>
                <div class="eva-student-meta">Identificador activo: <strong id="eva-student-label">Sin identificar</strong></div>
            </div>

            <div class="eva-assignment-card">
                <div class="eva-card-title">Verificacion Funcional por Estimulo Aleatorio (RCSG + Covergroup)</div>
                <p>Crea una clase con variables randomizables (<code>rand</code>) y restricciones bajo la directiva <code>`ifdef CG_ENABLE</code> para superar la cobertura funcional del test directo clasico.</p>
                <div id="eva-assignment-summary" class="eva-summary">Caso asignado activado.</div>
                <div class="eva-actions">
                    <button type="button" id="eva-generate-transcripts" class="eva-btn primary">🔄 Generar Transcripts (Comparativa Izquierda/Derecha)</button>
                    <button type="button" id="eva-submit" class="eva-btn success">Enviar y evaluar</button>
                    <button type="button" id="eva-download-report" class="eva-btn secondary">Descargar reporte JSON</button>
                    <button type="button" id="eva-copy-report" class="eva-btn secondary">Copiar JSON</button>
                </div>
                <div id="eva-score" class="eva-score">Puntuacion: 0/10</div>
                <div id="eva-global-feedback" class="eva-feedback"></div>
            </div>

            <div id="eva-task-list" class="eva-task-list"></div>

            <div class="eva-transcript-card">
                <div class="eva-card-title">Comparativa de Transcripts de Simulacion (Questa)</div>
                <div class="eva-dual-transcripts">
                    <div class="eva-transcript-col left">
                        <div class="eva-col-header">
                            <span class="eva-badge classic">Test Clasico Directo</span>
                            <span class="eva-col-sub">(Sin `CG_ENABLE`)</span>
                        </div>
                        <pre id="eva-transcript-classic" class="eva-transcript">Esperando simulacion clasica...</pre>
                    </div>
                    <div class="eva-transcript-col right">
                        <div class="eva-col-header">
                            <span class="eva-badge rcsg">Test Alumno con Clase RCSG</span>
                            <span class="eva-col-sub">(Con `+define+CG_ENABLE`)</span>
                        </div>
                        <pre id="eva-transcript-student" class="eva-transcript">Esperando simulacion del alumno...</pre>
                    </div>
                </div>
            </div>

            <div id="eva-solution-panel" class="eva-solution-panel hidden"></div>
        </div>
        <?php
        return ob_get_clean();
    }

    public static function register_admin_menu() {
        add_menu_page(
            'Evaluación RCSG-CG',
            'Evaluación RCSG-CG',
            'manage_options',
            'evaluacion-rcsg-cg-reports',
            array(__CLASS__, 'render_admin_page'),
            'dashicons-randomize',
            31
        );
    }

    private static function safe_json_decode($input) {
        if (empty($input)) return array();
        if (is_array($input)) return $input;
        if (!is_string($input)) return array();

        $decoded = json_decode($input, true);
        if (is_array($decoded)) return $decoded;

        $unslashed = stripslashes($input);
        $decoded = json_decode($unslashed, true);
        if (is_array($decoded)) return $decoded;

        $double_unslashed = stripslashes($unslashed);
        $decoded = json_decode($double_unslashed, true);
        if (is_array($decoded)) return $decoded;

        $html_decoded = html_entity_decode($unslashed, ENT_QUOTES, 'UTF-8');
        $decoded = json_decode($html_decoded, true);
        if (is_array($decoded)) return $decoded;

        $clean = preg_replace('/[\x00-\x1F\x7F]/u', '', $unslashed);
        $decoded = json_decode($clean, true);
        if (is_array($decoded)) return $decoded;

        return array();
    }

    private static function parse_report_data($post) {
        if (is_numeric($post)) {
            $post = get_post($post);
        }
        if (!$post) {
            return array();
        }

        $id = $post->ID;
        $created_at = get_post_meta($id, '_eva_report_created_at', true) ?: $post->post_date;
        $score_raw = get_post_meta($id, '_eva_report_score', true);
        $score = ($score_raw === '' || $score_raw === false || $score_raw === null) ? 0 : floatval($score_raw);

        $student_raw = get_post_meta($id, '_eva_report_student', true);
        $student = self::safe_json_decode($student_raw);

        $payload_raw = get_post_meta($id, '_eva_report_payload', true);
        $payload = self::safe_json_decode($payload_raw);
        if (empty($payload) && !empty($post->post_content)) {
            $payload = self::safe_json_decode($post->post_content);
        }

        $student_name = !empty($student['name']) ? $student['name'] : (!empty($payload['student']['name']) ? $payload['student']['name'] : 'Sin nombre');
        $student_email = !empty($student['email']) ? $student['email'] : (!empty($payload['student']['email']) ? $payload['student']['email'] : '-');
        $student_group = !empty($student['group']) ? $student['group'] : (!empty($payload['student']['group']) ? $payload['student']['group'] : '-');
        $student_subject = !empty($student['subject']) ? $student['subject'] : (!empty($payload['student']['subject']) ? $payload['student']['subject'] : '-');

        $detail = isset($payload['detail']) && is_array($payload['detail']) ? $payload['detail'] : array();

        $classic_cov = get_post_meta($id, '_eva_report_classic_cov', true) ?: ($detail['classicCoverage'] ?? 0);
        $student_cov = get_post_meta($id, '_eva_report_student_cov', true) ?: ($detail['studentCoverage'] ?? 0);
        $has_class = get_post_meta($id, '_eva_report_has_class', true) ?: (!empty($detail['hasClass']) ? 'Sí' : 'No');
        $has_randomize = get_post_meta($id, '_eva_report_has_randomize', true) ?: (!empty($detail['hasRandomize']) ? 'Sí' : 'No');
        $final_reason = get_post_meta($id, '_eva_report_final_reason', true) ?: ($detail['finalReason'] ?? ($payload['feedback'] ?? '-'));
        $classic_tr = get_post_meta($id, '_eva_report_classic_transcript', true) ?: ($detail['classicTranscript'] ?? '');
        $student_tr = get_post_meta($id, '_eva_report_student_transcript', true) ?: ($detail['studentTranscript'] ?? '');
        $testbench = get_post_meta($id, '_eva_report_testbench', true) ?: ($detail['testbench'] ?? '');

        return array(
            'id' => $id,
            'created_at' => $created_at,
            'student_name' => $student_name,
            'student_email' => $student_email,
            'student_group' => $student_group,
            'student_subject' => $student_subject,
            'score' => $score,
            'classic_cov' => floatval($classic_cov),
            'student_cov' => floatval($student_cov),
            'has_class' => $has_class,
            'has_randomize' => $has_randomize,
            'final_reason' => $final_reason,
            'classic_transcript' => $classic_tr,
            'student_transcript' => $student_tr,
            'testbench' => $testbench,
            'raw_payload' => $payload
        );
    }

    private static function filter_and_sort_reports($all_posts, $params) {
        $date_from    = isset($params['date_from']) ? sanitize_text_field(trim($params['date_from'])) : '';
        $date_to      = isset($params['date_to']) ? sanitize_text_field(trim($params['date_to'])) : '';
        $time_from    = isset($params['time_from']) ? sanitize_text_field(trim($params['time_from'])) : '';
        $time_to      = isset($params['time_to']) ? sanitize_text_field(trim($params['time_to'])) : '';
        $group_filter = isset($params['group_filter']) ? sanitize_text_field(trim($params['group_filter'])) : '';
        $score_filter = isset($params['score_filter']) ? sanitize_text_field(trim($params['score_filter'])) : '';
        $search_query = isset($params['s']) ? sanitize_text_field(trim($params['s'])) : '';
        $orderby      = isset($params['orderby']) ? sanitize_text_field(trim($params['orderby'])) : 'date_desc';

        if (strlen($time_from) === 5) $time_from .= ':00';
        if (strlen($time_to) === 5) $time_to .= ':59';

        $filtered = array();

        foreach ($all_posts as $post) {
            $data = self::parse_report_data($post);

            $post_date_only = substr($data['created_at'], 0, 10);
            if ($date_from !== '' && $post_date_only < $date_from) continue;
            if ($date_to !== '' && $post_date_only > $date_to) continue;

            $post_time_only = strlen($data['created_at']) >= 19 ? substr($data['created_at'], 11, 8) : '';
            if ($time_from !== '' && $post_time_only !== '' && $post_time_only < $time_from) continue;
            if ($time_to !== '' && $post_time_only !== '' && $post_time_only > $time_to) continue;

            if ($group_filter !== '' && strtolower($data['student_group']) !== strtolower($group_filter)) continue;

            if ($score_filter === 'passed' && $data['score'] < 5) continue;
            if ($score_filter === 'failed' && $data['score'] >= 5) continue;
            if ($score_filter === 'perfect' && $data['score'] < 9.9) continue;

            if ($search_query !== '') {
                $haystack = strtolower(implode(' ', array(
                    $data['student_name'],
                    $data['student_email'],
                    $data['student_group'],
                    $data['student_subject'],
                    $data['final_reason'],
                    $data['id']
                )));
                if (strpos($haystack, strtolower($search_query)) === false) continue;
            }

            $filtered[] = $data;
        }

        usort($filtered, function($a, $b) use ($orderby) {
            switch ($orderby) {
                case 'date_asc':
                    return strcmp($a['created_at'], $b['created_at']);
                case 'score_desc':
                    if ($a['score'] === $b['score']) return strcmp($b['created_at'], $a['created_at']);
                    return ($b['score'] - $a['score']) > 0 ? 1 : -1;
                case 'score_asc':
                    if ($a['score'] === $b['score']) return strcmp($a['created_at'], $b['created_at']);
                    return ($a['score'] - $b['score']) > 0 ? 1 : -1;
                case 'name_asc':
                    return strcasecmp($a['student_name'], $b['student_name']);
                case 'date_desc':
                default:
                    return strcmp($b['created_at'], $a['created_at']);
            }
        });

        return $filtered;
    }

    public static function handle_admin_actions() {
        if (!isset($_GET['page']) || $_GET['page'] !== 'evaluacion-rcsg-cg-reports') {
            return;
        }
        $action = isset($_GET['action']) ? sanitize_text_field($_GET['action']) : '';
        if (empty($action)) {
            return;
        }
        if (!current_user_can('manage_options')) {
            wp_die('No tienes permisos suficientes para acceder a esta página.');
        }

        if ($action === 'export_csv') {
            check_admin_referer('eva_rcsg_export_csv_nonce');
            $all_posts = get_posts(array(
                'post_type' => 'eva_rcsg_report',
                'post_status' => 'private',
                'numberposts' => -1
            ));
            $reports = self::filter_and_sort_reports($all_posts, $_GET);
            $filename = 'resumen_evaluacion_rcsg_cg_' . date('Y-m-d_H-i') . '.csv';

            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Pragma: no-cache');
            header('Expires: 0');
            echo "\xEF\xBB\xBF";

            $output = fopen('php://output', 'w');
            fputcsv($output, array(
                'ID Reporte',
                'Fecha Registro',
                'Nombre Alumno',
                'Correo Institucional',
                'Grupo',
                'Asignatura',
                'Puntuacion (0-10)',
                'Cobertura Clasica (%)',
                'Cobertura Alumno RCSG (%)',
                'Define Clase (Si/No)',
                'Ejecuta Randomize (Si/No)',
                'Motivo / Evaluacion'
            ));

            foreach ($reports as $data) {
                fputcsv($output, array(
                    $data['id'],
                    $data['created_at'],
                    $data['student_name'],
                    $data['student_email'],
                    $data['student_group'],
                    $data['student_subject'],
                    $data['score'],
                    $data['classic_cov'],
                    $data['student_cov'],
                    $data['has_class'],
                    $data['has_randomize'],
                    $data['final_reason']
                ));
            }
            fclose($output);
            exit;
        }

        if ($action === 'export_all_json') {
            check_admin_referer('eva_rcsg_export_json_nonce');
            $all_posts = get_posts(array(
                'post_type' => 'eva_rcsg_report',
                'post_status' => 'private',
                'numberposts' => -1
            ));
            $reports = self::filter_and_sort_reports($all_posts, $_GET);
            $export_data = array();
            foreach ($reports as $r) {
                $export_data[] = array(
                    'id' => $r['id'],
                    'created_at' => $r['created_at'],
                    'student' => array(
                        'name' => $r['student_name'],
                        'email' => $r['student_email'],
                        'group' => $r['student_group'],
                        'subject' => $r['student_subject']
                    ),
                    'score' => $r['score'],
                    'detail' => array(
                        'classicCoverage' => $r['classic_cov'],
                        'studentCoverage' => $r['student_cov'],
                        'hasClass' => $r['has_class'] === 'Sí',
                        'hasRandomize' => $r['has_randomize'] === 'Sí',
                        'finalReason' => $r['final_reason'],
                        'classicTranscript' => $r['classic_transcript'],
                        'studentTranscript' => $r['student_transcript'],
                        'testbench' => $r['testbench']
                    ),
                    'raw_payload' => $r['raw_payload']
                );
            }

            $filename = 'reportes_evaluacion_rcsg_cg_' . date('Y-m-d_H-i') . '.json';
            header('Content-Type: application/json; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Pragma: no-cache');
            header('Expires: 0');
            echo wp_json_encode($export_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'export_single_json') {
            check_admin_referer('eva_rcsg_export_single_json_nonce');
            $report_id = isset($_GET['report_id']) ? intval($_GET['report_id']) : 0;
            if ($report_id <= 0) {
                wp_die('ID de reporte inválido.');
            }
            $post = get_post($report_id);
            if (!$post || $post->post_type !== 'eva_rcsg_report') {
                wp_die('Reporte no encontrado.');
            }
            $r = self::parse_report_data($post);
            $single_data = array(
                'id' => $r['id'],
                'created_at' => $r['created_at'],
                'student' => array(
                    'name' => $r['student_name'],
                    'email' => $r['student_email'],
                    'group' => $r['student_group'],
                    'subject' => $r['student_subject']
                ),
                'score' => $r['score'],
                'detail' => array(
                    'classicCoverage' => $r['classic_cov'],
                    'studentCoverage' => $r['student_cov'],
                    'hasClass' => $r['has_class'] === 'Sí',
                    'hasRandomize' => $r['has_randomize'] === 'Sí',
                    'finalReason' => $r['final_reason'],
                    'classicTranscript' => $r['classic_transcript'],
                    'studentTranscript' => $r['student_transcript'],
                    'testbench' => $r['testbench']
                ),
                'raw_payload' => $r['raw_payload']
            );

            $filename = 'reporte_evaluacion_rcsg_cg_' . $report_id . '.json';
            header('Content-Type: application/json; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Pragma: no-cache');
            header('Expires: 0');
            echo wp_json_encode($single_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'delete_single_report') {
            check_admin_referer('eva_rcsg_delete_single_nonce');
            $report_id = isset($_GET['report_id']) ? intval($_GET['report_id']) : 0;
            if ($report_id > 0) {
                wp_delete_post($report_id, true);
            }
            $redirect_url = remove_query_arg(array('action', 'report_id', '_wpnonce'), wp_get_referer() ?: admin_url('admin.php?page=evaluacion-rcsg-cg-reports'));
            $redirect_url = add_query_arg('eva_msg', 'deleted_single', $redirect_url);
            wp_redirect($redirect_url);
            exit;
        }

        if ($action === 'delete_filtered_reports') {
            check_admin_referer('eva_rcsg_delete_filtered_nonce');
            $all_posts = get_posts(array(
                'post_type' => 'eva_rcsg_report',
                'post_status' => 'private',
                'numberposts' => -1
            ));
            $reports = self::filter_and_sort_reports($all_posts, $_GET);
            $deleted_count = 0;
            foreach ($reports as $r) {
                if (!empty($r['id'])) {
                    wp_delete_post($r['id'], true);
                    $deleted_count++;
                }
            }
            $redirect_url = remove_query_arg(array('action', '_wpnonce'), admin_url('admin.php?page=evaluacion-rcsg-cg-reports'));
            $redirect_url = add_query_arg(array('eva_msg' => 'deleted_filtered', 'count' => $deleted_count), $redirect_url);
            wp_redirect($redirect_url);
            exit;
        }
    }

    public static function render_admin_page() {
        if (!current_user_can('manage_options')) {
            wp_die('No tienes permisos suficientes para acceder a esta página.');
        }

        $all_posts = get_posts(array(
            'post_type' => 'eva_rcsg_report',
            'post_status' => 'private',
            'numberposts' => -1
        ));

        $available_groups = array();
        foreach ($all_posts as $p) {
            $parsed = self::parse_report_data($p);
            if (!empty($parsed['student_group']) && $parsed['student_group'] !== '-') {
                $available_groups[$parsed['student_group']] = true;
            }
        }
        $available_groups = array_keys($available_groups);
        sort($available_groups);

        $filtered_reports = self::filter_and_sort_reports($all_posts, $_GET);

        $count_reports = count($filtered_reports);
        $total_score = 0;
        $count_passed = 0;
        foreach ($filtered_reports as $r) {
            $total_score += $r['score'];
            if ($r['score'] >= 5) {
                $count_passed++;
            }
        }
        $avg_score = $count_reports > 0 ? round($total_score / $count_reports, 2) : 0;

        $csv_args = array_merge(array(
            'page' => 'evaluacion-rcsg-cg-reports',
            'action' => 'export_csv'
        ), $_GET);
        unset($csv_args['_wpnonce']);
        $export_url = wp_nonce_url(add_query_arg($csv_args, admin_url('admin.php')), 'eva_rcsg_export_csv_nonce');

        $json_args = array_merge(array(
            'page' => 'evaluacion-rcsg-cg-reports',
            'action' => 'export_all_json'
        ), $_GET);
        unset($json_args['_wpnonce']);
        $export_json_url = wp_nonce_url(add_query_arg($json_args, admin_url('admin.php')), 'eva_rcsg_export_json_nonce');

        $purge_args = array_merge(array(
            'page' => 'evaluacion-rcsg-cg-reports',
            'action' => 'delete_filtered_reports'
        ), $_GET);
        unset($purge_args['_wpnonce']);
        $purge_filtered_url = wp_nonce_url(add_query_arg($purge_args, admin_url('admin.php')), 'eva_rcsg_delete_filtered_nonce');

        $date_from    = isset($_GET['date_from']) ? sanitize_text_field($_GET['date_from']) : '';
        $date_to      = isset($_GET['date_to']) ? sanitize_text_field($_GET['date_to']) : '';
        $time_from    = isset($_GET['time_from']) ? sanitize_text_field($_GET['time_from']) : '';
        $time_to      = isset($_GET['time_to']) ? sanitize_text_field($_GET['time_to']) : '';
        $group_filter = isset($_GET['group_filter']) ? sanitize_text_field($_GET['group_filter']) : '';
        $score_filter = isset($_GET['score_filter']) ? sanitize_text_field($_GET['score_filter']) : '';
        $search_query = isset($_GET['s']) ? sanitize_text_field($_GET['s']) : '';
        $orderby      = isset($_GET['orderby']) ? sanitize_text_field($_GET['orderby']) : 'date_desc';

        ?>
        <div class="wrap" style="max-width: 1400px;">
            <h1 class="wp-heading-inline" style="font-weight:700; color:#1d2327;">Panel de Evaluación RCSG-CG (Verificación Funcional)</h1>
            <div style="display:inline-block; margin-left: 15px;">
                <a href="<?php echo esc_url($export_url); ?>" class="page-title-action button-primary" style="background:#1363df; border-color:#1363df; font-weight:bold; padding: 6px 14px; border-radius: 6px; margin-right: 6px;">
                    📥 Descargar Resumen CSV (Filtro Activo)
                </a>
                <a href="<?php echo esc_url($export_json_url); ?>" class="page-title-action button-secondary" style="background:#0f172a; color:#38bdf8; border-color:#1e293b; font-weight:bold; padding: 6px 14px; border-radius: 6px; margin-right: 6px;">
                    📥 Descargar JSON Completo (Filtro Activo)
                </a>
                <a href="<?php echo esc_url($purge_filtered_url); ?>" class="page-title-action button-secondary" style="background:#b91c1c; color:#fff; border-color:#991b1b; font-weight:bold; padding: 6px 14px; border-radius: 6px;" onclick="return confirm('⚠️ ¿Estás seguro de que deseas ELIMINAR PERMANENTEMENTE las <?php echo $count_reports; ?> entregas filtradas? Te recomendamos haber descargado primero el respaldo en CSV o JSON.');">
                    🗑️ Purgar Entregas Filtradas (<?php echo $count_reports; ?>)
                </a>
            </div>
            <hr class="wp-header-end">

            <?php if (isset($_GET['eva_msg']) && $_GET['eva_msg'] === 'deleted_single'): ?>
                <div class="notice notice-success is-dismissible" style="border-radius: 8px; margin-top: 15px;"><p><strong>✓ Entrega eliminada correctamente.</strong></p></div>
            <?php endif; ?>
            <?php if (isset($_GET['eva_msg']) && $_GET['eva_msg'] === 'deleted_filtered'): ?>
                <div class="notice notice-warning is-dismissible" style="border-radius: 8px; margin-top: 15px;"><p><strong>🧹 Se han purgado y eliminado permanentemente <?php echo intval($_GET['count'] ?? 0); ?> entregas.</strong></p></div>
            <?php endif; ?>

            <!-- Tarjetas de Estadísticas -->
            <div style="display: flex; gap: 16px; margin: 20px 0; flex-wrap: wrap;">
                <div class="card" style="flex: 1; min-width: 200px; padding: 18px; margin:0; border-radius:12px; border-left: 5px solid #1363df; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
                    <h3 style="margin:0 0 6px; color:#64748b; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Entregas RCSG-CG</h3>
                    <p style="font-size:32px; font-weight:800; margin:0; color:#1363df;"><?php echo $count_reports; ?> <span style="font-size:14px; font-weight:normal; color:#64748b;">(de <?php echo count($all_posts); ?> totales)</span></p>
                </div>
                <div class="card" style="flex: 1; min-width: 200px; padding: 18px; margin:0; border-radius:12px; border-left: 5px solid #2e7d32; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
                    <h3 style="margin:0 0 6px; color:#64748b; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Nota Media</h3>
                    <p style="font-size:32px; font-weight:800; margin:0; color:#2e7d32;"><?php echo $avg_score; ?> / 10</p>
                </div>
                <div class="card" style="flex: 1; min-width: 200px; padding: 18px; margin:0; border-radius:12px; border-left: 5px solid #0288d1; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
                    <h3 style="margin:0 0 6px; color:#64748b; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Tasa de Aprobados (>= 5)</h3>
                    <p style="font-size:32px; font-weight:800; margin:0; color:#0288d1;"><?php echo $count_passed; ?> <span style="font-size:16px; font-weight:normal;">(<?php echo $count_reports > 0 ? round(($count_passed / $count_reports) * 100, 1) : 0; ?>%)</span></p>
                </div>
            </div>

            <!-- Panel de Control y Filtros -->
            <div class="card" style="padding: 18px 22px; border-radius: 12px; margin-bottom: 20px; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
                <form id="eva-filter-form" method="get" style="display: flex; flex-direction: column; gap: 14px;">
                    <input type="hidden" name="page" value="evaluacion-rcsg-cg-reports">

                    <!-- Fila 1: Filtros de Fecha -->
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                        <span style="font-weight: 600; color: #334155; min-width: 130px;">📅 Rango de Fecha:</span>
                        <label style="font-size: 13px; color: #475569;">Desde:
                            <input type="date" id="eva-date-from" name="date_from" value="<?php echo esc_attr($date_from); ?>" style="border-radius: 6px; border: 1px solid #cbd5e1; padding: 4px 8px;">
                        </label>
                        <label style="font-size: 13px; color: #475569;">Hasta:
                            <input type="date" id="eva-date-to" name="date_to" value="<?php echo esc_attr($date_to); ?>" style="border-radius: 6px; border: 1px solid #cbd5e1; padding: 4px 8px;">
                        </label>

                        <div style="display: flex; gap: 6px; margin-left: 10px; flex-wrap: wrap;">
                            <button type="button" class="button button-secondary" onclick="setDateFilter('today')">Hoy</button>
                            <button type="button" class="button button-secondary" onclick="setDateFilter('7days')">Últimos 7 días</button>
                            <button type="button" class="button button-secondary" onclick="setDateFilter('30days')">Últimos 30 días</button>
                            <button type="button" class="button button-secondary" onclick="setDateFilter('this_month')">Este Mes</button>
                            <button type="button" class="button button-secondary" onclick="setDateFilter('all')">Todas las Fechas</button>
                        </div>
                    </div>

                    <!-- Fila 2: Filtro Horario -->
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                        <span style="font-weight: 600; color: #334155; min-width: 130px;">⏰ Horario de Clase:</span>
                        <label style="font-size: 13px; color: #475569;">Hora Inicio:
                            <input type="time" id="eva-time-from" name="time_from" value="<?php echo esc_attr($time_from); ?>" style="border-radius: 6px; border: 1px solid #cbd5e1; padding: 4px 8px;">
                        </label>
                        <label style="font-size: 13px; color: #475569;">Hora Fin:
                            <input type="time" id="eva-time-to" name="time_to" value="<?php echo esc_attr($time_to); ?>" style="border-radius: 6px; border: 1px solid #cbd5e1; padding: 4px 8px;">
                        </label>

                        <div style="display: flex; gap: 6px; margin-left: 10px; flex-wrap: wrap;">
                            <button type="button" class="button button-primary" style="background:#1363df; border-color:#1363df; font-weight:600;" onclick="setTimeFilter('10:15', '12:15')">⭐ Clase (10:15 - 12:15)</button>
                            <button type="button" class="button button-secondary" onclick="setTimeFilter('08:30', '11:30')">Turno Mañana (08:30 - 11:30)</button>
                            <button type="button" class="button button-secondary" onclick="setTimeFilter('11:30', '14:30')">Turno Mediodía (11:30 - 14:30)</button>
                            <button type="button" class="button button-secondary" onclick="setTimeFilter('15:00', '18:00')">Turno Tarde (15:00 - 18:00)</button>
                            <button type="button" class="button button-secondary" onclick="setTimeFilter('', '')">Limpiar Horas</button>
                        </div>
                    </div>

                    <!-- Fila 3: Filtros Adicionales -->
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px;">
                        <label style="font-size: 13px; color: #475569; font-weight: 500;">Grupo:
                            <select name="group_filter" style="border-radius: 6px; border: 1px solid #cbd5e1;">
                                <option value="">-- Todos los Grupos --</option>
                                <?php foreach ($available_groups as $g): ?>
                                    <option value="<?php echo esc_attr($g); ?>" <?php selected($group_filter, $g); ?>><?php echo esc_html($g); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </label>

                        <label style="font-size: 13px; color: #475569; font-weight: 500;">Calificación:
                            <select name="score_filter" style="border-radius: 6px; border: 1px solid #cbd5e1;">
                                <option value="" <?php selected($score_filter, ''); ?>>-- Todas las notas --</option>
                                <option value="passed" <?php selected($score_filter, 'passed'); ?>>Aprobados (>= 5)</option>
                                <option value="failed" <?php selected($score_filter, 'failed'); ?>>Suspensos (< 5)</option>
                                <option value="perfect" <?php selected($score_filter, 'perfect'); ?>>Perfecto (10 / 10)</option>
                            </select>
                        </label>

                        <label style="font-size: 13px; color: #475569; font-weight: 500;">Ordenar por:
                            <select name="orderby" style="border-radius: 6px; border: 1px solid #cbd5e1;">
                                <option value="date_desc" <?php selected($orderby, 'date_desc'); ?>>📅 Fecha (recientes primero)</option>
                                <option value="date_asc" <?php selected($orderby, 'date_asc'); ?>>📅 Fecha (antiguas primero)</option>
                                <option value="score_desc" <?php selected($orderby, 'score_desc'); ?>>⭐ Nota (mayor a menor)</option>
                                <option value="score_asc" <?php selected($orderby, 'score_asc'); ?>>⭐ Nota (menor a mayor)</option>
                                <option value="name_asc" <?php selected($orderby, 'name_asc'); ?>>🔤 Alumno (A-Z)</option>
                            </select>
                        </label>

                        <label style="font-size: 13px; color: #475569; font-weight: 500; flex: 1; min-width: 220px;">Búsqueda:
                            <input type="search" name="s" value="<?php echo esc_attr($search_query); ?>" placeholder="Buscar por alumno, correo o motivo..." style="width: 100%; border-radius: 6px; border: 1px solid #cbd5e1;">
                        </label>

                        <div style="display: flex; gap: 8px; margin-top: 4px;">
                            <input type="submit" class="button button-primary" value="🔍 Filtrar" style="border-radius: 6px; font-weight: 600;">
                            <a href="<?php echo esc_url(admin_url('admin.php?page=evaluacion-rcsg-cg-reports')); ?>" class="button button-secondary" style="border-radius: 6px;">Limpiar Todos los Filtros</a>
                        </div>
                    </div>
                </form>
            </div>

            <script>
            function setDateFilter(preset) {
                const today = new Date();
                const formatDate = (d) => {
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                };

                const fromInput = document.getElementById('eva-date-from');
                const toInput = document.getElementById('eva-date-to');
                const form = document.getElementById('eva-filter-form');

                if (preset === 'all') {
                    fromInput.value = '';
                    toInput.value = '';
                } else if (preset === 'today') {
                    fromInput.value = formatDate(today);
                    toInput.value = formatDate(today);
                } else if (preset === '7days') {
                    const d = new Date();
                    d.setDate(d.getDate() - 7);
                    fromInput.value = formatDate(d);
                    toInput.value = formatDate(today);
                } else if (preset === '30days') {
                    const d = new Date();
                    d.setDate(d.getDate() - 30);
                    fromInput.value = formatDate(d);
                    toInput.value = formatDate(today);
                } else if (preset === 'this_month') {
                    const d = new Date(today.getFullYear(), today.getMonth(), 1);
                    fromInput.value = formatDate(d);
                    toInput.value = formatDate(today);
                }
                form.submit();
            }

            function setTimeFilter(fromStr, toStr) {
                document.getElementById('eva-time-from').value = fromStr;
                document.getElementById('eva-time-to').value = toStr;
                document.getElementById('eva-filter-form').submit();
            }
            </script>

            <table class="wp-list-table widefat fixed striped posts" style="border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
                <thead>
                    <tr>
                        <th style="width: 55px; text-align: center;">ID</th>
                        <th style="width: 140px;">Fecha / Hora</th>
                        <th style="width: 190px;">Alumno</th>
                        <th style="width: 70px;">Grupo</th>
                        <th style="width: 90px;">Asignatura</th>
                        <th style="width: 110px; text-align: center;">Cob. Clásica</th>
                        <th style="width: 120px; text-align: center;">Cob. Alumno RCSG</th>
                        <th style="width: 80px; text-align: center;">Sintaxis Class</th>
                        <th style="width: 85px; text-align: center;">Nota</th>
                        <th>Motivo y Detalles</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($filtered_reports)): ?>
                        <tr>
                            <td colspan="10" style="padding: 20px; text-align: center; color: #64748b;">No se encontraron entregas que coincidan con los criterios seleccionados.</td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($filtered_reports as $data):
                            $badge_color = ($data['score'] >= 9) ? '#2e7d32' : (($data['score'] >= 5) ? '#ed6c02' : '#d32f2f');
                            $single_json_url = wp_nonce_url(admin_url('admin.php?page=evaluacion-rcsg-cg-reports&action=export_single_json&report_id=' . $data['id']), 'eva_rcsg_export_single_json_nonce');
                            $single_delete_url = wp_nonce_url(admin_url('admin.php?page=evaluacion-rcsg-cg-reports&action=delete_single_report&report_id=' . $data['id']), 'eva_rcsg_delete_single_nonce');
                        ?>
                            <tr>
                                <td style="text-align: center;"><strong>#<?php echo esc_html($data['id']); ?></strong></td>
                                <td><span style="font-size: 12px; color: #475569;"><?php echo esc_html($data['created_at']); ?></span></td>
                                <td>
                                    <strong style="color: #1e293b;"><?php echo esc_html($data['student_name']); ?></strong><br>
                                    <small style="color:#64748b; font-size:11px;"><?php echo esc_html($data['student_email']); ?></small>
                                </td>
                                <td><span class="badge" style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:600; color:#334155;"><?php echo esc_html($data['student_group']); ?></span></td>
                                <td><?php echo esc_html($data['student_subject']); ?></td>
                                <td style="text-align: center;">
                                    <span style="font-size:12px; font-weight:600; color:#475569;">
                                        <?php echo number_format($data['classic_cov'], 2); ?>%
                                    </span>
                                </td>
                                <td style="text-align: center;">
                                    <span style="font-size:12px; font-weight:700; color:<?php echo ($data['student_cov'] >= $data['classic_cov']) ? '#2e7d32' : '#d32f2f'; ?>;">
                                        <?php echo number_format($data['student_cov'], 2); ?>%
                                    </span>
                                </td>
                                <td style="text-align: center;">
                                    <span style="font-size:11px; background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-weight:600;">
                                        Class: <?php echo esc_html($data['has_class']); ?>
                                    </span>
                                </td>
                                <td style="text-align: center;">
                                    <span style="display:inline-block; padding:4px 10px; border-radius:12px; background:<?php echo $badge_color; ?>; color:#fff; font-weight:bold; font-size:13px;">
                                        <?php echo esc_html($data['score']); ?>/10
                                    </span>
                                </td>
                                <td>
                                    <div style="font-size:12px; color:#334155; margin-bottom: 4px;"><?php echo esc_html($data['final_reason']); ?></div>

                                    <div style="display:flex; gap:6px; margin:6px 0; flex-wrap:wrap; align-items:center;">
                                        <a href="<?php echo esc_url($single_json_url); ?>" class="button button-small" style="font-size:11px; background:#0f172a; color:#38bdf8; border-color:#1e293b; font-weight:600; border-radius:4px;">
                                            📥 Descargar JSON (#<?php echo esc_html($data['id']); ?>)
                                        </a>
                                        <a href="<?php echo esc_url($single_delete_url); ?>" class="button button-small" style="font-size:11px; background:#ef4444; color:#fff; border-color:#dc2626; font-weight:600; border-radius:4px;" onclick="return confirm('⚠️ ¿Eliminar permanentemente el reporte #<?php echo esc_js($data['id']); ?> de <?php echo esc_js($data['student_name']); ?>?');">
                                            🗑️ Eliminar (#<?php echo esc_html($data['id']); ?>)
                                        </a>
                                    </div>

                                    <details style="margin-top: 4px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px;">
                                        <summary style="font-size: 11px; cursor: pointer; color: #1363df; font-weight: 600;">🔍 Ver Testbench y Comparativa de Transcripts</summary>
                                        <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 8px;">
                                            <?php if (!empty($data['testbench'])): ?>
                                                <div>
                                                    <strong style="font-size: 11px; color: #475569;">Código Testbench Alumno:</strong>
                                                    <pre style="background: #1e293b; color: #f8fafc; padding: 8px; border-radius: 4px; font-size: 11px; max-height: 180px; overflow: auto; margin: 4px 0;"><?php echo esc_html($data['testbench']); ?></pre>
                                                </div>
                                            <?php endif; ?>
                                            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                                <div style="flex: 1; min-width: 280px;">
                                                    <strong style="font-size: 11px; color: #475569;">Transcript Clásico (Sin CG_ENABLE):</strong>
                                                    <pre style="background: #0f172a; color: #94a3b8; padding: 8px; border-radius: 4px; font-size: 11px; max-height: 220px; overflow: auto; margin: 4px 0; white-space: pre; word-break: normal;"><?php echo esc_html($data['classic_transcript']); ?></pre>
                                                </div>
                                                <div style="flex: 1; min-width: 280px;">
                                                    <strong style="font-size: 11px; color: #475569;">Transcript Alumno (Con CG_ENABLE):</strong>
                                                    <pre style="background: #0f172a; color: #38bdf8; padding: 8px; border-radius: 4px; font-size: 11px; max-height: 220px; overflow: auto; margin: 4px 0; white-space: pre; word-break: normal;"><?php echo esc_html($data['student_transcript']); ?></pre>
                                                </div>
                                            </div>
                                        </div>
                                    </details>

                                    <details style="margin-top: 4px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 8px;">
                                        <summary style="font-size: 11px; cursor: pointer; color: #475569; font-weight: 600;">📄 Ver Reporte JSON Crudo</summary>
                                        <pre style="background: #0f172a; color: #a5f3fc; padding: 8px; border-radius: 4px; font-size: 11px; max-height: 200px; overflow: auto; margin: 4px 0;"><?php echo esc_html(wp_json_encode($data['raw_payload'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)); ?></pre>
                                    </details>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
        <?php
    }
}

EvaluacionRcsgCgPlugin::init();
