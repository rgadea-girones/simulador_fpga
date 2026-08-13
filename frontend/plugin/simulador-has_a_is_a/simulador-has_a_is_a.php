<?php
/**
 * Plugin Name: Simulador SystemVerilog - Has-A / Is-A v1.0
 * Description: Entorno de simulación de 4 cuadrantes (Testbench, Design, Transcript y Curiosidades) para aprender conceptos de OOP con SystemVerilog.
 * Version: 1.0.0
 * Author: Tu Nombre
 */

if (!defined('ABSPATH')) {
    exit;
}

class SimuladorHasAIsA_Plugin {

    public function __construct() {
        add_shortcode('simulador_has_a_is_a', array($this, 'render_shortcode'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function enqueue_assets() {
        wp_enqueue_script(
            'simulador-has-a-is-a-editor',
            plugin_dir_url(__FILE__) . 'assets/js/editor-has-a-is-a.js',
            array(),
            '1.0.0',
            true
        );

        wp_localize_script('simulador-has-a-is-a-editor', 'SV_HAS_A_IS_A_CONFIG', array(
            'ws_url' => apply_filters('simulador_has_a_is_a_ws_url', 'ws://localhost:8000/ws')
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

          #panel-explicaciones h3 {
            color: #f39c12 !important;
            margin-top: 0;
            margin-bottom: 15px;
            font-size: 17px;
            border-bottom: 1px solid #34495e;
            padding-bottom: 6px;
          }

          #panel-explicaciones h4 {
            color: #f1c40f !important;
            font-size: 14px;
            margin-top: 15px;
            margin-bottom: 8px;
          }

          #panel-explicaciones p, #panel-explicaciones li {
            color: #e0e6ed !important;
            font-size: 13px;
          }

          #panel-explicaciones ul {
            padding-left: 20px;
            margin-top: 8px;
            margin-bottom: 12px;
          }

          #panel-explicaciones code {
            background-color: #2c3e50 !important;
            color: #ff7675 !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
            font-family: 'Consolas', monospace !important;
            font-size: 12px !important;
          }
        </style>

        <div class="simulador-fpga-wrapper" style="max-width: 1400px; margin: 20px auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            
            <!-- BARRA SUPERIOR DE ESTADO Y BOTONES -->
            <div style="background-color: #2c3e50; color: white; padding: 10px 16px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; border: 2px solid #333; border-bottom: none; gap: 15px; flex-wrap: wrap;">
                
                <!-- TÍTULO Y SELECCIÓN DE EJEMPLOS DESDE POWERPOINT -->
                <div style="font-weight: bold; font-size: 15px; white-space: nowrap; flex-shrink: 0; display: flex; align-items: center; gap: 8px;">
                    🛠️ <span>Simulador OOP SystemVerilog (Has-A / Is-A)</span>
                    <select id="ejemplos-has-a-is-a" style="margin-left: 15px; font-size: 12px; padding: 4px 8px; border-radius: 4px; background: #34495e; color: white; border: 1px solid #7f8c8d; cursor: pointer;">
                        <optgroup label="Conceptos Básicos">
                            <option value="clases">1. Clases (Slide 3)</option>
                            <option value="objetos">2. Objetos (Slide 4)</option>
                            <option value="constructor_sin_args">3. Constructor sin Argumentos (Slide 5 Izq)</option>
                            <option value="constructor_con_args">4. Constructor con Argumentos (Slide 5 Der)</option>
                            <option value="gestion_memoria">5. Gestión de Memoria (Slide 6)</option>
                        </optgroup>
                        <optgroup label="Miembros Estáticos y Constantes">
                            <option value="variables_estaticas">6. Variables de Clase Estáticas (Slide 8)</option>
                            <option value="variables_constantes">7. Variables de Clase Constantes (Slide 9)</option>
                            <option value="metodos_estaticos">8. Métodos Estáticos (Slide 10)</option>
                        </optgroup>
                        <optgroup label="Encapsulamiento y Relaciones">
                            <option value="encapsulacion">9. Ocultación y Encapsulación (Slide 11)</option>
                            <option value="relacion_has_a">10. Subclases - Relación "Has a" (Slide 13)</option>
                            <option value="relacion_is_a">11. Clases Derivadas - Relación "Is a" (Slide 14)</option>
                            <option value="downcasting">12. Downcasting con $cast (Slide 16)</option>
                        </optgroup>
                        <optgroup label="Copia y Polimorfismo">
                            <option value="shallow_copy">13. Shallow Copy / Copia Superficial (Slide 18)</option>
                            <option value="deep_copy">14. Deep Copy / Copia Profunda (Slide 20)</option>
                            <option value="clonado">15. Clonado con .clone() (Slide 22)</option>
                            <option value="metodos_virtuales">16. Métodos Virtuales y Polimorfismo (Slide 23)</option>
                        </optgroup>
                        <optgroup label="Curiosidades y Casos Prácticos (Extras)">
                            <option value="extra_virtual_vs_no">17. Curiosidad 1: Métodos Virtuales vs No Virtuales</option>
                            <option value="extra_super_args">18. Curiosidad 2: super.new con argumentos</option>
                            <option value="extra_local_vs_protected">19. Curiosidad 3: Local vs Protected en Herencia</option>
                            <option value="extra_shallow_deep_arrays">20. Curiosidad 4: Shallow vs Deep en Arrays Dinámicos</option>
                            <option value="extra_mailbox_comunicacion">21. Curiosidad 5: Mailboxes y Objetos Transaccionales</option>
                            <option value="extra_constraint_random">22. Curiosidad 6: Constraint Randomization Básica</option>
                        </optgroup>
                    </select>
                </div>

                <!-- ESTADO Y ACCIONES -->
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <span id="estado_ws" style="font-size: 12px; font-weight: bold; color: #f1c40f; white-space: nowrap; margin-right: 6px;">
                        🟠 Conectando...
                    </span>
                    
                    <button id="btn-linter" class="sim-btn" style="background-color: #e67e22; color: white;">
                        🔍 Comprobar (Linter)
                    </button>

                    <button id="btn-compilar" class="sim-btn" style="background-color: #2980b9; color: white;">
                        <span id="btn-spinner-compilar" class="sim-spinner" style="display: none;"></span>
                        <span id="btn-compilar-texto">✅ Verificar</span>
                    </button>

                    <button id="btn-ai-autocomplete" class="sim-btn" style="background-color: #8e44ad; color: white;" title="Autocompletar código con IA">
                        🤖 Completar IA
                    </button>

                    <button id="btn-settings" class="sim-btn" style="background-color: #7f8c8d; color: white;" title="Configurar API de PoliGPT">
                        ⚙️ Ajustes IA
                    </button>
                </div>
            </div>

            <!-- GRID 2x2 DE 4 CUADRANTES -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background-color: #1a252f; padding: 10px; border: 2px solid #333; border-radius: 0 0 8px 8px;">
                
                <!-- 1. BANCO DE PRUEBAS -->
                <div style="border: 1px solid #444; border-radius: 6px; overflow: hidden; background-color: #1e1e1e;">
                    <div style="background-color: #34495e; color: #ecf0f1; padding: 6px 12px; font-weight: bold; font-size: 13px;">
                        🧪 Banco de Pruebas (Testbench)
                    </div>
                    <div id="editor_tb" style="height: 380px; width: 100%;"></div>
                </div>

                <!-- 2. DISEÑO -->
                <div style="border: 1px solid #444; border-radius: 6px; overflow: hidden; background-color: #1e1e1e;">
                    <div style="background-color: #34495e; color: #ecf0f1; padding: 6px 12px; font-weight: bold; font-size: 13px;">
                        📄 Módulo de Diseño (Design)
                    </div>
                    <div id="editor_design" style="height: 380px; width: 100%;"></div>
                </div>

                <!-- 3. TRANSCRIPT -->
                <div style="border: 1px solid #444; border-radius: 6px; overflow: hidden; background-color: #0f1419;">
                    <div style="background-color: #34495e; color: #ecf0f1; padding: 6px 12px; font-weight: bold; font-size: 13px; display: flex; justify-content: space-between;">
                        <span>💻 Console Transcript (QuestaSim / Icarus)</span>
                        <span id="transcript-status" style="font-weight: normal; font-size: 11px; color: #bdc3c7;">Esperando acción...</span>
                    </div>
                    <div id="simulation-transcript" style="height: 380px; width: 100%; padding: 10px; font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; color: #2ecc71; overflow-y: auto; box-sizing: border-box; white-space: pre-wrap; background-color: #0d1117; border-top: 1px solid #222;">
// La salida de la compilación y simulación aparecerá aquí...
                    </div>
                </div>

                <!-- 4. CURIOSIDADES Y EXPLICACIONES -->
                <div style="border: 1px solid #444; border-radius: 6px; overflow: hidden; background-color: #1b2631; color: #ecf0f1; display: flex; flex-direction: column;">
                    <div style="background-color: #34495e; color: #ecf0f1; padding: 6px 12px; font-weight: bold; font-size: 13px;">
                        💡 Curiosidades y Explicaciones OOP
                    </div>
                    <div id="panel-explicaciones" style="height: 380px; padding: 15px; overflow-y: auto; font-size: 13px; line-height: 1.6; box-sizing: border-box; background-color: #151d24;">
                        <h3>¡Bienvenido al Entorno de OOP en SystemVerilog!</h3>
                        <p>Selecciona cualquier ejemplo de la barra superior para ver su código e información explicativa aquí.</p>
                    </div>
                </div>

            </div>

            <!-- MODAL DE CONFIGURACIÓN DE IA -->
            <div id="settings-modal" style="display: none; position: fixed; z-index: 9999; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.7); align-items: center; justify-content: center;">
                <div style="background-color: #2c3e50; color: #ecf0f1; margin: auto; padding: 20px; border: 2px solid #34495e; border-radius: 8px; width: 450px; max-width: 90%; font-family: sans-serif;">
                    <h3 style="margin-top: 0; color: #f39c12; border-bottom: 1px solid #34495e; padding-bottom: 10px;">Configuración de Asistente IA (PoliGPT)</h3>
                    <p style="font-size: 12px; color: #bdc3c7; line-height: 1.4;">Configura tus credenciales de PoliGPT UPV. Si lo desactivas o dejas vacío, el sistema utilizará el modelo de autocompletado offline local (Ollama).</p>
                    
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-size: 13px; margin-bottom: 5px; font-weight: bold; cursor: pointer;">
                            <input type="checkbox" id="poligpt-enable" style="margin-right: 5px;"> Activar API de PoliGPT
                        </label>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-size: 13px; margin-bottom: 5px;">API Key de PoliGPT:</label>
                        <input type="password" id="poligpt-apikey" placeholder="Introduce tu clave API personal de la UPV..." style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #34495e; background-color: #1a252f; color: #fff; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-size: 13px; margin-bottom: 5px;">URL de la API (Endpoint):</label>
                        <input type="text" id="poligpt-url" value="https://poligpt.upv.es/api/v1/chat/completions" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #34495e; background-color: #1a252f; color: #fff; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-size: 13px; margin-bottom: 5px;">Modelo a utilizar:</label>
                        <input type="text" id="poligpt-model" value="gpt-3.5-turbo" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #34495e; background-color: #1a252f; color: #fff; box-sizing: border-box;">
                    </div>
                    
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button id="settings-cancel" class="sim-btn" style="background-color: #e74c3c; color: white;">Cancelar</button>
                        <button id="settings-save" class="sim-btn" style="background-color: #2ecc71; color: white;">Guardar Ajustes</button>
                    </div>
                </div>
            </div>

        </div>
        <?php
        return ob_get_clean();
    }
}

new SimuladorHasAIsA_Plugin();
