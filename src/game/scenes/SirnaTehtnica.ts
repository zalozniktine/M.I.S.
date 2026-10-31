import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { enablePauseMenu } from './PauseMenu';
import { completeLevel } from './Progress';
/// definicija nivojev, tipov krogov in številskih vrst
type Level = 1 | 2;
type RoundType = 'tehtnica' | 'poltrak' | 'enakovredni' | 'urejanje';
type NumKind = 'ulomek' | 'mesano' | 'decimalno' | 'naravno';

/// število shranimo kot ulomek p/q, da lahko vse vrste primerjamo med sabo
interface Num {
    kind: NumKind;
    p: number;
    q: number;
    whole: number;
    num: number;
    den: number;
}

interface Slot {
    x: number;
    y: number;
    card: Phaser.GameObjects.Container | null;
}

const ROUNDS: Record<Level, RoundType[]> = {
    1: ['tehtnica', 'poltrak', 'tehtnica', 'poltrak', 'tehtnica', 'poltrak', 'tehtnica', 'poltrak'],
    2: ['enakovredni', 'tehtnica', 'poltrak', 'urejanje', 'enakovredni', 'tehtnica', 'poltrak', 'urejanje']
};

const PIVOT = { x: 512, y: 250 };
const BEAM_HALF = 230;
const HANG = 140;              /// razdalja od konca grede do krožnika
const PLATE_W = 210;
const MAX_TILT = 12;
const TRAY_Y = 655;
const SLICE_GAP = 160;
const LINE = { x0: 112, x1: 912, y: 430 };
const MAX_TRIES = 2;           /// po toliko napakah igra pokaže pravilno rešitev
const MOUSE_HOME = { x: 60, y: 650 };

const FONT = 'Arial, sans-serif';
const COLOR_TEXT = '#3b2a14';
const COLOR_GOOD = '#1b7a1b';
const COLOR_WARN = '#b34700';

export const BASIC_FRACTIONS: [number, number][] = [[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5]];
export const REDUCIBLE_FRACTIONS: [number, number][] = [[2, 4], [4, 8], [3, 6], [6, 8], [2, 8], [3, 12], [9, 12], [6, 20], [15, 20]];
export const DEN_FAMILIES: number[][] = [[2, 4, 8], [3, 6, 12], [5, 10], [2, 3, 6], [2, 5, 10]];

/// števila
///Greatest Commond Divider za preverjanje ali se ulomek lahko okrajša in dejansko krajšanje ulomkov
export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function ulomek(num: number, den: number): Num {
    return { kind: 'ulomek', p: num, q: den, whole: 0, num, den };
}

export function mesano(whole: number, num: number, den: number): Num {
    return { kind: 'mesano', p: whole * den + num, q: den, whole, num, den };
}

/// decimalno število podamo v tisočinah, npr. 0,25 => 250
export function decimalno(thousandths: number): Num {
    return { kind: 'decimalno', p: thousandths, q: 1000, whole: 0, num: 0, den: 0 };
}

export function naravno(n: number): Num {
    return { kind: 'naravno', p: n, q: 1, whole: 0, num: 0, den: 0 };
}

export function compare(a: Num, b: Num): number {
    return a.p * b.q - b.p * a.q;
}

export function thousandthsOf(n: Num): number {
    return (n.p * 1000) / n.q;
}

/// decimalni zapis z vejico, npr. 3/4 => "0,75", null če ima več kot 3 decimalke
export function decimalText(p: number, q: number): string | null {
    for (let k = 0; k <= 3; k++) {
        const scaled = p * 10 ** k;
        if (scaled % q === 0) {
            const digits = String(scaled / q).padStart(k + 1, '0');
            return k === 0 ? digits : `${digits.slice(0, -k)},${digits.slice(-k)}`;
        }
    }
    return null;
}

