// p5.js is loaded in instance mode.
// We also use Leaflet (L) for the map if selected.

const sketch = (p) => {
    let trackGraphics; // Buffer for tornado tracks
    let backgroundLayer = null; // Either an image or null (if using OSM)
    let tornadoes = [];
    let pathPoints = []; 
    
    // Map State
    let mapMode = 'none'; // 'osm' or 'image'
    let leafletMap = null;
    let isMapLocked = false; // For OSM mode: true means ready to spawn tornadoes

    const tornadoSettings = {
        minSpeed: 40,
        maxSpeed: 1000, 
        detectionRadius: 20, 
        ef6Chance: 0.01,
        maxSpawnWind: 200
    };

    let clockInterval = null;
    let currentTimeInMinutes = 0;
    let totalCasualties = 0;

    // UI elements
    const ui = {
        startScreen: document.getElementById('start-screen'),
        btnOSM: document.getElementById('btn-osm'),
        fileUpload: document.getElementById('file-upload'),
        lockOverlay: document.getElementById('lock-overlay'),
        lockBtn: document.getElementById('lock-map-btn'),
        osmContainer: document.getElementById('osm-map'),
        canvasContainer: document.getElementById('canvas-container'),

        clockTime: document.getElementById('clock-time'),
        
        tornado1: {
            container: document.getElementById('tornado-1-stats'),
            windSpeed: document.getElementById('wind-speed-1'),
            efScale: document.getElementById('ef-scale-1'),
            maxWindSpeed: document.getElementById('max-wind-speed-1'),
            maxWidth: document.getElementById('max-width-1')
        },
        tornado2: {
            container: document.getElementById('tornado-2-stats'),
            windSpeed: document.getElementById('wind-speed-2'),
            efScale: document.getElementById('ef-scale-2'),
            maxWindSpeed: document.getElementById('max-wind-speed-2'),
            maxWidth: document.getElementById('max-width-2')
        },

        totalCasualties: document.getElementById('total-casualties'),
        citiesHitList: document.getElementById('cities-hit'),
        resetBtn: document.getElementById('reset-btn'),
        pathWobbleSlider: document.getElementById('path-wobble'),

        // Manual controls
        customWindInput: document.getElementById('custom-wind'),
        customWidthInput: document.getElementById('custom-width'),
        clearManualBtn: document.getElementById('clear-manual-btn'),
        
        pathEditCheckbox: document.getElementById('path-edit-mode'),
        clearPathBtn: document.getElementById('clear-path-btn'),
        maxEFSelect: document.getElementById('max-ef')
    };

    let simulationRunning = false;

    // --- SETUP ---
    p.setup = () => {
        p.pixelDensity(1);
        const cnv = p.createCanvas(800, 600);
        cnv.parent('canvas-container');
        trackGraphics = p.createGraphics(p.width, p.height);
        
        // Initial State: Show Start Screen
        ui.startScreen.style.display = 'flex';
        
        // Event Listeners for Start Screen
        ui.btnOSM.onclick = initOSMMode;
        ui.fileUpload.onchange = initImageMode;

        // General Controls
        ui.resetBtn.onclick = () => {
            // Full reload to reset map choice
            location.reload();
        };

        ui.clearManualBtn.onclick = () => {
            tornadoes = [];
            trackGraphics.clear();
            simulationRunning = false;
            updateInfoPanel();
        };

        ui.clearPathBtn.onclick = () => {
            pathPoints = [];
        };

        // Lock Map Button (OSM only)
        ui.lockBtn.onclick = () => {
            if (!leafletMap) return;
            isMapLocked = true;
            leafletMap.dragging.disable();
            leafletMap.touchZoom.disable();
            leafletMap.doubleClickZoom.disable();
            leafletMap.scrollWheelZoom.disable();
            leafletMap.boxZoom.disable();
            leafletMap.keyboard.disable();
            if (leafletMap.tap) leafletMap.tap.disable();
            
            ui.lockOverlay.style.display = 'none';
            ui.canvasContainer.classList.add('active'); // Enable pointer events on canvas
            startClock();
        };

        // Click Handler for Canvas (Spawning & Path)
        p.canvas.addEventListener('click', (ev) => {
            // If OSM mode and map not locked, do nothing (pass click to map)
            if (mapMode === 'osm' && !isMapLocked) return;

            const rect = p.canvas.getBoundingClientRect();
            const x = (ev.clientX - rect.left) * (p.width / rect.width);
            const y = (ev.clientY - rect.top) * (p.height / rect.height);

            // Path Mode
            if (ui.pathEditCheckbox.checked) {
                pathPoints.push({ x, y });
                return;
            }

            // Spawn Tornado
            spawnTornado(x, y);
        });
    };

    function initOSMMode() {
        mapMode = 'osm';
        ui.startScreen.style.display = 'none';
        ui.osmContainer.style.display = 'block';
        ui.lockOverlay.style.display = 'block';
        
        // Initialize Leaflet
        leafletMap = L.map('osm-map').setView([39.8283, -98.5795], 4); // Center of USA
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(leafletMap);
        
        // Canvas remains transparent (no background)
        trackGraphics.clear();
    }

    function initImageMode(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;

        mapMode = 'image';
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            backgroundLayer = p.loadImage(url); // Load into p5
            ui.startScreen.style.display = 'none';
            ui.osmContainer.style.display = 'none'; // Hide OSM div
            ui.canvasContainer.classList.add('active'); // Enable interaction immediately
            startClock();
        };
        img.src = url;
    }

    function spawnTornado(x, y) {
        const wind = parseFloat(ui.customWindInput.value) || 120;
        const widthMiles = parseFloat(ui.customWidthInput.value) || 0.8;
        const widthPx = p.constrain(widthMiles * 10, 2, 50);

        const t = new Tornado();
        t.pos = p.createVector(x, y);
        t.prevPos = t.pos.copy();
        t.windspeed = wind;
        t.maxWindspeed = wind;
        t.renderWidth = widthPx;
        t.lifespan = 2000;
        
        if (pathPoints.length > 0) {
            t.setPath(pathPoints);
        }

        tornadoes.push(t);
        simulationRunning = true;
        
        if (tornadoes.length > 1) {
            ui.tornado2.container.style.display = 'block';
        }
    }

    function startClock() {
        if (clockInterval) clearInterval(clockInterval);
        currentTimeInMinutes = 12 * 60; // Start at 12:00
        updateClockDisplay();
        clockInterval = setInterval(() => {
            currentTimeInMinutes = (currentTimeInMinutes + 1) % (24 * 60);
            updateClockDisplay();
        }, 1000);
    }

    // --- DRAW LOOP ---
    p.draw = () => {
        p.clear(); // Clear main canvas

        // If Image Mode, draw the background image
        if (mapMode === 'image' && backgroundLayer) {
            p.image(backgroundLayer, 0, 0, p.width, p.height);
        }
        // If OSM Mode, background is transparent (Leaflet is behind), 
        // but we assume the map is locked when drawing tracks to avoid syncing issues.

        p.image(trackGraphics, 0, 0); // Draw tracks

        drawPath();

        // Update and Draw Tornadoes
        if (simulationRunning) {
            let anyAlive = false;
            for (const t of tornadoes) {
                if (t.isAlive) {
                    t.update();
                    t.draw();
                    anyAlive = true;
                }
            }
            simulationRunning = anyAlive;
        }

        updateInfoPanel();
    };

    function drawPath() {
        if (!pathPoints || pathPoints.length === 0) return;
        p.push();
        p.stroke(0, 150, 200);
        p.strokeWeight(2);
        p.noFill();
        p.beginShape();
        for (const pt of pathPoints) {
            p.vertex(pt.x, pt.y);
        }
        p.endShape();
        p.noStroke();
        p.fill(0, 150, 200);
        for (const pt of pathPoints) {
            p.ellipse(pt.x, pt.y, 8, 8);
        }
        p.pop();
    }

    function updateClockDisplay() {
        const hours = Math.floor(currentTimeInMinutes / 60);
        const minutes = currentTimeInMinutes % 60;
        ui.clockTime.textContent = `${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}`;
    }

    function updateInfoPanel() {
        // Only handling casualties if we had cities, but cities are removed.
        // We keep the logic simple or just show 0 to prevent errors.
        ui.totalCasualties.textContent = "N/A (No Cities)";
        
        // Update Tornado Stats
        const uiTornadoes = [ui.tornado1, ui.tornado2];
        tornadoes.forEach((t, index) => {
            if (index >= uiTornadoes.length) return;
            const tUI = uiTornadoes[index];
            
            if (t.isAlive) {
                tUI.windSpeed.textContent = t.windspeed.toFixed(0);
                const ef = t.getEFScaleInfo();
                tUI.efScale.textContent = ef.name;
                tUI.efScale.style.color = ef.color;
            } else {
                tUI.windSpeed.textContent = '0';
                tUI.efScale.textContent = 'Dissipated';
                tUI.efScale.style.color = '#888';
            }
            tUI.maxWindSpeed.textContent = t.maxWindspeed.toFixed(0);
            tUI.maxWidth.textContent = (t.renderWidth * 0.1).toFixed(2);
        });

        if (tornadoes.length < 2) {
             const tUI = ui.tornado2;
             tUI.windSpeed.textContent = '--';
             tUI.efScale.textContent = '--';
             tUI.efScale.style.color = '#000';
             tUI.maxWindSpeed.textContent = '--';
             tUI.maxWidth.textContent = '--';
        }
    }

    class Tornado {
        constructor() {
            this.pos = p.createVector(0,0);
            this.prevPos = p.createVector(0,0);
            this.time = p.random(1000);
            this.windTime = p.random(2000);
            this.windspeed = 0;
            this.efInfo = {};
            this.lifespan = 2000;
            this.isAlive = true;
            this.maxWindspeed = 0;
            this.maxWidth = 0;
            this.potentialMaxWind = 0;
            this.baseAngle = -p.PI / 4; 
            this.renderWidth = 10;
            this.followPath = false;
            this.path = [];
            this.pathIndex = 0;

            // Apply max EF cap logic
            const efCap = parseInt((ui.maxEFSelect && ui.maxEFSelect.value) || '6', 10);
            const efCapToWind = { 6: 1000, 5: 450, 4: 200, 3: 166, 2: 136, 1: 111, 0: 86 };
            this.capWind = efCapToWind[efCap] || 1000;
        }

        setPath(pts) {
            this.path = pts.map(p => ({ x: p.x, y: p.y }));
            this.pathIndex = 0;
            this.followPath = true;
            // set initial angle towards first point
            const target = this.path[0];
            const dx = target.x - this.pos.x;
            const dy = target.y - this.pos.y;
            this.baseAngle = Math.atan2(dy, dx);
        }

        update() {
            if (!this.isAlive) return;
            this.lifespan--;
            if (this.lifespan <= 0) { this.isAlive = false; return; }

            this.prevPos.set(this.pos);

            // Movement Logic
            if (this.followPath && this.path.length > 0) {
                const target = this.path[this.pathIndex];
                const dx = target.x - this.pos.x;
                const dy = target.y - this.pos.y;
                const dist = Math.hypot(dx, dy);
                const angle = Math.atan2(dy, dx);
                
                // Add wobble
                const wobble = parseFloat(ui.pathWobbleSlider.value);
                const angleVar = (p.noise(this.time) - 0.5) * p.PI * wobble;
                
                const speed = 1.5; // Constant speed for following path
                this.pos.x += Math.cos(angle + angleVar) * speed;
                this.pos.y += Math.sin(angle + angleVar) * speed;

                if (dist < 10) {
                    this.pathIndex++;
                    if (this.pathIndex >= this.path.length) this.isAlive = false;
                }
            } else {
                // Free roam (Northeast default)
                this.baseAngle = -p.PI / 4; 
                const wobble = parseFloat(ui.pathWobbleSlider.value);
                const angleVar = (p.noise(this.time) - 0.5) * p.PI * wobble;
                const speed = 1.5;
                this.pos.x += Math.cos(this.baseAngle + angleVar) * speed;
                this.pos.y += Math.sin(this.baseAngle + angleVar) * speed;
            }

            this.time += 0.01;
            
            // Wind Logic
            this.windTime += 0.02;
            let windNoise = p.noise(this.windTime); // 0..1
            // Simple fluctuation logic around the set max windspeed
            // The tornado tries to maintain the custom wind speed set by user but fluctuates
            let targetWind = this.maxWindspeed;
            
            // Apply fluctuation
            let currentWind = targetWind * p.map(windNoise, 0, 1, 0.7, 1.1);
            
            // Fade out at end of life
            if (this.lifespan < 200) {
                currentWind *= (this.lifespan / 200);
            }

            // Cap it
            this.windspeed = Math.min(currentWind, this.capWind);
            this.efInfo = this.getEFScaleInfo();

            this.drawTrack();
            
            // Check bounds
            if (this.pos.x < -50 || this.pos.x > p.width+50 || this.pos.y < -50 || this.pos.y > p.height+50) {
                this.isAlive = false;
            }
        }

        drawTrack() {
            if (this.windspeed < 10) return;
            trackGraphics.stroke(this.efInfo.color);
            trackGraphics.strokeWeight(this.renderWidth);
            // Low alpha for "track" look
            const c = p.color(this.efInfo.color);
            c.setAlpha(150);
            trackGraphics.stroke(c);
            trackGraphics.line(this.prevPos.x, this.prevPos.y, this.pos.x, this.pos.y);
        }

        draw() {
            p.push();
            p.translate(this.pos.x, this.pos.y);
            // Visual funnel size based on width
            const size = this.renderWidth * 3; 
            p.noStroke();
            p.fill(50, 50, 50, 180);
            p.ellipse(0, 0, size, size);
            p.fill(0, 0, 0, 200);
            p.ellipse(0, 0, size * 0.4, size * 0.4);
            p.pop();
        }

        getEFScaleInfo() {
            const ws = this.windspeed;
            if (ws > 319) return { name: 'EF6', color: '#4B0082' };
            if (ws >= 201) return { name: 'EF5', color: '#800080' };
            if (ws >= 166) return { name: 'EF4', color: '#FF0000' };
            if (ws >= 136) return { name: 'EF3', color: '#FFA500' };
            if (ws >= 111) return { name: 'EF2', color: '#FFFF00' };
            if (ws >= 86) return { name: 'EF1', color: '#008000' };
            if (ws >= 65) return { name: 'EF0', color: '#00FFFF' };
            return { name: 'Sub-EF0', color: '#cccccc' };
        }
    }
};

new p5(sketch);