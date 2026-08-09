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
run -all
exit -force
EOF

# 4. Limpiar log previo
rm -f sim.log

# 5. Invocación de vsim redirigiendo TTY de forma limpia
vsim -c -voptargs=+acc -l sim.log -do run.tcl "work.${TOP_MODULE}" < /dev/null > /dev/null 2>&1

# 6. Devolver el contenido del log a stdout
if [ -f sim.log ]; then
    cat sim.log
else
    echo "❌ Error: No se generó sim.log"
fi
