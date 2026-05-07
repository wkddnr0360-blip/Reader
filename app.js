// --- 안드로이드 팝업 방어막 ---
document.addEventListener('selectionchange', () => {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') { const selection = window.getSelection(); if (selection && selection.rangeCount > 0) selection.removeAllRanges(); }
});

const firebaseConfig = {
    apiKey: "AIzaSyAHul2RvLx1z0s1wyNWDHwxwvATIGBJGpQ", authDomain: "reader-cd499.firebaseapp.com", projectId: "reader-cd499",
    storageBucket: "reader-cd499.firebasestorage.app", messagingSenderId: "107983492207", appId: "1:107983492207:web:5cc5d8bec71fcb592fa99a"
};

// 사용자 API 키 관리
function getUserApiKey() { return localStorage.getItem('geminiApiKey') || ""; }
function saveApiKey() { const key = document.getElementById('api-key-input').value.trim(); localStorage.setItem('geminiApiKey', key); alert(key ? "API 키가 성공적으로 저장되었습니다!" : "API 키가 삭제되었습니다."); }

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const dbFirestore = firebase.firestore();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
let currentUser = null;

async function signInWithGoogle() { 
    const btn = document.querySelectorAll('#login-screen button')[0];
    const log = document.getElementById('login-error-log');
    if(btn) btn.textContent = "Google 인증 중... ⏳";
    if(log) log.textContent = "";
    try {
        await auth.signInWithPopup(provider);
        if(btn) btn.textContent = "로그인 성공!";
    } catch(e) {
        if(log) log.textContent = "오류: " + e.message;
        if(btn) btn.textContent = "Google로 시작하기";
    }
}

async function signInAnonymously() {
    const btn = document.querySelectorAll('#login-screen button')[1];
    const log = document.getElementById('login-error-log');
    if(btn) btn.textContent = "익명으로 접속 중... ⏳";
    if(log) log.textContent = "";
    try {
        await auth.signInAnonymously();
        if(btn) btn.textContent = "접속 성공!";
    } catch(e) {
        if(log) log.textContent = "오류: " + e.message;
        if(btn) btn.textContent = "로그인 없이 시작하기 (익명)";
    }
}

// 로그인 후 돌아왔을 때 내부 에러가 있으면 화면에 띄워주는 안전장치
auth.getRedirectResult().catch(error => { alert("인증 에러: " + error.message + "\n\n※ Firebase 콘솔에서 'Google 로그인'이 켜져 있는지 꼭 확인하세요!"); });
function signOut() { auth.signOut(); }

let savedSettings = { fontSize: 18, theme: 'white', bgPlay: true };
try { const stored = localStorage.getItem('pacemakerSettings'); if (stored) savedSettings = JSON.parse(stored); } catch(e) {}
let fontSize = savedSettings.fontSize || 18; let currentTheme = savedSettings.theme || 'white'; let isBgPlayEnabled = savedSettings.bgPlay !== false;

const DB_NAME = 'PacemakerDB'; const STORE_NAME = 'books'; let localDb;
function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => { localDb = e.target.result; if (!localDb.objectStoreNames.contains(STORE_NAME)) localDb.createObjectStore(STORE_NAME, { keyPath: 'id' }); };
        req.onsuccess = e => { localDb = e.target.result; resolve(); }; req.onerror = e => reject(e);
    });
}
async function saveBookToDB(book) { if(!localDb) await initDB(); return new Promise((resolve, reject) => { try { const tx = localDb.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).put(book); tx.oncomplete = resolve; tx.onerror = reject; } catch(e) { reject(e); } }); }
async function deleteBookFromDB(id) { if(!localDb) await initDB(); return new Promise((resolve, reject) => { try { const tx = localDb.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).delete(id); tx.oncomplete = resolve; tx.onerror = reject; } catch(e) { reject(e); } }); }
async function loadAllBooks() { if(!localDb) await initDB(); return new Promise((resolve) => { try { const tx = localDb.transaction(STORE_NAME, 'readonly'); const req = tx.objectStore(STORE_NAME).getAll(); req.onsuccess = () => resolve(req.result ||[]); req.onerror = () => resolve([]); } catch(e) { resolve([]); } }); }

let myBooks =[]; let currentBookId = null, totalPages = 1, currentPage = 0; let editingBookId = null; 
const svgPlay = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const svgPause = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
const speedOptions =[1.0, 1.25, 1.5, 1.75, 2.0]; let currentSpeedIndex = 0;

let isTtsSpeaking = false, isTtsPaused = false, isManualRestart = false; 
let ttsCurrentPage = 0; let ttsUtterance = null, selectedVoice = null;
let paragraphsToSpeak =[], currentSpeakingIndex = -1; let lastCharIndex = 0; 
let longPressTimer = null, targetParagraph = null, selectedShelfBookId = null, ttsKeepAliveTimer = null;
let currentToc = []; 
const defaultColors =['#6e8efb', '#f6d365', '#84fab0', '#ff0844', '#4facfe', '#9b59b6'];
let globalTouchTime = 0;

const els = {
    app: document.getElementById('app'), vShelf: document.getElementById('view-bookshelf'), list: document.getElementById('book-list'),
    vInput: document.getElementById('view-input'), title: document.getElementById('book-title'), text: document.getElementById('text-input'), btnStart: document.getElementById('btn-save-read'),
    vReader: document.getElementById('view-reader'), viewer: document.getElementById('viewer-container'), content: document.getElementById('book-content'),
    titleTop: document.getElementById('top-title'), btnBack: document.getElementById('back-btn'), header: document.getElementById('main-header'),
    pageNum: document.getElementById('pageNumber'), progress: document.getElementById('nav-progress-fill'), progressHitbox: document.getElementById('progress-hitbox'), headerActions: document.getElementById('header-actions'),
    ctxPopup: document.getElementById('context-popup'), shelfMenu: document.getElementById('shelf-menu-overlay'), sheetOver: document.getElementById('sheet-overlay'), 
    settingsSheet: document.getElementById('settings-sheet'), chatSheet: document.getElementById('chat-sheet'), tocSheet: document.getElementById('toc-sheet'),
    ttsControls: document.getElementById('tts-header-controls'), ttsPauseBtn: document.getElementById('tts-pause-btn'), ttsSpeedBtn: document.getElementById('tts-speed-btn'),
    chatMessages: document.getElementById('chat-messages'), chatInput: document.getElementById('chat-input'), tocList: document.getElementById('toc-list')
};

window.onload = async () => {
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
    setTheme(currentTheme, null, true);
    toggleBgPlay(isBgPlayEnabled, true);
    const apiInput = document.getElementById('api-key-input');
    if(apiInput) apiInput.value = getUserApiKey();
    try { await initDB(); myBooks = await loadAllBooks(); myBooks.sort((a,b) => b.id - a.id); } catch (e) {}
        
        // Auth 감지 및 설정 동기화
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                currentUser = user;
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('app').style.display = 'flex';
                document.getElementById('sync-key-display').textContent = user.isAnonymous ? "익명 사용자 (동기화 제한됨)" : user.email; // 연동된 계정 표시
                
                await loadSettingsFromFirebase();
                showBookshelf();
            } else {
                currentUser = null;
                document.getElementById('login-screen').style.display = 'flex';
                document.getElementById('app').style.display = 'none';
            }
        });
};

async function loadSettingsFromFirebase() {
    if (!currentUser) return;
    try {
        const doc = await dbFirestore.collection("users").doc(currentUser.uid).get();
        if (doc.exists && doc.data().settings) {
            savedSettings = doc.data().settings;
            fontSize = savedSettings.fontSize || 18;
            currentTheme = savedSettings.theme || 'white';
            isBgPlayEnabled = savedSettings.bgPlay !== false;
            
            document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
            setTheme(currentTheme, null, true);
            toggleBgPlay(isBgPlayEnabled, true);
        }
    } catch (e) { console.error("설정 로드 실패", e); }
}
async function saveSettingsToFirebase() { if (!currentUser) return; try { await dbFirestore.collection("users").doc(currentUser.uid).set({ settings: savedSettings }, { merge: true }); } catch (e) { console.error("설정 저장 실패", e); } }

