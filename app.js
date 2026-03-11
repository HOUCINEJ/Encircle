import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// إعدادات Firebase
const firebaseConfig = { 
    apiKey: "AIzaSyB7Q_3dADwOw03YSyShmlFSneQ2-esMLzo", 
    authDomain: "game768-dd691.firebaseapp.com", 
    projectId: "game768-dd691" 
};

const app = initializeApp(firebaseConfig); 
const auth = getAuth(app); 
const db = getFirestore(app); 
const provider = new GoogleAuthProvider();

// متغيرات اللعبة الأساسية
let currentUser = null; 
const canvas = document.getElementById('gameCanvas'); 
const ctx = canvas.getContext('2d');
const TILE_SIZE = 15; 
const COLS = 400; 
const ROWS = 400;
let grid = new Array(COLS).fill(0).map(() => new Array(ROWS).fill(null));
let camera = { x: 0, y: 0 }; 
let players =[]; 
let myPlayer = null; 
let gameSessionStart = Date.now();

// ================== الصوتيات ==================
const AudioContext = window.AudioContext || window.webkitAudioContext; 
let audioCtx;
function initAudio() { 
    if (!audioCtx) audioCtx = new AudioContext(); 
    if (audioCtx.state === 'suspended') audioCtx.resume(); 
}
function playTone(freq, type, duration, vol = 0.1) { 
    initAudio(); 
    let osc = audioCtx.createOscillator(); 
    let gain = audioCtx.createGain(); 
    osc.type = type; 
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime); 
    gain.gain.setValueAtTime(vol, audioCtx.currentTime); 
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration); 
    osc.connect(gain); 
    gain.connect(audioCtx.destination); 
    osc.start(); 
    osc.stop(audioCtx.currentTime + duration); 
}
function playCoinSound() { 
    playTone(800, 'sine', 0.1); 
    setTimeout(() => playTone(1200, 'sine', 0.2), 100); 
}
function playTadaSound() { 
    playTone(400, 'square', 0.1, 0.05); 
    setTimeout(() => playTone(500, 'square', 0.1, 0.05), 100); 
    setTimeout(() => playTone(600, 'square', 0.3, 0.05), 200); 
}
function playExplosionSound() { 
    initAudio(); 
    let bufferSize = audioCtx.sampleRate * 0.5; 
    let buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); 
    let data = buffer.getChannelData(0); 
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1; 
    let noise = audioCtx.createBufferSource(); 
    noise.buffer = buffer; 
    let gain = audioCtx.createGain(); 
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime); 
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5); 
    noise.connect(gain); 
    gain.connect(audioCtx.destination); 
    noise.start(); 
}

// ================== الخرائط المصغرة والكبيرة ==================
const miniMapCanvas = document.getElementById('miniMapCanvas'); 
const miniMapCtx = miniMapCanvas.getContext('2d');
const fullMapCanvas = document.getElementById('fullMapCanvas'); 
const fullMapCtx = fullMapCanvas.getContext('2d');
miniMapCanvas.width = 200; 
miniMapCanvas.height = 200; 
fullMapCanvas.width = 800; 
fullMapCanvas.height = 800; 
let isFullMapOpen = false;

document.getElementById('miniMapContainer').addEventListener('click', () => { 
    document.getElementById('fullMapModal').style.display = 'flex'; 
    isFullMapOpen = true; 
    drawMap(fullMapCanvas, fullMapCtx, true); 
});
document.getElementById('closeFullMap').addEventListener('click', () => { 
    document.getElementById('fullMapModal').style.display = 'none'; 
    isFullMapOpen = false; 
});
document.getElementById('btnToggleShop').addEventListener('click', () => { 
    const dropdown = document.getElementById('shopDropdown'); 
    const arrow = document.getElementById('shopToggleArrow'); 
    dropdown.classList.toggle('collapsed'); 
    arrow.innerText = dropdown.classList.contains('collapsed') ? 'expand_more' : 'expand_less'; 
});

// ================== تسجيل الدخول وإنشاء الدولة ==================
document.getElementById('btnGoogleSignIn').addEventListener('click', () => { 
    initAudio(); 
    signInWithPopup(auth, provider).catch(error => alert("خطأ: " + error.message)); 
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user; 
        document.getElementById('authScreen').style.display = 'none'; 
        await loadPlayerData(user);
    } else {
        document.getElementById('authScreen').style.display = 'block'; 
        document.getElementById('uiLayer').style.display = 'none'; 
        canvas.style.display = 'none';
    }
});

function isProtected(playerData) { 
    if (!playerData.createdAt) return false; 
    return (Date.now() - playerData.createdAt) < 10000; 
}

