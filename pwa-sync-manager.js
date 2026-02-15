/**
 * ═══════════════════════════════════════════════════════════════
 * 🛡️ PWA SYNC MANAGER - SPRÁVA NEPŘETRŽITÉHO BĚHU
 * ═══════════════════════════════════════════════════════════════
 * Tento modul zajišťuje:
 * - Registraci Periodic Background Sync
 * - Synchronizaci dat léků mezi Firestore a IndexedDB
 * - Diagnostiku a monitoring sync procesu
 * - Manuální triggery pro testování
 * ═══════════════════════════════════════════════════════════════
 */

console.log("🛡️ PWA SYNC MANAGER: Inicializace...");

const SYNC_TAG = 'medicine-check-sync';
const SYNC_INTERVAL = 12 * 60 * 60 * 1000; // 12 hodin v ms

/**
 * @function checkPeriodicSyncSupport
 * @description Zkontroluje, zda prohlížeč podporuje Periodic Background Sync
 */
window.checkPeriodicSyncSupport = function() {
    const supported = 'periodicSync' in ServiceWorkerRegistration.prototype;
    console.log(`Periodic Background Sync: ${supported ? '✅ PODPOROVÁNO' : '❌ NEPODPOROVÁNO'}`);
    
    if (!supported) {
        console.warn(`
⚠️ Tvůj prohlížeč nepodporuje Periodic Background Sync!

Podporované prohlížeče:
✅ Chrome 80+ (Desktop/Android)
✅ Edge 80+
❌ Firefox - nepodporuje
❌ Safari - nepodporuje

Doporučení: Použij Chrome nebo Edge pro nejlepší funkčnost.
        `);
    }
    
    return supported;
};

/**
 * @function isPWAInstalled
 * @description Zkontroluje, zda je PWA nainstalovaná
 */
window.isPWAInstalled = function() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
                      || window.navigator.standalone 
                      || document.referrer.includes('android-app://');
    
    console.log(`PWA instalace: ${isStandalone ? '✅ NAINSTALOVÁNO' : '⚠️ NENÍ NAINSTALOVÁNO'}`);
    
    if (!isStandalone) {
        console.warn(`
⚠️ PWA není nainstalována!

Pro plnou funkčnost Periodic Sync musíš:
1. V Chrome: Klikni na ikonu ⊕ v adresním řádku
2. Nebo: Menu (⋮) → Nainstalovat aplikaci
3. Aplikace se přidá na plochu/home screen

Bez instalace Periodic Sync NEBUDE FUNGOVAT!
        `);
    }
    
    return isStandalone;
};

/**
 * @function registerPeriodicSync
 * @description Zaregistruje Periodic Background Sync
 */
window.registerPeriodicSync = async function() {
    console.log("🔄 Registruji Periodic Background Sync...");
    
    // Kontrola podpory
    if (!checkPeriodicSyncSupport()) {
        window.showUserMessage('⚠️ Tvůj prohlížeč nepodporuje Periodic Sync! Použij Chrome/Edge.', true);
        return false;
    }
    
    // Kontrola instalace PWA
    if (!isPWAInstalled()) {
        window.showUserMessage('⚠️ Nejdřív nainstaluj aplikaci! (ikona ⊕ v adresním řádku)', true);
        return false;
    }
    
    try {
        const registration = await navigator.serviceWorker.ready;
        
        // Registrujeme periodic sync s intervalem 12 hodin
        await registration.periodicSync.register(SYNC_TAG, {
            minInterval: SYNC_INTERVAL // 12 hodin
        });
        
        console.log("✅ Periodic Sync zaregistrován!");
        console.log(`⏰ Interval: 12 hodin (browser se může probudit každých 12-24h)`);
        
        window.showUserMessage('🚀 Nepřetržitý běh notifikací aktivován!');
        
        // Zalogujeme aktivní syncs
        const tags = await registration.periodicSync.getTags();
        console.log("📋 Aktivní periodic syncs:", tags);
        
        return true;
        
    } catch (error) {
        console.error("❌ Chyba při registraci Periodic Sync:", error);
        
        if (error.name === 'NotAllowedError') {
            window.showUserMessage('⚠️ Periodic Sync byl zamítnut. Zkontroluj nastavení prohlížeče.', true);
        } else {
            window.showUserMessage('❌ Chyba při registraci Periodic Sync!', true);
        }
        
        return false;
    }
};

/**
 * @function unregisterPeriodicSync
 * @description Odregistruje Periodic Background Sync
 */
window.unregisterPeriodicSync = async function() {
    console.log("🛑 Odregistrovávám Periodic Background Sync...");
    
    try {
        const registration = await navigator.serviceWorker.ready;
        await registration.periodicSync.unregister(SYNC_TAG);
        
        console.log("✅ Periodic Sync odregistrován");
        window.showUserMessage('Nepřetržitý běh notifikací vypnut');
        
        return true;
        
    } catch (error) {
        console.error("❌ Chyba při odregistraci Periodic Sync:", error);
        return false;
    }
};

