import { Scene } from 'phaser';

export class Preloader extends Scene {
    constructor() {
        super('Preloader');
    }

    init() {
        //  We loaded this image in our Boot Scene, so we can display it here
        this.add.image(512, 384, 'background');

        //  A simple progress bar. This is the outline of the bar.
        this.add.rectangle(512, 384, 468, 32).setStrokeStyle(1, 0xffffff);

        //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
        const bar = this.add.rectangle(512 - 230, 384, 4, 28, 0xffffff);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
            bar.width = 4 + (460 * progress);

        });
    }

    preload() {
        //  Load the assets for the game - Replace with your own assets
        this.load.setPath('assets');

        // Tako se uporabi spriteSheet (mouse-click je ime, drugo je pa path do spritesheeta,
        //                              spodaj pa še podaš kok pikslov je za en sprite)
        this.load.spritesheet('mouse-click', 'Keyboard&Mouse/mouse/mouse_animation.png', {
            frameWidth: 16,
            frameHeight: 16
        });

        this.load.image(
            'room-tiles',
            'Furtniture_Spritesheets/Spritesheets/floor&walls_spritesheet.png'
        );

        this.load.image(
            'decoration',
            'Furtniture_Spritesheets/Spritesheets/UsableDecoration.png'
        )

        this.load.image('mouse', 'Mouse/mouse_topdown_32x32.png');

        // TineGames
        this.load.tilemapTiledJSON('map', 'TineGames/map.tmj');
        this.load.image('I_32', 'TineGames/Texture/I_32.png');
        this.load.image('V_32', 'TineGames/Texture/V_32.png');
        this.load.image('X_32', 'TineGames/Texture/X_32.png');
        this.load.image('TX Tileset Wall', 'TineGames/Texture/TX Tileset Wall.png');
        this.load.image('TX Tileset Grass', 'TineGames/Texture/TX Tileset Grass.png');
        this.load.image('TX Plant', 'TineGames/Texture/TX Plant.png');
        this.load.image('TX Struct', 'TineGames/Texture/TX Struct.png');
        this.load.spritesheet('TX Props', 'TineGames/Texture/TX Props.png', {
            frameWidth: 32,
            frameHeight: 32
        });
        this.load.image('TX Struct 2', 'TineGames/Texture/TX Struct Sideways.png');

        // Naloži vse sobe
        this.loadRooms();

    }

    create() {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        // Tako naredis animacijo
        this.anims.create({
            key: 'mouse-click-anim', // ime
            frames: this.anims.generateFrameNumbers('mouse-click', { start: 4, end: 7 }), // kateri spritesheet, od kod do kod
            frameRate: 6,
            repeat: -1 // -1
        });

        //http://localhost:8081/?scene=SirnaTehtnica
        const testScene = new URLSearchParams(window.location.search).get('scene');
        this.scene.start(testScene && this.scene.get(testScene) ? testScene : 'MainMenu');
    }

    loadRooms() {
        this.load.tilemapTiledJSON('SobaSkrivnePretvorbe', 'Rooms/SobaSkrivnePretvorbe.json');
        this.load.tilemapTiledJSON('SobaSirastiKoti', 'Rooms/SobeSirastiKoti.json');
        this.load.tilemapTiledJSON('Hodnik1', 'Rooms/Hodnik1.json');
        this.load.tilemapTiledJSON('SobaSirnaTehtnica', 'Rooms/SobaSirnaTehtnica.json');
        this.load.tilemapTiledJSON('SobaProgress', 'Rooms/SobaProgress.json');
        this.load.tilemapTiledJSON('Start_Room', 'Rooms/StartRoom.json');
    }
}
