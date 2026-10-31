import { Scene } from 'phaser';

export interface PauseMenuData {
    parentScene: string;
    returnRoom?: string;
    spawnX?: number;
    spawnY?: number;
}

export class PauseMenu extends Scene {
    private parentScene!: string;
    private returnRoom: string = 'Start_Room';
    private spawnX: number = 7;
    private spawnY: number = 7;

    constructor() {
        super('PauseMenu');
    }

    init(data: PauseMenuData) {
        this.parentScene = data.parentScene || 'Game';
        this.returnRoom = data.returnRoom ?? 'Start_Room';
        this.spawnX = data.spawnX ?? 7;
        this.spawnY = data.spawnY ?? 7;
    }

    create() {
        const { width, height } = this.scale;
        const isMainGame = this.parentScene === 'Game';

        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
            .setInteractive();

        this.add.rectangle(width / 2, height / 2, 360, 320, 0x222222, 0.95)
            .setStrokeStyle(4, 0xffffff);

        this.add.text(width / 2, height / 2 - 110, 'PAVZA', {
            fontFamily: 'Arial Black',
            fontSize: '36px',
            color: '#ffffff'
        }).setOrigin(0.5);

        const buttons = isMainGame
            ? [
                { label: 'Nadaljuj igro', action: () => this.resumeGame() },
                { label: 'Resetiraj igro', action: () => this.restartMainGame() },
                { label: 'Izhod', action: () => this.exitToMainMenu() }
            ]
            : [
                { label: 'Nadaljuj igro', action: () => this.resumeGame() },
                { label: 'Ponovno začni', action: () => this.restartMinigame() },
                { label: 'Pojdi nazaj', action: () => this.goBackToRoom() }
            ];

        buttons.forEach((btn, index) => {
            const y = height / 2 - 30 + index * 65;

            const bg = this.add.rectangle(width / 2, y, 240, 48, 0x444444)
                .setStrokeStyle(2, 0xffffff)
                .setInteractive({ useHandCursor: true });

            this.add.text(width / 2, y, btn.label, {
                fontFamily: 'Arial',
                fontSize: '24px',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            bg.on('pointerover', () => bg.setFillStyle(0x666666));
            bg.on('pointerout', () => bg.setFillStyle(0x444444));
            bg.on('pointerdown', btn.action);
        });

        const onEscClose = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (event.repeat) return;
            event.preventDefault();
            this.resumeGame();
        };

        this.time.delayedCall(100, () => {
            window.addEventListener('keydown', onEscClose);
        });

        this.events.once('shutdown', () => {
            window.removeEventListener('keydown', onEscClose);
        });
    }

    private resumeGame() {
        this.scene.get(this.parentScene)?.input?.keyboard?.resetKeys();
        this.scene.resume(this.parentScene);
        this.scene.stop();
    }

    private restartMainGame() {
        this.scene.stop(this.parentScene);
        this.scene.start('Game', { roomKey: 'Start_Room', spawnX: 7, spawnY: 7, angle: 0 });
    }

    private exitToMainMenu() {
        this.scene.stop(this.parentScene);
        this.scene.start('MainMenu');
    }

    private restartMinigame() {
        this.scene.stop(this.parentScene);
        this.scene.start(this.parentScene);
    }

    private goBackToRoom() {
        this.scene.stop(this.parentScene);
        this.scene.start('Game', {
            roomKey: this.returnRoom,
            spawnX: this.spawnX,
            spawnY: this.spawnY,
            angle: 0
        });
    }
}


export function enablePauseMenu(
    scene: Scene,
    options?: { returnRoom?: string; spawnX?: number; spawnY?: number }
) {
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        if (event.repeat) return;
        if (!scene.sys.isActive()) return;
        if (scene.scene.isActive('PauseMenu')) return;

        event.preventDefault();
        scene.scene.pause();
        scene.scene.launch('PauseMenu', {
            parentScene: scene.scene.key,
            returnRoom: options?.returnRoom,
            spawnX: options?.spawnX,
            spawnY: options?.spawnY
        });
        scene.scene.bringToTop('PauseMenu');
    };

    window.addEventListener('keydown', onKeyDown);

    scene.events.once('shutdown', () => {
        window.removeEventListener('keydown', onKeyDown);
    });
}
