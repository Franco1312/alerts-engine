# Sistema de Alertas - alerts-engine

## Descripción General

El sistema de alertas monitorea métricas económicas críticas y genera alertas cuando se detectan condiciones que requieren atención. El sistema está diseñado para detectar crisis de reservas, fugas de capitales y expansión monetaria excesiva.

## Reglas de Alertas

### 1. Alerta ROJA - Respaldo Crítico de Reservas

- **ID**: `ratio.low_reserves_backing`
- **Métrica**: `ratio.reserves_to_base`
- **Nivel**: 🔴 **ROJO** (crítico)
- **Condición**: `value <= 0.002` (≤ 0.20%)
- **Mensaje**: "El respaldo del peso en dólares está en un nivel crítico."
- **Significado**: Cuando las reservas son extremadamente bajas en relación a la base monetaria, indicando un riesgo sistémico alto.

### 2. Alerta ÁMBAR - Respaldo Bajo de Reservas

- **ID**: `ratio.low_reserves_backing.amber`
- **Métrica**: `ratio.reserves_to_base`
- **Nivel**: 🟡 **ÁMBAR** (advertencia)
- **Condición**: `0.002 < value AND value <= 0.01` (0.20% < valor ≤ 1.0%)
- **Mensaje**: "El respaldo del peso es bajo; riesgo elevándose."
- **Significado**: Banda de advertencia temprana para respaldo bajo, antes de llegar al nivel crítico.

### 3. Alerta ÁMBAR - Salida Rápida de Reservas

- **ID**: `reserves.fast_outflow`
- **Métrica**: `delta.reserves_7d`
- **Nivel**: 🟡 **ÁMBAR** (advertencia)
- **Condición**: `value <= -0.05` (≤ -5% en 7 días)
- **Mensaje**: "Las reservas cayeron significativamente en 7 días."
- **Significado**: Detecta fugas de capitales o intervenciones del BCRA que reducen las reservas rápidamente.

### 4. Alerta ÁMBAR - Expansión Alta de Base Monetaria

- **ID**: `base.expansion_high`
- **Métrica**: `delta.base_30d`
- **Nivel**: 🟡 **ÁMBAR** (advertencia)
- **Condición**: `value >= 0.08` (≥ +8% en 30 días)
- **Mensaje**: "La base monetaria creció fuertemente en los últimos 30 días."
- **Significado**: Detecta expansión monetaria excesiva que puede generar inflación.

## Payload Enriquecido

Cada alerta incluye un payload enriquecido con información detallada:

```json
{
  "value": 0.0015,
  "value_pct": 0.15,
  "threshold": 0.002,
  "window": "7d",
  "units": "ratio",
  "inputs": ["series:1", "series:15", "fx:oficial"],
  "base_ts": "2025-01-15",
  "oficial_fx_source": "bcra",
  "notes": "Si depende de TC oficial, indicar si fue BCRA o fallback."
}
```

### Campos del Payload:

- **`value`**: Valor numérico de la métrica
- **`value_pct`**: Valor como porcentaje (para UI)
- **`threshold`**: Umbral configurado para la alerta
- **`window`**: Ventana temporal de la métrica (7d, 30d)
- **`units`**: Unidades de la métrica (ratio, percentage)
- **`inputs`**: Fuentes de datos utilizadas
- **`base_ts`**: Timestamp base de la métrica
- **`oficial_fx_source`**: Fuente del tipo de cambio (bcra, mep, blue, null)
- **`notes`**: Notas adicionales sobre la alerta

## Política de Deduplicación

- **Clave única**: `(alert_id, ts)` - Una alerta por regla por fecha
- **Comportamiento**: Re-ejecutar el mismo día actualiza la alerta existente
- **Idempotencia**: Múltiples ejecuciones no duplican alertas

## Horarios de Ejecución

- **Scheduler**: Diario a las 08:30 ART (después de metrics-engine a las 08:15)
- **Dependencia**: Requiere que metrics-engine esté funcionando
- **Timezone**: America/Argentina/Buenos_Aires

## API Endpoints

### GET /alerts

Lista alertas con filtros opcionales.

**Parámetros de consulta:**

- `from`: Fecha inicio (YYYY-MM-DD)
- `to`: Fecha fin (YYYY-MM-DD)
- `level`: Nivel de alerta (red, amber, green)
- `limit`: Límite de resultados (1-100, default: 50)

**Ejemplo:**

```bash
curl "http://localhost:3001/alerts?from=2025-01-01&level=red&limit=10"
```

### GET /alerts/rules

Lista todas las reglas configuradas.

**Ejemplo:**

```bash
curl "http://localhost:3001/alerts/rules"
```

### GET /health

Estado del sistema y conectividad.

**Ejemplo:**

```bash
curl "http://localhost:3001/health"
```

## CLI Commands

### Ejecutar Evaluación

```bash
# Evaluar alertas para hoy
npm run alerts:run

# Evaluar alertas para fecha específica
npm run alerts:run -- --date=2025-01-15
```

### Listar Alertas

```bash
# Listar todas las alertas
npm run alerts:list

# Filtrar por fecha
npm run alerts:list -- --from=2025-01-01 --to=2025-01-31

# Filtrar por nivel
npm run alerts:list -- --level=red

# Combinar filtros
npm run alerts:list -- --from=2025-01-01 --level=amber --limit=20
```

## Configuración de Base de Datos

### Tabla: alerts_emitted

```sql
CREATE TABLE IF NOT EXISTS alerts_emitted (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id TEXT NOT NULL,
  ts DATE NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (alert_id, ts)
);
```

### Variables de Entorno

```bash
# Base de datos (opcional)
ALERTS_DATABASE_URL=postgres://user:pass@localhost:5432/alerts_engine

# API de métricas
METRICS_API_BASE=http://localhost:3000
METRICS_API_KEY=your_api_key

# Configuración
APP_TIMEZONE=America/Argentina/Buenos_Aires
LOG_LEVEL=info
ENABLE_SCHEDULER=true
```

## Interpretación de Alertas

### Nivel ROJO

- **Acción**: Intervención inmediata requerida
- **Impacto**: Riesgo sistémico alto
- **Ejemplo**: Respaldo de reservas < 0.2%

### Nivel ÁMBAR

- **Acción**: Monitoreo intensivo, preparar medidas
- **Impacto**: Riesgo elevado pero manejable
- **Ejemplo**: Respaldo entre 0.2% y 1.0%

### Nivel VERDE

- **Acción**: Monitoreo normal
- **Impacto**: Condiciones normales
- **Ejemplo**: Respaldo > 1.0%

## Monitoreo y Alertas

El sistema genera logs estructurados para cada operación:

- **Evaluación de reglas**: Logs de decisión por regla
- **Persistencia**: Logs de inserción/actualización
- **API calls**: Logs de consultas y filtros
- **Errores**: Logs detallados de errores con contexto

## Troubleshooting

### Alertas no se generan

1. Verificar conectividad con metrics-engine
2. Revisar logs de evaluación de reglas
3. Confirmar que las métricas existen

### Base de datos no conecta

1. Verificar `ALERTS_DATABASE_URL`
2. Confirmar que PostgreSQL está corriendo
3. Revisar logs de conexión

### Scheduler no ejecuta

1. Verificar `ENABLE_SCHEDULER=true`
2. Confirmar timezone correcto
3. Revisar logs del scheduler
