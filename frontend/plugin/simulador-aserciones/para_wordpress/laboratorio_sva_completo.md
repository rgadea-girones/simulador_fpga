# Laboratorio Virtual de Aserciones Concurrentes en SystemVerilog

Este laboratorio esta orientado a estudiantes que aprenden en paralelo diseno digital y verificacion con SVA.
Todos los ejemplos son autocontenidos, sin UVM, y compatibles con sintaxis SystemVerilog estandar.

---

## NIVEL BASICO

### Ejemplo B1: Req/Ack a latencia fija
1. Titulo: Req/Ack con ACK exacto a 2 ciclos
2. Objetivo didactico: Verificar una latencia fija con `|-> ##N`.
3. Conceptos aprendidos: handshake, latencia fija, `disable iff`.
4. Explicacion teorica breve: Si `req` sube, `ack` debe subir exactamente 2 ciclos despues.
5. Cronograma temporal en ASCII:
```
clk : ^ . ^ . ^ . ^ . ^
req : 0   1   0   0   0
ack : 0   0   0   1   0
          t0      t0+2
```
6. Codigo completo del DUT (module dut):
```systemverilog
module dut(
  input  logic clk,
  input  logic rst_n,
  input  logic req,
  output logic ack
);
  logic [1:0] sh;
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      sh  <= 2'b00;
      ack <= 1'b0;
    end else begin
      sh  <= {sh[0], req};
      ack <= sh[1];
    end
  end
endmodule
```
7. Codigo completo del testbench:
```systemverilog
module tb;
  logic clk=0, rst_n=0, req;
  logic ack;
  dut u0(.clk(clk), .rst_n(rst_n), .req(req), .ack(ack));

  always #5 clk = ~clk;

  property p_req_ack_fija;
    @(posedge clk) disable iff(!rst_n)
      req |-> ##2 ack;
  endproperty

  assert_req_ack_fija: assert property(p_req_ack_fija)
    else $error("ACK no llego a 2 ciclos");

  initial begin
    req = 0;
    repeat (2) @(posedge clk);
    rst_n = 1;
    @(posedge clk); req <= 1;
    @(posedge clk); req <= 0;
    repeat (5) @(posedge clk);
    $finish;
  end
endmodule
```
8. Asercion concurrente comentada linea a linea:
```systemverilog
property p_req_ack_fija;                 // Declaracion de la propiedad
  @(posedge clk) disable iff(!rst_n)     // Muestreo en flanco de subida, ignorar durante reset
    req |-> ##2 ack;                     // Si req=1, entonces ack=1 exactamente 2 ciclos despues
endproperty                               // Fin de propiedad
```
9. Explicacion del operador SVA utilizado: `|->` es implicacion superpuesta; `##2` desplaza la evaluacion 2 ciclos.
10. Resultado esperado: Pasa cuando ACK aparece en ciclo exacto.
11. Caso correcto: `req` en t0, `ack` en t0+2.
12. Caso erroneo: `ack` en t0+1 o t0+3.
13. Pregunta de reflexion: Que cambia si usas `|=>` en vez de `|->`?
14. Ejercicio propuesto: Cambia la latencia fija de 2 a 3 ciclos solo en la asercion, manteniendo el DUT.
15. Solucion del ejercicio: Reemplazar `##2` por `##3` en la propiedad, sin tocar el DUT.

### Ejemplo B2: Req/Ack con timeout
1. Titulo: Req/Ack con ventana maxima de respuesta
2. Objetivo didactico: Verificar que ACK ocurra antes de un limite temporal.
3. Conceptos aprendidos: rangos temporales `##[m:n]`.
4. Explicacion teorica breve: Tras `req`, `ack` debe ocurrir entre 1 y 4 ciclos.
5. Cronograma temporal en ASCII:
```
clk : ^ . ^ . ^ . ^ . ^ . ^
req : 0   1   0   0   0   0
ack : 0   0   1   0   0   0   (valido)
```
6. DUT:
```systemverilog
module dut(
  input  logic clk, rst_n, req,
  output logic ack
);
  logic [2:0] cnt;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin cnt<=0; ack<=0; end
    else begin
      if(req) cnt <= 3'd3;
      else if(cnt!=0) cnt <= cnt - 1'b1;
      ack <= (cnt==1);
    end
  end
endmodule
```
7. Testbench:
```systemverilog
module tb;
  logic clk=0, rst_n=0, req; logic ack;
  dut u0(.clk(clk), .rst_n(rst_n), .req(req), .ack(ack));
  always #5 clk=~clk;

  property p_req_ack_timeout;
    @(posedge clk) disable iff(!rst_n)
      req |-> ##[1:4] ack;
  endproperty

  assert property(p_req_ack_timeout) else $error("Timeout de ACK");

  initial begin
    req=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) req<=1;
    @(posedge clk) req<=0;
    repeat(8) @(posedge clk);
    $finish;
  end
endmodule
```
8. Asercion comentada:
```systemverilog
property p_req_ack_timeout;              // Propiedad de timeout
  @(posedge clk) disable iff(!rst_n)     // Reloj y mascara de reset
    req |-> ##[1:4] ack;                 // ACK debe aparecer entre 1 y 4 ciclos
endproperty                               // Fin
```
9. Operador: `##[1:4]` define ventana de ciclos permitidos.
10. Resultado esperado: Pasa si ACK llega dentro de ventana.
11. Caso correcto: ACK en +2.
12. Caso erroneo: ACK en +5 o nunca.
13. Reflexion: Como cambia el diseno si varias `req` se solapan?
14. Ejercicio: Cambiar timeout a 6 ciclos.
15. Solucion: `##[1:6]`.

### Ejemplo B3: Pulsos de un ciclo
1. Titulo: Validacion de pulso unitario
2. Objetivo didactico: Garantizar ancho de pulso de 1 ciclo.
3. Conceptos aprendidos: deteccion de flanco con `$rose`.
4. Explicacion teorica breve: Si la senal sube, al siguiente ciclo debe bajar.
5. Cronograma:
```
pulse: 0 1 0 (ok)
pulse: 0 1 1 (error)
```
6. DUT:
```systemverilog
module dut(input logic clk, rst_n, trig, output logic pulse);
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) pulse <= 0;
    else pulse <= trig;
  end
endmodule
```
7. TB:
```systemverilog
module tb;
  logic clk=0, rst_n=0, trig, pulse;
  dut u0(.clk(clk), .rst_n(rst_n), .trig(trig), .pulse(pulse));
  always #5 clk=~clk;

  property p_un_ciclo;
    @(posedge clk) disable iff(!rst_n)
      $rose(pulse) |-> ##1 !pulse;
  endproperty
  assert property(p_un_ciclo) else $error("Pulso > 1 ciclo");

  initial begin
    trig=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) trig<=1; @(posedge clk) trig<=0;
    repeat(3) @(posedge clk); $finish;
  end
endmodule
```
8. Asercion comentada:
```systemverilog
$rose(pulse)                 // Detecta transicion 0->1
|-> ##1 !pulse;              // Obliga a cero exactamente un ciclo despues
```
9. Operador: `$rose` detecta flanco de subida en la muestra del reloj.
10. Resultado: Pulso de mas de un ciclo dispara error.
11. Correcto: `010`.
12. Erroneo: `0110`.
13. Reflexion: Como verificar ancho de 2 ciclos?
14. Ejercicio: Crear assertion para ancho exacto 2.
15. Solucion: `$rose(pulse) |-> pulse ##1 !pulse;`.

