#!/bin/bash

# 1. Cargar el entorno de usuario con la licencia y PATHs de QuestaSim
source /home/generico/.profile 2>/dev/null || true

# 2. Moverse al directorio del workspace
CD_DIR="$(dirname "$0")"
cd "$CD_DIR" || exit 1

TOP_MODULE=$1
if [ -z "$TOP_MODULE" ]; then
    TOP_MODULE="tb_flipflop_d"
fi

# 3. Crear script TCL al vuelo
cat << 'EOF' > run.tcl
onbreak {resume}
onerror {resume}
# Fuerza trazado VCD para cualquier testbench, incluso sin $dumpvars.
catch {vcd file wave.vcd}
catch {vcd add -r /*}
run -all
puts "=== ASSERT COVERAGE BEGIN ==="
coverage report -assert -detail
puts "=== ASSERT COVERAGE END ==="
catch {vcd flush}
catch {vcd off}
exit -force
EOF

# 4. Limpiar log previo
rm -f sim.log

# 5. Invocación de vsim redirigiendo TTY de forma limpia
vsim -c -coverage -onfinish stop -voptargs="+acc +cover" -l sim.log -do run.tcl "work.${TOP_MODULE}" < /dev/null > /dev/null 2>&1

# 6. Devolver el contenido del log a stdout
if [ -f sim.log ]; then
    grep -v -E '^# //|^# Start time:|^# End time:|^# Copyright|^#   All Rights|^#   secrets|^#   Mentor|^#   and exempt|^#   5 U\.S\.C|^#   is prohibited|^#   18 U\.S\.C' sim.log
else
    echo "❌ Error: No se generó sim.log"
fi