function playPaperSound() {
    try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine'; osc.frequency.setValueAtTime(150, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1); gain.gain.setValueAtTime(0.5, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1); } catch(e) {}
}

// --- 서재 ---
function renderBookshelf() {
    const searchInput = document.getElementById('search-book');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const filteredBooks = query ? myBooks.filter(b => b.title.toLowerCase().includes(query)) : myBooks;

    if (filteredBooks.length === 0) {
        if (myBooks.length === 0) {
            els.list.innerHTML = `<div style="grid-column:1/-1; text-align:center; margin-top:60px; color:#666;"><div style="font-size:40px; margin-bottom:16px;">📚</div><p style="margin-bottom:24px; line-height:1.6;">우측 하단 <b>+</b> 버튼을 눌러 소설을 추가하거나<br>설정에서 클라우드 복원을 해보세요!</p></div>`;
        } else {
            els.list.innerHTML = `<div style="grid-column:1/-1; text-align:center; margin-top:60px; color:#666;">검색 결과가 없습니다.</div>`;
        }
        return;
    }
    els.list.innerHTML = '';
    filteredBooks.forEach((book, idx) => {
        const div = document.createElement('div'); div.className = 'book-card';
        let bgStyle = book.coverUrl ? `background-image: url('${book.coverUrl}')` : `background-color: ${defaultColors[idx % defaultColors.length]}`;
        div.innerHTML = `<div class="book-cover" style="${bgStyle}"></div><div class="book-info"><h3>${book.title}</h3><p>${book.currentPage + 1}p 읽는 중</p></div>`;
        let sx, sy, moved = false, pressTimer = null;
        const startPress = (x, y) => { sx = x; sy = y; moved = false; pressTimer = setTimeout(() => { moved = true; navigator.vibrate?.(50); selectedShelfBookId = book.id; els.shelfMenu.style.display = 'flex'; }, 500); };
        const movePress = (x, y) => { if(Math.abs(x - sx) > 10 || Math.abs(y - sy) > 10) { moved = true; clearTimeout(pressTimer); } };
        const endPress = () => { clearTimeout(pressTimer); if(!moved) openBook(book.id); };

        div.addEventListener('touchstart', e => { globalTouchTime = Date.now(); startPress(e.touches[0].clientX, e.touches[0].clientY); }, {passive: true});
        div.addEventListener('touchmove', e => { globalTouchTime = Date.now(); movePress(e.touches[0].clientX, e.touches[0].clientY); }, {passive: true});
        div.addEventListener('touchend', e => { globalTouchTime = Date.now(); endPress(); });
        div.addEventListener('touchcancel', () => { globalTouchTime = Date.now(); clearTimeout(pressTimer); moved = true; });

        div.addEventListener('mousedown', e => { if(Date.now() - globalTouchTime < 500 || e.button !== 0) return; startPress(e.clientX, e.clientY); });
        div.addEventListener('mousemove', e => { if(Date.now() - globalTouchTime < 500 || e.buttons !== 1) return; movePress(e.clientX, e.clientY); });
        div.addEventListener('mouseup', e => { if(Date.now() - globalTouchTime < 500 || e.button !== 0) return; endPress(); });
        div.addEventListener('mouseleave', () => { clearTimeout(pressTimer); moved = true; });
        div.addEventListener('contextmenu', e => { e.preventDefault(); clearTimeout(pressTimer); moved = true; selectedShelfBookId = book.id; els.shelfMenu.style.display = 'flex'; });
        els.list.appendChild(div);
    });
}

function closeShelfMenu() { els.shelfMenu.style.display = 'none'; selectedShelfBookId = null; }
function editSelectedBook() {
    const book = myBooks.find(b => b.id === selectedShelfBookId); closeShelfMenu(); if(!book) return;
    editingBookId = book.id; els.title.value = book.title; els.text.value = book.text; els.btnStart.textContent = "수정하고 읽기"; els.btnStart.disabled = false;
    els.vShelf.style.display = 'none'; els.vInput.style.display = 'flex'; els.headerActions.style.display = 'none'; els.titleTop.textContent = "소설 수정"; els.btnBack.style.display = 'flex';
}

function triggerLocalCover() { document.getElementById('cover-upload').click(); }
document.getElementById('cover-upload').addEventListener('change', function(e) { 
    const file = e.target.files[0]; if(!file) return; 
    const targetBookId = selectedShelfBookId; closeShelfMenu(); const reader = new FileReader(); 
    reader.onload = function(evt) { 
        const img = new Image(); img.onload = async function() {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const MAX_WIDTH = 300; const scaleSize = MAX_WIDTH / img.width; canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize; ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const b = myBooks.find(x => x.id === targetBookId); if(b) { b.coverUrl = canvas.toDataURL('image/jpeg', 0.8); await saveBookToDB(b); renderBookshelf(); }
        }; img.src = evt.target.result;
    }; reader.readAsDataURL(file); 
});

async function resetCover() { const id = selectedShelfBookId; closeShelfMenu(); const b = myBooks.find(x => x.id === id); if(b) { delete b.coverUrl; await saveBookToDB(b); renderBookshelf(); } }
async function deleteSelectedBook() { const id = selectedShelfBookId; closeShelfMenu(); if(confirm('삭제하시겠습니까?')) { myBooks = myBooks.filter(b => b.id !== id); await deleteBookFromDB(id); renderBookshelf(); } }