### Ejemplo B4: Exclusión mutua
1. Titulo: Canales mutuamente excluyentes
2. Objetivo didactico: Evitar que dos grants sean simultaneos.
3. Conceptos aprendidos: invariante de seguridad.
4. Teoria: `gnt_a` y `gnt_b` no pueden valer 1 en el mismo ciclo.
5. Cronograma:
```
gnt_a: 0 1 0
gnt_b: 0 0 1 (ok)
gnt_b: 0 1 0 (error en ciclo central)
```
6. DUT:
```systemverilog
module dut(input logic clk, rst_n, req_a, req_b, output logic gnt_a, gnt_b);
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin gnt_a<=0; gnt_b<=0; end
    else begin
      gnt_a <= req_a & ~req_b;
      gnt_b <= req_b & ~req_a;
    end
  end
endmodule
```
7. TB:
```systemverilog
module tb;
  logic clk=0,rst_n=0,req_a,req_b,gnt_a,gnt_b;
  dut u0(.clk(clk),.rst_n(rst_n),.req_a(req_a),.req_b(req_b),.gnt_a(gnt_a),.gnt_b(gnt_b));
  always #5 clk=~clk;

  property p_mutex;
    @(posedge clk) disable iff(!rst_n)
      !(gnt_a && gnt_b);
  endproperty
  assert property(p_mutex) else $error("Violacion de exclusion mutua");

  initial begin
    req_a=0; req_b=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) req_a<=1; req_b<=0;
    @(posedge clk) req_a<=0; req_b<=1;
    repeat(3) @(posedge clk); $finish;
  end
endmodule
```
8. Asercion comentada:
```systemverilog
!(gnt_a && gnt_b);           // Nunca ambos grants activos al mismo tiempo
```
9. Operador: expresion booleana como propiedad de ciclo.
10. Resultado: Falla solo si ambos son 1 simultaneamente.
11. Correcto: grants alternados.
12. Erroneo: grants solapados.
13. Reflexion: Como extender a 4 canales?
14. Ejercicio: Escribir assertion con `$onehot0`.
15. Solucion: `assert property(@(posedge clk) $onehot0({gnt3,gnt2,gnt1,gnt0}));`

### Ejemplo B5: Comprobacion de reset
1. Titulo: Estado conocido tras reset
2. Objetivo: Verificar inicializacion correcta.
3. Conceptos: `|=>` y condicion post-reset.
4. Teoria: Al liberarse reset, contador debe arrancar en 0.
5. Cronograma:
```
rst_n: 0 0 1
cnt  : X 0 0
```
6. DUT:
```systemverilog
module dut(input logic clk, rst_n, en, output logic [3:0] cnt);
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) cnt <= 4'd0;
    else if(en) cnt <= cnt + 1'b1;
  end
endmodule
```
7. TB:
```systemverilog
module tb;
  logic clk=0,rst_n=0,en; logic [3:0] cnt;
  dut u0(.clk(clk),.rst_n(rst_n),.en(en),.cnt(cnt));
  always #5 clk=~clk;

  property p_post_reset_cero;
    @(posedge clk)
      $rose(rst_n) |=> (cnt==0);
  endproperty
  assert property(p_post_reset_cero) else $error("cnt no arranca en cero");

  initial begin
    en=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) en=1;
    repeat(4) @(posedge clk); $finish;
  end
endmodule
```
8. Asercion comentada:
```systemverilog
$rose(rst_n)                 // Detecta liberacion de reset
|=> (cnt==0);                // En el ciclo siguiente, contador debe ser cero
```
9. Operador: `|=>` implicacion no superpuesta (evalua desde siguiente ciclo).
10. Resultado: Detecta reset mal cableado.
11. Correcto: cnt=0 tras liberar reset.
12. Erroneo: cnt conserva valor previo.
13. Reflexion: Conviene verificar tambien en el mismo ciclo?
14. Ejercicio: Exigir `cnt==0` por dos ciclos.
15. Solucion: `$rose(rst_n) |=> (cnt==0) ##1 (cnt==0);`

### Ejemplo B6: Cambios de estado simples
1. Titulo: FSM con transicion valida IDLE->BUSY
2. Objetivo: Verificar legalidad de transiciones.
3. Conceptos: comprobacion de estados.
4. Teoria: Si `start` llega en IDLE, siguiente estado debe ser BUSY.
5. Cronograma:
```
state: IDLE BUSY DONE
start:  1    0    0
```
6. DUT:
```systemverilog
module dut(input logic clk,rst_n,start,done,output logic [1:0] state);
  localparam IDLE=2'd0, BUSY=2'd1, DONE=2'd2;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) state<=IDLE;
    else case(state)
      IDLE: if(start) state<=BUSY;
      BUSY: if(done)  state<=DONE;
      DONE:          state<=IDLE;
    endcase
  end
endmodule
```
7. TB:
```systemverilog
module tb;
  logic clk=0,rst_n=0,start,done; logic [1:0] state;
  dut u0(.clk(clk),.rst_n(rst_n),.start(start),.done(done),.state(state));
  always #5 clk=~clk;

  localparam IDLE=2'd0, BUSY=2'd1;
  property p_idle_a_busy;
    @(posedge clk) disable iff(!rst_n)
      (state==IDLE && start) |=> (state==BUSY);
  endproperty
  assert property(p_idle_a_busy) else $error("Transicion IDLE->BUSY invalida");

  initial begin
    start=0; done=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) start<=1; @(posedge clk) start<=0;
    @(posedge clk) done<=1;  @(posedge clk) done<=0;
    repeat(3) @(posedge clk); $finish;
  end
endmodule
```
8. Asercion comentada:
```systemverilog
(state==IDLE && start)       // Antecedente: start en IDLE
|=> (state==BUSY);           // Consecuente: siguiente ciclo BUSY
```
9. Operador: condicion de antecedente compuesta.
10. Resultado: Falla si FSM salta a estado incorrecto.
11. Correcto: IDLE->BUSY.
12. Erroneo: IDLE->DONE.
13. Reflexion: Que otras transiciones conviene bloquear?
14. Ejercicio: Verificar BUSY->DONE cuando `done`.
15. Solucion: `assert property(@(posedge clk) disable iff(!rst_n) (state==BUSY && done) |=> state==2'd2);`

---

## NIVEL INTERMEDIO

