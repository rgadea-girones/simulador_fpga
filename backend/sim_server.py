import asyncio
import json
import re
import os
import tempfile
import httpx
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager

import resource  # <-- LIBRERÍA DE LINUX

# --- TRUCO ANTI-CRASH ---
# Ampliamos el límite de archivos abiertos en Linux de 1024 a 65536
try:
    resource.setrlimit(resource.RLIMIT_NOFILE, (65536, 65536))
except Exception as e:
    print(f"Aviso: No se pudo ampliar el límite de archivos ({e})")
# ------------------------------

# ==========================================
# ESTADO GLOBAL Y VARIABLES DE CONTROL
# ==========================================
estado_global = {
    "ledr": "0000000000",
    "ledg": "0000000000",
    "hex": {f"HEX{i}": "1111111" for i in range(6)}
}

sw_actual = [0] * 10
keys_actual = [1] * 4  # Pull-up
sim_process = None

# Mutex para que los comandos de usuario y el Auto-Tick no choquen
sim_lock = asyncio.Lock()
# Tarea en segundo plano para el reloj
auto_tick_task = None

CMD_LEER_ESTADO = (
    "catch {echo \"MY_LEDR=[examine -radix bin LEDR]\"}\n"
    "catch {echo \"MY_LEDG=[examine -radix bin LEDG]\"}\n"
    "catch {echo \"MY_HEX0=[examine -radix bin HEX0]\"}\n"
    "catch {echo \"MY_HEX1=[examine -radix bin HEX1]\"}\n"
    "catch {echo \"MY_HEX2=[examine -radix bin HEX2]\"}\n"
    "catch {echo \"MY_HEX3=[examine -radix bin HEX3]\"}\n"
    "catch {echo \"MY_HEX4=[examine -radix bin HEX4]\"}\n"
    "catch {echo \"MY_HEX5=[examine -radix bin HEX5]\"}\n"
)

# ==========================================
# PARSER Y LECTOR DE CONSOLA (QUESTASIM)
# ==========================================
async def parse_linea(texto):
    global estado_global
    
    # LEDS: \s* absorbe espacios. Capturamos hasta 10 bits.
    match_r = re.search(r"MY_LEDR=\s*([01xXzZ]{1,10})", texto)
    if match_r: 
        estado_global["ledr"] = match_r.group(1).lower().replace('x','0').replace('z','0').zfill(10)
    
    match_g = re.search(r"MY_LEDG=\s*([01xXzZ]{1,10})", texto)
    if match_g: 
        estado_global["ledg"] = match_g.group(1).lower().replace('x','0').replace('z','0').zfill(10)
    
    # HEX: Aquí es donde solía fallar por los espacios
    for i in range(6):
        # Buscamos MY_HEXi= seguido de posibles espacios \s* 
        # y opcionalmente un prefijo tipo 7'b (usando [^01xXzZ]*)
        match_h = re.search(rf"MY_HEX{i}=\s*[^01xXzZ]*([01xXzZ]{{1,7}})", texto)
        
        if match_h:
            bits_raw = match_h.group(1).lower()
            # En displays de ánodo común, 'x' o 'z' deben ser '1' (apagado)
            bits_clean = bits_raw.replace('x','1').replace('z','1')
            # Rellenamos con '1' hasta 7 bits (zfill con '1')
            estado_global["hex"][f"HEX{i}"] = bits_clean.zfill(7).replace('0', '0' if bits_clean else '1') 
            # Versión simplificada:
            estado_global["hex"][f"HEX{i}"] = bits_clean[-7:].rjust(7, '1')

    # Debug opcional para ver en la consola de Linux qué está pasando
    #print(f"DEBUG BACKEND: {estado_global['hex']['HEX0']}")

async def leer_consola(stream):
    while True:
        line = await stream.readline()
        if not line: break
        texto = line.decode('utf-8', errors='ignore').strip()
        if texto:
            if "vish-4014" in texto or "vsim-4008" in texto or "VSIM" in texto:
                continue 
            await parse_linea(texto)

