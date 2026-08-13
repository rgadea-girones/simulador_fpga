import asyncio
import json
import re
import os
import tempfile
from fastapi import FastAPI, WebSocket
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
# SERVIDOR FASTAPI Y WEBSOCKETS
# ==========================================
app = FastAPI()

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
            if msg.get("accion") == "ver_esquema":
                codigo_alumno = msg.get("codigo", "")
                modulo_pedido = msg.get("modulo", "auto") # <-- NUEVO                
                try:
                    svg_texto = await generar_esquema_svg(codigo_alumno, modulo_pedido)
                    await websocket.send_text(json.dumps({
                        "tipo": "esquema_svg",
                        "contenido_svg": svg_texto
                    }))
                except Exception as e:
                    await websocket.send_text(json.dumps({
                        "tipo": "error",
                        "mensaje": str(e)
                    }))
            
            # -----------------------------------------------------------
            # COMPILAR Y SIMULAR CON QUESTASIM
            # -----------------------------------------------------------
            elif msg.get("accion") == "compilar":
                if auto_tick_task:
                    auto_tick_task.cancel()
                    
                if sim_process:
                    try: sim_process.terminate()
                    except: pass
                
                with open('../workspace/ejercicio_fsm.v', 'w') as f:
                    f.write(msg["codigo"])
                
                proc = await asyncio.create_subprocess_exec(
                    'vlog', 'ejercicio_fsm.v', cwd='../workspace',
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                stdout, _ = await proc.communicate()
                
                if proc.returncode != 0:
                    error_log = stdout.decode('utf-8', errors='ignore')
                    await websocket.send_text(json.dumps({"status": "error_compilacion", "detalles": error_log}))
                    continue

                sim_process = await asyncio.create_subprocess_exec(
                    'vsim', '-c', '-voptargs=+acc', 'work.top_system', cwd='../workspace',
                    stdin=asyncio.subprocess.PIPE, 
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL  # <-- ESTO SILENCIA EL SIGTERM Y EL STACK TRACE
                )
                asyncio.create_task(leer_consola(sim_process.stdout))
                
                await asyncio.sleep(1.5)
                sw_actual = [0] * 10
                keys_actual = [1] * 4
                
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
                
                await asyncio.sleep(0.5)
                await websocket.send_text(json.dumps({"status": "compilado_ok"}))
                
                auto_tick_task = asyncio.create_task(auto_tick_loop(websocket))

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