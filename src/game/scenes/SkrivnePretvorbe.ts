import * as Phaser from 'phaser';
import { Scene } from 'phaser';

export class SkrivnePretvorbe extends Scene {

    player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

    // Začetna pozicija igralca
    tileX: number = 6;
    tileY: number = 5;
    
    tileSizeOnScreen: number = 64;
    mapScale: number = 2;

    collisionGroup!: Phaser.Physics.Arcade.StaticGroup;

    // Kocke (rimske številke)
    numerals: Phaser.GameObjects.Sprite[] = [];
    heldNumeral: Phaser.GameObjects.Sprite | null = null;
    spaceKey!: Phaser.Input.Keyboard.Key;

    altars: { area: Phaser.Geom.Ellipse; sequence: string[]; slots: Phaser.GameObjects.Sprite[]; filled: number }[] = [];

    isFinished: boolean = false;
    isIntroOpen: boolean = false;

    cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd!: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };

    constructor() {
        super('SkrivnePretvorbe');
    }
    create() {
        this.isFinished = false;
        this.heldNumeral = null;
        this.numerals = [];

        const map = this.make.tilemap({ key: 'map' });

        const tilesetNames = [
            'TX Tileset Wall',
            'TX Tileset Grass',
            'TX Plant',
            'TX Struct',
            'TX Props',
            'TX Struct 2'
        ];
        const tilesets = tilesetNames
            .map(name => map.addTilesetImage(name))
            .filter(tileset => tileset !== null);

        map.layers.forEach((layer, index) => {
            const created = map.createLayer(layer.name, tilesets, 0, 0);
            created?.setDepth(index);
        });
        const mapWidth = map.widthInPixels;
        const mapHeight = map.heightInPixels;

        this.collisionGroup = this.physics.add.staticGroup();
        const collisionLayer = map.getObjectLayer('Collisions');
        const scale = map.layers[0]?.tilemapLayer?.scaleX ?? 1;

        (collisionLayer?.objects ?? []).forEach((object: any) => {
            if (object.polygon && object.polygon.length > 0) {
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                object.polygon.forEach((pt: any) => {
                    minX = Math.min(minX, pt.x);
                    maxX = Math.max(maxX, pt.x);
                    minY = Math.min(minY, pt.y);
                    maxY = Math.max(maxY, pt.y);
                });
                const polyW = maxX - minX;
                const polyH = maxY - minY;
                const steps = 4;
                const stepW = polyW / steps;
                for (let i = 0; i < steps; i++) {
                    const segMinX = minX + i * stepW;
                    const frac = i / steps;
                    const topY = minY + frac * polyH;
                    const segH = maxY - topY;
                    const box = this.add.rectangle(
                        (object.x + segMinX) * scale,
                        (object.y + topY) * scale,
                        stepW * scale,
                        segH * scale
                    ).setOrigin(0, 0);
                    box.setVisible(false);
                    this.physics.add.existing(box, true);
                    this.collisionGroup.add(box);
                }
            } else {
                const width = object.width || 32;
                const height = object.height || 32;

                const scaledX = object.x * scale;
                const scaledY = object.y * scale;
                const scaledW = width * scale;
                const scaledH = height * scale;

                const wall = this.add.rectangle(scaledX, scaledY, scaledW, scaledH).setOrigin(0, 0);
                wall.setVisible(false);
                this.physics.add.existing(wall, true);
                this.collisionGroup.add(wall);
            }
        });

        const scoreObjects = map.createFromObjects('Score', { gid: 924 }) as Phaser.GameObjects.Sprite[];
        scoreObjects.forEach(object => {
            object.setPosition(object.x * scale, object.y * scale);
            object.setScale(scale);
            object.setDepth(map.layers.length);
        });

        this.altars = (map.getObjectLayer('Sensors')?.objects ?? [])
            .filter(obj => obj.name?.startsWith('altar_'))
            .map(obj => {
                const w = obj.width! * scale;
                const h = obj.height! * scale;
                const area = new Phaser.Geom.Ellipse(obj.x! * scale + w / 2, obj.y! * scale + h / 2, w, h);
                const sequence = this.toRoman(Number(obj.name.split('_')[1])).split('');
                const slots = [...scoreObjects]
                    .sort((a, b) =>
                        Phaser.Math.Distance.Between(a.x, a.y, area.x, area.y) -
                        Phaser.Math.Distance.Between(b.x, b.y, area.x, area.y))
                    .slice(0, sequence.length)
                    .sort((a, b) => a.x - b.x);
                return { area, sequence, slots, filled: 0 };
            });

        const textStyle = {
            fontSize: `${16 * scale}px`,
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3 * scale,
            fontStyle: 'bold',
            resolution: 3
        };

        this.add.text(358 * scale, (40 - 3) * scale, '12', textStyle).setDepth(map.layers.length + 5);
        this.add.text(837 * scale, (72 - 3) * scale, '14', textStyle).setDepth(map.layers.length + 5);
        this.add.text(71 * scale, (392 - 3) * scale, '25', textStyle).setDepth(map.layers.length + 5);

        const startX = (this.tileX + 0.5) * this.tileSizeOnScreen;
        const startY = (this.tileY + 0.5) * this.tileSizeOnScreen;

        this.player = this.physics.add.sprite(startX, startY, 'mouse');
        this.player.setScale(1);
        this.player.setDepth(100);
        this.player.body.setSize(20, 20);
        this.player.body.setOffset(6, 6);

        this.player.setCollideWorldBounds(true);
        this.physics.world.setBounds(0, 0, mapWidth, mapHeight);

        this.physics.add.collider(this.player, this.collisionGroup);

        const numerals = ['I_32', 'I_32', 'I_32', 'X_32', 'X_32', 'X_32', 'X_32', 'V_32', 'V_32'];
        const numeralScale = 0.5 * scale;
        const size = 32 * numeralScale;
        const placed: Phaser.Geom.Rectangle[] = [];
        const walls = (this.collisionGroup.getChildren() as Phaser.GameObjects.Rectangle[])
            .map(w => new Phaser.Geom.Rectangle(w.x, w.y, w.width, w.height));

        numerals.forEach(key => {
            for (let attempt = 0; attempt < 200; attempt++) {
                const x = Phaser.Math.Between(0, mapWidth - size);
                const y = Phaser.Math.Between(0, mapHeight - size);
                const rect = new Phaser.Geom.Rectangle(x, y, size, size);

                const hitsWall = walls.some(w => Phaser.Geom.Intersects.RectangleToRectangle(rect, w));
                const hitsOther = placed.some(p => Phaser.Geom.Intersects.RectangleToRectangle(rect, p));
                const nearPlayer = Phaser.Math.Distance.Between(x + size / 2, y + size / 2, startX, startY) < size * 2;

                if (!hitsWall && !hitsOther && !nearPlayer) {
                    placed.push(rect);
                    this.numerals.push(
                        this.add.sprite(x + size / 2, y + size / 2, key).setOrigin(0.5, 0.5).setScale(numeralScale).setDepth(map.layers.length + 1)
                    );
                    break;
                }
            }
        });

        const cam = this.cameras.main;
        cam.setBounds(0, 0, mapWidth, mapHeight);
        cam.setZoom(2);
        cam.setRoundPixels(false);
        cam.startFollow(this.player, false);
        cam.centerOn(this.player.x, this.player.y);
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as any;
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        const updateHeldNumeral = () => {
            if (!this.heldNumeral) return;
            const mouthDist = 20;
            const rot = this.player.rotation;
            this.heldNumeral.setPosition(
                this.player.x - Math.sin(rot) * mouthDist,
                this.player.y + Math.cos(rot) * mouthDist
            );
            this.heldNumeral.setDepth(map.layers.length + 1);
            this.tryPlaceOnAltar(this.heldNumeral);
        };
        this.events.on(Phaser.Scenes.Events.POST_UPDATE, updateHeldNumeral);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.events.off(Phaser.Scenes.Events.POST_UPDATE, updateHeldNumeral);
        });

        this.showIntro();
    }

    showIntro() {
        this.isIntroOpen = true;
        const cx = this.cameras.main.width / 2;
        const cy = this.cameras.main.height / 2;

        const shade = this.add.rectangle(cx, cy, 512, 384, 0x000000, 0.45)
            .setScrollFactor(0).setDepth(200);
        const bg = this.add.rectangle(cx, cy, 420, 260, 0x1e1e2e, 0.96)
            .setStrokeStyle(2, 0xffd23f).setScrollFactor(0).setDepth(200);

        const title = this.add.text(cx, cy - 95, 'Skrivne pretvorbe', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd23f',
            fontStyle: 'bold',
            resolution: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

        const subtitle = this.add.text(
            cx,
            cy - 65,
            'Pomagaj miški pretvoriti števila v rimske številke!\n\n' +
            'Po mapi so razpršene škatle z rimskimi števili (I, V, X), ki jih miška pobere ' +
            'ali odloži s Space in jih prinese do oltarjev s števili v pravem vrstnem redu.\n\n' +
            'Za uspešen konec igre moraš pravilno pretvoriti vsa 3 števila.\n' +
            'Premikaš se s tipkami WASD ali puščicami.',
            {
                fontSize: '10px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                align: 'center',
                wordWrap: { width: 380 },
                lineSpacing: 4,
                resolution: 3
            }
        ).setOrigin(0.5, 0).setScrollFactor(0).setDepth(201);

        const btnRect = this.add.rectangle(cx, cy + 90, 130, 26, 0x3b3b5c)
            .setStrokeStyle(1, 0xffffff)
            .setScrollFactor(0)
            .setDepth(201)
            .setInteractive({ useHandCursor: true });

        const btnText = this.add.text(cx, cy + 90, 'Začni (Enter)', {
            fontSize: '11px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            resolution: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(202);

        const closeIntro = () => {
            if (!this.isIntroOpen) return;
            this.isIntroOpen = false;
            Phaser.Input.Keyboard.JustDown(this.spaceKey);
            this.input.keyboard?.off('keydown', onKey);
            shade.destroy();
            bg.destroy();
            title.destroy();
            subtitle.destroy();
            btnRect.destroy();
            btnText.destroy();
        };

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                closeIntro();
            }
        };

        btnRect.on('pointerover', () => btnRect.setFillStyle(0x56568a));
        btnRect.on('pointerout', () => btnRect.setFillStyle(0x3b3b5c));
        btnRect.on('pointerdown', () => this.time.delayedCall(0, closeIntro));

        this.input.keyboard!.on('keydown', onKey);
        this.events.once('shutdown', () => this.input.keyboard?.off('keydown', onKey));
    }

    update() {
        if (this.isFinished || this.isIntroOpen) {
            this.player.setVelocity(0, 0);
            return;
        }

        if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
            if (this.heldNumeral) {
                this.heldNumeral = null;
            } else {
                const playerBounds = this.player.getBounds();
                let closest: Phaser.GameObjects.Sprite | null = null;
                let closestDist = Infinity;
                this.numerals.forEach(n => {
                    if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, n.getBounds())) {
                        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.x, n.y);
                        if (d < closestDist) {
                            closestDist = d;
                            closest = n;
                        }
                    }
                });
                this.heldNumeral = closest;
            }
        }

        const left = this.cursors.left.isDown || this.wasd.A.isDown;
        const right = this.cursors.right.isDown || this.wasd.D.isDown;
        const up = this.cursors.up.isDown || this.wasd.W.isDown;
        const down = this.cursors.down.isDown || this.wasd.S.isDown;

        let vx = 0;
        let vy = 0;

        if (left) vx -= 1;
        if (right) vx += 1;
        if (up) vy -= 1;
        if (down) vy += 1;

        const speed = 250;

        if (vx !== 0 && vy !== 0) {
            vx *= 0.7071;
            vy *= 0.7071;
        }

        this.player.setVelocity(vx * speed, vy * speed);

        if (vx !== 0 || vy !== 0) {
            const angleDeg = Math.atan2(-vx, vy) * (180 / Math.PI);
            this.player.setAngle(angleDeg);
        }
    }

    tryPlaceOnAltar(numeral: Phaser.GameObjects.Sprite) {
        const letter = numeral.texture.key[0];
        const altar = this.altars.find(a => a.area.contains(this.player.x, this.player.y));
        if (!altar || altar.sequence[altar.filled] !== letter) return;

        const slot = altar.slots[altar.filled];
        numeral.setPosition(slot.x, slot.y).setAngle(0).setDepth(slot.depth + 1);
        altar.filled++;

        this.numerals = this.numerals.filter(n => n !== numeral);
        this.heldNumeral = null;

        if (this.altars.every(a => a.filled === a.sequence.length)) {
            this.finishGame();
        }
    }

    finishGame() {
        this.isFinished = true;
        this.player.setVelocity(0, 0);

        const cx = this.cameras.main.width / 2;
        const cy = this.cameras.main.height / 2;

        this.add.rectangle(cx, cy, 420, 150, 0x1e1e2e, 0.96)
            .setScrollFactor(0)
            .setOrigin(0.5, 0.5)
            .setStrokeStyle(2, 0xffd23f)
            .setDepth(200);

        this.add.text(cx, cy - 30, 'Čestitke!', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd23f',
            stroke: '#000000',
            strokeThickness: 3,
            fontStyle: 'bold',
            resolution: 3
        }).setScrollFactor(0).setOrigin(0.5, 0.5).setDepth(201);

        this.add.text(cx, cy + 5, 'Uspešno in pravilno si pretvoril vsa števila!', {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: 380 },
            resolution: 3
        }).setScrollFactor(0).setOrigin(0.5, 0.5).setDepth(201);

        this.time.delayedCall(5000, () => {
            this.scene.start('Game', { roomKey: 'SobaSkrivnePretvorbe', spawnX: 12, spawnY: 6, angle: 0 });
        });
    }

    toRoman(value: number): string {
        const table: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
        let result = '';
        for (const [num, sym] of table) {
            while (value >= num) {
                result += sym;
                value -= num;
            }
        }
        return result;
    }
}
