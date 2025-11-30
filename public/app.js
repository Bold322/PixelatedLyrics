const API_BASE = '/api';

// State
let currentVideoId = null;
let pollInterval = null;
let syncInterval = null;
let audioContext = null;

// Elements
const sections = {
    input: document.getElementById('inputSection'),
    config: document.getElementById('configSection'),
    dashboard: document.getElementById('dashboardSection')
};

const inputs = {
    url: document.getElementById('urlInput'),
    checkBtn: document.getElementById('checkBtn'),
    languagesList: document.getElementById('languagesList'),
    startBtn: document.getElementById('startBtn'),
    backBtn: document.getElementById('backBtn'),
    exitBtn: document.getElementById('exitBtn')
};

const display = {
    status: document.getElementById('statusText'),
    progress: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    preview: document.getElementById('previewImage'),
    placeholder: document.getElementById('previewPlaceholder'),
    time: document.getElementById('timeDisplay'),
    audio: document.getElementById('audioPlayer'),
    error: document.getElementById('errorMsg')
};

// Event Listeners
inputs.checkBtn.addEventListener('click', checkVideo);
inputs.startBtn.addEventListener('click', startGeneration);
inputs.backBtn.addEventListener('click', () => showSection('input'));
inputs.exitBtn.addEventListener('click', exitProject);

// Click on preview to play/pause
document.querySelector('.preview-wrapper').addEventListener('click', () => {
    if (display.audio.src) {
        const audio = display.audio;
        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
    }
});

// Keyboard Controls
document.addEventListener('keydown', (e) => {
    if (sections.dashboard.classList.contains('hidden')) return;
    
    const audio = display.audio;
    if (!audio.src) return;

    // Space: Play/Pause
    if (e.code === 'Space') {
        e.preventDefault();
        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
    }
    
    // Arrow keys: Seek
    if (e.code === 'ArrowRight') {
        e.preventDefault();
        audio.currentTime = Math.min(audio.currentTime + 5, audio.duration);
        syncFrame();
    }
    if (e.code === 'ArrowLeft') {
        e.preventDefault();
        audio.currentTime = Math.max(audio.currentTime - 5, 0);
        syncFrame();
    }
    
    // F: Toggle fullscreen
    if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
    }
    
    // ESC: Exit fullscreen
    if (e.code === 'Escape') {
        const container = document.querySelector('.preview-container');
        if (container.classList.contains('fullscreen')) {
            e.preventDefault();
            container.classList.remove('fullscreen');
        }
    }
});

// Functions
function showSection(name) {
    Object.values(sections).forEach(s => {
        s.classList.add('hidden');
        s.classList.remove('active');
    });
    sections[name].classList.remove('hidden');
    sections[name].classList.add('active');
}

async function checkVideo() {
    const url = inputs.url.value.trim();
    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }

    showError('');
    inputs.checkBtn.disabled = true;
    inputs.checkBtn.textContent = 'Checking...';

    try {
        const res = await fetch('/api/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        currentVideoId = data.videoId;
        
        // Render languages
        inputs.languagesList.innerHTML = '';
        if (data.languages.length === 0) {
            inputs.languagesList.innerHTML = '<p style="color: #ff6b6b;">No manual subtitles available for this video. Only videos with manually uploaded captions are supported.</p>';
            return;
        }

        // Sort: preferred first
        const preferred = ['mn', 'en', 'ja', 'ko', 'ru'];
        data.languages.sort((a, b) => {
            const aIdx = preferred.findIndex(p => a.code.startsWith(p));
            const bIdx = preferred.findIndex(p => b.code.startsWith(p));
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return 0;
        });

        data.languages.forEach(lang => {
            const div = document.createElement('div');
            div.className = 'language-item';
            div.textContent = `${lang.code} - ${lang.name}`;
            div.dataset.code = lang.code; // Store the code in data attribute
            
            // Auto-select preferred languages
            if (preferred.some(p => lang.code.startsWith(p))) {
                div.classList.add('selected');
            }
            
            div.addEventListener('click', () => {
                div.classList.toggle('selected');
            });
            
            inputs.languagesList.appendChild(div);
        });

        // Check if already has state
        if (data.state && data.state.status !== 'idle') {
            restoreState(data.state);
        } else {
            showSection('config');
        }
    } catch (err) {
        showError(err.message);
    } finally {
        inputs.checkBtn.disabled = false;
        inputs.checkBtn.textContent = 'Check Video';
    }
}

