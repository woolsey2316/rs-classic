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
    return tile.overlay && definition.colour
        ? definition.colour
        : tile.getTerrainColour();
}

// Export a 3x3-sector, 144x144-tile region around Lumbridge. Keeping the
// browser payload regional makes it fast; the same format can later be emitted
// per sector for streaming the whole RSC world.
function export3dRegion({
    minSectorX = 49,
    maxSectorX = 51,
    minSectorY = 49,
    maxSectorY = 51,
    plane = 0
} = {}) {
    const sectorSize = 48;
    const width = (maxSectorX - minSectorX + 1) * sectorSize;
    const depth = (maxSectorY - minSectorY + 1) * sectorSize;
    const palette = [];
    const paletteIndexes = new Map();
    const heights = new Array(width * depth).fill(0);
    const colours = new Array(width * depth).fill(0);
    const blocked = new Array(width * depth).fill(1);
    const overlays = new Array(width * depth).fill(0);
    const roofs = new Array(width * depth).fill(0);
    const walls = [];

    function paletteIndex(css) {
        if (!paletteIndexes.has(css)) {
            paletteIndexes.set(css, palette.length);
            palette.push(parseColour(css));
        }
        return paletteIndexes.get(css);
    }

    for (let sectorX = minSectorX; sectorX <= maxSectorX; sectorX += 1) {
        for (let sectorY = minSectorY; sectorY <= maxSectorY; sectorY += 1) {
            const sector = landscape.sectors[sectorX][sectorY][plane];
            if (!sector) continue;

            // RSC's sector x axis points west (sectors[x - 1] is the eastern
            // neighbour), so lay the columns out in descending sector order to
            // keep west on the left, the way the game's own map is drawn.
            const offsetX = (maxSectorX - sectorX) * sectorSize;
            const offsetZ = (sectorY - minSectorY) * sectorSize;

            for (let x = 0; x < sectorSize; x += 1) {
                for (let z = 0; z < sectorSize; z += 1) {
                    const tile = sector.tiles[x][z];
                    const worldX = offsetX + x;
                    const worldZ = offsetZ + z;
                    const index = worldZ * width + worldX;
                    const definition = tile.getTileDef();

                    heights[index] = tile.elevation;
                    colours[index] = paletteIndex(tileColour(tile));
                    overlays[index] = tile.overlay;
                    roofs[index] = tile.wall.roof || 0;
                    blocked[index] = definition.blocked ? 1 : 0;

                    // Wall IDs are 1-based indexes into config.wallObjects.
                    if (tile.wall.vertical) {
                        walls.push([
                            worldX + 1, worldZ, worldX + 1, worldZ + 1,
                            tile.elevation, tile.wall.vertical
                        ]);
                    }
                    if (tile.wall.horizontal) {
                        walls.push([
                            worldX, worldZ, worldX + 1, worldZ,
                            tile.elevation, tile.wall.horizontal
                        ]);
                    }
                    if (tile.wall.diagonal) {
                        const slash = tile.wall.diagonal.direction === '/';
                        walls.push(slash
                            ? [worldX, worldZ + 1, worldX + 1, worldZ, tile.elevation, tile.wall.diagonal.overlay]
                            : [worldX, worldZ, worldX + 1, worldZ + 1, tile.elevation, tile.wall.diagonal.overlay]);
                    }
                }
            }
        }
    }

    return {
        name: 'Lumbridge and surrounding region',
        format: 1,
        width,
        depth,
        tileSize: 1,
        heightScale: 0.035,
        sectorBounds: {
            minX: minSectorX,
            maxX: maxSectorX,
            minY: minSectorY,
            maxY: maxSectorY,
            plane
        },
        palette,
        heights,
        colours,
        blocked,
        overlays,
        roofs,
        walls,
        spawn: {
            // Lumbridge castle courtyard, relative to this exported region.
            x: 71,
            z: 72
        }
    };
}

const publicDirectory = path.resolve(__dirname, '../../public/landscape');
fs.mkdirSync(publicDirectory, { recursive: true });
const output = path.join(publicDirectory, 'lumbridge-3d.json');
fs.writeFileSync(output, JSON.stringify(export3dRegion()));
console.log(`Wrote ${output}`);