# ==========================================
# EL CORAZÓN AUTÓNOMO (AUTO-TICK)
# ==========================================
async def auto_tick_loop(websocket: WebSocket):
    global sim_process
    while True:
        inicio = asyncio.get_event_loop().time()
        
        if sim_process:
            async with sim_lock:
                cmds = "run 50ns\n" + CMD_LEER_ESTADO
                try:
                    sim_process.stdin.write(cmds.encode())
                    await sim_process.stdin.drain()
                except Exception as e:
                    break 
            
            await asyncio.sleep(0.02)
            
            try:
                await websocket.send_text(json.dumps(estado_global))
            except:
                break 
                
        tiempo_gastado = asyncio.get_event_loop().time() - inicio
        tiempo_espera = max(0.01, 0.1 - tiempo_gastado)
        await asyncio.sleep(tiempo_espera)

# ==========================================
# VISOR DE ESQUEMÁTICOS (YOSYS + NETLISTSVG)
# ==========================================
async def generar_esquema_svg(codigo_verilog, modulo_objetivo="auto"):
    """
    Recibe un string con el código Verilog, usa Yosys + Netlistsvg 
    y devuelve un string con el código HTML/SVG del dibujo.
    """
    fd_v, ruta_v = tempfile.mkstemp(suffix=".v")
    fd_json, ruta_json = tempfile.mkstemp(suffix=".json")
    fd_svg, ruta_svg = tempfile.mkstemp(suffix=".svg")
    
    try:
        with os.fdopen(fd_v, 'w') as f:
            f.write(codigo_verilog)
# ==========================================
        # EL CEREBRO DINÁMICO DE YOSYS
        # ==========================================
        if modulo_objetivo == "auto":
            # IMPORTANTE: Añadimos 'read_verilog -sv {ruta_v}' al principio del script
            # y quitamos la ruta del final del comando yosys
            script_yosys = (
                f"read_verilog -sv {ruta_v}; "
                "prep -auto-top; opt; "
                "techmap * t:$dff %d t:$adff %d t:$mux %d; "
                "opt; abc -g AND,OR, NOT; opt_clean; "
                f"write_json {ruta_json}"
            )
        else:
            script_yosys = (
                f"read_verilog -sv {ruta_v}; "
                f"synth -top {modulo_objetivo} -flatten -run :fine; "
                "opt; techmap * t:$dff %d t:$adff %d t:$mux %d; "
                "opt; abc -g AND,OR, NOT; opt_clean; "
                f"write_json {ruta_json}"
            )
        comando_yosys = f"yosys -p '{script_yosys}'"
        # ==========================================     
        proc_y = await asyncio.create_subprocess_shell(
            comando_yosys, 
            stdout=asyncio.subprocess.DEVNULL, 
            stderr=asyncio.subprocess.PIPE
        )
        _, stderr_y = await proc_y.communicate()
        
        if proc_y.returncode != 0:
            raise Exception(f"Error de sintaxis en Yosys:\n{stderr_y.decode()}")

        proc_svg = await asyncio.create_subprocess_shell(
            f"netlistsvg {ruta_json} -o {ruta_svg}",
            stdout=asyncio.subprocess.DEVNULL, 
            stderr=asyncio.subprocess.PIPE
        )
        _, stderr_svg = await proc_svg.communicate()
        
        if proc_svg.returncode != 0:
            raise Exception(f"Error al dibujar el SVG:\n{stderr_svg.decode()}")

        with open(ruta_svg, "r", encoding="utf-8") as f:
            svg_content = f.read()
            
        return svg_content

    finally:
        for archivo in [ruta_v, ruta_json, ruta_svg]:
            try:
                os.remove(archivo)
                if archivo == ruta_json: os.close(fd_json)
                if archivo == ruta_svg: os.close(fd_svg)
            except OSError:
                pass

