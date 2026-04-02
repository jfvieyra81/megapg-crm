# Mega PG CRM v3

CRM para Mega PG Distributions — app web instalable en tu celular.

## Cómo publicar en Vercel (GRATIS)

### Paso 1: Crear cuenta en GitHub
1. Ve a **github.com** y crea una cuenta gratis
2. Click **"New repository"** → nombre: `megapg-crm` → **Create**
3. Sube todos los archivos de esta carpeta al repositorio

### Paso 2: Publicar en Vercel
1. Ve a **vercel.com** y regístrate con tu cuenta de GitHub
2. Click **"Add New Project"**
3. Selecciona tu repositorio `megapg-crm`
4. Framework: **Vite** (lo detecta automático)
5. Click **"Deploy"**
6. En 30 segundos tendrás tu URL: `megapg-crm.vercel.app`

### Paso 3: Instalar en tu celular

**Android (Chrome):**
1. Abre **Chrome** → ve a tu URL de Vercel
2. Chrome muestra un banner **"Instalar app"** automáticamente — tócalo
3. Si no aparece: toca el menú **⋮** (tres puntos) → **"Instalar app"** o **"Añadir a pantalla de inicio"**
4. Listo — aparece como app en tu cajón de aplicaciones

**iPhone (Safari):**
1. Abre **Safari** → ve a tu URL de Vercel
2. Toca el botón **Share** (cuadrito con flecha)
3. Selecciona **"Añadir a la pantalla de inicio"**
4. Listo — aparece como app nativa

## Cómo usar

- **Dashboard**: ventas, profit, alertas de stock, follow-ups
- **Clients**: directorio con tiers de precio y WhatsApp
- **Orders**: crear órdenes con descuento automático por tier
- **Inventory**: stock con alertas LOW/OUT
- **Purchases**: upload de facturas con AI (Haiku)
- **P&L**: reporte mensual de ganancias
- **Receipt**: PDF descargable + impresión térmica 80mm + WhatsApp
- **Field Intel**: dashboard de penetración por zona, canales de proveedor
- **Visits**: captura de visitas de campo con productos, precios, competencia
- **AI Analysis**: reportes de inteligencia generados por Claude (español)
- **Export/Import**: respaldo JSON de toda la data

## Para hacer cambios al código

```bash
npm install
npm run dev
```

Abre http://localhost:5173 en tu navegador.