async function loadPlayerData(user) {
    const docRef = doc(db, "players", user.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().tiles.length > 0) {
        const data = docSnap.data(); 
        data.uid = user.uid; 
        startGame(data); 
        showToast("تم استعادة إمبراطوريتك بنجاح! 👑");
    } else {
        document.getElementById('nameScreen').style.display = 'block'; 
        document.getElementById('countryName').value = docSnap.exists() ? docSnap.data().name : "";

        document.getElementById('btnSaveName').onclick = async () => {
            initAudio(); 
            const name = document.getElementById('countryName').value.trim(); 
            if (!name) return alert("يرجى إدخال اسم الدولة!");
            
            const playersSnap = await getDocs(collection(db, "players"));

            let startC, startR, isClear = false;
            for (let tries = 0; tries < 50; tries++) {
                startC = Math.floor(Math.random() * (COLS - 40)) + 20; 
                startR = Math.floor(Math.random() * (ROWS - 40)) + 20;
                isClear = true; 
                playersSnap.forEach(doc => { 
                    let d = doc.data(); 
                    if (d.tiles && d.tiles.length > 0 && Math.hypot(d.spawnC - startC, d.spawnR - startR) < 15) isClear = false; 
                });
                if (isClear) break;
            }

            let initialTiles =[]; 
            for (let c = startC - 3; c <= startC + 3; c++) { 
                for (let r = startR - 3; r <= startR + 3; r++) { 
                    if (Math.hypot(c - startC, r - startR) <= 3) initialTiles.push({ c, r }); 
                } 
            }

            let usedHues =[]; 
            playersSnap.forEach(doc => { 
                let c = doc.data().color; 
                if (c && c.includes('hsl')) usedHues.push(parseInt(c.split('(')[1].split(',')[0])); 
            });
            let randomHue; let isDistinct = false; let attempts = 0;
            while (!isDistinct && attempts < 50) { 
                randomHue = Math.floor(Math.random() * 360); 
                isDistinct = true; 
                for (let hue of usedHues) { 
                    if (Math.abs(randomHue - hue) < 30 || Math.abs(randomHue - hue) > 330) { isDistinct = false; break; } 
                } 
                attempts++; 
            }
            const distinctColor = `hsl(${randomHue}, 90%, 55%)`;

            const newData = {
                uid: user.uid, name: name, color: distinctColor, spawnC: startC, spawnR: startR,
                gold: 1500, // منحة الشرح 1500 ذهبة
                gearLevel: 0, defenseLevel: 0, neptuneLevel: 0, tiles: initialTiles, vassalOf: null, createdAt: Date.now(), latestNews: ""
            };

            await setDoc(docRef, newData); 
            document.getElementById('nameScreen').style.display = 'none'; 
            startGame(newData);
            showToast("🛡️ تم تفعيل درع الحماية لمدة 10 ثوانٍ!");

            // 🎓 تشغيل الشرح للمبتدئين
            setTimeout(initTutorial, 1000);
        };
    }
}

// ================== نظام الشرح التفاعلي ==================
let tutStep = -1;
const tutData =[
    { title: "مرحباً أيها القائد! 👑", text: "سنعطيك 1500 ذهبة كهدية للبدء! اسحب الشاشة بإصبعك لتحريك الكاميرا.", target: null, btn: "ابدأ الشرح" },
    { title: "اقتصاد الدولة 💰", text: "في الأعلى تجد رصيدك. أراضيك تنتج الذهب تلقائياً كل ثانية.", target: "navGoldBox", btn: "مفهوم" },
    { title: "كيف تتوسع؟ 🗺️", text: "قم بالضغط (Tap) على أي مساحة فارغة في الخريطة بجوار أراضيك.", target: "gameCanvas", btn: "", waitAction: "clickMap" },
    { title: "بدء الحملة ⚔️", text: "ممتاز! الآن اضغط على زر السيف الأحمر لتبدأ التوسع.", target: "actionBtn", btn: "", waitAction: "clickSword" },
    { title: "رسم الحدود 🖌️", text: "مرر إصبعك لاحتلال الأراضي، ثم اضغط (تأكيد ✔️) لضمها.", target: "btnConfirmDraw", btn: "", waitAction: "clickConfirm" },
    { title: "المتجر والأسلحة 🛒", text: "اضغط على زر المتجر لترقية الهجوم، الدفاع، أو تفعيل نبتون المدمر.", target: "btnToggleShop", btn: "إنهاء اللعب" }
];

function initTutorial() {
    if (localStorage.getItem("tutorialCompleted") === "true") return;
    document.getElementById('tutBox').style.display = 'block';
    nextTutStep();
}

function nextTutStep() {
    if (tutStep >= 0 && tutData[tutStep].target && document.getElementById(tutData[tutStep].target)) {
        document.getElementById(tutData[tutStep].target).classList.remove('tut-highlight');
    }

    tutStep++;
    if (tutStep >= tutData.length) { endTutorial(); return; }

    let d = tutData[tutStep];
    document.getElementById('tutTitle').innerText = d.title;
    document.getElementById('tutText').innerText = d.text;

    let btn = document.getElementById('tutBtn');
    if (d.btn === "") {
        btn.style.display = 'none';
    } else {
        btn.style.display = 'block'; btn.innerText = d.btn;
    }

    if (d.target && document.getElementById(d.target)) {
        document.getElementById(d.target).classList.add('tut-highlight');
    }
}