### Ejemplo I1: sequence y concatenacion temporal ##
1. Titulo: Protocolo start, busy, done
2. Objetivo: Componer patrones con `sequence`.
3. Conceptos: `sequence`, `##`.
4. Teoria: Tras `start`, debe venir `busy` y luego `done`.
5. Cronograma:
```
start: 1 0 0
busy : 0 1 0
done : 0 0 1
```
6. DUT:
```systemverilog
module dut(input logic clk,rst_n,start,output logic busy,done);
  logic [1:0] ph;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin ph<=0; busy<=0; done<=0; end
    else begin
      done<=0;
      if(start) begin ph<=2; busy<=1; end
      else if(ph!=0) begin ph<=ph-1; if(ph==1) begin busy<=0; done<=1; end end
    end
  end
endmodule
```
7. TB:
```systemverilog
module tb;
 logic clk=0,rst_n=0,start,busy,done;
 dut u0(.clk(clk),.rst_n(rst_n),.start(start),.busy(busy),.done(done));
 always #5 clk=~clk;

 sequence s_transaccion;
   start ##1 busy ##1 done;
 endsequence

 assert property(@(posedge clk) disable iff(!rst_n) s_transaccion)
   else $error("Patron start-busy-done roto");

 initial begin
   start=0; repeat(2) @(posedge clk); rst_n=1;
   @(posedge clk) start<=1; @(posedge clk) start<=0;
   repeat(6) @(posedge clk); $finish;
 end
endmodule
```
8. Asercion comentada:
```systemverilog
sequence s_transaccion;       // Secuencia reutilizable
  start ##1 busy ##1 done;    // Concatenacion temporal exacta
endsequence
```
9. Operador: `##1` exige separacion exacta de 1 ciclo.
10. Resultado: pasa cuando se respeta orden y tiempos.
11. Correcto: start-busy-done en 3 ciclos.
12. Erroneo: done sin busy previo.
13. Reflexion: Cuando conviene declarar `sequence` aparte?
14. Ejercicio: Inserta un ciclo extra de busy.
15. Solucion: `start ##1 busy ##1 busy ##1 done`.

### Ejemplo I2: rangos ##[m:n] y first_match
1. Titulo: Primera respuesta valida en una ventana
2. Objetivo: Seleccionar el primer match temporal.
3. Conceptos: `##[m:n]`, `first_match`.
4. Teoria: Tras `req`, se acepta solo el primer `ack` entre 1 y 4 ciclos.
5. Cronograma:
```
req: 1 0 0 0 0
ack: 0 0 1 1 0
          ^ primer match
```
6. DUT:
```systemverilog
module dut(input logic clk,rst_n,req,output logic ack);
  logic [2:0] c;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin c<=0; ack<=0; end
    else begin
      if(req) c<=3;
      else if(c!=0) c<=c-1;
      ack <= (c==2) || (c==1);
    end
  end
endmodule
```
7. TB:
```systemverilog
module tb;
 logic clk=0,rst_n=0,req,ack;
 dut u0(.clk(clk),.rst_n(rst_n),.req(req),.ack(ack));
 always #5 clk=~clk;

 property p_primer_ack;
   @(posedge clk) disable iff(!rst_n)
     req |-> first_match(##[1:4] ack);
 endproperty
 assert property(p_primer_ack) else $error("No hubo primer ACK valido");

 initial begin
   req=0; repeat(2) @(posedge clk); rst_n=1;
   @(posedge clk) req<=1; @(posedge clk) req<=0;
   repeat(8) @(posedge clk); $finish;
 end
endmodule
```
8. Asercion comentada:
```systemverilog
req |->                             // Disparo con req
first_match(##[1:4] ack);           // Toma el primer ciclo donde ack vale 1 en la ventana
```
9. Operador: `first_match` fija la primera coincidencia posible.
10. Resultado: evita ambiguedad cuando hay multiples ACK.
11. Correcto: primer ACK en +2.
12. Erroneo: sin ACK en ventana.
13. Reflexion: Que utilidad tiene en pipelines no deterministas?
14. Ejercicio: Cambia ventana a 2..6.
15. Solucion: `first_match(##[2:6] ack)`.

### Ejemplo I3: repetition [*], throughout, until_with
1. Titulo: `valid` sostenido hasta aceptar transaccion
2. Objetivo: Verificar persistencia y termino de una condicion.
3. Conceptos: `[*]`, `throughout`, `until_with`.
4. Teoria: Si `valid` sube, debe mantenerse hasta handshake `ready`.
5. Cronograma:
```
valid: 0 1 1 1 0
ready: 0 0 0 1 0
```
6. DUT:
```systemverilog
module dut(input logic clk,rst_n,go,ready_i,output logic valid,ready);
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin valid<=0; ready<=0; end
    else begin
      ready <= ready_i;
      if(go) valid<=1;
      else if(valid && ready) valid<=0;
    end
  end
endmodule
```
7. TB:
```systemverilog
module tb;
 logic clk=0,rst_n=0,go,ready_i,valid,ready;
 dut u0(.clk(clk),.rst_n(rst_n),.go(go),.ready_i(ready_i),.valid(valid),.ready(ready));
 always #5 clk=~clk;

 assert property(@(posedge clk) disable iff(!rst_n)
   $rose(valid) |-> (valid throughout (!ready[*0:$])) ##1 ready)
   else $error("valid no se sostuvo hasta ready");

 assert property(@(posedge clk) disable iff(!rst_n)
   valid until_with ready)
   else $error("valid cayo antes de ready");

 initial begin
   go=0; ready_i=0; repeat(2) @(posedge clk); rst_n=1;
   @(posedge clk) go<=1; @(posedge clk) go<=0;
   repeat(2) @(posedge clk); ready_i<=1;
   @(posedge clk) ready_i<=0;
   repeat(4) @(posedge clk); $finish;
 end
endmodule
```
8. Asercion comentada:
```systemverilog
$rose(valid) |->                            // Inicio de transaccion
(valid throughout (!ready[*0:$])) ##1 ready // valid permanece 1 durante todo el tramo sin ready
```
9. Operador: `throughout` impone una condicion durante toda una secuencia; `until_with` exige que la condicion final ocurra.
10. Resultado: detecta drops prematuros de `valid`.
11. Correcto: `valid` alto hasta `ready`.
12. Erroneo: `valid` baja antes de `ready`.
13. Reflexion: Que pasa si `ready` nunca llega?
14. Ejercicio: Agregar timeout maximo 5 ciclos.
15. Solucion: combinar con `##[1:5] ready`.

