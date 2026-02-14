/**
 * ═══════════════════════════════════════════════════════════════
 * 🚀 FIREBASE CLOUD MESSAGING SERVICE WORKER V3.0
 * ═══════════════════════════════════════════════════════════════
 * NOVÁ VERZE: Periodic Background Sync pro nepřetržitý běh!
 * - Běží na pozadí i když je browser zavřený
 * - Periodic Sync každých 12 hodin
 * - Kontroluje čas a posílá notifikace v 8:00
 * - Využívá IndexedDB pro perzistentní data
 * UMÍSTI TENTO SOUBOR DO ROOT SLOŽKY (vedle index.html)!
 * ═══════════════════════════════════════════════════════════════
 */

// Import Firebase skriptů pro Service Worker
importScripts('https://www.gstatic.com/firebasejs/8.6.8/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.6.8/firebase-messaging.js');

// Firebase konfigurace - STEJNÁ jako v medicFirebaseFunctions.js
const firebaseConfig = {
  apiKey: "AIzaSyC5gSU4hC8ZuC9ofefCcRj9sOY6ID3LQFQ",
  authDomain: "medic-protokol-jirik.firebaseapp.com",
  projectId: "medic-protokol-jirik",
  storageBucket: "medic-protokol-jirik.firebasestorage.app",
  messagingSenderId: "162734152774",
  appId: "1:162734152774:web:31ab98174d2d04f9f1fe47",
  measurementId: "G-0Z3TNN5K88"
};

// Inicializace Firebase v Service Workeru
firebase.initializeApp(firebaseConfig);

// Získání instance Firebase Messaging
const messaging = firebase.messaging();

// ═══════════════════════════════════════════════════════════════
// 🆕 PERIODIC BACKGROUND SYNC - NEPŘETRŽITÝ BĚH
// ═══════════════════════════════════════════════════════════════

const DB_NAME = 'jirikuv-lekarsky-protokol';
const DB_VERSION = 1;
const STORE_MEDICINES = 'medicines';
const STORE_NOTIFICATIONS = 'notification-log';
const SYNC_TAG = 'medicine-check-sync';

/**
 * @function openDatabase
 * @description Otevře IndexedDB databázi
 */
async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Store pro léky
      if (!db.objectStoreNames.contains(STORE_MEDICINES)) {
        db.createObjectStore(STORE_MEDICINES, { keyPath: 'id' });
      }
      
      // Store pro log notifikací
      if (!db.objectStoreNames.contains(STORE_NOTIFICATIONS)) {
        const store = db.createObjectStore(STORE_NOTIFICATIONS, { autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
    };
  });
}

/**
 * @function getMedicinesFromIndexedDB
 * @description Načte léky z IndexedDB
 */
async function getMedicinesFromIndexedDB() {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_MEDICINES, 'readonly');
    const store = transaction.objectStore(STORE_MEDICINES);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[SW] Chyba při načítání léků z IndexedDB:', error);
    return [];
  }
}

/**
 * @function saveMedicinesToIndexedDB
 * @description Uloží léky do IndexedDB
 */
async function saveMedicinesToIndexedDB(medicines) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_MEDICINES, 'readwrite');
    const store = transaction.objectStore(STORE_MEDICINES);
    
    // Smažeme staré a uložíme nové
    await store.clear();
    
    for (const medicine of medicines) {
      await store.put(medicine);
    }
    
    console.log('[SW] ✅ Léky uloženy do IndexedDB:', medicines.length);
  } catch (error) {
    console.error('[SW] Chyba při ukládání léků do IndexedDB:', error);
  }
}

/**
 * @function logNotification
 * @description Zaznamená odeslanou notifikaci
 */
