// Nombres de las cachés (separadas para poder limpiar los mapas sin borrar la app)
const APP_CACHE = 'geodrive-app-v1';
const TILES_CACHE = 'geodrive-tiles-v1';

// Límite de archivos de mapas para no llenar el disco duro del usuario
const MAX_TILE_ITEMS = 500; 

// Archivos base de la aplicación
const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/icon-513.png'
];

// 1. INSTALACIÓN: Guarda la interfaz base
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando y guardando App Shell...');
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
      return Promise.allSettled(
        APP_SHELL_FILES.map((url) => 
          cache.add(url).catch(err => console.warn(`[SW] No se pudo cachear: ${url}`))
        )
      );
    })
  );
  self.skipWaiting();
});

// 2. ACTIVACIÓN: Limpia cachés viejas
self.addEventListener('activate', (event) => {
  console.log('[SW] Activado y tomando control.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          // Borra cualquier caché que no sea la actual
          if (cache !== APP_CACHE && cache !== TILES_CACHE) {
            console.log('[SW] Borrando caché obsoleta:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. INTERCEPCIÓN DE PETICIONES (FETCH)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Regex mejorada para detectar imágenes, terrenos y modelos 3D de Cesium
  const isAsset = /\.(png|jpg|jpeg|webp|svg|terrain|layer|b3dm|pnts|i3dm|cmpt)(\?.*)?$/i.test(url.pathname);

  // ESTRATEGIA A: Cache-First para Mapas, 3D e Imágenes
  if (isAsset || event.request.destination === 'image') {
    event.respondWith(
      caches.open(TILES_CACHE).then(async (cache) => {
        // 1. Buscar en caché
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // 2. Si no está, pedirlo a la red
        try {
          const networkResponse = await fetch(event.request);
          
          // Guardar en caché si la petición fue exitosa (o si es cross-origin opaca)
          if (networkResponse.ok || networkResponse.type === 'opaque') {
            cache.put(event.request, networkResponse.clone());
            
            // --- MAGIA ANTI-COLAPSO (LRU) ---
            // Si la caché de mapas supera el límite, borra los más antiguos
            const keys = await cache.keys();
            if (keys.length > MAX_TILE_ITEMS) {
              await cache.delete(keys[0]); // Borra el primero (el más viejo)
            }
          }
          return networkResponse;
        } catch (error) {
          // Si falla la red y no está en caché, devuelve un error limpio
          return new Response('', { status: 404, statusText: 'Not found' });
        }
      })
    );
    return;
  }

  // ESTRATEGIA B: Network-First para HTML, JS, CSS y APIs
  event.respondWith(
    fetch(event.request)
      .then(async (networkResponse) => {
        if (networkResponse.ok) {
          const cache = await caches.open(APP_CACHE);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});