### Ejemplo I4: valid/ready y estabilidad de datos
1. Titulo: Datos estables mientras espera handshake
2. Objetivo: Verificar integridad de payload.
3. Conceptos: `valid/ready`, `$stable`.
4. Teoria: Si `valid=1` y `ready=0`, `data` no debe cambiar.
5. Cronograma:
```
valid: 1 1 1
ready: 0 0 1
data : A A A (ok)
```
6. DUT:
```systemverilog
module dut(input logic clk,rst_n,load,ready, input logic [7:0] din,
           output logic valid, output logic [7:0] data);
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin valid<=0; data<=0; end
    else begin
      if(load) begin valid<=1; data<=din; end
      else if(valid && ready) valid<=0;
    end
  end
endmodule
```
7. TB:
```systemverilog
module tb;
  logic clk=0,rst_n=0,load,ready; logic [7:0] din,data; logic valid;
  dut u0(.clk(clk),.rst_n(rst_n),.load(load),.ready(ready),.din(din),.valid(valid),.data(data));
  always #5 clk=~clk;

  assert property(@(posedge clk) disable iff(!rst_n)
    (valid && !ready) |=> $stable(data))
    else $error("Data cambio sin handshake");

  initial begin
    load=0; ready=0; din=8'h00;
    repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) din<=8'hA5; load<=1;
    @(posedge clk) load<=0;
    repeat(2) @(posedge clk); ready<=1;
    @(posedge clk) ready<=0;
    repeat(3) @(posedge clk); $finish;
  end
endmodule
```
8. Asercion comentada:
```systemverilog
(valid && !ready) |=> $stable(data);   // Si aun no se acepta, payload debe mantenerse
```
9. Operador: `$stable(expr)` evalua que no hubo cambio entre muestras.
10. Resultado: detecta corrupcion de bus.
11. Correcto: data constante hasta ready.
12. Erroneo: data cambia en espera.
13. Reflexion: Tambien deberia mantenerse `valid`?
14. Ejercicio: agregar assertion para `valid`.
15. Solucion: `(valid && !ready) |=> valid;`

### Ejemplo I5: latencia parametrizable
1. Titulo: Handshake con parametro LAT
2. Objetivo: Diseñar assertions reutilizables con parametros.
3. Conceptos: parametro en DUT y propiedad.
4. Teoria: ACK debe llegar en exactamente `LAT` ciclos.
5. Cronograma:
```
LAT=3: req en t0, ack en t0+3
```
6. DUT:
```systemverilog
module dut #(parameter int LAT=3)(
  input logic clk,rst_n,req,
  output logic ack
);
  logic [LAT-1:0] sh;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin sh<='0; ack<=0; end
    else begin sh <= {sh[LAT-2:0], req}; ack <= sh[LAT-1]; end
  end
endmodule
```
7. TB:
```systemverilog
module tb;
  parameter int LAT=3;
  logic clk=0,rst_n=0,req,ack;
  dut #(.LAT(LAT)) u0(.clk(clk),.rst_n(rst_n),.req(req),.ack(ack));
  always #5 clk=~clk;

  property p_lat_param;
    @(posedge clk) disable iff(!rst_n)
      req |-> ##LAT ack;
  endproperty
  assert property(p_lat_param) else $error("Latencia incorrecta");

  initial begin
    req=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) req<=1; @(posedge clk) req<=0;
    repeat(8) @(posedge clk); $finish;
  end
endmodule
```
8. Asercion comentada:
```systemverilog
req |-> ##LAT ack;              // LAT es parametro de compilacion
```
9. Operador: concatenacion temporal con desplazamiento parametrizado.
10. Resultado: misma propiedad para varios productos.
11. Correcto: ack en `LAT` exacto.
12. Erroneo: ack fuera de latencia.
13. Reflexion: Conviene permitir rango alrededor de LAT?
14. Ejercicio: permitir LAT o LAT+1.
15. Solucion: `req |-> ##[LAT:LAT+1] ack;`

---

## NIVEL AVANZADO

### Ejemplo A1: Variables locales y captura de operandos
1. Titulo: Captura de operandos en propiedad
2. Objetivo: Relacionar entrada y salida a traves de tiempo.
3. Conceptos: variables locales en `property`.
4. Teoria: Capturamos `a` y `b` al iniciar operacion y verificamos resultado posterior.
5. Cronograma:
```
start: 1 0 0
a,b  : 3,4
done : 0 0 1
res  :      7
```
6. DUT:
```systemverilog
module dut(input logic clk,rst_n,start,
           input logic [7:0] a,b,
           output logic done,
           output logic [7:0] res);
  logic [1:0] c;
  logic [7:0] ar, br;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin c<=0; done<=0; res<=0; ar<=0; br<=0; end
    else begin
      done<=0;
      if(start) begin ar<=a; br<=b; c<=2; end
      else if(c!=0) begin c<=c-1; if(c==1) begin res<=ar+br; done<=1; end end
    end
  end
endmodule
```
7. TB:
```systemverilog
module tb;
 logic clk=0,rst_n=0,start,done; logic [7:0] a,b,res;
 dut u0(.clk(clk),.rst_n(rst_n),.start(start),.a(a),.b(b),.done(done),.res(res));
 always #5 clk=~clk;

 property p_capture;
   logic [7:0] va,vb;
   @(posedge clk) disable iff(!rst_n)
     (start, va=a, vb=b) |-> ##2 (done && res==va+vb);
 endproperty
 assert property(p_capture) else $error("Resultado no coincide con operandos capturados");

 initial begin
   start=0; a=0; b=0; repeat(2) @(posedge clk); rst_n=1;
   @(posedge clk) begin a<=8'd3; b<=8'd4; start<=1; end
   @(posedge clk) start<=0;
   repeat(6) @(posedge clk); $finish;
 end
endmodule
```
8. Asercion comentada:
```systemverilog
logic [7:0] va,vb;                    // Variables locales de la propiedad
(start, va=a, vb=b) |->               // Captura en el instante del start
##2 (done && res==va+vb);             // Verifica 2 ciclos despues con los valores capturados
```
9. Operador: asignaciones en antecedente para muestrear datos historicos.
10. Resultado: detecta errores de pipeline interno.
11. Correcto: res = a+b capturados.
12. Erroneo: res usa valores nuevos no capturados.
13. Reflexion: Por que no basta comparar con `a+b` en el ciclo de `done`?
14. Ejercicio: Extender a resta.
15. Solucion: capturar un opcode y seleccionar operacion esperada.

### Ejemplo A2: Multiplicador multiciclo y correlacion start-done
1. Titulo: start-done para multiplicador de 3 ciclos
2. Objetivo: Verificar latencia y exactitud funcional.
3. Conceptos: correlacion start/done, multiciclo.
4. Teoria: Toda operacion iniciada termina 3 ciclos despues con producto correcto.
5. Cronograma:
```
start: 1 0 0 0
done : 0 0 0 1
```
6. DUT:
```systemverilog
module dut(input logic clk,rst_n,start,
           input logic [7:0] a,b,
           output logic done,
           output logic [15:0] p);
  logic [1:0] c; logic [7:0] ar,br;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin c<=0; done<=0; p<=0; end
    else begin
      done<=0;
      if(start) begin ar<=a; br<=b; c<=3; end
      else if(c!=0) begin c<=c-1; if(c==1) begin p<=ar*br; done<=1; end end
    end
  end
endmodule
```
7. TB:
```systemverilog
module tb;
 logic clk=0,rst_n=0,start,done; logic [7:0] a,b; logic [15:0] p;
 dut u0(.clk(clk),.rst_n(rst_n),.start(start),.a(a),.b(b),.done(done),.p(p));
 always #5 clk=~clk;

 property p_mul_3c;
   logic [7:0] va,vb;
   @(posedge clk) disable iff(!rst_n)
     (start,va=a,vb=b) |-> ##3 (done && p==va*vb);
 endproperty
 assert property(p_mul_3c) else $error("Fallo en multiplicador multiciclo");

 initial begin
   start=0;a=0;b=0; repeat(2) @(posedge clk); rst_n=1;
   @(posedge clk) begin a<=8'd6; b<=8'd7; start<=1; end
   @(posedge clk) start<=0;
   repeat(8) @(posedge clk); $finish;
 end
endmodule
```
8. Asercion comentada:
```systemverilog
(start,va=a,vb=b)           // Captura operandos al iniciar
|-> ##3 (done && p==va*vb); // Verifica done y producto al ciclo 3
```
9. Operador: implicacion con retardo multiciclo.
10. Resultado: asegura timing y funcionalidad.
11. Correcto: done en +3 con producto exacto.
12. Erroneo: done temprano/tarde o producto incorrecto.
13. Reflexion: Como admitir backpressure?
14. Ejercicio: Permitir done en 3..4 ciclos.
15. Solucion: `##[3:4] done` y chequeo de `p` en el match.

