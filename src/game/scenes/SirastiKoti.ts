import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { enablePauseMenu } from './PauseMenu';
import { completeLevel } from './Progress';

/*
 * Sirasti koti (Mišja geometrija) – mini igra za 6. razred, matematika.
 *
 * Učna snov (UN Matematika 2025, Geometrija in merjenje, standardi za 6. razred, str. 35–36):
 *   - poimenuje kot (ostri, pravi, topi, iztegnjeni, udrti)
 *   - izmeri kot v kotnih stopinjah s kotomerom
 *   - načrta kot dane velikosti
 *
 * Miška mora priti do sira. Pot zapirajo troje vrata, vsaka vrata preverjajo en standard.
 * Za odprtje vrat mora igralec pravilno rešiti REQUIRED_CORRECT nalog. Napaka ne kaznuje,
 * ampak prikaže razlago in novo nalogo.
 *
 * Povezava z glavno igro: celoten konec igre je v metodi finishGame() / returnToMainGame().
 */

type Stage = 'poimenuje' | 'izmeri' | 'nacrta';
type AngleType = 'ostri' | 'pravi' | 'topi' | 'iztegnjeni' | 'udrti';

interface AngleTypeInfo {
    type: AngleType;
    label: string;
    rule: string;
}

interface Gate {
    tileX: number;
    tileY: number;
    stage: Stage;
    open: boolean;
    solved: number;
    door: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
}

const TILE = 64;           // 1024 x 768 => 16 x 12 polj
const COLS = 16;
const ROWS = 12;
const WALL_COLUMNS = [4, 8, 12];
const DOOR_ROW = 6;
const START = { x: 1, y: 6 };
const CHEESE = { x: 14, y: 6 };
const REQUIRED_CORRECT = 2; // koliko pravilnih odgovorov odpre ena vrata
const STEP_DURATION = 100;

const STAGES: Stage[] = ['poimenuje', 'izmeri', 'nacrta'];
const STAGE_CAPTIONS: Record<Stage, string> = {
    poimenuje: 'Vrsta kota',
    izmeri: 'Izmeri kot',
    nacrta: 'Nariši kot'
};

const ANGLE_TYPES: AngleTypeInfo[] = [
    { type: 'ostri', label: 'ostri', rule: 'manjši od 90°' },
    { type: 'pravi', label: 'pravi', rule: 'točno 90°' },
    { type: 'topi', label: 'topi', rule: 'večji od 90° in manjši od 180°' },
    { type: 'iztegnjeni', label: 'iztegnjeni', rule: 'točno 180°' },
    { type: 'udrti', label: 'udrti', rule: 'večji od 180° in manjši od 360°' }
];

const FONT = 'Arial, sans-serif';

export class SirastiKoti extends Scene {
    player: Phaser.GameObjects.Sprite;
    tileX: number = START.x;
    tileY: number = START.y;
    isMoving: boolean = false;
    isFinished: boolean = false;

    walls: Set<string> = new Set();
    gates: Gate[] = [];
    mistakes: number = 0;

