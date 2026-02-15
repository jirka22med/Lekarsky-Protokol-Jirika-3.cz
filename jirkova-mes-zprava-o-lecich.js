/**
 * ═══════════════════════════════════════════════════════════════
 * 🚀 JIŘÍKŮV LÉKAŘSKÝ NOTIFIKAČNÍ SYSTÉM - FCM MODUL V3.0 🚀
 * ═══════════════════════════════════════════════════════════════
 * NEJNOVĚJŠÍ VERZE - Periodic Background Sync!
 * - Běží nepřetržitě na pozadí (i když je browser zavřený)
 * - Využívá Periodic Background Sync API
 * - Synchronizuje data do IndexedDB
 * - Fallback na klasické notifikace pro nepodporované prohlížeče
 * ═══════════════════════════════════════════════════════════════
 */

console.log("🚀 JIŘÍKŮV FCM MODUL V3.0: Inicializace s Periodic Sync...");

// Globální proměnné pro FCM
let messaging = null;
let notificationPermission = 'default';
let fcmToken = null;
let usePeriodicSync = false; // Přepínač mezi Periodic Sync a fallback

/**
 * @function initializeFCMNotifications
 * @description Hlavní inicializační funkce pro FCM notifikace
 */
window.initializeFCMNotifications = async function() {
    console.log("🎯 Spouštím FCM notifikační systém V3.0...");
    
    // Kontrola podpory prohlížeče
    if (!('Notification' in window)) {
        console.error("❌ Tento prohlížeč nepodporuje notifikace!");
        window.showUserMessage('Tvůj prohlížeč nepodporuje notifikace!', true);
        return false;
    }

    if (!('serviceWorker' in navigator)) {
        console.error("❌ Tento prohlížeč nepodporuje Service Workers!");
        window.showUserMessage('Tvůj prohlížeč nepodporuje Service Workers!', true);
        return false;
    }

    try {
        // Kontrola zda je Firebase Messaging k dispozici
        if (typeof firebase === 'undefined' || !firebase.messaging) {
            console.error("❌ Firebase Messaging není načten!");
            window.showUserMessage('Firebase Messaging není k dispozici!', true);
            return false;
        }

        // Inicializace Firebase Messaging
        messaging = firebase.messaging();
        console.log("✅ Firebase Messaging inicializováno");

        // Registrace Service Workeru
        await registerServiceWorker();

        // Vytvoření UI pro notifikace
        createNotificationUI();
        
        // Vytvoření UI pro Periodic Sync
        if (typeof window.setupPeriodicSyncUI === 'function') {
            window.setupPeriodicSyncUI();
        }

        // Počkáme na načtení dat z Firestore
        waitForMedicinesData().then(() => {
            // Detekce zda použít Periodic Sync nebo fallback
            detectAndSetupNotificationStrategy();
        });

        console.log("🚀 FCM notifikační systém V3.0 plně operační!");
        return true;

    } catch (error) {
        console.error("❌ Chyba při inicializaci FCM:", error);
        window.showUserMessage('Chyba při spuštění notifikačního systému!', true);
        return false;
    }
};

/**
 * @function registerServiceWorker
 * @description Registruje Service Worker pro FCM
 */
async function registerServiceWorker() {
    try {
        // Nejdřív zkusíme odregistrovat starý SW
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
            if (registration.active?.scriptURL.includes('firebase-messaging-sw.js')) {
                console.log("🔄 Odregistrovávám starý Service Worker...");
                await registration.unregister();
            }
        }
        
        // Registrujeme nový SW s Periodic Sync
        // DŮLEŽITÉ: Soubor musí být pojmenovaný firebase-messaging-sw.js a být v root!
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        console.log("✅ Service Worker V3.0 zaregistrován:", registration);
        
        // Počkáme na aktivaci Service Workeru
        await navigator.serviceWorker.ready;
        console.log("✅ Service Worker je aktivní a připravený!");
        
        return registration;
    } catch (error) {
        console.error("❌ Chyba při registraci Service Workeru:", error);
        throw error;
    }
}

/**
 * @function detectAndSetupNotificationStrategy
 * @description Detekuje nejlepší strategii pro notifikace
 */