### Ejemplo A3: Pipeline de latencia desconocida
1. Titulo: Pipeline no determinista con ventana
2. Objetivo: Verificar salida dentro de un rango de latencias.
3. Conceptos: latencia desconocida, `first_match`.
4. Teoria: Tras `in_v`, `out_v` debe ocurrir en 2..5 ciclos.
5. Cronograma:
```
in_v : 1 0 0 0 0 0
out_v: 0 0 0 1 0 0
```
6. DUT:
```systemverilog
module dut(input logic clk,rst_n,in_v, output logic out_v);
  logic [2:0] lfsr;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin lfsr<=3'b101; out_v<=0; end
    else begin
      lfsr <= {lfsr[1:0], lfsr[2]^lfsr[1]};
      out_v <= in_v ? 1'b0 : (lfsr==3'b011);
    end
  end
endmodule
```
7. TB:
```systemverilog
module tb;
 logic clk=0,rst_n=0,in_v,out_v;
 dut u0(.clk(clk),.rst_n(rst_n),.in_v(in_v),.out_v(out_v));
 always #5 clk=~clk;

 assert property(@(posedge clk) disable iff(!rst_n)
   in_v |-> first_match(##[2:5] out_v))
   else $error("Salida fuera de ventana de latencia");

 initial begin
   in_v=0; repeat(2) @(posedge clk); rst_n=1;
   @(posedge clk) in_v<=1; @(posedge clk) in_v<=0;
   repeat(15) @(posedge clk); $finish;
 end
endmodule
```
8. Asercion comentada:
```systemverilog
in_v |-> first_match(##[2:5] out_v); // Primer out_v debe aparecer entre +2 y +5
```
9. Operador: ventana temporal con eleccion del primer evento valido.
10. Resultado: valida pipelines con jitter controlado.
11. Correcto: out_v en +3.
12. Erroneo: out_v en +1 o +6.
13. Reflexion: Que pasa con transacciones consecutivas?
14. Ejercicio: proteger contra solape de solicitudes.
15. Solucion: bloquear nuevo `in_v` hasta que aparezca `out_v`.

### Ejemplo A4: FIFO simplificada y scoreboarding conceptual
1. Titulo: FIFO 1-palabra con modelo de referencia
2. Objetivo: Introducir scoreboarding basico con assertions.
3. Conceptos: FIFO, referencia esperada.
4. Teoria: Cuando se hace push y luego pop, dato leido debe coincidir.
5. Cronograma:
```
push : 1 0 0
pop  : 0 0 1
din  : AA
dout :       AA
```
6. DUT:
```systemverilog
module dut(input logic clk,rst_n,push,pop,
           input logic [7:0] din,
           output logic [7:0] dout,
           output logic full,empty);
  logic [7:0] mem; logic v;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin v<=0; mem<=0; dout<=0; end
    else begin
      if(push && !v) begin mem<=din; v<=1; end
      if(pop && v) begin dout<=mem; v<=0; end
    end
  end
  assign full=v; assign empty=~v;
endmodule
```
7. TB:
```systemverilog
module tb;
 logic clk=0,rst_n=0,push,pop,full,empty; logic [7:0] din,dout;
 logic [7:0] ref_q;
 dut u0(.clk(clk),.rst_n(rst_n),.push(push),.pop(pop),.din(din),.dout(dout),.full(full),.empty(empty));
 always #5 clk=~clk;

 // Scoreboard conceptual: guardar esperado al push
 always_ff @(posedge clk) if(push && !full) ref_q <= din;

 assert property(@(posedge clk) disable iff(!rst_n)
   (pop && !empty) |=> (dout==ref_q))
   else $error("FIFO devolvio dato incorrecto");

 initial begin
   push=0; pop=0; din=0; repeat(2) @(posedge clk); rst_n=1;
   @(posedge clk) begin din<=8'hAA; push<=1; end
   @(posedge clk) push<=0;
   @(posedge clk) pop<=1;
   @(posedge clk) pop<=0;
   repeat(4) @(posedge clk); $finish;
 end
endmodule
```
8. Asercion comentada:
```systemverilog
(pop && !empty) |=> (dout==ref_q); // Todo pop valido debe devolver valor esperado por scoreboard
```
9. Operador: comparacion temporal contra modelo de referencia.
10. Resultado: detecta corrupcion/orden erroneo.
11. Correcto: push AA, pop AA.
12. Erroneo: pop devuelve dato distinto.
13. Reflexion: Como escalar a FIFO profunda?
14. Ejercicio: usar cola SV en TB como scoreboard.
15. Solucion: `byte q[$];` con push_back/pop_front y assertion sobre elemento esperado.

