// --------------------------------------------------------------------
// Universitat Politecnica de Valencia
// Escuela Tecnica Superior de Ingenieros de Telecomunicacion
// --------------------------------------------------------------------
// Integracion de Sistemas Digitales - Itinerario de Electronica
// Curso 2017 - 2018
// --------------------------------------------------------------------
// Nombre del archivo: multipli.sv
//
// Descripcion: Este codigo SystemVerilog implementa un multiplicador
// de tamanyo parametrizable y he corregido el fallo de overflow en el registro acumulador, que ahora es de tamanyo+2 bits
//
// --------------------------------------------------------------------
// Versi  n: V1.0 | Fecha Modificaci  n: 23/07/2019
//
// Autores: Rafael Gadea
// --------------------------------------------------------------------
module bin2seg7_undigito(bin, seg_hex, sign);
parameter tamanyo=4;
input [tamanyo-1:0] bin;
output [6:0] seg_hex;
output   sign;
logic [tamanyo-1:0] magnitud;
assign sign=bin[tamanyo-1];
assign magnitud=sign?~bin+1:bin;
assign seg_hex=(magnitud==4'd0)?7'b1000000:
            (magnitud==4'd1)?7'b1111001:
            (magnitud==4'd2)?7'b0100100:
            (magnitud==4'd3)?7'b0110000:
            (magnitud==4'd4)?7'b0011001:
            (magnitud==4'd5)?7'b0010010:
            (magnitud==4'd6)?7'b0000010:
            (magnitud==4'd7)?7'b1111000:
            (magnitud==4'd8)?7'b0000000:
            (magnitud==4'd9)?7'b0010000:7'b1111111;


endmodule

module bin2seg7_dos_digitos(bin, dec_hex, uni_hex, sign);
parameter tamanyo=8;
input [tamanyo-1:0] bin;
output logic [6:0] dec_hex, uni_hex;
output  logic     sign;
logic [tamanyo-1:0] magnitud;
logic [3:0] dec_bcd, uni_bcd;


assign sign=bin[tamanyo-1];

assign magnitud=sign?~bin+1:bin;
//convertidor binario BCD mediante circuito recurrente
//binario de 8 bits (de 00 a 64)
//sin recurrir a la division, otro m  todo
/*
always_comb begin
    integer i;
    // Inicializar los d  gitos BCD en 0
    dec_bcd = 4'd0;
    uni_bcd = 4'd0;
    
    // Iterar por cada bit del n  mero binario (7 bits)
    for ( i = 6; i >= 0; i = i - 1) begin
        // Si alg  n d  gito BCD es mayor o igual a 5, sumar 3
        if (dec_bcd >= 5) dec_bcd = dec_bcd + 3;
        if (uni_bcd >= 5) uni_bcd = uni_bcd + 3;
        
        // Desplazar los d  gitos BCD y el binario juntos a la izquierda
        dec_bcd = {dec_bcd[2:0], uni_bcd[3]};
        uni_bcd = {uni_bcd[2:0], magnitud[i]};
    end
end
*/
assign dec_bcd = (magnitud / 10) % 10; // D  gito de las decenas
assign uni_bcd = magnitud % 10;        // D  gito de las unidades

//convertidor BCD a 7 segmentos
assign dec_hex  =(dec_bcd==4'd0)?7'b1000000:
            (dec_bcd==4'd1)?7'b1111001:
            (dec_bcd==4'd2)?7'b0100100:
            (dec_bcd==4'd3)?7'b0110000:
            (dec_bcd==4'd4)?7'b0011001:
            (dec_bcd==4'd5)?7'b0010010:
            (dec_bcd==4'd6)?7'b0000010:
            (dec_bcd==4'd7)?7'b1111000:
            (dec_bcd==4'd8)?7'b0000000:
            (dec_bcd==4'd9)?7'b0010000:7'b1111111;
assign uni_hex=(uni_bcd==4'd0)?7'b1000000:
            (uni_bcd==4'd1)?7'b1111001:
            (uni_bcd==4'd2)?7'b0100100:
            (uni_bcd==4'd3)?7'b0110000:
            (uni_bcd==4'd4)?7'b0011001:
            (uni_bcd==4'd5)?7'b0010010:
            (uni_bcd==4'd6)?7'b0000010:
            (uni_bcd==4'd7)?7'b1111000:
            (uni_bcd==4'd8)?7'b0000000:
            (uni_bcd==4'd9)?7'b0010000:7'b1111111;




endmodule


module shift2_reg_good(clock,reset,clear,enable,pload,dataIn,pout,sin1,sin2,sout);
parameter tamanyo=8;

input clock; //senyal de reloj
input reset; //reset asincrono
input clear; //reset s  ncrono
input enable; //parar/continuar
input pload; //senyal de carga paralelo si es 1 y desplazamiento si es 0
input [tamanyo-1:0] dataIn; //dato para la carga en paralelo
input sin1,sin2; //entrada serie del registro
output reg [tamanyo-1:0] pout; //salida paralelo del registro
output reg sout; //salida serie del registro

logic [tamanyo-1:0] aux;

always_ff @(posedge clock or negedge reset)
if (!reset)
        aux<=0;
else
    if (clear)
        aux<=0;
	  else
			 if (enable)
					 if (pload)
							aux<=dataIn;
					 else 
							aux<={sin1,sin2,aux[tamanyo-1:2]};	

assign sout=aux[0];
assign pout=aux;

endmodule
// --------------------------------------------------------------------
module registro(clock,reset,clear,enable,dataIn,pout);
parameter tamanyo=8;

input clock; //senyal de reloj
input reset; //reset asincrono
input clear; //reset s  ncrono
input enable; //parar/continuar

input [tamanyo-1:0] dataIn; //dato para la carga en paralelo

output reg [tamanyo-1:0] pout; //salida paralelo del registro


logic [tamanyo-1:0] aux;

always_ff @(posedge clock or negedge reset)
if (!reset)
        aux<=0;
else
    if (clear)
        aux<=0;
	 else
      if (enable)
        aux<=dataIn;
	


assign pout=aux;

endmodule
// --------------------------------------------------------------------
module adder(inA, inB, out, add_sub);
parameter tamanyo=8;

input [tamanyo-1:0] inA,inB; //entradas del sumador
input add_sub; //senyal que indica suma o resta
output logic [tamanyo-1:0] out; //salida del sumador

always_comb begin
if(add_sub)
	out=inA+inB;
else
   out=inA-inB;
end

endmodule
// --------------------------------------------------------------------
//control path formao por uns FSM y un contador interactuando entre ellos
// --------------------------------------------------------------------
module control_path(clock, reset, start, qi,qi_1, qi_2, fin_mult, regA_ena, regB_ena, regAccu_ena, accu_clr, regAB_pload, regAccu_pload, add_sub,select);

parameter tamanyo=8;
parameter width= $clog2(tamanyo+1);


input clock, reset;
input logic start, qi_1, qi_2 , qi;
output logic fin_mult, regA_ena, regB_ena, regAccu_ena, accu_clr, regAB_pload, regAccu_pload, add_sub,select;

logic count_clr, count_ena;
logic [width-1:0]count;
logic [2:0] codigo;
assign codigo={qi,qi_1,qi_2};

parameter idle=3'd0, init=3'd1, add=3'd2, shift=3'd3,notify=3'd4;

logic  [2:0]  state;

//Control del estado
always_ff @ (posedge clock or negedge reset)
begin
if (!reset)
	state<= idle;
else
	case(state)
	idle:if(start) state<= init;
	init:state<= add;
	add:state<= shift;
	shift:begin
		if(count==tamanyo) state<=notify;
		else  state<=add;
		end
	notify:begin
		if(start) state<=notify;
		else state<=idle;
		end
	default: state<=idle;
	endcase
end

//Control de las salidas
always_comb begin
	fin_mult=0; 	  //Ponemos fin_mult a 0. Solo cambiara en notify
	regA_ena=0; 	  //Inhabilitamos el registro A (mantener)
	regB_ena=0; 	  //Inhabilitamos el registro B (mantener)
	regAccu_ena=0;   //Inhabilitamos el registro Accu (mantener)
	accu_clr=0; 	  //No hacemos clear de Accu
	regAB_pload=0;   //Inhabilitamos carga paralelo de A y B
	regAccu_pload=0; //Inhabilitamos carga paralelo de Accu
	add_sub=1; 		  //Da igual si el sumador suma o resta
	count_clr=0; 	  //No hacemos clear del contador
	count_ena=0;     //No incrementamos el contador
	select=1;        //seleccionamos en el mux la entrada M
	case(state)
	init:begin
		count_clr=1;     //Hacemos clear del contador
		regA_ena=1;      //Habilitamos registro A
		regB_ena=1;      //Habilitamos registro B
		regAB_pload=1;   //Habilitamos carga paralelo de A y B
		accu_clr=1;      //Hacemos clear del registro Accu
		end
	add:begin
		count_ena=1;				//Habilitamos cuenta (+1)

		if(codigo==3'b000 || codigo==3'b111) begin			//Si LSB (regA) es 1
			regAccu_ena=0;	  		//Inhabilitamos registro Accu (mantener)
			regAccu_pload=0; 		//Inhabilitamos carga paralelo de Accu
			add_sub=1'bx;
			select=1'bx;
			end
		else 
			begin
			add_sub=~qi		;		//Indicamos suma al sumador
			regAccu_ena=1;			//Habilitamos registro Accu
			regAccu_pload=1;  	//Habilitamos carga paralelo de Accu
			select=qi_1^qi_2;
			end
			
		end
	shift:begin

		regA_ena=1;				//Habilitamos registro A (shift, ya que pload=0)
		regAccu_pload=0;		//Inhabilitamos carga paralelo de Accu			
		regAccu_ena=1;			//Habilitamos registro Accu (shift, ya que pload=0)
		end

	notify: begin		
		fin_mult=1;			//Indicamos FIN DE MULTIPLICACION
		end
	default: begin
		fin_mult=0;			//
		regA_ena=0;			//
		regB_ena=0;			//
		regAccu_ena=0;		//Todo a 0 y los registros en modo mantener
		accu_clr=0;			//estado <<congelado>>
		regAB_pload=0;		//
		regAccu_pload=0;	//
		add_sub=1;			//
		count_clr=0;		//
		count_ena=0;		//
      select=0;
		end
	endcase
end

//Control del contador
always_ff @ (posedge clock or negedge reset)
begin
if(!reset)
	count <= 0;
else if(count_clr)
	count<=0;
else if(count_ena)
	count <= count +2;
end

endmodule
// --------------------------------------------------------------------

module multipli(CLOCK, RESET, END_MULT, A, B, S, START);
parameter tamano=8;

input CLOCK, RESET;
input logic START;
input logic [tamano-1:0] A, B;
output logic [2*tamano-1:0] S;
output logic END_MULT;

logic regA_ena, regB_ena, regAccu_ena, accu_clr, regAB_pload, regAccu_pload, add_sub;
logic [tamano+1:0] accu_pout;
logic a_lsb, regAccu_sout;

logic [tamano+1:0] adder_out;
logic [tamano-1:0] regA_out, regB_pout;

logic qi, qi_1,qi_2;

logic [tamano+1: 0] entrada_accu;
logic seleccion;

assign qi=regA_out[1];
assign qi_1=regA_out[0];

assign S={accu_pout[tamano-1:0],regA_out};

control_path #(.tamanyo(tamano)) cp 
(.clock(CLOCK),
 .reset(RESET),
 .start(START),
 .qi(qi),
 .qi_1(qi_1), 
 .qi_2(qi_2),
 .fin_mult(END_MULT),
 .regA_ena(regA_ena),
 .regB_ena(regB_ena),
 .regAccu_ena(regAccu_ena),
 .accu_clr(accu_clr),
 .regAB_pload(regAB_pload),
 .regAccu_pload(regAccu_pload),
 .select(seleccion),
 .add_sub(add_sub)
);

shift2_reg_good #(.tamanyo(tamano)) regA
(.clock(CLOCK),
 .reset(RESET),
 .clear(1'b0),
 .enable(regA_ena),
 .pload(regAB_pload),
 .dataIn(A),
 .sin1(accu_pout[1]),
 .sin2(accu_pout[0]),
 .sout(a_lsb),
 .pout(regA_out)
);
	
registro #(.tamanyo(tamano)) regB
(.clock(CLOCK),
 .reset(RESET),
 .clear(1'b0),
 .enable(regB_ena),
 .dataIn(B),
 .pout(regB_pout)
);


shift2_reg_good #(.tamanyo(tamano+2)) accu
(.clock(CLOCK),
 .reset(RESET),
 .clear(accu_clr),
 .enable(regAccu_ena),
 .pload(regAccu_pload),
 .dataIn(adder_out),
 .sin1(accu_pout[tamano]),
 .sin2(accu_pout[tamano]),
 .sout(regAccu_sout),
 .pout(accu_pout)
);

registro #(.tamanyo(1)) X
(.clock(CLOCK),
 .reset(RESET),
 .clear(accu_clr),
 .enable(regAccu_ena),
 .dataIn(qi),
 .pout(qi_2)
);

assign entrada_accu=seleccion?{regB_pout[tamano-1],regB_pout[tamano-1],regB_pout}: {regB_pout[tamano-1],regB_pout[tamano-1:0],1'b0};

adder #(.tamanyo(tamano+2)) sum_res
(.inA(accu_pout),
 .inB(entrada_accu),
 .add_sub(add_sub),
 .out(adder_out)
);

endmodule

// --------------------------------------------------------------------
module top_system(
    input clk,
    input [3:0] KEY,
    input [9:0] SW,
    output [9:0] LEDR,
    output [9:0] LEDG,
    output [6:0] HEX0, HEX1, HEX2, HEX3, HEX4, HEX5, HEX6, HEX7
);

logic aux1,aux2,aux3;

multipli #(.tamano(4)) multiplicador (
    .CLOCK(clk),
    .RESET(KEY[0]),
    .START(KEY[1]),
    .A(SW[3:0]),
    .B(SW[9:6]),
    .S({LEDR[7:0]}),
    .END_MULT(LEDG[0])
);
//convertidor binario a 7 segmentos, la magnitud a hex5 y el signo a ledg9

bin2seg7_undigito b2s0 (
    .bin(SW[3:0]),
    .seg_hex(HEX4),
    .sign(aux1)
);

bin2seg7_undigito b2s1 (
    .bin(SW[9:6]),
    .seg_hex(HEX6),
    .sign(aux2)
);

//ahora el resultado de la multiplicacion, la magnitud se conviete a BCD y se muestra en H1 y Hex0 y el signo en el sigmento g de Heex2

bin2seg7_dos_digitos b2s2 (
    .bin(LEDR[7:0]),
    .dec_hex(HEX1),
    .uni_hex(HEX0),
    .sign(aux3)
);

assign HEX2={~aux3,6'b111111}; //apagamos los segmentos a,b,c,d,e,f de hex2, solo se enciende el g si el resultado es negativo
assign HEX3=7'b0110111; //apagamos todos los segmentos de hex3
assign HEX5={~aux1,6'b111111}; //apagamos todos los segmentos de hex5
assign HEX7={~aux2,6'b111111}; //apagamos todos los segmentos de hex7
endmodule