async function generateAiCover() {
    const id = selectedShelfBookId; closeShelfMenu(); const book = myBooks.find(b => b.id === id); if(!book) return;
    if(!confirm(`[${book.title}] 의 내용을 바탕으로 AI가 어울리는 표지를 자동 생성할까요?\n(약 10~15초 소요)`)) return;
    
    const cardIndex = myBooks.findIndex(b=>b.id===id);
    if(cardIndex > -1 && els.list.children[cardIndex]) {
        const coverDiv = els.list.children[cardIndex].querySelector('.book-cover');
        if(coverDiv) { coverDiv.style.backgroundImage = 'none'; coverDiv.style.backgroundColor = '#333'; coverDiv.innerHTML = '<div style="color:white; padding:20px; text-align:center; font-size:12px; margin-top:30%;">AI 생성 중... ⏳</div>'; }
    }
    const apiKey = getUserApiKey();
    if (!apiKey) { alert("설정(⚙️) 메뉴에서 API 키를 먼저 입력해주세요."); renderBookshelf(); return; }
    try {
        const sample = book.text.substring(0, 1000); // 토큰 최적화
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
        const sysPrompt = `You are an expert anime image prompt engineer. Output ONLY the comma-separated prompt string. Limit to 30 words. No explanations.`;
        const payload = {
            systemInstruction: { parts: [{ text: sysPrompt }] },
            contents: [{ role: "user", parts: [{ text: `Extract character names and visual themes from title: "${book.title}" and text: "${sample}". Must include tags: masterpiece, best quality, modern high quality japanese anime style, official art, light novel cover.` }] }],
            generationConfig: { temperature: 0.2 }
        };
        const response = await fetch(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error("Gemini Error");
        const data = await response.json();
        const prompt = data.candidates[0].content.parts[0].text.trim();
        const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=400&height=600&nologo=true&seed=${Math.floor(Math.random()*10000)}&model=flux-anime`;
        const img = new Image(); img.crossOrigin = "Anonymous";
        img.onload = async function() { const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 600; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); book.coverUrl = canvas.toDataURL('image/jpeg', 0.8); await saveBookToDB(book); renderBookshelf(); };
        img.onerror = () => { alert("표지 이미지 다운로드 실패."); renderBookshelf(); }; img.src = imgUrl;
    } catch(e) { alert("AI 표지 생성에 실패했습니다."); renderBookshelf(); }
}

function openAddMenu() { document.getElementById('add-menu-overlay').style.display = 'flex'; }
function closeAddMenu() { document.getElementById('add-menu-overlay').style.display = 'none'; }

// --- TXT 파일 불러오기 ---
function importTxtFile(event) {
    const file = event.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        const fileName = file.name.replace(/\.[^/.]+$/, ""); // 확장자(.txt) 제거
        showInputScreen();
        els.title.value = fileName;
        els.text.value = content;
        event.target.value = ''; // 재선택을 위해 초기화
    };
    reader.readAsText(file); // 기본 UTF-8 읽기
}

function showBookshelf() {
    if(isTtsSpeaking) stopTts(); editingBookId = null; els.btnStart.textContent = "저장하고 읽기"; els.btnStart.disabled = false;
    els.app.classList.remove('hud-hidden'); els.vShelf.style.display = 'block'; els.vInput.style.display = 'none'; els.vReader.style.display = 'none';
    els.titleTop.textContent = "서재"; els.btnBack.style.display = 'none'; els.headerActions.style.display = 'flex'; renderBookshelf();
}

function showInputScreen() {
    editingBookId = null; els.btnStart.textContent = "저장하고 읽기"; els.btnStart.disabled = false;
    els.vShelf.style.display = 'none'; els.vInput.style.display = 'flex'; els.headerActions.style.display = 'none';
    els.titleTop.textContent = "새 소설 추가"; els.btnBack.style.display = 'flex'; els.title.value = ''; els.text.value = '';
}

async function saveAndRead() {
    const title = els.title.value.trim() || '제목 없는 소설'; const text = els.text.value.trim(); if (!text) return alert("소설 내용을 입력해주세요!");
    els.btnStart.disabled = true; els.btnStart.textContent = "저장 중...";
    try {
        if (editingBookId) {
            const bookIndex = myBooks.findIndex(b => b.id === editingBookId);
            if(bookIndex > -1) { myBooks[bookIndex].title = title; myBooks[bookIndex].text = text; await saveBookToDB(myBooks[bookIndex]); openBook(editingBookId); }
            editingBookId = null; els.btnStart.disabled = false; els.btnStart.textContent = "저장하고 읽기";
        } else {
            const newBook = { id: Date.now(), title: title, text: text, currentPage: 0, highlights:[], illustrations: {}, aiTocs: {} };
            myBooks.unshift(newBook); await saveBookToDB(newBook); openBook(newBook.id); els.btnStart.disabled = false;
        }
    } catch (error) {
        console.error(error); alert("저장 중 기기 오류가 발생했습니다. 다시 시도해주세요."); els.btnStart.disabled = false; els.btnStart.textContent = "저장하고 읽기";
    }
}

// --- Firebase 클라우드 동기화 ---
async function exportToFirebase() {
    if (!currentUser) return alert("로그인이 필요합니다.");
    try {
        const allBooks = await loadAllBooks(); if (allBooks.length === 0) return alert("데이터가 없습니다.");
        document.getElementById('btn-fb-backup').textContent = "백업 중... ⏳"; const userRef = dbFirestore.collection("users").doc(currentUser.uid); await userRef.set({ lastBackup: new Date().toISOString() }, { merge: true });
        const chunkSize = 400; for (let i = 0; i < allBooks.length; i += chunkSize) { const chunk = allBooks.slice(i, i + chunkSize); const batch = dbFirestore.batch(); chunk.forEach(book => { const bookRef = userRef.collection("books").doc(book.id.toString()); batch.set(bookRef, book); }); await batch.commit(); }
        alert(`✅ 클라우드 동기화 완료!`);
    } catch (e) { alert("서버 에러가 발생했습니다."); } finally { document.getElementById('btn-fb-backup').textContent = "☁️ 서버에 백업"; }
}
async function importFromFirebase() {
    if (!currentUser) return alert("로그인이 필요합니다.");
    if (!confirm("서버 데이터를 기기로 불러옵니다. 계속하시겠습니까?")) return;
    try {
        document.getElementById('btn-fb-restore').textContent = "복원 중... ⏳"; const booksSnapshot = await dbFirestore.collection("users").doc(currentUser.uid).collection("books").get();
        if (booksSnapshot.empty) { alert("저장된 백업이 없습니다."); document.getElementById('btn-fb-restore').textContent = "☁️ 서버에서 복원"; return; }
        let count = 0; for (const doc of booksSnapshot.docs) { const book = doc.data(); if(!book.illustrations) book.illustrations = {}; if(!book.aiTocs) book.aiTocs = {}; await saveBookToDB(book); count++; }
        alert(`✅ ${count}개 복원 완료!`); myBooks = await loadAllBooks(); myBooks.sort((a,b) => b.id - a.id); renderBookshelf(); closeAllSheets();
    } catch(e) { alert("불러오기 오류."); } finally { document.getElementById('btn-fb-restore').textContent = "☁️ 서버에서 복원"; }
}

function triggerDownload(data, filename) { const dataStr = JSON.stringify(data); const blob = new Blob([dataStr], {type: "application/json"}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
async function exportAllData() { try { const allBooks = await loadAllBooks(); if (allBooks.length === 0) return alert("데이터 없음"); triggerDownload(allBooks, `pacemaker_backup_${new Date().toISOString().slice(0,10)}.json`); closeAllSheets(); } catch (e) {} }
async function exportSingleBook() { try { const book = myBooks.find(b => b.id === selectedShelfBookId); closeShelfMenu(); if (!book) return; triggerDownload([book], `pacemaker_${book.title}.json`); } catch (e) {} }
async function importLocalData(event) {
    const file = event.target.files[0]; if(!file) return; const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            let importedData = JSON.parse(e.target.result); if(!Array.isArray(importedData)) importedData =[importedData];
            let count = 0; for (const book of importedData) { if(book.id && book.title && book.text) { if(!book.illustrations) book.illustrations = {}; if(!book.aiTocs) book.aiTocs = {}; await saveBookToDB(book); count++; } }
            alert(`${count}개 복원 완료!`); myBooks = await loadAllBooks(); myBooks.sort((a,b) => b.id - a.id); renderBookshelf(); closeAllSheets();
        } catch(err) { alert("올바른 백업 파일이 아닙니다."); }
    }; reader.readAsText(file); event.target.value = ''; 
}

function openBook(id) {
    try {
        const book = myBooks.find(b => b.id === id); if(!book) return;
        currentBookId = id; currentPage = book.currentPage || 0;
        if(!book.highlights) book.highlights =[]; if(!book.illustrations) book.illustrations = {};

        els.content.innerHTML = ''; const lines = (book.text || "").split('\n'); let prevEmpty = false;
        lines.forEach((line, idx) => {
            const t = line.trim();
            if(t === '') { if(!prevEmpty) { const p = document.createElement('p'); p.className = 'empty-line'; p.innerHTML = '&nbsp;'; els.content.appendChild(p); prevEmpty = true; } } 
            else if (!t.startsWith('/*')) {
                prevEmpty = false; const p = document.createElement('p'); p.textContent = t; p.dataset.idx = idx;
                if(/^[“‘"'\u300C\u300E]/.test(t)) p.classList.add('dialogue');
                if(book.highlights.includes(idx)) p.classList.add('highlight');
                els.content.appendChild(p);
                if(book.illustrations[idx]) {
                    const imgContainer = document.createElement('div'); imgContainer.className = 'illust-container';
                    imgContainer.innerHTML = `<img src="${book.illustrations[idx]}" class="illust-img"><button class="illust-del-btn" onclick="deleteIllustration(${idx}, this, event)">✕</button>`;
                    els.content.appendChild(imgContainer);
                }
            }
        });
        els.vShelf.style.display = 'none'; els.vInput.style.display = 'none'; els.vReader.style.display = 'flex'; els.headerActions.style.display = 'none';
        els.titleTop.textContent = book.title; els.btnBack.style.display = 'flex'; els.app.classList.add('hud-hidden'); 
        paragraphsToSpeak = Array.from(els.content.querySelectorAll('p:not(.empty-line)'));
        setTimeout(() => { calculatePages(); buildTOC(); els.viewer.scrollTo({ left: currentPage * els.viewer.clientWidth, behavior: 'auto' }); updateProgressUI(); }, 150);
    } catch (error) {
        console.error(error); alert("책을 여는 중 문제가 발생했습니다: " + error.message);
    }
}

function calculatePages() { const w = els.viewer.clientWidth; totalPages = Math.round(els.content.scrollWidth / w) || 1; }
function updateProgressUI() { els.pageNum.textContent = `${currentPage + 1} / ${totalPages}`; els.progress.style.width = `${(currentPage / (totalPages - 1 || 1)) * 100}%`; }
async function saveProgress() { const i = myBooks.findIndex(b => b.id === currentBookId); if(i > -1) { myBooks[i].currentPage = currentPage; await saveBookToDB(myBooks[i]); } }

let touchStartX = 0, touchStartY = 0, isLongPress = false, isViewerSwiping = false;
let wasPopupOpen = false;

const viewerStart = (x, y, targetEl) => {
    let el = targetEl; if (el && el.nodeType === 3) el = el.parentNode;
    if (el && el.closest && el.closest('#context-popup')) return; 
    touchStartX = x; touchStartY = y; 
    isLongPress = false; isViewerSwiping = false; 
    wasPopupOpen = (els.ctxPopup.style.display === 'flex' || els.sheetOver.style.display === 'block');
    hideContextMenu(); closeAllSheets();
    
    const pNode = el && el.closest ? el.closest('p:not(.empty-line)') : null;
    if(pNode) {
        targetParagraph = pNode;
        longPressTimer = setTimeout(() => { isLongPress = true; navigator.vibrate?.(50); targetParagraph.classList.add('focused'); showContextMenu(touchStartX, touchStartY); }, 450); 
    }
};
const viewerMove = (x, y) => {
    if(Math.abs(x - touchStartX) > 15 || Math.abs(y - touchStartY) > 15) { clearTimeout(longPressTimer); isViewerSwiping = true; if(!isLongPress && targetParagraph) targetParagraph.classList.remove('focused'); }
};
const viewerEnd = (x, y, targetEl) => {
    let el = targetEl; if (el && el.nodeType === 3) el = el.parentNode;
    if (el && el.closest && el.closest('#context-popup')) return; 
    clearTimeout(longPressTimer);
    if(!isLongPress) {
        if(targetParagraph) targetParagraph.classList.remove('focused');
        if (isViewerSwiping) {
            const dx = x - touchStartX; const dy = y - touchStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) { if (dx < 0) turnPage(1); else turnPage(-1); }
        } else {
            if(!wasPopupOpen) {
                const screenW = window.innerWidth;
                if (x < screenW * 0.25) turnPage(-1); else if (x > screenW * 0.75) turnPage(1); else els.app.classList.toggle('hud-hidden');
            }
        }
    }
};

els.viewer.addEventListener('touchstart', e => { globalTouchTime = Date.now(); viewerStart(e.touches[0].clientX, e.touches[0].clientY, e.target); }, {passive: true});
els.viewer.addEventListener('touchmove', e => { globalTouchTime = Date.now(); viewerMove(e.touches[0].clientX, e.touches[0].clientY); }, {passive: true});
els.viewer.addEventListener('touchend', e => { globalTouchTime = Date.now(); viewerEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY, e.target); });
els.viewer.addEventListener('touchcancel', () => { globalTouchTime = Date.now(); clearTimeout(longPressTimer); if(targetParagraph) targetParagraph.classList.remove('focused'); });

els.viewer.addEventListener('mousedown', e => { if(Date.now() - globalTouchTime < 500 || e.button !== 0) return; viewerStart(e.clientX, e.clientY, e.target); });
els.viewer.addEventListener('mousemove', e => { if(Date.now() - globalTouchTime < 500 || e.buttons !== 1) return; viewerMove(e.clientX, e.clientY); });
els.viewer.addEventListener('mouseup', e => { if(Date.now() - globalTouchTime < 500 || e.button !== 0) return; viewerEnd(e.clientX, e.clientY, e.target); });
els.viewer.addEventListener('mouseleave', () => { if(Date.now() - globalTouchTime < 500) return; clearTimeout(longPressTimer); if(targetParagraph) targetParagraph.classList.remove('focused'); });

function turnPage(direction) {
    let newPage = currentPage + direction; if(newPage < 0) newPage = 0; if(newPage >= totalPages) newPage = totalPages - 1;
    if(newPage !== currentPage) { currentPage = newPage; els.viewer.scrollTo({ left: currentPage * els.viewer.clientWidth, behavior: 'smooth' }); playPaperSound(); saveProgress(); updateProgressUI(); }
}

function promptPageJump() {
    const input = prompt(`이동할 페이지 숫자를 입력하세요 (1 ~ ${totalPages})`, currentPage + 1);
    if (input !== null) { const pageNum = parseInt(input, 10); if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) { currentPage = pageNum - 1; els.viewer.scrollTo({ left: currentPage * els.viewer.clientWidth, behavior: 'auto' }); saveProgress(); updateProgressUI(); } else alert("올바른 번호를 입력해주세요."); }
}

let isDraggingProgress = false;
function handleProgressDrag(clientX) {
    const rect = els.progressHitbox.getBoundingClientRect();
    let x = clientX - rect.left; if (x < 0) x = 0; if (x > rect.width) x = rect.width;
    let targetPage = Math.floor((x / rect.width) * totalPages); if (targetPage >= totalPages) targetPage = totalPages - 1; if (targetPage < 0) targetPage = 0;
    if (currentPage !== targetPage) { currentPage = targetPage; els.viewer.scrollTo({ left: currentPage * els.viewer.clientWidth, behavior: 'auto' }); updateProgressUI(); }
}
els.progressHitbox.addEventListener('touchstart', e => { globalTouchTime = Date.now(); e.stopPropagation(); isDraggingProgress = true; els.progress.style.transition = 'none'; handleProgressDrag(e.touches[0].clientX); }, {passive: false});
els.progressHitbox.addEventListener('touchmove', e => { globalTouchTime = Date.now(); if (isDraggingProgress) { e.preventDefault(); e.stopPropagation(); handleProgressDrag(e.touches[0].clientX); } }, {passive: false});
els.progressHitbox.addEventListener('touchend', e => { globalTouchTime = Date.now(); e.stopPropagation(); if (isDraggingProgress) { isDraggingProgress = false; els.progress.style.transition = 'width 0.1s linear'; playPaperSound(); saveProgress(); } });
els.progressHitbox.addEventListener('touchcancel', e => { globalTouchTime = Date.now(); e.stopPropagation(); if (isDraggingProgress) { isDraggingProgress = false; els.progress.style.transition = 'width 0.1s linear'; } });

els.progressHitbox.addEventListener('mousedown', e => { if(Date.now() - globalTouchTime < 500 || e.button !== 0) return; e.stopPropagation(); isDraggingProgress = true; els.progress.style.transition = 'none'; handleProgressDrag(e.clientX); });
document.addEventListener('mousemove', e => { if(Date.now() - globalTouchTime < 500) return; if (isDraggingProgress) { e.preventDefault(); handleProgressDrag(e.clientX); } }, {passive: false});
document.addEventListener('mouseup', e => { if(Date.now() - globalTouchTime < 500) return; if (isDraggingProgress) { isDraggingProgress = false; els.progress.style.transition = 'width 0.1s linear'; playPaperSound(); saveProgress(); } });

document.getElementById('main-header').addEventListener('touchstart', e => e.stopPropagation(), {passive: true}); 
document.getElementById('reader-nav-pill').addEventListener('touchstart', e => { if (e.target.id !== 'progress-hitbox' && !e.target.closest('#progress-hitbox')) e.stopPropagation(); }, {passive: true});
document.getElementById('main-header').addEventListener('mousedown', e => { if(Date.now() - globalTouchTime > 500) e.stopPropagation(); }); 
document.getElementById('reader-nav-pill').addEventListener('mousedown', e => { if (Date.now() - globalTouchTime > 500 && e.target.id !== 'progress-hitbox' && !e.target.closest('#progress-hitbox')) e.stopPropagation(); });

// --- PC 호환성 향상: 마우스 휠, 키보드 방향키, 우클릭 ---
document.addEventListener('contextmenu', e => { 
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); 
    if (isLongPress) return; 
    if (els.vReader.style.display === 'flex' && e.target.tagName === 'P' && !e.target.classList.contains('empty-line') && els.sheetOver.style.display !== 'block') {
        hideContextMenu(); targetParagraph = e.target; targetParagraph.classList.add('focused'); showContextMenu(e.clientX, e.clientY);
    }
});

let wheelTimer = null;
els.viewer.addEventListener('wheel', e => {
    if (els.ctxPopup.style.display === 'flex' || els.sheetOver.style.display === 'block') return;
    if (!wheelTimer) {
        if (e.deltaY > 0) turnPage(1); else if (e.deltaY < 0) turnPage(-1);
        wheelTimer = setTimeout(() => { wheelTimer = null; }, 300);
    }
}, {passive: true});

window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; // 입력창 타이핑 중일 땐 단축키 무시
    if (els.vReader.style.display === 'flex' && els.sheetOver.style.display !== 'block' && els.ctxPopup.style.display !== 'flex') {
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); turnPage(1); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); turnPage(-1); }
    }
    if (e.key === 'Escape') { closeAllSheets(); hideContextMenu(); }
});

function closeAllSheets() { els.settingsSheet.classList.remove('show'); els.chatSheet.classList.remove('show'); els.tocSheet.classList.remove('show'); setTimeout(() => els.sheetOver.style.display = 'none', 300); }
function openSettings() { closeAllSheets(); els.sheetOver.style.display = 'block'; setTimeout(() => els.settingsSheet.classList.add('show'), 10); }
function openChat() {
    if (!currentBookId) return alert("소설을 먼저 열어주세요!"); closeAllSheets(); els.sheetOver.style.display = 'block'; setTimeout(() => els.chatSheet.classList.add('show'), 10);
    if (chatHistory.length === 0) appendChatMessage('ai', "이 소설에 대해 무엇이든 물어보세요! (등장인물, 줄거리 요약 등)");
}
function openToc() { closeAllSheets(); els.sheetOver.style.display = 'block'; setTimeout(() => els.tocSheet.classList.add('show'), 10); }

function showContextMenu(x, y) { els.ctxPopup.style.display = 'flex'; els.ctxPopup.style.transform = 'none'; const w = els.ctxPopup.offsetWidth; const h = els.ctxPopup.offsetHeight; let finalX = x - w / 2; let finalY = y - h - 20; if (finalX < 10) finalX = 10; if (finalX + w > window.innerWidth - 10) finalX = window.innerWidth - w - 10; if (finalY < 10) finalY = y + 30; els.ctxPopup.style.transform = `translate3d(${finalX}px, ${finalY}px, 0)`; }
function hideContextMenu() { els.ctxPopup.style.display = 'none'; document.querySelectorAll('p.focused').forEach(el => el.classList.remove('focused')); }
function startTtsFromTarget() { hideContextMenu(); currentPage = Math.floor(targetParagraph.offsetLeft / els.viewer.clientWidth); startTtsAtParagraph(targetParagraph); }

// --- 목차 중간 삽입 삭제 ---
async function removeInlineToc(idx, btnEl, event) {
    event.stopPropagation();
    if(!confirm("이 목차 표시를 삭제하시겠습니까?")) return;
    const book = myBooks.find(b => b.id === currentBookId);
    if(book && book.aiTocs) { delete book.aiTocs[idx]; await saveBookToDB(book); }
    btnEl.closest('.inline-toc').remove();
    calculatePages(); buildTOC(); 
    els.viewer.scrollTo({ left: currentPage * els.viewer.clientWidth, behavior: 'auto' }); updateProgressUI();
}

// --- 목차 추출 로직 ---
function renderTocList() {
    els.tocList.innerHTML = '';
    currentToc.forEach(item => {
        const div = document.createElement('div'); div.className = 'toc-item';
        div.innerHTML = `<span>${item.title}</span><span style="opacity:0.5; font-size:12px;">${item.page + 1}p</span>`;
        div.onclick = () => { currentPage = item.page; els.viewer.scrollTo({ left: currentPage * els.viewer.clientWidth, behavior: 'auto' }); saveProgress(); updateProgressUI(); closeAllSheets(); };
        els.tocList.appendChild(div);
    });
}

function buildTOC() {
    currentToc =[]; els.tocList.innerHTML = '';
    const chapterRegex = /^(제\s*\d+\s*[장화편]|chapter\s*\d+|[\[【<].{2,20}[\]】>])/i;
    paragraphsToSpeak.forEach((p) => {
        const text = p.textContent.trim();
        if (text.length > 2 && text.length < 40 && chapterRegex.test(text)) {
            const targetPage = Math.floor(p.offsetLeft / els.viewer.clientWidth);
            currentToc.push({ title: text, page: targetPage });
        }
    });

    // AI가 삽입한 인라인 목차도 리스트에 통합
    const inlineTocs = els.content.querySelectorAll('.inline-toc');
    inlineTocs.forEach(div => {
        const titleEl = div.querySelector('.toc-title');
        if(titleEl) {
            const titleText = titleEl.textContent.replace('📖', '').trim();
            const targetPage = Math.floor(div.offsetLeft / els.viewer.clientWidth);
            currentToc.push({ title: titleText, page: targetPage });
        }
    });

    currentToc.sort((a,b) => a.page - b.page);

    const aiTocBtn = document.getElementById('ai-toc-container');
    if (currentToc.length <= 1) {
        let interval = Math.max(1, Math.floor(totalPages / 5));
        for(let i=0; i<5; i++) currentToc.push({ title: `파트 ${i+1}`, page: Math.min(i * interval, totalPages-1) });
        if (aiTocBtn) aiTocBtn.style.display = 'block';
    } else {
        if (aiTocBtn) aiTocBtn.style.display = 'none'; // AI로 만들었거나 원래 목차가 있으면 버튼 숨기기
    }
    renderTocList();
}

async function generateAiToc() {
    const btn = document.querySelector('#ai-toc-container button');
    btn.innerHTML = "AI가 문맥을 분석 중입니다... ⏳"; btn.disabled = true;
    
    try {
        const book = myBooks.find(b => b.id === currentBookId); if(!book) throw new Error("책 정보가 없습니다.");
        const contextText = book.text.substring(0, 4000); // 목차 생성 컨텍스트 4000자로 제한
        const sysInst = `당신은 소설 편집자입니다. 장면 전환에 따라 챕터를 나누고, 응답은 반드시 JSON 배열로만 작성하세요. 다른 말은 일절 적지 마세요.\n[형식]: [{"title": "소제목", "start_text": "시작 문장 그대로"}]`;
        const promptText = `다음 소설 내용을 3~8개의 챕터로 나누어주세요.\n\n[소설 내용]\n${contextText}`;
        
        let responseText = await callGemini(promptText, "gemini-3-flash-preview", sysInst);
        responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) responseText = jsonMatch[0];
        let aiTocs; try { aiTocs = JSON.parse(responseText); } catch(e) { throw new Error("AI 응답 형식이 올바르지 않습니다."); }

        let addedCount = 0; const paragraphs = Array.from(els.content.querySelectorAll('p:not(.empty-line):not(.inline-toc)'));
        for (let toc of aiTocs) {
            if(!toc.title || !toc.start_text) continue;
            const cleanTitle = toc.title.replace(/\*\*/g, '').replace(/["']/g, '').trim();
            const searchStr = toc.start_text.replace(/\s+/g, '').substring(0, 15); // 공백 제외 15자 비교
            if (searchStr.length < 5) continue;
            
            let targetP = null;
            for (let p of paragraphs) { if (p.textContent.replace(/\s+/g, '').includes(searchStr)) { targetP = p; break; } }

            if (targetP) {
                const idx = parseInt(targetP.dataset.idx);
                if (!book.aiTocs) book.aiTocs = {};
                if (!book.aiTocs[idx]) {
                    book.aiTocs[idx] = cleanTitle;
                    const tocDiv = document.createElement('div'); tocDiv.className = 'inline-toc'; tocDiv.dataset.idx = idx;
                    tocDiv.innerHTML = `<span class="toc-title">${cleanTitle}</span><button class="toc-del-btn" onclick="removeInlineToc(${idx}, this, event)">✕</button>`;
                    targetP.before(tocDiv); addedCount++;
                }
            }
        }
        await saveBookToDB(book);
        if (addedCount > 0) { setTimeout(() => { calculatePages(); buildTOC(); els.viewer.scrollTo({ left: currentPage * els.viewer.clientWidth, behavior: 'auto' }); updateProgressUI(); }, 100); } 
        else { alert("장면 전환을 찾지 못하여 생성에 실패했습니다."); }
    } catch (e) {
        alert("목차 생성 중 오류가 발생했습니다: " + e.message);
    } finally { btn.innerHTML = "🤖 내용 기반 스마트 목차 자동 생성"; btn.disabled = false; }
}

// [수정] 사용자의 개인 API Key를 사용하는 통일된 REST 방식 (Firebase 한도 및 의존성 제거)
async function callGemini(promptText, modelName = "gemini-3-flash-preview", systemText = null) {
    const apiKey = getUserApiKey();
    if (!apiKey) throw new Error("API 키가 설정되지 않았습니다. 설정창(⚙️)에서 API 키를 먼저 입력해주세요.");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const payload = { contents: [{ role: "user", parts: [{ text: promptText }] }], generationConfig: { temperature: 0.2 } };
    if (systemText) payload.systemInstruction = { parts: [{ text: systemText }] };
    
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "통신 에러");
    return data.candidates[0].content.parts[0].text;
}

// --- AI 요약 ---
async function generateAiSummary() {
    const book = myBooks.find(b => b.id === currentBookId); if (!book) return;
    const btn = document.getElementById('btn-summary'); btn.innerHTML = "요약 중입니다... ⏳"; btn.disabled = true;
    const selectedModel = document.getElementById('summary-model-select').value;
    const selectedModelText = document.getElementById('summary-model-select').options[document.getElementById('summary-model-select').selectedIndex].text;
    
    let contextText = ""; let startIndex = Math.max(0, currentSpeakingIndex !== -1 ? currentSpeakingIndex - 10 : 0); // 요약 컨텍스트 시작점 조정
    for(let i=startIndex; i<Math.min(paragraphsToSpeak.length, startIndex + 30); i++) { contextText += paragraphsToSpeak[i].textContent + "\n"; if (contextText.length > 2000) break; } // 요약 컨텍스트 2000자로 제한
    
    const resBox = document.getElementById('summary-result-box');
    resBox.style.display = 'block'; resBox.innerHTML = "요약 중입니다... ⏳";

    try {
        const sysInst = `당신은 소설 내용을 한국어로 완벽하게 요약하는 전문가입니다. 분석 과정이나 부연 설명 없이 오직 요약문만 작성합니다.`;
        const promptText = `다음 소설 내용을 읽고 핵심 상황을 3~4줄로 요약하세요.\n\n[소설 내용]\n${contextText}\n\n요약문:`;
        let summary = await callGemini(promptText, selectedModel, sysInst);
        
        summary = summary.replace(/\*\*/g, '').trim(); // 혹시 모를 별표 제거
        resBox.innerHTML = `<b>✨ AI 파트 요약 (${selectedModelText})</b><br><br>${summary.replace(/\n/g, '<br>')}`;
    } catch (e) { resBox.innerHTML = `❌ 오류 발생: ${e.message}`; } finally { btn.innerHTML = "✨ AI 현재 파트 요약"; btn.disabled = false; }
}

// --- AI 채팅 (Gemini) ---
let chatHistory =[];
let msgCounter = 0; 
let activeChatSession = null;
let activeChatBookId = null;

function appendChatMessage(sender, htmlText) { const id = 'msg-' + Date.now() + '-' + (++msgCounter); const div = document.createElement('div'); div.className = `chat-bubble ${sender}`; div.id = id; div.innerHTML = htmlText; els.chatMessages.appendChild(div); els.chatMessages.scrollTop = els.chatMessages.scrollHeight; return id; }
function updateChatMessage(id, htmlText) { const div = document.getElementById(id); if(div) { div.innerHTML = htmlText; els.chatMessages.scrollTop = els.chatMessages.scrollHeight; } }

async function sendChatMessage() {
    const input = els.chatInput.value.trim(); if(!input) return;
    const apiKey = getUserApiKey();
    if (!apiKey) return alert("설정(⚙️) 메뉴에서 API 키를 먼저 입력해주세요.");

    const safeInput = input.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    appendChatMessage('user', safeInput); els.chatInput.value = ''; const loadingId = appendChatMessage('ai', "생각 중... ✍️");
    const book = myBooks.find(b => b.id === currentBookId); const contextText = book.text.substring(0, 2000); // 채팅 컨텍스트 2000자로 제한
    const selectedModel = document.getElementById('chat-model-select').value;
    try {
        const sysInst = `당신은 사용자와 소설을 함께 읽고 수다를 떠는 친한 한국인 친구입니다. 진짜 친구처럼 친근하고 편한 반말(~어, ~네, ~야)만 사용하세요.\n\n[우리가 읽고 있는 소설: ${book.title}]\n${contextText}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
        
        // 대화 기록을 API가 이해하는 형태로 변환 (문맥 기억)
        const historyContents = chatHistory.flatMap(msg => [{ role: "user", parts: [{ text: msg.user }] }, { role: "model", parts: [{ text: msg.ai }] }]);
        historyContents.push({ role: "user", parts: [{ text: input }] });

        const payload = {
            systemInstruction: { parts: [{ text: sysInst }] },
            contents: historyContents,
            generationConfig: { temperature: 0.2 }
        };

        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "통신 에러");
        
        const aiReply = data.candidates[0].content.parts[0].text.replace(/\*\*/g, '').trim();
        updateChatMessage(loadingId, aiReply); chatHistory.push({ user: input, ai: aiReply });
    } catch(e) { updateChatMessage(loadingId, "서버 연결에 실패했습니다: " + e.message); }
};

