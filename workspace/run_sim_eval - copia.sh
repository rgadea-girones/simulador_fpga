#!/bin/bash

source /home/generico/.profile 2>/dev/null || true

CD_DIR="$(dirname "$0")"
cd "$CD_DIR" || exit 1

TOP_MODULE=$1
if [ -z "$TOP_MODULE" ]; then
    TOP_MODULE="tb_flipflop_d"
fi

cat << 'EOF' > run_eval.tcl
onbreak {resume}
onerror {resume}
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

rm -f sim.log

vsim -c -coverage -onfinish stop -voptargs="+acc +cover" -l sim.log -do run_eval.tcl "work.${TOP_MODULE}" < /dev/null > /dev/null 2>&1

if [ -f sim.log ]; then
    grep -v -E '^# //|^# Start time:|^# End time:|^# Copyright|^#   All Rights|^#   secrets|^#   Mentor|^#   and exempt|^#   5 U\.S\.C|^#   is prohibited|^#   18 U\.S\.C' sim.log
else
    echo "❌ Error: No se generó sim.log"
fi