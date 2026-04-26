// Audio Context setup
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

// State
let bpm = 80;
let beatsPerBar = 4;
let subdivision = 4; // default to 16th notes
let isPlaying = false;
let currentBeat = 0;
let currentSubdivisionBeat = 0;
let nextNoteTime = 0.0;
let timerID;

// Speed Trainer State
let trainerEnabled = false;
let trainerIncrement = 2;
let trainerBars = 4;
let trainerTarget = 160;
let barsPassed = 0;
let strumGuideEnabled = true;
let notesInQueue = [];

// Sound Settings State
let soundSettings = {
    firstBeat: { type: "triangle", frequency: 800, volume: 1.0, percussiveDrop: true },
    mainBeat: { type: "sine", frequency: 1000, volume: 1.0, percussiveDrop: false },
    subBeat: { type: "sine", frequency: 600, volume: 0.3, percussiveDrop: false }
};

// Fetch initial settings
fetch('/api/settings')
    .then(res => res.json())
    .then(data => {
        if(data && data.firstBeat) soundSettings = data;
    })
    .catch(err => console.error("Could not load settings", err));

// UI Elements
const bpmSlider = document.getElementById('bpmSlider');
const downBpmBtn = document.getElementById('downBpmBtn');
const upBpmBtn = document.getElementById('upBpmBtn');
const bpmText = document.getElementById('bpmText');
const beatsText = document.getElementById('beatsText');
const minusBeatsBtn = document.getElementById('minusBeatsBtn');
const plusBeatsBtn = document.getElementById('plusBeatsBtn');
const playBtn = document.getElementById('playBtn');
const indicatorsContainer = document.getElementById('indicators');

// New UI Elements
const subdivisionSelect = document.getElementById('subdivisionSelect');
const trainerToggle = document.getElementById('trainerToggle');
const trainerSettings = document.getElementById('trainerSettings');
const trainerIncrementInput = document.getElementById('trainerIncrement');
const trainerBarsInput = document.getElementById('trainerBars');
const trainerTargetInput = document.getElementById('trainerTarget');
const strumToggle = document.getElementById('strumToggle');
const strumText = document.getElementById('strumText');

// Modal UI Elements
const settingsModal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');

const DEFAULT_SETTINGS = {
    firstBeat: { type: "triangle", frequency: 800, volume: 1.0, percussiveDrop: true },
    mainBeat: { type: "sine", frequency: 1000, volume: 1.0, percussiveDrop: false },
    subBeat: { type: "sine", frequency: 600, volume: 0.3, percussiveDrop: false }
};

// Initialize visual indicators
function setupIndicators() {
    indicatorsContainer.innerHTML = '';
    for (let i = 0; i < beatsPerBar; i++) {
        const ind = document.createElement('div');
        ind.className = 'indicator';
        indicatorsContainer.appendChild(ind);
    }
}
setupIndicators();

// Scheduler functions
function scheduleNote(beatNumber, subBeatNumber, time) {
    // Queue note for precise visual synchronization
    notesInQueue.push({ beat: beatNumber, subBeat: subBeatNumber, time: time });

    // Audio playback
    if (!audioCtx) audioCtx = new AudioContext();
    
    const osc = audioCtx.createOscillator();
    const envelope = audioCtx.createGain();
    
    osc.connect(envelope);
    envelope.connect(audioCtx.destination);

    function applySoundSetting(setting) {
        osc.type = setting.type;
        osc.frequency.setValueAtTime(setting.frequency, time);
        
        if (setting.percussiveDrop) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(50, setting.frequency * 0.375), time + 0.015);
            envelope.gain.setValueAtTime(setting.volume, time);
            envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
            return 0.03; // Duration
        } else {
            envelope.gain.setValueAtTime(setting.volume, time);
            envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
            return 0.05; // Duration
        }
    }
    
    let duration = 0.05;
    if (beatNumber === 0 && subBeatNumber === 0) {
        duration = applySoundSetting(soundSettings.firstBeat);
    } else if (subBeatNumber === 0) {
        duration = applySoundSetting(soundSettings.mainBeat);
    } else {
        duration = applySoundSetting(soundSettings.subBeat);
    }
    
    osc.start(time);
    osc.stop(time + duration);
}

