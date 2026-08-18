# Sacar las tablas codificadoras del Kit Malvina

## Para qué

El pre-SIM tiene que emitir códigos que el SIM acepte: subrégimen, aduana, vía,
país, embalaje, unidad de medida, documentos a presentar, ventajas, condición de
venta, divisa. Si mandamos un código que no existe, la declaración rebota.

La estructura de esas tablas está en `data/Normas/SIM/` (RG 1452/2003, vigente).
Lo que falta son los **valores actuales**, y viven solo en la base interna del Kit.

## Cómo llegan las actualizaciones al Kit

**No es automático.** AFIP publica:

- **Versiones nuevas** del Kit (la 7.0 es obligatoria desde el 24/06/2025), que se
  bajan de ARCA o se piden al PSVA y se instalan como administrador.
- **Parches de tabla puntuales**: ejecutables que escriben valores en la base local.
  Ejemplo real: `POR-sqlkit.exe`, que carga la tabla POR (Puertos).

O sea que el Kit está actualizado **cuando alguien instaló el último parche**, no
por estar prendido. Ponerlo en un servidor no lo mantiene al día solo.

## Cómo copiarlas

El Kit instala un **SQL Server 2012** local. Los `.mdf` no sirven copiados a mano
(están tomados por el servicio), pero SQL Server trae `sqlcmd` y `bcp`, que ya están
en esa máquina. Con eso se exporta a CSV sin instalar nada.

### Paso 1 — diagnóstico

Copiar `1-diagnostico.bat` a la máquina del Kit y hacerle doble click. Genera
`diagnostico-kit.txt` con la instancia, la base y las tablas. **Solo lee.**

### Paso 2 — exportar

Con esos datos:

```
2-exportar-tablas.bat  .\SQLEXPRESS  KITMALVINA
```

Deja un CSV por tabla en `tablas-kit\`. Comprimir y enviar.

## Reglas

- **Los dos scripts solo leen.** No escriben, no borran, no tocan el Kit.
- Correrlos con el Kit cerrado, por las dudas.
- Es la máquina donde se documenta: no improvisar nada más ahí.
- Si algo falla, no insistir — lo resuelve el PSVA en cinco minutos.