// --- AI 삽화 (Qwen/Gemini 프롬프트 + Flux-Anime 그림) ---
async function generateIllustration() {
    if(!targetParagraph) return;
    const idx = parseInt(targetParagraph.dataset.idx); const book = myBooks.find(b => b.id === currentBookId); hideContextMenu();
    if(!book.illustrations) book.illustrations = {}; if(book.illustrations[idx]) return alert("이미 이 문단에 삽화가 있습니다.");

    const loadingDiv = document.createElement('div'); loadingDiv.className = 'illust-container loading';
    loadingDiv.innerHTML = `<div style="padding:40px; background:rgba(0,0,0,0.03); border-radius:12px; color:#888; font-size:14px; font-weight:bold;">✨ 제미나이가 문맥을 분석 중입니다...</div>`;
    targetParagraph.after(loadingDiv);
    setTimeout(() => { calculatePages(); els.viewer.scrollTo({ left: currentPage * els.viewer.clientWidth, behavior: 'auto' }); }, 50);

    let optimizedPrompt = "";
    try {
        let contextText = ""; for(let i = Math.max(0, idx - 1); i <= idx; i++) { let pNode = els.content.querySelector(`p[data-idx="${i}"]`); if(pNode) contextText += pNode.textContent + "\n"; } // 삽화 컨텍스트 1000자로 제한
        const sysInst = `You are a prompt engineer for an anime AI image generator. Output ONLY the prompt string. No explanations.`;
        const promptText = `Extract character names and scene visual descriptions from the following text. Write a comma-separated English prompt. Must include tags: "masterpiece, best quality, modern high quality japanese anime style, official art, light novel illustration". Limit to 30 words.\n\nText: ${contextText}`;
        optimizedPrompt = await callGemini(promptText, "gemini-3-flash-preview", sysInst);
    } catch (error) {
        const fallbackText = targetParagraph.textContent.trim().substring(0, 50);
        optimizedPrompt = fallbackText + ", masterpiece, best quality, modern high quality japanese anime style, light novel illustration, highly detailed, cel shading, official art";
    }

    loadingDiv.innerHTML = `<div style="padding:40px; background:rgba(0,0,0,0.03); border-radius:12px; color:#888; font-size:14px; font-weight:bold;">🎨 완벽한 삽화를 그리고 있습니다... (최대 10초)</div>`;
    const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(optimizedPrompt)}?width=512&height=768&nologo=true&seed=${Math.floor(Math.random()*10000)}&model=flux-anime`;
    const tryLoadImage = (url) => {
        const img = new Image();
        img.onload = async () => {
            loadingDiv.remove(); const imgContainer = document.createElement('div'); imgContainer.className = 'illust-container';
            imgContainer.innerHTML = `<img src="${url}" class="illust-img"><button class="illust-del-btn" onclick="deleteIllustration(${idx}, this, event)">✕</button>`;
            targetParagraph.after(imgContainer); book.illustrations[idx] = url; await saveBookToDB(book); calculatePages();
        };
        img.onerror = () => { 
            if (retries > 0) { retries--; loadingDiv.innerHTML = `<div style="padding:40px; background:rgba(0,0,0,0.03); border-radius:12px; color:#888; font-size:14px; font-weight:bold;">서버 지연... 재시도 중입니다 ⏳</div>`; const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(optimizedPrompt)}?width=512&height=768&nologo=true&seed=${Math.floor(Math.random()*10000)}&model=flux`; tryLoadImage(fallbackUrl); } 
            else { loadingDiv.remove(); alert("그림 서버 접속자가 많아 실패했습니다. 잠시 후 다시 시도해주세요."); calculatePages(); }
        };
        img.src = url;
    };
    tryLoadImage(imgUrl);
}