function nextNote() {
    const secondsPerBeat = 60.0 / bpm;
    const secondsPerSubdivision = secondsPerBeat / subdivision;
    
    nextNoteTime += secondsPerSubdivision;
    currentSubdivisionBeat++;
    
    if (currentSubdivisionBeat === subdivision) {
        currentSubdivisionBeat = 0;
        currentBeat++;
        
        if (currentBeat === beatsPerBar) {
            currentBeat = 0;
            barsPassed++;
            
            // Speed Trainer Logic
            if (trainerEnabled && barsPassed >= trainerBars) {
                barsPassed = 0;
                if (bpm < trainerTarget) {
                    bpm = Math.min(bpm + trainerIncrement, trainerTarget);
                    bpmText.textContent = bpm;
                    bpmSlider.value = bpm;
                }
            }
        }
    }
}

function scheduler() {
    // Schedule notes further ahead than browser timer interval to ensure no skips
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        scheduleNote(currentBeat, currentSubdivisionBeat, nextNoteTime);
        nextNote();
    }
    timerID = setTimeout(scheduler, 25.0);
}

// Visual drawing loop
function draw() {
    requestAnimationFrame(draw);
    if (!isPlaying || !audioCtx) return;

    let currentTime = audioCtx.currentTime;

    // Process all notes whose time has come
    while (notesInQueue.length && notesInQueue[0].time <= currentTime + 0.01) {
        let currentNote = notesInQueue[0];
        notesInQueue.splice(0, 1); // remove from queue

        let b = currentNote.beat;
        let s = currentNote.subBeat;

        const indicators = document.querySelectorAll('.indicator');
        indicators.forEach(ind => ind.className = 'indicator'); 
        
        if (b === 0 && s === 0) {
            if (indicators[b]) indicators[b].classList.add('accent');
        } else if (s === 0) {
            if (indicators[b]) indicators[b].classList.add('active');
        } else {
            if (indicators[b]) indicators[b].classList.add('sub-active');
        }
        
        // Strum direction
        if (strumGuideEnabled) {
            if (s % 2 === 0) {
                strumText.textContent = '⬇ DOWN';
                strumText.className = 'down';
            } else {
                strumText.textContent = '⬆ UP';
                strumText.className = 'up';
            }
        }
        
        // Remove pulse quickly
        setTimeout(() => {
            if(isPlaying && indicators[b]) {
                indicators[b].className = 'indicator';
            }
        }, 60);
    }
}
draw();

// Controls
function togglePlay() {
    if (isPlaying) {
        isPlaying = false;
        clearTimeout(timerID);
        playBtn.textContent = 'PLAY';
        playBtn.classList.remove('playing');
        
        // Reset visuals
        const indicators = document.querySelectorAll('.indicator');
        indicators.forEach(ind => ind.className = 'indicator');
        strumText.textContent = '-';
        strumText.className = '';
        notesInQueue = [];
    } else {
        if (!audioCtx) audioCtx = new AudioContext();
        if(audioCtx.state === 'suspended') audioCtx.resume();
        
        isPlaying = true;
        currentBeat = 0;
        currentSubdivisionBeat = 0;
        barsPassed = 0;
        notesInQueue = [];
        nextNoteTime = audioCtx.currentTime + 0.05;
        playBtn.textContent = 'STOP';
        playBtn.classList.add('playing');
        scheduler();
    }
}

// Event Listeners
bpmSlider.addEventListener('input', (e) => {
    bpm = parseInt(e.target.value);
    bpmText.textContent = bpm;
});

downBpmBtn.addEventListener('click', () => {
    if (bpm > 30) {
        bpm--;
        bpmText.textContent = bpm;
        bpmSlider.value = bpm;
    }
});

upBpmBtn.addEventListener('click', () => {
    if (bpm < 300) {
        bpm++;
        bpmText.textContent = bpm;
        bpmSlider.value = bpm;
    }
});