### Ejemplo A5: IDs de transaccion y deteccion de huerfanas
1. Titulo: Correlacion req/rsp por ID
2. Objetivo: Evitar respuestas sin solicitud previa.
3. Conceptos: IDs, orfandad de transacciones.
4. Teoria: Toda `rsp_valid` con `rsp_id` debe haber sido solicitada.
5. Cronograma:
```
req_id=3 enviado
rsp_id=3 recibido (ok)
rsp_id=5 sin req (error)
```
6. DUT:
```systemverilog
module dut(input logic clk,rst_n,
           input logic req_valid,
           input logic [1:0] req_id,
           output logic rsp_valid,
           output logic [1:0] rsp_id);
  logic [1:0] pipe_id; logic pipe_v;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin pipe_v<=0; rsp_valid<=0; rsp_id<=0; end
    else begin
      rsp_valid <= pipe_v;
      rsp_id    <= pipe_id;
      pipe_v    <= req_valid;
      pipe_id   <= req_id;
    end
  end
endmodule
```
7. TB:
```systemverilog
module tb;
 logic clk=0,rst_n=0,req_valid,rsp_valid; logic [1:0] req_id,rsp_id;
 logic [3:0] outstanding;
 dut u0(.clk(clk),.rst_n(rst_n),.req_valid(req_valid),.req_id(req_id),.rsp_valid(rsp_valid),.rsp_id(rsp_id));
 always #5 clk=~clk;

 always_ff @(posedge clk or negedge rst_n) begin
   if(!rst_n) outstanding <= 4'b0;
   else begin
     if(req_valid) outstanding[req_id] <= 1'b1;
     if(rsp_valid) outstanding[rsp_id] <= 1'b0;
   end
 end

 assert property(@(posedge clk) disable iff(!rst_n)
   rsp_valid |-> outstanding[rsp_id])
   else $error("Respuesta huerfana detectada");

 initial begin
   req_valid=0; req_id=0; repeat(2) @(posedge clk); rst_n=1;
   @(posedge clk) begin req_valid<=1; req_id<=2'd3; end
   @(posedge clk) req_valid<=0;
   repeat(6) @(posedge clk); $finish;
 end
endmodule
```
8. Asercion comentada:
```systemverilog
rsp_valid |-> outstanding[rsp_id]; // Solo puede responderse un ID previamente pendiente
```
9. Operador: indexacion dinamica en consecuencia de propiedad.
10. Resultado: detecta respuestas espurias.
11. Correcto: req_id=3 seguido de rsp_id=3.
12. Erroneo: rsp_id sin req previo.
13. Reflexion: Como detectar tambien req duplicadas por ID?
14. Ejercicio: Assertion para prohibir `req_valid` si ID ya pendiente.
15. Solucion: `assert property(@(posedge clk) disable iff(!rst_n) req_valid |-> !outstanding[req_id]);`

### Ejemplo A6: Cobertura funcional con cover property
1. Titulo: Cobertura de escenario completo
2. Objetivo: Medir si la simulacion ejercito el flujo esperado.
3. Conceptos: `cover property`.
4. Teoria: Cubrir la secuencia start->busy->done al menos una vez.
5. Cronograma:
```
start busy done aparece una vez -> cobertura alcanzada
```
6. DUT:
```systemverilog
module dut(input logic clk,rst_n,start, output logic busy,done);
  logic [1:0] c;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin c<=0; busy<=0; done<=0; end
    else begin
      done<=0;
      if(start) begin c<=2; busy<=1; end
      else if(c!=0) begin c<=c-1; if(c==1) begin busy<=0; done<=1; end end
    end
  end
endmodule
```
7. TB:
```systemverilog
module tb;
 logic clk=0,rst_n=0,start,busy,done;
 dut u0(.clk(clk),.rst_n(rst_n),.start(start),.busy(busy),.done(done));
 always #5 clk=~clk;

 sequence s_ok;
   start ##1 busy ##1 done;
 endsequence

 cover_s_ok: cover property(@(posedge clk) disable iff(!rst_n) s_ok);

 assert property(@(posedge clk) disable iff(!rst_n) start |-> ##2 done)
   else $error("No termino en tiempo");

 initial begin
   start=0; repeat(2) @(posedge clk); rst_n=1;
   @(posedge clk) start<=1; @(posedge clk) start<=0;
   repeat(6) @(posedge clk); $finish;
 end
endmodule
```
8. Asercion comentada:
```systemverilog
cover property(@(posedge clk) disable iff(!rst_n) s_ok); // Registra que la secuencia objetivo ocurrio
```
9. Operador: `cover property` no falla la simulacion; mide estimulacion.
10. Resultado: evidencia si el test realmente ejercita el caso.
11. Correcto: cobertura marcada cuando ocurre `s_ok`.
12. Erroneo: cobertura en cero por falta de estimulo.
13. Reflexion: Por que cobertura sin assertion puede ocultar bugs?
14. Ejercicio: agregar cobertura para dos transacciones consecutivas.
15. Solucion: `cover property(@(posedge clk) disable iff(!rst_n) s_ok ##[1:3] s_ok);`

---

## BLOQUES WORDPRESS GUTENBERG (FORMATO COLAPSABLE)

<details>
<summary>B1 - Req/Ack con ACK exacto a 2 ciclos</summary>
Descripcion: Verifica latencia fija con `##2`.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,input logic rst_n,input logic req,output logic ack);
  logic [1:0] sh;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin sh<=0; ack<=0; end
    else begin sh<={sh[0],req}; ack<=sh[1]; end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,req,ack;
  dut u0(.clk(clk),.rst_n(rst_n),.req(req),.ack(ack));
  always #5 clk=~clk;
  assert property(@(posedge clk) disable iff(!rst_n) req |-> ##2 ack)
    else $error("ACK no llego");
  initial begin
    req=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) req<=1; @(posedge clk) req<=0;
    repeat(6) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>B2 - Req/Ack con timeout</summary>
Descripcion: ACK en ventana temporal 1..4 ciclos.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,req,output logic ack);
  logic [2:0] cnt;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin cnt<=0; ack<=0; end
    else begin
      if(req) cnt<=3; else if(cnt!=0) cnt<=cnt-1;
      ack <= (cnt==1);
    end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,req,ack;
  dut u0(.clk(clk),.rst_n(rst_n),.req(req),.ack(ack));
  always #5 clk=~clk;
  assert property(@(posedge clk) disable iff(!rst_n) req |-> ##[1:4] ack)
    else $error("Timeout");
  initial begin
    req=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) req<=1; @(posedge clk) req<=0;
    repeat(8) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>B3 - Pulsos de un ciclo</summary>
Descripcion: Valida ancho unitario de pulso.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,trig,output logic pulse);
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) pulse<=0; else pulse<=trig;
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,trig,pulse;
  dut u0(.clk(clk),.rst_n(rst_n),.trig(trig),.pulse(pulse));
  always #5 clk=~clk;
  assert property(@(posedge clk) disable iff(!rst_n) $rose(pulse) |-> ##1 !pulse)
    else $error("Pulso invalido");
  initial begin
    trig=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) trig<=1; @(posedge clk) trig<=0;
    repeat(4) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>B4 - Exclusión mutua</summary>
Descripcion: Nunca dos grants activos simultaneamente.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,req_a,req_b,output logic gnt_a,gnt_b);
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin gnt_a<=0; gnt_b<=0; end
    else begin gnt_a<=req_a&~req_b; gnt_b<=req_b&~req_a; end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,req_a,req_b,gnt_a,gnt_b;
  dut u0(.clk(clk),.rst_n(rst_n),.req_a(req_a),.req_b(req_b),.gnt_a(gnt_a),.gnt_b(gnt_b));
  always #5 clk=~clk;
  assert property(@(posedge clk) disable iff(!rst_n) !(gnt_a&&gnt_b)) else $error("Mutex");
  initial begin
    req_a=0; req_b=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) req_a<=1; @(posedge clk) req_a<=0;
    @(posedge clk) req_b<=1; @(posedge clk) req_b<=0;
    repeat(3) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>B5 - Comprobación de reset</summary>