function endTutorial() {
    document.getElementById('tutBox').style.display = 'none';
    document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
    localStorage.setItem("tutorialCompleted", "true");
    tutStep = -1;
}

document.getElementById('tutBtn').addEventListener('click', () => { initAudio(); nextTutStep(); });
document.getElementById('btnTutSkip').addEventListener('click', () => { initAudio(); endTutorial(); });

// ================== أخبار اللعبة وحفظ السحابة ==================
function showKillFeed(msg, icon = "🔥") { 
    const feed = document.getElementById('killFeed'); 
    const item = document.createElement('div'); 
    item.className = 'kf-item'; 
    item.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px; color:#e74c3c;">${icon}</span> ${msg}`; 
    feed.appendChild(item); 
    setTimeout(() => { if (item.parentNode) item.parentNode.removeChild(item); }, 5000); 
}

async function broadcastNews(msg, icon) { 
    if (!myPlayer) return; 
    const docRef = doc(db, "players", myPlayer.uid); 
    await updateDoc(docRef, { latestNews: msg + "|" + icon + "|" + Date.now() }); 
}

async function saveProgressToCloud() { 
    if (!currentUser || !myPlayer) return; 
    const docRef = doc(db, "players", currentUser.uid); 
    await updateDoc(docRef, { gold: myPlayer.gold, gearLevel: myPlayer.gearLevel, defenseLevel: myPlayer.defenseLevel, neptuneLevel: myPlayer.neptuneLevel }); 
    const indicator = document.getElementById('saveIndicator'); 
    indicator.style.opacity = 1; 
    setTimeout(() => { indicator.style.opacity = 0; }, 2000); 
}

async function saveTilesToCloud(player) { 
    if (!player || !player.uid) return; 
    try { 
        await updateDoc(doc(db, "players", player.uid), { tiles: player.tiles, vassalOf: player.vassalOf }); 
    } catch (e) { } 
}

// ================== كلاس اللاعب وبيانات المتجر ==================
class Player {
    constructor(data) { 
        this.uid = data.uid || null; 
        this.name = data.name; 
        this.color = data.color; 
        this.spawnC = data.spawnC; 
        this.spawnR = data.spawnR; 
        this.gold = data.gold || 50; 
        this.gearLevel = data.gearLevel || 0; 
        this.defenseLevel = data.defenseLevel || 0; 
        this.neptuneLevel = data.neptuneLevel || 0; 
        this.tiles = data.tiles ||[]; 
        this.vassalOf = data.vassalOf || null; 
        this.createdAt = data.createdAt || 0; 
        this.latestNews = data.latestNews || ""; 
        this.tiles.forEach(t => { 
            if (t.c >= 0 && t.c < COLS && t.r >= 0 && t.r < ROWS) grid[t.c][t.r] = this; 
        }); 
    }
    get mass() { return this.tiles.length; }
}

const GEAR_BONUS =[0, 0.05, 0.10, 0.20, 0.35, 0.50, 0.70, 0.90]; 
const GEAR_COST =[0, 300, 800, 2000, 4500, 10000, 25000, 50000];
const DEF_BONUS =[0, 0.02, 0.07, 0.12, 0.17, 0.22, 0.27, 0.32, 0.37, 0.42, 0.47]; 
const DEF_COST =[0, 200, 500, 1200, 3000, 6000, 12000, 20000, 35000, 60000, 100000];
const NEPTUNE_DMG =[0, 0.10, 0.20, 0.30, 0.40, 0.50]; 
const NEPTUNE_COST =[0, 500, 1500, 4000, 10000, 25000];

// ================== المتغيرات العامة للتحكم ==================
let gameState = 'IDLE'; 
let draftTiles =[]; 
let draftSet = new Set(); 
let maxBudget = 0; 
let currentBudget = 0; 
let isMouseDown = false; 
let isDraggingMap = false; 
let lastMouse = { x: 0, y: 0 }; 
let clickTime = 0; 
let clickedTarget = null; 
let impactPos = { c: 0, r: 0 };

// 📱 متغيرات إضافية لحل مشكلة اللمس في الهواتف
let startClickX = 0;
let startClickY = 0;