/**
 * @function getPeriodicSyncStatus
 * @description Vrátí aktuální stav Periodic Sync
 */
window.getPeriodicSyncStatus = async function() {
    console.log("🔍 Kontroluji stav Periodic Sync...");
    
    if (!checkPeriodicSyncSupport()) {
        return {
            supported: false,
            registered: false,
            installed: false,
            tags: []
        };
    }
    
    try {
        const registration = await navigator.serviceWorker.ready;
        const tags = await registration.periodicSync.getTags();
        const isRegistered = tags.includes(SYNC_TAG);
        const isInstalled = isPWAInstalled();
        
        const status = {
            supported: true,
            registered: isRegistered,
            installed: isInstalled,
            tags: tags
        };
        
        console.log("📊 Periodic Sync status:", status);
        
        return status;
        
    } catch (error) {
        console.error("❌ Chyba při kontrole Periodic Sync:", error);
        return {
            supported: true,
            registered: false,
            installed: false,
            tags: [],
            error: error.message
        };
    }
};

/**
 * @function syncMedicinesToServiceWorker
 * @description Synchronizuje data léků do IndexedDB v Service Workeru
 */
window.syncMedicinesToServiceWorker = async function(medicines) {
    console.log("📤 Synchronizuji data léků do Service Workeru...", medicines?.length);
    
    if (!medicines || medicines.length === 0) {
        console.warn("⚠️ Žádné léky k synchronizaci");
        return;
    }
    
    try {
        const registration = await navigator.serviceWorker.ready;
        
        if (!registration.active) {
            console.error("❌ Service Worker není aktivní");
            return;
        }
        
        // Pošleme data do Service Workeru
        registration.active.postMessage({
            type: 'UPDATE_MEDICINES',
            medicines: medicines
        });
        
        console.log("✅ Data léků odeslána do Service Workeru");
        
    } catch (error) {
        console.error("❌ Chyba při synchronizaci dat:", error);
    }
};

/**
 * @function triggerManualCheck
 * @description Manuálně spustí kontrolu léků (pro testování)
 */
window.triggerManualCheck = async function() {
    console.log("🔧 Spouštím manuální kontrolu léků...");
    
    try {
        const registration = await navigator.serviceWorker.ready;
        
        if (!registration.active) {
            console.error("❌ Service Worker není aktivní");
            window.showUserMessage('Service Worker není aktivní!', true);
            return;
        }
        
        // Pošleme příkaz k manuální kontrole
        registration.active.postMessage({
            type: 'CHECK_NOW'
        });
        
        console.log("✅ Manuální kontrola spuštěna");
        window.showUserMessage('🔍 Kontrola léků spuštěna! Zkontroluj konzoli a notifikace.');
        
    } catch (error) {
        console.error("❌ Chyba při manuální kontrole:", error);
        window.showUserMessage('Chyba při spuštění kontroly!', true);
    }
};

/**
 * @function setupPeriodicSyncUI
 * @description Vytvoří UI pro ovládání Periodic Sync
 */
window.setupPeriodicSyncUI = function() {
    console.log("🎨 Vytvářím UI pro Periodic Sync...");
    
    const filterButtons = document.getElementById('filter-buttons');
    
    if (!filterButtons) {
        console.error("❌ Nenalezen element #filter-buttons");
        return;
    }
    
    // Zkontrolujeme zda tlačítko již neexistuje
    if (document.getElementById('periodic-sync-toggle')) {
        console.log("ℹ️ Periodic Sync tlačítko již existuje");
        return;
    }
    
    // Tlačítko pro aktivaci/deaktivaci Periodic Sync
    const syncButton = document.createElement('button');
    syncButton.id = 'periodic-sync-toggle';
    syncButton.innerHTML = '🔄 Aktivovat běh na pozadí';
    syncButton.title = 'Zapne/vypne nepřetržitý běh notifikací';
    syncButton.style.cssText = `
        background-color: #00aaff;
        color: white;
        border: 2px solid #00aaff;
        padding: 10px 15px;
        cursor: pointer;
        font-size: 1em;
        border-radius: 8px;
        transition: all 0.3s ease;
    `;
    
    syncButton.addEventListener('click', async () => {
        const status = await getPeriodicSyncStatus();
        
        if (status.registered) {
            // Vypnout
            await unregisterPeriodicSync();
            syncButton.innerHTML = '🔄 Aktivovat běh na pozadí';
            syncButton.style.backgroundColor = '#00aaff';
        } else {
            // Zapnout
            const success = await registerPeriodicSync();
            if (success) {
                syncButton.innerHTML = '✅ Běh na pozadí AKTIVNÍ';
                syncButton.style.backgroundColor = '#00ff00';
            }
        }
    });
    
    filterButtons.appendChild(syncButton);
    
    // Tlačítko pro manuální test
    const testButton = document.createElement('button');
    testButton.id = 'manual-check-trigger';
    testButton.innerHTML = '🔬 Test notifikace';
    testButton.title = 'Manuálně spustí kontrolu (pro testování)';
    testButton.style.cssText = `
        background-color: #ff9900;
        color: white;
        border: 2px solid #ff9900;
        padding: 10px 15px;
        cursor: pointer;
        font-size: 1em;
        border-radius: 8px;
        transition: all 0.3s ease;
        margin-left: 5px;
    `;
    
    testButton.addEventListener('click', () => {
        triggerManualCheck();
    });
    
    filterButtons.appendChild(testButton);
    
    // Aktualizujeme stav tlačítka
    updateSyncButtonState();
};