minusBeatsBtn.addEventListener('click', () => {
    if (beatsPerBar > 1) {
        beatsPerBar--;
        beatsText.textContent = `${beatsPerBar}/4`;
        setupIndicators();
        if(isPlaying) {
            currentBeat = 0;
            currentSubdivisionBeat = 0;
        }
    }
});

plusBeatsBtn.addEventListener('click', () => {
    if (beatsPerBar < 12) {
        beatsPerBar++;
        beatsText.textContent = `${beatsPerBar}/4`;
        setupIndicators();
        if(isPlaying) {
            currentBeat = 0;
            currentSubdivisionBeat = 0;
        }
    }
});

subdivisionSelect.addEventListener('change', (e) => {
    subdivision = parseInt(e.target.value);
    if(isPlaying) currentSubdivisionBeat = 0;
});

trainerToggle.addEventListener('change', (e) => {
    trainerEnabled = e.target.checked;
    trainerSettings.style.display = trainerEnabled ? 'block' : 'none';
    if(trainerEnabled) barsPassed = 0;
});

trainerIncrementInput.addEventListener('input', (e) => {
    trainerIncrement = parseInt(e.target.value) || 1;
});

trainerBarsInput.addEventListener('input', (e) => {
    trainerBars = parseInt(e.target.value) || 1;
});

trainerTargetInput.addEventListener('input', (e) => {
    trainerTarget = parseInt(e.target.value) || 30;
});

strumToggle.addEventListener('change', (e) => {
    strumGuideEnabled = e.target.checked;
    const strumIndicator = document.getElementById('strumIndicator');
    strumIndicator.style.display = strumGuideEnabled ? 'flex' : 'none';
    if (!strumGuideEnabled) {
        strumText.textContent = '-';
        strumText.className = '';
    }
});

// Settings Modal Listeners
function populateSettingsForm() {
    document.getElementById('fbType').value = soundSettings.firstBeat.type;
    document.getElementById('fbFreq').value = soundSettings.firstBeat.frequency;
    document.getElementById('fbVol').value = soundSettings.firstBeat.volume;
    document.getElementById('fbDrop').checked = soundSettings.firstBeat.percussiveDrop;

    document.getElementById('mbType').value = soundSettings.mainBeat.type;
    document.getElementById('mbFreq').value = soundSettings.mainBeat.frequency;
    document.getElementById('mbVol').value = soundSettings.mainBeat.volume;
    document.getElementById('mbDrop').checked = soundSettings.mainBeat.percussiveDrop;

    document.getElementById('sbType').value = soundSettings.subBeat.type;
    document.getElementById('sbFreq').value = soundSettings.subBeat.frequency;
    document.getElementById('sbVol').value = soundSettings.subBeat.volume;
    document.getElementById('sbDrop').checked = soundSettings.subBeat.percussiveDrop;
}

settingsBtn.addEventListener('click', () => {
    populateSettingsForm();
    settingsModal.classList.add('show');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('show');
});

resetSettingsBtn.addEventListener('click', () => {
    soundSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    populateSettingsForm();
});

saveSettingsBtn.addEventListener('click', () => {
    soundSettings.firstBeat = {
        type: document.getElementById('fbType').value,
        frequency: parseFloat(document.getElementById('fbFreq').value),
        volume: parseFloat(document.getElementById('fbVol').value),
        percussiveDrop: document.getElementById('fbDrop').checked
    };
    soundSettings.mainBeat = {
        type: document.getElementById('mbType').value,
        frequency: parseFloat(document.getElementById('mbFreq').value),
        volume: parseFloat(document.getElementById('mbVol').value),
        percussiveDrop: document.getElementById('mbDrop').checked
    };
    soundSettings.subBeat = {
        type: document.getElementById('sbType').value,
        frequency: parseFloat(document.getElementById('sbFreq').value),
        volume: parseFloat(document.getElementById('sbVol').value),
        percussiveDrop: document.getElementById('sbDrop').checked
    };

    fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(soundSettings)
    }).then(() => {
        settingsModal.classList.remove('show');
    }).catch(err => console.error("Failed to save", err));
});

playBtn.addEventListener('click', togglePlay);

// Keyboard control
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
    }
});
