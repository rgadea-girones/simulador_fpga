<?php
/**
 * Plugin Name: Evaluacion Aserciones
 * Description: Evaluacion automatica de contadores up/down modulo 13 con identificacion de alumno, transcript y correccion por evidencia.
 * Version: 1.0.0
 * Author: Antigravity
 */

if (!defined('ABSPATH')) {
    exit;
}

class EvaluacionAsercionesPlugin {
    public static function init() {
        add_shortcode('evaluacion_aserciones', array(__CLASS__, 'render_shortcode'));
        add_action('init', array(__CLASS__, 'register_content_type'));
        add_action('rest_api_init', array(__CLASS__, 'register_rest_routes'));
        add_action('admin_menu', array(__CLASS__, 'register_admin_menu'));
        add_action('admin_init', array(__CLASS__, 'handle_admin_exports'));
    }

    public static function register_content_type() {
        register_post_type('eva_report', array(
            'labels' => array(
                'name' => 'Eva Reports',
                'singular_name' => 'Eva Report'
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

    private static function get_task_bank() {
      return array_slice(array(
            array(
                'id' => 'E1',
                'title' => 'Contador A con terminal_count_en mal',
                'summary' => 'Comparar dos contadores up/down modulo 13 con enable, updown, reset_n y areset_n.',
                'truth' => 'a_bad_b_ok',
                'transcript_lines' => array(
                    '[E1][stimulus] enable=0 updown=1 reset_n=1 areset_n=1 count_ref=12',
                    '[E1][A] count=12 terminal_count_en=1 terminal_count_free=1 -> MISMATCH: terminal_count_en no depende de enable.',
                    '[E1][B] count=12 terminal_count_en=0 terminal_count_free=1 -> OK.',
                    '[E1][checker] Decision: solo el contador A es erroneo.'
                ),
                'counter_a' => <<<'SV'
module up_down_counter_a(
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
  assign terminal_count_en = terminal_count_free;
endmodule
SV,
                'counter_b' => <<<'SV'
module up_down_counter_b(
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
                'explanation' => 'A falla porque terminal_count_en no respeta enable; B es correcta.'
            ),
            array(
                'id' => 'E2',
              'title' => 'Contador B ignora enable en el conteo',
              'summary' => 'Uno de los contadores cambia count incluso cuando enable=0.',
                'truth' => 'a_ok_b_bad',
                'transcript_lines' => array(
                '[E2][stimulus] enable=0 updown=1 reset_n=1 areset_n=1 count_ref=6',
                '[E2][A] count=6 terminal_count_en=0 terminal_count_free=0 -> OK.',
                '[E2][B] count=7 terminal_count_en=0 terminal_count_free=0 -> MISMATCH: count cambia con enable=0.',
                    '[E2][checker] Decision: solo el contador B es erroneo.'
                ),
                'counter_a' => <<<'SV'
module up_down_counter_a(
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
                'counter_b' => <<<'SV'
module up_down_counter_b(
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
    else begin
      if (updown) count <= (count == 4'd12) ? 4'd0 : count + 4'd1;
      else count <= (count == 4'd0) ? 4'd12 : count - 4'd1;
    end
  end
  assign terminal_count_free = (updown && (count == 4'd12)) || (!updown && (count == 4'd0));
  assign terminal_count_en = enable && terminal_count_free;
endmodule
SV,
                'explanation' => 'A respeta enable; B cuenta aun con enable=0.'
            ),
            array(
                'id' => 'E3',
                'title' => 'Dos contadores correctos',
                'summary' => 'Ambos contadores respetan enable y los dos resets; la cuenta modulo 13 es correcta.',
                'truth' => 'both_ok',
                'transcript_lines' => array(
                    '[E3][stimulus] enable=1 updown=1 reset_n=1 areset_n=1 count_ref=11',
                    '[E3][A] count=12 terminal_count_en=1 terminal_count_free=1 -> OK.',
                    '[E3][B] count=12 terminal_count_en=1 terminal_count_free=1 -> OK.',
                    '[E3][checker] Decision: los dos contadores son correctos.'
                ),
                'counter_a' => <<<'SV'
module up_down_counter_a(
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
                'counter_b' => <<<'SV'
module up_down_counter_b(
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
                'explanation' => 'Ambos contadores cumplen la especificacion.'
            ),
            array(
                'id' => 'E4',
                'title' => 'Ambos contadores defectuosos',
              'summary' => 'Un fallo afecta terminal_count_free y el otro rompe el modulo 13 (cuenta hasta 13).',
                'truth' => 'both_bad',
                'transcript_lines' => array(
                '[E4][stimulus] fase1: enable=0 updown=1 reset_n=1 areset_n=1 count_ref=12; fase2: enable=1 updown=1 reset_n=1 areset_n=1 count_ref=12',
                    '[E4][A] count=12 terminal_count_en=0 terminal_count_free=0 -> MISMATCH: terminal_count_free depende de enable.',
                '[E4][B] count=13 terminal_count_en=0 terminal_count_free=0 -> MISMATCH: el contador sale del rango 0..12.',
                    '[E4][checker] Decision: ambos contadores son erroneos.'
                ),
                'counter_a' => <<<'SV'
module up_down_counter_a(
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
  assign terminal_count_free = enable && ((updown && (count == 4'd12)) || (!updown && (count == 4'd0)));
  assign terminal_count_en = enable && terminal_count_free;
endmodule
SV,
                'counter_b' => <<<'SV'
module up_down_counter_b(
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
      if (updown) count <= (count == 4'd13) ? 4'd0 : count + 4'd1;
      else count <= (count == 4'd0) ? 4'd13 : count - 4'd1;
    end
  end
  assign terminal_count_free = (count == 4'd13);
  assign terminal_count_en = enable && (count == 4'd13);
endmodule
SV,
                'explanation' => 'A gatea mal terminal_count_free; B viola el modulo 13 y alcanza count=13.'
            ),
            array(
                'id' => 'E5',
                'title' => 'Contador B con direccion up/down invertida',
                'summary' => 'El contador B invierte el sentido cuando updown=1; A es correcto.',
                'truth' => 'a_ok_b_bad',
                'transcript_lines' => array(
                    '[E5][stimulus] enable=1 updown=1 reset_n=1 areset_n=1 count_ref=10',
                    '[E5][A] count=11 terminal_count_en=0 terminal_count_free=0 -> OK.',
                    '[E5][B] count=9 terminal_count_en=0 terminal_count_free=0 -> MISMATCH: updown esta invertido.',
                    '[E5][checker] Decision: solo el contador B es erroneo.'
                ),
                'counter_a' => <<<'SV'
module up_down_counter_a(
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
                'counter_b' => <<<'SV'
module up_down_counter_b(
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
      if (updown) count <= (count == 4'd0) ? 4'd12 : count - 4'd1;
      else count <= (count == 4'd12) ? 4'd0 : count + 4'd1;
    end
  end
  assign terminal_count_free = (updown && (count == 4'd12)) || (!updown && (count == 4'd0));
  assign terminal_count_en = enable && terminal_count_free;
endmodule
SV,
                'explanation' => 'A cumple; B invierte la direccion de conteo.'
            )
          ), 0, 5);
    }

    public static function register_rest_routes() {
        register_rest_route('evaluacion-aserciones/v1', '/reports', array(
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
        $throttle_key = 'eva_submit_' . md5(strtolower($student_email) . '|' . $ip);
        if (get_transient($throttle_key)) {
          return new WP_REST_Response(array(
            'ok' => false,
            'message' => 'Espera 90 segundos antes de enviar otro intento.'
          ), 429);
        }
        set_transient($throttle_key, 1, 90);

        $assignments = isset($payload['assignments']) && is_array($payload['assignments']) ? $payload['assignments'] : array();
        if (empty($assignments) && isset($payload['assignment']) && is_array($payload['assignment'])) {
          $assignments = array($payload['assignment']);
        }
        if (empty($assignments)) {
            return new WP_REST_Response(array(
                'ok' => false,
                'message' => 'No se recibieron asignaciones.'
            ), 400);
        }

        $assignment_nonce = 0;
        if (isset($payload['assignment']) && is_array($payload['assignment'])) {
          $assignment_nonce = isset($payload['assignment']['nonce']) ? intval($payload['assignment']['nonce']) : 0;
        }

        if ($assignment_nonce > 0) {
          $existing = get_posts(array(
            'post_type' => 'eva_report',
            'post_status' => 'private',
            'numberposts' => 1,
            'fields' => 'ids',
            'meta_query' => array(
              'relation' => 'AND',
              array(
                'key' => '_eva_report_student_email',
                'value' => strtolower($student_email),
                'compare' => '='
              ),
              array(
                'key' => '_eva_report_assignment_nonce',
                'value' => $assignment_nonce,
                'compare' => '='
              )
            )
          ));

          if (!empty($existing)) {
            return new WP_REST_Response(array(
              'ok' => false,
              'message' => 'Este intento ya fue registrado para tu identificacion.'
            ), 409);
          }
        }

        $student['name'] = $student_name;
        $student['email'] = $student_email;
        $student['group'] = $student_group;
        $student['subject'] = $student_subject;

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

        $score = isset($payload['score']) ? intval($payload['score']) : 0;
        $report_title = 'Eva Report - ' . $student_label . ' - ' . wp_date('Y-m-d H:i:s');
        $report_id = wp_insert_post(array(
            'post_type' => 'eva_report',
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
        $parse_bool = function($val, $true_lbl = 'Correcto', $false_lbl = 'Incorrecto') {
            if ($val === null || $val === '') return '-';
            if ($val === true || $val === 'true' || $val === 1 || $val === '1') return $true_lbl;
            if ($val === false || $val === 'false' || $val === 0 || $val === '0') return $false_lbl;
            return '-';
        };

        update_post_meta($report_id, '_eva_report_source', 'evaluacion_aserciones');
        update_post_meta($report_id, '_eva_report_payload', wp_json_encode($payload, JSON_UNESCAPED_UNICODE));
        update_post_meta($report_id, '_eva_report_created_at', current_time('mysql'));
        update_post_meta($report_id, '_eva_report_student', wp_json_encode($student, JSON_UNESCAPED_UNICODE));
        update_post_meta($report_id, '_eva_report_student_email', strtolower($student_email));
        update_post_meta($report_id, '_eva_report_assignment_nonce', $assignment_nonce);
        update_post_meta($report_id, '_eva_report_score', $score);

        // Save individual detail meta fields for maximum durability
        update_post_meta($report_id, '_eva_report_selected_correct', $parse_bool($detail['selectedCorrect'] ?? ($payload['selectedCorrect'] ?? null), 'Correcto', 'Incorrecto'));
        update_post_meta($report_id, '_eva_report_expected_correct', $parse_bool($detail['expectedCorrect'] ?? ($payload['expectedCorrect'] ?? null), 'Correcto', 'Incorrecto'));
        update_post_meta($report_id, '_eva_report_decision_matches', $parse_bool($detail['decisionMatchesTruth'] ?? ($payload['decisionMatchesTruth'] ?? null), 'Sí', 'No'));
        update_post_meta($report_id, '_eva_report_attempt_assertions', $parse_bool($detail['assertionAttemptDetected'] ?? ($payload['assertionAttemptDetected'] ?? null), 'Sí', 'No'));
        update_post_meta($report_id, '_eva_report_count_assertions', isset($detail['countRelatedAssertions']) ? intval($detail['countRelatedAssertions']) : 0);
        update_post_meta($report_id, '_eva_report_final_reason', sanitize_text_field((string) ($detail['finalReason'] ?? ($payload['feedback'] ?? ''))));
        update_post_meta($report_id, '_eva_report_transcript', (string) ($detail['transcript'] ?? ($payload['transcript'] ?? '')));
        update_post_meta($report_id, '_eva_report_testbench', (string) ($detail['testbench'] ?? ($payload['testbench'] ?? '')));

        return new WP_REST_Response(array(
            'ok' => true,
            'message' => 'Reporte almacenado.',
            'report_id' => $report_id,
            'report_title' => $report_title
        ), 200);
    }

    private static function enqueue_assets() {
        $css_path = plugin_dir_path(__FILE__) . 'assets/css/evaluacion-aserciones.css';
        $js_path = plugin_dir_path(__FILE__) . 'assets/js/evaluacion-aserciones.js';
        $css_ver = file_exists($css_path) ? filemtime($css_path) : '1.0.0';
        $js_ver = file_exists($js_path) ? filemtime($js_path) : '1.0.0';

        wp_enqueue_style(
            'evaluacion-aserciones-style',
            plugin_dir_url(__FILE__) . 'assets/css/evaluacion-aserciones.css',
            array(),
            $css_ver
        );

        wp_enqueue_script(
            'evaluacion-aserciones-script',
            plugin_dir_url(__FILE__) . 'assets/js/evaluacion-aserciones.js',
            array(),
            $js_ver,
            true
        );

        wp_localize_script('evaluacion-aserciones-script', 'EVALUACION_ASERCIONES_CONFIG', array(
            'task_bank' => self::get_task_bank(),
            'report_endpoint' => rest_url('evaluacion-aserciones/v1/reports'),
            'ws_url' => apply_filters('evaluacion_aserciones_ws_url', 'ws://localhost:8000/ws'),
            'surfer_url' => apply_filters('evaluacion_aserciones_surfer_url', 'http://localhost:8000/surfer/index.html'),
            'vcd_base_url' => apply_filters('evaluacion_aserciones_vcd_base_url', 'http://localhost:8000'),
            'current_user' => self::get_current_user_payload()
        ));
    }

    public static function render_shortcode() {
        self::enqueue_assets();

        ob_start();
        ?>
        <div class="evaluacion-aserciones-plugin" id="evaluacion-aserciones-root">
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
                <div class="eva-card-title">Asignacion aleatoria</div>
              <p>La bateria contiene 5 variantes; a cada alumno le toca 1 caso de forma determinista segun su identificador.</p>
                <div id="eva-assignment-summary" class="eva-summary">Pendiente de asignacion.</div>
                <div class="eva-actions">
                <button type="button" id="eva-refresh-assignment" class="eva-btn primary">Reasignar caso</button>
                    <button type="button" id="eva-generate-transcripts" class="eva-btn secondary">Generar transcript</button>
                    <button type="button" id="eva-submit" class="eva-btn success">Enviar y corregir</button>
                    <button type="button" id="eva-download-report" class="eva-btn secondary">Descargar reporte</button>
                    <button type="button" id="eva-copy-report" class="eva-btn secondary">Copiar reporte</button>
                </div>
                <div id="eva-score" class="eva-score">Puntuacion: 0/10</div>
                <div id="eva-global-feedback" class="eva-feedback"></div>
            </div>

            <div id="eva-task-list" class="eva-task-list"></div>

            <div class="eva-transcript-card">
              <div class="eva-card-title">Registro final de evidencia</div>
              <pre id="eva-transcript" class="eva-transcript">Esperando generacion de evidencia...</pre>
            </div>

            <div id="eva-solution-panel" class="eva-solution-panel hidden"></div>
        </div>
        <?php
        return ob_get_clean();
    }

    public static function register_admin_menu() {
        add_menu_page(
            'Evaluación Aserciones',
            'Evaluación Aserciones',
            'manage_options',
            'evaluacion-aserciones-reports',
            array(__CLASS__, 'render_admin_page'),
            'dashicons-chart-bar',
            30
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

    private static function find_in_array_recursive($array, $possible_keys) {
        if (!is_array($array)) return null;

        foreach ($possible_keys as $key) {
            if (array_key_exists($key, $array) && $array[$key] !== null && $array[$key] !== '') {
                return $array[$key];
            }
        }

        foreach ($array as $sub) {
            if (is_array($sub)) {
                $found = self::find_in_array_recursive($sub, $possible_keys);
                if ($found !== null && $found !== '') {
                    return $found;
                }
            }
        }

        return null;
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
        $score = ($score_raw === '' || $score_raw === false || $score_raw === null) ? 0 : intval($score_raw);

        // 1. Direct meta keys
        $meta_student_email      = get_post_meta($id, '_eva_report_student_email', true);
        $meta_selected_correct   = get_post_meta($id, '_eva_report_selected_correct', true);
        $meta_expected_correct   = get_post_meta($id, '_eva_report_expected_correct', true);
        $meta_decision_matches   = get_post_meta($id, '_eva_report_decision_matches', true);
        $meta_attempt_assertions = get_post_meta($id, '_eva_report_attempt_assertions', true);
        $meta_count_assertions   = get_post_meta($id, '_eva_report_count_assertions', true);
        $meta_final_reason       = get_post_meta($id, '_eva_report_final_reason', true);
        $meta_transcript         = get_post_meta($id, '_eva_report_transcript', true);
        $meta_testbench          = get_post_meta($id, '_eva_report_testbench', true);

        // 2. Student Meta
        $student_raw = get_post_meta($id, '_eva_report_student', true);
        $student = self::safe_json_decode($student_raw);

        // 3. Payload Meta and Post Content Fallback
        $payload_raw = get_post_meta($id, '_eva_report_payload', true);
        $payload = self::safe_json_decode($payload_raw);
        if (empty($payload) && !empty($post->post_content)) {
            $payload = self::safe_json_decode($post->post_content);
        }

        // Student field resolution
        $student_name = !empty($student['name']) ? $student['name'] : (!empty($payload['student']['name']) ? $payload['student']['name'] : 'Sin nombre');
        $student_email = !empty($student['email']) ? $student['email'] : (!empty($payload['student']['email']) ? $payload['student']['email'] : ($meta_student_email ?: '-'));
        $student_group = !empty($student['group']) ? $student['group'] : (!empty($payload['student']['group']) ? $payload['student']['group'] : '-');
        $student_subject = !empty($student['subject']) ? $student['subject'] : (!empty($payload['student']['subject']) ? $payload['student']['subject'] : '-');

        // Possible JSON keys for recursive search
        $sel_keys    = array('selectedCorrect', 'selected_correct', 'user_decision', 'userDecision', 'decision_alumno', 'decisionAlumno', 'veredicto_alumno', 'opcion_alumno', 'alumno_correcto', 'user_answer', 'userAnswer', 'respuesta_alumno', 'is_correct', 'correct', 'veredicto');
        $exp_keys    = array('expectedCorrect', 'expected_correct', 'truth_correct', 'truthCorrect', 'veredicto_esperado', 'veredictoEsperado', 'expected_verdict', 'truth', 'solucion_esperada', 'caso_correcto', 'truth_verdict');
        $match_keys  = array('decisionMatchesTruth', 'decision_matches_truth', 'decisionMatches', 'decision_matches', 'coincide', 'acierto', 'veredicto_correcto', 'is_decision_correct');
        $att_keys    = array('assertionAttemptDetected', 'assertion_attempt_detected', 'has_assertions', 'hasAssertions', 'intento_aserciones', 'aserciones_detectadas', 'assertions_attempted');
        $cnt_keys    = array('countRelatedAssertions', 'count_related_assertions', 'num_aserciones', 'count_assertions', 'assertions_count', 'assertion_count', 'numAssertions');
        $reason_keys = array('finalReason', 'final_reason', 'motivo', 'evaluacion', 'feedback', 'feedbackText', 'feedback_text', 'reason', 'mensaje', 'explicacion', 'details_text', 'summary', 'observaciones');
        $tb_keys     = array('testbench', 'testbench_code', 'tb_code', 'tb', 'codigo', 'code', 'sv_code', 'systemverilog_code', 'codigo_testbench');
        $tr_keys     = array('transcript', 'sim_log', 'log', 'transcript_text', 'evidencia', 'salida_simulacion', 'questasim_log', 'sim_output');

        $found_sel    = ($meta_selected_correct !== '' && $meta_selected_correct !== false) ? $meta_selected_correct : self::find_in_array_recursive($payload, $sel_keys);
        $found_exp    = ($meta_expected_correct !== '' && $meta_expected_correct !== false) ? $meta_expected_correct : self::find_in_array_recursive($payload, $exp_keys);
        $found_match  = ($meta_decision_matches !== '' && $meta_decision_matches !== false) ? $meta_decision_matches : self::find_in_array_recursive($payload, $match_keys);
        $found_att    = ($meta_attempt_assertions !== '' && $meta_attempt_assertions !== false) ? $meta_attempt_assertions : self::find_in_array_recursive($payload, $att_keys);
        $found_cnt    = ($meta_count_assertions !== '' && $meta_count_assertions !== false) ? $meta_count_assertions : self::find_in_array_recursive($payload, $cnt_keys);
        $found_reason = ($meta_final_reason !== '' && $meta_final_reason !== false) ? $meta_final_reason : self::find_in_array_recursive($payload, $reason_keys);
        $found_tb     = ($meta_testbench !== '' && $meta_testbench !== false) ? $meta_testbench : self::find_in_array_recursive($payload, $tb_keys);
        $found_tr     = ($meta_transcript !== '' && $meta_transcript !== false) ? $meta_transcript : self::find_in_array_recursive($payload, $tr_keys);

        $parse_bool_label = function($val, $true_label = 'Correcto', $false_label = 'Incorrecto') {
            if ($val === null || $val === '') return null;
            if ($val === true || $val === 'true' || $val === 1 || $val === '1' || strtolower((string)$val) === 'correcto' || strtolower((string)$val) === 'sí' || strtolower((string)$val) === 'si') return $true_label;
            if ($val === false || $val === 'false' || $val === 0 || $val === '0' || strtolower((string)$val) === 'incorrecto' || strtolower((string)$val) === 'no') return $false_label;
            return null;
        };

        $selected_correct   = $parse_bool_label($found_sel, 'Correcto', 'Incorrecto');
        $expected_correct   = $parse_bool_label($found_exp, 'Correcto', 'Incorrecto');
        $decision_matches   = $parse_bool_label($found_match, 'Sí', 'No');
        $attempt_assertions = $parse_bool_label($found_att, 'Sí', 'No');
        $count_assertions   = ($found_cnt !== null && $found_cnt !== '') ? intval($found_cnt) : 0;
        $final_reason       = ($found_reason !== null && $found_reason !== '') ? (string)$found_reason : '-';
        $transcript         = ($found_tr !== null && $found_tr !== '') ? (string)$found_tr : '';
        $testbench          = ($found_tb !== null && $found_tb !== '') ? (string)$found_tb : '';

        // Intelligent fallback score mapping for legacy reports where detail payload wasn't stored
        if ($selected_correct === null || $selected_correct === '-') {
            if ($score === 10) {
                $selected_correct   = 'Correcto';
                $expected_correct   = 'Correcto';
                $decision_matches   = 'Sí';
                $attempt_assertions = 'Sí';
                $count_assertions   = ($count_assertions > 0 ? $count_assertions : 1);
                if ($final_reason === '-') $final_reason = 'Evaluación 10/10: veredicto y aserciones correctas.';
            } else if ($score >= 5) {
                $selected_correct   = 'Correcto';
                $expected_correct   = 'Correcto';
                $decision_matches   = 'Sí';
                $attempt_assertions = 'No';
                $count_assertions   = 0;
                if ($final_reason === '-') $final_reason = 'Evaluación 5/10: veredicto correcto sin aserciones completas.';
            } else {
                $selected_correct   = 'Incorrecto';
                $expected_correct   = 'Correcto';
                $decision_matches   = 'No';
                $attempt_assertions = 'No';
                $count_assertions   = 0;
                if ($final_reason === '-') $final_reason = 'Evaluación 0/10: veredicto e intento de aserciones incorrectos.';
            }
        }

        if ($expected_correct === null || $expected_correct === '-') {
            $expected_correct = 'Correcto';
        }
        if ($decision_matches === null || $decision_matches === '-') {
            $decision_matches = ($selected_correct === $expected_correct) ? 'Sí' : 'No';
        }
        if ($attempt_assertions === null || $attempt_assertions === '-') {
            $attempt_assertions = ($score === 10) ? 'Sí' : 'No';
        }

        $assignment_info = isset($payload['assignment']) && is_array($payload['assignment']) ? $payload['assignment'] : array();
        $case_id = $assignment_info['caseId'] ?? ($payload['caseId'] ?? 'assigned');
        $nonce = get_post_meta($id, '_eva_report_assignment_nonce', true) ?: ($assignment_info['nonce'] ?? 0);

        return array(
            'id' => $id,
            'created_at' => $created_at,
            'student_name' => $student_name,
            'student_email' => $student_email,
            'student_group' => $student_group,
            'student_subject' => $student_subject,
            'score' => $score,
            'case_id' => $case_id,
            'nonce' => $nonce,
            'selected_correct' => $selected_correct,
            'expected_correct' => $expected_correct,
            'decision_matches' => $decision_matches,
            'attempt_assertions' => $attempt_assertions,
            'count_assertions' => $count_assertions,
            'final_reason' => $final_reason,
            'transcript' => $transcript,
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

        if (strlen($time_from) === 5) {
            $time_from .= ':00';
        }
        if (strlen($time_to) === 5) {
            $time_to .= ':59';
        }

        $filtered = array();

        foreach ($all_posts as $post) {
            $data = self::parse_report_data($post);

            // Date filter (YYYY-MM-DD comparison)
            $post_date_only = substr($data['created_at'], 0, 10);
            if ($date_from !== '' && $post_date_only < $date_from) {
                continue;
            }
            if ($date_to !== '' && $post_date_only > $date_to) {
                continue;
            }

            // Time filter (HH:MM:SS comparison)
            $post_time_only = strlen($data['created_at']) >= 19 ? substr($data['created_at'], 11, 8) : '';
            if ($time_from !== '' && $post_time_only !== '' && $post_time_only < $time_from) {
                continue;
            }
            if ($time_to !== '' && $post_time_only !== '' && $post_time_only > $time_to) {
                continue;
            }

            // Group filter
            if ($group_filter !== '' && strtolower($data['student_group']) !== strtolower($group_filter)) {
                continue;
            }

            // Score filter
            if ($score_filter === 'passed' && $data['score'] < 5) {
                continue;
            }
            if ($score_filter === 'failed' && $data['score'] >= 5) {
                continue;
            }
            if ($score_filter === 'perfect' && $data['score'] !== 10) {
                continue;
            }

            // Text search
            if ($search_query !== '') {
                $haystack = strtolower(implode(' ', array(
                    $data['student_name'],
                    $data['student_email'],
                    $data['student_group'],
                    $data['student_subject'],
                    $data['final_reason'],
                    $data['id']
                )));
                if (strpos($haystack, strtolower($search_query)) === false) {
                    continue;
                }
            }

            $filtered[] = $data;
        }

        // Sorting
        usort($filtered, function($a, $b) use ($orderby) {
            switch ($orderby) {
                case 'date_asc':
                    return strcmp($a['created_at'], $b['created_at']);
                case 'score_desc':
                    if ($a['score'] === $b['score']) {
                        return strcmp($b['created_at'], $a['created_at']);
                    }
                    return ($b['score'] - $a['score']);
                case 'score_asc':
                    if ($a['score'] === $b['score']) {
                        return strcmp($a['created_at'], $b['created_at']);
                    }
                    return ($a['score'] - $b['score']);
                case 'name_asc':
                    return strcasecmp($a['student_name'], $b['student_name']);
                case 'date_desc':
                default:
                    return strcmp($b['created_at'], $a['created_at']);
            }
        });

        return $filtered;
    }

    public static function handle_admin_exports() {
        if (!isset($_GET['page']) || $_GET['page'] !== 'evaluacion-aserciones-reports') {
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
            check_admin_referer('eva_export_csv_nonce');
            $all_posts = get_posts(array(
                'post_type' => 'eva_report',
                'post_status' => 'private',
                'numberposts' => -1
            ));
            $reports = self::filter_and_sort_reports($all_posts, $_GET);
            $filename = 'resumen_evaluacion_aserciones_' . date('Y-m-d_H-i') . '.csv';

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
                'Decision Alumno',
                'Veredicto Esperado',
                'Decision Correcta (Si/No)',
                'Intento Aserciones (Si/No)',
                'Numero Aserciones Relacionadas',
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
                    $data['selected_correct'],
                    $data['expected_correct'],
                    $data['decision_matches'],
                    $data['attempt_assertions'],
                    $data['count_assertions'],
                    $data['final_reason']
                ));
            }
            fclose($output);
            exit;
        }

        if ($action === 'export_all_json') {
            check_admin_referer('eva_export_json_nonce');
            $all_posts = get_posts(array(
                'post_type' => 'eva_report',
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
                    'case_id' => $r['case_id'],
                    'nonce' => $r['nonce'],
                    'detail' => array(
                        'selectedCorrect' => $r['selected_correct'],
                        'expectedCorrect' => $r['expected_correct'],
                        'decisionMatchesTruth' => ($r['decision_matches'] === 'Sí'),
                        'assertionAttemptDetected' => ($r['attempt_assertions'] === 'Sí'),
                        'countRelatedAssertions' => $r['count_assertions'],
                        'finalReason' => $r['final_reason'],
                        'transcript' => $r['transcript'],
                        'testbench' => $r['testbench']
                    ),
                    'raw_payload' => $r['raw_payload']
                );
            }

            $filename = 'reportes_evaluacion_aserciones_' . date('Y-m-d_H-i') . '.json';
            header('Content-Type: application/json; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Pragma: no-cache');
            header('Expires: 0');
            echo wp_json_encode($export_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'export_single_json') {
            check_admin_referer('eva_export_single_json_nonce');
            $report_id = isset($_GET['report_id']) ? intval($_GET['report_id']) : 0;
            if ($report_id <= 0) {
                wp_die('ID de reporte inválido.');
            }
            $post = get_post($report_id);
            if (!$post || $post->post_type !== 'eva_report') {
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
                'case_id' => $r['case_id'],
                'nonce' => $r['nonce'],
                'detail' => array(
                    'selectedCorrect' => $r['selected_correct'],
                    'expectedCorrect' => $r['expected_correct'],
                    'decisionMatchesTruth' => ($r['decision_matches'] === 'Sí'),
                    'assertionAttemptDetected' => ($r['attempt_assertions'] === 'Sí'),
                    'countRelatedAssertions' => $r['count_assertions'],
                    'finalReason' => $r['final_reason'],
                    'transcript' => $r['transcript'],
                    'testbench' => $r['testbench']
                ),
                'raw_payload' => $r['raw_payload']
            );

            $filename = 'reporte_evaluacion_aserciones_' . $report_id . '.json';
            header('Content-Type: application/json; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Pragma: no-cache');
            header('Expires: 0');
            echo wp_json_encode($single_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'delete_single_report') {
            check_admin_referer('eva_delete_single_nonce');
            $report_id = isset($_GET['report_id']) ? intval($_GET['report_id']) : 0;
            if ($report_id > 0) {
                wp_delete_post($report_id, true);
            }
            $redirect_url = remove_query_arg(array('action', 'report_id', '_wpnonce'), wp_get_referer() ?: admin_url('admin.php?page=evaluacion-aserciones-reports'));
            $redirect_url = add_query_arg('eva_msg', 'deleted_single', $redirect_url);
            wp_redirect($redirect_url);
            exit;
        }

        if ($action === 'delete_filtered_reports') {
            check_admin_referer('eva_delete_filtered_nonce');
            $all_posts = get_posts(array(
                'post_type' => 'eva_report',
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
            $redirect_url = remove_query_arg(array('action', '_wpnonce'), admin_url('admin.php?page=evaluacion-aserciones-reports'));
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
            'post_type' => 'eva_report',
            'post_status' => 'private',
            'numberposts' => -1
        ));

        // Collect all distinct groups for dropdown filter
        $available_groups = array();
        foreach ($all_posts as $p) {
            $parsed = self::parse_report_data($p);
            if (!empty($parsed['student_group']) && $parsed['student_group'] !== '-') {
                $available_groups[$parsed['student_group']] = true;
            }
        }
        $available_groups = array_keys($available_groups);
        sort($available_groups);

        // Apply active filters and sorting
        $filtered_reports = self::filter_and_sort_reports($all_posts, $_GET);

        // Calculate statistics for filtered set
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

        // Export & Purge URLs preserving active filter parameters
        $csv_args = array_merge(array(
            'page' => 'evaluacion-aserciones-reports',
            'action' => 'export_csv'
        ), $_GET);
        unset($csv_args['_wpnonce']);
        $export_url = wp_nonce_url(add_query_arg($csv_args, admin_url('admin.php')), 'eva_export_csv_nonce');

        $json_args = array_merge(array(
            'page' => 'evaluacion-aserciones-reports',
            'action' => 'export_all_json'
        ), $_GET);
        unset($json_args['_wpnonce']);
        $export_json_url = wp_nonce_url(add_query_arg($json_args, admin_url('admin.php')), 'eva_export_json_nonce');

        $purge_args = array_merge(array(
            'page' => 'evaluacion-aserciones-reports',
            'action' => 'delete_filtered_reports'
        ), $_GET);
        unset($purge_args['_wpnonce']);
        $purge_filtered_url = wp_nonce_url(add_query_arg($purge_args, admin_url('admin.php')), 'eva_delete_filtered_nonce');

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
            <h1 class="wp-heading-inline" style="font-weight:700; color:#1d2327;">Panel de Evaluación de Aserciones</h1>
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
                <div class="notice notice-warning is-dismissible" style="border-radius: 8px; margin-top: 15px;"><p><strong>🧹 Se han purgado y eliminado permanentemente <?php echo intval($_GET['count'] ?? 0); ?> entregas para liberar espacio.</strong></p></div>
            <?php endif; ?>

            <!-- Tarjetas de Estadísticas -->
            <div style="display: flex; gap: 16px; margin: 20px 0; flex-wrap: wrap;">
                <div class="card" style="flex: 1; min-width: 200px; padding: 18px; margin:0; border-radius:12px; border-left: 5px solid #1363df; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
                    <h3 style="margin:0 0 6px; color:#64748b; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Entregas Filtradas</h3>
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
                    <input type="hidden" name="page" value="evaluacion-aserciones-reports">

                    <!-- Fila 1: Filtros de Fecha y Presets Rápidos -->
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

                    <!-- Fila 2: Filtro Horario (Intervalo de Clase) -->
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

                    <!-- Fila 3: Filtros de Grupo, Nota, Orden y Búsqueda -->
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
                            <a href="<?php echo esc_url(admin_url('admin.php?page=evaluacion-aserciones-reports')); ?>" class="button button-secondary" style="border-radius: 6px;">Limpiar Todos los Filtros</a>
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
                        <th style="width: 200px;">Alumno</th>
                        <th style="width: 80px;">Grupo</th>
                        <th style="width: 100px;">Asignatura</th>
                        <th style="width: 110px;">Decisión Alumno</th>
                        <th style="width: 110px;">Esperado</th>
                        <th style="width: 90px; text-align: center;">Coincide</th>
                        <th style="width: 90px; text-align: center;">Aserciones</th>
                        <th style="width: 95px; text-align: center;">Nota</th>
                        <th>Motivo y Detalles</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($filtered_reports)): ?>
                        <tr>
                            <td colspan="11" style="padding: 20px; text-align: center; color: #64748b;">No se encontraron entregas que coincidan con los criterios seleccionados.</td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($filtered_reports as $data):
                            $badge_color = ($data['score'] === 10) ? '#2e7d32' : (($data['score'] >= 5) ? '#ed6c02' : '#d32f2f');
                            $single_json_url = wp_nonce_url(admin_url('admin.php?page=evaluacion-aserciones-reports&action=export_single_json&report_id=' . $data['id']), 'eva_export_single_json_nonce');
                            $single_delete_url = wp_nonce_url(admin_url('admin.php?page=evaluacion-aserciones-reports&action=delete_single_report&report_id=' . $data['id']), 'eva_delete_single_nonce');
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
                                <td>
                                    <span style="font-size:12px; font-weight:600; color:<?php echo $data['selected_correct'] === 'Correcto' ? '#2e7d32' : ($data['selected_correct'] === 'Incorrecto' ? '#d32f2f' : '#64748b'); ?>;">
                                        <?php echo esc_html($data['selected_correct']); ?>
                                    </span>
                                </td>
                                <td>
                                    <span style="font-size:12px; font-weight:600; color:<?php echo $data['expected_correct'] === 'Correcto' ? '#2e7d32' : ($data['expected_correct'] === 'Incorrecto' ? '#d32f2f' : '#64748b'); ?>;">
                                        <?php echo esc_html($data['expected_correct']); ?>
                                    </span>
                                </td>
                                <td style="text-align: center;">
                                    <span style="font-size:12px; font-weight:600; color:<?php echo $data['decision_matches'] === 'Sí' ? '#2e7d32' : '#d32f2f'; ?>;">
                                        <?php echo esc_html($data['decision_matches']); ?>
                                    </span>
                                </td>
                                <td style="text-align: center;">
                                    <span style="font-size:11px; background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-weight:600;">
                                        <?php echo esc_html($data['attempt_assertions']); ?> (<?php echo esc_html($data['count_assertions']); ?>)
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

                                    <?php if (!empty($data['testbench']) || !empty($data['transcript'])): ?>
                                        <details style="margin-top: 4px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px;">
                                            <summary style="font-size: 11px; cursor: pointer; color: #1363df; font-weight: 600;">🔍 Ver Testbench y Transcript de Questa</summary>
                                            <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 8px;">
                                                <?php if (!empty($data['testbench'])): ?>
                                                    <div>
                                                        <strong style="font-size: 11px; color: #475569;">Código Testbench SystemVerilog:</strong>
                                                        <pre style="background: #1e293b; color: #f8fafc; padding: 8px; border-radius: 4px; font-size: 11px; max-height: 200px; overflow: auto; margin: 4px 0;"><?php echo esc_html($data['testbench']); ?></pre>
                                                    </div>
                                                <?php endif; ?>
                                                <?php if (!empty($data['transcript'])): ?>
                                                    <div>
                                                        <strong style="font-size: 11px; color: #475569;">Transcript de Simulación Questa:</strong>
                                                        <pre style="background: #0f172a; color: #38bdf8; padding: 8px; border-radius: 4px; font-size: 11px; max-height: 200px; overflow: auto; margin: 4px 0;"><?php echo esc_html($data['transcript']); ?></pre>
                                                    </div>
                                                <?php endif; ?>
                                            </div>
                                        </details>
                                    <?php endif; ?>

                                    <details style="margin-top: 4px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 8px;">
                                        <summary style="font-size: 11px; cursor: pointer; color: #475569; font-weight: 600;">📄 Ver Reporte JSON Crudo</summary>
                                        <pre style="background: #0f172a; color: #a5f3fc; padding: 8px; border-radius: 4px; font-size: 11px; max-height: 250px; overflow: auto; margin: 4px 0;"><?php echo esc_html(wp_json_encode($data['raw_payload'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)); ?></pre>
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

EvaluacionAsercionesPlugin::init();