    panel: Phaser.GameObjects.Container | null = null;
    keyHandler: ((event: KeyboardEvent) => void) | null = null;
    hud: Phaser.GameObjects.Text;

    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };

    constructor() {
        super('SirastiKoti');
    }

    create() {
        // scene.restart() uporabi isto instanco, zato stanje ponastavimo tukaj
        enablePauseMenu(this, { returnRoom: 'SobaSirastiKoti', spawnX: 9, spawnY: 6 });
        this.tileX = START.x;
        this.tileY = START.y;
        this.isMoving = false;
        this.isFinished = false;
        this.walls = new Set();
        this.gates = [];
        this.mistakes = 0;
        this.panel = null;
        this.keyHandler = null;

        this.drawRoom();
        this.createGates();
        this.drawCheese();

        this.player = this.add.sprite(this.px(this.tileX), this.py(this.tileY), 'mouse');
        this.player.setScale(1.6);
        this.player.setAngle(-90); // gleda desno (enako kot v Game.ts)
        this.player.setDepth(10);

        this.hud = this.add.text(16, 18, '', {
            fontSize: '22px',
            fontFamily: FONT,
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setDepth(20);
        this.updateHud();

        this.cursors = this.input.keyboard!.createCursorKeys();
        this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as any;

        this.events.once('shutdown', () => this.removeKeyHandler());

        this.cameras.main.fadeIn(150, 0, 0, 0);
        this.showIntro();
    }

    // ---------------------------------------------------------------------
    // Soba in gibanje po mreži
    // ---------------------------------------------------------------------

    px(tileX: number): number {
        return tileX * TILE + TILE / 2;
    }

    py(tileY: number): number {
        return tileY * TILE + TILE / 2;
    }

    key(x: number, y: number): string {
        return `${x},${y}`;
    }

    drawRoom() {
        const g = this.add.graphics().setDepth(0);

        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const isBorder = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
                const isInnerWall = WALL_COLUMNS.includes(x) && y !== DOOR_ROW;

                if (isBorder || isInnerWall) {
                    this.walls.add(this.key(x, y));
                    g.fillStyle(0x5a4632, 1);
                    g.fillRect(x * TILE, y * TILE, TILE, TILE);
                    g.lineStyle(2, 0x3e3022, 1);
                    g.strokeRect(x * TILE, y * TILE, TILE, TILE);
                } else {
                    g.fillStyle((x + y) % 2 === 0 ? 0xd9c9a3 : 0xcfbe95, 1);
                    g.fillRect(x * TILE, y * TILE, TILE, TILE);
                }
            }
        }
    }

    createGates() {
        WALL_COLUMNS.forEach((wallX, index) => {
            const stage = STAGES[index];
            const door = this.add.rectangle(this.px(wallX), this.py(DOOR_ROW), TILE - 6, TILE - 6, 0x8b5a2b)
                .setStrokeStyle(4, 0x3e2412)
                .setDepth(5);
            const label = this.add.text(this.px(wallX), this.py(DOOR_ROW), `${index + 1}`, {
                fontSize: '30px',
                fontFamily: FONT,
                color: '#ffd23f',
                stroke: '#000000',
                strokeThickness: 4,
                fontStyle: 'bold'
            }).setOrigin(0.5).setDepth(6);

            this.add.text(this.px(wallX), this.py(DOOR_ROW) - TILE * 0.85, STAGE_CAPTIONS[stage], {
                fontSize: '16px',
                fontFamily: FONT,
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3
            }).setOrigin(0.5).setDepth(6);

            this.gates.push({ tileX: wallX, tileY: DOOR_ROW, stage, open: false, solved: 0, door, label });
        });
    }

    drawCheese() {
        const cx = this.px(CHEESE.x);
        const cy = this.py(CHEESE.y);
        const g = this.add.graphics().setDepth(4);
        g.fillStyle(0xffd23f, 1);
        g.fillTriangle(cx - 24, cy + 18, cx + 24, cy + 18, cx + 24, cy - 20);
        g.lineStyle(3, 0xc99a00, 1);
        g.strokeTriangle(cx - 24, cy + 18, cx + 24, cy + 18, cx + 24, cy - 20);
        g.fillStyle(0xe0b020, 1);
        g.fillCircle(cx + 12, cy + 6, 5);
        g.fillCircle(cx + 2, cy + 12, 3);
        g.fillCircle(cx + 16, cy - 6, 3);
    }

    gateAt(x: number, y: number): Gate | undefined {
        return this.gates.find(gate => gate.tileX === x && gate.tileY === y);
    }

    isBlocked(x: number, y: number): boolean {
        if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
        if (this.walls.has(this.key(x, y))) return true;
        const gate = this.gateAt(x, y);
        return gate !== undefined && !gate.open;
    }

    update() {
        if (this.isMoving || this.isFinished || this.panel) return;

        let dx = 0;
        let dy = 0;

        // Koti obračanja miške so enaki kot v Game.ts (sprite privzeto gleda navzdol)
        if (this.cursors.left.isDown || this.wasd.A.isDown) {
            dx = -1;
            this.player.setAngle(90);
        } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
            dx = 1;
            this.player.setAngle(-90);
        } else if (this.cursors.up.isDown || this.wasd.W.isDown) {
            dy = -1;
            this.player.setAngle(180);
        } else if (this.cursors.down.isDown || this.wasd.S.isDown) {
            dy = 1;
            this.player.setAngle(0);
        }

        if (dx === 0 && dy === 0) return;

        const nextX = this.tileX + dx;
        const nextY = this.tileY + dy;

        const gate = this.gateAt(nextX, nextY);
        if (gate && !gate.open) {
            this.showTask(gate);
            return;
        }

        if (this.isBlocked(nextX, nextY)) return;

        this.isMoving = true;
        this.tileX = nextX;
        this.tileY = nextY;

        this.tweens.add({
            targets: this.player,
            x: this.px(this.tileX),
            y: this.py(this.tileY),
            duration: STEP_DURATION,
            ease: 'Linear',
            onComplete: () => {
                this.isMoving = false;
                if (this.tileX === CHEESE.x && this.tileY === CHEESE.y) {
                    this.finishGame();
                }
            }
        });
    }

    updateHud() {
        const opened = this.gates.filter(gate => gate.open).length;
        this.hud.setText(`Sirasti koti    Vrata: ${opened}/${this.gates.length}    Napake: ${this.mistakes}`);
    }

    openGate(gate: Gate) {
        gate.open = true;
        gate.label.setText('✓').setColor('#7CFC00');
        this.tweens.add({ targets: gate.door, alpha: 0.15, duration: 300 });
        this.updateHud();
    }

    // ---------------------------------------------------------------------
    // Panel (okno z nalogo) – skupni pripomočki
    // ---------------------------------------------------------------------

    createPanel(title: string, subtitle: string): Phaser.GameObjects.Container {
        this.closePanel();

        const container = this.add.container(0, 0).setDepth(100);
        const shade = this.add.rectangle(512, 384, 1024, 768, 0x000000, 0.45);
        const bg = this.add.rectangle(512, 384, 840, 620, 0x1e1e2e, 0.96).setStrokeStyle(4, 0xffd23f);
        const titleText = this.add.text(512, 112, title, {
            fontSize: '32px',
            fontFamily: FONT,
            color: '#ffd23f',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        const subtitleText = this.add.text(512, 150, subtitle, {
            fontSize: '20px',
            fontFamily: FONT,
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: 760 }
        }).setOrigin(0.5, 0);

        container.add([shade, bg, titleText, subtitleText]);
        this.panel = container;
        return container;
    }

    closePanel() {
        this.removeKeyHandler();
        this.panel?.destroy();
        this.panel = null;
    }

    setKeyHandler(handler: (event: KeyboardEvent) => void) {
        this.removeKeyHandler();
        this.keyHandler = handler;
        this.input.keyboard!.on('keydown', handler);
    }

    removeKeyHandler() {
        if (this.keyHandler) {
            this.input.keyboard?.off('keydown', this.keyHandler);
            this.keyHandler = null;
        }
    }

    addButton(container: Phaser.GameObjects.Container, x: number, y: number, width: number, label: string, onClick: () => void) {
        const rect = this.add.rectangle(x, y, width, 52, 0x3b3b5c)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true });
        const text = this.add.text(x, y, label, {
            fontSize: '22px',
            fontFamily: FONT,
            color: '#ffffff'
        }).setOrigin(0.5);

        rect.on('pointerover', () => rect.setFillStyle(0x56568a));
        rect.on('pointerout', () => rect.setFillStyle(0x3b3b5c));
        // zamik, da ne uničimo gumba med obdelavo lastnega dogodka
        rect.on('pointerdown', () => this.time.delayedCall(0, onClick));

        container.add([rect, text]);
    }

    // ---------------------------------------------------------------------
    // Risanje kotov in kotomera
    // ---------------------------------------------------------------------

    /** Nariše kot z vrhom v (cx, cy): prvi krak vodoravno desno (0°), drugi zavrten za deg v nasprotni smeri urinega kazalca. */
    drawAngle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rayLength: number, deg: number, arcRadius: number) {
        const rad = Phaser.Math.DegToRad(deg);

        if (deg > 0) {
            const steps = Math.max(8, Math.ceil(deg / 5));
            const points: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(cx, cy)];
            for (let i = 0; i <= steps; i++) {
                const a = (rad * i) / steps;
                points.push(new Phaser.Math.Vector2(cx + arcRadius * Math.cos(a), cy - arcRadius * Math.sin(a)));
            }
            g.fillStyle(0xffd23f, 0.45);
            g.fillPoints(points, true);
        }

        g.lineStyle(5, 0xffffff, 1);
        g.lineBetween(cx, cy, cx + rayLength, cy);
        g.lineBetween(cx, cy, cx + rayLength * Math.cos(rad), cy - rayLength * Math.sin(rad));
        g.fillStyle(0xffffff, 1);
        g.fillCircle(cx, cy, 6);
    }

    /** Polkrožni kotomer z zunanjo (0–180 od desne) in notranjo (0–180 od leve) lestvico. */
    drawProtractor(container: Phaser.GameObjects.Container, cx: number, cy: number, r: number) {
        const g = this.add.graphics();

        const outline: Phaser.Math.Vector2[] = [];
        for (let d = 0; d <= 180; d += 5) {
            const a = Phaser.Math.DegToRad(d);
            outline.push(new Phaser.Math.Vector2(cx + r * Math.cos(a), cy - r * Math.sin(a)));
        }
        g.fillStyle(0x9fd3ff, 0.15);
        g.fillPoints(outline, true);
        g.lineStyle(2, 0x9fd3ff, 0.9);
        g.strokePoints(outline, true);

        for (let d = 0; d <= 180; d += 10) {
            const a = Phaser.Math.DegToRad(d);
            const inner = d % 30 === 0 ? r - 22 : r - 12;
            g.lineBetween(cx + inner * Math.cos(a), cy - inner * Math.sin(a), cx + r * Math.cos(a), cy - r * Math.sin(a));
        }
        container.add(g);

        for (let d = 0; d <= 180; d += 30) {
            const a = Phaser.Math.DegToRad(d);
            const outer = this.add.text(cx + (r + 20) * Math.cos(a), cy - (r + 20) * Math.sin(a), `${d}`, {
                fontSize: '18px',
                fontFamily: FONT,
                color: '#ffffff'
            }).setOrigin(0.5);
            const inner = this.add.text(cx + (r - 40) * Math.cos(a), cy - (r - 40) * Math.sin(a), `${180 - d}`, {
                fontSize: '14px',
                fontFamily: FONT,
                color: '#9fd3ff'
            }).setOrigin(0.5);
            container.add([outer, inner]);
        }
    }

    // ---------------------------------------------------------------------
    // Naloge
    // ---------------------------------------------------------------------

    showIntro() {
        const container = this.createPanel(
            'Sirasti koti',
            'Pomagaj miški priti do sira!\n\n' +
            'Pot zapirajo troje vrata. Pri vsakih vratih rešiš naloge o kotih:\n' +
            '1 – prepoznaj vrsto kota,  2 – izmeri kot s kotomerom,  3 – nariši kot.\n\n' +
            'Premikaš se s puščicami ali WASD. Če se zmotiš, ni nič hudega – dobiš razlago in novo nalogo.'
        );
        this.addButton(container, 512, 600, 260, 'Začni (Enter)', () => this.closePanel());
        this.setKeyHandler(event => {
            if (event.key === 'Enter' || event.key === ' ') this.closePanel();
        });
    }

    showTask(gate: Gate) {
        switch (gate.stage) {
            case 'poimenuje':
                this.taskPoimenuje(gate);
                break;
            case 'izmeri':
                this.taskIzmeri(gate);
                break;
            case 'nacrta':
                this.taskNacrta(gate);
                break;
        }
    }

    sampleAngle(type: AngleType): number {
        switch (type) {
            case 'ostri': return Phaser.Math.Between(4, 17) * 5;       // 20°–85°
            case 'pravi': return 90;
            case 'topi': return Phaser.Math.Between(20, 34) * 5;       // 100°–170°
            case 'iztegnjeni': return 180;
            case 'udrti': return Phaser.Math.Between(40, 68) * 5;      // 200°–340°
        }
    }

    /** Vrata 1: poimenuje kot. */
    taskPoimenuje(gate: Gate) {
        const correct = Phaser.Utils.Array.GetRandom(ANGLE_TYPES);
        const deg = this.sampleAngle(correct.type);

        const container = this.createPanel(
            `Vrata 1 – Kateri kot je to?  (${gate.solved}/${REQUIRED_CORRECT})`,
            'Izberi vrsto kota. Lahko klikneš ali pritisneš tipko 1–5.'
        );

        const g = this.add.graphics();
        this.drawAngle(g, 512, 390, 150, deg, 55);
        container.add(g);

        const answer = (chosen: AngleTypeInfo) => {
            if (chosen.type === correct.type) {
                this.handleCorrect(gate, `Da! Kot meri ${deg}°, zato je ${correct.label} – ${correct.rule}.`);
            } else {
                this.handleWrong(
                    gate,
                    `Ta kot meri ${deg}°. To je ${correct.label} kot, ker je ${correct.rule}.\n\n` +
                    `Ti si izbral ${chosen.label} kot – ta je ${chosen.rule}.`
                );
            }
        };

        ANGLE_TYPES.forEach((info, i) => {
            this.addButton(container, 512 + (i - 2) * 158, 640, 148, `${i + 1}  ${info.label}`, () => answer(info));
        });

        this.setKeyHandler(event => {
            const index = Number(event.key) - 1;
            if (index >= 0 && index < ANGLE_TYPES.length) answer(ANGLE_TYPES[index]);
        });
    }

    /** Vrata 2: izmeri kot s kotomerom. */
    taskIzmeri(gate: Gate) {
        const deg = Phaser.Math.Between(1, 17) * 10; // 10°–170°

        // Tipična napaka: branje napačne (notranje) lestvice => 180 - deg
        const options = new Set<number>([deg]);
        if (180 - deg !== deg) options.add(180 - deg);
        while (options.size < 3) {
            const candidate = deg + Phaser.Math.RND.pick([-20, -10, 10, 20]);
            if (candidate >= 10 && candidate <= 170) options.add(candidate);
        }
        const shuffled = Phaser.Utils.Array.Shuffle([...options]);

        const container = this.createPanel(
            `Vrata 2 – Izmeri kot  (${gate.solved}/${REQUIRED_CORRECT})`,
            'Koliko stopinj meri označeni kot? Prvi krak leži na 0°. (tipke 1–3)'
        );

        this.drawProtractor(container, 512, 500, 210);
        const g = this.add.graphics();
        this.drawAngle(g, 512, 500, 210, deg, 45);
        container.add(g);

        const answer = (chosen: number) => {
            if (chosen === deg) {
                this.handleCorrect(gate, `Pravilno, kot meri ${deg}°.`);
            } else {
                let text = `Kot meri ${deg}°. Prvi krak leži na 0° zunanje (bele) lestvice, zato bereš števila na zunanji lestvici.`;
                if (chosen === 180 - deg) {
                    text += `\n\n${chosen}° si prebral na notranji (modri) lestvici, ki se začne na drugi strani.`;
                }
                this.handleWrong(gate, text);
            }
        };

        shuffled.forEach((value, i) => {
            this.addButton(container, 512 + (i - 1) * 200, 640, 180, `${i + 1}   ${value}°`, () => answer(value));
        });

        this.setKeyHandler(event => {
            const index = Number(event.key) - 1;
            if (index >= 0 && index < shuffled.length) answer(shuffled[index]);
        });
    }

    /** Vrata 3: načrta kot dane velikosti. */
    taskNacrta(gate: Gate) {
        const target = Phaser.Math.Between(3, 33) * 5; // 15°–165°
        let current = 0;

        const container = this.createPanel(
            `Vrata 3 – Nariši kot ${target}°  (${gate.solved}/${REQUIRED_CORRECT})`,
            'Z ← in → zavrti drugi krak, da bo kot meril zahtevano velikost. Potrdi z Enter ali preslednico.'
        );

        this.drawProtractor(container, 512, 500, 210);
        const g = this.add.graphics();
        container.add(g);

        const redraw = () => {
            g.clear();
            this.drawAngle(g, 512, 500, 210, current, 45);
        };
        redraw();

        const rotate = (delta: number) => {
            current = Phaser.Math.Clamp(current + delta, 0, 180);
            redraw();
        };

        const confirm = () => {
            if (current === target) {
                this.handleCorrect(gate, `Odlično, narisal si kot ${target}°.`);
            } else {
                this.handleWrong(
                    gate,
                    `Zahtevani kot je ${target}°, ti si nastavil ${current}°.\n\n` +
                    'Začni pri kraku na 0° in štej po zunanji (beli) lestvici, dokler ne prideš do zahtevanega števila.'
                );
            }
        };

        this.addButton(container, 312, 640, 170, '◄  +5°', () => rotate(5));
        this.addButton(container, 512, 640, 170, 'Potrdi', confirm);
        this.addButton(container, 712, 640, 170, '−5°  ►', () => rotate(-5));

        this.setKeyHandler(event => {
            if (event.key === 'ArrowLeft') rotate(5);
            else if (event.key === 'ArrowRight') rotate(-5);
            else if (event.key === 'Enter' || event.key === ' ') confirm();
        });
    }

    handleCorrect(gate: Gate, message: string) {
        gate.solved++;

        if (gate.solved >= REQUIRED_CORRECT) {
            this.closePanel();
            this.openGate(gate);
            return;
        }

        this.showFeedback(gate, 'Pravilno!', `${message}\n\nŠe ${REQUIRED_CORRECT - gate.solved} do odprtja vrat.`);
    }

    handleWrong(gate: Gate, explanation: string) {
        this.mistakes++;
        this.updateHud();
        this.showFeedback(gate, 'Skoraj!', explanation);
    }

    showFeedback(gate: Gate, title: string, text: string) {
        const container = this.createPanel(title, text);
        this.addButton(container, 512, 600, 260, 'Naprej (Enter)', () => this.showTask(gate));
        this.setKeyHandler(event => {
            if (event.key === 'Enter' || event.key === ' ') this.showTask(gate);
        });
    }

    // ---------------------------------------------------------------------
    // Konec igre
    // ---------------------------------------------------------------------

    finishGame() {
        completeLevel('SirastiKoti');
        this.isFinished = true;

        const stars = this.mistakes === 0 ? 3 : this.mistakes <= 3 ? 2 : 1;
        const container = this.createPanel(
            'Bravo! Miška je prišla do sira.',
            `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}\n\nNapake: ${this.mistakes}\n\nVrnitev v glavno igro ...`
        );
        container.setDepth(100);

        this.time.delayedCall(4000, () => this.returnToMainGame());
    }

    /** Edino mesto, kjer igra zapusti sceno – tu se poveže z glavno igro. */
    returnToMainGame() {
        this.closePanel();
        // nazaj v sobo z mišjo luknjo, miška stoji pred luknjo (9,5) in gleda navzdol
        this.scene.start('Game', { roomKey: 'SobaSirastiKoti', spawnX: 9, spawnY: 6, angle: 0 });
    }
}
