# Usar una imagen base de Node.js ligera
FROM node:20-slim

# Instalar ffmpeg para procesamiento de medios si es necesario
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción únicamente
RUN npm ci --only=production

# Copiar el código del bot
COPY index.js ./

# Crear el directorio para guardar las sesiones y ajustar permisos para el usuario 'node'
RUN mkdir -p /app/.wsp_session && chown -R node:node /app

# Declarar el volumen de persistencia para las credenciales del bot
VOLUME ["/app/.wsp_session"]

# Cambiar al usuario no privilegiado 'node' por seguridad
USER node

# Comando de ejecución
CMD ["npm", "start"]