# ==========================================
# AUTOCOMPLETADO IA (OLLAMA) — auxiliar async
# ==========================================
async def generar_completado_ia(websocket, texto: str, completion_id: str, api_key: str = "", api_url: str = "", model_name: str = ""):
    """
    Llama a PoliGPT (si se provee clave/URL) o a Ollama local para completar el código SV y devuelve el resultado
    por el mismo WebSocket sin bloquearlo.
    """
    completion = ""
    try:
        if api_key and api_url:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            # Estructura estándar de OpenAI Chat Completions compatible con PoliGPT/OpenAI/DeepSeek
            payload = {
                "model": model_name or "gpt-3.5-turbo",
                "messages": [
                    {
                        "role": "system", 
                        "content": "Eres un asistente de código SystemVerilog. Continúa el siguiente código exactamente donde se interrumpe. Responde ÚNICAMENTE con el código de continuación directo, sin explicaciones ni markdown."
                    },
                    {"role": "user", "content": texto}
                ],
                "temperature": 0.2
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(api_url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                if "choices" in data and len(data["choices"]) > 0:
                    completion = data["choices"][0]["message"]["content"].strip()
                elif "response" in data:
                    completion = data["response"].strip()
        else:
            prompt = (
                "Eres un asistente de código SystemVerilog/Verilog. "
                "Continúa el siguiente fragmento de código exactamente donde se interrumpe. "
                "Responde ÚNICAMENTE con el código que viene a continuación, "
                "sin ninguna explicación, sin bloques markdown, sin texto adicional:\n\n"
                + texto
            )
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    "http://localhost:11434/api/generate",
                    json={"model": "qwen2.5-coder:3b", "prompt": prompt, "stream": False}
                )
                data = resp.json()
                completion = data.get("response", "").strip()

        # Eliminar bloques markdown si el modelo los incluye por error
        completion = re.sub(r'^```[a-zA-Z]*\n?', '', completion)
        completion = re.sub(r'\n?```$', '', completion).strip()
    except Exception as e:
        completion = f"// Error en autocompletado: {str(e)}"

    try:
        await websocket.send_text(json.dumps({
            "tipo": "autocompletar_respuesta",
            "completion": completion,
            "id": completion_id
        }))
    except Exception:
        pass  # WebSocket ya cerrado


# ==========================================
# SERVIDOR FASTAPI Y WEBSOCKETS
# ==========================================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ==========================================
# MODELO DE DATOS PARA EL ASISTENTE IA
# ==========================================
class PeticionIA(BaseModel):
    prompt: str
    codigo: str = ""
    testbench: str = ""


# ==========================================
# ENDPOINT HTTP: ASISTENTE IA (OLLAMA)
# ==========================================
@app.post("/ai")
async def asistente_ia(peticion: PeticionIA):
    """Envía la pregunta del usuario a Ollama (qwen2.5-coder:3b) con el código
    actual como contexto y devuelve la respuesta generada."""
    system_prompt = (
        "Eres un asistente experto en diseño digital con SystemVerilog y Verilog. "
        "Ayudas a estudiantes universitarios a escribir, depurar y entender código HDL. "
        "Responde siempre en español. Sé conciso y técnico. "
        "Si el usuario proporciona código, úsalo como contexto para tu respuesta. "
        "Cuando muestres código, usa bloques ```systemverilog ... ```."
    )

    contexto = ""
    if peticion.codigo.strip():
        contexto += f"\n\n--- Módulo de diseño (design.sv) ---\n```systemverilog\n{peticion.codigo}\n```"
    if peticion.testbench.strip():
        contexto += f"\n\n--- Testbench (testbench.sv) ---\n```systemverilog\n{peticion.testbench}\n```"

    prompt_completo = f"{system_prompt}{contexto}\n\nPregunta del estudiante: {peticion.prompt}"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "qwen2.5-coder:3b",
                    "prompt": prompt_completo,
                    "stream": False
                }
            )
            resp.raise_for_status()
            data = resp.json()
            return {"respuesta": data.get("response", "Sin respuesta del modelo.")}
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Ollama no disponible: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {e}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    global sim_process, sw_actual, keys_actual, auto_tick_task
    
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            
            # -----------------------------------------------------------
            # NUEVO: PETICIÓN DE DIBUJAR ESQUEMA YOSYS
            # -----------------------------------------------------------
# -----------------------------------------------------------
            # SÍNTESIS CON YOSYS + NETLISTSVG (SÍMBOLOS CUSTOM)
            # -----------------------------------------------------------