// ================== المزامنة والبدء ==================
function startRealtimeSync() {
    onSnapshot(collection(db, "players"), (snapshot) => {
        grid = new Array(COLS).fill(0).map(() => new Array(ROWS).fill(null)); 
        let currentPlayers =[];
        
        snapshot.forEach((docSnap) => {
            let data = docSnap.data(); 
            data.uid = docSnap.id;
            
            if (data.latestNews) { 
                let parts = data.latestNews.split("|"); 
                if (parts.length === 3) { 
                    let time = parseInt(parts[2]); 
                    if (time > gameSessionStart && time > (window.lastNewsTime || 0)) { 
                        window.lastNewsTime = time; showKillFeed(parts[0], parts[1]); 
                    } 
                } 
            }
            if (currentUser && docSnap.id === currentUser.uid) { 
                if (data.tiles && myPlayer && data.tiles.length < myPlayer.tiles.length) { 
                    myPlayer.tiles = data.tiles; 
                    if (myPlayer.tiles.length === 0) gameOver(); 
                } 
                if (myPlayer) myPlayer.vassalOf = data.vassalOf; 
                if (myPlayer) myPlayer.createdAt = data.createdAt; 
                
                myPlayer.tiles.forEach(t => { 
                    if (t.c >= 0 && t.c < COLS && t.r >= 0 && t.r < ROWS) grid[t.c][t.r] = myPlayer; 
                }); 
                currentPlayers.push(myPlayer); 
            } else { 
                let otherPlayer = new Player(data); 
                currentPlayers.push(otherPlayer); 
            }
        });
        
        if (myPlayer) { 
            players = currentPlayers; 
            checkVassals(); 
            updateLeaderboard(); 
        }
    });
}

function startGame(playerData) { 
    myPlayer = new Player(playerData); 
    players.push(myPlayer); 
    document.getElementById('navPlayerName').innerText = myPlayer.name; 
    let sc = myPlayer.spawnC; 
    let sr = myPlayer.spawnR; 
    camera.x = (sc * TILE_SIZE) - (window.innerWidth / 2); 
    camera.y = (sr * TILE_SIZE) - (window.innerHeight / 2); 
    clampCamera();
    document.getElementById('uiLayer').style.display = 'block'; 
    canvas.style.display = 'block'; 
    resizeCanvas(); 
    startRealtimeSync(); 
    setInterval(gameTick, 1000); 
    setInterval(saveProgressToCloud, 10000); 
    requestAnimationFrame(gameLoop); 
    updateShopUI(); 
}

function gameOver() { 
    if (!myPlayer) return; 
    showToast("💀 لقد خسرت إمبراطوريتك!"); 
    setTimeout(() => { location.reload(); }, 3000); 
}

function updateLeaderboard() { 
    const lbContent = document.getElementById('lbContent'); 
    let alivePlayers = players.filter(p => p.mass > 0).sort((a, b) => b.mass - a.mass); 
    let top5 = alivePlayers.slice(0, 5); 
    lbContent.innerHTML = ""; 
    top5.forEach((p, index) => { 
        let div = document.createElement('div'); 
        div.className = 'lb-item'; 
        if (p === myPlayer) div.classList.add('lb-me'); 
        div.innerHTML = `<span>#${index + 1} ${p.name.substring(0, 8)}</span> <span>${p.mass} بكسل</span>`; 
        lbContent.appendChild(div); 
    }); 
}

function checkVassals() {
    if (!myPlayer) return; 
    players.forEach(p => { 
        if (p === myPlayer || p.tiles.length === 0) return; 
        let totalBorders = 0; 
        let myTouches = 0; 
        
        for (let i = 0; i < p.tiles.length; i++) { 
            let t = p.tiles[i];
            [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(n => { 
                let nc = t.c + n[0], nr = t.r + n[1]; 
                if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) { 
                    let owner = grid[nc][nr]; 
                    if (owner !== p) { 
                        totalBorders++; 
                        if (owner === myPlayer) myTouches++; 
                    } 
                } 
            }); 
        } 
        
        let isSurrounded = totalBorders > 0 && (myTouches / totalBorders) >= 0.70; 
        if (isSurrounded) { 
            if (p.vassalOf !== myPlayer.uid) { 
                p.vassalOf = myPlayer.uid; 
                playTadaSound(); 
                showToast(`🚩 خضعت ${p.name} لسيطرتك!`); 
                saveTilesToCloud(p); 
                broadcastNews(`دولة ${p.name} أصبحت تابعة لـ ${myPlayer.name}`, "🏳️"); 
            } 
        } else { 
            if (p.vassalOf === myPlayer.uid) { 
                p.vassalOf = null; 
                showToast(`⚠️ تمردت ${p.name}!`); 
                saveTilesToCloud(p); 
            } 
        } 
    });
}

function showToast(msg) { 
    const toast = document.getElementById('toastMsg'); 
    toast.innerText = msg; 
    toast.style.display = 'block'; 
    setTimeout(() => { toast.style.display = 'none'; }, 4000); 
}

function gameTick() { 
    if (!myPlayer) return; 
    checkVassals(); 
    let baseGold = Math.max(2, Math.floor(myPlayer.mass * 0.6)); 
    let tribute = 0; 
    players.forEach(p => { 
        if (p.vassalOf === myPlayer.uid) tribute += Math.max(1, Math.floor(p.mass * 0.05)); 
    }); 
    myPlayer.gold += baseGold + tribute; 
    updateShopUI(); 
}

// ================== نظام التحكم (بعد إصلاح الهواتف) ==================

// ================== نظام التحكم والتنقيب وحدود الكاميرا ==================