async function deleteIllustration(idx, btnEl, event) { event.stopPropagation(); if(!confirm("이 삽화를 지우시겠습니까?")) return; const book = myBooks.find(b => b.id === currentBookId); if(book && book.illustrations) { delete book.illustrations[idx]; await saveBookToDB(book); } btnEl.closest('.illust-container').remove(); calculatePages(); }
async function toggleHighlight() { if(!targetParagraph) return; const idx = parseInt(targetParagraph.dataset.idx); const book = myBooks.find(b => b.id === currentBookId); if(targetParagraph.classList.contains('highlight')) { targetParagraph.classList.remove('highlight'); book.highlights = book.highlights.filter(i => i !== idx); } else { targetParagraph.classList.add('highlight'); if(!book.highlights.includes(idx)) book.highlights.push(idx); } await saveBookToDB(book); hideContextMenu(); }
function copyTargetText() { if(targetParagraph) { navigator.clipboard.writeText(targetParagraph.textContent).then(() => alert("텍스트가 복사되었습니다.")); } hideContextMenu(); }

let isVoiceManuallySelected = false;

function initVoices() {
    const voices = speechSynthesis.getVoices(); const koVoices = voices.filter(v => v.lang === 'ko-KR' || v.lang === 'ko_KR');
    const voiceSelect = document.getElementById('voice-select');
    if(voiceSelect && koVoices.length > 0) {
        voiceSelect.innerHTML = '';
        koVoices.forEach((v, i) => { const opt = document.createElement('option'); opt.value = i; opt.textContent = v.name; voiceSelect.appendChild(opt); });
        
        if (!isVoiceManuallySelected || !selectedVoice) {
            let bestVoice = koVoices.find(v => v.name.includes('Online (Natural)')); // 최우선: Edge Online
            if (!bestVoice) bestVoice = koVoices.find(v => v.name.includes('Premium'));
            if (!bestVoice) bestVoice = koVoices.find(v => v.name.toLowerCase().includes('samsung'));
            if (!bestVoice) bestVoice = koVoices.find(v => v.default);
            if (!bestVoice) bestVoice = koVoices[0];
            selectedVoice = bestVoice;
            voiceSelect.value = koVoices.indexOf(selectedVoice);
        } else {
            const idx = koVoices.findIndex(v => v.name === selectedVoice.name);
            if (idx > -1) voiceSelect.value = idx;
        }
    }
}
function changeVoice() {
    const voices = speechSynthesis.getVoices().filter(v => v.lang === 'ko-KR' || v.lang === 'ko_KR');
    const idx = document.getElementById('voice-select').value; 
    if(voices[idx]) { selectedVoice = voices[idx]; isVoiceManuallySelected = true; }
}
if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = initVoices; 
initVoices();