async function logNotification(type, message) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NOTIFICATIONS, 'readwrite');
    const store = transaction.objectStore(STORE_NOTIFICATIONS);
    
    const today = new Date();
    const dateKey = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    await store.add({
      type: type,
      message: message,
      timestamp: Date.now(),
      date: dateKey
    });
    
    console.log('[SW] ✅ Notifikace zalogována:', type);
  } catch (error) {
    console.error('[SW] Chyba při logování notifikace:', error);
  }
}

/**
 * @function wasNotificationSentToday
 * @description Kontroluje, zda byla dnes už notifikace daného typu poslána
 */
async function wasNotificationSentToday(type) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NOTIFICATIONS, 'readonly');
    const store = transaction.objectStore(STORE_NOTIFICATIONS);
    const index = store.index('date');
    
    const today = new Date().toISOString().split('T')[0];
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(today);
      request.onsuccess = () => {
        const todayNotifications = request.result || [];
        const found = todayNotifications.some(n => n.type === type);
        resolve(found);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[SW] Chyba při kontrole notifikací:', error);
    return false;
  }
}

/**
 * @function checkAndSendNotifications
 * @description Hlavní logika - kontroluje léky a posílá notifikace
 */
async function checkAndSendNotifications() {
  console.log('[SW] 🔍 Spouštím kontrolu léků...');
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // Kontrola času - posíláme mezi 7:45 - 8:15
  const isRightTime = (currentHour === 7 && currentMinute >= 45) || 
                      (currentHour === 8 && currentMinute <= 15);
  
  if (!isRightTime) {
    console.log(`[SW] ⏰ Není správný čas. Aktuálně: ${currentHour}:${currentMinute}`);
    return;
  }
  
  // Kontrola zda už byla dnes ranní notifikace poslána
  const dailyReminderSent = await wasNotificationSentToday('daily-reminder');
  
  if (dailyReminderSent) {
    console.log('[SW] ℹ️ Ranní notifikace již byla dnes poslána');
    return;
  }
  
  // Načteme léky
  const medicines = await getMedicinesFromIndexedDB();
  
  if (medicines.length === 0) {
    console.log('[SW] ⚠️ Žádné léky v databázi');
    return;
  }
  
  // Filtrujeme aktivní léky
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const activeMedicines = medicines.filter(medicine => 
    medicine.status === 'Beru' || medicine.status === 'Používám'
  );
  
  if (activeMedicines.length === 0) {
    console.log('[SW] ℹ️ Žádné aktivní léky k připomínce');
    return;
  }
  
  // Vytvoříme seznam léků s počtem zbývajících dní
  let medicineList = '';
  let warningList = '';
  
  activeMedicines.forEach(medicine => {
    const emoji = medicine.status === 'Beru' ? '💊' : '🔵';
    
    if (medicine.endDate) {
      const endDate = new Date(medicine.endDate);
      endDate.setHours(0, 0, 0, 0);
      const diffTime = endDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      medicineList += `${emoji} ${medicine.name} - zbývá ${diffDays} dní\n`;
      
      // Přidáme varování pro léky končící brzy
      if (diffDays <= 7 && diffDays > 0) {
        warningList += `⚠️ ${medicine.name} - zbývá ${diffDays} dní\n`;
      } else if (diffDays <= 0) {
        warningList += `🔴 ${medicine.name} - SKONČENO!\n`;
      }
    } else {
      // Lék bez koncového data
      medicineList += `${emoji} ${medicine.name} - dlouhodobě\n`;
    }
  });
  
  // Sestavíme zprávu
  let notificationBody = `🌅 Dobré ráno, admirále!\n\n`;
  notificationBody += `Dnes užíváš:\n${medicineList}`;
  
  if (warningList) {
    notificationBody += `\n⚠️ Upozornění:\n${warningList}`;
  }
  
  // Pošleme notifikaci
  try {
    await self.registration.showNotification('🌅 Ranní přehled léků', {
      body: notificationBody.trim(),
      icon: 'https://raw.githubusercontent.com/jirka22med/Lekarsky-Protokol-Jirika-2.cz/11b61ddd0c3cf63536e88c9ffdc2acb93321f095/image_192x192.png',
      badge: 'https://raw.githubusercontent.com/jirka22med/Lekarsky-Protokol-Jirika-2.cz/11b61ddd0c3cf63536e88c9ffdc2acb93321f095/image_72x72.png',
      tag: 'daily-reminder',
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: {
        type: 'daily-reminder',
        timestamp: Date.now(),
        url: self.registration.scope
      }
    });
    
    console.log('[SW] 📤 Ranní notifikace odeslána!');
    await logNotification('daily-reminder', 'Ranní přehled léků odeslán');
    
  } catch (error) {
    console.error('[SW] ❌ Chyba při odesílání notifikace:', error);
  }
}