// 🗺️ دالة مسؤولة عن عدم الخروج خارج الخريطة
function clampCamera() {
    const maxCamX = (COLS * TILE_SIZE) - canvas.width;
    const maxCamY = (ROWS * TILE_SIZE) - canvas.height;
    
    if (maxCamX > 0) camera.x = Math.max(0, Math.min(camera.x, maxCamX));
    else camera.x = maxCamX / 2;
    
    if (maxCamY > 0) camera.y = Math.max(0, Math.min(camera.y, maxCamY));
    else camera.y = maxCamY / 2;
}

function handlePointerDown(e) { 
    if (isFullMapOpen) return; 
    isMouseDown = true; 
    isDraggingMap = false; 
    
    lastMouse = { x: e.clientX, y: e.clientY }; 
    
    // حفظ إحداثيات اللمسة الأولى
    startClickX = e.clientX;
    startClickY = e.clientY;
    
    clickTime = Date.now(); 
}

function handlePointerMove(e) { 
    if (isFullMapOpen) return; 
    if (!isMouseDown) return;

    let dx = e.clientX - lastMouse.x; 
    let dy = e.clientY - lastMouse.y; 
    
    if (gameState === 'IDLE') { 
        // 📱 إصلاح حساسية اللمس: فقط إذا تحرك الإصبع أكثر من 5 بكسل نعتبره سحب خريطة
        if (Math.abs(e.clientX - startClickX) > 5 || Math.abs(e.clientY - startClickY) > 5) {
            isDraggingMap = true; 
        }
        
        camera.x -= dx; 
        camera.y -= dy; 

        // 🛑 تطبيق حدود الخريطة (لا يمكن سحب الكاميرا خارج العالم)
        clampCamera();
        
        if (isDraggingMap) hideBtns(); 
    } else if (gameState === 'DRAFTING') { 
        // 🖌️ رسم الحدود عند التوسع بسلاسة
        paintTile(e.clientX, e.clientY); 
    } 
    
    lastMouse = { x: e.clientX, y: e.clientY }; 
}

function handlePointerUp(e) {
    if (isFullMapOpen) return; 
    isMouseDown = false; 
    
    // 📱 تم زيادة وقت الضغطة إلى 500 ملي ثانية لتناسب الهواتف
    if (gameState === 'IDLE' && !isDraggingMap && Date.now() - clickTime < 500) {
        let c = Math.floor((e.clientX + camera.x) / TILE_SIZE); 
        let r = Math.floor((e.clientY + camera.y) / TILE_SIZE);
        
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
            clickedTarget = grid[c][r]; 
            impactPos = { c: c, r: r };
            const abtn = document.getElementById('actionBtn'); 
            const nbtn = document.getElementById('neptuneBtn');
            let isMobile = window.innerWidth <= 768; 
            let yOffset = isMobile ? 60 : 20; 
            let xOffset = isMobile ? 40 : 30;
            
            abtn.style.left = (e.clientX - xOffset) + 'px'; 
            abtn.style.top = (e.clientY - yOffset) + 'px'; 
            abtn.style.display = 'block';
            
            if (myPlayer && myPlayer.neptuneLevel > 0 && clickedTarget && clickedTarget !== myPlayer) { 
                nbtn.style.left = (e.clientX + xOffset) + 'px'; 
                nbtn.style.top = (e.clientY - yOffset) + 'px'; 
                nbtn.style.display = 'block'; 
            } else { 
                nbtn.style.display = 'none'; 
            }

            // 🎓 تحديث الشرح
            if (tutStep >= 0 && tutData[tutStep].waitAction === "clickMap") nextTutStep();
        }
    }
}

function hideBtns() { 
    document.getElementById('actionBtn').style.display = 'none'; 
    document.getElementById('neptuneBtn').style.display = 'none'; 
}

// 🔥 استخدام أحداث (Pointer) الموحدة الحديثة بدلاً من Touch/Mouse لتجنب مشاكل الهواتف كلياً
canvas.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#miniMapContainer') && !e.target.closest('#fullMapModal') && !e.target.closest('#tutBox') && !e.target.closest('#actionBtn')) { 
        e.preventDefault(); 
    }
    handlePointerDown(e);
}); 
canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    handlePointerMove(e);
}); 
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointercancel', handlePointerUp);
// ================== أفعال اللعب والتوسع ==================

document.getElementById('actionBtn').addEventListener('click', () => {
    initAudio(); 
    hideBtns(); 
    if (myPlayer.gold < 500) return showToast("تحتاج 500 ذهبة لحملة التوسع!");
    
    myPlayer.gold -= 500; 
    gameState = 'DRAFTING'; 
    draftTiles =[]; 
    draftSet.clear();
    maxBudget = Math.max(10, Math.floor(myPlayer.mass * 0.15)); 
    currentBudget = maxBudget;
    
    updateDraftUI(); 
    document.getElementById('drawPanel').style.display = 'block'; 
    updateShopUI();

    if (tutStep >= 0 && tutData[tutStep].waitAction === "clickSword") { setTimeout(nextTutStep, 200); }
});