// Edge 브라우저 등 지연 로딩되는 온라인 음성 탐색을 위한 주기적 확인 장치
let checkVoiceInterval = setInterval(() => {
    const voices = speechSynthesis.getVoices();
    if (voices.some(v => v.name.includes('Online (Natural)'))) {
        initVoices();
        clearInterval(checkVoiceInterval);
    }
}, 1000);
setTimeout(() => clearInterval(checkVoiceInterval), 10000); // 10초 후에는 체크 중단 (자원 낭비 방지)

if ('mediaSession' in navigator) { navigator.mediaSession.setActionHandler('play', pauseResumeTts); navigator.mediaSession.setActionHandler('pause', pauseResumeTts); }
function updateMediaSession() { const book = myBooks.find(b => b.id === currentBookId); if ('mediaSession' in navigator && book) navigator.mediaSession.metadata = new MediaMetadata({ title: book.title, artist: 'Pacemaker Reader', artwork: book.coverUrl ?[{ src: book.coverUrl, sizes: '300x300', type: 'image/jpeg' }] :[] }); }

function toggleBgPlay(enable, isInit = false) {
    isBgPlayEnabled = enable;
    if (!isInit) { savedSettings.bgPlay = enable; try { localStorage.setItem('pacemakerSettings', JSON.stringify(savedSettings)); } catch(e){} saveSettingsToFirebase(); }
    document.getElementById('btn-bg-on').classList.toggle('active', enable); document.getElementById('btn-bg-off').classList.toggle('active', !enable);
    if (!enable) document.getElementById('silentAudio').pause(); else if (isTtsSpeaking && !isTtsPaused) document.getElementById('silentAudio').play().catch(()=>{});
}