/**
 * @function updateSyncButtonState
 * @description Aktualizuje stav tlačítka podle registrace
 */
window.updateSyncButtonState = async function() {
    const syncButton = document.getElementById('periodic-sync-toggle');
    if (!syncButton) return;
    
    const status = await getPeriodicSyncStatus();
    
    console.log('🔄 Aktualizuji stav tlačítka:', status);
    
    if (status.registered) {
        syncButton.innerHTML = '✅ Běh na pozadí AKTIVNÍ';
        syncButton.style.backgroundColor = '#00ff00';
        console.log('✅ Tlačítko nastaveno na AKTIVNÍ');
    } else {
        syncButton.innerHTML = '🔄 Aktivovat běh na pozadí';
        syncButton.style.backgroundColor = '#00aaff';
        console.log('⚠️ Tlačítko nastaveno na NEAKTIVNÍ');
    }
};

/**
 * @function autoCheckAndRestoreSync
 * @description Automaticky zkontroluje a obnoví Periodic Sync při načtení stránky
 * DŮLEŽITÉ: Volá se automaticky při DOMContentLoaded
 */
window.autoCheckAndRestoreSync = async function() {
    console.log('🔍 Auto-check: Kontroluji stav Periodic Sync při načtení stránky...');
    
    // Počkáme na Service Worker
    await navigator.serviceWorker.ready;
    
    const status = await getPeriodicSyncStatus();
    
    if (status.supported && status.installed) {
        if (status.registered) {
            console.log('✅ Periodic Sync je aktivní po refreshi!');
            window.showUserMessage('✅ Běh na pozadí je aktivní');
        } else {
            console.log('⚠️ Periodic Sync není aktivní po refreshi!');
            console.log('💡 Auto-restoring Periodic Sync...');
            
            // AUTOMATICKÁ OBNOVA - důležité!
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.periodicSync.register('medicine-check-sync', {
                    minInterval: 12 * 60 * 60 * 1000 // 12 hodin
                });
                console.log('✅ Periodic Sync automaticky obnoven!');
                window.showUserMessage('🔄 Běh na pozadí automaticky obnoven');
                
                // Aktualizuj tlačítko
                setTimeout(() => {
                    window.updateSyncButtonState();
                }, 500);
            } catch (error) {
                console.error('❌ Chyba při auto-obnově Periodic Sync:', error);
            }
        }
    }
    
    // Vždy aktualizuj tlačítko podle reálného stavu
    setTimeout(() => {
        window.updateSyncButtonState();
    }, 1000);
};

/**
 * @function showPeriodicSyncInfo
 * @description Zobrazí info dialog o Periodic Sync
 */
window.showPeriodicSyncInfo = async function() {
    const status = await getPeriodicSyncStatus();
    
    let message = `
╔═══════════════════════════════════════╗
║   🛡️ PERIODIC BACKGROUND SYNC INFO   ║
╚═══════════════════════════════════════╝

Podpora: ${status.supported ? '✅ ANO' : '❌ NE'}
Registrace: ${status.registered ? '✅ AKTIVNÍ' : '⏸️ NEAKTIVNÍ'}
PWA instalace: ${status.installed ? '✅ ANO' : '⚠️ NE'}

Aktivní syncs: ${status.tags.length > 0 ? status.tags.join(', ') : 'žádné'}

Jak to funguje:
1. Browser se probudí každých 12-24h
2. Service Worker zkontroluje čas
3. Pokud je 8:00 (±15 min) → notifikace
4. Notifikace se pošle jen 1x denně

Doporučení:
${!status.supported ? '⚠️ Přepni na Chrome/Edge!' : ''}
${!status.installed ? '⚠️ Nainstaluj PWA (ikona ⊕)!' : ''}
${!status.registered ? '⚠️ Aktivuj běh na pozadí!' : ''}
    `.trim();
    
    console.log(message);
    alert(message);
};

// ═══════════════════════════════════════════════════════════════
// 🔄 AUTOMATICKÁ KONTROLA PŘI NAČTENÍ STRÁNKY
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Počkáme až se všechno načte
    setTimeout(() => {
        if (typeof window.autoCheckAndRestoreSync === 'function') {
            window.autoCheckAndRestoreSync();
        }
    }, 3000); // 3 sekundy po načtení
});

console.log("✅ PWA Sync Manager načten a připraven! 🚀");
