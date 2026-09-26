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