function startTts() { 
    if (!paragraphsToSpeak.length) return; 
    if (isBgPlayEnabled) document.getElementById('silentAudio').play().catch(()=>{}); updateMediaSession();
    isTtsSpeaking = true; isTtsPaused = false; els.app.classList.add('hud-hidden'); 
    let targetIdx = 0; for(let i=0; i<paragraphsToSpeak.length; i++) { if(Math.floor(paragraphsToSpeak[i].offsetLeft / els.viewer.clientWidth) === currentPage) { targetIdx = i; break; } }
    currentSpeakingIndex = targetIdx; ttsCurrentPage = currentPage; showTtsControls(); speakNext(); 
}
function startTtsAtParagraph(targetP) { 
    stopTts(); if (isBgPlayEnabled) document.getElementById('silentAudio').play().catch(()=>{}); updateMediaSession();
    isTtsSpeaking = true; isTtsPaused = false; els.app.classList.add('hud-hidden'); 
    currentSpeakingIndex = paragraphsToSpeak.indexOf(targetP); ttsCurrentPage = currentPage; showTtsControls(); speakNext(); 
}
function showTtsControls() { els.titleTop.style.opacity = 0; els.ttsControls.classList.add('active'); els.ttsPauseBtn.innerHTML = svgPause; els.ttsSpeedBtn.textContent = `${speedOptions[currentSpeedIndex]}x`; }
function pauseResumeTts() {
    if(isTtsPaused) { speechSynthesis.resume(); isTtsPaused = false; els.ttsPauseBtn.innerHTML = svgPause; if (isBgPlayEnabled) document.getElementById('silentAudio').play().catch(()=>{}); } 
    else { speechSynthesis.pause(); isTtsPaused = true; els.ttsPauseBtn.innerHTML = svgPlay; document.getElementById('silentAudio').pause(); }
}
function stopTts() { 
    speechSynthesis.cancel(); isTtsSpeaking = false; isTtsPaused = false; isManualRestart = false; lastCharIndex = 0;
    paragraphsToSpeak.forEach(p => p.classList.remove('speaking')); els.ttsControls.classList.remove('active'); els.titleTop.style.opacity = 1; document.getElementById('silentAudio').pause();
}
function toggleTtsSpeed() {
    currentSpeedIndex = (currentSpeedIndex + 1) % speedOptions.length; els.ttsSpeedBtn.textContent = `${speedOptions[currentSpeedIndex]}x`;
    if (isTtsSpeaking && !isTtsPaused) { isManualRestart = true; speechSynthesis.cancel(); setTimeout(() => speakNext(true), 50); }
}
function syncTtsPage() {
    if (currentPage !== ttsCurrentPage && isTtsSpeaking) { currentPage = ttsCurrentPage; els.viewer.scrollTo({ left: currentPage * els.viewer.clientWidth, behavior: 'smooth' }); updateProgressUI(); }
}