async function startGeneration() {
    const selected = Array.from(document.querySelectorAll('.language-item.selected'));
    if (selected.length === 0) {
        showError('Please select at least one language');
        return;
    }

    // Get language codes from data attribute, not text content
    const languages = selected.map(el => el.dataset.code);

    try {
        // Configure
        await fetch('/api/configure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                videoId: currentVideoId, 
                languages,
                config: {
                    width: 1920,
                    height: 1080,
                    fps: 30,
                    fontSize: 72,
                    textColor: '#FFFFFF',
                    backgroundColor: '#000000'
                }
            })
        });

        // Start
        await fetch('/api/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId: currentVideoId })
        });

        showSection('dashboard');
        startPolling();
    } catch (error) {
        showError(error.message);
    }
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/status?videoId=${currentVideoId}`);
            const state = await res.json();
            updateDashboard(state);
            
            if (state.status === 'completed' || state.status === 'error') {
                clearInterval(pollInterval);
            }
        } catch (err) {
            console.error('Poll error:', err);
        }
    }, 1000);
}

function updateDashboard(state) {
    display.status.textContent = state.status.toUpperCase();
    display.progress.style.width = `${state.progress}%`;
    display.progressText.textContent = `${state.progress}%`;

    if (state.status === 'generating' || state.status === 'completed') {
        // Setup audio if not already
        if (!display.audio.src) {
            display.audio.src = `/${state.videoId}/audio.webm?t=${Date.now()}`;
            display.audio.load();
            startSync();
        }
        
        // Auto-play and auto-fullscreen when completed
        if (state.status === 'completed' && display.audio.paused) {
            // Auto-play
            display.audio.play().catch(err => {
                console.log('Auto-play prevented, click to play');
            });
            
            // Auto-enter CSS fullscreen
            const container = document.querySelector('.preview-container');
            if (!container.classList.contains('fullscreen')) {
                container.classList.add('fullscreen');
            }
        }
    }
    
    // Show error if present
    if (state.error) {
        display.status.textContent = `ERROR: ${state.error}`;
    }
}

function startSync() {
    if (syncInterval) cancelAnimationFrame(syncInterval);
    
    const loop = () => {
        syncFrame();
        syncInterval = requestAnimationFrame(loop);
    };
    syncInterval = requestAnimationFrame(loop);
}

// Image cache
const imageCache = new Map();
const PRELOAD_COUNT = 30;

function preloadFrames(startFrame) {
    if (!currentVideoId) return;
    
    for (let i = 1; i <= PRELOAD_COUNT; i++) {
        const frameNum = startFrame + i;
        if (!imageCache.has(frameNum)) {
            const img = new Image();
            img.src = `/${currentVideoId}/frames/frame_${String(frameNum).padStart(8, '0')}.png`;
            imageCache.set(frameNum, img);
            
            // Cleanup
            if (imageCache.size > PRELOAD_COUNT * 2) {
                const keys = Array.from(imageCache.keys()).sort((a, b) => a - b);
                if (keys.length > 0 && keys[0] < startFrame - 10) {
                    imageCache.delete(keys[0]);
                }
            }
        }
    }
}

function syncFrame() {
    const audio = display.audio;
    if (!audio || !audio.duration || !currentVideoId) return;

    const fps = 30;
    const currentTime = audio.currentTime;
    const frameNum = Math.floor(currentTime * fps) + 1;

    // Update time display
    const mins = Math.floor(currentTime / 60);
    const secs = Math.floor(currentTime % 60);
    display.time.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    // Update image - use video ID in path
    const frameUrl = `/${currentVideoId}/frames/frame_${String(frameNum).padStart(8, '0')}.png`;
    
    if (imageCache.has(frameNum) && imageCache.get(frameNum).complete) {
        display.preview.src = imageCache.get(frameNum).src;
    } else {
        display.preview.src = frameUrl;
    }
    
    display.preview.style.display = 'block';
    display.placeholder.style.display = 'none';
    
    preloadFrames(frameNum);
}

function restoreState(state) {
    currentVideoId = state.videoId;
    showSection('dashboard');
    startPolling();
    updateDashboard(state);
}

function exitProject() {
    if (pollInterval) clearInterval(pollInterval);
    if (syncInterval) cancelAnimationFrame(syncInterval);
    display.audio.pause();
    display.audio.src = '';
    display.preview.src = '';
    currentVideoId = null;
    inputs.url.value = '';
    
    // Exit fullscreen if active
    const container = document.querySelector('.preview-container');
    if (container.classList.contains('fullscreen')) {
        container.classList.remove('fullscreen');
    }
    
    showSection('input');
}

function toggleFullscreen() {
    const container = document.querySelector('.preview-container');
    
    if (!container.classList.contains('fullscreen')) {
        container.classList.add('fullscreen');
    } else {
        container.classList.remove('fullscreen');
    }
}

function showError(msg) {
    display.error.textContent = msg;
    setTimeout(() => {
        display.error.textContent = '';
    }, 5000);
}
