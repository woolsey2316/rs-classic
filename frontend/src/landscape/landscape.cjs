const fs = require('fs');
const path = require('path');
const { Landscape } = require('@2003scape/rsc-landscape');

const landscape = new Landscape();

landscape.loadJag(fs.readFileSync('./land63.jag'),
    fs.readFileSync('./maps63.jag'));
landscape.loadMem(fs.readFileSync('./land63.mem'),
    fs.readFileSync('./maps63.mem'));

landscape.parseArchives();

const lumbridge = landscape.sectors[50][50][0];

fs.writeFileSync('./sector-lumbridge.png', lumbridge.toCanvas().toBuffer());

function parseColour(value) {
    if (!value) return [0, 0, 0];

    if (value.startsWith('#')) {
        return [
            parseInt(value.slice(1, 3), 16),
            parseInt(value.slice(3, 5), 16),
            parseInt(value.slice(5, 7), 16)
        ];
    }

    const channels = value.match(/\d+/g);
    return channels ? channels.slice(0, 3).map(Number) : [0, 0, 0];
}

function tileColour(tile) {
    const definition = tile.getTileDef();
    // Indoor floor overlays are drawn as separate flat meshes; keep grass/terrain
    // visible on the base terrain underneath.
    if (tile.overlay && definition.colour && !definition.indoors) {
        return definition.colour;
    }
    return tile.getTerrainColour();
}

const SECTOR_SIZE = 48;
// Highest sector index is west. Tile columns inside a sector are already mirrored.
const WORLD_MAX_SECTOR_X = 64;
const WORLD_MIN_SECTOR_Y = 37;

function exportSector(sector) {
    const palette = [];
    const paletteIndexes = new Map();
    const heights = new Array(SECTOR_SIZE * SECTOR_SIZE).fill(0);
    const colours = new Array(SECTOR_SIZE * SECTOR_SIZE).fill(0);
    const blocked = new Array(SECTOR_SIZE * SECTOR_SIZE).fill(1);
    const overlays = new Array(SECTOR_SIZE * SECTOR_SIZE).fill(0);
    const roofs = new Array(SECTOR_SIZE * SECTOR_SIZE).fill(0);
    const walls = [];

    function paletteIndex(css) {
        if (!paletteIndexes.has(css)) {
            paletteIndexes.set(css, palette.length);
            palette.push(parseColour(css));
        }
        return paletteIndexes.get(css);
    }

    for (let x = 0; x < SECTOR_SIZE; x += 1) {
        for (let z = 0; z < SECTOR_SIZE; z += 1) {
            const tile = sector.tiles[x][z];
            const index = z * SECTOR_SIZE + x;
            const definition = tile.getTileDef();

            heights[index] = tile.elevation;
            colours[index] = paletteIndex(tileColour(tile));
            overlays[index] = tile.overlay;
            roofs[index] = tile.wall.roof || 0;
            blocked[index] = definition.blocked ? 1 : 0;

            if (tile.wall.vertical) {
                walls.push([
                    x + 1, z, x + 1, z + 1,
                    tile.elevation, tile.wall.vertical
                ]);
            }
            if (tile.wall.horizontal) {
                walls.push([
                    x, z, x + 1, z,
                    tile.elevation, tile.wall.horizontal
                ]);
            }
            if (tile.wall.diagonal) {
                const slash = tile.wall.diagonal.direction === '/';
                walls.push(slash
                    ? [x, z + 1, x + 1, z, tile.elevation, tile.wall.diagonal.overlay]
                    : [x, z, x + 1, z + 1, tile.elevation, tile.wall.diagonal.overlay]);
            }
        }
    }

    return {
        format: 1,
        sectorX: sector.x,
        sectorY: sector.y,
        plane: sector.plane,
        width: SECTOR_SIZE,
        depth: SECTOR_SIZE,
        tileSize: 1,
        heightScale: 0.035,
        palette,
        heights,
        colours,
        blocked,
        overlays,
        roofs,
        walls
    };
}

function worldFromGame(gameX, gameY) {
    const sectorX = Math.floor(gameX / SECTOR_SIZE) + 48;
    const tileX = ((gameX % SECTOR_SIZE) + SECTOR_SIZE) % SECTOR_SIZE;
    const sectorY = Math.floor(gameY / SECTOR_SIZE) + 37;
    const tileZ = ((gameY % SECTOR_SIZE) + SECTOR_SIZE) % SECTOR_SIZE;
    return {
        x: (WORLD_MAX_SECTOR_X - sectorX) * SECTOR_SIZE + (47 - tileX),
        z: (sectorY - WORLD_MIN_SECTOR_Y) * SECTOR_SIZE + tileZ
    };
}

const publicDirectory = path.resolve(__dirname, '../../public/landscape/sectors');
fs.mkdirSync(publicDirectory, { recursive: true });

const listed = [];
for (let plane = 0; plane < landscape.depth; plane += 1) {
    for (let sectorY = landscape.minRegionY; sectorY <= landscape.maxRegionY; sectorY += 1) {
        for (let sectorX = landscape.minRegionX; sectorX <= landscape.maxRegionX; sectorX += 1) {
            const sector = landscape.sectors[sectorX][sectorY][plane];
            if (!sector || sector.empty) continue;
            const directory = path.join(publicDirectory, String(plane), String(sectorX));
            fs.mkdirSync(directory, { recursive: true });
            fs.writeFileSync(
                path.join(directory, `${sectorY}.json`),
                JSON.stringify(exportSector(sector))
            );
            listed.push({ x: sectorX, y: sectorY, plane });
        }
    }
}

const index = {
    name: 'RuneScape Classic',
    sectorSize: SECTOR_SIZE,
    maxSectorX: WORLD_MAX_SECTOR_X,
    minSectorY: WORLD_MIN_SECTOR_Y,
    minRegionX: landscape.minRegionX,
    // Lumbridge castle courtyard.
    spawn: worldFromGame(120, 648),
    sectors: listed
};
const indexPath = path.join(publicDirectory, 'index.json');
fs.writeFileSync(indexPath, JSON.stringify(index));
console.log(`Wrote ${listed.length} sectors to ${publicDirectory}`);