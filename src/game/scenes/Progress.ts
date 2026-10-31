import * as Phaser from 'phaser';

export type GameId = 'SkrivnePretvorbe' | 'SirastiKoti' | 'SirnaTehtnica';

interface LevelProgress {
    name: string;
    maxStars: number;
    completedLevels: Set<number>;
}

export const PROGRESS: Record<GameId, LevelProgress> = {
    SkrivnePretvorbe: {
        name: 'Skrivne pretvorbe',
        maxStars: 1,
        completedLevels: new Set()
    },
    SirastiKoti: {
        name: 'Sirasti koti',
        maxStars: 1,
        completedLevels: new Set()
    },
    SirnaTehtnica: {
        name: 'Sirna tehtnica',
        maxStars: 2,
        completedLevels: new Set()
    }
};

export function completeLevel(gameId: GameId, difficulty: number = 1) {
    PROGRESS[gameId].completedLevels.add(difficulty);
    console.log(`[Progress] Končano: ${gameId} (težavnost ${difficulty})`);
}

export function resetProgress() {
    Object.values(PROGRESS).forEach(p => p.completedLevels.clear());
}

const STAR_TILES = {
    empty: [
        [542, 543],
        [560, 561],
        [578, 579]
    ],
    half: [
        [540, 541],
        [558, 559],
        [576, 577]
    ],
    full: [
        [538, 539],
        [556, 557],
        [574, 575]
    ]
};

function setStarFrame(
    layer: Phaser.Tilemaps.TilemapLayer,
    startX: number,
    startY: number,
    type: 'empty' | 'half' | 'full'
) {
    const tiles = STAR_TILES[type];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) {
            layer.putTileAt(tiles[row][col], startX + col, startY + row);
        }
    }
}

export function updateProgressRoomStars(decorationLayer: Phaser.Tilemaps.TilemapLayer | null) {
    if (!decorationLayer) return;

    const starPositions: { gameId: GameId; x: number; y: number }[] = [
        { gameId: 'SkrivnePretvorbe', x: 2, y: 4 },
        { gameId: 'SirastiKoti',      x: 6, y: 4 },
        { gameId: 'SirnaTehtnica',    x: 10, y: 4 }
    ];

    for (const pos of starPositions) {
        const prog = PROGRESS[pos.gameId];
        const stars = prog.completedLevels.size;

        let type: 'empty' | 'half' | 'full' = 'empty';
        if (stars >= prog.maxStars) {
            type = 'full';
        } else if (stars > 0) {
            type = 'half';
        }

        setStarFrame(decorationLayer, pos.x, pos.y, type);
    }
}