Descripcion: Tras liberar reset el contador arranca en cero.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,en,output logic [3:0] cnt);
  always_ff @(posedge clk or negedge rst_n)
    if(!rst_n) cnt<=0; else if(en) cnt<=cnt+1;
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,en; logic [3:0] cnt;
  dut u0(.clk(clk),.rst_n(rst_n),.en(en),.cnt(cnt));
  always #5 clk=~clk;
  assert property(@(posedge clk) $rose(rst_n) |=> (cnt==0)) else $error("Reset");
  initial begin
    en=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) en<=1;
    repeat(4) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>B6 - Cambios de estado simples</summary>
Descripcion: Verifica transicion IDLE->BUSY.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,start,done,output logic [1:0] state);
  localparam IDLE=0,BUSY=1,DONE=2;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) state<=IDLE;
    else case(state)
      IDLE: if(start) state<=BUSY;
      BUSY: if(done) state<=DONE;
      DONE: state<=IDLE;
    endcase
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,start,done; logic [1:0] state;
  dut u0(.clk(clk),.rst_n(rst_n),.start(start),.done(done),.state(state));
  always #5 clk=~clk;
  assert property(@(posedge clk) disable iff(!rst_n) (state==0 && start) |=> (state==1))
    else $error("FSM");
  initial begin
    start=0; done=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) start<=1; @(posedge clk) start<=0;
    @(posedge clk) done<=1;  @(posedge clk) done<=0;
    repeat(3) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>I1 - sequence y ##</summary>
Descripcion: Secuencia start-busy-done.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,start,output logic busy,done);
  logic [1:0] c;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin c<=0; busy<=0; done<=0; end
    else begin
      done<=0;
      if(start) begin c<=2; busy<=1; end
      else if(c!=0) begin c<=c-1; if(c==1) begin busy<=0; done<=1; end end
    end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,start,busy,done;
  dut u0(.clk(clk),.rst_n(rst_n),.start(start),.busy(busy),.done(done));
  always #5 clk=~clk;
  sequence s; start ##1 busy ##1 done; endsequence
  assert property(@(posedge clk) disable iff(!rst_n) s) else $error("Secuencia");
  initial begin
    start=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) start<=1; @(posedge clk) start<=0;
    repeat(6) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>I2 - ##[m:n] y first_match</summary>
Descripcion: Seleccion de primer ACK en ventana.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,req,output logic ack);
  logic [2:0] c;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin c<=0; ack<=0; end
    else begin if(req) c<=3; else if(c!=0) c<=c-1; ack <= (c==2)||(c==1); end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,req,ack;
  dut u0(.clk(clk),.rst_n(rst_n),.req(req),.ack(ack));
  always #5 clk=~clk;
  assert property(@(posedge clk) disable iff(!rst_n) req |-> first_match(##[1:4] ack))
    else $error("first_match");
  initial begin
    req=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) req<=1; @(posedge clk) req<=0;
    repeat(8) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>I3 - repetition, throughout, until_with</summary>
Descripcion: valid se mantiene hasta ready.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,go,ready_i,output logic valid,ready);
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin valid<=0; ready<=0; end
    else begin
      ready<=ready_i;
      if(go) valid<=1;
      else if(valid&&ready) valid<=0;
    end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,go,ready_i,valid,ready;
  dut u0(.clk(clk),.rst_n(rst_n),.go(go),.ready_i(ready_i),.valid(valid),.ready(ready));
  always #5 clk=~clk;
  assert property(@(posedge clk) disable iff(!rst_n)
    $rose(valid) |-> (valid throughout (!ready[*0:$])) ##1 ready);
  assert property(@(posedge clk) disable iff(!rst_n) valid until_with ready);
  initial begin
    go=0; ready_i=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) go<=1; @(posedge clk) go<=0;
    repeat(2) @(posedge clk); ready_i<=1;
    @(posedge clk) ready_i<=0;
    repeat(4) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>I4 - valid/ready y estabilidad de datos</summary>
Descripcion: payload estable hasta handshake.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,load,ready,input logic [7:0] din,output logic valid,output logic [7:0] data);
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin valid<=0; data<=0; end
    else begin
      if(load) begin valid<=1; data<=din; end
      else if(valid&&ready) valid<=0;
    end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,load,ready; logic [7:0] din,data; logic valid;
  dut u0(.clk(clk),.rst_n(rst_n),.load(load),.ready(ready),.din(din),.valid(valid),.data(data));
  always #5 clk=~clk;
  assert property(@(posedge clk) disable iff(!rst_n) (valid && !ready) |=> $stable(data));
  initial begin
    load=0; ready=0; din=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) begin din<=8'hA5; load<=1; end
    @(posedge clk) load<=0;
    repeat(2) @(posedge clk); ready<=1;
    @(posedge clk) ready<=0;
    repeat(3) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>I5 - Latencia parametrizable</summary>
Descripcion: assertion con parametro LAT.
<h4>design.sv</h4>

