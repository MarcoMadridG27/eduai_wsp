import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import crypto from 'crypto';

// URL de las APIs internas (configurables por variables de entorno)
const CORE_API_URL = process.env.CORE_API_URL || 'http://127.0.0.1:7700';
const PDF_API_URL = process.env.PDF_API_URL || 'http://127.0.0.1:9000';

// Configuración del logger para pino-pretty
const logger = pino({
    level: 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
        }
    }
});

// Estado en memoria para guiar al docente paso a paso
const userStates = {};

async function startBot() {
    logger.info('Iniciando el Bot de WhatsApp de EduAI...');

    // 1. Obtener el estado de autenticación (sesión persistente en .wsp_session)
    const { state, saveCreds } = await useMultiFileAuthState('.wsp_session');

    // Obtener la versión de WhatsApp Web más reciente para evitar el error 405 (Connection Failure)
    let version = [2, 3000, 1017531287]; // Versión de respaldo robusta
    try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
        logger.info(`Versión de WhatsApp Web obtenida con éxito: v${version.join('.')}`);
    } catch (err) {
        logger.warn(`No se pudo obtener la versión de WhatsApp Web actual en tiempo real. Usando versión de respaldo: v${version.join('.')}`);
    }

    // 2. Inicializar la conexión del socket de WhatsApp
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    // 3. Registrar eventos de actualización de credenciales
    sock.ev.on('creds.update', saveCreds);

    // 4. Manejar actualizaciones de conexión y generación del código QR
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            logger.info('--- NUEVO CÓDIGO QR GENERADO ---');
            logger.info('Escanea el siguiente código QR con tu aplicación móvil de WhatsApp:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const error = lastDisconnect?.error;
            const statusCode = error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            logger.warn(`Conexión de WhatsApp cerrada debido a: ${error || 'Error Desconocido'}`);
            logger.info(`Código de estado: ${statusCode}. ¿Intentar reconectar?: ${shouldReconnect}`);

            if (shouldReconnect) {
                logger.info('Reconectando en 5 segundos...');
                setTimeout(() => {
                    startBot();
                }, 5000);
            } else {
                logger.error('Sesión cerrada permanentemente o dispositivo desvinculado.');
                logger.error('Elimina la carpeta ".wsp_session" e inicia nuevamente para generar un nuevo código QR.');
            }
        } else if (connection === 'open') {
            logger.info('=============================================');
            logger.info(' 🎉 ¡Conexión con WhatsApp establecida con Éxito! 🎉');
            logger.info(` Bot activo: ${sock.user?.name || 'Desconocido'} (${sock.user?.id.split(':')[0]})`);
            logger.info('=============================================');
        }
    });

    // 5. Escuchar y responder a los mensajes recibidos
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const { messages, type } = chatUpdate;
            if (type !== 'notify') return;

            for (const msg of messages) {
                if (msg.key.fromMe) continue;

                const from = msg.key.remoteJid;
                const pushName = msg.pushName || 'Docente';
                const messageText = (msg.message?.conversation || 
                                    msg.message?.extendedTextMessage?.text || 
                                    '').trim();

                if (!messageText) continue;

                logger.info(`[Mensaje Recibido] De: ${pushName} (${from}) -> "${messageText}"`);

                // Comando: Cancelar flujo de creación
                if (messageText.toLowerCase() === '/cancelar' || messageText.toLowerCase() === 'cancelar') {
                    if (userStates[from]) {
                        delete userStates[from];
                        await sock.sendMessage(from, { 
                            text: '❌ Creación de sesión cancelada. Escribe *crear sesion* cuando estés listo para comenzar de nuevo.' 
                        });
                    } else {
                        await sock.sendMessage(from, { text: 'No tienes ningún proceso activo para cancelar.' });
                    }
                    continue;
                }

                // Si el docente ya está en medio del flujo guiado para crear una sesión
                if (userStates[from]) {
                    const state = userStates[from];

                    if (state.step === 'theme') {
                        state.data.tema = messageText;
                        state.step = 'grade';
                        await sock.sendMessage(from, { 
                            text: '📚 Entendido. Ahora, ¿para qué **grado o año de secundaria** es la sesión?\n\n_(Ejemplo: "1ro de secundaria", "5to de secundaria")_\n\n👉 Escribe *cancelar* si deseas abortar.' 
                        });
                    } 
                    else if (state.step === 'grade') {
                        state.data.grado = messageText;
                        state.step = 'duration';
                        await sock.sendMessage(from, { 
                            text: '⏳ Perfecto. ¿Cuál es la **duración** de la sesión?\n\n_(Ejemplo: "90 minutos", "2 horas")_\n\n👉 Escribe *cancelar* si deseas abortar.' 
                        });
                    } 
                    else if (state.step === 'duration') {
                        state.data.duracion = messageText;
                        state.step = 'competencia';
                        await sock.sendMessage(from, { 
                            text: '🎯 Excelente. Ahora selecciona la **Competencia** de Matemática a desarrollar.\n\nEscribe el número correspondiente (1, 2, 3 o 4) o escribe una personalizada:\n\n*1.* Resuelve problemas de cantidad\n*2.* Resuelve problemas de regularidad, equivalencia y cambio\n*3.* Resuelve problemas de forma, movimiento y localización\n*4.* Resuelve problemas de gestión de datos e incertidumbre\n\n👉 Escribe *cancelar* si deseas abortar.' 
                        });
                    } 
                    else if (state.step === 'competencia') {
                        let competencia = messageText;
                        if (messageText === '1') competencia = 'Resuelve problemas de cantidad';
                        else if (messageText === '2') competencia = 'Resuelve problemas de regularidad, equivalencia y cambio';
                        else if (messageText === '3') competencia = 'Resuelve problemas de forma, movimiento y localización';
                        else if (messageText === '4') competencia = 'Resuelve problemas de gestión de datos e incertidumbre';
                        
                        state.data.competencia = competencia;
                        state.step = 'contexto';
                        await sock.sendMessage(from, { 
                            text: '🌍 Por último, ¿deseas especificar algún **contexto sociocultural o de aula** especial?\n\n_(Ejemplo: "Estudiantes con baja conectividad", "Uso de material didáctico concreto", "Colegio en zona rural")_\n\n👉 Si no deseas agregar contexto, escribe *omitir* o *saltar*.\n👉 Escribe *cancelar* si deseas abortar.' 
                        });
                    }
                    else if (state.step === 'contexto') {
                        const lowMsg = messageText.toLowerCase();
                        if (lowMsg === 'omitir' || lowMsg === 'saltar' || lowMsg === 'ninguno' || lowMsg === 'no') {
                            state.data.contexto = '';
                        } else {
                            state.data.contexto = messageText;
                        }

                        const finalData = { ...state.data };
                        delete userStates[from]; // Limpiamos el estado inmediatamente

                        let resumen = `⏳ ¡Excelente! Datos recopilados:\n\n`;
                        resumen += `• *Tema:* ${finalData.tema}\n`;
                        resumen += `• *Grado:* ${finalData.grado}\n`;
                        resumen += `• *Duración:* ${finalData.duracion}\n`;
                        resumen += `• *Competencia:* ${finalData.competencia}\n`;
                        if (finalData.contexto) {
                            resumen += `• *Contexto:* ${finalData.contexto}\n`;
                        }

                        resumen += `\nEstoy generando tu **Sesión de Aprendizaje** de Matemática de secundaria estructurada con IA alineada al Currículo Nacional Peruano. Esto tardará unos 15-25 segundos. Te enviaré el PDF directamente aquí. 🚀`;

                        await sock.sendMessage(from, { text: resumen });

                        // Arrancamos el proceso de generación de forma asíncrona
                        generateAndSendSessionPDF(sock, from, pushName, finalData);
                    }
                    continue;
                }

                // Comando inicial: Crear sesión
                if (
                    messageText.toLowerCase() === 'crear sesion' || 
                    messageText.toLowerCase() === 'nueva sesion' || 
                    messageText.toLowerCase() === '/sesion' ||
                    messageText.toLowerCase() === 'sesion'
                ) {
                    userStates[from] = {
                        step: 'theme',
                        data: {
                            docente: pushName,
                            fecha: new Date().toLocaleDateString('es-PE'),
                        }
                    };

                    await sock.sendMessage(from, { 
                        text: `📝 *Bienvenido al Generador de Sesiones de EduAI* 👋\n\nVamos a armar tu planificación pedagógica paso a paso.\n\n👉 Por favor, responde escribiendo el **Tema o Título** de la sesión de Matemática:\n_(Ejemplo: "Ecuaciones cuadráticas", "Teorema de Pitágoras", "Funciones trigonométricas")_` 
                    });
                    continue;
                }

                // Mensaje genérico de bienvenida / instrucciones
                await sock.sendMessage(from, { 
                    text: `¡Hola, *${pushName}*! 👋 Bienvenido al bot oficial de *EduAI* en WhatsApp.\n\nTe puedo ayudar a planificar tus clases de *Matemática para secundaria* de forma rápida y profesional, totalmente alineadas al Currículo Nacional.\n\n💡 Para empezar, simplemente escribe:\n👉 *crear sesion* o *nueva sesion*` 
                });
            }
        } catch (error) {
            logger.error('Error al procesar el mensaje:', error);
        }
    });
}

