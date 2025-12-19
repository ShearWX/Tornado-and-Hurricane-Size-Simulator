// p5.js is loaded in instance mode to keep the global scope clean.
// All p5.js functions are accessed through the `p` object.

const sketch = (p) => {
    let mapGraphics; // p5.Graphics buffer for the map
    let trackGraphics; // p5.Graphics buffer for the tornado track
    let mapBackgroundImage = null; // optional uploaded image to use instead of procedural map
    let cities = [];
    let tornadoes = [];
    let pathPoints = []; // user-created path waypoints (in pixels)
    
    // Using objects for settings to keep them organized
    const mapSettings = {
        noiseScale: 0.015,
        landThreshold: 0.35, // Noise value above which is land
        mountainThreshold: 0.65,
        numCities: 15,
        cityNames: [
            // Original 15
            "Springfield", "Shelbyville", "Greenville", "Pleasantville", "Centerville", "Riverside", "Oakdale", "Maple Creek", "Fairview", "Liberty", "New Hope", "Old Town", "Westwood", "Eastwood", "Northwood",
            // 40 New Cities
            "Phoenix", "Denver", "Jacksonville", "Chicago", "Indianapolis", "Wichita", "Louisville", "New Orleans", "Baltimore", "Boston", "Detroit", "Minneapolis", "Kansas City", "St. Louis", "Omaha",
            "Albuquerque", "Charlotte", "Columbus", "Oklahoma City", "Portland", "Philadelphia", "Memphis", "Nashville", "Austin", "Dallas", "Houston", "San Antonio", "Salt Lake City", "Richmond", "Seattle",
            "Milwaukee", "Atlanta", "Boise", "Des Moines", "Little Rock", "Cheyenne", "Fargo", "Sioux Falls", "Billings", "Casper"
        ]
    };

    const tornadoSettings = {
        minSpeed: 40,  // mph
        maxSpeed: 1000, // mph - baseline max used for normal mapping (changed to 1000)
        detectionRadius: 20, // How close to a city to "hit" it
        dualTornadoChance: 0.05, // 5% chance for a second tornado
        ef6Chance: 0.01, // 1% chance to reach EF6+
        maxSpawnWind: 200 // maximum windspeed (mph) a tornado can spawn with by default
    };

    let clockInterval = null;
    let currentTimeInMinutes = 0;
    let totalCasualties = 0;

    // UI elements
    const ui = {
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
        newSimBtn: document.getElementById('new-sim-btn'),
        newMapBtn: document.getElementById('new-map-btn'),
        pathWobbleSlider: document.getElementById('path-wobble'),

        // Manual tornado UI
        manualModeCheckbox: document.getElementById('manual-mode'),
        customWindInput: document.getElementById('custom-wind'),
        customWidthInput: document.getElementById('custom-width'),
        addTornadoBtn: document.getElementById('add-tornado-btn'),
        clearManualBtn: document.getElementById('clear-manual-btn'),

        // Map editor & EF cap
        mapEditorModeCheckbox: document.getElementById('map-editor-mode'),
        terrainTypeSelect: document.getElementById('terrain-type'),
        paintTerrainBtn: document.getElementById('paint-terrain-btn'),
        addCityModeBtn: document.getElementById('add-city-mode-btn'),
        drawRoadModeBtn: document.getElementById('draw-road-mode-btn'),
        clearEditorBtn: document.getElementById('clear-editor-btn'),
        cityNameInput: document.getElementById('city-name-input'),
        mapUploadInput: document.getElementById('map-upload'),
        maxEFSelect: document.getElementById('max-ef')
    };

    let simulationRunning = true;
    let outbreakInterval = null;
    let outbreakRemaining = 0;
    const outbreakSettings = {
        chancePerSim: 0.01, // 1.% chance each new simulation
        spawnIntervalMs: 1000,
        minCount: 30,
        maxCount: 100
    };

    // p5.js setup function
    p.setup = () => {
        // Ensure consistent rendering size across devices by forcing pixelDensity to 1
        p.pixelDensity(1);
        p.createCanvas(800, 600).parent('canvas-container');
        mapGraphics = p.createGraphics(p.width, p.height);
        trackGraphics = p.createGraphics(p.width, p.height);
        
        newMap();

        ui.newSimBtn.onclick = resetSimulation;
        ui.newMapBtn.onclick = newMap;

        // Manual tornado handlers
        ui.addTornadoBtn.onclick = () => {
            const wind = parseFloat(ui.customWindInput.value) || 120;
            // customWidth input now interpreted as miles; convert to px (1 px = 0.1 miles)
            const widthMiles = parseFloat(ui.customWidthInput.value) || 0.8; // default ~0.8 mi (8 px)
            const widthPx = p.constrain(widthMiles * 10, 2, 27);

            // spawn at center
            const t = new Tornado();
            t.pos = p.createVector(p.width / 2, p.height / 2);
            t.prevPos = t.pos.copy();
            t.windspeed = wind;
            t.maxWindspeed = wind;
            t.renderWidth = widthPx;
            // If user path exists, assign it to the new tornado
            if (pathPoints.length > 0) t.setPath(pathPoints);
            // Make manual tornado last longer
            t.lifespan = 2000;
            tornadoes.push(t);
            simulationRunning = true;
            ui.tornado2.container.style.display = tornadoes.length > 1 ? 'block' : ui.tornado2.container.style.display;
        };

        ui.clearManualBtn.onclick = () => {
            // remove all tornadoes and restart simulation state
            tornadoes = tornadoes.filter(t => !t.isAlive);
            trackGraphics.clear();
        };

        // Path control buttons
        const clearPathBtn = document.getElementById('clear-path-btn');
        const finishPathBtn = document.getElementById('finish-path-btn');
        const pathEditCheckbox = document.getElementById('path-edit-mode');

        // Map editor & mode buttons
        const paintTerrainBtn = document.getElementById('paint-terrain-btn');
        const addCityModeBtn = document.getElementById('add-city-mode-btn');
        const drawRoadModeBtn = document.getElementById('draw-road-mode-btn');
        const clearEditorBtn = document.getElementById('clear-editor-btn');
        const mapEditorCheckbox = document.getElementById('map-editor-mode');

        if (addCityModeBtn) {
            addCityModeBtn.onclick = () => {
                // toggle mode
                if (addCityModeBtn.dataset.mode === 'on') addCityModeBtn.dataset.mode = 'off';
                else addCityModeBtn.dataset.mode = 'on';
                // turn off draw road mode when turning add-city on
                if (addCityModeBtn.dataset.mode === 'on') {
                    drawRoadModeBtn.dataset.mode = 'off';
                }
            };
        }
        if (drawRoadModeBtn) {
            drawRoadModeBtn.onclick = () => {
                if (drawRoadModeBtn.dataset.mode === 'on') {
                    drawRoadModeBtn.dataset.mode = 'off';
                    delete drawRoadModeBtn.dataset.firstCity;
                } else {
                    drawRoadModeBtn.dataset.mode = 'on';
                    addCityModeBtn.dataset.mode = 'off';
                }
            };
        }
        if (clearEditorBtn) {
            clearEditorBtn.onclick = () => {
                // Remove uploaded map if present and re-render the base procedural map to clear overlays, then redraw
                mapBackgroundImage = null;
                generateMap();
                placeCities();
                generateRoads();
            };
        }

        if (paintTerrainBtn) {
            paintTerrainBtn.onclick = () => {
                // Next click will paint; the actual painting logic handled in click listener
                paintTerrainBtn.focus();
            };
        }

        // Handle uploaded map image (use Object URL to avoid base64 embedding)
        if (ui.mapUploadInput) {
            ui.mapUploadInput.onchange = (ev) => {
                const file = ev.target.files && ev.target.files[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                // create a DOM image and draw it into the mapGraphics during next generateMap
                const img = new Image();
                img.onload = () => {
                    // Create a p5 image from DOM image to allow drawing in p5 graphics buffer
                    mapBackgroundImage = img;
                    // Draw uploaded image immediately to mapGraphics and re-place cities/roads
                    mapGraphics.clear();
                    mapGraphics.push();
                    // draw image stretched to canvas size
                    mapGraphics.drawingContext.drawImage(img, 0, 0, p.width, p.height);
                    mapGraphics.pop();
                    // redraw cities and roads on top of uploaded map
                    placeCities();
                    generateRoads();
                };
                img.src = url;
            };
        }

        // Max EF select handler simply kept for UI; tornado constructor reads the select when spawning
        if (ui.maxEFSelect) {
            ui.maxEFSelect.onchange = () => {
                // no immediate action required; new tornadoes will obey the setting
            };
        }

        if (clearPathBtn) {
            clearPathBtn.onclick = () => {
                pathPoints = [];
            };
        }
        if (finishPathBtn) {
            finishPathBtn.onclick = () => {
                // stop adding points
                if (pathEditCheckbox) pathEditCheckbox.checked = false;
            };
        }

        // Click-to-place and editor interactions
        p.canvas.addEventListener('click', (ev) => {
            const rect = p.canvas.getBoundingClientRect();
            const x = (ev.clientX - rect.left) * (p.width / rect.width);
            const y = (ev.clientY - rect.top) * (p.height / rect.height);

            // Path edit mode: add waypoints (regardless of manual tornado mode)
            const pathEdit = document.getElementById('path-edit-mode');
            if (pathEdit && pathEdit.checked) {
                pathPoints.push({ x, y });
                simulationRunning = true;
                return;
            }

            // Map Editor interactions (paint/add cities/draw roads)
            if (ui.mapEditorModeCheckbox && ui.mapEditorModeCheckbox.checked) {
                const terrain = ui.terrainTypeSelect.value;
                // Paint a circle of terrain on the mapGraphics buffer
                if (document.activeElement === ui.paintTerrainBtn || ev) {
                    mapGraphics.noStroke();
                    if (terrain === 'lake') mapGraphics.fill(100, 150, 255);
                    else if (terrain === 'grass') mapGraphics.fill(100, 200, 50);
                    else if (terrain === 'mountain') mapGraphics.fill(139, 137, 137);
                    mapGraphics.ellipse(x, y, 60, 60);
                    return;
                }
            }

            // Add City mode
            if (ui.addCityModeBtn && ui.addCityModeBtn.dataset.mode === 'on') {
                // create a new city disregarding noise, but keep spacing rule
                let overlaps = false;
                const displayRadius = 8;
                const areaRadius = displayRadius * 3;
                for (const other of cities) {
                    const minDist = areaRadius + other.areaRadius + 2;
                    if (p.dist(x, y, other.x, other.y) < minDist) {
                        overlaps = true;
                        break;
                    }
                }
                if (!overlaps) {
                    // Use user-specified name if provided, otherwise fallback to generated name
                    const customName = (ui.cityNameInput && ui.cityNameInput.value && ui.cityNameInput.value.trim().length > 0) ? ui.cityNameInput.value.trim() : null;
                    const name = customName || `Custom ${cities.length + 1}`;
                    const population = p.floor(p.random(1000, 500000));
                    const city = { x, y, name, population, hit: false, displayRadius, areaRadius, lastHitFrame: null, casualties: 0 };
                    cities.push(city);
                    // Draw city and small label immediately onto mapGraphics to persist
                    mapGraphics.noStroke();
                    mapGraphics.fill(255, 200, 200, 90);
                    mapGraphics.ellipse(x, y, city.areaRadius * 2, city.areaRadius * 2);
                    mapGraphics.stroke(0);
                    mapGraphics.fill(255, 255, 0);
                    mapGraphics.ellipse(x, y, city.displayRadius, city.displayRadius);
                    mapGraphics.noStroke();
                    mapGraphics.fill(0);
                    mapGraphics.textSize(12);
                    mapGraphics.textAlign(p.CENTER, p.BOTTOM);
                    mapGraphics.text(`${city.name} (${city.population.toLocaleString()})`, x, y - 5);
                }
                return;
            }

            // Draw Road mode: click to select nearest city endpoints
            if (ui.drawRoadModeBtn && ui.drawRoadModeBtn.dataset.mode === 'on') {
                // find nearest city within threshold
                let nearest = null;
                let nd = Infinity;
                for (const c of cities) {
                    const d = p.dist(x, y, c.x, c.y);
                    if (d < nd && d < 80) {
                        nd = d;
                        nearest = c;
                    }
                }
                if (!nearest) return;
                // toggle selection
                if (!ui.drawRoadModeBtn.dataset.firstCity) {
                    ui.drawRoadModeBtn.dataset.firstCity = cities.indexOf(nearest);
                    // visually mark selection
                    mapGraphics.stroke(255, 0, 0);
                    mapGraphics.strokeWeight(2);
                    mapGraphics.noFill();
                    mapGraphics.ellipse(nearest.x, nearest.y, nearest.areaRadius * 2 + 6, nearest.areaRadius * 2 + 6);
                } else {
                    const i1 = parseInt(ui.drawRoadModeBtn.dataset.firstCity, 10);
                    const c1 = cities[i1];
                    const c2 = nearest;
                    mapGraphics.stroke(60, 60, 60, 200);
                    mapGraphics.strokeWeight(2);
                    mapGraphics.line(c1.x, c1.y, c2.x, c2.y);
                    delete ui.drawRoadModeBtn.dataset.firstCity;
                }
                return;
            }

            if (!ui.manualModeCheckbox.checked) return;

            // customWind is mph, customWidth is now in miles (user-facing). Convert miles -> pixels (1 px = 0.1 mi)
            const wind = parseFloat(ui.customWindInput.value) || 120;
            const widthMiles = parseFloat(ui.customWidthInput.value) || 0.8;
            const widthPx = p.constrain(widthMiles * 10, 2, 27);

            const t = new Tornado();
            t.pos = p.createVector(x, y);
            t.prevPos = t.pos.copy();
            t.windspeed = wind;
            t.maxWindspeed = wind;
            t.renderWidth = widthPx;
            t.lifespan = 2000;
            // If there is a user path defined, let this tornado follow it
            if (pathPoints.length > 0) {
                t.setPath(pathPoints);
            }
            tornadoes.push(t);
            simulationRunning = true;
            ui.tornado2.container.style.display = tornadoes.length > 1 ? 'block' : ui.tornado2.container.style.display;
        });
    };

    // p5.js draw loop
    p.draw = () => {
        p.image(mapGraphics, 0, 0); // Draw the pre-rendered map
        p.image(trackGraphics, 0, 0); // Draw the persistent track

        // Draw any user-created path so people can see waypoints
        drawPath();

        drawCities();
        
        if (simulationRunning) {
            let anyTornadoAlive = false;
            for (const tornado of tornadoes) {
                if(tornado.isAlive) {
                    tornado.update();
                    tornado.draw();
                    anyTornadoAlive = true;
                }
            }
            simulationRunning = anyTornadoAlive;
        } else {
            // Stop the clock if the simulation ends
            if (clockInterval) {
                clearInterval(clockInterval);
                clockInterval = null;
            }
            // Ensure outbreak also stops when simulation finishes
            if (outbreakInterval) {
                clearInterval(outbreakInterval);
                outbreakInterval = null;
                outbreakRemaining = 0;
            }
        }
        
        updateInfoPanel();
    };

    // Draw user-created path waypoints and connecting lines
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
        // draw waypoints
        p.noStroke();
        for (const pt of pathPoints) {
            p.fill(0, 150, 200);
            p.ellipse(pt.x, pt.y, 8, 8);
        }
        p.pop();
    }

    function newMap() {
        p.noiseSeed(p.millis()); // New random seed for noise
        generateMap();
        placeCities();
        generateRoads(); // Add roads after placing cities
        resetSimulation();
    }
    
    function resetSimulation() {
        // Clear any previous outbreak state
        if (outbreakInterval) {
            clearInterval(outbreakInterval);
            outbreakInterval = null;
            outbreakRemaining = 0;
        }

        tornadoes = [];
        trackGraphics.clear(); // Clear the old path

        // Spawn new tornadoes unless manual mode is enabled
        if (!ui.manualModeCheckbox.checked) {
            tornadoes.push(new Tornado());
            if (p.random() < tornadoSettings.dualTornadoChance) {
                tornadoes.push(new Tornado());
                ui.tornado2.container.style.display = 'block';
            } else {
                ui.tornado2.container.style.display = 'none';
            }
        } else {
            // If manual mode, do not auto spawn; keep UI panels consistent
            ui.tornado2.container.style.display = tornadoes.length > 1 ? 'block' : 'none';
        }

        // Very rare outbreak: spawn repeated tornadoes every 2s until count exhausted
        if (p.random() < outbreakSettings.chancePerSim) {
            outbreakRemaining = p.floor(p.random(outbreakSettings.minCount, outbreakSettings.maxCount + 1));
            outbreakInterval = setInterval(() => {
                if (outbreakRemaining <= 0) {
                    clearInterval(outbreakInterval);
                    outbreakInterval = null;
                    return;
                }
                tornadoes.push(new Tornado());
                // Ensure the simulation loop runs so newly spawned outbreak tornadoes are updated and can produce casualties
                simulationRunning = true;

                // If more than one tornado exists, show the second tornado UI panel (keeps UI consistent)
                if (tornadoes.length > 1) {
                    ui.tornado2.container.style.display = 'block';
                }

                outbreakRemaining--;
            }, outbreakSettings.spawnIntervalMs);
        }

        // Reset city 'hit' status
        for (const city of cities) {
            city.hit = false;
        }

        // Reset and start the clock
        if (clockInterval) {
            clearInterval(clockInterval);
        }
        currentTimeInMinutes = p.floor(p.random(0, 24 * 60));
        updateClockDisplay(); // Set initial time
        clockInterval = setInterval(() => {
            currentTimeInMinutes = (currentTimeInMinutes + 1) % (24 * 60);
            updateClockDisplay();
        }, 1000);

        totalCasualties = 0;
        ui.totalCasualties.textContent = '0';
        ui.citiesHitList.innerHTML = '<li>None</li>';
        
        // Reset stats display
        const uiTornadoes = [ui.tornado1, ui.tornado2];
        for(const tUI of uiTornadoes) {
            tUI.windSpeed.textContent = '--';
            tUI.efScale.textContent = '--';
            tUI.efScale.style.color = '#000';
            tUI.maxWindSpeed.textContent = '--';
            tUI.maxWidth.textContent = '--';
        }

        simulationRunning = true;
    }

    function generateMap() {
        // If the user uploaded an image, use it as the base map; otherwise generate procedurally
        mapGraphics.noStroke();
        mapGraphics.clear();
        if (mapBackgroundImage) {
            // draw the uploaded DOM image stretched to the canvas size
            mapGraphics.push();
            mapGraphics.drawingContext.drawImage(mapBackgroundImage, 0, 0, p.width, p.height);
            mapGraphics.pop();
            return;
        }

        mapGraphics.background(100, 150, 255); // Water color
        
        for (let x = 0; x < p.width; x++) {
            for (let y = 0; y < p.height; y++) {
                const noiseVal = p.noise(x * mapSettings.noiseScale, y * mapSettings.noiseScale);
                if (noiseVal > mapSettings.landThreshold) {
                    if (noiseVal > mapSettings.mountainThreshold) {
                        mapGraphics.fill(139, 137, 137); // Mountain color
                    } else {
                        mapGraphics.fill(100, 200, 50); // Land color
                    }
                    mapGraphics.rect(x, y, 1, 1);
                }
            }
        }
    }

    function generateRoads() {
        if (cities.length < 2) return;

        // Using Prim's algorithm to generate a Minimum Spanning Tree for the road network.
        // This ensures all cities are connected with the minimum total road length.
        const connectedCities = new Set();
        const unconnectedCities = [...cities];
        
        // Start with the first city
        const firstCity = unconnectedCities.splice(0, 1)[0];
        connectedCities.add(firstCity);

        mapGraphics.stroke(60, 60, 60, 200); // Dark grey for roads
        mapGraphics.strokeWeight(1.5);

        while (unconnectedCities.length > 0) {
            let shortestEdge = {
                dist: Infinity,
                from: null,
                to: null
            };

            // Find the shortest edge connecting a "connected" city to an "unconnected" one
            for (const connected of connectedCities) {
                for (const unconnected of unconnectedCities) {
                    const d = p.dist(connected.x, connected.y, unconnected.x, unconnected.y);
                    if (d < shortestEdge.dist) {
                        shortestEdge = { dist: d, from: connected, to: unconnected };
                    }
                }
            }
            
            const { from, to } = shortestEdge;

            if (from && to) {
                // Draw the road on the map graphics buffer
                mapGraphics.line(from.x, from.y, to.x, to.y);
                
                // Move the newly connected city to the connected set
                connectedCities.add(to);
                const indexToRemove = unconnectedCities.findIndex(c => c === to);
                if (indexToRemove !== -1) {
                    unconnectedCities.splice(indexToRemove, 1);
                }
            } else {
                // Failsafe to prevent infinite loops if something goes wrong
                break; 
            }
        }
    }

    function placeCities() {
        cities = [];
        let attempts = 0;
        const namePool = [...mapSettings.cityNames];

        while (cities.length < mapSettings.numCities && attempts < 2000) {
            const x = p.random(20, p.width - 20);
            const y = p.random(20, p.height - 20);
            
            const noiseVal = p.noise(x * mapSettings.noiseScale, y * mapSettings.noiseScale);
            // Place city on land, but not on high mountains
            if (noiseVal > mapSettings.landThreshold && noiseVal < mapSettings.mountainThreshold) {
                const name = namePool.length > 0 ? namePool.splice(p.floor(p.random(namePool.length)), 1)[0] : `City ${cities.length + 1}`;
                const population = p.floor(p.random(1000, 1000001));
                // displayRadius is the visual dot size; areaRadius is triple that and used for casualty checks
                const displayRadius = 8;
                const areaRadius = displayRadius * 3;
                // Ensure new city area does not overlap any existing city's area
                let overlaps = false;
                for (const other of cities) {
                    const minDist = areaRadius + other.areaRadius + 2; // small buffer
                    if (p.dist(x, y, other.x, other.y) < minDist) {
                        overlaps = true;
                        break;
                    }
                }
                if (!overlaps) {
                    cities.push({ x, y, name, population, hit: false, displayRadius, areaRadius, lastHitFrame: null, casualties: 0 });
                }
            }
            attempts++;
        }
    }

    function drawCities() {
        for (const city of cities) {
            // Draw the area circle (semi-transparent) that represents the city area used for casualties
            p.noStroke();
            p.fill(255, 200, 200, 90);
            p.ellipse(city.x, city.y, city.areaRadius * 2, city.areaRadius * 2);

            // Draw city dot
            p.stroke(0);
            p.strokeWeight(1);
            p.fill(city.hit ? p.color(255, 0, 0) : p.color(255, 255, 0)); // Red if hit, yellow otherwise
            p.ellipse(city.x, city.y, city.displayRadius, city.displayRadius);

            // Draw city name
            p.noStroke();
            p.fill(0); // Black text
            p.textSize(12);
            p.textAlign(p.CENTER, p.BOTTOM);
            const populationText = city.population.toLocaleString();
            p.text(`${city.name} (${populationText})`, city.x, city.y - 5);
        }
    }

    function updateClockDisplay() {
        const hours = Math.floor(currentTimeInMinutes / 60);
        const minutes = currentTimeInMinutes % 60;
        const formattedHours = hours.toString().padStart(2, '0');
        const formattedMinutes = minutes.toString().padStart(2, '0');
        ui.clockTime.textContent = `${formattedHours}:${formattedMinutes}`;
    }

    function updateInfoPanel() {
        if (tornadoes.length === 0) return;

        const uiTornadoes = [ui.tornado1, ui.tornado2];

        tornadoes.forEach((tornado, index) => {
            if (index >= uiTornadoes.length) return; // Should not happen with current setup

            const tUI = uiTornadoes[index];

            // Live stats
            if (tornado.isAlive) {
                tUI.windSpeed.textContent = tornado.windspeed.toFixed(0);
                const efInfo = tornado.getEFScaleInfo();
                tUI.efScale.textContent = `${efInfo.name} (${efInfo.description})`;
                tUI.efScale.style.color = efInfo.color;
            } else {
                tUI.windSpeed.textContent = '0';
                tUI.efScale.textContent = 'Dissipated';
                tUI.efScale.style.color = '#888888';
            }

            // Lifetime stats, persist after dissipation
            tUI.maxWindSpeed.textContent = tornado.maxWindspeed.toFixed(0);
            tUI.maxWidth.textContent = (tornado.maxWidth * 0.1).toFixed(2);
        });

        // If there's only one tornado, clear the second panel's stats for tidiness,
        // even though it's hidden.
        if (tornadoes.length < 2) {
             const tUI = ui.tornado2;
             tUI.windSpeed.textContent = '--';
             tUI.efScale.textContent = '--';
             tUI.efScale.style.color = '#000';
             tUI.maxWindSpeed.textContent = '--';
             tUI.maxWidth.textContent = '--';
        }
        
        // Shared stats
        ui.totalCasualties.textContent = totalCasualties.toLocaleString();
    }

    class Tornado {
        constructor() {
            this.pos = p.createVector(p.random(p.width), p.random(p.height));
            this.prevPos = this.pos.copy();
            this.time = p.random(1000);
            this.windTime = p.random(2000);
            this.windspeed = 0;
            this.efInfo = {};
            this.lifespan = p.random(800, 1500); // Lifespan in frames
            this.isAlive = true;
            this.maxWindspeed = 0;
            this.maxWidth = 0;
            // Each tornado gets a different potential max wind speed for more variety.
            // By taking the max of two randoms, we bias towards higher values.
            // Determine an initial potential max wind, but cap to spawn limits and user EF cap
            this.potentialMaxWind = p.max(
                p.random(80, tornadoSettings.maxSpeed),
                p.random(80, tornadoSettings.maxSpeed)
            );
            this.potentialMaxWind = p.min(this.potentialMaxWind, tornadoSettings.maxSpawnWind);

            // Apply user max EF cap from UI (default 6)
            const efCap = parseInt((ui.maxEFSelect && ui.maxEFSelect.value) || '6', 10);
            // mapping EF level -> approximate max wind for that cap
            const efCapToWind = {
                6: 1000,
                5: 450,
                4: 200,
                3: 166,
                2: 136,
                1: 111,
                0: 86
            };
            const capWind = efCapToWind[efCap] || 1000;
            this.potentialMaxWind = Math.min(this.potentialMaxWind, capWind);

            // 1% chance to become an extreme event but still respect EF cap
            this.isEF6 = false;
            if (p.random() < tornadoSettings.ef6Chance && efCap >= 6) {
                this.potentialMaxWind = p.random(320, 1000);
                this.isEF6 = true;
            }
            this.baseAngle = this.calculateInitialAngle();

            // NEW: independent visual width — any tornado can be any size regardless of windspeed.
            // width is in pixels (1 pixel = 0.1 miles). Range limited to 2..27 px to match max width requirement.
            this.renderWidth = p.random(2, 27);

            // Path-following properties (if user defined path is provided)
            this.followPath = false;
            this.path = [];
            this.pathIndex = 0;
        }

        // Allow assigning a path (array of {x,y}) to this tornado so it follows waypoints.
        setPath(pts) {
            if (!pts || pts.length === 0) return;
            // copy the array to avoid external mutation issues
            this.path = pts.map(p => ({ x: p.x, y: p.y }));
            this.pathIndex = 0;
            this.followPath = true;
            // set initial baseAngle toward first waypoint
            const target = this.path[0];
            const dx = target.x - this.pos.x;
            const dy = target.y - this.pos.y;
            this.baseAngle = Math.atan2(dy, dx);
        }

        calculateInitialAngle() {
            const edgeBuffer = 150; // Distance from edge to be considered "near"
            const isNearTop = this.pos.y < edgeBuffer;
            const isNearBottom = this.pos.y > p.height - edgeBuffer;
            const isNearLeft = this.pos.x < edgeBuffer;
            const isNearRight = this.pos.x > p.width - edgeBuffer;

            // Corners
            if (isNearTop && isNearLeft) return p.PI / 4;       // Move South-East
            if (isNearTop && isNearRight) return 3 * p.PI / 4;  // Move South-West
            if (isNearBottom && isNearLeft) return -p.PI / 4;   // Move North-East
            if (isNearBottom && isNearRight) return -3 * p.PI / 4; // Move North-West

            // Edges
            if (isNearTop) return p.PI / 2;    // Move South
            if (isNearBottom) return -p.PI / 2; // Move North
            if (isNearLeft) return 0;          // Move East
            if (isNearRight) return p.PI;      // Move West

            // Default case (center of map)
            return -p.PI / 4; // Move Northeast (original behavior)
        }

        update() {
            if (!this.isAlive) return;

            this.lifespan--;
            if (this.lifespan <= 0) {
                this.isAlive = false;
                this.windspeed = 0; // Windspeed drops to 0 on dissipation
                return;
            }

            this.prevPos.set(this.pos);

            // Movement: if following a user-defined path, move toward current waypoint; otherwise use noise-based movement.
            if (this.followPath && this.path && this.path.length > 0) {
                const target = this.path[this.pathIndex];
                const dx = target.x - this.pos.x;
                const dy = target.y - this.pos.y;
                const distToTarget = Math.hypot(dx, dy);

                // Determine direction toward waypoint
                const angleToTarget = Math.atan2(dy, dx);

                // slight wobble still applied
                const wobbleFactor = parseFloat(ui.pathWobbleSlider.value);
                const angleVariation = (p.noise(this.time) - 0.5) * p.PI * wobbleFactor;
                const finalAngle = angleToTarget + angleVariation;

                // Move toward waypoint; keep the halved speed behavior
                const speed = p.map(p.noise(this.time + 1000), 0, 1, 1, 3) * 0.5;
                this.pos.x += Math.cos(finalAngle) * speed;
                this.pos.y += Math.sin(finalAngle) * speed;

                // If close to waypoint, advance
                if (distToTarget < 8) {
                    this.pathIndex++;
                    if (this.pathIndex >= this.path.length) {
                        // no more waypoints: stop following path and dissipate
                        this.followPath = false;
                        // end the tornado immediately when it reaches the last waypoint
                        this.isAlive = false;
                        this.windspeed = 0;
                        return;
                    }
                }
            } else {
                // Add some noise for variation, making it less of a straight line
                const wobbleFactor = parseFloat(ui.pathWobbleSlider.value);
                const angleVariation = (p.noise(this.time) - 0.5) * p.PI * wobbleFactor;
                const finalAngle = this.baseAngle + angleVariation;
                
                // Halve tornado movement speed (original speed mapped ~1..3); apply 0.5 multiplier
                const speed = p.map(p.noise(this.time + 1000), 0, 1, 1, 3) * 0.5;
                this.pos.x += p.cos(finalAngle) * speed;
                this.pos.y += p.sin(finalAngle) * speed;
            }

            // Update windspeed first, so we can draw the final track segment before dissipating at the edge
            this.time += 0.008; // Slower time evolution for smoother path
            this.windTime += 0.02;

            // Fade windspeed as tornado nears end of life
            const lifeFactor = p.constrain(this.lifespan / 200, 0, 1); // Fade out over last 200 frames
            let windNoise = p.noise(this.windTime);
            // Bias noise towards 1 to make higher windspeeds within the potential range more common
            windNoise = p.pow(windNoise, 0.5); 
            const maxWind = p.map(windNoise, 0, 1, tornadoSettings.minSpeed, this.potentialMaxWind);
            this.windspeed = maxWind * lifeFactor;
            
            this.maxWindspeed = Math.max(this.maxWindspeed, this.windspeed);
            this.efInfo = this.getEFScaleInfo();
            
            this.drawTrack();
            this.checkCityCollision();

            this.handleEdges(); // This will now set isAlive to false if off-screen
        }

        handleEdges() {
            // Dissipate if the tornado leaves the map area.
            if (this.pos.x > p.width || this.pos.x < 0 || this.pos.y > p.height || this.pos.y < 0) {
                this.isAlive = false;
                this.windspeed = 0; // Set final windspeed to 0
            }
        }

        getEFScaleInfo(ws = this.windspeed) {
            // Respect user's EF cap by reading UI
            const efCap = parseInt((ui.maxEFSelect && ui.maxEFSelect.value) || '6', 10);

            // New colors as requested by user; map wind to EF but clamp by cap
            if (ws > 319 && efCap >= 6) return { name: 'EF6', description: 'Cataclysmic', color: '#4B0082' };
            if (ws >= 201 && efCap >= 5) return { name: 'EF5', description: 'Incredible', color: '#800080' };
            if (ws >= 166 && efCap >= 4) return { name: 'EF4', description: 'Devastating', color: '#FF0000' };
            if (ws >= 136 && efCap >= 3) return { name: 'EF3', description: 'Severe', color: '#FFA500' };
            if (ws >= 111 && efCap >= 2) return { name: 'EF2', description: 'Significant', color: '#FFFF00' };
            if (ws >= 86 && efCap >= 1) return { name: 'EF1', description: 'Moderate', color: '#008000' };
            if (ws >= 65 && efCap >= 0) return { name: 'EF0', description: 'Light', color: '#00FFFF' };
            return { name: 'Sub-EF0', description: 'Weak', color: '#cccccc' };
        }

        drawTrack() {
            if (this.windspeed < 10) return; // Don't draw track if dissipated
            // Width is independent from windspeed — use the tornado's assigned renderWidth.
            const trackWidth = this.renderWidth;
            this.maxWidth = Math.max(this.maxWidth, trackWidth);
            
            // Use the color from the EF scale info for the track
            const trackColor = p.color(this.efInfo.color);
            trackColor.setAlpha(180); // Keep it semi-transparent
            trackGraphics.stroke(trackColor);

            trackGraphics.strokeWeight(trackWidth);
            trackGraphics.line(this.prevPos.x, this.prevPos.y, this.pos.x, this.pos.y);
        }
        
        draw() {
            if (!this.isAlive) return;

            p.push();
            p.translate(this.pos.x, this.pos.y);
            
            const size = p.map(this.windspeed, tornadoSettings.minSpeed, tornadoSettings.maxSpeed, 10, 25);
            p.noStroke();
            
            // Outer funnel (transparent)
            p.fill(100, 100, 100, 100);
            p.ellipse(0, 0, size, size);

            // Inner core
            p.fill(50, 50, 50, 200);
            p.ellipse(0, 0, size * 0.5, size * 0.5);

            p.pop();
        }

        checkCityCollision() {
            if (this.windspeed < 40) return; // Only EF0+ tornados cause "hits"

            for (const city of cities) {
                // Use the city's defined areaRadius for hits (triple the visual city size)
                const d = p.dist(this.pos.x, this.pos.y, city.x, city.y);
                if (d < city.areaRadius) {
                    // Mark city as hit for visual feedback
                    city.hit = true;

                    // Allow repeat casualty events if tornado remains over the city.
                    // We apply casualties at most once every 30 frames while the tornado stays inside the area.
                    const cooldownFrames = 30;
                    if (city.lastHitFrame === null || (p.frameCount - city.lastHitFrame) >= cooldownFrames) {
                        // compute overlap area between tornado (approximated as circle with radius=this.renderWidth) and city area
                        const r1 = city.areaRadius;
                        const r2 = Math.max(1, this.renderWidth); // tornado visual radius approximation
                        // center distance d already computed
                        // circle-circle overlap formula
                        let overlapArea = 0;
                        if (d + r2 <= r1) {
                            // tornado fully inside city area
                            overlapArea = Math.PI * r2 * r2;
                        } else if (d + r1 <= r2) {
                            // city fully inside tornado area (unlikely but handle)
                            overlapArea = Math.PI * r1 * r1;
                        } else {
                            const phi = Math.acos(p.constrain((d*d + r1*r1 - r2*r2) / (2 * d * r1), -1, 1)) * 2;
                            const theta = Math.acos(p.constrain((d*d + r2*r2 - r1*r1) / (2 * d * r2), -1, 1)) * 2;
                            const area1 = 0.5 * r1*r1 * (phi - Math.sin(phi));
                            const area2 = 0.5 * r2*r2 * (theta - Math.sin(theta));
                            overlapArea = area1 + area2;
                        }
                        const cityArea = Math.PI * r1 * r1;
                        const coverageFactor = p.constrain(overlapArea / cityArea, 0, 1); // 0..1 fraction of city covered

                        const casualties = this.calculateCasualties(city, coverageFactor);
                        totalCasualties += casualties;

                        // Accumulate casualties on the city object so repeated hits update the same entry
                        city.casualties = (city.casualties || 0) + casualties;

                        this.addHitCityToList(city, casualties);
                        city.lastHitFrame = p.frameCount;
                    }
                }
            }
        }
        
        calculateCasualties(city) {
            // Base impact factor based on wind speed, normalized to EF scale range.
            // Optionally accept coverageFactor (0..1) to increase casualties when a larger portion of the city is covered.
            let coverageFactor = 0;
            if (arguments.length >= 2) coverageFactor = arguments[1];
            // Starts getting significant above spawn threshold (40 mph) so map from 40 instead of 86.
            const windImpact = p.constrain(p.map(this.windspeed, 40, 300, 0.05, 1.0), 0, 1.0);

            // Severity multiplier based on EF rating to create non-linear impact.
            // EF0/1 have low impact, EF4/5 have much higher potential.
            const efName = this.efInfo.name;
            let severityMultiplier = 0.2;
            if (efName === 'EF0') severityMultiplier = 0.3;
            else if (efName === 'EF1') severityMultiplier = 0.6;
            else if (efName === 'EF2') severityMultiplier = 1.0;
            else if (efName === 'EF3') severityMultiplier = 1.6;
            else if (efName === 'EF4') severityMultiplier = 2.6;
            else if (efName === 'EF5') severityMultiplier = 4.5;
            else if (efName === 'EF6') severityMultiplier = 6.0;

            // A small fraction of the population is at risk.
            // Use sqrt scaling but slightly increase the multiplier so even small cities can see casualties.
            const populationFactor = Math.sqrt(city.population) * 0.0007;

            // Combine factors. The random element represents the unpredictable nature of disasters.
            let baseCasualties = windImpact * severityMultiplier * populationFactor * p.random(0.8, 1.6);

            // Increase casualties non-linearly with coverage: partial cover gives modest increase, near-full cover greatly increases.
            // coverageFactor ranges 0..1; we scale by (1 + 4 * coverageFactor) so full coverage multiplies casualties by ~5x.
            const coverageMultiplier = 1 + 4 * coverageFactor;
            baseCasualties *= (1 + coverageMultiplier * coverageFactor * 0.5); // additional curvature to growth

            // Clamp the result per city to keep results controlled but allow at least 1 casualty for impactful strikes.
            const softClamp = Math.min(baseCasualties, 80 + p.random(0, 20));

            // Ensure that a valid hit produces at least 1 casualty when wind is meaningful.
            const finalCasualties = Math.max(1, softClamp);

            return Math.floor(finalCasualties);
        }

        addHitCityToList(city, casualties) {
            // Clear "None" if it's the first hit
            if (ui.citiesHitList.children.length === 1 && ui.citiesHitList.firstElementChild.textContent === 'None') {
                ui.citiesHitList.innerHTML = '';
            }

            const tornadoId = tornadoes.indexOf(this) + 1;

            // Look for an existing list item for this city (use data attribute for reliable matching)
            let existingLi = null;
            for (const li of ui.citiesHitList.children) {
                if (li.dataset.cityName === city.name) {
                    existingLi = li;
                    break;
                }
            }

            if (existingLi) {
                // Update the existing entry: increase displayed cumulative casualties and optionally update EF color
                existingLi.textContent = `T${tornadoId}: ${city.name} (${this.efInfo.name}) - ${city.casualties} cas.`;
                existingLi.style.borderLeft = `5px solid ${this.efInfo.color}`;
            } else {
                const li = document.createElement('li');
                li.dataset.cityName = city.name;
                li.textContent = `T${tornadoId}: ${city.name} (${this.efInfo.name}) - ${city.casualties} cas.`;
                li.style.borderLeft = `5px solid ${this.efInfo.color}`;
                ui.citiesHitList.appendChild(li);
            }

            ui.citiesHitList.scrollTop = ui.citiesHitList.scrollHeight; // Auto-scroll
        }
    }
};

// Start p5.js in instance mode
new p5(sketch);