async function detectAndSetupNotificationStrategy() {
    console.log("🔍 Detekuji nejlepší strategii pro notifikace...");
    
    // Zkontrolujeme podporu Periodic Sync
    const periodicSyncSupported = 'periodicSync' in ServiceWorkerRegistration.prototype;
    const isPWAInstalled = window.matchMedia('(display-mode: standalone)').matches;
    
    console.log(`Periodic Sync podporováno: ${periodicSyncSupported}`);
    console.log(`PWA nainstalováno: ${isPWAInstalled}`);
    
    if (periodicSyncSupported && isPWAInstalled) {
        // Máme podporu a PWA je nainstalovaná → použijeme Periodic Sync
        console.log("✅ Použiji Periodic Background Sync!");
        usePeriodicSync = true;
        
        // Synchronizujeme data do SW
        if (window.currentMedicines && window.currentMedicines.length > 0) {
            await window.syncMedicinesToServiceWorker(window.currentMedicines);
        }
        
        // NOVÉ: Zkontrolujeme zda už není Periodic Sync aktivní
        try {
            const registration = await navigator.serviceWorker.ready;
            const tags = await registration.periodicSync.getTags();
            
            if (tags.includes('medicine-check-sync')) {
                console.log('✅ Periodic Sync již byl aktivován dříve - obnovuji stav UI');
                window.showUserMessage('✅ Běh na pozadí je aktivní');
                
                // Aktualizujeme UI tlačítko
                if (typeof window.updateSyncButtonState === 'function') {
                    setTimeout(() => {
                        window.updateSyncButtonState();
                    }, 2000);
                }
            } else {
                console.log('💡 Periodic Sync zatím není aktivní');
                window.showUserMessage('💡 Tip: Aktivuj "Běh na pozadí" pro automatické notifikace!');
            }
        } catch (error) {
            console.error('❌ Chyba při kontrole Periodic Sync stavu:', error);
        }
        
    } else if (periodicSyncSupported && !isPWAInstalled) {
        // Periodic Sync je podporován, ale PWA není nainstalovaná
        console.log("⚠️ Periodic Sync podporován, ale PWA není nainstalovaná");
        usePeriodicSync = false;
        
        window.showUserMessage('💡 Tip: Nainstaluj aplikaci (ikona ⊕) pro notifikace i když je zavřeno!');
        
        // Fallback na klasické notifikace
        setupFallbackNotifications();
        
    } else {
        // Periodic Sync není podporován → fallback
        console.log("⚠️ Periodic Sync není podporován, použiji fallback");
        usePeriodicSync = false;
        
        window.showUserMessage('💡 Tip: Pro nejlepší funkčnost použij Chrome nebo Edge!');
        
        // Fallback na klasické notifikace
        setupFallbackNotifications();
    }
}

/**
 * @function setupFallbackNotifications
 * @description Nastaví fallback notifikace pro prohlížeče bez Periodic Sync
 */
function setupFallbackNotifications() {
    console.log("🔄 Nastavuji fallback notifikační systém...");
    
    // Klasické plánování pomocí setTimeout (funguje jen když je tab otevřený)
    scheduleDailyReminder();
    
    console.log("⚠️ Fallback notifikace aktivní (fungují jen když je tab otevřený)");
}

/**
 * @function waitForMedicinesData
 * @description Počká až budou data léků k dispozici
 */
function waitForMedicinesData() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (window.currentMedicines && window.currentMedicines.length > 0) {
                console.log("✅ Data léků jsou k dispozici");
                clearInterval(checkInterval);
                resolve();
            }
        }, 500);
        
        // Timeout po 30 sekundách
        setTimeout(() => {
            clearInterval(checkInterval);
            console.log("⏰ Timeout při čekání na data léků");
            resolve();
        }, 30000);
    });
}

/**
 * @function requestNotificationPermission
 * @description Požádá uživatele o povolení notifikací
 */
