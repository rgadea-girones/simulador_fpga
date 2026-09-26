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