/// "1,4" => 1400 tisočink, null če ima več kot 3 decimalke
export function parseDecimal(text: string): number | null {
    const [whole, fraction = ''] = text.split(',');
    if (fraction.length > 3) return null;
    return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

export function inline(n: Num): string {
    switch (n.kind) {
        case 'ulomek': return `${n.num}/${n.den}`;
        case 'mesano': return `${n.whole} ${n.num}/${n.den}`;
        case 'decimalno': return decimalText(n.p, n.q)!;
        case 'naravno': return `${n.p}`;
    }
}

/// koraki pretvorbe ulomka v decimalno število, npr. 6/8 => ["3/4", "75/100", "0,75"]
export function fractionChain(num: number, den: number): string[] {
    if (num % den === 0) return [`${num / den}`]; /// celota, npr. 4/4 = 1
    const steps: string[] = [];
    const g = gcd(num, den);
    if (g > 1 && ![10, 100, 1000].includes(den)) {
        num /= g;
        den /= g;
        steps.push(`${num}/${den}`);
    }
    if (![10, 100, 1000].includes(den)) {
        const target = [10, 100, 1000].find(t => t % den === 0)!;
        steps.push(`${num * (target / den)}/${target}`);
    }
    steps.push(decimalText(num, den)!);
    return steps;
}

/// razlaga za igralca, npr. "3/4 = 75/100 = 0,75" ali "2 1/4 = 2 + 0,25 = 2,25"
export function conversionSteps(n: Num): string {
    if (n.kind === 'mesano') return `${inline(n)} = ${n.whole} + ${decimalText(n.num, n.den)} = ${decimalText(n.p, n.q)}`;
    if (n.kind === 'ulomek') return [inline(n), ...fractionChain(n.num, n.den)].join(' = ');
    return inline(n);
}

export function korakov(n: number): string {
    const mod = n % 100;
    if (mod === 1) return `${n} korak`;
    if (mod === 2) return `${n} koraka`;
    if (mod === 3 || mod === 4) return `${n} korake`;
    return `${n} korakov`;
}

export const between = (min: number, max: number) => Phaser.Math.Between(min, max);
export const pick = <T>(items: T[]): T => Phaser.Utils.Array.GetRandom(items) as T;
export const shuffle = <T>(items: T[]): T[] => Phaser.Utils.Array.Shuffle([...items]);

export class SirnaTehtnica extends Scene {
    level: Level = 1;
    roundIndex: number = 0;
    roundType: RoundType = 'tehtnica';
    tries: number = 0;
    mistakes: number = 0;
    locked: boolean = false;
    nextReady: boolean = false;

    /// objekti trenutnega kroga, uničijo se ob začetku naslednjega
    roundObjects: Phaser.GameObjects.GameObject[] = [];

    /// tehtnica
    beam: Phaser.GameObjects.Rectangle | null = null;
    balanceGfx: Phaser.GameObjects.Graphics | null = null;
    tilt: number = 0;
    leftItem: Phaser.GameObjects.Container | null = null;
    rightItem: Phaser.GameObjects.Container | null = null;

    mouse: Phaser.GameObjects.Sprite;
    hud: Phaser.GameObjects.Text;
    instruction: Phaser.GameObjects.Text;
    message: Phaser.GameObjects.Text;
    nextButton: Phaser.GameObjects.Container;

    panel: Phaser.GameObjects.Container | null = null;
    keyHandler: ((event: KeyboardEvent) => void) | null = null;
    roundKeyHandler: ((event: KeyboardEvent) => void) | null = null;

    constructor() {
        super('SirnaTehtnica');
    }

    create() {
        /// scene.restart() uporabi isto instanco, zato stanje ponastavimo tukaj
        enablePauseMenu(this, { returnRoom: 'SobaSirnaTehtnica', spawnX: 1, spawnY: 5 });
        this.level = 1;
        this.roundIndex = 0;
        this.mistakes = 0;
        this.locked = false;
        this.nextReady = false;
        this.roundObjects = [];
        this.beam = null;
        this.balanceGfx = null;
        this.leftItem = null;
        this.rightItem = null;
        this.panel = null;
        this.keyHandler = null;
        this.roundKeyHandler = null;

        /// soba (stena shrambe in miza) se nariše s kodo, brez sprite-ov
        this.drawPantry();

        /// miška je edini sprite: assets/Mouse/mouse_topdown_32x32.png (naložen v Preloaderju kot 'mouse')
        this.mouse = this.add.sprite(MOUSE_HOME.x, MOUSE_HOME.y, 'mouse').setScale(2.5).setAngle(180).setDepth(30);

        this.hud = this.add.text(16, 12, '', {
            fontSize: '20px',
            fontFamily: FONT,
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setDepth(60);

        this.instruction = this.add.text(512, 56, '', {
            fontSize: '22px',
            fontFamily: FONT,
            color: COLOR_TEXT,
            fontStyle: 'bold',
            align: 'center'
        }).setOrigin(0.5).setDepth(60);

        this.add.rectangle(512, 135, 944, 96, 0xfff8e6, 0.9).setStrokeStyle(2, 0xc9a96b).setDepth(59);
        this.message = this.add.text(60, 135, '', {
            fontSize: '19px',
            fontFamily: FONT,
            color: COLOR_TEXT,
            wordWrap: { width: 760 }
        }).setOrigin(0, 0.5).setDepth(60);

        this.nextButton = this.createButton(900, 135, 150, 'Naprej ►', () => this.nextRound()).setDepth(61).setVisible(false);

        /// en poslušalec tipkovnice, glede na stanje kliče panel ali krog
        this.input.keyboard!.on('keydown', this.onKeyDown, this);
        this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this.onKeyDown, this));

        /// naslov zavihka med igro, ob izhodu vrnemo prejšnjega
        const previousTitle = document.title;
        document.title = 'Sirna Tehtnica';
        this.events.once('shutdown', () => { document.title = previousTitle; });

        this.updateHud();
        this.cameras.main.fadeIn(150, 0, 0, 0);
        this.showIntro();
    }

    /// ozadje, HUD in sporočila

    /// izris sobe: stena z letvicami in lesena miza spodaj, vse z Phaser Graphics
    drawPantry() {
        const g = this.add.graphics().setDepth(0);
        g.fillStyle(0xf3e3c3, 1);
        g.fillRect(0, 0, 1024, 590);
        g.fillStyle(0xe8d4ab, 1);
        for (let x = 0; x < 1024; x += 64) g.fillRect(x, 0, 2, 590);
        /// miza
        g.fillStyle(0xa0703f, 1);
        g.fillRect(0, 590, 1024, 178);
        g.fillStyle(0x8a5d31, 1);
        g.fillRect(0, 590, 1024, 10);
    }

    updateHud() {
        const total = ROUNDS[this.level].length;
        const round = Math.min(this.roundIndex + 1, total);
        this.hud.setText(`Sirna tehtnica    Težavnost ${this.level}    Krog ${round}/${total}    Napake: ${this.mistakes}`);
    }

    setMessage(text: string, color: string = COLOR_TEXT) {
        this.message.setText(text).setColor(color);
    }

    showNext() {
        this.nextReady = true;
        this.nextButton.setVisible(true);
    }

    onKeyDown(event: KeyboardEvent) {
        if (this.keyHandler) {
            this.keyHandler(event);
        } else if (this.nextReady && (event.key === 'Enter' || event.key === ' ')) {
            this.nextRound();
        } else {
            this.roundKeyHandler?.(event);
        }
    }

    /// panel (okno), enako kot v SirastiKoti

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
        this.keyHandler = null;
        this.panel?.destroy();
        this.panel = null;
    }

    createButton(x: number, y: number, width: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
        const rect = this.add.rectangle(0, 0, width, 52, 0x3b3b5c)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true });
        const text = this.add.text(0, 0, label, {
            fontSize: '22px',
            fontFamily: FONT,
            color: '#ffffff'
        }).setOrigin(0.5);

        rect.on('pointerover', () => rect.setFillStyle(0x56568a));
        rect.on('pointerout', () => rect.setFillStyle(0x3b3b5c));
        /// zamik, da ne uničimo gumba med obdelavo njegovega dogodka
        rect.on('pointerdown', () => this.time.delayedCall(0, onClick));

        return this.add.container(x, y, [rect, text]);
    }

    addButton(container: Phaser.GameObjects.Container, x: number, y: number, width: number, label: string, onClick: () => void) {
        container.add(this.createButton(x, y, width, label, onClick));
    }

    showIntro() {
        const container = this.createPanel(
            'Sirna tehtnica',
            'Miška stoji pred tehtnico. Na eni strani je ulomek, na drugi strani pa mora biti rezina sira, ki tehta prav toliko.\n\n' +
            'Z miško povleci pravo rezino sira na tehtnico ali pa sir postavi na pravo mesto na številskem poltraku. ' +
            'Če se zmotiš, se tehtnica nagne in dobiš namig.\n\n' +
            'Težavnost 1: ulomki in decimalna števila, številski poltrak.\n' +
            'Težavnost 2: enakovredni ulomki, mešana števila, urejanje po velikosti.'
        );
        this.addButton(container, 380, 600, 230, '1  Težavnost 1', () => this.startLevel(1));
        this.addButton(container, 644, 600, 230, '2  Težavnost 2', () => this.startLevel(2));
        this.keyHandler = event => {
            if (event.key === '1' || event.key === 'Enter') this.startLevel(1);
            else if (event.key === '2') this.startLevel(2);
        };
    }

    startLevel(level: Level) {
        this.closePanel();
        this.level = level;
        this.roundIndex = 0;
        this.mistakes = 0;
        this.startRound();
    }

    /// potek krogov

    clearRound() {
        this.tweens.killAll();
        this.time.removeAllEvents();
        this.roundObjects.forEach(obj => obj.destroy());
        this.roundObjects = [];
        this.beam = null;
        this.balanceGfx = null;
        this.leftItem = null;
        this.rightItem = null;
        this.tilt = 0;
        this.locked = false;
        this.nextReady = false;
        this.roundKeyHandler = null;
        this.nextButton.setVisible(false);
        this.mouse.setPosition(MOUSE_HOME.x, MOUSE_HOME.y).setAngle(180);
        this.setMessage('');
    }

    track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
        this.roundObjects.push(obj);
        return obj;
    }

    startRound() {
        this.clearRound();
        this.tries = 0;
        this.roundType = ROUNDS[this.level][this.roundIndex];
        this.updateHud();

        switch (this.roundType) {
            case 'tehtnica':
                this.roundTehtnica();
                break;
            case 'poltrak':
                this.roundPoltrak();
                break;
            case 'enakovredni':
                this.roundEnakovredni();
                break;
            case 'urejanje':
                this.roundUrejanje();
                break;
        }
    }

    nextRound() {
        if (!this.nextReady) return;
        this.roundIndex++;
        if (this.roundIndex >= ROUNDS[this.level].length) {
            this.finishGame();
        } else {
            this.startRound();
        }
    }

    success(text: string) {
        this.locked = true;
        this.setMessage(`Pravilno! ${text}`, COLOR_GOOD);
        this.tweens.add({ targets: this.mouse, y: this.mouse.y - 24, duration: 160, yoyo: true, repeat: 1 });
        this.showNext();
    }

    registerMistake() {
        this.tries++;
        this.mistakes++;
        this.updateHud();
        this.tweens.add({ targets: this.mouse, angle: this.mouse.angle + 12, duration: 70, yoyo: true, repeat: 2 });
    }

    /// risanje števil, sira in modelov

    /// ulomek se izpiše z ulomkovo črto, mešano število s celim delom pred ulomkom
    makeLabel(n: Num, size: number, color: number): Phaser.GameObjects.Container {
        const css = `#${color.toString(16).padStart(6, '0')}`;
        const style = { fontSize: `${size}px`, fontFamily: FONT, color: css, fontStyle: 'bold' };
        const container = this.add.container(0, 0);

        if (n.kind === 'decimalno' || n.kind === 'naravno') {
            container.add(this.add.text(0, 0, inline(n), { ...style, fontSize: `${Math.round(size * 1.2)}px` }).setOrigin(0.5));
            return container;
        }

        const top = this.add.text(0, -2, `${n.num}`, style).setOrigin(0.5, 1);
        const bottom = this.add.text(0, 2, `${n.den}`, style).setOrigin(0.5, 0);
        const lineWidth = Math.max(top.width, bottom.width) + 8;
        const line = this.add.graphics();
        line.lineStyle(3, color, 1);
        line.lineBetween(-lineWidth / 2, 0, lineWidth / 2, 0);
        const fraction = [top, line, bottom];

        if (n.kind === 'mesano') {
            const whole = this.add.text(0, 0, `${n.whole}`, { ...style, fontSize: `${Math.round(size * 1.4)}px` }).setOrigin(0.5);
            const total = whole.width + 6 + lineWidth;
            whole.x = -total / 2 + whole.width / 2;
            fraction.forEach(obj => { obj.x = total / 2 - lineWidth / 2; });
            container.add(whole);
        }

        container.add(fraction);
        return container;
    }

    /// model ulomka: pravokotnik, razdeljen na den enakih delov, od katerih je num pobarvanih
    makeModel(num: number, den: number, width: number): Phaser.GameObjects.Graphics {
        const g = this.add.graphics();
        const h = 24;
        const part = width / den;
        for (let i = 0; i < den; i++) {
            g.fillStyle(i < num ? 0xff9f1c : 0xfff3d0, 1);
            g.fillRect(-width / 2 + i * part, -h / 2, part, h);
        }
        g.lineStyle(2, 0x5a3a00, 1);
        for (let i = 1; i < den; i++) {
            g.lineBetween(-width / 2 + i * part, -h / 2, -width / 2 + i * part, h / 2);
        }
        g.strokeRect(-width / 2, -h / 2, width, h);
        return g;
    }

    /// rezina sira z vrednostjo. Pri enakovrednih ulomkih ima skrit model, ki se pokaže na tehtnici
    /// sir je narisan s kodo: rumen mnogokotnik z luknjami (krogi), na njem je napis števila
    makeCheese(n: Num, x: number, y: number, withModel: boolean = false): Phaser.GameObjects.Container {
        const g = this.add.graphics();
        const points = [
            new Phaser.Math.Vector2(-65, 48),
            new Phaser.Math.Vector2(65, 48),
            new Phaser.Math.Vector2(65, -48),
            new Phaser.Math.Vector2(-65, -16)
        ];
        g.fillStyle(0xffd23f, 1);
        g.fillPoints(points, true);
        g.lineStyle(3, 0xc99a00, 1);
        g.strokePoints(points, true);
        g.fillStyle(0xe0b020, 1);
        g.fillCircle(-50, 32, 6);
        g.fillCircle(52, -32, 6);
        g.fillCircle(52, 34, 4);
        g.fillCircle(-30, 0, 3);

        const label = this.makeLabel(n, 24, 0x5a3a00);
        label.setPosition(6, 12);

        const cheese = this.track(this.add.container(x, y, [g, label]).setDepth(20));
        cheese.setData('num', n);
        cheese.setData('home', { x, y });
        cheese.setData('bottom', 48);

        if (withModel) {
            const model = this.makeModel(n.num, n.den, 130).setPosition(0, 70).setVisible(false);
            cheese.add(model);
            cheese.setData('model', model);
        }
        return cheese;
    }

    /// utež z ulomkom (leva stran tehtnice)
    makeWeight(n: Num, withModel: boolean = false): Phaser.GameObjects.Container {
        const g = this.add.graphics();
        const points = [
            new Phaser.Math.Vector2(-64, 46),
            new Phaser.Math.Vector2(64, 46),
            new Phaser.Math.Vector2(48, -40),
            new Phaser.Math.Vector2(-48, -40)
        ];
        g.fillStyle(0x6d7b8d, 1);
        g.fillPoints(points, true);
        g.lineStyle(3, 0x3d4652, 1);
        g.strokePoints(points, true);
        g.fillStyle(0x6d7b8d, 1);
        g.fillCircle(0, -48, 10);
        g.strokeCircle(0, -48, 10);

        const label = this.makeLabel(n, 26, 0xffffff);
        label.setPosition(0, 4);

        const weight = this.track(this.add.container(0, 0, [g, label]).setDepth(20));
        weight.setData('num', n);
        weight.setData('bottom', 46);

        if (withModel) {
            const model = this.makeModel(n.num, n.den, 130).setPosition(0, 68);
            weight.add(model);
            weight.setData('model', model);
            weight.setData('bottom', 82);
        }
        return weight;
    }

    trayX(index: number, count: number): number {
        return 512 + (index - (count - 1) / 2) * SLICE_GAP;
    }

    /// definiranje mouseDrag poslušalcev: dragstart dvigne objekt, drag ga premika za miško, dragend preveri, kam je spuščen
    makeDraggable(obj: Phaser.GameObjects.Container, onDrop: (obj: Phaser.GameObjects.Container) => boolean, onMove?: (obj: Phaser.GameObjects.Container) => void) {
        obj.setSize(130, 96);
        obj.setInteractive({ draggable: true, useHandCursor: true });

        obj.on('dragstart', () => {
            if (this.locked) return;
            obj.setData('dragging', true);
            obj.setDepth(50);
        });
        obj.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            if (!obj.getData('dragging')) return;
            obj.setPosition(dragX, dragY);
            onMove?.(obj);
        });
        obj.on('dragend', () => {
            if (!obj.getData('dragging')) return;
            obj.setData('dragging', false);
            obj.setDepth(20);
            if (!onDrop(obj)) this.sendHome(obj);
        });
    }

    sendHome(obj: Phaser.GameObjects.Container) {
        if (this.rightItem === obj) this.rightItem = null;
        (obj.getData('model') as Phaser.GameObjects.Graphics | undefined)?.setVisible(false);
        obj.setData('bottom', 48);
        const home = obj.getData('home') as { x: number; y: number };
        this.tweens.add({ targets: obj, x: home.x, y: home.y, duration: 250, ease: 'Quad.easeOut' });
    }

    markTried(obj: Phaser.GameObjects.Container) {
        obj.setAlpha(0.4);
        obj.setData('used', true);
        obj.disableInteractive();
    }

    /// tehtnica

    /// izris tehtnice s kodo: stojalo in podstavek (Graphics), greda (Rectangle) in zlat gumb na vrtišču
    buildBalance(left: Phaser.GameObjects.Container) {
        const frame = this.track(this.add.graphics().setDepth(5));
        frame.fillStyle(0x7a5230, 1);
        frame.fillRect(PIVOT.x - 9, PIVOT.y, 18, 290);
        frame.fillStyle(0x5d3d22, 1);
        frame.fillRoundedRect(PIVOT.x - 110, PIVOT.y + 285, 220, 26, 8);

        this.balanceGfx = this.track(this.add.graphics().setDepth(6));
        this.beam = this.track(this.add.rectangle(PIVOT.x, PIVOT.y, BEAM_HALF * 2 + 20, 14, 0x8d6e63).setStrokeStyle(2, 0x4e342e).setDepth(7));
        const knob = this.track(this.add.graphics().setDepth(8));
        knob.fillStyle(0xffd23f, 1);
        knob.fillCircle(PIVOT.x, PIVOT.y, 11);
        knob.lineStyle(2, 0x4e342e, 1);
        knob.strokeCircle(PIVOT.x, PIVOT.y, 11);

        this.leftItem = left;
        this.tilt = 0;
        this.redrawBalance();
    }

    panEnd(side: -1 | 1): { x: number; y: number } {
        const rad = Phaser.Math.DegToRad(this.tilt);
        return {
            x: PIVOT.x + side * BEAM_HALF * Math.cos(rad),
            y: PIVOT.y + side * BEAM_HALF * Math.sin(rad)
        };
    }

    /// ob vsakem nagibu ponovno nariše vrvice in krožnika ter postavi predmeta na krožnika
    redrawBalance() {
        if (!this.beam || !this.balanceGfx) return;
        this.beam.setAngle(this.tilt);

        const g = this.balanceGfx;
        g.clear();
        ([-1, 1] as const).forEach(side => {
            const end = this.panEnd(side);
            const plateY = end.y + HANG;
            g.lineStyle(2, 0x4e342e, 1);
            g.lineBetween(end.x, end.y, end.x - PLATE_W / 2 + 12, plateY);
            g.lineBetween(end.x, end.y, end.x + PLATE_W / 2 - 12, plateY);
            g.fillStyle(0xb0b7c3, 1);
            g.fillEllipse(end.x, plateY + 6, PLATE_W, 22);
            g.lineStyle(2, 0x6d7380, 1);
            g.strokeEllipse(end.x, plateY + 6, PLATE_W, 22);

            const item = side === -1 ? this.leftItem : this.rightItem;
            item?.setPosition(end.x, plateY - (item.getData('bottom') as number));
        });
    }

    /// desna stran se spusti, če je težja (pozitiven kot zavrti v smeri urinega kazalca)
    tiltFor(left: Num, right: Num): number {
        const diff = right.p / right.q - left.p / left.q;
        if (compare(left, right) === 0) return 0;
        return Math.sign(diff) * Math.min(MAX_TILT, 5 + Math.abs(diff) * 10);
    }

    tiltTo(angle: number) {
        this.tweens.add({
            targets: this,
            tilt: angle,
            duration: 650,
            ease: 'Back.easeOut',
            onUpdate: () => this.redrawBalance()
        });
    }

    isOverRightPlate(obj: Phaser.GameObjects.Container): boolean {
        const end = this.panEnd(1);
        return Phaser.Math.Distance.Between(obj.x, obj.y, end.x, end.y + HANG - 50) < 140;
    }

    placeOnPan(obj: Phaser.GameObjects.Container) {
        this.rightItem = obj;
        const model = obj.getData('model') as Phaser.GameObjects.Graphics | undefined;
        if (model) {
            model.setVisible(true);
            obj.setData('bottom', 82);
        }
        obj.setDepth(20);
        this.redrawBalance();
    }

    /// skupni del za "tehtnica" in "enakovredni": rezine na mizi, ki se vlečejo na desni krožnik
    setupSlices(options: Num[], withModels: boolean, evaluate: (slice: Phaser.GameObjects.Container) => void): Phaser.GameObjects.Container[] {
        const slices = options.map((n, i) => {
            const slice = this.makeCheese(n, this.trayX(i, options.length), TRAY_Y, withModels);
            this.track(this.add.text(slice.x - 58, TRAY_Y - 44, `${i + 1}`, {
                fontSize: '16px',
                fontFamily: FONT,
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3
            }).setDepth(19));
            return slice;
        });

        const drop = (slice: Phaser.GameObjects.Container) => {
            if (this.rightItem || !this.isOverRightPlate(slice)) return false;
            this.placeOnPan(slice);
            evaluate(slice);
            return true;
        };
        slices.forEach(slice => this.makeDraggable(slice, drop));

        /// tipke 1-5 položijo rezino na tehtnico brez vlečenja
        this.roundKeyHandler = event => {
            const slice = slices[Number(event.key) - 1];
            if (!slice || this.locked || this.rightItem || slice.getData('used')) return;
            this.placeOnPan(slice);
            evaluate(slice);
        };
        return slices;
    }

    /// krog: tehtnica (ulomek = decimalno število)

    targetForTehtnica(): Num {
        const r = between(0, 9);
        if (this.level === 1) {
            if (r <= 4) {
                const [num, den] = pick(BASIC_FRACTIONS);
                return ulomek(num, den);
            }
            if (r <= 7) return ulomek(between(1, 9), 10);
            if (r === 8) {
                let k = between(1, 99);
                while (k % 10 === 0) k = between(1, 99);
                return ulomek(k, 100);
            }
            const den = pick([2, 4, 5, 10]);
            return ulomek(den, den); /// celota
        }

        if (r <= 2) {
            const [num, den] = pick([...BASIC_FRACTIONS, [between(1, 9), 10]]);
            return mesano(between(1, 3), num, den);
        }
        if (r <= 4) {
            const den = pick([2, 4, 5, 10]);
            let num = between(den + 1, 3 * den - 1);
            while (num % den === 0) num = between(den + 1, 3 * den - 1);
            return ulomek(num, den);
        }
        if (r <= 6) {
            const [num, den] = pick(REDUCIBLE_FRACTIONS);
            return ulomek(num, den);
        }
        if (r <= 8) {
            let k = between(1, 999);
            while (k % 10 === 0) k = between(1, 999);
            return ulomek(k, 1000);
        }
        let k = between(101, 299);
        while (k % 10 === 0) k = between(101, 299);
        return ulomek(k, 100);
    }

    decimalDistractors(target: Num, count: number): Num[] {
        const correct = thousandthsOf(target);
        const typical: (number | null)[] = [];

        if (target.kind === 'mesano') {
            typical.push(
                parseDecimal(`${target.whole},${target.num}${target.den}`),
                parseDecimal(`${target.whole},${target.den}`),
                parseDecimal(`${target.whole},${target.num}`),
                parseDecimal(`${target.num},${target.den}`)
            );
        } else {
            typical.push(
                parseDecimal(`${target.num},${target.den}`), /// ulomkova črta kot vejica: 1/4 => 1,4
                parseDecimal(`0,${target.num}${target.den}`), /// 1/4 => 0,14
                parseDecimal(`0,${target.den}`), /// 1/4 => 0,4
                parseDecimal(`0,${target.num}`) /// 3/100 => 0,3
            );
        }

        const near = [correct + 100, correct - 100, correct + 10, correct - 10, correct + 1000, correct - 1000, correct + 250];
        const seen = new Set<number>([correct]);
        const result: number[] = [];
        [...shuffle(typical), ...shuffle(near)].forEach(value => {
            if (value === null || value <= 0 || value > 9999 || seen.has(value) || result.length >= count) return;
            seen.add(value);
            result.push(value);
        });
        return result.map(decimalno);
    }

    hintTehtnica(target: Num): string {
        if (target.kind === 'mesano') return 'Celi del napišeš pred decimalno vejico, ulomek pa razširiš na imenovalec 10, 100 ali 1000.';

        const parts: string[] = [];
        if (target.num > target.den) parts.push('Ulomek je večji od 1, zato rezina tehta več kot 1.');
        if ([10, 100, 1000].includes(target.den)) parts.push('Imenovalec 10 pomeni desetine (1 decimalka), 100 stotine (2 decimalki), 1000 tisočine (3 decimalke).');
        else if (gcd(target.num, target.den) > 1) parts.push('Ulomek najprej okrajšaj, nato ga razširi na imenovalec 10, 100 ali 1000.');
        else parts.push('Ulomek razširi tako, da bo imenovalec 10, 100 ali 1000.');
        return parts.join(' ');
    }

    roundTehtnica() {
        const target = this.targetForTehtnica();
        const correct = decimalno(thousandthsOf(target));
        const options = shuffle([correct, ...this.decimalDistractors(target, this.level === 1 ? 3 : 4)]);

        this.instruction.setText('Katera rezina sira tehta toliko kot ulomek? Povleci jo na desni krožnik.');
        this.setMessage('Namig: tehtnica se nagne na težjo stran. Lahko pritisneš tudi tipke 1 - ' + options.length + '.');
        this.buildBalance(this.makeWeight(target));

        const slices = this.setupSlices(options, false, slice => {
            this.locked = true;
            const value = slice.getData('num') as Num;
            this.tiltTo(this.tiltFor(target, value));

            if (compare(value, target) === 0) {
                this.time.delayedCall(700, () => this.success(`${conversionSteps(target)} – tehtnica je v ravnovesju.`));
                return;
            }

            this.registerMistake();
            let text = `Rezina ${inline(value)} je ${compare(value, target) > 0 ? 'težja' : 'lažja'} od ${inline(target)}.`;
            if (target.kind === 'ulomek' && parseDecimal(`${target.num},${target.den}`) === thousandthsOf(value)) text += ' Ulomkova črta ni decimalna vejica!';

            this.time.delayedCall(700, () => {
                if (this.tries >= MAX_TRIES) {
                    this.setMessage(`${text}\nPravilno je: ${conversionSteps(target)}.`, COLOR_WARN);
                    this.time.delayedCall(900, () => {
                        this.markTried(slice);
                        this.sendHome(slice);
                        const right = slices.find(s => compare(s.getData('num') as Num, target) === 0)!;
                        this.placeOnPan(right);
                        this.tiltTo(0);
                        this.showNext();
                    });
                    return;
                }
                this.setMessage(`${text}\nNamig: ${this.hintTehtnica(target)}`, COLOR_WARN);
                this.time.delayedCall(800, () => {
                    this.markTried(slice);
                    this.sendHome(slice);
                    this.tiltTo(0);
                    this.locked = false;
                });
            });
        });
    }

    /// krog: enakovredni ulomki (z modelom)

    roundEnakovredni() {
        const den = pick([2, 3, 4, 5, 6]);
        const k = pick([2, 3, 4].filter(f => den * f <= 12));
        const num = between(1, den - 1);
        const target = ulomek(num, den);
        const correct = ulomek(num * k, den * k);

        const candidates: [number, number][] = [
            [num + k, den + k], [num + 1, den + 1], [num, den * k], [num * k, den],
            [num * k + 1, den * k], [num * k - 1, den * k], [num * k, den * k + 1], [num * k, den * k - 1]
        ];
        const distractors: Num[] = [];
        shuffle(candidates).forEach(([n, d]) => {
            if (distractors.length >= 3 || n < 1 || n > d || d > 12) return;
            const option = ulomek(n, d);
            if (compare(option, target) === 0 || distractors.some(o => compare(o, option) === 0)) return;
            distractors.push(option);
        });

        this.instruction.setText('Kateri ulomek je enakovreden ulomku na uteži? Povleci rezino na tehtnico.');
        this.setMessage('Na tehtnici se pokaže model ulomka. Enakovredna ulomka imata enako velik pobarvan del.');
        this.buildBalance(this.makeWeight(target, true));

        const slices = this.setupSlices(shuffle([correct, ...distractors]), true, slice => {
            this.locked = true;
            const value = slice.getData('num') as Num;
            this.tiltTo(this.tiltFor(target, value));

            const explanation = `${num}/${den} = ${num}·${k}/${den}·${k} = ${num * k}/${den * k}`;
            if (compare(value, target) === 0) {
                this.time.delayedCall(700, () => this.success(
                    `${explanation}. Števec in imenovalec sta pomnožena z istim številom, pobarvani del je enako velik.`
                ));
                return;
            }

            this.registerMistake();
            const text = `${inline(value)} ni enakovreden ${inline(target)} - pobarvana dela nista enako velika.`;
            this.time.delayedCall(900, () => {
                if (this.tries >= MAX_TRIES) {
                    this.setMessage(`${text}\nPravilno je: ${explanation}.`, COLOR_WARN);
                    this.time.delayedCall(1200, () => {
                        this.markTried(slice);
                        this.sendHome(slice);
                        this.placeOnPan(slices.find(s => compare(s.getData('num') as Num, target) === 0)!);
                        this.tiltTo(0);
                        this.showNext();
                    });
                    return;
                }
                this.setMessage(`${text}\nNamig: števec in imenovalec pomnoži z istim številom.`, COLOR_WARN);
                this.time.delayedCall(1200, () => {
                    this.markTried(slice);
                    this.sendHome(slice);
                    this.tiltTo(0);
                    this.locked = false;
                });
            });
        });
    }

    /// številski poltrak

    targetForPoltrak(): { target: Num; units: number; div: number } {
        const r = between(0, 9);
        if (this.level === 1) {
            if (r <= 5) {
                const den = pick([2, 3, 4, 5, 6, 8, 10]);
                return { target: ulomek(between(1, den - 1), den), units: 1, div: den };
            }
            return { target: decimalno(between(1, 9) * 100), units: 1, div: 10 };
        }

        if (r <= 3) {
            const den = pick([2, 3, 4, 5, 6]);
            return { target: mesano(between(1, 2), between(1, den - 1), den), units: 3, div: den };
        }
        if (r <= 6) {
            const den = pick([2, 3, 4, 5]);
            let num = between(den + 1, 3 * den - 1);
            while (num % den === 0) num = between(den + 1, 3 * den - 1);
            return { target: ulomek(num, den), units: 3, div: den };
        }
        let tenths = between(1, 19);
        while (tenths % 10 === 0) tenths = between(1, 19);
        return { target: decimalno(tenths * 100), units: 2, div: 10 };
    }

    poltrakHint(target: Num): string {
        switch (target.kind) {
            case 'ulomek': {
                if (target.num < target.den) {
                    return `Enota je razdeljena na ${target.den} enakih delov, vsak del je 1/${target.den}. Od 0 naredi ${korakov(target.num)}.`;
                }
                const whole = Math.floor(target.num / target.den);
                const rest = target.num % target.den;
                return `${target.num}/${target.den} = ${whole} ${rest}/${target.den}. Pojdi do ${whole}, nato naredi še ${korakov(rest)} po 1/${target.den}.`;
            }
            case 'mesano':
                return `Pojdi do ${target.whole}, nato naredi še ${korakov(target.num)} po 1/${target.den}.`;
            default: {
                const tenths = (target.p * 10) / target.q;
                const whole = Math.floor(tenths / 10);
                const steps = `${korakov(tenths % 10)} po 0,1`;
                return `Enota je razdeljena na 10 desetin. ${whole === 0 ? `Od 0 naredi ${steps}.` : `Pojdi do ${whole}, nato naredi še ${steps}.`}`;
            }
        }
    }

    tickName(index: number, div: number, decimal: boolean): string {
        if (decimal) return decimalText(index, div)!;
        if (index % div === 0) return `${index / div}`;
        if (index < div) return `${index}/${div}`;
        return `${index}/${div} = ${Math.floor(index / div)} ${index % div}/${div}`;
    }

    roundPoltrak() {
        const { target, units, div } = this.targetForPoltrak();
        const ticks = units * div;
        const step = (LINE.x1 - LINE.x0) / ticks;
        const targetIndex = (target.p * div) / target.q;
        const decimal = target.kind === 'decimalno';
        const tickX = (i: number) => LINE.x0 + i * step;

        this.instruction.setText('Postavi sir na pravo mesto na številskem poltraku.');
        this.setMessage(`Poltrak je razdeljen na ${decimal ? 'desetine' : `${div} enakih delov med sosednjima celima številoma`}. Povleci sir na črtico.`);

        const g = this.track(this.add.graphics().setDepth(5));
        g.lineStyle(4, 0x3b2a14, 1);
        g.lineBetween(LINE.x0, LINE.y, LINE.x1 + 50, LINE.y);
        g.fillStyle(0x3b2a14, 1);
        g.fillTriangle(LINE.x1 + 66, LINE.y, LINE.x1 + 48, LINE.y - 9, LINE.x1 + 48, LINE.y + 9);
        for (let i = 0; i <= ticks; i++) {
            const big = i % div === 0;
            g.lineStyle(big ? 4 : 2, 0x3b2a14, 1);
            g.lineBetween(tickX(i), LINE.y - (big ? 18 : 10), tickX(i), LINE.y + (big ? 18 : 10));
            if (big) {
                this.track(this.add.text(tickX(i), LINE.y + 36, `${i / div}`, {
                    fontSize: '26px',
                    fontFamily: FONT,
                    color: COLOR_TEXT,
                    fontStyle: 'bold'
                }).setOrigin(0.5).setDepth(5));
            }
        }

        const highlight = this.track(this.add.graphics().setDepth(6));
        const nearestTick = (x: number) => Phaser.Math.Clamp(Math.round((x - LINE.x0) / step), 0, ticks);
        const nearLine = (obj: Phaser.GameObjects.Container) => Math.abs(obj.y - (LINE.y - 60)) < 90;
        const mark = (i: number, color: number) => {
            highlight.clear();
            highlight.fillStyle(color, 0.9);
            highlight.fillCircle(tickX(i), LINE.y, 9);
        };

        const cheese = this.makeCheese(target, 512, TRAY_Y);
        const runMouse = (i: number) => {
            this.mouse.setPosition(LINE.x0, LINE.y + 70).setAngle(-90);
            this.tweens.add({ targets: this.mouse, x: tickX(i), duration: 300 + i * 25, ease: 'Linear' });
        };

        this.makeDraggable(cheese, obj => {
            if (!nearLine(obj)) {
                highlight.clear();
                return false;
            }
            const index = nearestTick(obj.x);
            obj.setPosition(tickX(index), LINE.y - 60);
            this.locked = true;

            if (index === targetIndex) {
                mark(index, 0x2ecc40);
                runMouse(index);
                this.time.delayedCall(400, () => this.success(this.poltrakHint(target)));
                return true;
            }

            this.registerMistake();
            mark(index, 0xe74c3c);
            const text = `Sir stoji na ${this.tickName(index, div, decimal)}, iščemo pa ${inline(target)}.`;
            if (this.tries >= MAX_TRIES) {
                this.setMessage(`${text}\nPravilno: ${this.poltrakHint(target)}`, COLOR_WARN);
                this.time.delayedCall(1200, () => {
                    this.tweens.add({ targets: obj, x: tickX(targetIndex), duration: 400 });
                    mark(targetIndex, 0x2ecc40);
                    runMouse(targetIndex);
                    this.showNext();
                });
                return true;
            }
            this.setMessage(`${text}\nNamig: ${this.poltrakHint(target).split('.')[0]}.`, COLOR_WARN);
            this.time.delayedCall(1000, () => {
                highlight.clear();
                this.sendHome(obj);
                this.locked = false;
            });
            return true;
        }, obj => {
            if (nearLine(obj)) mark(nearestTick(obj.x), 0xffb300);
            else highlight.clear();
        });
    }

    /// krog: urejanje po velikosti

    /// štiri različna števila: ali mešani zapisi (z decimalnimi števili) ali ulomki iz iste družine imenovalcev
    valuesForUrejanje(): { values: Num[]; common: number | null } {
        for (let attempt = 0; attempt < 100; attempt++) {
            let values: Num[];
            let common: number | null = null;

            if (between(0, 1) === 0) {
                values = ['ulomek', 'mesano', 'decimalno', 'naravno'].map(kind => {
                    switch (kind) {
                        case 'ulomek': {
                            const den = pick([2, 4, 5, 10]);
                            let n = between(1, 2 * den - 1);
                            while (n % den === 0) n = between(1, 2 * den - 1);
                            return ulomek(n, den);
                        }
                        case 'mesano': {
                            const [n, d] = pick(BASIC_FRACTIONS);
                            return mesano(between(1, 2), n, d);
                        }
                        case 'decimalno':
                            return between(0, 1) === 0 ? decimalno(between(1, 29) * 100) : decimalno(between(1, 299) * 10);
                        default:
                            return naravno(between(1, 2));
                    }
                });
            } else {
                const family = pick(DEN_FAMILIES);
                common = family[family.length - 1];
                values = [0, 1, 2].map(() => {
                    const den = pick(family);
                    return ulomek(between(1, den - 1), den);
                });
                const den = pick(family);
                values.push(between(0, 1) === 0 ? mesano(1, between(1, den - 1), den) : ulomek(between(den + 1, 2 * den - 1), den));
            }

            const distinct = values.every((a, i) => values.every((b, j) => i === j || compare(a, b) !== 0));
            if (distinct) return { values: shuffle(values), common };
        }
        return { values: [ulomek(1, 2), decimalno(750), mesano(1, 1, 4), naravno(2)], common: null };
    }

    explainOrder(sorted: Num[], common: number | null): string {
        return sorted.map(n => {
            if (common !== null) {
                const expanded = `${(n.p * common) / n.q}/${common}`;
                return n.kind === 'ulomek' && n.den === common ? inline(n) : `${inline(n)} = ${expanded}`;
            }
            return n.kind === 'decimalno' || n.kind === 'naravno' ? inline(n) : `${inline(n)} = ${decimalText(n.p, n.q)}`;
        }).join('   <   ');
    }

    roundUrejanje() {
        const { values, common } = this.valuesForUrejanje();
        const sorted = [...values].sort(compare);

        this.instruction.setText('Uredi sir po teži: od najlažjega do najtežjega.');
        this.setMessage(common !== null
            ? 'Povleci rezine na police. Ulomke lahko primerjaš, če jih razširiš na skupni imenovalec.'
            : 'Povleci rezine na police. Števila lahko primerjaš, če jih zapišeš na enak način.');

        const slots: Slot[] = [0, 1, 2, 3].map(i => ({ x: 212 + i * 200, y: 360, card: null }));
        const g = this.track(this.add.graphics().setDepth(5));
        slots.forEach((slot, i) => {
            g.fillStyle(0xe8d4ab, 1);
            g.fillRoundedRect(slot.x - 78, slot.y - 58, 156, 116, 10);
            g.lineStyle(3, 0xa0703f, 1);
            g.strokeRoundedRect(slot.x - 78, slot.y - 58, 156, 116, 10);
            g.fillStyle(0x8a5d31, 1);
            g.fillRect(slot.x - 90, slot.y + 58, 180, 10);
            if (i < 3) {
                this.track(this.add.text(slot.x + 100, slot.y, '<', {
                    fontSize: '40px', fontFamily: FONT, color: COLOR_TEXT, fontStyle: 'bold'
                }).setOrigin(0.5).setDepth(5));
            }
        });
        this.track(this.add.text(slots[0].x, slots[0].y + 90, 'najlažji', { fontSize: '20px', fontFamily: FONT, color: COLOR_TEXT }).setOrigin(0.5).setDepth(5));
        this.track(this.add.text(slots[3].x, slots[3].y + 90, 'najtežji', { fontSize: '20px', fontFamily: FONT, color: COLOR_TEXT }).setOrigin(0.5).setDepth(5));

        const cards = values.map((n, i) => this.makeCheese(n, this.trayX(i, values.length), TRAY_Y));
        const slotOf = (card: Phaser.GameObjects.Container) => slots.find(s => s.card === card);

        const evaluate = () => {
            this.locked = true;
            const wrong = slots.filter((slot, i) => compare(slot.card!.getData('num') as Num, sorted[i]) !== 0);
            if (wrong.length === 0) {
                this.time.delayedCall(300, () => this.success(this.explainOrder(sorted, common)));
                return;
            }

            this.registerMistake();
            wrong.forEach(slot => this.tweens.add({ targets: slot.card, alpha: 0.35, duration: 150, yoyo: true, repeat: 2 }));

            if (this.tries >= MAX_TRIES) {
                this.setMessage(`Pravilni vrstni red:\n${this.explainOrder(sorted, common)}`, COLOR_WARN);
                this.time.delayedCall(1000, () => {
                    sorted.forEach((n, i) => {
                        const card = cards.find(c => compare(c.getData('num') as Num, n) === 0)!;
                        slots[i].card = card;
                        this.tweens.add({ targets: card, x: slots[i].x, y: slots[i].y, alpha: 1, duration: 400 });
                    });
                    this.showNext();
                });
                return;
            }

            this.setMessage(
                `${wrong.length === 1 ? 'Ena rezina ni' : `${wrong.length} rezine niso`} na pravem mestu.\n` +
                (common !== null
                    ? `Namig: ulomke razširi na skupni imenovalec ${common}.`
                    : 'Namig: vsa števila zapiši kot decimalna števila in jih primerjaj.'),
                COLOR_WARN
            );
            this.time.delayedCall(1000, () => {
                wrong.forEach(slot => {
                    this.sendHome(slot.card!);
                    slot.card = null;
                });
                this.locked = false;
            });
        };

        cards.forEach(card => {
            card.on('dragstart', () => {
                if (this.locked) return;
                const slot = slotOf(card);
                if (slot) slot.card = null;
            });
            this.makeDraggable(card, obj => {
                const slot = slots.find(s => Phaser.Math.Distance.Between(obj.x, obj.y, s.x, s.y) < 100);
                if (!slot) return false;
                if (slot.card && slot.card !== obj) this.sendHome(slot.card);
                slot.card = obj;
                this.tweens.add({ targets: obj, x: slot.x, y: slot.y, duration: 120 });
                if (slots.every(s => s.card)) this.time.delayedCall(250, evaluate);
                return true;
            });
        });
    }

    /// konec igre

    finishGame() {
        completeLevel('SirnaTehtnica', this.level);
        this.clearRound();
        this.instruction.setText('');

        const stars = this.mistakes === 0 ? 3 : this.mistakes <= 3 ? 2 : 1;
        const container = this.createPanel(
            'Bravo! Miška je stehtala ves sir.',
            `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}\n\nTežavnost ${this.level}    Napake: ${this.mistakes}`
        );

        if (this.level === 1) this.addButton(container, 380, 600, 230, '2  Težavnost 2', () => this.startLevel(2));
        else this.addButton(container, 380, 600, 230, '1  Ponovi', () => this.startLevel(2));
        this.addButton(container, 644, 600, 230, 'Glavna igra (Enter)', () => this.returnToMainGame());

        this.keyHandler = event => {
            if (event.key === 'Enter') this.returnToMainGame();
            else if (event.key === '2' && this.level === 1) this.startLevel(2);
            else if (event.key === '1' && this.level === 2) this.startLevel(2);
        };
    }

    returnToMainGame() {
        this.closePanel();
        this.scene.start('Game', { roomKey: 'SobaSirnaTehtnica', spawnX: 1, spawnY: 5, angle: 0 });
    }
}