/**
 * Handler pro Periodic Background Sync
 */
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] 🔄 Periodic Sync Event:', event.tag);
  
  if (event.tag === SYNC_TAG) {
    event.waitUntil(checkAndSendNotifications());
  }
});

/**
 * Handler pro jednorazový sync (fallback)
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] 🔄 Sync Event:', event.tag);
  
  if (event.tag === 'medicine-check') {
    event.waitUntil(checkAndSendNotifications());
  }
});

/**
 * Handler pro zprávy od hlavní aplikace
 */
self.addEventListener('message', async (event) => {
  console.log('[SW] 📨 Zpráva od aplikace:', event.data);
  
  if (event.data.type === 'UPDATE_MEDICINES') {
    // Aplikace nám poslala aktualizovaná data léků
    await saveMedicinesToIndexedDB(event.data.medicines);
  } else if (event.data.type === 'CHECK_NOW') {
    // Manuální trigger kontroly (pro testování)
    await checkAndSendNotifications();
  } else if (event.data.type === 'GET_SYNC_STATUS') {
    // Vrátíme stav periodic sync
    const registration = await self.registration.periodicSync.getTags();
    event.ports[0].postMessage({
      registered: registration.includes(SYNC_TAG),
      tags: registration
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🔥 FIREBASE CLOUD MESSAGING HANDLERS (zachováno z originálu)
// ═══════════════════════════════════════════════════════════════

/**
 * Handler pro příchozí zprávy když je aplikace na pozadí
 */
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Přijata FCM zpráva na pozadí:', payload);

  const notificationTitle = payload.notification?.title || '🚀 Lékařský Protokol';
  const notificationOptions = {
    body: payload.notification?.body || 'Nová zpráva od admirála Jiříka',
    icon: payload.notification?.icon || 'https://raw.githubusercontent.com/jirka22med/Lekarsky-Protokol-Jirika-2.cz/11b61ddd0c3cf63536e88c9ffdc2acb93321f095/image_192x192.png',
    badge: 'https://raw.githubusercontent.com/jirka22med/Lekarsky-Protokol-Jirika-2.cz/11b61ddd0c3cf63536e88c9ffdc2acb93321f095/image_72x72.png',
    tag: payload.notification?.tag || 'background-notification',
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: payload.data || {},
    actions: [
      {
        action: 'open',
        title: '🖖 Otevřít protokol'
      },
      {
        action: 'close',
        title: '❌ Zavřít'
      }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

/**
 * Handler pro kliknutí na notifikaci
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Kliknuto na notifikaci:', event);

  event.notification.close();

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            if (client.url.includes('index.html') || client.url.endsWith('/')) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});

/**
 * Handler pro instalaci Service Workeru
 */
self.addEventListener('install', (event) => {
  console.log('[SW] 🔧 Instalace Service Workeru V3.0...');
  self.skipWaiting();
});

/**
 * Handler pro aktivaci Service Workeru
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] ✅ Service Worker V3.0 aktivován!');
  event.waitUntil(clients.claim());
});

console.log('[SW] 🚀 Firebase Messaging Service Worker V3.0 s Periodic Sync načten! 🖖');