function paintTile(mouseX, mouseY) {
    if (currentBudget <= 0) return; 
    let c = Math.floor((mouseX + camera.x) / TILE_SIZE); 
    let r = Math.floor((mouseY + camera.y) / TILE_SIZE);
    
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS || draftSet.has(`${c},${r}`)) return; 
    let owner = grid[c][r]; 
    if (owner === myPlayer) return;
    if (owner && isProtected(owner)) return showToast("🛡️ هذه الدولة في فترة الحماية!");
    if (owner && Math.abs(c - owner.spawnC) <= 1 && Math.abs(r - owner.spawnR) <= 1) return;
    
    let isAdj = false;
    [[0, -1],[0, 1], [-1, 0], [1, 0]].forEach(n => { 
        let nc = c + n[0], nr = r + n[1]; 
        if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && (grid[nc][nr] === myPlayer || draftSet.has(`${nc},${nr}`))) isAdj = true; 
    }); 
    if (!isAdj) return;
    
    let cost = owner ? 2 * ((1 - DEF_BONUS[owner.defenseLevel]) / (1 + GEAR_BONUS[myPlayer.gearLevel])) : 1;
    if (currentBudget - cost >= 0) { 
        currentBudget -= cost; 
        draftTiles.push({ c, r, cost, oldOwner: owner }); 
        draftSet.add(`${c},${r}`); 
        updateDraftUI(); 
    }
}

function updateDraftUI() { 
    document.getElementById('budgetTxt').innerText = Math.floor(currentBudget); 
    document.getElementById('drawProgress').max = maxBudget; 
    document.getElementById('drawProgress').value = maxBudget - currentBudget; 
}

document.getElementById('btnConfirmDraw').addEventListener('click', () => {
    let affectedOwners = new Set(); 
    let destroyedNames =[];
    draftTiles.forEach(dt => { 
        if (dt.oldOwner && dt.oldOwner !== myPlayer) { 
            dt.oldOwner.tiles = dt.oldOwner.tiles.filter(t => t.c !== dt.c || t.r !== dt.r); 
            affectedOwners.add(dt.oldOwner); 
            if (dt.oldOwner.tiles.length === 0 && !destroyedNames.includes(dt.oldOwner.name)) destroyedNames.push(dt.oldOwner.name); 
        } 
        grid[dt.c][dt.r] = myPlayer; 
        myPlayer.tiles.push({ c: dt.c, r: dt.r }); 
    });
    
    gameState = 'IDLE'; 
    document.getElementById('drawPanel').style.display = 'none'; 
    saveTilesToCloud(myPlayer); 
    affectedOwners.forEach(owner => saveTilesToCloud(owner)); 
    saveProgressToCloud(); 
    showToast("تم التوسع بنجاح! ✔️");
    
    if (destroyedNames.length > 0) broadcastNews(`قامت ${myPlayer.name} بتدمير ${destroyedNames.join(' و ')}!`, "⚔️");
    if (tutStep >= 0 && tutData[tutStep].waitAction === "clickConfirm") nextTutStep();
});

document.getElementById('btnCancelDraw').addEventListener('click', () => { 
    myPlayer.gold += 20; 
    gameState = 'IDLE'; 
    document.getElementById('drawPanel').style.display = 'none'; 
});

// ================== نظام المتجر ==================

function buyWeapon(stat, costArr) { 
    let nextLvl = myPlayer[stat] + 1; 
    if (nextLvl < costArr.length && myPlayer.gold >= costArr[nextLvl]) { 
        playCoinSound(); 
        myPlayer.gold -= costArr[nextLvl]; 
        myPlayer[stat] = nextLvl; 
        updateShopUI(); 
        saveProgressToCloud(); 
    } 
}
document.getElementById('btnBuyGear').addEventListener('click', () => buyWeapon('gearLevel', GEAR_COST)); 
document.getElementById('btnBuyDef').addEventListener('click', () => buyWeapon('defenseLevel', DEF_COST)); 
document.getElementById('btnBuyNeptune').addEventListener('click', () => buyWeapon('neptuneLevel', NEPTUNE_COST));

function updateShopUI() { 
    if (!myPlayer) return; 
    document.getElementById('goldCount').innerText = Math.floor(myPlayer.gold); 
    updateBtn('btnBuyGear', 'gearDesc', myPlayer.gearLevel, GEAR_COST, GEAR_BONUS, "هجوم"); 
    updateBtn('btnBuyDef', 'defDesc', myPlayer.defenseLevel, DEF_COST, DEF_BONUS, "دفاع"); 
    updateBtn('btnBuyNeptune', 'neptuneDesc', myPlayer.neptuneLevel, NEPTUNE_COST, NEPTUNE_DMG, "تدمير"); 
}