window.requestNotificationPermission = async function() {
    console.log("🔔 Žádám o povolení notifikací...");

    try {
        const permission = await Notification.requestPermission();
        notificationPermission = permission;

        if (permission === 'granted') {
            console.log("✅ Notifikace povoleny!");
            window.showUserMessage('🎉 Notifikace povoleny! Budeš informován o léčích.');
            
            // Získáme FCM token
            await getFCMToken();
            
            // Aktualizujeme UI
            updateNotificationButton(true);
            
            // Odešleme testovací notifikaci
            await sendTestNotification();
            
            // Po povolení notifikací navrhnem aktivaci Periodic Sync
            setTimeout(() => {
                if (window.checkPeriodicSyncSupport && window.checkPeriodicSyncSupport()) {
                    window.showUserMessage('💡 Nezapomeň aktivovat "Běh na pozadí"!');
                }
            }, 3000);
            
        } else if (permission === 'denied') {
            console.log("❌ Notifikace zamítnuty!");
            window.showUserMessage('⚠️ Notifikace byly zamítnuty. Povol je v nastavení prohlížeče.', true);
            updateNotificationButton(false);
        } else {
            console.log("⏳ Notifikace zatím nepovoleny");
            updateNotificationButton(false);
        }

        return permission;

    } catch (error) {
        console.error("❌ Chyba při žádosti o notifikace:", error);
        window.showUserMessage('Chyba při žádosti o notifikace!', true);
        return 'denied';
    }
};

/**
 * @function getFCMToken
 * @description Získá FCM token pro zasílání notifikací
 */
async function getFCMToken() {
    try {
        const vapidKey = 'BEPlJPREV3rAUkaPNkM-rfeeA__X-vaw7ji_lojde4qVbOKv3j-JBr46l5Bf2ME-3BoTpev5goHrFVGuWD60YN0';

        fcmToken = await messaging.getToken({ 
            vapidKey: vapidKey,
            serviceWorkerRegistration: await navigator.serviceWorker.ready
        });

        if (fcmToken) {
            console.log("✅ FCM Token získán:", fcmToken);
            console.log("🔥 ZKOPÍRUJ TENTO TOKEN DO FIREBASE CAMPAIGNS:");
            console.log(fcmToken);
            console.log("📋 Vlož ho do: Firebase Console → Messaging → Edit Campaign → Target → FCM Token");
            
            // Uložíme do global variable pro snadný přístup
            window.fcmToken = fcmToken;
            
            await saveFCMTokenToFirestore(fcmToken);
            return fcmToken;
        } else {
            console.log("❌ Nepodařilo se získat FCM token");
            return null;
        }

    } catch (error) {
        console.error("❌ Chyba při získávání FCM tokenu:", error);
        if (error.code === 'messaging/token-subscribe-failed') {
            console.warn("⚠️ FCM token se nepodařilo získat - pravděpodobně běžíš na localhost.");
        }
        return null;
    }
}

/**
 * @function saveFCMTokenToFirestore
 * @description Uloží FCM token do Firestore
 */
async function saveFCMTokenToFirestore(token) {
    try {
        if (!db || !userId) {
            console.error("❌ Firestore nebo userId není k dispozici");
            return;
        }

        await db.collection('fcmTokens').doc(userId).set({
            token: token,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            userId: userId,
            periodicSyncEnabled: usePeriodicSync
        }, { merge: true });

        console.log("✅ FCM token uložen do Firestore");

    } catch (error) {
        console.error("❌ Chyba při ukládání FCM tokenu:", error);
    }
}

/**
 * @function createNotificationUI
 * @description Vytvoří UI tlačítko pro správu notifikací
 */
function createNotificationUI() {
    const filterButtons = document.getElementById('filter-buttons');
    
    if (!filterButtons) {
        console.error("❌ Nenalezen element #filter-buttons");
        return;
    }

    // Zkontrolujeme zda tlačítko již neexistuje
    if (document.getElementById('notification-toggle')) {
        console.log("ℹ️ Notifikační tlačítko již existuje");
        return;
    }

    const notifButton = document.createElement('button');
    notifButton.id = 'notification-toggle';
    notifButton.innerHTML = '🔔 Povolit notifikace';
    notifButton.title = 'Klikni pro povolení notifikací o lécích';
    notifButton.style.cssText = `
        background-color: #ff6600;
        color: white;
        border: 2px solid #ff6600;
        padding: 10px 15px;
        cursor: pointer;
        font-size: 1em;
        border-radius: 8px;
        transition: all 0.3s ease;
    `;
    
    notifButton.addEventListener('click', () => {
        window.requestNotificationPermission();
    });
    
    filterButtons.appendChild(notifButton);
    
    // Zjistíme aktuální stav notifikací
    if (Notification.permission === 'granted') {
        updateNotificationButton(true);
    }
}

/**
 * @function updateNotificationButton
 * @description Aktualizuje vzhled tlačítka pro notifikace
 */
