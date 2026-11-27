import Cairo from 'cairo';
import { Cfg, SNOW_AMOUNTS, SnowWorld, Snowball } from '../lib/snowWorld.js';
import { SnowRenderer } from '../lib/renderer.js';

function assert(cond, msg) {
    if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function testFlakesAndPiles() {
    Cfg.TargetFlakes = SNOW_AMOUNTS.medium;
    const world = new SnowWorld(1280, 720);
    assert(world.flakes.length === SNOW_AMOUNTS.medium, 'Initializes target flake count');

    const wins = [
        { id: 1, l: 100, t: 150, r: 600, b: 500, width: 500 },
        { id: 2, l: 400, t: 250, r: 900, b: 600, width: 500 },
    ];

    for (let i = 0; i < 120; i++) {
        world.update(1 / 24, () => wins, () => 680, 0, 0);
    }

    assert(world.piles.has(1), 'Creates snow pile for window 1');
    assert(world.piles.has(2), 'Creates snow pile for window 2');
    assert(world.groundIsTaskbar === true, 'Detects bottom taskbar/dock');
    assert(world.ground.topY === 680, 'Ground sits on taskbar top');
}

function testOcclusionAndWindowFling() {
    const world = new SnowWorld(1280, 720);
    // Window 1 in front overlaps left side of window 2
    let wins = [
        { id: 1, l: 100, t: 100, r: 450, b: 400, width: 350 },
        { id: 2, l: 300, t: 200, r: 800, b: 550, width: 500 },
    ];
    world.update(0.1, () => wins, () => null, 0, 0);
    const p2 = world.piles.get(2);
    assert(p2.occ[0] === 1, 'Occluded left edge of back window is marked hidden');
    assert(p2.occ[p2.count - 1] === 0, 'Exposed right edge of back window is not occluded');

    const p1 = world.piles.get(1);
    for (let c = 10; c < 50; c++) p1.add(c, 10);
    const beforeTotal = p1.total;
    assert(beforeTotal > 0, 'Added snow to front window');

    // Move window 1 -> flings snow off as clumps
    wins = [
        { id: 1, l: 160, t: 120, r: 510, b: 420, width: 350 },
        { id: 2, l: 300, t: 200, r: 800, b: 550, width: 500 },
    ];
    world.update(0.1, () => wins, () => null, 0, 0);
    assert(p1.total === 0, 'Moving window clears its snow pile');
    assert(world.flakes.some((f) => f.clump), 'Moving window spawns falling snow clumps');
}

function testRollPushStackSnowman() {
    const world = new SnowWorld(1280, 720);
    const wins = [{ id: 1, l: 100, t: 200, r: 700, b: 600, width: 600 }];
    world.update(0.1, () => wins, () => 680, 0, 0);

    const p1 = world.piles.get(1);
    for (let c = 5; c < 180; c++) p1.add(c, 12);

    // Roll 3 snowballs on window 1, lifting cursor off snow between rolls
    for (let x = 150; x <= 230; x += 6) world.update(1 / 24, () => wins, () => 680, x, p1.topY - 2);
    world.update(1 / 24, () => wins, () => 680, 230, p1.topY + 40);
    for (let x = 310; x <= 390; x += 6) world.update(1 / 24, () => wins, () => 680, x, p1.topY - 2);
    world.update(1 / 24, () => wins, () => 680, 390, p1.topY + 40);
    for (let x = 470; x <= 540; x += 6) world.update(1 / 24, () => wins, () => 680, x, p1.topY - 2);
    world.update(1 / 24, () => wins, () => 680, 540, p1.topY + 40);

    assert(world.balls.length === 3, `Expected 3 rolled snowballs, got ${world.balls.length}`);
    const [r1, r2, r3] = world.balls;
    assert(r1.r > Cfg.BallStartRadius, 'Rolled snowball grew from snow pile');

    assert(world.mouseDown(r2.x, r2.y), 'Grabbed snowball 2');
    world.update(1 / 24, () => wins, () => 680, r1.x, r1.y - r1.r - r2.r);
    world.mouseUp();
    assert(r2.below === r1, 'Snowball 2 stacked on snowball 1');

    assert(world.mouseDown(r3.x, r3.y), 'Grabbed snowball 3');
    world.update(1 / 24, () => wins, () => 680, r2.x, r2.y - r2.r - r3.r);
    world.mouseUp();
    assert(r3.below === r2 && r2.decor === 2 && r3.decor === 1, '3 stacked balls form snowman body & head');
}

function testFairyLightsAndCairoRender() {
    const world = new SnowWorld(1280, 720);
    world.lightsOn = true;
    const wins = [{ id: 1, l: 100, t: 150, r: 600, b: 500, width: 500 }];
    for (let i = 0; i < 40; i++) world.update(1 / 24, () => wins, () => 680, 0, 0);

    const ls = world.lights.get(1);
    assert(ls && ls.bulbs.length > 5 && ls.wire.length > 10, 'Fairy light string & bulbs generated');

    const b1 = new Snowball();
    b1.x = 300; b1.y = 665; b1.r = 16; b1.pile = world.ground;
    const b2 = new Snowball();
    b2.x = 300; b2.y = 640; b2.r = 13; b2.below = b1; b2.decor = 2;
    const b3 = new Snowball();
    b3.x = 300; b3.y = 618; b3.r = 10; b3.below = b2; b3.decor = 1;
    world.balls.push(b1, b2, b3);

    const surf = new Cairo.ImageSurface(Cairo.Format.ARGB32, 1280, 720);
    const cr = new Cairo.Context(surf);
    const renderer = new SnowRenderer();
    renderer.renderWorld(cr, world);
    cr.$dispose();
    renderer.destroy();
}

testFlakesAndPiles();
testOcclusionAndWindowFling();
testRollPushStackSnowman();
testFairyLightsAndCairoRender();
print('ALL_TESTS_PASSED');