function updateBtn(btnId, descId, level, costArr, bonusArr, txt) { 
    let btn = document.getElementById(btnId); 
    let nextLvl = level + 1; 
    if (nextLvl < bonusArr.length) { 
        document.getElementById(descId).innerText = `مستوى ${level} (${txt} ${bonusArr[level] * 100}%)`; 
        btn.innerText = `ترقية (${costArr[nextLvl]} 🪙)`; 
        btn.disabled = myPlayer.gold < costArr[nextLvl]; 
    } else { 
        document.getElementById(descId).innerText = `المستوى الأقصى`; 
        btn.innerText = "Max"; 
        btn.disabled = true; 
    } 
}

document.getElementById('neptuneBtn').addEventListener('click', () => { 
    hideBtns(); 
    if (isProtected(clickedTarget)) return showToast("🛡️ لا يمكنك قصف دولة في فترة الحماية!"); 
    if (myPlayer.gold < 1000) return showToast(`تحتاج 1000 ذهبة لإطلاق نبتون!`); 
    
    myPlayer.gold -= 1000; 
    playExplosionSound(); 
    let dmg = NEPTUNE_DMG[myPlayer.neptuneLevel]; 
    let tilesToDestroy = Math.floor(clickedTarget.mass * dmg); 
    let vTiles = clickedTarget.tiles.filter(t => Math.abs(t.c - clickedTarget.spawnC) > 1 || Math.abs(t.r - clickedTarget.spawnR) > 1); 
    vTiles.sort((a, b) => Math.hypot(a.c - impactPos.c, a.r - impactPos.r) - Math.hypot(b.c - impactPos.c, b.r - impactPos.r)); 
    
    for (let i = 0; i < Math.min(vTiles.length, tilesToDestroy); i++) { 
        grid[vTiles[i].c][vTiles[i].r] = null; 
        clickedTarget.tiles = clickedTarget.tiles.filter(t => t.c !== vTiles[i].c || t.r !== vTiles[i].r); 
    } 
    
    showToast(`💥 بوووم! تم قصف ${clickedTarget.name} 💥`); 
    broadcastNews(`أطلقت ${myPlayer.name} نبتون 🚀 على ${clickedTarget.name}!`, "💥"); 
    saveTilesToCloud(clickedTarget); 
    saveProgressToCloud(); 
    updateShopUI(); 
});

// ================== نظام سحب لوحة الرسم (تم إصلاحه) ==================
const drawPanelEl = document.getElementById('drawPanel');
let isDraggingPanel = false, panelOffsetX, panelOffsetY;

function startPanelDrag(e) {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'PROGRESS') return;
    isDraggingPanel = true;
    
    // 🛠️ حل مشكلة التمدد وتغيير الشكل أثناء التحريك:
    let rect = drawPanelEl.getBoundingClientRect();
    drawPanelEl.style.transform = 'none'; // إلغاء الـ translate الذي يسبب مشاكل
    drawPanelEl.style.bottom = 'auto'; // يجب إلغاء bottom ليعتمد فقط على top
    
    // تثبيت حجم النافذة الحالي كي لا تتمدد
    drawPanelEl.style.width = rect.width + 'px'; 
    drawPanelEl.style.left = rect.left + 'px';
    drawPanelEl.style.top = rect.top + 'px';

    let clientX = e.clientX || (e.touches && e.touches[0].clientX);
    let clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    panelOffsetX = clientX - rect.left;
    panelOffsetY = clientY - rect.top;
}

function doPanelDrag(e) {
    if (!isDraggingPanel) return;
    e.preventDefault(); // منع تحريك الخريطة في الخلفية أثناء تحريك اللوحة
    let clientX = e.clientX || (e.touches && e.touches[0].clientX);
    let clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    drawPanelEl.style.left = (clientX - panelOffsetX) + 'px';
    drawPanelEl.style.top = (clientY - panelOffsetY) + 'px';
}

function stopPanelDrag() { 
    isDraggingPanel = false; 
}

// دمج الماوس واللمس معاً للوحة
drawPanelEl.addEventListener('pointerdown', startPanelDrag);
document.addEventListener('pointermove', doPanelDrag, { passive: false });
document.addEventListener('pointerup', stopPanelDrag);
document.addEventListener('pointercancel', stopPanelDrag);
// ================== رسم اللعبة (Render) ==================

window.addEventListener('resize', resizeCanvas); 
function resizeCanvas() { 
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight; 
    if(typeof clampCamera === 'function') clampCamera();
}

