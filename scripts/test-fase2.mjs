import { identificarPropuestas } from "../src/lib/clasificador/ia.ts";

async function main() {
    const estado =
      process.argv[2]?.trim() ??
      "HECHOS:\n- Producto: maquina industrial con dos funciones principales de igual importancia";
    const partidas = [
        {
            partida: "8430",
            partidaDesc: "LAS DEMÁS MÁQUINAS Y APARATOS DE EXPLANAR...",
            candidatos: [
                { codigo: "8430.41.10.000L", descripcion: "Perforadoras de percusión", ruta: "..." },
                { codigo: "8430.41.20.000W", descripcion: "Perforadoras rotativas", ruta: "..." }
            ]
        },
        {
            partida: "8479",
            partidaDesc: "MÁQUINAS Y APARATOS MECÁNICOS CON FUNCIÓN PROPIA...",
            candidatos: [
                { codigo: "8479.89.99.999Z", descripcion: "Los demás", ruta: "..." }
            ]
        }
    ];
    
    const res = await identificarPropuestas({ estado, partidas });
    console.log(JSON.stringify(res, null, 2));
}
main();