/**
 * Función asíncrona que interactúa con las APIs del backend para generar la sesión y enviar el PDF
 */
async function generateAndSendSessionPDF(sock, to, docenteName, sessionInputs) {
    const sessionId = crypto.randomUUID();
    try {
        logger.info(`[Generando Sesión] Iniciando API para: "${sessionInputs.tema}" - ID: ${sessionId}`);

        // 1. Llamar a eduai_core para generar el JSON estructurado de la sesión
        const generateResponse = await fetch(`${CORE_API_URL}/api/sessions/${sessionId}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: 'whatsapp',
                data: {
                    tema: sessionInputs.tema,
                    grado: sessionInputs.grado,
                    duracion: sessionInputs.duracion,
                    docente: docenteName,
                    fecha: sessionInputs.fecha,
                    titulo: sessionInputs.tema,
                    competenciasSeleccionadas: sessionInputs.competencia ? [sessionInputs.competencia] : [],
                    contexto: sessionInputs.contexto || ""
                }
            })
        });

        if (!generateResponse.ok) {
            const errorDetails = await generateResponse.text();
            throw new Error(`Fallo en eduai_core (${generateResponse.status}): ${errorDetails}`);
        }

        const sessionResult = await generateResponse.json();
        logger.info(`[Generando Sesión] JSON de sesión creado exitosamente.`);

        // 2. Extraer los datos generados para pasárselos a la API de PDF
        // La API de generación nos devuelve un JSON con la estructura { session_id, status, data: { ... } }
        const sessionData = sessionResult.data;

        await sock.sendMessage(to, { 
            text: '📄 ¡Fórmula pedagógica estructurada! Ahora estoy renderizando el documento en un formato PDF profesional... 🛠️' 
        });

        // 3. Llamar a pdf-render para generar el archivo PDF
        const pdfResponse = await fetch(`${PDF_API_URL}/generate-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: sessionData
            })
        });

        if (!pdfResponse.ok) {
            const errorDetails = await pdfResponse.text();
            throw new Error(`Fallo en pdf-render (${pdfResponse.status}): ${errorDetails}`);
        }

        const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
        logger.info(`[Generando Sesión] PDF generado exitosamente. Tamaño: ${pdfBuffer.length} bytes.`);

        // Formatear nombre de archivo seguro
        const safeFileName = `Sesion_${sessionInputs.tema.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

        // 4. Enviar el PDF resultante al docente en WhatsApp
        await sock.sendMessage(to, {
            document: pdfBuffer,
            fileName: safeFileName,
            mimetype: 'application/pdf',
            caption: `✨ *¡Sesión de Aprendizaje Lista!* ✨\n\nAquí tienes tu planificación completa para *${sessionInputs.tema}* (${sessionInputs.grado}) generada por *EduAI*. 🚀\n\n¡Espero que te sea de gran utilidad en el aula!`
        });

        logger.info(`[Generando Sesión] PDF enviado exitosamente a: ${to}`);

    } catch (error) {
        logger.error(`Error crítico en la generación de sesión para ${to}:`, error);
        await sock.sendMessage(to, { 
            text: `❌ Lo siento, ocurrió un error al procesar tu sesión de aprendizaje.\n\n*Detalle del error:* ${error.message}\n\nPor favor, verifica que los servicios backend estén activos e intenta de nuevo.` 
        });
    }
}

// Arrancar el proceso de conexión
startBot().catch(err => {
    logger.error('Fallo crítico al iniciar el bot:', err);
});
