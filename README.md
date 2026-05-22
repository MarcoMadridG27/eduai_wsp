# WhatsApp Bot - Baileys Session Generator

Este proyecto es un bot de WhatsApp modular construido con `@whiskeysockets/baileys` que permite generar y gestionar sesiones persistentes de WhatsApp Web.

## 📱 Número Oficial del Bot

El asistente de IA se ejecuta activamente en el siguiente número oficial:
- **Número**: `+51 984 277 478`
- **Acceso Directo**: [Chatear con el Asistente en WhatsApp](https://wa.me/51984277478?text=Hola!%20Quiero%20probar%20el%20bot%20de%20IA)

## Características

- 🔐 **Gestión de Sesiones**: Guarda de forma persistente tus credenciales y sesión de WhatsApp en la carpeta local `.wsp_session`.
- 🔄 **Reconexión Automática**: En caso de desconexión o fallas en el servicio, el bot se vuelve a conectar automáticamente de forma inteligente.
- 📱 **Generación por QR**: Genera códigos QR directamente en la consola para un escaneo fácil desde la aplicación móvil de WhatsApp.
- ✉️ **Eventos de Mensajería**: Registra y procesa los mensajes entrantes de forma estructurada.

## Estructura de Archivos

- `index.js`: Archivo principal con la lógica de conexión, ciclo de vida de sesión y eventos.
- `package.json`: Configuración de dependencias y scripts de Node.js.
- `.gitignore`: Configuración para evitar subir credenciales privadas de sesión (`.wsp_session`) a repositorios git.

## Configuración y Arranque

1. **Instalar dependencias**:
   Asegúrate de estar en el directorio `eduai-wsp-bot` e instala las dependencias de Node.js:
   ```bash
   npm install
   ```

2. **Iniciar el bot**:
   Inicia el bot con el siguiente comando:
   ```bash
   npm start
   ```

3. **Vincular Sesión**:
   - En la consola se mostrará un código QR.
   - Abre WhatsApp en tu teléfono celular.
   - Ve a **Dispositivos Vinculados** -> **Vincular un dispositivo**.
   - Escanea el código QR que aparece en la consola.
   - Una vez autenticado, se creará el directorio `.wsp_session` con tus credenciales y el bot estará listo para interactuar.