function drawMap(mapCanvas, mapCtx, isFullScreen) { 
    mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height); 
    const worldWidth = COLS * TILE_SIZE; 
    const worldHeight = ROWS * TILE_SIZE; 
    const scaleX = mapCanvas.width / worldWidth; 
    const scaleY = mapCanvas.height / worldHeight; 
    
    if (!isFullScreen && myPlayer) { 
        mapCtx.strokeStyle = "rgba(255, 255, 255, 0.4)"; 
        mapCtx.lineWidth = 2; 
        let vx = Math.max(0, camera.x * scaleX); 
        let vy = Math.max(0, camera.y * scaleY); 
        let vw = window.innerWidth * scaleX; 
        let vh = window.innerHeight * scaleY; 
        mapCtx.strokeRect(vx, vy, vw, vh); 
    } 
    
    players.forEach(p => { 
        if (p.tiles.length === 0) return; 
        let px = p.spawnC * TILE_SIZE * scaleX; 
        let py = p.spawnR * TILE_SIZE * scaleY; 
        mapCtx.beginPath(); 
        mapCtx.arc(px, py, isFullScreen ? 10 : 4, 0, Math.PI * 2); 
        mapCtx.fillStyle = p.color; 
        mapCtx.fill(); 
        mapCtx.strokeStyle = "white"; 
        mapCtx.lineWidth = isFullScreen ? 3 : 1; 
        mapCtx.stroke(); 
        if (isFullScreen) { 
            mapCtx.fillStyle = "white"; 
            mapCtx.font = "bold 20px 'Segoe UI'"; 
            mapCtx.textAlign = "center"; 
            mapCtx.fillText(p.name, px, py - 18); 
        } else { 
            mapCtx.fillStyle = "rgba(255, 255, 255, 0.9)"; 
            mapCtx.font = "bold 10px 'Segoe UI'"; 
            mapCtx.textAlign = "center"; 
            mapCtx.fillText(p.name.substring(0, 3) + "..", px, py - 6); 
        } 
    }); 
}

function gameLoop() {
    ctx.fillStyle = "#1a252f"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height); 
    
    let camX = camera.x, camY = camera.y; 
    let startC = Math.max(0, Math.floor(camX / TILE_SIZE)); 
    let endC = Math.min(COLS, Math.ceil((camX + canvas.width) / TILE_SIZE)); 
    let startR = Math.max(0, Math.floor(camY / TILE_SIZE)); 
    let endR = Math.min(ROWS, Math.ceil((camY + canvas.height) / TILE_SIZE));
    
    for (let c = startC; c < endC; c++) { 
        for (let r = startR; r < endR; r++) { 
            let owner = grid[c][r]; 
            let x = c * TILE_SIZE - camX; 
            let y = r * TILE_SIZE - camY; 
            
            if (owner) { 
                ctx.fillStyle = owner.color; 
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE); 
                if (Math.abs(c - owner.spawnC) <= 1 && Math.abs(r - owner.spawnR) <= 1) { 
                    ctx.fillStyle = "rgba(0,0,0,0.35)"; 
                    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE); 
                } 
                ctx.fillStyle = "rgba(0,0,0,0.2)"; 
                if (c === COLS - 1 || grid[c + 1][r] !== owner) ctx.fillRect(x + TILE_SIZE - 2, y, 2, TILE_SIZE); 
                if (r === ROWS - 1 || grid[c][r + 1] !== owner) ctx.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2); 
            } else { 
                ctx.strokeStyle = "rgba(255,255,255,0.03)"; 
                ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE); 
            } 
        } 
    }
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)"; 
    draftTiles.forEach(dt => ctx.fillRect(dt.c * TILE_SIZE - camX, dt.r * TILE_SIZE - camY, TILE_SIZE, TILE_SIZE));
    
    players.forEach(p => { 
        let capX = (p.spawnC * TILE_SIZE) + (TILE_SIZE / 2) - camX; 
        let capY = (p.spawnR * TILE_SIZE) + (TILE_SIZE / 2) - camY; 
        
        if (capX > -50 && capX < canvas.width + 50 && capY > -50 && capY < canvas.height + 50) { 
            if (isProtected(p)) { 
                ctx.beginPath(); ctx.arc(capX, capY, 18, 0, Math.PI * 2); 
                ctx.fillStyle = "rgba(52, 152, 219, 0.3)"; ctx.fill(); 
                ctx.lineWidth = 2; ctx.strokeStyle = "#3498db"; ctx.stroke(); 
            } 
            ctx.beginPath(); ctx.arc(capX, capY, 8, 0, Math.PI * 2); 
            ctx.fillStyle = "white"; ctx.fill(); 
            ctx.lineWidth = 3; ctx.strokeStyle = p.color; ctx.stroke(); 
            
            ctx.fillStyle = "white"; 
            ctx.font = "bold 14px sans-serif"; 
            ctx.textAlign = "center"; 
            ctx.shadowColor = "black"; ctx.shadowBlur = 4; 
            let displayName = p.vassalOf === (myPlayer ? myPlayer.uid : null) ? p.name + " 🏳️" : p.name; 
            ctx.fillStyle = p.vassalOf === (myPlayer ? myPlayer.uid : null) ? "#bdc3c7" : "white"; 
            ctx.fillText(displayName, capX, capY - 15); 
            
            ctx.fillStyle = "#f1c40f"; ctx.font = "11px sans-serif"; 
            ctx.fillText(`${p.mass} بكسل`, capX, capY - 2); 
            ctx.shadowBlur = 0; 
        } 
    });
    
    drawMap(miniMapCanvas, miniMapCtx, false); 
    if (isFullMapOpen) drawMap(fullMapCanvas, fullMapCtx, true); 
    requestAnimationFrame(gameLoop);
}
