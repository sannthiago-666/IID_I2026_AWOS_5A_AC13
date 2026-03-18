/**
 * MeteoServ — Lógica de integración de servicios
 * AWOS · Aplicación Web Orientada a Servicios
 */

// URLs de los servicios externos (el "contrato" de SOA)
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL   = 'https://api.open-meteo.com/v1/forecast';

// Traducción de códigos WMO (estándar meteorológico) al español
const WMO_CODES = {
    0: 'Despejado',
    1: 'Mayormente despejado',
    2: 'Parcialmente nublado',
    3: 'Nublado',
    45: 'Neblina',
    51: 'Llovizna ligera',
    61: 'Lluvia ligera',
    63: 'Lluvia moderada',
    65: 'Lluvia intensa',
    71: 'Nieve ligera',
    80: 'Chubascos',
    95: 'Tormenta eléctrica',
};

// Se ejecuta cuando el HTML está completamente cargado
document.addEventListener('DOMContentLoaded', () => {

    // Permite buscar presionando Enter en el campo de texto
    document.getElementById('cityInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') buscarClima();
    });

});

/**
 * Función principal: orquesta todo el flujo SOA
 * 1. Valida la entrada del usuario
 * 2. Llama al Servicio 1 (Geocoding)
 * 3. Llama al Servicio 2 (Weather) con el resultado
 * 4. Renderiza el resultado en la interfaz
 */
async function buscarClima() {

    // Obtener lo que el usuario escribió (y quitar espacios extra)
    const ciudad = document.getElementById('cityInput').value.trim();

    // Validación básica: ¿escribió algo?
    if (!ciudad) {
        mostrarError('Por favor escribe el nombre de una ciudad.');
        return; // detener aquí si no hay ciudad
    }

    // Preparar la UI para la carga
    ocultarError();
    mostrarEstado('loader');
    deshabilitarBoton(true);

    try {
        // PASO 1: Consumir Servicio de Geocoding → obtener coordenadas
        const coordenadas = await obtenerCoordenadas(ciudad);

        // PASO 2: Consumir Servicio de Clima → obtener datos meteorológicos
        const climaData = await obtenerClima(coordenadas.lat, coordenadas.lon);

        // PASO 3: Mostrar los datos en la interfaz
        renderizarResultado(coordenadas, climaData);

    } catch (error) {
        // Si algo falla, mostrar el error al usuario
        mostrarEstado('empty');
        mostrarError(error.message);

    } finally {
        // Esto se ejecuta siempre, haya error o no
        deshabilitarBoton(false);
    }
}

/**
 * SERVICIO 1: Geocoding
 * Convierte nombre de ciudad → coordenadas geográficas
 *
 * @param {string} ciudad - Nombre de la ciudad a buscar
 * @returns {Promise} - Objeto con lat, lon y datos de la ciudad
 */
async function obtenerCoordenadas(ciudad) {

    // Construir los parámetros de la URL
    const params = new URLSearchParams({
        name: ciudad,      // el nombre que el usuario escribió
        count: 1,          // solo queremos el primer resultado
        language: 'es',    // respuestas en español
        format: 'json',    // queremos JSON
    });

    // Armar la URL completa del servicio
    const url = `${GEOCODING_URL}?${params}`;

    // Hacer la petición HTTP GET al servicio
    const respuesta = await fetch(url);

    // Verificar que el servidor respondió correctamente
    if (!respuesta.ok) {
        throw new Error(`Error en el servicio de geocoding: ${respuesta.status}`);
    }

    // Convertir la respuesta de JSON a un objeto JavaScript
    const datos = await respuesta.json();

    // Verificar que encontró resultados
    if (!datos.results || datos.results.length === 0) {
        throw new Error(`Ciudad "${ciudad}" no encontrada. Verifica el nombre.`);
    }

    // Extraer el primer resultado
    const lugar = datos.results[0];

    // Devolver solo los datos que necesitamos
    return {
        lat:          lugar.latitude,
        lon:          lugar.longitude,
        nombreCompleto: lugar.name,
        pais:         lugar.country || 'Desconocido',
        admin:        lugar.admin1 || '',
    };
}

/**
 * SERVICIO 2: Weather
 * Obtiene datos del clima para unas coordenadas
 *
 * @param {number} lat - Latitud
 * @param {number} lon - Longitud
 * @returns {Promise} - Objeto con todos los datos climáticos
 */