```systemverilog
module dut #(parameter int LAT=3)(input logic clk,rst_n,req,output logic ack);
  logic [LAT-1:0] sh;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin sh<='0; ack<=0; end
    else begin sh<={sh[LAT-2:0],req}; ack<=sh[LAT-1]; end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  parameter int LAT=3;
  logic clk=0,rst_n=0,req,ack;
  dut #(.LAT(LAT)) u0(.clk(clk),.rst_n(rst_n),.req(req),.ack(ack));
  always #5 clk=~clk;
  assert property(@(posedge clk) disable iff(!rst_n) req |-> ##LAT ack);
  initial begin
    req=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) req<=1; @(posedge clk) req<=0;
    repeat(8) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>A1 - Variables locales y captura de operandos</summary>
Descripcion: guarda `a,b` al `start` y verifica `res`.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,start,input logic [7:0] a,b,output logic done,output logic [7:0] res);
  logic [1:0] c; logic [7:0] ar,br;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin c<=0; done<=0; res<=0; end
    else begin
      done<=0;
      if(start) begin ar<=a; br<=b; c<=2; end
      else if(c!=0) begin c<=c-1; if(c==1) begin res<=ar+br; done<=1; end end
    end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,start,done; logic [7:0] a,b,res;
  dut u0(.clk(clk),.rst_n(rst_n),.start(start),.a(a),.b(b),.done(done),.res(res));
  always #5 clk=~clk;
  property p;
    logic [7:0] va,vb;
    @(posedge clk) disable iff(!rst_n)
      (start,va=a,vb=b) |-> ##2 (done && res==va+vb);
  endproperty
  assert property(p);
  initial begin
    start=0;a=0;b=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) begin a<=3; b<=4; start<=1; end
    @(posedge clk) start<=0;
    repeat(6) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>A2 - Multiplicador multiciclo</summary>
Descripcion: start-done de 3 ciclos con verificacion funcional.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,start,input logic [7:0] a,b,output logic done,output logic [15:0] p);
  logic [1:0] c; logic [7:0] ar,br;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin c<=0; done<=0; p<=0; end
    else begin
      done<=0;
      if(start) begin ar<=a; br<=b; c<=3; end
      else if(c!=0) begin c<=c-1; if(c==1) begin p<=ar*br; done<=1; end end
    end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,start,done; logic [7:0] a,b; logic [15:0] p;
  dut u0(.clk(clk),.rst_n(rst_n),.start(start),.a(a),.b(b),.done(done),.p(p));
  always #5 clk=~clk;
  property p_mul;
    logic [7:0] va,vb;
    @(posedge clk) disable iff(!rst_n) (start,va=a,vb=b) |-> ##3 (done && p==va*vb);
  endproperty
  assert property(p_mul);
  initial begin
    start=0;a=0;b=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) begin a<=6; b<=7; start<=1; end
    @(posedge clk) start<=0;
    repeat(8) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>A3 - Pipeline de latencia desconocida</summary>
Descripcion: respuesta en ventana 2..5.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,in_v,output logic out_v);
  logic [2:0] l;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin l<=3'b101; out_v<=0; end
    else begin l<={l[1:0],l[2]^l[1]}; out_v<= in_v ? 0 : (l==3'b011); end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,in_v,out_v;
  dut u0(.clk(clk),.rst_n(rst_n),.in_v(in_v),.out_v(out_v));
  always #5 clk=~clk;
  assert property(@(posedge clk) disable iff(!rst_n) in_v |-> first_match(##[2:5] out_v));
  initial begin
    in_v=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) in_v<=1; @(posedge clk) in_v<=0;
    repeat(15) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>A4 - FIFO simplificada y scoreboarding conceptual</summary>
Descripcion: compara salida de pop con referencia.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,push,pop,input logic [7:0] din,output logic [7:0] dout,output logic full,empty);
  logic [7:0] mem; logic v;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin v<=0; mem<=0; dout<=0; end
    else begin
      if(push && !v) begin mem<=din; v<=1; end
      if(pop && v)  begin dout<=mem; v<=0; end
    end
  end
  assign full=v; assign empty=~v;
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,push,pop,full,empty; logic [7:0] din,dout,ref_q;
  dut u0(.clk(clk),.rst_n(rst_n),.push(push),.pop(pop),.din(din),.dout(dout),.full(full),.empty(empty));
  always #5 clk=~clk;
  always_ff @(posedge clk) if(push && !full) ref_q <= din;
  assert property(@(posedge clk) disable iff(!rst_n) (pop && !empty) |=> (dout==ref_q));
  initial begin
    push=0; pop=0; din=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) begin din<=8'hAA; push<=1; end
    @(posedge clk) push<=0;
    @(posedge clk) pop<=1;
    @(posedge clk) pop<=0;
    repeat(4) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>A5 - IDs y transacciones huérfanas</summary>
Descripcion: respuesta solo para IDs pendientes.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,input logic req_valid,input logic [1:0] req_id,output logic rsp_valid,output logic [1:0] rsp_id);
  logic [1:0] pid; logic pv;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin pv<=0; rsp_valid<=0; rsp_id<=0; end
    else begin
      rsp_valid<=pv; rsp_id<=pid; pv<=req_valid; pid<=req_id;
    end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,req_valid,rsp_valid; logic [1:0] req_id,rsp_id; logic [3:0] outstanding;
  dut u0(.clk(clk),.rst_n(rst_n),.req_valid(req_valid),.req_id(req_id),.rsp_valid(rsp_valid),.rsp_id(rsp_id));
  always #5 clk=~clk;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) outstanding<=0;
    else begin
      if(req_valid) outstanding[req_id]<=1;
      if(rsp_valid) outstanding[rsp_id]<=0;
    end
  end
  assert property(@(posedge clk) disable iff(!rst_n) rsp_valid |-> outstanding[rsp_id]);
  initial begin
    req_valid=0; req_id=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) begin req_valid<=1; req_id<=2'd3; end
    @(posedge clk) req_valid<=0;
    repeat(6) @(posedge clk); $finish;
  end
endmodule
```
</details>

<details>
<summary>A6 - Cover property</summary>
Descripcion: cobertura de secuencia start-busy-done.
<h4>design.sv</h4>

```systemverilog
module dut(input logic clk,rst_n,start,output logic busy,done);
  logic [1:0] c;
  always_ff @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin c<=0; busy<=0; done<=0; end
    else begin
      done<=0;
      if(start) begin c<=2; busy<=1; end
      else if(c!=0) begin c<=c-1; if(c==1) begin busy<=0; done<=1; end end
    end
  end
endmodule
```

<h4>testbench.sv</h4>

```systemverilog
module tb;
  logic clk=0,rst_n=0,start,busy,done;
  dut u0(.clk(clk),.rst_n(rst_n),.start(start),.busy(busy),.done(done));
  always #5 clk=~clk;
  sequence s; start ##1 busy ##1 done; endsequence
  cover property(@(posedge clk) disable iff(!rst_n) s);
  assert property(@(posedge clk) disable iff(!rst_n) start |-> ##2 done);
  initial begin
    start=0; repeat(2) @(posedge clk); rst_n=1;
    @(posedge clk) start<=1; @(posedge clk) start<=0;
    repeat(6) @(posedge clk); $finish;
  end
endmodule
```
</details>

---

## PROPUESTA DE NAVEGACION WORDPRESS

1. Introduccion
2. Nivel Basico
3. Nivel Intermedio
4. Nivel Avanzado
5. Retos
6. Autoevaluacion
7. Laboratorio libre

### Contenido sugerido por seccion
- Introduccion: que es SVA, objetivos, como ejecutar en simulador.
- Nivel Basico: B1..B6.
- Nivel Intermedio: I1..I5.
- Nivel Avanzado: A1..A6.
- Retos: variantes sin solucion inmediata.
- Autoevaluacion: cuestionario de opciones + mini practicas.
- Laboratorio libre: editor vacio + plantilla base.

## PROPUESTA DE INTEGRACION CON SIMULADOR ONLINE

Objetivo: cada ejemplo carga `design.sv` y `testbench.sv` en el `simulador_avanzado` (Questa + Surfer).

### UI
- Panel izquierdo: `testbench.sv`
- Panel derecho: `design.sv`
- Boton: "Cargar ejemplo en el simulador"

### Flujo tecnico recomendado
1. Crear un catalogo JSON de ejemplos.
2. Renderizar lista en WordPress con boton por ejemplo.
3. Al pulsar boton:
   - Guardar ejemplo en `localStorage`.
   - Redirigir o abrir pagina con shortcode `[simulador_avanzado]`.
4. En `simulador-avanzado.js`:
   - Al iniciar Monaco, leer `localStorage`.
   - `simAvanzadoDesignEditor.setValue(design_sv)`
   - `simAvanzadoTbEditor.setValue(tb_sv)`
5. Usuario pulsa `Ejecutar Simulacion` y se usa `accion: "compilar"` (ruta QuestaSim existente).
6. Si backend responde `vcd_url`, abrir tab de ondas Surfer automaticamente (ya implementado).

### API minima sugerida
- `window.SVAExamples.load(id)` para setear ambos editores.
- `window.SVAExamples.run(id)` para cargar y lanzar click de ejecutar.

### Compatibilidad
- Mantener JSON puro y codigo SV estandar.
- Sin dependencias UVM.
- Funciona en flujo actual WebSocket + FastAPI + Questa + Surfer.