function updateNotificationButton(granted) {
    const button = document.getElementById('notification-toggle');
    if (!button) return;
    
    if (granted) {
        button.innerHTML = '✅ Notifikace povoleny';
        button.style.backgroundColor = '#00ff00';
        button.style.borderColor = '#00ff00';
    } else {
        button.innerHTML = '🔔 Povolit notifikace';
        button.style.backgroundColor = '#ff6600';
        button.style.borderColor = '#ff6600';
    }
}

/**
 * @function sendTestNotification
 * @description Pošle testovací uvítací notifikaci
 */
async function sendTestNotification() {
    if (Notification.permission !== 'granted') return;

    try {
        const registration = await navigator.serviceWorker.ready;
        
        await registration.showNotification('🖖 Vítej na palubě, admirále!', {
            body: 'Notifikace jsou aktivní!\n\nBudeš dostávat denní přehled léků každé ráno v 8:00.',
            icon: 'https://raw.githubusercontent.com/jirka22med/Lekarsky-Protokol-Jirika-2.cz/11b61ddd0c3cf63536e88c9ffdc2acb93321f095/image_192x192.png',
            badge: 'https://raw.githubusercontent.com/jirka22med/Lekarsky-Protokol-Jirika-2.cz/11b61ddd0c3cf63536e88c9ffdc2acb93321f095/image_72x72.png',
            tag: 'welcome-notification',
            requireInteraction: false,
            vibrate: [200, 100, 200]
        });

        console.log("📤 Testovací notifikace odeslána");
    } catch (error) {
        console.error("❌ Chyba při odesílání testovací notifikace:", error);
    }
}

/**
 * @function scheduleDailyReminder
 * @description FALLBACK: Naplánuje denní připomínku pomocí setTimeout
 * POZNÁMKA: Toto je fallback pro prohlížeče bez Periodic Sync!
 */
function scheduleDailyReminder() {
    const now = new Date();
    const targetTime = new Date();
    
    targetTime.setHours(8, 0, 0, 0);
    
    if (now > targetTime) {
        targetTime.setDate(targetTime.getDate() + 1);
    }
    
    const timeUntilReminder = targetTime.getTime() - now.getTime();
    
    console.log(`⏰ FALLBACK: Denní připomínka naplánována na: ${targetTime.toLocaleString('cs-CZ')}`);
    console.log(`⚠️ Notifikace přijde JEN pokud bude tab otevřený!`);
    
    setTimeout(() => {
        sendDailyMedicineReminder();
        scheduleDailyReminder(); // Naplánujeme další
    }, timeUntilReminder);
}

/**
 * @function sendDailyMedicineReminder
 * @description FALLBACK: Pošle denní přehled (jen když je tab otevřený)
 */
async function sendDailyMedicineReminder() {
    if (Notification.permission !== 'granted') return;

    const medicines = window.currentMedicines || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeMedicines = medicines.filter(medicine => 
        medicine.status === 'Beru' || medicine.status === 'Používám'
    );

    if (activeMedicines.length === 0) {
        console.log("ℹ️ Žádné aktivní léky k připomínce");
        return;
    }

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
            
            if (diffDays <= 7 && diffDays > 0) {
                warningList += `⚠️ ${medicine.name} - zbývá ${diffDays} dní\n`;
            } else if (diffDays <= 0) {
                warningList += `🔴 ${medicine.name} - SKONČENO!\n`;
            }
        } else {
            medicineList += `${emoji} ${medicine.name} - dlouhodobě\n`;
        }
    });

    let notificationBody = `🌅 Dobré ráno, admirále!\n\n`;
    notificationBody += `Dnes užíváš:\n${medicineList}`;
    
    if (warningList) {
        notificationBody += `\n⚠️ Upozornění:\n${warningList}`;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        
        await registration.showNotification('🌅 Ranní přehled léků (fallback)', {
            body: notificationBody.trim(),
            icon: 'https://raw.githubusercontent.com/jirka22med/Lekarsky-Protokol-Jirika-2.cz/11b61ddd0c3cf63536e88c9ffdc2acb93321f095/image_192x192.png',
            badge: 'https://raw.githubusercontent.com/jirka22med/Lekarsky-Protokol-Jirika-2.cz/11b61ddd0c3cf63536e88c9ffdc2acb93321f095/image_72x72.png',
            tag: 'daily-reminder-fallback',
            requireInteraction: false,
            vibrate: [200, 100, 200]
        });

        console.log("📤 Fallback denní přehled odeslán");
    } catch (error) {
        console.error("❌ Chyba při odesílání fallback přehledu:", error);
    }
}