async function obtenerClima(lat, lon) {

    // Construir parámetros — le decimos qué variables queremos
    const params = new URLSearchParams({
        latitude:  lat,
        longitude: lon,
        current: [
        'temperature_2m',         // temperatura actual
        'apparent_temperature',   // sensación térmica
        'relative_humidity_2m',   // humedad
        'wind_speed_10m',         // velocidad del viento
        'wind_direction_10m',     // dirección del viento
        'surface_pressure',       // presión atmosférica
        'visibility',             // visibilidad
        'weathercode',            // código de condición climática
        ].join(','),
        wind_speed_unit:   'kmh',
        temperature_unit:  'celsius',
        timezone:          'auto',
    });

    const url = `${WEATHER_URL}?${params}`;

    // Guardamos la URL para mostrarla al alumno en la "traza"
    window._ultimaUrl = url;

    const respuesta = await fetch(url);

    if (!respuesta.ok) {
        throw new Error(`Error en el servicio de clima: ${respuesta.status}`);
    }

    const datos = await respuesta.json();

    // Los datos actuales están en datos.current
    const c = datos.current;

    // Procesamos y devolvemos los datos limpios
    return {
        temperatura: Math.round(c.temperature_2m),
        sensacion:   Math.round(c.apparent_temperature),
        humedad:     c.relative_humidity_2m,
        viento:      Math.round(c.wind_speed_10m),
        direccion:   gradosADireccion(c.wind_direction_10m),
        presion:     Math.round(c.surface_pressure),
        visibilidad: c.visibility != null
                    ? (c.visibility / 1000).toFixed(1)
                    : '—',
        condicion:   WMO_CODES[c.weathercode] || `Código ${c.weathercode}`,
        timestamp:   new Date().toLocaleString('es-MX'),
    };
}

/**
 * Renderiza los datos en la interfaz de usuario.
 * Actualiza cada elemento HTML por su ID.
 */
function renderizarResultado(coords, clima) {

    // Nombre de la ciudad y país
    document.getElementById('res-city').textContent =
        coords.admin
        ? `${coords.nombreCompleto}, ${coords.admin}`
        : coords.nombreCompleto;

    document.getElementById('res-country').textContent =
        `${coords.pais} · Lat ${coords.lat.toFixed(4)}, Lon ${coords.lon.toFixed(4)}`;

    // Datos climáticos
    document.getElementById('res-temp').textContent     = clima.temperatura;
    document.getElementById('res-desc').textContent     = clima.condicion;
    document.getElementById('res-feels').textContent    = `${clima.sensacion}°C`;
    document.getElementById('res-humidity').textContent = `${clima.humedad}%`;
    document.getElementById('res-wind').textContent     = `${clima.viento} km/h ${clima.direccion}`;
    document.getElementById('res-pressure').textContent = `${clima.presion} hPa`;
    document.getElementById('res-visibility').textContent = `${clima.visibilidad} km`;

    // Traza de la petición (para que el alumno vea la URL consumida)
    document.getElementById('trace-url').textContent    = window._ultimaUrl;
    document.getElementById('trace-status').textContent = '200 OK';

    // Mostrar el panel de resultados
    mostrarEstado('result');
}

/**
 * Controla qué estado visual mostrar:
 * 'empty'  → mensaje inicial
 * 'loader' → animación de carga
 * 'result' → panel con datos
 */
function mostrarEstado(estado) {
    // Primero ocultamos todo
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('result-panel').classList.add('hidden');

    // Luego mostramos solo el que corresponde
    if (estado === 'empty')
        document.getElementById('empty-state').classList.remove('hidden');
    if (estado === 'loader')
        document.getElementById('loader').classList.remove('hidden');
    if (estado === 'result')
        document.getElementById('result-panel').classList.remove('hidden');
    }

    function mostrarError(mensaje) {
    document.getElementById('error-msg').textContent = mensaje;
    document.getElementById('error-box').classList.remove('hidden');
    }

    function ocultarError() {
    document.getElementById('error-box').classList.add('hidden');
    }

    function deshabilitarBoton(estado) {
    document.getElementById('searchBtn').disabled = estado;
    }

    /**
     * Convierte grados de dirección del viento a punto cardinal.
     * Ej: 90° → 'E', 270° → 'O'
     */
    function gradosADireccion(grados) {
    const dirs = ['N','NE','E','SE','S','SO','O','NO'];
    return dirs[Math.round(grados / 45) % 8];
}