# -----------------------------------------------------------
            # 1. PETICIÓN DE DIBUJAR ESQUEMA (YOSYS + NETLISTSVG)
            # -----------------------------------------------------------
            if msg.get("accion") == "ver_esquema":
                codigo_design = msg.get("codigo", "")

                with open('../workspace/design.sv', 'w', encoding='utf-8') as f:
                    f.write(codigo_design)

                design_modules = re.findall(r'^\s*module\s+([a-zA-Z0-9_]+)', codigo_design, re.MULTILINE)
                top_module = design_modules[-1] if design_modules else "top_system"

                # 1. Yosys genera el JSON mapeando explícitamente a $adff
                ys_path = '../workspace/synth.ys'
                with open(ys_path, 'w', encoding='utf-8') as f:
                    f.write(f"read_verilog -sv design.sv\n")
                    f.write(f"hierarchy -top {top_module}\n")
                    f.write("proc;\n")
                    f.write("opt;\n")
                    f.write("write_json netlist.json\n")

                cmd_yosys = "bash -c 'source /home/generico/.profile 2>/dev/null; cd ../workspace && yosys -s synth.ys'"
                proc_ys = await asyncio.create_subprocess_shell(
                    cmd_yosys,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout_ys, stderr_ys = await proc_ys.communicate()

                if proc_ys.returncode != 0:
                    err_msg = stderr_ys.decode('utf-8', errors='ignore') or stdout_ys.decode('utf-8', errors='ignore')
                    await websocket.send_text(json.dumps({
                        "tipo": "error",
                        "mensaje": err_msg
                    }))
                    continue

                # 2. Comprobar ruta absoluta del skin para evitar fallos de directorio
                skin_path = os.path.abspath('../workspace/custom_skin.svg')
                skin_arg = f"--skin {skin_path}" if os.path.exists(skin_path) else ""

                cmd_netlist = f"bash -c 'cd ../workspace && netlistsvg netlist.json -o schema.svg {skin_arg}'"
                
                proc_svg = await asyncio.create_subprocess_shell(
                    cmd_netlist,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout_svg, stderr_svg = await proc_svg.communicate()

                # 3. Enviar el SVG resultante
                svg_path = '../workspace/schema.svg'
                if os.path.exists(svg_path):
                    with open(svg_path, 'r', encoding='utf-8', errors='ignore') as sf:
                        svg_code = sf.read()

                    await websocket.send_text(json.dumps({
                        "tipo": "esquema_svg",
                        "contenido_svg": svg_code
                    }))
                else:
                    await websocket.send_text(json.dumps({
                        "tipo": "error",
                        "mensaje": "No se pudo generar el esquema SVG con netlistsvg."
                    }))

            
            # -----------------------------------------------------------
            # COMPILAR Y SIMULAR CON QUESTASIM
            # -----------------------------------------------------------
# -----------------------------------------------------------
            # COMPILACIÓN Y SIMULACIÓN NO INTERACTIVA EN BATCH
            # -----------------------------------------------------------
# -----------------------------------------------------------
            # COMPILACIÓN Y SIMULACIÓN ROBUSTA (QUESTASIM)
            # -----------------------------------------------------------
# -----------------------------------------------------------
            # COMPILACIÓN Y SIMULACIÓN MEDIANTE SCRIPT TCL AUTÓNOMO
            # -----------------------------------------------------------
# -----------------------------------------------------------
            # SIMULACIÓN BASADA EN ARCHIVO DE LOG (SIN BLOQUEOS DE VSIM)
            # -----------------------------------------------------------
# -----------------------------------------------------------
            # COMPILACIÓN Y SIMULACIÓN ROBUSTA (SCRIPT TCL FÍSICO)
            # -----------------------------------------------------------
# -----------------------------------------------------------
            # COMPILACIÓN Y SIMULACIÓN DESACOPLADA EN SHELL (NO-BLOCKING)
            # -----------------------------------------------------------
# -----------------------------------------------------------
            # COMPILACIÓN Y SIMULACIÓN CON MARGEN DE TIEMPO AMPLIADO
            # -----------------------------------------------------------
# -----------------------------------------------------------
            # COMPILACIÓN Y SIMULACIÓN CARGANDO /home/generico/.profile
            # -----------------------------------------------------------
# -----------------------------------------------------------
            # LINTER: COMPROBACIÓN DE SINTAXIS (vlog -lint)
            # -----------------------------------------------------------
            elif msg.get("accion") == "linter":
                codigo_design = msg.get("codigo", "")
                codigo_tb = msg.get("testbench", "")

                with open('../workspace/design.sv', 'w', encoding='utf-8') as f:
                    f.write(codigo_design)
                with open('../workspace/testbench.sv', 'w', encoding='utf-8') as f:
                    f.write(codigo_tb)

                cmd_lint = "bash -c 'source /home/generico/.profile 2>/dev/null; cd ../workspace && vlog -lint -sv design.sv testbench.sv 2>&1'"
                try:
                    proc_lint = await asyncio.create_subprocess_shell(
                        cmd_lint,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.STDOUT
                    )
                    stdout_lint, _ = await asyncio.wait_for(
                        proc_lint.communicate(),
                        timeout=30.0
                    )
                    lint_output = stdout_lint.decode('utf-8', errors='ignore')
                except asyncio.TimeoutError:
                    await websocket.send_text(json.dumps({
                        "status": "error_compilacion",
                        "detalles": "⚠️ Timeout: El linter tardó demasiado en responder.",
                        "transcript": "⚠️ Timeout en el linter."
                    }))
                    continue

                if proc_lint.returncode != 0:
                    await websocket.send_text(json.dumps({
                        "status": "error_compilacion",
                        "detalles": lint_output,
                        "transcript": lint_output
                    }))
                else:
                    await websocket.send_text(json.dumps({
                        "status": "linter_ok",
                        "transcript": lint_output or "✓ Sintaxis verificada correctamente sin errores."
                    }))

            # -----------------------------------------------------------
            # COMPILACIÓN Y SIMULACIÓN VÍA WRAPPER BASH
            # -----------------------------------------------------------
            elif msg.get("accion") == "compilar":
                if auto_tick_task:
                    auto_tick_task.cancel()

                if sim_process:
                    try:
                        sim_process.terminate()
                    except Exception:
                        pass

                codigo_design = msg.get("codigo", "")
                codigo_tb = msg.get("testbench", "")

                # 1. Guardar archivos de código
                with open('../workspace/design.sv', 'w', encoding='utf-8') as f:
                    f.write(codigo_design)

                with open('../workspace/testbench.sv', 'w', encoding='utf-8') as f:
                    f.write(codigo_tb)

                # 2. Compilar usando bash wrapper
                # Nota: ([ -d work ] && [ -f work/_info ] || vlib work) evita recrear
                # la librería en cada llamada, lo que ahorra 3-5 segundos por ejecución.
                cmd_vlog = "bash -c 'source /home/generico/.profile 2>/dev/null; cd ../workspace && ([ -d work ] && [ -f work/_info ] || vlib work) && vlog -sv design.sv testbench.sv'"
                proc_vlog = await asyncio.create_subprocess_shell(
                    cmd_vlog,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout_vlog, stderr_vlog = await proc_vlog.communicate()

                if proc_vlog.returncode != 0:
                    error_log = stdout_vlog.decode('utf-8', errors='ignore') + "\n" + stderr_vlog.decode('utf-8', errors='ignore')
                    await websocket.send_text(json.dumps({
                        "status": "error_compilacion", 
                        "detalles": error_log
                    }))
                    continue

                # 3. Extracción dinámica del módulo top-level
                tb_modules = re.findall(r'^\s*module\s+([a-zA-Z0-9_]+)', codigo_tb, re.MULTILINE)
                design_modules = re.findall(r'^\s*module\s+([a-zA-Z0-9_]+)', codigo_design, re.MULTILINE)

                if tb_modules:
                    top_module = tb_modules[-1]
                elif design_modules:
                    top_module = design_modules[-1]
                else:
                    top_module = "top_system"

                # 4. Invocar directamente el wrapper bash ejecutable
                cmd_run = f"../workspace/run_sim.sh {top_module}"
                
                proc_sim = await asyncio.create_subprocess_shell(
                    cmd_run,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )

                try:
                    stdout_sim, stderr_sim = await asyncio.wait_for(
                        proc_sim.communicate(), 
                        timeout=120.0  # Margen holgado para la validación de licencias en WSL2
                    )
                    out_text = stdout_sim.decode('utf-8', errors='ignore') if stdout_sim else ""
                except asyncio.TimeoutError:
                    try: 
                        proc_sim.kill()
                    except Exception: 
                        pass
                    out_text = "⚠️ Timeout: La simulación ha superado los 120 segundos (revisa si hay un bucle infinito o lentitud en el servidor de licencias)."

                if not out_text.strip():
                    out_text = "⚠️ No se obtuvo respuesta del script de simulación."

                await websocket.send_text(json.dumps({
                    "status": "compilado_ok",
                    "transcript": out_text
                }))

            # -----------------------------------------------------------
            # SIMULAR: Icarus Verilog (rápido, sin licencias)
            # iverilog compila en memoria y vvp ejecuta al instante
            # -----------------------------------------------------------
            elif msg.get("accion") == "simular":
                codigo_design = msg.get("codigo", "")
                codigo_tb = msg.get("testbench", "")

                with open('../workspace/design.sv', 'w', encoding='utf-8') as f:
                    f.write(codigo_design)
                with open('../workspace/testbench.sv', 'w', encoding='utf-8') as f:
                    f.write(codigo_tb)

                # Detectar módulo top del testbench
                tb_modules = re.findall(r'^\s*module\s+([a-zA-Z0-9_]+)', codigo_tb, re.MULTILINE)
                design_modules = re.findall(r'^\s*module\s+([a-zA-Z0-9_]+)', codigo_design, re.MULTILINE)
                if tb_modules:
                    top_module = tb_modules[-1]
                elif design_modules:
                    top_module = design_modules[-1]
                else:
                    top_module = "top_system"

                cmd_icarus = f"../workspace/run_icarus.sh {top_module} ../workspace/design.sv ../workspace/testbench.sv"
                proc_sim = await asyncio.create_subprocess_shell(
                    cmd_icarus,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT
                )
                try:
                    stdout_sim, _ = await asyncio.wait_for(proc_sim.communicate(), timeout=30.0)
                    out_text = stdout_sim.decode('utf-8', errors='ignore') if stdout_sim else ""
                except asyncio.TimeoutError:
                    try:
                        proc_sim.kill()
                    except Exception:
                        pass
                    out_text = "⚠️ Timeout: la simulación superó 30 segundos (posible bucle infinito en el testbench)."

                if not out_text.strip():
                    out_text = "⚠️ No se obtuvo salida de la simulación."

                # Distinguir error de compilación de icarus vs ejecución correcta
                if proc_sim.returncode != 0 and "error" in out_text.lower():
                    await websocket.send_text(json.dumps({
                        "status": "error_compilacion",
                        "detalles": out_text
                    }))
                else:
                    await websocket.send_text(json.dumps({
                        "status": "simulacion_ok",
                        "transcript": out_text
                    }))

            # -----------------------------------------------------------
            # AUTOCOMPLETADO IA CON OLLAMA
            # -----------------------------------------------------------
            elif msg.get("accion") == "autocompletar":
                texto = msg.get("texto", "")
                completion_id = msg.get("id", "design")
                api_key = msg.get("api_key", "")
                api_url = msg.get("api_url", "")
                model_name = msg.get("model", "")
                # Se lanza como tarea separada para no bloquear el WebSocket
                asyncio.create_task(generar_completado_ia(websocket, texto, completion_id, api_key, api_url, model_name))

            # -----------------------------------------------------------
            # INTERACCIÓN CON INTERRUPTORES / BOTONES
            # -----------------------------------------------------------
            elif msg.get("accion") == "set_sw":
                if sim_process:
                    val_hex = hex(int(msg["sw_array"], 2))[2:]
                    async with sim_lock:
                        cmds = f"catch {{force SW 10'h{val_hex}}}\nrun 50ns\n" + CMD_LEER_ESTADO
                        sim_process.stdin.write(cmds.encode())
                        await sim_process.stdin.drain()

            elif msg.get("accion") == "set_key":
                if sim_process:
                    keys_actual[msg["key_index"]] = msg["valor"]
                    bin_str = "".join(map(str, reversed(keys_actual)))
                    val_hex = hex(int(bin_str, 2))[2:]
                    async with sim_lock:
                        cmds = f"catch {{force KEY 4'h{val_hex}}}\nrun 50ns\n" + CMD_LEER_ESTADO
                        sim_process.stdin.write(cmds.encode())
                        await sim_process.stdin.drain()

    except Exception as e:
        print(f"WebSocket desconectado o Error: {e}")
        if auto_tick_task:
            auto_tick_task.cancel()