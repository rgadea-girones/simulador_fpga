import asyncio
import json
import re
import os
import html
import tempfile
import httpx
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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
    "hex": {f"HEX{i}": "1111111" for i in range(8)}
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
    "catch {echo \"MY_HEX6=[examine -radix bin HEX6]\"}\n"
    "catch {echo \"MY_HEX7=[examine -radix bin HEX7]\"}\n"
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
    for i in range(8):
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

import shutil

# ==========================================
# VISOR DE ESQUEMÁTICOS (YOSYS + NETLISTSVG + SURELOG/SYNLIG/UHDM)
# ==========================================
async def generar_esquema_svg(codigo_verilog, modulo_objetivo="auto", motor="yosys"):
    """
    Recibe un string con el código Verilog/SystemVerilog, usa Yosys (nativo o vía Synlig/Surelog+UHDM)
    junto con Netlistsvg y devuelve un string con el código HTML/SVG del dibujo.
    """
    workspace_dir = os.path.abspath("../workspace")
    os.makedirs(workspace_dir, exist_ok=True)
    
    fd_v, ruta_v = tempfile.mkstemp(suffix=".sv", dir=workspace_dir)
    fd_json, ruta_json = tempfile.mkstemp(suffix=".json", dir=workspace_dir)
    fd_svg, ruta_svg = tempfile.mkstemp(suffix=".svg", dir=workspace_dir)
    fd_ys, ruta_ys = tempfile.mkstemp(suffix=".ys", dir=workspace_dir)
    
    os.close(fd_json)
    os.close(fd_svg)
    os.close(fd_ys)
    
    try:
        with os.fdopen(fd_v, 'w', encoding='utf-8') as f:
            f.write(codigo_verilog)

        rel_v = os.path.basename(ruta_v)
        rel_json = os.path.basename(ruta_json)
        rel_ys = os.path.basename(ruta_ys)

        bin_sintesis = "yosys"

        if motor in ["surelog_uhdm", "surelog"]:
            has_synlig = shutil.which("synlig") or os.path.exists("/usr/local/bin/synlig")
            has_surelog = shutil.which("surelog") or os.path.exists("/usr/local/bin/surelog")

            if has_synlig:
                bin_sintesis = "synlig"
                with open(ruta_ys, 'w', encoding='utf-8') as f:
                    f.write(f"read_systemverilog {rel_v}\n")
                    if not modulo_objetivo or modulo_objetivo == "auto":
                        f.write("hierarchy -auto-top\n")
                    else:
                        f.write(f"hierarchy -top {modulo_objetivo}\n")
                    f.write("proc;\n")
                    f.write("opt;\n")
                    f.write("techmap * t:$mux %d;\n")
                    f.write("opt;\n")
                    f.write("abc -g AND,OR,XOR;\n")
                    f.write("opt_clean;\n")
                    f.write(f"write_json {rel_json}\n")
            elif has_surelog:
                bin_sintesis = "synlig" if has_synlig else "yosys"
                cmd_surelog = f"bash -c 'export PATH=/usr/local/bin:$PATH; cd {workspace_dir} && surelog -sverilog -writepp -parse {rel_v}'"
                proc_surelog = await asyncio.create_subprocess_shell(
                    cmd_surelog,
                    stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout_surelog, stderr_surelog = await proc_surelog.communicate()

                uhdm_path = os.path.join(workspace_dir, "slpp_all", "surelog.uhdm")
                if proc_surelog.returncode != 0 or not os.path.exists(uhdm_path):
                    err_log = stderr_surelog.decode('utf-8', errors='ignore') or stdout_surelog.decode('utf-8', errors='ignore')
                    raise Exception(f"❌ Error de parsing en Surelog (UHDM):\n{err_log}")

                rel_uhdm = "slpp_all/surelog.uhdm"
                with open(ruta_ys, 'w', encoding='utf-8') as f:
                    if not has_synlig:
                        f.write("plugin -i uhdm\n")
                    f.write(f"read_uhdm {rel_uhdm}\n")
                    if not modulo_objetivo or modulo_objetivo == "auto":
                        f.write("hierarchy -auto-top\n")
                    else:
                        f.write(f"hierarchy -top {modulo_objetivo}\n")
                    f.write("proc;\n")
                    f.write("opt;\n")
                    f.write("techmap * t:$mux %d;\n")
                    f.write("opt;\n")
                    f.write("abc -g AND,OR,XOR;\n")
                    f.write("opt_clean;\n")
                    f.write(f"write_json {rel_json}\n")
            else:
                raise Exception("❌ Surelog / Synlig no se encuentra en el PATH del servidor. Por favor verifica su instalación o selecciona 'Yosys Nativo'.")

        else:
            # SÍNTESIS CON YOSYS NATIVO
            with open(ruta_ys, 'w', encoding='utf-8') as f:
                f.write(f"read_verilog -sv {rel_v}\n")
                if not modulo_objetivo or modulo_objetivo == "auto":
                    f.write("hierarchy -auto-top\n")
                else:
                    f.write(f"hierarchy -top {modulo_objetivo}\n")
                f.write("proc;\n")
                f.write("opt;\n")
                f.write("techmap * t:$mux %d;\n")
                f.write("opt;\n")
                f.write("abc -g AND,OR,XOR;\n")
                f.write("opt_clean;\n")
                f.write(f"write_json {rel_json}\n")

        cmd_sintesis = f"bash -c 'export PATH=/usr/local/bin:$PATH; cd {workspace_dir} && {bin_sintesis} -s {rel_ys}'"
        proc_ys = await asyncio.create_subprocess_shell(
            cmd_sintesis,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout_ys, stderr_ys = await proc_ys.communicate()

        if proc_ys.returncode != 0:
            err_msg = stderr_ys.decode('utf-8', errors='ignore') or stdout_ys.decode('utf-8', errors='ignore')
            raise Exception(f"❌ Error de sintaxis o síntesis en {bin_sintesis}:\n{err_msg}")

        # 3. NETLISTSVG
        skin_path = os.path.abspath(os.path.join(workspace_dir, 'custom_skin.svg'))
        skin_arg = f"--skin {skin_path}" if os.path.exists(skin_path) else ""
        rel_svg = os.path.basename(ruta_svg)

        cmd_netlist = f"bash -c 'cd {workspace_dir} && netlistsvg {rel_json} -o {rel_svg} {skin_arg}'"
        proc_svg = await asyncio.create_subprocess_shell(
            cmd_netlist,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        _, stderr_svg = await proc_svg.communicate()

        if proc_svg.returncode != 0 or not os.path.exists(ruta_svg):
            raise Exception(f"❌ Error al dibujar el SVG con Netlistsvg:\n{stderr_svg.decode('utf-8', errors='ignore')}")

        with open(ruta_svg, "r", encoding="utf-8", errors="ignore") as f:
            svg_content = f.read()

        with open(ruta_json, "r", encoding="utf-8", errors="ignore") as f:
            netlist_data = json.load(f)

        svg_content = inyectar_metadatos_hierarquia(svg_content, netlist_data, modulo_objetivo)

        return svg_content

    finally:
        for archivo in [ruta_v, ruta_json, ruta_svg, ruta_ys]:
            try:
                if os.path.exists(archivo):
                    os.remove(archivo)
            except OSError:
                pass


def _seleccionar_modulo_renderizado(netlist_data, modulo_objetivo):
    modules = netlist_data.get("modules", {}) if isinstance(netlist_data, dict) else {}
    if not modules:
        return None

    if modulo_objetivo and modulo_objetivo != "auto" and modulo_objetivo in modules:
        return modulo_objetivo

    for module_name, module_data in modules.items():
        attrs = module_data.get("attributes", {}) if isinstance(module_data, dict) else {}
        if attrs.get("top") == "00000000000000000000000000000001":
            return module_name

    referenced_modules = set()
    for module_data in modules.values():
        cells = module_data.get("cells", {}) if isinstance(module_data, dict) else {}
        for cell_data in cells.values():
            cell_type = cell_data.get("type")
            if cell_type:
                referenced_modules.add(cell_type)

    for module_name in modules:
        if module_name not in referenced_modules:
            return module_name

    return next(iter(modules.keys()))


def inyectar_metadatos_hierarquia(svg_texto, netlist_data, modulo_objetivo):
    module_name = _seleccionar_modulo_renderizado(netlist_data, modulo_objetivo)
    if not module_name:
        return svg_texto

    modules = netlist_data.get("modules", {})
    module_data = modules.get(module_name, {})
    cells = module_data.get("cells", {}) if isinstance(module_data, dict) else {}
    if not cells:
        return svg_texto

    for instance_name, cell_data in cells.items():
        module_type = cell_data.get("type") if isinstance(cell_data, dict) else None
        if not module_type:
            continue

        patron = rf'(<g\b[^>]*(?:id|class)="[^"]*(?:cell_)?{re.escape(instance_name)}[^"]*"[^>]*)(>)'
        if re.search(patron, svg_texto):
            def reemplazo(match):
                return (
                    f'{match.group(1)} data-module="{html.escape(module_type, quote=True)}" '
                    f'data-instance="{html.escape(instance_name, quote=True)}"{match.group(2)}'
                )

            svg_texto = re.sub(patron, reemplazo, svg_texto, count=1)

    return svg_texto

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

# Servir visor Surfer WebAssembly
surfer_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "surfer"))
if os.path.exists(surfer_path):
    app.mount("/surfer", StaticFiles(directory=surfer_path, html=True), name="surfer")

@app.on_event("startup")
async def startup_cleanup_task():
    asyncio.create_task(_auto_cleanup_loop())


import time

def limpiar_vcd_antiguos(max_age_seconds: int = 1800, keep_last: int = 5):
    """Limpieza racional de archivos pesados de simulación (.vcd, .wlf, .log, .svg, .json)
    para evitar consumo continuo de disco."""
    workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../workspace"))
    if not os.path.exists(workspace_dir):
        return

    now = time.time()
    vcd_files = []
    for f in os.listdir(workspace_dir):
        filepath = os.path.join(workspace_dir, f)
        if not os.path.isfile(filepath):
            continue
        if f.endswith('.vcd'):
            try:
                mtime = os.path.getmtime(filepath)
                vcd_files.append((mtime, filepath))
            except Exception:
                pass
        elif f.endswith('.wlf') or f.endswith('.ys') or (f.endswith('.json') and f.startswith('tmp')) or (f.endswith('.svg') and f.startswith('tmp')):
            try:
                if now - os.path.getmtime(filepath) > max_age_seconds:
                    os.remove(filepath)
            except Exception:
                pass

    if vcd_files:
        vcd_files.sort(reverse=True)
        for idx, (mtime, filepath) in enumerate(vcd_files):
            if idx >= keep_last or (now - mtime > max_age_seconds):
                try:
                    os.remove(filepath)
                except Exception:
                    pass

async def _auto_cleanup_loop():
    while True:
        try:
            limpiar_vcd_antiguos(max_age_seconds=1800, keep_last=5)
        except Exception:
            pass
        await asyncio.sleep(600)  # Limpieza periódica cada 10 minutos


def obtener_info_vcd():
    workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../workspace"))
    if not os.path.exists(workspace_dir):
        return {"has_vcd": False, "vcd_file": None, "vcd_url": None}
    
    vcd_files = [f for f in os.listdir(workspace_dir) if f.endswith('.vcd')]
    if not vcd_files:
        return {"has_vcd": False, "vcd_file": None, "vcd_url": None}

    # Elegir el VCD no vacío más reciente para evitar cargar un archivo antiguo.
    candidates = []
    for vcd_name in vcd_files:
        vcd_path = os.path.join(workspace_dir, vcd_name)
        try:
            if os.path.getsize(vcd_path) > 0:
                candidates.append((os.path.getmtime(vcd_path), vcd_name))
        except Exception:
            continue

    if candidates:
        candidates.sort(reverse=True)
        _, selected_vcd = candidates[0]
        mtime = int(os.path.getmtime(os.path.join(workspace_dir, selected_vcd)))
        return {
            "has_vcd": True,
            "vcd_file": selected_vcd,
            "vcd_url": f"/vcd/{selected_vcd}?t={mtime}"
        }

    return {"has_vcd": False, "vcd_file": None, "vcd_url": None}

@app.get("/vcd/{filename}")
async def servir_vcd(filename: str):
    safe_filename = os.path.basename(filename)
    filepath = os.path.abspath(os.path.join(os.path.dirname(__file__), "../workspace", safe_filename))
    if os.path.exists(filepath) and safe_filename.endswith(".vcd"):
        return FileResponse(filepath, media_type="text/plain", headers={"Access-Control-Allow-Origin": "*"})
    raise HTTPException(status_code=404, detail="Archivo VCD no encontrado")



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
                modulo_objetivo = msg.get("modulo", "auto")
                motor_sintesis = msg.get("motor", msg.get("sintetizador", "yosys"))
                try:
                    svg_code = await generar_esquema_svg(codigo_design, modulo_objetivo, motor_sintesis)
                    await websocket.send_text(json.dumps({
                        "tipo": "esquema_svg",
                        "contenido_svg": svg_code
                    }))
                except Exception as e:
                    await websocket.send_text(json.dumps({
                        "tipo": "error",
                        "mensaje": str(e)
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
                limpiar_vcd_antiguos()
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

                is_interactive = not msg.get("testbench", "").strip()

                if is_interactive:
                    # 2. Compilar con vlog de forma directa (con flag -sv para SystemVerilog)
                    cmd_vlog = "bash -c 'source /home/generico/.profile 2>/dev/null; cd ../workspace && ([ -d work ] && [ -f work/_info ] || vlib work) && vlog -sv design.sv'"
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

                    # 3. Extracción dinámica del módulo top-level (prioriza top_system o el primer módulo declarado)
                    design_modules = re.findall(r'^\s*module\s+([a-zA-Z0-9_]+)', codigo_design, re.MULTILINE)
                    if "top_system" in design_modules:
                        top_module = "top_system"
                    elif any("top" in m.lower() for m in design_modules):
                        top_module = next(m for m in design_modules if "top" in m.lower())
                    elif design_modules:
                        top_module = design_modules[0]
                    else:
                        top_module = "top_system"

                    # 4. Iniciar vsim en segundo plano cargando el entorno y mapeando stderr a stdout
                    cmd_sim = f"bash -c 'source /home/generico/.profile 2>/dev/null; cd ../workspace && exec vsim -c -voptargs=+acc work.{top_module}'"
                    sim_process = await asyncio.create_subprocess_shell(
                        cmd_sim,
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.STDOUT
                    )

                    asyncio.create_task(leer_consola(sim_process.stdout))

                    await asyncio.sleep(0.05)
                    sw_actual = [0] * 10
                    keys_actual = [1] * 4
                    
                    # Forzar valores por defecto iniciales (reloj, interruptores y pulsadores)
                    async with sim_lock:
                        init_cmds = (
                            "transcript off\n"
                            "catch {force clk 1 0, 0 5ns -repeat 10ns}\n"
                            "catch {force KEY 4'hF}\n"
                            "catch {force SW 10'h0}\n"
                            "run 50ns\n"
                        ) + CMD_LEER_ESTADO
                        sim_process.stdin.write(init_cmds.encode())
                        await sim_process.stdin.drain()

                    await websocket.send_text(json.dumps({
                        "status": "compilado_ok",
                        "transcript": "✓ Simulación interactiva iniciada correctamente."
                    }))

                    auto_tick_task = asyncio.create_task(auto_tick_loop(websocket))
                else:
                    # 2. Compilar usando bash wrapper para simulación batch
                    cmd_vlog = "bash -c 'source /home/generico/.profile 2>/dev/null; cd ../workspace && ([ -d work ] && [ -f work/_info ] || vlib work) && vlog -sv +cover design.sv testbench.sv'"
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
                    if tb_modules:
                        top_module = tb_modules[-1]
                    else:
                        top_module = "top_system"
                    # 4. Invocar el wrapper batch. La evaluación puede pedir un wrapper
                    # específico para añadir cobertura de assertions sin afectar otros plugins.
                    run_wrapper = "../workspace/run_sim_eval.sh" if msg.get("assert_coverage") else "../workspace/run_sim.sh"
                    cmd_run = f"{run_wrapper} {top_module}"
                    
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

                    vcd_info = obtener_info_vcd()
                    resp_payload = {
                        "status": "compilado_ok",
                        "transcript": out_text
                    }
                    resp_payload.update(vcd_info)
                    await websocket.send_text(json.dumps(resp_payload))

            # -----------------------------------------------------------
            # SIMULAR: Icarus Verilog (rápido, sin licencias)
            # iverilog compila en memoria y vvp ejecuta al instante
            # -----------------------------------------------------------
            elif msg.get("accion") == "simular":
                limpiar_vcd_antiguos()
                codigo_design = msg.get("codigo", "").strip()
                codigo_tb = msg.get("testbench", "").strip()

                with open('../workspace/design.sv', 'w', encoding='utf-8') as f:
                    f.write(codigo_design)

                if codigo_tb and codigo_tb != codigo_design:
                    with open('../workspace/testbench.sv', 'w', encoding='utf-8') as f:
                        f.write(codigo_tb)
                    archivos_sim = "../workspace/design.sv ../workspace/testbench.sv"
                else:
                    with open('../workspace/testbench.sv', 'w', encoding='utf-8') as f:
                        f.write("// Mismo contenido que design.sv\n")
                    archivos_sim = "../workspace/design.sv"

                # Detectar módulo top priorizando testbenches (tb_...)
                modulos = re.findall(r'^\s*module\s+([a-zA-Z0-9_]+)', (codigo_tb + "\n" + codigo_design), re.MULTILINE)
                tb_candidates = [m for m in modulos if m.lower().startswith('tb') or 'test' in m.lower()]
                if tb_candidates:
                    top_module = tb_candidates[-1]
                elif modulos:
                    top_module = modulos[-1]
                else:
                    top_module = "top_system"

                cmd_icarus = f"../workspace/run_icarus.sh {top_module} {archivos_sim}"
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
                        "detalles": out_text,
                        "has_vcd": False
                    }))
                else:
                    vcd_info = obtener_info_vcd()
                    resp_payload = {
                        "status": "simulacion_ok",
                        "transcript": out_text
                    }
                    resp_payload.update(vcd_info)
                    await websocket.send_text(json.dumps(resp_payload))

            # -----------------------------------------------------------
            # COMPROBAR ESTADO VCD (PARA SIMULADOR-AVANZADO)
            # -----------------------------------------------------------
            elif msg.get("accion") == "check_vcd":
                vcd_info = obtener_info_vcd()
                resp_payload = {"tipo": "vcd_status"}
                resp_payload.update(vcd_info)
                await websocket.send_text(json.dumps(resp_payload))

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
                    sw_str = msg["sw_array"]
                    cmds = ""
                    for idx, char in enumerate(reversed(sw_str)):
                        cmds += f"catch {{force SW[{idx}] {char}}}\n"
                    cmds += "run 50ns\n" + CMD_LEER_ESTADO
                    async with sim_lock:
                        sim_process.stdin.write(cmds.encode())
                        await sim_process.stdin.drain()

            elif msg.get("accion") == "set_key":
                if sim_process:
                    idx = msg["key_index"]
                    val = msg["valor"]
                    async with sim_lock:
                        cmds = f"catch {{force KEY[{idx}] {val}}}\nrun 50ns\n" + CMD_LEER_ESTADO
                        sim_process.stdin.write(cmds.encode())
                        await sim_process.stdin.drain()

    except Exception as e:
        print(f"WebSocket desconectado o Error: {e}")
        if auto_tick_task:
            auto_tick_task.cancel()