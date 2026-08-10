#!/bin/bash
# Simulación rápida con Icarus Verilog (sin licencias, sin esperas)
# Uso: ./run_icarus.sh <top_module> <archivo1.sv> [archivo2.sv ...]

CD_DIR="$(dirname "$0")"
cd "$CD_DIR" || exit 1

TOP_MODULE=$1
shift
ARCHIVOS="$@"

if [ -z "$TOP_MODULE" ] || [ -z "$ARCHIVOS" ]; then
    echo "❌ Uso: run_icarus.sh <top_module> <archivos...>"
    exit 1
fi

# 1. Compilar con iverilog (-g2012 habilita SystemVerilog básico)
iverilog -g2012 -o sim.vvp -s "$TOP_MODULE" $ARCHIVOS 2>&1
if [ $? -ne 0 ]; then
    exit 1
fi

# 2. Ejecutar la simulación
vvp sim.vvp 2>&1

# 3. Limpieza
rm -f sim.vvp