// 안드로이드 TTS 강제 종료 방어 (14초 반복 리프레시)
function keepTtsAlive() {
    if (ttsKeepAliveTimer) clearTimeout(ttsKeepAliveTimer);
    if (isTtsSpeaking && !isTtsPaused && isBgPlayEnabled) {
        ttsKeepAliveTimer = setTimeout(() => {
            if (isTtsSpeaking && !isTtsPaused) {
                speechSynthesis.pause();
                setTimeout(() => speechSynthesis.resume(), 10);
                keepTtsAlive();
            }
        }, 14000);
    }
}

function speakNext(isReplay = false) {
    if (!isTtsSpeaking) return;
    if (!isReplay && currentSpeakingIndex >= paragraphsToSpeak.length) return stopTts();
    if (!isReplay) lastCharIndex = 0;
    
    const p = paragraphsToSpeak[currentSpeakingIndex];
    paragraphsToSpeak.forEach(x => x.classList.remove('speaking')); p.classList.add('speaking');
    
    const startPage = Math.floor(p.offsetLeft / els.viewer.clientWidth);
    if (currentPage === ttsCurrentPage || isManualRestart) {
        if(startPage !== currentPage) { currentPage = startPage; els.viewer.scrollTo({ left: currentPage * els.viewer.clientWidth, behavior: 'smooth' }); updateProgressUI(); saveProgress(); }
    }
    ttsCurrentPage = startPage;

    ttsUtterance = new SpeechSynthesisUtterance(p.textContent);
    if (selectedVoice) ttsUtterance.voice = selectedVoice;
    ttsUtterance.rate = speedOptions[currentSpeedIndex];
    
    ttsUtterance.onboundary = (e) => {
        if (e.charIndex === undefined) return; lastCharIndex = e.charIndex;
        let textNode = null; for (let i=0; i<p.childNodes.length; i++) { if (p.childNodes[i].nodeType === Node.TEXT_NODE && p.childNodes[i].textContent.trim().length > 0) { textNode = p.childNodes[i]; break; } }
        if (!textNode) return;
        try {
            const range = document.createRange(); const start = Math.min(e.charIndex, textNode.length - 1);
            let len = e.charLength || 1; if (!e.charLength) { const remaining = textNode.textContent.substring(start); const spaceIdx = remaining.indexOf(' '); len = spaceIdx > -1 ? spaceIdx : 1; }
            const end = Math.min(start + Math.max(len, 1), textNode.length); if (start >= end) return;
            range.setStart(textNode, start); range.setEnd(textNode, end);
            const rects = range.getClientRects(); if (!rects || rects.length === 0) return;
            const absoluteLeft = els.viewer.scrollLeft + (rects[0].left - els.viewer.getBoundingClientRect().left);
            const wordPage = Math.floor((absoluteLeft - 10) / els.viewer.clientWidth);
            if (wordPage >= 0 && wordPage < totalPages) {
                if (currentPage === ttsCurrentPage && wordPage !== ttsCurrentPage) { currentPage = wordPage; els.viewer.scrollTo({ left: currentPage * els.viewer.clientWidth, behavior: 'smooth' }); updateProgressUI(); }
                ttsCurrentPage = wordPage;
            }
        } catch(err) {}
    };

    ttsUtterance.onend = () => { if(isManualRestart) isManualRestart = false; else { currentSpeakingIndex++; speakNext(); } };
    ttsUtterance.onerror = () => { if(isManualRestart) isManualRestart = false; else stopTts(); };
    
    speechSynthesis.speak(ttsUtterance);
    keepTtsAlive(); // 백그라운드 무적 트릭 시작
}

function changeFontSize(delta) {
    const oldTotalPages = totalPages; const oldCurrentPage = currentPage;
    fontSize = Math.max(12, Math.min(30, fontSize + delta));
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
        savedSettings.fontSize = fontSize; try { localStorage.setItem('pacemakerSettings', JSON.stringify(savedSettings)); } catch(e) {} saveSettingsToFirebase();

    setTimeout(() => {
        calculatePages(); buildTOC(); 
        if (isTtsSpeaking && currentSpeakingIndex >= 0) {
            const p = paragraphsToSpeak[currentSpeakingIndex]; let textNode = null;
            for (let i=0; i<p.childNodes.length; i++) { if (p.childNodes[i].nodeType === Node.TEXT_NODE && p.childNodes[i].textContent.trim().length > 0) { textNode = p.childNodes[i]; break; } }
            if (textNode) {
                try {
                    const range = document.createRange(); const start = Math.min(lastCharIndex, textNode.length - 1);
                    range.setStart(textNode, start); range.setEnd(textNode, Math.min(start + 1, textNode.length));
                    const rects = range.getClientRects();
                    if (rects && rects.length > 0) { const absoluteLeft = els.viewer.scrollLeft + (rects[0].left - els.viewer.getBoundingClientRect().left); currentPage = Math.floor((absoluteLeft - 10) / els.viewer.clientWidth); } 
                    else currentPage = Math.floor(p.offsetLeft / els.viewer.clientWidth);
                } catch(e) { currentPage = Math.floor(p.offsetLeft / els.viewer.clientWidth); }
            } else currentPage = Math.floor(p.offsetLeft / els.viewer.clientWidth);
            ttsCurrentPage = currentPage;
        } else { currentPage = Math.round((oldCurrentPage / (oldTotalPages - 1 || 1)) * (totalPages - 1 || 1)); }
        
        if (currentPage < 0) currentPage = 0; if (currentPage >= totalPages) currentPage = totalPages - 1;
        els.viewer.style.scrollBehavior = 'auto'; els.viewer.scrollLeft = currentPage * els.viewer.clientWidth; els.viewer.style.scrollBehavior = 'smooth'; updateProgressUI(); saveProgress();
    }, 150);
}

function setTheme(theme, btnEl, isInit = false) {
    document.body.className = `theme-${theme}`; 
    document.querySelectorAll('.color-circle').forEach(el => { el.classList.remove('active'); if(el.dataset.theme === theme) el.classList.add('active'); });
    if (!isInit) { savedSettings.theme = theme; try { localStorage.setItem('pacemakerSettings', JSON.stringify(savedSettings)); } catch(e) {} saveSettingsToFirebase(); }
}

window.addEventListener('resize', () => { calculatePages(); els.viewer.scrollLeft = currentPage * els.viewer.clientWidth; });
if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('/Reader/sw.js').catch(err => console.log('SW 등록 실패:', err)); }); }
