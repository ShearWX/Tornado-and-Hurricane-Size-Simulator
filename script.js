const sketch = (p) => {
    let mapGraphics;
    let trackGraphics;
    let mapImage = null;
    let tornadoes = [];
    let simulationActive = false;

    const ui = {
        clockTime: document.getElementById('clock-time'),
        totalCasualties: document.getElementById('total-casualties'),
        mapUpload: document.getElementById('map-upload'),
        osmBtn: document.getElementById('osm-btn'),
        mapSelector: document.getElementById('map-selector'),
        customWind: document.getElementById('custom-wind'),
        customWidth: document.getElementById('custom-width'),
        clearBtn: document.getElementById('clear-manual-btn')
    };

    p.setup = () => {
        p.pixelDensity(1);
        const canvas = p.createCanvas(800, 600).parent('canvas-container');
        mapGraphics = p.createGraphics(800, 600);
        trackGraphics = p.createGraphics(800, 600);
        
        // Initial state: Gray canvas
        mapGraphics.background(200);

        // Upload Handler
        ui.mapUpload.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                loadMapImage(url);
            }
        };

        // OSM Handler (Static Map of NYC)
        ui.osmBtn.onclick = () => {
            const osmUrl = "https://static-maps.yandex.ru/1.x/?lang=en_US&ll=-74.0060,40.7128&z=12&l=map&size=600,450";
            loadMapImage(osmUrl);
        };

        ui.clearBtn.onclick = () => {
            tornadoes = [];
            trackGraphics.clear();
        };

        canvas.mousePressed(() => {
            if (!simulationActive) return;
            spawnTornado(p.mouseX, p.mouseY);
        });
    };

    function loadMapImage(url) {
        p.loadImage(url, (img) => {
            mapImage = img;
            mapGraphics.image(mapImage, 0, 0, p.width, p.height);
            ui.mapSelector.style.display = 'none';
            simulationActive = true;
        });
    }

    function spawnTornado(x, y) {
        const wind = parseFloat(ui.customWind.value) || 100;
        const widthMi = parseFloat(ui.customWidth.value) || 0.5;
        
        const t = new Tornado(x, y, wind, widthMi);
        tornadoes.push(t);
    }

    p.draw = () => {
        p.image(mapGraphics, 0, 0);
        p.image(trackGraphics, 0, 0);

        if (simulationActive) {
            for (let i = tornadoes.length - 1; i >= 0; i--) {
                tornadoes[i].update();
                tornadoes[i].draw();
                if (!tornadoes[i].isAlive) {
                    // We keep them in the array to keep the track visible, 
                    // or remove if performance drops.
                }
            }
        }
    };

    class Tornado {
        constructor(x, y, wind, width) {
            this.pos = p.createVector(x, y);
            this.prevPos = this.pos.copy();
            this.windspeed = wind;
            this.renderWidth = width * 10; // 0.1mi = 1px
            this.isAlive = true;
            this.timer = 0;
            this.angle = p.random(p.TWO_PI);
        }

        update() {
            if (!this.isAlive) return;
            this.prevPos.set(this.pos);
            
            // Movement logic
            this.timer += 0.05;
            let noiseVal = p.noise(this.timer);
            let moveAngle = this.angle + p.map(noiseVal, 0, 1, -0.5, 0.5);
            
            this.pos.x += p.cos(moveAngle) * 2;
            this.pos.y += p.sin(moveAngle) * 2;

            // Draw to persistent track
            trackGraphics.stroke(this.getEFColor());
            trackGraphics.strokeWeight(this.renderWidth);
            trackGraphics.line(this.prevPos.x, this.prevPos.y, this.pos.x, this.pos.y);

            // Boundaries
            if (this.pos.x < 0 || this.pos.x > p.width || this.pos.y < 0 || this.pos.y > p.height) {
                this.isAlive = false;
            }
        }

        getEFColor() {
            if (this.windspeed >= 200) return '#800080'; // EF5
            if (this.windspeed >= 165) return '#FF0000'; // EF4
            if (this.windspeed >= 135) return '#FFA500'; // EF3
            return '#FFFF00'; // EF0-2
        }

        draw() {
            if (!this.isAlive) return;
            p.fill(50, 50, 50, 150);
            p.noStroke();
            p.ellipse(this.pos.x, this.pos.y, 15, 15);
        }
    }
};

new p5(sketch);