/**
 * @function setupFCMMessageListener
 * @description Nastaví posluchač pro příchozí FCM zprávy
 */
function setupFCMMessageListener() {
    if (!messaging) {
        console.error("❌ Messaging není inicializováno");
        return;
    }

    messaging.onMessage(async (payload) => {
        console.log("📩 Přijata FCM zpráva:", payload);

        const notificationTitle = payload.notification?.title || 'Lékařský Protokol';
        const notificationOptions = {
            body: payload.notification?.body || 'Nová zpráva',
            icon: payload.notification?.icon || 'https://raw.githubusercontent.com/jirka22med/Lekarsky-Protokol-Jirika-2.cz/11b61ddd0c3cf63536e88c9ffdc2acb93321f095/image_192x192.png',
            badge: 'https://raw.githubusercontent.com/jirka22med/Lekarsky-Protokol-Jirika-2.cz/11b61ddd0c3cf63536e88c9ffdc2acb93321f095/image_72x72.png',
            tag: payload.notification?.tag || 'fcm-notification',
            data: payload.data
        };

        if (Notification.permission === 'granted') {
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification(notificationTitle, notificationOptions);
            } catch (error) {
                console.error("❌ Chyba při zobrazení notifikace:", error);
            }
        }
    });

    console.log("✅ FCM message listener nastaven");
}

// ═══════════════════════════════════════════════════════════════
// 🚀 AUTOMATICKÁ INICIALIZACE PO NAČTENÍ FIREBASE
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof firebase !== 'undefined' && firebase.messaging) {
            window.initializeFCMNotifications().then(success => {
                if (success) {
                    setupFCMMessageListener();
                    console.log("🚀 JIŘÍKŮV FCM MODUL V3.0 s Periodic Sync: Plně operační! 🖖");
                }
            });
        } else {
            console.warn("⚠️ Firebase Messaging není k dispozici. Zkontroluj připojení skriptů.");
        }
    }, 2000);
});

// ═══════════════════════════════════════════════════════════════
// 🔥 HELPER FUNKCE PRO ZÍSKÁNÍ FCM TOKENU (pro Firebase Campaigns)
// ═══════════════════════════════════════════════════════════════

/**
 * Získej FCM token pro Firebase Campaigns
 * Spusť v konzoli: getMyFCMToken()
 */
window.getMyFCMToken = async function() {
    if (window.fcmToken) {
        console.log("🔥 TVŮJ FCM TOKEN:");
        console.log(window.fcmToken);
        console.log("\n📋 JAK POUŽÍT:");
        console.log("1. Zkopíruj token výše (celý text)");
        console.log("2. Otevři Firebase Console → Messaging → Campaigns");
        console.log("3. Edit tvoji kampaň");
        console.log("4. Target → změň na 'FCM registration token'");
        console.log("5. Vlož token");
        console.log("6. Save → Hotovo! ✅");
        return window.fcmToken;
    } else {
        console.log("⚠️ Token ještě není k dispozici!");
        console.log("💡 Nejdřív klikni na tlačítko '🔔 Povolit notifikace'");
        console.log("💡 Pak znovu spusť: getMyFCMToken()");
        return null;
    }
};

console.log("💡 Pro získání FCM tokenu spusť v konzoli: getMyFCMToken()");

// Observer pro synchronizaci dat léků do SW při každé změně
if (typeof window.currentMedicines !== 'undefined') {
    // Nastavíme watcher na window.currentMedicines
    let lastMedicinesLength = 0;
    
    setInterval(() => {
        if (window.currentMedicines && window.currentMedicines.length !== lastMedicinesLength) {
            lastMedicinesLength = window.currentMedicines.length;
            
            if (usePeriodicSync && typeof window.syncMedicinesToServiceWorker === 'function') {
                window.syncMedicinesToServiceWorker(window.currentMedicines);
            }
        }
    }, 5000); // Kontrola každých 5 sekund
}

console.log("✅ jirkova-mes-zprava-o-lecich.js V3.0 s Periodic Sync načten! 🚀");
