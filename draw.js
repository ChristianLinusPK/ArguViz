import {
    computeCC,
    computeCCLinear,
    mapRedEdges,
    sortOutToChosenArgs,
    barycenterGroups,
    barycenterWithinGroups,
    barycenterChosenArgs,
    barycenterIn,
    barycenter,
    localSearchRedEdges,
    findOddCircles,
    topologicalSort,
    computeGrounded,
    exactTLCMGLPK
} from './algorithm.js';


const canvas = document.getElementById("graph")
const context = canvas.getContext('2d');
const pipelineTabButton = document.getElementById("pipelineButton");
const exactTabButton = document.getElementById("exactButton");
const actionsTabButton = document.getElementById("actionsButton");
const strategy0Button = document.getElementById("strategy0");
const strategy1Button = document.getElementById("strategy1");
//const strategy2Button = document.getElementById("strategy2");
const priorityONButton = document.getElementById("priorityON");
const priorityOFFButton = document.getElementById("priorityOFF");
const localSearchONButton = document.getElementById("localSearchON");
const localSearchOFFButton = document.getElementById("localSearchOFF");
const editButton = document.getElementById("edit");
const viewButton = document.getElementById("view");
const spaceOutHButton = document.getElementById("spaceOutHorizontal");
const spaceInHButton = document.getElementById("spaceInHorizontal");
const spaceOutVButton = document.getElementById("spaceOutVertical");
const spaceInVButton = document.getElementById("spaceInVertical");
const layoutButton = document.getElementById("layout");
const saveAsImgButton = document.getElementById("saveImg");
const saveIpeButton = document.getElementById("saveIpe");
const fileSelector = document.getElementById('file-selector');
const exampleSelector = document.getElementById("exampleSelect");
const saveAsFileButton = document.getElementById("save");
const rotateButton = document.getElementById("rotate");
const selectRedButton = document.getElementById("selectRed");
const allStepsButton = document.getElementById("allSteps");
const highlightUndecButton = document.getElementById("highlightUndec");
const highlightDefendedButton = document.getElementById("highlightDefended");
const browserSolverButton = document.getElementById("exactBrowser");
//const exactTLCMButton = document.getElementById("exactTLCM");
const exactMLCMButton = document.getElementById("exactMLCM");
const extensionSelect = document.getElementById("extensionSelect");
const exactTimeout = document.getElementById("exactTimeout");
const infoButton = document.getElementById("info");
const infoDialog = document.getElementById("dialogInfo");
const openButton = document.getElementById("open");
const openDialog = document.getElementById("dialogOpen");
const openSelectDialogButton = document.getElementById("open");
//const testFileSelector = document.getElementById("test-file-selector");


exactTimeout.value = "30";

const MODE = {
    Edit: 0,
    View: 1,
}
let mode = MODE.Edit;

let CANVAS_HEIGHT = window.innerHeight * 0.75;
let CANVAS_WIDTH = window.innerWidth * 0.75;
canvas.height = CANVAS_HEIGHT;
canvas.width = CANVAS_WIDTH;

let DISTANCE_BETWEEN_LAYERS = canvas.width * 0.42;
let horizontalSpacing = 1;
let verticalSpacing = 1;
let isRotated = false;

let cameraOffset = {x: canvas.width / 2, y: canvas.height / 2}
let cameraZoom = 0.8
const MAX_ZOOM = 5
const MIN_ZOOM = 0.1
const SCROLL_SENSITIVITY = 0.0005

let colorInOrange = true
let redEdgeStrategy = 0
let preferNotAttacked = false;
let doLocalSearch = true;
let doInitialBarycenter = false;

//================================================================================
// load framework and extension
//================================================================================
let args = [];
let attacks = [];
let inSet = [];
let outSet = [];
let undecSet = [];
let isExtension = false;

async function initializeAf(input) {
    isExtension = false;
    args = [];
    attacks = [];
    resetExt();

    input = input.replace(/[\n\r\s]/g, '');
    let inputSplit = input.split(".");

    let redEdges = [];

    for (let part of inputSplit) {
        let matchArg = /arg\((.+)\)/.exec(part);
        if (matchArg) {
            initializeNewArgument(matchArg[1]);
        } else {
            let matchAtt = /att\*?\(([^,]+),([^)]+)\)/.exec(part);
            if (matchAtt) {
                // 'att*' prefix indicates a highlighted attack
                let att = initializeNewAttack(
                    args.find(a => a.label === matchAtt[1]),
                    args.find(a => a.label === matchAtt[2])
                );
                if (matchAtt[0].startsWith('att*')) {
                    redEdges.push(att);
                }
            }
        }
    }

    //An AF with no extension is visualized as a force directed layout
    if (redEdges.length < 1) {
        await forceDirectedLayout();
        draw();
    }

    return redEdges;
}

async function initializeExt(input) {
    resetExt();
    isExtension = true;

    input.split(" ").forEach(part => {
        const match = part.toLowerCase().match(/^(in|out|undec)\((.+)\)$/);
        if (match) {
            const arg = args.find(a => a.label === match[2]);

            if (match[1] === "in") {
                arg.set = inSet;
            } else if (match[1] === "out") {
                arg.set = outSet;
            } else if (match[1] === "undec") {
                arg.set = undecSet;
            }

            arg.set.push(arg);
        }
    });
    let oldPositions = args.map(arg => ({x: arg.x, y: arg.y}));

    adjustCoordinatesToOrder();

    let newPositions = args.map(arg => ({x: arg.x, y: arg.y}));

    if (colorInOrange) {
        args.forEach(arg => {
            arg.color = arg.set === inSet ? 'rgba(255, 190, 6)' : arg.color;
        })
    }

    output();
    await draw();
    await drawArgumentsMoving(oldPositions, newPositions);
}

// Reset the extension, i.e., clear all arguments from the sets and reset spacing and mode to default
function resetExt() {
    resetRedEdges();
    document.getElementById("crossCount").innerHTML = "";
    args.forEach(arg => arg.color = '#22cccc');
    attacks.forEach(att => att.color = "rgba(0, 153, 153, 0.3)");
    horizontalSpacing = 1;
    mode = MODE.View;
    inSet = [];
    outSet = [];
    undecSet = [];
    isExtension = false;
}

function initializeNewAttack(fromArg, toArg) {
    let attack = {
        from: fromArg,
        to: toArg,
        path: null,
        chosen: false,
        color: "rgba(0, 153, 153, 0.3)"
    };
    attacks.push(attack);
    fromArg.outgoingAttacks.push(attack);
    toArg.incomingAttacks.push(attack);
    return attack;
}

function initializeNewArgument(label) {
    args.push({
        label: label,
        showLabel: false,
        x: 0,
        y: 0,
        path: null,
        selected: false,
        set: null,
        color: '#22cccc',
        incomingAttacks: [],
        outgoingAttacks: []
    });
}

function addArgsToRandomSets() {
    const sets = [undecSet, outSet, inSet];
    for (const arg of args) {
        const i = args.indexOf(arg);
        arg.set = sets[i % 3].push(arg) && sets[i % 3];
    }
}

function removeArgs(argsToRemove) {
    argsToRemove.forEach(argToRemove => {
        args.splice(args.indexOf(argToRemove), 1);
        removeAttacks(attacks.filter(att => (att.from === argToRemove || att.to === argToRemove)));
        argToRemove.set.splice(argToRemove.set.indexOf(argToRemove), 1);
    })
}

function removeAttacks(attsToRemove) {
    attsToRemove.forEach(attToRemove => {
        attacks.splice(attacks.indexOf(attToRemove), 1);
        for (const arg of args) {
            arg.incomingAttacks = arg.incomingAttacks.filter(att => att !== attToRemove);
            arg.outgoingAttacks = arg.outgoingAttacks.filter(att => att !== attToRemove);
        }
    })
}

//================================================================================
// layout
//================================================================================

function adjustCoordinatesToOrder() {

    const setPositions = [
        {set: inSet, x: -DISTANCE_BETWEEN_LAYERS * horizontalSpacing},
        {set: outSet, x: undecSet.length > 0 ? 0 : DISTANCE_BETWEEN_LAYERS * horizontalSpacing},
        {set: undecSet, x: DISTANCE_BETWEEN_LAYERS * horizontalSpacing}
    ];

    let canvasTop = -canvas.height / 2;
    let start = 10 + canvasTop + 20 * horizontalSpacing;
    for (const {set, x} of setPositions) {
        const constantDifference = (canvas.height - (20 * verticalSpacing)) / (set.length + 1);
        for (let i = 0; i < set.length; i++) {
            const arg = set[i];
            arg.x = x;
            arg.y = (start + (i + 1) * constantDifference) * verticalSpacing;
        }
    }
}

async function forceDirectedLayout() {
    let nodes = [];
    for (const arg of args) {
        nodes.push({});
    }

    let links = [];
    for (const att of attacks) {
        links.push(
            {
                source: args.indexOf(att.from),
                target: args.indexOf(att.to)
            });
    }

    let simulation = d3.forceSimulation(nodes)
        .force('charge', d3.forceManyBody().strength(-200 * (horizontalSpacing + verticalSpacing) / 2))
        .force('center', d3.forceCenter(0, 0))
        .force('link', d3.forceLink().links(links))
        .force('collision', d3.forceCollide().radius(5 * (horizontalSpacing + verticalSpacing) / 2))
        .on('tick', ticked);

    function ticked() {
        d3.select('svg')
            .selectAll('circle')
            .data(nodes)
            .join('circle')
            .attr('r', 5)
            .attr('cx', function (d) {
                return d.x
            })
            .attr('cy', function (d) {
                return d.y
            });
    }

    for (let i = 0; i < 100; ++i) {
        simulation.tick();
        for (let i = 0; i < nodes.length; i++) {
            args[i].x = nodes[i].x;
            args[i].y = nodes[i].y;
        }
    }
}


//================================================================================
// drawing
//================================================================================
let currentPath;

async function draw() {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.scale(cameraZoom, cameraZoom);
    context.translate(-canvas.width / 2 + cameraOffset.x, -canvas.height / 2 + cameraOffset.y);

    if (isRotated) {
        context.rotate(Math.PI / 2);
    }

    context.clearRect(0, 0, canvas.width, canvas.height);

    if (isExtension) {
        drawSetLabels();
    }

    for (const att of attacks) {
        currentPath = new Path2D();
        drawAttack(att);
        att.path = currentPath;
    }

    for (const arg of args) {
        currentPath = new Path2D();
        context.fillStyle = arg.selected ? 'grey' : arg.color;
        currentPath.arc(arg.x, arg.y, 10, 0, Math.PI * 2, true);
        context.strokeStyle = '#009999';
        context.fill(currentPath);
        context.stroke(currentPath);
        currentPath.closePath();
        arg.path = currentPath;
        if (arg.showLabel) {
            drawArgumentLabel(arg)
        }
    }


}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function drawArgumentLabel(arg) {
    const size = 15 * (1 / cameraZoom);
    context.font = `${size}px Arial`;

    context.fillStyle = "black";

    if (isRotated) {
        context.save();
        context.translate(arg.x - 5, arg.y);
        context.rotate(-Math.PI / 2);
        context.fillText(arg.label, 0, 0);
        context.restore();
    } else {
        context.fillText(arg.label, arg.x - 5, arg.y);
    }
}

function drawSetLabels() {
    context.beginPath();

    const fontSize = 20;
    context.font = `${fontSize}px Arial`;

    const setLabelPositions = [
        {set: inSet, label: "IN", x: -DISTANCE_BETWEEN_LAYERS},
        {set: outSet, label: "OUT", x: undecSet.length > 0 ? 0 : DISTANCE_BETWEEN_LAYERS},
        {set: undecSet, label: "UNDEC", x: DISTANCE_BETWEEN_LAYERS}
    ];

    setLabelPositions.forEach(setLabel => {
        if (setLabel.set.length !== 0) {
            const y = (-canvas.height + fontSize + (verticalSpacing / 2));
            const x = isRotated ? setLabel.x * (horizontalSpacing) : setLabel.x * (horizontalSpacing) + (setLabel.label === "IN" ? -10 : (setLabel.label === "OUT" ? -20 : -40));
            drawSetLabel(setLabel.label, x, y * (verticalSpacing / 2), isRotated);
        }
    });
}

function drawSetLabel(label, x, y, isRotated) {

    context.save();

    if (isRotated) {
        context.translate(x, y);
        context.rotate(-Math.PI / 2);
        context.fillText(label, 0, 0);
    } else {
        context.fillText(label, x, y);
    }

    context.restore();
}

function drawAttack(attack) {
    let fromArg = attack.from;
    let toArg = attack.to;

    context.strokeStyle = attack.color;

    if (attack.chosen) {
        context.strokeStyle = 'red';
    } else if (isExtension && colorInOrange) {
        if (attack.from.set === inSet) {
            context.strokeStyle = "rgba(255, 190, 6, 0.6)";
        }
    }

    if (fromArg === toArg) {
        drawSelfAttack(fromArg);
    } else if (fromArg.set === toArg.set && isExtension) {
        drawSameSetAttack(fromArg, toArg);
    } else {
        drawDifferentSetAttack(fromArg, toArg);
    }

}

function drawSelfAttack(arg) {
    const x = arg.x + (arg.set === inSet ? -50 : 50);
    drawDirectedBezier(arg, arg, x, arg.y + 2 * 10, x, arg.y - 2 * 10);
}

function drawDifferentSetAttack(fromArg, toArg) {
    if (!isExtension && attackEachOther(fromArg, toArg)) {
        let controlPoint1;
        if (indexIsBefore(fromArg, toArg)) {
            controlPoint1 = findPointPerpendicularToLine(fromArg, toArg, 15 * horizontalSpacing);
        } else {
            controlPoint1 = findPointPerpendicularToLine(fromArg, toArg, -15 * horizontalSpacing);
        }
        const controlPoint2 = controlPoint1;
        drawDirectedBezier(fromArg, toArg, controlPoint1.x, controlPoint1.y, controlPoint2.x, controlPoint2.y);
    } else if (attackEachOther(fromArg, toArg) && fromArg.set !== inSet && indexIsBefore(fromArg, toArg)) {
        const controlPoint1 = findPointPerpendicularToLine(fromArg, toArg, 15 * horizontalSpacing);
        const controlPoint2 = controlPoint1;
        drawDirectedBezier(fromArg, toArg, controlPoint1.x, controlPoint1.y, controlPoint2.x, controlPoint2.y);
    } else {
        drawDirectedLine(fromArg, toArg);
    }
}

function drawSameSetAttack(fromArg, toArg) {
    if (areNeighboursInSet(fromArg, toArg) && !attackEachOther(fromArg, toArg)) {
        drawDirectedLine(fromArg, toArg);
    } else if (areNeighboursInSet(fromArg, toArg) && attackEachOther(fromArg, toArg) && indexIsBefore(fromArg, toArg)) {
        drawDirectedLine(fromArg, toArg);
    } else if (attackEachOther(fromArg, toArg) && indexIsBefore(fromArg, toArg)) {
        // If the attack is between two arguments in the first layer (only possible when no extension is selected) it "goes around" on the left, otherwise on the right
        if (fromArg.set === inSet) {
            drawDirectedBezier(fromArg, toArg, (fromArg.x - Math.abs(toArg.y - fromArg.y) / 2) - 50, fromArg.y + (toArg.y - fromArg.y) / 2, (fromArg.x - Math.abs(toArg.y - fromArg.y) / 2) - 50, fromArg.y + (toArg.y - fromArg.y) / 2);
        } else {
            drawDirectedBezier(fromArg, toArg, fromArg.x + Math.abs(toArg.y - fromArg.y) / 2, fromArg.y + (toArg.y - fromArg.y) / 2, fromArg.x + Math.abs(toArg.y - fromArg.y) / 2, fromArg.y + (toArg.y - fromArg.y) / 2);
        }
    } else {
        if (fromArg.set === inSet) {
            drawDirectedBezier(fromArg, toArg, (fromArg.x - Math.abs(toArg.y - fromArg.y) / 2) - 20, fromArg.y + (toArg.y - fromArg.y) / 2, (fromArg.x - Math.abs(toArg.y - fromArg.y) / 2) - 20, fromArg.y + (toArg.y - fromArg.y) / 2);
        } else {
            drawDirectedBezier(fromArg, toArg, fromArg.x + Math.abs(toArg.y - fromArg.y) / 1.8, fromArg.y + (toArg.y - fromArg.y) / 2, fromArg.x + Math.abs(toArg.y - fromArg.y) / 1.8, fromArg.y + (toArg.y - fromArg.y) / 2);
        }
    }
}


function attackEachOther(arg0, arg1) {
    let att = attacks.find((a) => {
        return a.from === arg0 && a.to === arg1
    })
    let att1 = attacks.find((a) => {
        return a.from === arg1 && a.to === arg0
    })
    return att && att1;
}

function indexIsBefore(arg0, arg1) {
    if (arg0.y === arg1.y) {
        return args.indexOf(arg0) < args.indexOf(arg1);
    }
    return arg0.y < arg1.y;
}

function areNeighboursInSet(arg0, arg1) {
    let set = arg0.set;
    return set.indexOf(arg0) === set.indexOf(arg1) - 1 || set.indexOf(arg0) === set.indexOf(arg1) + 1;
}

function drawDirectedLine(fromArg, toArg) {
    context.lineWidth = 1;
    currentPath.moveTo(fromArg.x, fromArg.y);
    currentPath.lineTo(toArg.x, toArg.y);
    addArrowToLine(fromArg, toArg);
}

function drawDirectedBezier(fromArg, toArg, cp1x, cp1y, cp2x, cp2y) {
    context.lineWidth = 0.5;
    currentPath.moveTo(fromArg.x, fromArg.y);
    if (cp1x === cp2x && cp1y === cp2y) {
        currentPath.quadraticCurveTo(cp1x, cp1y, toArg.x, toArg.y);
    } else {
        currentPath.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toArg.x, toArg.y);
    }
    context.stroke(currentPath);
    addArrowToBezier(fromArg, toArg, cp1x, cp1y, cp2x, cp2y);
}

function addArrowToLine(fromArg, toArg) {
    context.lineWidth = 1;
    let angle = Math.atan2(toArg.y - fromArg.y, toArg.x - fromArg.x);
    let endpoint = getPointOnLineWithDistanceToStart(10, fromArg, toArg);
    drawArrowHead(endpoint.x, endpoint.y, angle);
}

function getPointOnLineWithDistanceToStart(dist, fromArg, toArg) {
    let dist_x = toArg.x - fromArg.x;
    let dist_y = toArg.y - fromArg.y;
    let distStartEnd = Math.sqrt(dist_x * dist_x + dist_y * dist_y);
    dist_x *= (1 - dist / distStartEnd)
    dist_y *= (1 - dist / distStartEnd)
    let px = fromArg.x + dist_x;
    let py = fromArg.y + dist_y;
    return {x: px, y: py}
}

function addArrowToBezier(fromArg, toArg, cp1x, cp1y, cp2x, cp2y) {
    context.lineWidth = 0.8;
    let bezierLength = getBezierLength(fromArg, toArg, cp1x, cp1y, cp2x, cp2y);
    let t = Math.max(0, (bezierLength - 6) / bezierLength);
    t = Math.min(1, t);
    let p = getPointOnBezier(t, fromArg.x, fromArg.y, cp1x, cp1y, cp2x, cp2y, toArg.x, toArg.y);
    let angle = getBezierAngle(t, fromArg.x, fromArg.y, cp1x, cp1y, cp2x, cp2y, toArg.x, toArg.y);
    drawArrowHead(p.x, p.y, angle);
}

function drawArrowHead(px, py, angle) {
    const arrowLen = 7;
    currentPath.moveTo(px, py);
    currentPath.lineTo(px - arrowLen * Math.cos(angle - Math.PI / 7),
        py - arrowLen * Math.sin(angle - Math.PI / 7));
    currentPath.lineTo(px - arrowLen * Math.cos(angle + Math.PI / 7),
        py - arrowLen * Math.sin(angle + Math.PI / 7));
    currentPath.lineTo(px, py);
    currentPath.lineTo(px - arrowLen * Math.cos(angle - Math.PI / 7),
        py - arrowLen * Math.sin(angle - Math.PI / 7));
    context.stroke(currentPath);
}

function getPointOnBezier(t, sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey) {
    return {
        x: Math.pow(1 - t, 3) * sx + 3 * t * Math.pow(1 - t, 2) * cp1x + 3 * t * t * (1 - t) * cp2x + t * t * t * ex,
        y: Math.pow(1 - t, 3) * sy + 3 * t * Math.pow(1 - t, 2) * cp1y + 3 * t * t * (1 - t) * cp2y + t * t * t * ey
    };
}

function getBezierAngle(t, sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey) {
    let dx = Math.pow(1 - t, 2) * (cp1x - sx) + 2 * t * (1 - t) * (cp2x - cp1x) + t * t * (ex - cp2x);
    let dy = Math.pow(1 - t, 2) * (cp1y - sy) + 2 * t * (1 - t) * (cp2y - cp1y) + t * t * (ey - cp2y);
    return -Math.atan2(dx, dy) + 0.5 * Math.PI;
}

function distance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function getBezierLength(fromArg, toArg, cp1x, cp1y, cp2x, cp2y) {
    const numSegments = 100; //Lower values work fine too (10-50)

    let length = 0;
    let t;
    let prevPoint = fromArg;

    for (let i = 1; i <= numSegments; i++) {
        t = i / numSegments;
        const point = getPointOnBezier(t, fromArg.x, fromArg.y, cp1x, cp1y, cp2x, cp2y, toArg.x, toArg.y);
        length += distance(prevPoint, point);
        prevPoint = point;
    }

    return length;
}

//================================================================================
// animation
//================================================================================
async function drawArgumentsMoving(oldPositions, newPositions) {
    let iterations = 120;
    if (args.length > 100) {
        iterations = 80;
    }

    for (let i = 0; i < args.length; i++) {
        args[i].x = oldPositions[i].x;
        args[i].y = oldPositions[i].y;
    }
    await draw();
    await delay(1000);

    for (let i = 0; i < iterations; i++) {
        for (let i = 0; i < args.length; i++) {
            let distanceX = newPositions[i].x - oldPositions[i].x;
            let distanceY = newPositions[i].y - oldPositions[i].y;
            args[i].x += distanceX / iterations;
            args[i].y += distanceY / iterations;
        }
        await delay(18);
        await draw();
    }
}


//================================================================================
// highlighting
//================================================================================
function highlightArgsWithOnlyIncomingAttacks(set) {
    const onlyIncoming = set.filter(arg => !arg.outgoingAttacks.length);
    onlyIncoming.forEach(arg => arg.color = '#bcefef');
}

function highlightArgsWithNoIncomingAttacks(set) {
    const noIncoming = set.filter(arg => !arg.incomingAttacks.length);
    noIncoming.forEach(arg => arg.color = '#fc03db');
}

function highlightOddCycles(set) {
    let oddCircles = findOddCircles(set);
    const args = set.filter(arg => !getArgsWithNoAttackWithinSet(set).includes(arg));
    let cyclesDrawn = [];
    args.forEach(arg => {
        const cycle = oddCircles.find(cycle => cycle.includes(arg));
        if (cycle && !cyclesDrawn.includes(cycle)) {
            cycle.forEach(arg => {
                arg.color = '#6fdc6f';
                arg.outgoingAttacks.forEach(att => {
                    if (cycle.includes(att.to)) {
                        att.color = '#6fdc6f';
                    }
                })
            });
            cyclesDrawn.push(cycle);
        }
    });
}

function getArgsWithNoAttackWithinSet(set) {
    return set.filter(arg => {
        const incomingAttacks = arg.incomingAttacks.filter(att => att.from.set === set);
        const outgoingAttacks = arg.outgoingAttacks.filter(att => att.to.set === set);
        const combinedAttacks = incomingAttacks.concat(outgoingAttacks);
        return combinedAttacks.length === 0;
    });
}


//================================================================================
// user interaction
//================================================================================
let selectedArg = undefined;

function getArgWithin(x, y) {
    return args.find(n => {
        return context.isPointInPath(n.path, x, y);
    })
}

function getAttackWithin(x, y) {
    const offsets = [
        [0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 2], [2, -2], [-2, 2], [-2, -2]
    ];

    return attacks.find(e => {
        return offsets.some(offset => {
            const [dx, dy] = offset;
            return context.isPointInStroke(e.path, x + dx, y + dy);
        });
    });
}

function scaleMouseClickCoordinates(x, y) {
    let rect = canvas.getBoundingClientRect();
    let scaleX = canvas.width / rect.width;
    let scaleY = canvas.height / rect.height;
    x = (x - rect.left) * scaleX
    y = (y - rect.top) * scaleY
    return {x: x, y: y};
}

let originalPosSelected;

function onPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();

    let clickCoordinates = scaleMouseClickCoordinates(e.x, e.y);
    let target = getArgWithin(clickCoordinates.x, clickCoordinates.y);

    switch (mode) {
        case MODE.Edit:
            if (e.button === 0) {
                if (selectedArg?.selected) selectedArg.selected = false;
                if (target) {
                    selectedArg = target;
                    selectedArg.selected = true;
                    originalPosSelected = target.y;
                }
            } else {
                if (selectedArg?.selected) selectedArg.selected = false;
                selectedArg.y = originalPosSelected;
                [inSet, outSet, undecSet] = [inSet, outSet, undecSet].map(set => set.sort((a, b) => a.y - b.y));
                output();
            }
            break;
        case MODE.View:
            isDragging = true;
            dragStart = {
                x: e.x / cameraZoom - cameraOffset.x,
                y: e.y / cameraZoom - cameraOffset.y,
            };
            break;
        default:
            break;
    }

    draw();
}

let isDragging = false
let dragStart = {x: 0, y: 0}

function onPointerUp(e) {
    e.preventDefault();
    e.stopPropagation();

    switch (mode) {
        case MODE.Edit:
            if (selectedArg && !selectedArg.selected) {
                selectedArg = undefined;
            }
            break;
        case MODE.View:
            isDragging = false;
            initialPinchDistance = null;
            lastZoom = cameraZoom;
            break;
        default:
            break;
    }
    draw();
}

async function onPointerMove(e) {
    e.preventDefault();
    e.stopPropagation();

    switch (mode) {
        case MODE.Edit:
            if (selectedArg && e.buttons) {
                let pointClicked = new DOMPoint(e.x, e.y);
                pointClicked = context.getTransform().invertSelf().transformPoint(pointClicked);
                selectedArg.y = pointClicked.y;
                [inSet, outSet, undecSet] = [inSet, outSet, undecSet].map(set => set.sort((a, b) => a.y - b.y));
                output();
            } else {
                const clickCoordinates = scaleMouseClickCoordinates(e.x, e.y);
                const mouseOverArg = getArgWithin(clickCoordinates.x, clickCoordinates.y);
                args.forEach(node => node.showLabel = mouseOverArg ? node === mouseOverArg : false);
            }
            if (args.length > 100) await delay(1000);
            break;
        case MODE.View:
            if (isDragging) {
                cameraOffset.x = e.x / cameraZoom - dragStart.x;
                cameraOffset.y = e.y / cameraZoom - dragStart.y;
            } else {
                const clickCoordinates = scaleMouseClickCoordinates(e.x, e.y);
                const nodeOver = getArgWithin(clickCoordinates.x, clickCoordinates.y);
                args.forEach(node => node.showLabel = nodeOver ? node === nodeOver : false);
            }
            break;
        default:
            break;
    }

    draw();
}

let initialPinchDistance = null
let lastZoom = cameraZoom

function adjustZoom(e) {
    e.preventDefault();
    e.stopPropagation();

    if (mode !== MODE.View || isDragging) {
        return;
    }

    let zoomAmount = e.deltaY * SCROLL_SENSITIVITY;
    cameraZoom = zoomAmount ? Math.min(Math.max(cameraZoom + zoomAmount, MIN_ZOOM), MAX_ZOOM) : zoomFactor * lastZoom;

    draw();
}

function onPointerDoubleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (mode !== MODE.Edit || selectedArg) return;
    let clickCoordinates = scaleMouseClickCoordinates(e.x, e.y);
    let nodeClicked = getAttackWithin(clickCoordinates.x, clickCoordinates.y);
    if (nodeClicked) {
        nodeClicked.chosen = !nodeClicked.chosen;
        draw();
    }
}

function downloadCanvasAsImage() {
    let downloadLink = document.createElement('a');
    downloadLink.setAttribute('download', 'AfVis.png');
    canvas.toBlob(function (blob) {
        let url = URL.createObjectURL(blob);
        downloadLink.setAttribute('href', url);
        downloadLink.click();
    });
}

function downloadFile(fileName) {
    let downloadLink = document.createElement('a');
    downloadLink.setAttribute('download', fileName);
    let file = new Blob([createOutputForFile()], {type: "text"});
    let url = URL.createObjectURL(file);
    downloadLink.setAttribute('href', url);
    downloadLink.click();
}

function createOutputForFile() {
    let output = "";
    for (let i = 0; i < args.length; i++) {
        output += "arg(" + args[i].label + ").\n";
    }
    for (let i = 0; i < attacks.length; i++) {
        if (attacks[i].chosen) {
            output += "att*(" + attacks[i].from.label + "," + attacks[i].to.label + ").\n";
        } else {
            output += "att(" + attacks[i].from.label + "," + attacks[i].to.label + ").\n";
        }
    }
    if (isExtension) {
        output += "\nExtension\n"
        for (let i = 0; i < inSet.length; i++) {
            output += "in(" + inSet[i].label + ") ";
        }
        for (let i = 0; i < outSet.length; i++) {
            output += "out(" + outSet[i].label + ") ";
        }
        for (let i = 0; i < undecSet.length; i++) {
            output += "undec(" + undecSet[i].label + ") ";
        }
    }
    return output
}

function downloadIpe() {
    let xmlString = "<?xml version=\"1.0\"?>\n";
    xmlString += "<!DOCTYPE ipe SYSTEM \"ipe.dtd\">\n";
    xmlString += "<ipe version=\"70206\" creator=\"Ipe 7.2.7\">\n";
    xmlString += `<ipestyle name="basic">
<symbol name="arrow/arc(spx)">
<path stroke="sym-stroke" fill="sym-stroke" pen="sym-pen">
0 0 m
-1 0.333 l
-1 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/farc(spx)">
<path stroke="sym-stroke" fill="white" pen="sym-pen">
0 0 m
-1 0.333 l
-1 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/ptarc(spx)">
<path stroke="sym-stroke" fill="sym-stroke" pen="sym-pen">
0 0 m
-1 0.333 l
-0.8 0 l
-1 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/fptarc(spx)">
<path stroke="sym-stroke" fill="white" pen="sym-pen">
0 0 m
-1 0.333 l
-0.8 0 l
-1 -0.333 l
h
</path>
</symbol>
<symbol name="mark/circle(sx)" transformations="translations">
<path fill="sym-stroke">
0.6 0 0 0.6 0 0 e
0.4 0 0 0.4 0 0 e
</path>
</symbol>
<symbol name="mark/disk(sx)" transformations="translations">
<path fill="sym-stroke">
0.6 0 0 0.6 0 0 e
</path>
</symbol>
<symbol name="mark/fdisk(sfx)" transformations="translations">
<group>
<path fill="sym-fill">
0.5 0 0 0.5 0 0 e
</path>
<path fill="sym-stroke" fillRule="eofill">
0.6 0 0 0.6 0 0 e
0.4 0 0 0.4 0 0 e
</path>
</group>
</symbol>
<symbol name="mark/box(sx)" transformations="translations">
<path fill="sym-stroke" fillRule="eofill">
-0.6 -0.6 m
0.6 -0.6 l
0.6 0.6 l
-0.6 0.6 l
h
-0.4 -0.4 m
0.4 -0.4 l
0.4 0.4 l
-0.4 0.4 l
h
</path>
</symbol>
<symbol name="mark/square(sx)" transformations="translations">
<path fill="sym-stroke">
-0.6 -0.6 m
0.6 -0.6 l
0.6 0.6 l
-0.6 0.6 l
h
</path>
</symbol>
<symbol name="mark/fsquare(sfx)" transformations="translations">
<group>
<path fill="sym-fill">
-0.5 -0.5 m
0.5 -0.5 l
0.5 0.5 l
-0.5 0.5 l
h
</path>
<path fill="sym-stroke" fillRule="eofill">
-0.6 -0.6 m
0.6 -0.6 l
0.6 0.6 l
-0.6 0.6 l
h
-0.4 -0.4 m
0.4 -0.4 l
0.4 0.4 l
-0.4 0.4 l
h
</path>
</group>
</symbol>
<symbol name="mark/cross(sx)" transformations="translations">
<group>
<path fill="sym-stroke">
-0.43 -0.57 m
0.57 0.43 l
0.43 0.57 l
-0.57 -0.43 l
h
</path>
<path fill="sym-stroke">
-0.43 0.57 m
0.57 -0.43 l
0.43 -0.57 l
-0.57 0.43 l
h
</path>
</group>
</symbol>
<symbol name="arrow/fnormal(spx)">
<path stroke="sym-stroke" fill="white" pen="sym-pen">
0 0 m
-1 0.333 l
-1 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/pointed(spx)">
<path stroke="sym-stroke" fill="sym-stroke" pen="sym-pen">
0 0 m
-1 0.333 l
-0.8 0 l
-1 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/fpointed(spx)">
<path stroke="sym-stroke" fill="white" pen="sym-pen">
0 0 m
-1 0.333 l
-0.8 0 l
-1 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/linear(spx)">
<path stroke="sym-stroke" pen="sym-pen">
-1 0.333 m
0 0 l
-1 -0.333 l
</path>
</symbol>
<symbol name="arrow/fdouble(spx)">
<path stroke="sym-stroke" fill="white" pen="sym-pen">
0 0 m
-1 0.333 l
-1 -0.333 l
h
-1 0 m
-2 0.333 l
-2 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/double(spx)">
<path stroke="sym-stroke" fill="sym-stroke" pen="sym-pen">
0 0 m
-1 0.333 l
-1 -0.333 l
h
-1 0 m
-2 0.333 l
-2 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/mid-normal(spx)">
<path stroke="sym-stroke" fill="sym-stroke" pen="sym-pen">
0.5 0 m
-0.5 0.333 l
-0.5 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/mid-fnormal(spx)">
<path stroke="sym-stroke" fill="white" pen="sym-pen">
0.5 0 m
-0.5 0.333 l
-0.5 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/mid-pointed(spx)">
<path stroke="sym-stroke" fill="sym-stroke" pen="sym-pen">
0.5 0 m
-0.5 0.333 l
-0.3 0 l
-0.5 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/mid-fpointed(spx)">
<path stroke="sym-stroke" fill="white" pen="sym-pen">
0.5 0 m
-0.5 0.333 l
-0.3 0 l
-0.5 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/mid-double(spx)">
<path stroke="sym-stroke" fill="sym-stroke" pen="sym-pen">
1 0 m
0 0.333 l
0 -0.333 l
h
0 0 m
-1 0.333 l
-1 -0.333 l
h
</path>
</symbol>
<symbol name="arrow/mid-fdouble(spx)">
<path stroke="sym-stroke" fill="white" pen="sym-pen">
1 0 m
0 0.333 l
0 -0.333 l
h
0 0 m
-1 0.333 l
-1 -0.333 l
h
</path>
</symbol>
<anglesize name="22.5 deg" value="22.5"/>
<anglesize name="30 deg" value="30"/>
<anglesize name="45 deg" value="45"/>
<anglesize name="60 deg" value="60"/>
<anglesize name="90 deg" value="90"/>
<arrowsize name="large" value="10"/>
<arrowsize name="small" value="5"/>
<arrowsize name="tiny" value="3"/>
<color name="blue" value="0 0 1"/>
<color name="brown" value="0.647 0.165 0.165"/>
<color name="darkblue" value="0 0 0.545"/>
<color name="darkcyan" value="0 0.545 0.545"/>
<color name="darkgray" value="0.663"/>
<color name="darkgreen" value="0 0.392 0"/>
<color name="darkmagenta" value="0.545 0 0.545"/>
<color name="darkorange" value="1 0.549 0"/>
<color name="darkred" value="0.545 0 0"/>
<color name="gold" value="1 0.843 0"/>
<color name="gray" value="0.745"/>
<color name="green" value="0 1 0"/>
<color name="lightblue" value="0.678 0.847 0.902"/>
<color name="lightcyan" value="0.878 1 1"/>
<color name="lightgray" value="0.827"/>
<color name="lightgreen" value="0.565 0.933 0.565"/>
<color name="lightyellow" value="1 1 0.878"/>
<color name="navy" value="0 0 0.502"/>
<color name="orange" value="1 0.647 0"/>
<color name="pink" value="1 0.753 0.796"/>
<color name="purple" value="0.627 0.125 0.941"/>
<color name="red" value="1 0 0"/>
<color name="seagreen" value="0.18 0.545 0.341"/>
<color name="turquoise" value="0.251 0.878 0.816"/>
<color name="violet" value="0.933 0.51 0.933"/>
<color name="yellow" value="1 1 0"/>
<dashstyle name="dash dot dotted" value="[4 2 1 2 1 2] 0"/>
<dashstyle name="dash dotted" value="[4 2 1 2] 0"/>
<dashstyle name="dashed" value="[4] 0"/>
<dashstyle name="dotted" value="[1 3] 0"/>
<gridsize name="10 pts (~3.5 mm)" value="10"/>
<gridsize name="14 pts (~5 mm)" value="14"/>
<gridsize name="16 pts (~6 mm)" value="16"/>
<gridsize name="20 pts (~7 mm)" value="20"/>
<gridsize name="28 pts (~10 mm)" value="28"/>
<gridsize name="32 pts (~12 mm)" value="32"/>
<gridsize name="4 pts" value="4"/>
<gridsize name="56 pts (~20 mm)" value="56"/>
<gridsize name="8 pts (~3 mm)" value="8"/>
<opacity name="10%" value="0.1"/>
<opacity name="30%" value="0.3"/>
<opacity name="50%" value="0.5"/>
<opacity name="75%" value="0.75"/>
<pen name="fat" value="1.2"/>
<pen name="heavier" value="0.8"/>
<pen name="ultrafat" value="2"/>
<symbolsize name="large" value="5"/>
<symbolsize name="small" value="2"/>
<symbolsize name="tiny" value="1.1"/>
<textsize name="Huge" value="\\Huge"/>
<textsize name="LARGE" value="\\LARGE"/>
<textsize name="Large" value="\\Large"/>
<textsize name="footnote" value="\\footnotesize"/>
<textsize name="huge" value="\\huge"/>
<textsize name="large" value="\\large"/>
<textsize name="script" value="\\scriptsize"/>
<textsize name="small" value="\\small"/>
<textsize name="tiny" value="\\tiny"/>
<textstyle name="center" begin="\\begin{center}" end="\\end{center}"/>
<textstyle name="item" begin="\\begin{itemize}\item{}" end="\\end{itemize}"/>
<textstyle name="itemize" begin="\\begin{itemize}" end="\\end{itemize}"/>
<tiling name="falling" angle="-60" step="4" width="1"/>
<tiling name="rising" angle="30" step="4" width="1"/>
</ipestyle>`;
    xmlString += "\n<page>\n";
    xmlString += "<layer name=\"alpha\"/>\n";
    xmlString += "<view layers=\"alpha\" active=\"alpha\"/>\n";

    if (isExtension) {
        xmlString = addLayeredDrawingXMLtoString(xmlString);
    } else {
        xmlString = addDrawingXMLtoString(xmlString);
    }

    xmlString += "</page>\n";
    xmlString += "</ipe>";

    let file = new Blob([xmlString], {type: "text/xml"});
    let downloadLink = document.createElement('a');
    downloadLink.setAttribute('download', "AFvis.xml");
    let url = URL.createObjectURL(file);
    downloadLink.setAttribute('href', url);
    downloadLink.click();
}

function addLayeredDrawingXMLtoString(xmlString) {
    let attsChosen = [];
    let attsInOut = [];
    let attsWithinLayer = [];
    let attsGrey = [];
    for (let i = 0; i < attacks.length; i++) {
        if (attacks[i].from.set === inSet && attacks[i].to.set === outSet) {
            if (attacks[i].chosen) {
                attsChosen.push(attacks[i]);
            } else {
                attsInOut.push(attacks[i]);
            }
        } else if (attacks[i].from.set === attacks[i].to.set) {
            attsWithinLayer.push(attacks[i]);
        } else {
            attsGrey.push(attacks[i]);
        }
    }

    for (let i = 0; i < attsGrey.length; i++) {
        if (attackEachOther(attsGrey[i].from, attsGrey[i].to) && (indexIsBefore(attsGrey[i].from, attsGrey[i].to) || attsGrey[i].to.set === inSet)) {
            let point = findPointPerpendicularToLine(attsGrey[i].from, attsGrey[i].to, 5);
            xmlString += "<path stroke=\"darkcyan\" arrow=\"normal/small\"  opacity=\"75%\">\n";
            xmlString += attsGrey[i].from.x + " " + -1 * attsGrey[i].from.y + " m\n";
            xmlString += point.x + " " + -1 * point.y + "\n";
            xmlString += attsGrey[i].to.x + " " + -1 * attsGrey[i].to.y + " c\n";
            xmlString += "</path>\n";
        } else {
            xmlString += "<path stroke=\"darkcyan\" arrow=\"normal/small\" opacity=\"75%\">\n";
            xmlString += attsGrey[i].from.x + " " + -1 * attsGrey[i].from.y + " m\n";
            xmlString += attsGrey[i].to.x + " " + -1 * attsGrey[i].to.y + " l\n";
            xmlString += "</path>\n";
        }
    }


    for (let i = 0; i < attsInOut.length; i++) {
        xmlString += "<path stroke=\"darkorange\" arrow=\"normal/small\" opacity=\"75%\">\n";
        xmlString += attsInOut[i].from.x + " " + -1 * attsInOut[i].from.y + " m\n";
        xmlString += attsInOut[i].to.x + " " + -1 * attsInOut[i].to.y + " l\n";
        xmlString += "</path>\n";
    }

    for (let i = 0; i < attsChosen.length; i++) {
        xmlString += "<path stroke=\"red\" arrow=\"normal/small\">\n";
        xmlString += attsChosen[i].from.x + " " + -1 * attsChosen[i].from.y + " m\n";
        xmlString += attsChosen[i].to.x + " " + -1 * attsChosen[i].to.y + " l\n";
        xmlString += "</path>\n";
    }

    for (let i = 0; i < attsWithinLayer.length; i++) {
        if (areNeighboursInSet(attsWithinLayer[i].from, attsWithinLayer[i].to) && attackEachOther(attsWithinLayer[i].from, attsWithinLayer[i].to) && indexIsBefore(attsWithinLayer[i].from, attsWithinLayer[i].to)) {
            xmlString += "<path stroke=\"darkcyan\" arrow=\"normal/small\" opacity=\"75%\">";
            xmlString += attsWithinLayer[i].from.x + " " + -1 * attsWithinLayer[i].from.y + " m\n";
            xmlString += attsWithinLayer[i].to.x + " " + -1 * attsWithinLayer[i].to.y + " l\n";
            xmlString += "</path>\n";
        } else if (areNeighboursInSet(attsWithinLayer[i].from, attsWithinLayer[i].to) && !attackEachOther(attsWithinLayer[i].from, attsWithinLayer[i].to)) {
            xmlString += "<path stroke=\"darkcyan\" arrow=\"normal/small\" opacity=\"75%\">";
            xmlString += attsWithinLayer[i].from.x + " " + -1 * attsWithinLayer[i].from.y + " m\n";
            xmlString += attsWithinLayer[i].to.x + " " + -1 * attsWithinLayer[i].to.y + " l\n";
            xmlString += "</path>\n";
        } else if (attackEachOther(attsWithinLayer[i].from, attsWithinLayer[i].to) && indexIsBefore(attsWithinLayer[i].from, attsWithinLayer[i].to)) {
            xmlString += "<path stroke=\"darkcyan\" arrow=\"normal/small\" opacity=\"75%\">";
            xmlString += attsWithinLayer[i].from.x + " " + -1 * attsWithinLayer[i].from.y + " m\n";
            xmlString += (attsWithinLayer[i].from.x + Math.abs((attsWithinLayer[i].to.y - attsWithinLayer[i].from.y) / 3)) + " " + -1 * (attsWithinLayer[i].from.y + (attsWithinLayer[i].to.y - attsWithinLayer[i].from.y) / 2) + "\n";
            xmlString += attsWithinLayer[i].to.x + " " + -1 * attsWithinLayer[i].to.y + " c\n";
            xmlString += "</path>\n";
        } else if (attsWithinLayer[i].from === attsWithinLayer[i].to) {
            xmlString += "<path stroke=\"darkcyan\" arrow=\"normal/small\" opacity=\"75%\">";
            xmlString += attsWithinLayer[i].from.x + " " + -1 * attsWithinLayer[i].from.y + " m\n";
            xmlString += attsWithinLayer[i].from.x + 15 + " " + -1 * (attsWithinLayer[i].from.y + 10) + "\n";
            xmlString += attsWithinLayer[i].from.x + 15 + " " + -1 * (attsWithinLayer[i].from.y - 10) + "\n";
            xmlString += attsWithinLayer[i].to.x + " " + -1 * attsWithinLayer[i].to.y + " c\n";
            xmlString += "</path>\n";
        } else {
            xmlString += "<path stroke=\"darkcyan\" arrow=\"normal/small\" opacity=\"75%\">";
            xmlString += attsWithinLayer[i].from.x + " " + -1 * attsWithinLayer[i].from.y + " m\n";
            xmlString += (attsWithinLayer[i].from.x + Math.abs((attsWithinLayer[i].to.y - attsWithinLayer[i].from.y) / 2)) + " " + -1 * (attsWithinLayer[i].from.y + (attsWithinLayer[i].to.y - attsWithinLayer[i].from.y) / 2) + "\n";
            xmlString += attsWithinLayer[i].to.x + " " + -1 * attsWithinLayer[i].to.y + " c\n";
            xmlString += "</path>\n";
        }
    }

    if (args[0].set === inSet) {
        xmlString += "<use layer=\"alpha\" name=\"mark/disk(sx)\" pos=\"" + args[0].x + " " + -1 * args[0].y + "\" size=\"normal\" stroke=\"darkorange\"/>\n";
    } else {
        xmlString += "<use layer=\"alpha\" name=\"mark/disk(sx)\" pos=\"" + args[0].x + " " + -1 * args[0].y + "\" size=\"normal\" stroke=\"darkcyan\"/>\n";
    }
    for (let i = 1; i < args.length; i++) {
        if (args[i].set === inSet) {
            xmlString += "<use name=\"mark/disk(sx)\" pos=\"" + args[i].x + " " + -1 * args[i].y + "\" size=\"normal\" stroke=\"darkorange\"/>";
        } else {
            xmlString += "<use name=\"mark/disk(sx)\" pos=\"" + args[i].x + " " + -1 * args[i].y + "\" size=\"normal\" stroke=\"darkcyan\"/>";
        }
    }

    const setLabelPositions = [
        {set: inSet, label: "IN", x: inSet.length < 1 ? 0 : inSet[0].x},
        {set: outSet, label: "OUT", x: outSet.length < 1 ? 0 : outSet[0].x},
        {set: undecSet, label: "UNDEC", x: undecSet.length < 1 ? 0 : undecSet[0].x}
    ];

    setLabelPositions.forEach(setLabel => {
        if (setLabel.set.length !== 0) {
            setLabel.y = (canvas.height - 20 + (verticalSpacing / 2)) * (verticalSpacing / 2);
            xmlString += " <text pos=\"" + setLabel.x + " " + setLabel.y + "\" stroke=\"black\" type=\"label\" valign=\"baseline\" halign=\"center\" size=\"large\">" + setLabel.label + "</text>"
        }
    });
    return xmlString;
}

function addDrawingXMLtoString(xmlString) {
    for (let i = 0; i < args.length; i++) {
        xmlString += "<use name=\"mark/disk(sx)\" pos=\"" + args[i].x + " " + -1 * args[i].y + "\" size=\"normal\" stroke=\"darkcyan\"/>";
    }
    for (let i = 0; i < attacks.length; i++) {
        if (attackEachOther(attacks[i].from, attacks[i].to)) {
            if (indexIsBefore(attacks[i].from, attacks[i].to)) {
                let point = findPointPerpendicularToLine(attacks[i].from, attacks[i].to, 5);
                xmlString += "<path stroke=\"darkcyan\" arrow=\"normal/small\">";
                xmlString += attacks[i].from.x + " " + -1 * attacks[i].from.y + " m\n";
                xmlString += point.x + " " + -1 * point.y + "\n";
                xmlString += attacks[i].to.x + " " + -1 * attacks[i].to.y + " c\n";
                xmlString += "</path>\n";
            } else if (attacks[i].from === attacks[i].to) {
                xmlString += "<path stroke=\"darkcyan\" arrow=\"normal/small\">";
                xmlString += attacks[i].from.x + " " + -1 * attacks[i].from.y + " m\n";
                xmlString += (attacks[i].from.x + 15) + " " + -1 * (attacks[i].from.y + 10) + "\n";
                xmlString += (attacks[i].from.x + 15) + " " + -1 * (attacks[i].from.y - 10) + "\n";
                xmlString += attacks[i].to.x + " " + -1 * attacks[i].to.y + " c\n";
                xmlString += "</path>\n";
            } else {
                let point = findPointPerpendicularToLine(attacks[i].from, attacks[i].to, -5);
                xmlString += "<path stroke=\"darkcyan\" arrow=\"normal/small\">";
                xmlString += attacks[i].from.x + " " + -1 * attacks[i].from.y + " m\n";
                xmlString += point.x + " " + -1 * point.y + "\n";
                xmlString += attacks[i].to.x + " " + -1 * attacks[i].to.y + " c\n";
                xmlString += "</path>\n";
            }
        } else {
            xmlString += "<path stroke=\"darkcyan\" arrow=\"normal/small\">";
            xmlString += attacks[i].from.x + " " + -1 * attacks[i].from.y + " m\n";
            xmlString += attacks[i].to.x + " " + -1 * attacks[i].to.y + " l\n";
            xmlString += "</path>\n";
        }
    }
    return xmlString;
}

function findPointPerpendicularToLine(from, to, distance) {
    let midX = (to.x + from.x) / 2;
    let midY = (to.y + from.y) / 2;
    let slope = (to.y - from.y) / (to.x - from.x);
    let slope_p = -1 / slope
    let delta_x = distance / Math.sqrt(1 + (slope_p * slope_p));
    let delta_y = delta_x * slope_p;
    let x = midX + delta_x;
    let y = midY + delta_y;
    return {x: x, y: y}
}

let file;
let extensions = [];

async function initializeFromFile(file) {
    extensions = [];
    let text = await file.text();
    text = text.trim();
    text = text.replace(/[\r]/g, '');

    const parts = text.split("\n\n");

    // In case the file has a header find the start of the argument/attacks encodings
    let start = 0;
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes("arg")) {
            start = i;
            break;
        }
    }

    const argumentsAndAttributes = parts[start];

    // The other parts are extensions
    for (let i = start + 1; i < parts.length; i += 1) {
        const extensionParts = parts[i].split("\n");
        const name = extensionParts[0];
        const labeling = extensionParts[1];

        extensions.push({name: name, labeling: labeling.trim()});
    }
    setSelectOptions();

    let redEdges = await initializeAf(argumentsAndAttributes);
    if (redEdges.length > 0 && extensions.length > 0) {
        await initializeExt(extensions[0].labeling)
        for (const att of redEdges) {
            att.chosen = true
        }
    }

}

function setSelectOptions() {
    let htmlContent = "<option value=\"\"> No Extension </option>";
    htmlContent += "<option value=\"" + -1 + "\"> Grounded Extension </option>";
    for (let i = 0; i < extensions.length; i++) {
        htmlContent += "<option value=\"" + i + "\">" + extensions[i].name + "</option>";
    }
    extensionSelect.innerHTML = htmlContent;
}

async function loadExtension(selectedExtension) {
    if (!selectedExtension.toString().length) {
        resetExt();
        resetRedEdges();
        let oldPositions = args.map(arg => ({x: arg.x, y: arg.y}));
        await forceDirectedLayout();
        output();
        let newPositions = args.map(arg => ({x: arg.x, y: arg.y}));
        await drawArgumentsMoving(oldPositions, newPositions);
    } else if (selectedExtension === "-1") {
        resetExt();
        isExtension = true;
        let oldPositions = args.map(arg => ({x: arg.x, y: arg.y}));
        computeGrounded(args, inSet, outSet, undecSet);
        colorInOrange = true;
        inSet.forEach(arg => (arg.color = 'rgba(255, 190, 6)'))
        adjustCoordinatesToOrder();
        let newPositions = args.map(arg => ({x: arg.x, y: arg.y}));
        output();
        await drawArgumentsMoving(oldPositions, newPositions);
    } else {
        await initializeExt(extensions[selectedExtension].labeling);
    }

}

async function loadExample(selectedExample) {
    switch (selectedExample){
        case "1":
            await initializeFromFile(admissibleFile);
            break;
        case "2":
            await initializeFromFile(preferredFile);
            break;
        case "3":
            await initializeFromFile(stableFile);
            break;
        case "4":
            await initializeFromFile(stableCompleteFile);
            break;
        default:
            break;
    }
}

function decreaseSpacing(spacing) {
    if (spacing === "horizontal") {
        horizontalSpacing *= 1.2;
    } else {
        verticalSpacing *= 1.2;
    }
    layout();
}

function increaseSpacing(spacing) {
    if (spacing === "horizontal") {
        horizontalSpacing *= 0.8;
        if (horizontalSpacing < 0.15) {
            horizontalSpacing = 0.15;
        }
    } else {
        verticalSpacing *= 0.8;
        if (verticalSpacing < 0.20) {
            verticalSpacing = 0.20;
        }
    }
    layout();
}

function output() {
    if (isExtension) {
        document.getElementById("crossCount").innerHTML = "Number of Crossings: IN-OUT: " + computeCC(attacks, inSet, outSet) + " /OUT-OUT: " + computeCCLinear(attacks, outSet) + " /OUT-UNDEC: " + computeCC(attacks, outSet, undecSet) + " /UNDEC-UNDEC " + computeCCLinear(attacks, undecSet);
    }
}

function orderOfArgumentsInSetToString(set) {
    return set.map(arg => arg.label).join(", ");
}

function getInOutWeight() {
    let attOutOut = attacks.filter(att => att.from.set === outSet && att.to.set === outSet && att.to !== att.from);
    let attOutUndec = attacks.filter(att => (att.from.set === outSet && att.to.set === undecSet) || (att.from.set === undecSet && att.to.set === outSet));
    let attUndecUndec = attacks.filter(att => att.from.set === undecSet && att.to.set === undecSet && att.to !== att.from);
    let possibleAttacksOutOut = (attOutOut.length * (attOutOut.length - 1)) / 2
    let possibleAttacksOutUndec = (attOutUndec.length * (attOutUndec.length - 1)) / 2
    let possibleAttacksUndecUndec = (attUndecUndec.length * (attUndecUndec.length - 1)) / 2
    if (possibleAttacksOutOut + possibleAttacksOutUndec + possibleAttacksUndecUndec > 0) {
        return possibleAttacksOutOut + possibleAttacksOutUndec + possibleAttacksUndecUndec
    } else {
        return 1
    }
}

let weight12Input = "1";
let weight2Input = "1";
let weight23Input = "1";
let weight3Input = "1";

async function exactTLCM() {
    let layer1 = inSet.map(arg => arg.label);
    let layer2 = outSet.map(arg => arg.label);
    let edges = attacks.map(att => [att.from.label, att.to.label]);
    let graph = {
        layer1: layer1,
        layer2: layer2,
        layer3: [],
        weight12: getInOutWeight(),
        weight2: weight2Input,
        weight23: weight23Input,
        weight3: weight3Input,
        edges: edges,
        timeout: exactTimeout.value
    }
    return await exact(graph);
}

async function exactMLCM() {
    let layer1 = inSet.map(arg => arg.label);
    let layer2 = outSet.map(arg => arg.label);
    let layer3 = undecSet.map(arg => arg.label);
    let edges = attacks.map(att => [att.from.label, att.to.label])
    let graph = {
        layer1: layer1,
        layer2: layer2,
        layer3: layer3,
        weight12: getInOutWeight(),
        weight2: weight2Input,
        weight23: weight23Input,
        weight3: weight3Input,
        edges: edges,
        timeout: exactTimeout.value
    }
    return await exact(graph);
}

async function exact(graph) {
    let response = await sendToSolver(graph);
    if (!response.solved) {
        return false;
    }
    resetRedEdges();
    response.redEdges.forEach(edge => {
        const [r, i, j] = edge.split(".").map((item) => item.trim());
        let selectedEdge = attacks.find(att => {
            return att.from.label === i && att.to.label === j
        });
        if (selectedEdge) {
            selectedEdge.chosen = true;
        }
    })
    let oldPositions = args.map(arg => ({x: arg.x, y: arg.y}));
    topologicalSort(inSet, response.order1);
    topologicalSort(outSet, response.order2);
    if (graph.layer3.length > 0) {
        topologicalSort(undecSet, response.order3);
    }
    adjustCoordinatesToOrder();
    let newPositions = args.map(arg => ({x: arg.x, y: arg.y}));
    output();
    await drawArgumentsMoving(oldPositions, newPositions);
    return true;
}

async function sendToSolver(graph) {
    let result;
    const res = await fetch('http://127.0.0.1:5000/exact', {
        method: 'POST',
        body: JSON.stringify(graph),
        headers: {
            'Content-type': 'application/json; charset=UTF-8',
        }
    }).catch(error => console.error('Error:', error));

    result = await res.json();
    return result;
}

async function browserSolver() {
    let oldPositions = args.map(arg => ({x: arg.x, y: arg.y}));
    await exactTLCMGLPK(attacks, inSet, outSet, exactTimeout.value);
    adjustCoordinatesToOrder()
    let newPositions = args.map(arg => ({x: arg.x, y: arg.y}));
    output();
    await drawArgumentsMoving(oldPositions, newPositions);
}

function layout() {
    if (isExtension) {
        adjustCoordinatesToOrder();
    } else {
        forceDirectedLayout();
    }
    draw();
}

function resetRedEdges() {
    for (const att of attacks) {
        att.chosen = false;
    }
}

function barycenterBefore(inSet, outSet) {
    let CC = computeCC(attacks, inSet, outSet);
    let run = true
    while (run) {
        barycenter(inSet, outSet)
        barycenter(outSet, inSet)
        if (computeCC(attacks, inSet, outSet) <= CC) {
            run = false
        } else {
            CC = computeCC(attacks, inSet, outSet)
        }
    }
}

async function pipeline() {
    let oldPositions = args.map(arg => ({x: arg.x, y: arg.y}));
    colorInOrange = true;
    resetRedEdges();
    if (doInitialBarycenter) {
        barycenterBefore(inSet, outSet);
    }
    mapRedEdges(attacks, inSet, outSet, redEdgeStrategy, preferNotAttacked)
    barycenterGroups(inSet, outSet)
    barycenterWithinGroups(inSet, outSet)
    barycenterChosenArgs(inSet, outSet)
    barycenterIn(inSet, outSet)
    if (doLocalSearch) {
        localSearchRedEdges(attacks, inSet, outSet);
    }
    if (undecSet.length > 0) {
        barycenter(undecSet, outSet)
    }
    adjustCoordinatesToOrder();
    let newPositions = args.map(arg => ({x: arg.x, y: arg.y}));
    output();
    await drawArgumentsMoving(oldPositions, newPositions);
}

function showTab(tabId, clickedButton) {

    let tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(function (tab) {
        tab.classList.remove('active');
    });

    let selectedTab = document.getElementById(tabId);
    selectedTab.classList.add('active');

    let tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(function (button) {
        button.classList.remove('active');
    });

    clickedButton.classList.add('active');
}

function toggleSetting(settingId, clickedButton) {
    let buttons = document.querySelectorAll('.setting-button');

    buttons.forEach(function (button) {
        if (button.dataset.setting === String(settingId)) {
            button.classList.remove('active');
        }
    });

    clickedButton.classList.add('active');

    switch (settingId) {
        case 0:
            if (clickedButton === strategy0Button) {
                redEdgeStrategy = 0;
            } else if (clickedButton === strategy1Button) {
                redEdgeStrategy = 1;
            } else {
                redEdgeStrategy = 2;
            }
            break;
        case 1 :
            preferNotAttacked = !preferNotAttacked;
            break;
        case 2 :
            doLocalSearch = !doLocalSearch;
            break;
        case 3 :
            doInitialBarycenter = !doInitialBarycenter;
            break;
    }
}

canvas.addEventListener('mousedown', onPointerDown)
canvas.addEventListener('mouseup', onPointerUp)
canvas.addEventListener('mousemove', onPointerMove)
canvas.addEventListener('wheel', adjustZoom);
canvas.addEventListener('dblclick', onPointerDoubleClick)

extensionSelect.onchange = () => loadExtension(extensionSelect.value);
editButton.addEventListener('click', (e) => mode = MODE.Edit);
viewButton.addEventListener('click', (e) => mode = MODE.View);
spaceOutHButton.addEventListener('click', () => decreaseSpacing("horizontal"));
spaceInHButton.addEventListener('click', () => increaseSpacing("horizontal"));
spaceOutVButton.addEventListener('click', () => decreaseSpacing("vertical"));
spaceInVButton.addEventListener('click', () => increaseSpacing("vertical"));
layoutButton.addEventListener('click', layout);
saveAsImgButton.addEventListener('click', downloadCanvasAsImage)
saveIpeButton.addEventListener('click', () => downloadIpe());
saveAsFileButton.addEventListener('click', () => downloadFile('AfVis.apx'))
fileSelector.addEventListener('change', (e) => {
    initializeFromFile(e.target.files.item(0)), openDialog.close()
});
rotateButton.addEventListener('click', () => isRotated = !isRotated);
allStepsButton.addEventListener('click', () => {
    pipeline()
});
highlightUndecButton.addEventListener('click', () => {
    highlightOddCycles(undecSet), highlightArgsWithNoIncomingAttacks(undecSet), draw
});
highlightDefendedButton.addEventListener('click', () => {
    highlightArgsWithOnlyIncomingAttacks(inSet), draw
});
//exactTLCMButton.addEventListener('click', () => exactTLCM());
browserSolverButton.addEventListener('click', () => browserSolver());
exactMLCMButton.addEventListener('click', () => exactMLCM());
pipelineTabButton.addEventListener('click', () => showTab("pipeline", pipelineTabButton));
exactTabButton.addEventListener('click', () => showTab("exact", exactTabButton));
actionsTabButton.addEventListener('click', () => showTab("actions", actionsTabButton));
strategy0Button.addEventListener('click', () => toggleSetting(0, strategy0Button));
strategy1Button.addEventListener('click', () => toggleSetting(0, strategy1Button));
//strategy2Button.addEventListener('click', () => toggleSetting(0, strategy2Button));
priorityONButton.addEventListener('click', () => toggleSetting(1, priorityONButton));
priorityOFFButton.addEventListener('click', () => toggleSetting(1, priorityOFFButton));
localSearchONButton.addEventListener('click', () => toggleSetting(2, localSearchONButton));
localSearchOFFButton.addEventListener('click', () => toggleSetting(2, localSearchOFFButton));
infoButton.addEventListener('click', () => infoDialog.showModal());
openButton.addEventListener('click', () => openDialog.showModal())

exampleSelector.onchange = () => { loadExample(exampleSelector.value), openDialog.close()};

let admissibleExample =  "arg(a41).\n" +
    "arg(a42).\n" +
    "arg(a40).\n" +
    "arg(a20).\n" +
    "arg(a9).\n" +
    "arg(a16).\n" +
    "arg(a17).\n" +
    "arg(a14).\n" +
    "arg(a15).\n" +
    "arg(a12).\n" +
    "arg(a13).\n" +
    "arg(a10).\n" +
    "arg(a11).\n" +
    "arg(a35).\n" +
    "arg(a1).\n" +
    "arg(a34).\n" +
    "arg(a2).\n" +
    "arg(a33).\n" +
    "arg(a3).\n" +
    "arg(a32).\n" +
    "arg(a4).\n" +
    "arg(a39).\n" +
    "arg(a5).\n" +
    "arg(a38).\n" +
    "arg(a6).\n" +
    "arg(a37).\n" +
    "arg(a7).\n" +
    "arg(a18).\n" +
    "arg(a36).\n" +
    "arg(a8).\n" +
    "arg(a19).\n" +
    "arg(a50).\n" +
    "arg(a31).\n" +
    "arg(a30).\n" +
    "arg(a25).\n" +
    "arg(a26).\n" +
    "arg(a27).\n" +
    "arg(a28).\n" +
    "arg(a21).\n" +
    "arg(a22).\n" +
    "arg(a23).\n" +
    "arg(a24).\n" +
    "arg(a44).\n" +
    "arg(a43).\n" +
    "arg(a46).\n" +
    "arg(a45).\n" +
    "arg(a48).\n" +
    "arg(a29).\n" +
    "arg(a47).\n" +
    "arg(a49).\n" +
    "att(a41,a37).\n" +
    "att(a45,a27).\n" +
    "att(a40,a38).\n" +
    "att(a40,a37).\n" +
    "att(a42,a38).\n" +
    "att(a41,a38).\n" +
    "att(a1,a19).\n" +
    "att(a42,a29).\n" +
    "att(a19,a44).\n" +
    "att(a43,a29).\n" +
    "att(a19,a41).\n" +
    "att(a18,a47).\n" +
    "att(a5,a10).\n" +
    "att(a42,a46).\n" +
    "att(a42,a44).\n" +
    "att(a7,a10).\n" +
    "att(a7,a12).\n" +
    "att(a2,a29).\n" +
    "att(a48,a20).\n" +
    "att(a40,a44).\n" +
    "att(a40,a46).\n" +
    "att(a44,a34).\n" +
    "att(a49,a22).\n" +
    "att(a40,a43).\n" +
    "att(a20,a21).\n" +
    "att(a42,a8).\n" +
    "att(a20,a23).\n" +
    "att(a20,a25).\n" +
    "att(a20,a24).\n" +
    "att(a44,a1).\n" +
    "att(a25,a12).\n" +
    "att(a41,a18).\n" +
    "att(a23,a17).\n" +
    "att(a41,a4).\n" +
    "att(a20,a16).\n" +
    "att(a49,a1).\n" +
    "att(a49,a3).\n" +
    "att(a49,a4).\n" +
    "att(a45,a3).\n" +
    "att(a43,a17).\n" +
    "att(a47,a2).\n" +
    "att(a47,a1).\n" +
    "att(a17,a13).\n" +
    "att(a12,a29).\n" +
    "att(a17,a15).\n" +
    "att(a16,a17).\n" +
    "att(a16,a18).\n" +
    "att(a17,a12).\n" +
    "att(a39,a44).\n" +
    "att(a17,a19).\n" +
    "att(a18,a13).\n" +
    "att(a39,a43).\n" +
    "att(a39,a41).\n" +
    "att(a24,a6).\n" +
    "att(a14,a18).\n" +
    "att(a15,a14).\n" +
    "att(a10,a22).\n" +
    "att(a38,a43).\n" +
    "att(a34,a50).\n" +
    "att(a15,a10).\n" +
    "att(a14,a17).\n" +
    "att(a16,a13).\n" +
    "att(a15,a19).\n" +
    "att(a16,a15).\n" +
    "att(a16,a14).\n" +
    "att(a37,a42).\n" +
    "att(a15,a18).\n" +
    "att(a11,a24).\n" +
    "att(a22,a3).\n" +
    "att(a12,a15).\n" +
    "att(a14,a12).\n" +
    "att(a13,a15).\n" +
    "att(a13,a14).\n" +
    "att(a10,a14).\n" +
    "att(a10,a13).\n" +
    "att(a10,a12).\n" +
    "att(a11,a16).\n" +
    "att(a11,a15).\n" +
    "att(a11,a12).\n" +
    "att(a35,a37).\n" +
    "att(a35,a36).\n" +
    "att(a36,a34).\n" +
    "att(a2,a1).\n" +
    "att(a35,a39).\n" +
    "att(a36,a32).\n" +
    "att(a1,a6).\n" +
    "att(a18,a33).\n" +
    "att(a39,a23).\n" +
    "att(a35,a33).\n" +
    "att(a10,a50).\n" +
    "att(a34,a38).\n" +
    "att(a2,a6).\n" +
    "att(a34,a39).\n" +
    "att(a2,a7).\n" +
    "att(a3,a6).\n" +
    "att(a19,a23).\n" +
    "att(a37,a28).\n" +
    "att(a3,a5).\n" +
    "att(a19,a22).\n" +
    "att(a18,a29).\n" +
    "att(a3,a4).\n" +
    "att(a10,a45).\n" +
    "att(a34,a33).\n" +
    "att(a34,a32).\n" +
    "att(a4,a2).\n" +
    "att(a4,a1).\n" +
    "att(a34,a30).\n" +
    "att(a37,a20).\n" +
    "att(a11,a44).\n" +
    "att(a32,a33).\n" +
    "att(a5,a4).\n" +
    "att(a37,a24).\n" +
    "att(a4,a9).\n" +
    "att(a4,a8).\n" +
    "att(a36,a40).\n" +
    "att(a36,a41).\n" +
    "att(a5,a7).\n" +
    "att(a5,a8).\n" +
    "att(a17,a21).\n" +
    "att(a18,a20).\n" +
    "att(a6,a4).\n" +
    "att(a6,a5).\n" +
    "att(a18,a23).\n" +
    "att(a6,a8).\n" +
    "att(a18,a21).\n" +
    "att(a17,a29).\n" +
    "att(a18,a22).\n" +
    "att(a19,a20).\n" +
    "att(a7,a4).\n" +
    "att(a19,a21).\n" +
    "att(a39,a38).\n" +
    "att(a14,a33).\n" +
    "att(a19,a14).\n" +
    "att(a15,a20).\n" +
    "att(a38,a33).\n" +
    "att(a8,a3).\n" +
    "att(a33,a46).\n" +
    "att(a38,a35).\n" +
    "att(a38,a37).\n" +
    "att(a19,a16).\n" +
    "att(a36,a37).\n" +
    "att(a8,a9).\n" +
    "att(a16,a21).\n" +
    "att(a37,a32).\n" +
    "att(a36,a38).\n" +
    "att(a37,a34).\n" +
    "att(a9,a6).\n" +
    "att(a9,a7).\n" +
    "att(a50,a46).\n" +
    "att(a50,a47).\n" +
    "att(a50,a49).\n" +
    "att(a33,a23).\n" +
    "att(a50,a20).\n" +
    "att(a33,a28).\n" +
    "att(a31,a28).\n" +
    "att(a32,a27).\n" +
    "att(a31,a2).\n" +
    "att(a31,a34).\n" +
    "att(a32,a31).\n" +
    "att(a32,a30).\n" +
    "att(a31,a35).\n" +
    "att(a30,a31).\n" +
    "att(a33,a8).\n" +
    "att(a35,a23).\n" +
    "att(a30,a35).\n" +
    "att(a30,a27).\n" +
    "att(a30,a29).\n" +
    "att(a35,a17).\n" +
    "att(a31,a27).\n" +
    "att(a31,a26).\n" +
    "att(a30,a21).\n" +
    "att(a30,a26).\n" +
    "att(a30,a25).\n" +
    "att(a39,a8).\n" +
    "att(a26,a24).\n" +
    "att(a25,a29).\n" +
    "att(a26,a22).\n" +
    "att(a12,a9).\n" +
    "att(a26,a20).\n" +
    "att(a25,a26).\n" +
    "att(a27,a25).\n" +
    "att(a27,a23).\n" +
    "att(a26,a29).\n" +
    "att(a27,a21).\n" +
    "att(a13,a8).\n" +
    "att(a28,a26).\n" +
    "att(a24,a33).\n" +
    "att(a9,a42).\n" +
    "att(a28,a27).\n" +
    "att(a9,a40).\n" +
    "att(a28,a25).\n" +
    "att(a8,a46).\n" +
    "att(a28,a23).\n" +
    "att(a25,a34).\n" +
    "att(a29,a27).\n" +
    "att(a29,a28).\n" +
    "att(a9,a46).\n" +
    "att(a5,a50).\n" +
    "att(a21,a26).\n" +
    "att(a7,a40).\n" +
    "att(a21,a22).\n" +
    "att(a17,a5).\n" +
    "att(a34,a3).\n" +
    "att(a6,a48).\n" +
    "att(a22,a25).\n" +
    "att(a3,a50).\n" +
    "att(a24,a21).\n" +
    "att(a28,a15).\n" +
    "att(a24,a22).\n" +
    "att(a3,a48).\n" +
    "att(a25,a21).\n" +
    "att(a1,a50).\n" +
    "att(a24,a27).\n" +
    "att(a44,a45).\n" +
    "att(a1,a46).\n" +
    "att(a45,a40).\n" +
    "att(a48,a39).\n" +
    "att(a45,a42).\n" +
    "att(a44,a49).\n" +
    "att(a45,a41).\n" +
    "att(a49,a36).\n" +
    "att(a45,a43).\n" +
    "att(a1,a48).\n" +
    "att(a43,a44).\n" +
    "att(a48,a31).\n" +
    "att(a2,a49).\n" +
    "att(a46,a47).\n" +
    "att(a29,a41).\n" +
    "att(a47,a43).\n" +
    "att(a47,a44).\n" +
    "att(a47,a45).\n" +
    "att(a1,a32).\n" +
    "att(a49,a48).\n" +
    "att(a2,a32).\n" +
    "att(a1,a39).\n" +
    "att(a48,a43).\n" +
    "att(a48,a47).\n" +
    "att(a48,a46).\n" +
    "att(a28,a30).\n" +
    "att(a48,a45).\n" +
    "att(a48,a44).\n" +
    "att(a23,a47).\n" +
    "att(a8,a11).\n" +
    "att(a29,a32).\n" +
    "att(a9,a11).\n" +
    "att(a11,a7).\n" +
    "att(a9,a10).\n" +
    "att(a11,a6).\n" +
    "att(a9,a13).\n" +
    "att(a1,a31).\n" +
    "\n" +
    "Admissible Extension 1\n" +
    "in(a35) in(a34) in(a2) in(a5) in(a28) in(a48) undec(a41) undec(a42) undec(a40) undec(a9) undec(a16) undec(a14) undec(a12) undec(a13) undec(a11) undec(a18) undec(a19) undec(a21) undec(a22) undec(a24) out(a37) out(a27) out(a38) out(a29) out(a44) out(a47) out(a10) out(a46) out(a20) out(a43) out(a8) out(a23) out(a25) out(a1) out(a17) out(a4) out(a3) out(a15) out(a6) out(a50) out(a36) out(a39) out(a32) out(a33) out(a7) out(a45) out(a30) out(a49) out(a31) out(a26)\n" +
    "\n" +
    "Admissible Extension 2\n" +
    "in(a35) in(a34) in(a2) in(a5) in(a19) in(a28) in(a48) undec(a42) undec(a40) undec(a9) undec(a12) undec(a13) undec(a11) undec(a18) undec(a24) out(a37) out(a27) out(a38) out(a29) out(a44) out(a41) out(a47) out(a10) out(a46) out(a20) out(a22) out(a43) out(a21) out(a8) out(a23) out(a25) out(a1) out(a17) out(a4) out(a16) out(a3) out(a15) out(a6) out(a14) out(a50) out(a36) out(a39) out(a32) out(a33) out(a7) out(a45) out(a30) out(a49) out(a31) out(a26)\n" +
    "\n" +
    "Admissible Extension 3\n" +
    "in(a35) in(a34) in(a2) in(a5) in(a18) in(a19) in(a28) in(a48) undec(a42) undec(a40) undec(a9) undec(a12) undec(a11) undec(a24) out(a37) out(a27) out(a38) out(a29) out(a44) out(a41) out(a47) out(a10) out(a46) out(a20) out(a22) out(a43) out(a21) out(a8) out(a23) out(a25) out(a1) out(a17) out(a4) out(a16) out(a3) out(a13) out(a15) out(a6) out(a14) out(a50) out(a36) out(a39) out(a32) out(a33) out(a7) out(a45) out(a30) out(a49) out(a31) out(a26)";
let admissibleFile = new Blob([admissibleExample], {type: "text"});

let preferredExample = "arg(a41).\n" +
    "arg(a42).\n" +
    "arg(a40).\n" +
    "arg(a20).\n" +
    "arg(a9).\n" +
    "arg(a16).\n" +
    "arg(a17).\n" +
    "arg(a14).\n" +
    "arg(a15).\n" +
    "arg(a12).\n" +
    "arg(a13).\n" +
    "arg(a10).\n" +
    "arg(a11).\n" +
    "arg(a35).\n" +
    "arg(a1).\n" +
    "arg(a34).\n" +
    "arg(a2).\n" +
    "arg(a33).\n" +
    "arg(a3).\n" +
    "arg(a32).\n" +
    "arg(a4).\n" +
    "arg(a39).\n" +
    "arg(a5).\n" +
    "arg(a38).\n" +
    "arg(a6).\n" +
    "arg(a37).\n" +
    "arg(a7).\n" +
    "arg(a18).\n" +
    "arg(a36).\n" +
    "arg(a8).\n" +
    "arg(a19).\n" +
    "arg(a50).\n" +
    "arg(a31).\n" +
    "arg(a30).\n" +
    "arg(a25).\n" +
    "arg(a26).\n" +
    "arg(a27).\n" +
    "arg(a28).\n" +
    "arg(a21).\n" +
    "arg(a22).\n" +
    "arg(a23).\n" +
    "arg(a24).\n" +
    "arg(a44).\n" +
    "arg(a43).\n" +
    "arg(a46).\n" +
    "arg(a45).\n" +
    "arg(a48).\n" +
    "arg(a29).\n" +
    "arg(a47).\n" +
    "arg(a49).\n" +
    "att(a41,a36).\n" +
    "att(a49,a19).\n" +
    "att(a40,a37).\n" +
    "att(a42,a38).\n" +
    "att(a41,a38).\n" +
    "att(a48,a11).\n" +
    "att(a47,a15).\n" +
    "att(a40,a35).\n" +
    "att(a40,a36).\n" +
    "att(a16,a50).\n" +
    "att(a40,a31).\n" +
    "att(a18,a49).\n" +
    "att(a19,a41).\n" +
    "att(a42,a40).\n" +
    "att(a5,a10).\n" +
    "att(a41,a42).\n" +
    "att(a18,a44).\n" +
    "att(a41,a44).\n" +
    "att(a5,a13).\n" +
    "att(a42,a47).\n" +
    "att(a43,a41).\n" +
    "att(a42,a43).\n" +
    "att(a42,a45).\n" +
    "att(a42,a44).\n" +
    "att(a44,a30).\n" +
    "att(a7,a10).\n" +
    "att(a7,a12).\n" +
    "att(a6,a19).\n" +
    "att(a40,a45).\n" +
    "att(a44,a39).\n" +
    "att(a41,a40).\n" +
    "att(a40,a43).\n" +
    "att(a20,a21).\n" +
    "att(a20,a23).\n" +
    "att(a24,a19).\n" +
    "att(a44,a7).\n" +
    "att(a23,a19).\n" +
    "att(a21,a18).\n" +
    "att(a22,a17).\n" +
    "att(a20,a17).\n" +
    "att(a20,a19).\n" +
    "att(a21,a17).\n" +
    "att(a20,a16).\n" +
    "att(a45,a18).\n" +
    "att(a46,a14).\n" +
    "att(a41,a28).\n" +
    "att(a49,a2).\n" +
    "att(a43,a10).\n" +
    "att(a46,a1).\n" +
    "att(a47,a1).\n" +
    "att(a17,a14).\n" +
    "att(a16,a18).\n" +
    "att(a17,a18).\n" +
    "att(a17,a19).\n" +
    "att(a39,a42).\n" +
    "att(a39,a41).\n" +
    "att(a14,a19).\n" +
    "att(a39,a40).\n" +
    "att(a15,a11).\n" +
    "att(a15,a13).\n" +
    "att(a38,a43).\n" +
    "att(a14,a16).\n" +
    "att(a38,a40).\n" +
    "att(a16,a13).\n" +
    "att(a15,a19).\n" +
    "att(a11,a28).\n" +
    "att(a49,a7).\n" +
    "att(a15,a16).\n" +
    "att(a37,a41).\n" +
    "att(a15,a18).\n" +
    "att(a22,a3).\n" +
    "att(a13,a11).\n" +
    "att(a13,a12).\n" +
    "att(a12,a16).\n" +
    "att(a12,a17).\n" +
    "att(a12,a14).\n" +
    "att(a13,a17).\n" +
    "att(a21,a3).\n" +
    "att(a39,a50).\n" +
    "att(a12,a10).\n" +
    "att(a11,a16).\n" +
    "att(a11,a14).\n" +
    "att(a11,a12).\n" +
    "att(a36,a34).\n" +
    "att(a35,a39).\n" +
    "att(a2,a4).\n" +
    "att(a38,a29).\n" +
    "att(a34,a37).\n" +
    "att(a2,a5).\n" +
    "att(a30,a42).\n" +
    "att(a3,a1).\n" +
    "att(a35,a34).\n" +
    "att(a35,a31).\n" +
    "att(a2,a7).\n" +
    "att(a33,a36).\n" +
    "att(a3,a6).\n" +
    "att(a33,a35).\n" +
    "att(a18,a29).\n" +
    "att(a3,a5).\n" +
    "att(a19,a22).\n" +
    "att(a33,a34).\n" +
    "att(a3,a4).\n" +
    "att(a3,a7).\n" +
    "att(a32,a35).\n" +
    "att(a4,a7).\n" +
    "att(a5,a1).\n" +
    "att(a5,a7).\n" +
    "att(a6,a1).\n" +
    "att(a5,a8).\n" +
    "att(a36,a43).\n" +
    "att(a6,a4).\n" +
    "att(a6,a5).\n" +
    "att(a18,a23).\n" +
    "att(a6,a8).\n" +
    "att(a6,a9).\n" +
    "att(a19,a21).\n" +
    "att(a35,a44).\n" +
    "att(a37,a38).\n" +
    "att(a14,a28).\n" +
    "att(a38,a35).\n" +
    "att(a38,a34).\n" +
    "att(a8,a4).\n" +
    "att(a8,a7).\n" +
    "att(a19,a16).\n" +
    "att(a38,a36).\n" +
    "att(a36,a37).\n" +
    "att(a32,a44).\n" +
    "att(a16,a21).\n" +
    "att(a36,a39).\n" +
    "att(a37,a32).\n" +
    "att(a9,a5).\n" +
    "att(a33,a43).\n" +
    "att(a50,a47).\n" +
    "att(a50,a3).\n" +
    "att(a50,a4).\n" +
    "att(a30,a16).\n" +
    "att(a32,a29).\n" +
    "att(a33,a28).\n" +
    "att(a33,a27).\n" +
    "att(a31,a5).\n" +
    "att(a37,a10).\n" +
    "att(a31,a28).\n" +
    "att(a30,a9).\n" +
    "att(a31,a34).\n" +
    "att(a32,a1).\n" +
    "att(a30,a31).\n" +
    "att(a30,a37).\n" +
    "att(a32,a17).\n" +
    "att(a30,a27).\n" +
    "att(a30,a29).\n" +
    "att(a30,a26).\n" +
    "att(a30,a25).\n" +
    "att(a26,a22).\n" +
    "att(a12,a9).\n" +
    "att(a25,a26).\n" +
    "att(a39,a1).\n" +
    "att(a13,a7).\n" +
    "att(a26,a29).\n" +
    "att(a26,a27).\n" +
    "att(a28,a26).\n" +
    "att(a14,a8).\n" +
    "att(a28,a24).\n" +
    "att(a28,a25).\n" +
    "att(a28,a23).\n" +
    "att(a27,a28).\n" +
    "att(a23,a35).\n" +
    "att(a28,a21).\n" +
    "att(a29,a25).\n" +
    "att(a28,a29).\n" +
    "att(a5,a50).\n" +
    "att(a21,a25).\n" +
    "att(a35,a5).\n" +
    "att(a22,a20).\n" +
    "att(a50,a18).\n" +
    "att(a21,a22).\n" +
    "att(a25,a14).\n" +
    "att(a21,a24).\n" +
    "att(a26,a10).\n" +
    "att(a5,a49).\n" +
    "att(a21,a23).\n" +
    "att(a2,a50).\n" +
    "att(a22,a27).\n" +
    "att(a50,a10).\n" +
    "att(a22,a23).\n" +
    "att(a35,a2).\n" +
    "att(a22,a24).\n" +
    "att(a27,a10).\n" +
    "att(a23,a27).\n" +
    "att(a24,a20).\n" +
    "att(a3,a49).\n" +
    "att(a23,a24).\n" +
    "att(a3,a48).\n" +
    "att(a24,a29).\n" +
    "att(a25,a23).\n" +
    "att(a25,a24).\n" +
    "att(a24,a26).\n" +
    "att(a24,a27).\n" +
    "att(a25,a20).\n" +
    "att(a4,a48).\n" +
    "att(a49,a31).\n" +
    "att(a25,a48).\n" +
    "att(a44,a48).\n" +
    "att(a45,a44).\n" +
    "att(a6,a34).\n" +
    "att(a45,a43).\n" +
    "att(a1,a48).\n" +
    "att(a43,a44).\n" +
    "att(a2,a47).\n" +
    "att(a44,a40).\n" +
    "att(a46,a48).\n" +
    "att(a47,a43).\n" +
    "att(a47,a45).\n" +
    "att(a47,a46).\n" +
    "att(a4,a38).\n" +
    "att(a29,a43).\n" +
    "att(a46,a42).\n" +
    "att(a45,a49).\n" +
    "att(a9,a27).\n" +
    "att(a46,a43).\n" +
    "att(a46,a44).\n" +
    "att(a46,a45).\n" +
    "att(a49,a44).\n" +
    "att(a5,a26).\n" +
    "att(a45,a50).\n" +
    "att(a49,a47).\n" +
    "att(a49,a46).\n" +
    "att(a27,a31).\n" +
    "att(a27,a32).\n" +
    "att(a2,a36).\n" +
    "att(a48,a47).\n" +
    "att(a28,a30).\n" +
    "att(a48,a45).\n" +
    "att(a10,a6).\n" +
    "att(a28,a32).\n" +
    "att(a8,a12).\n" +
    "att(a10,a8).\n" +
    "att(a11,a1).\n" +
    "att(a8,a13).\n" +
    "att(a48,a50).\n" +
    "att(a29,a31).\n" +
    "att(a9,a11).\n" +
    "att(a11,a7).\n" +
    "att(a11,a6).\n" +
    "att(a11,a8).\n" +
    "att(a12,a1).\n" +
    "att(a46,a50).\n" +
    "att(a9,a14).\n" +
    "att(a10,a9).\n" +
    "att(a9,a17).\n" +
    "\n" +
    "Preferred Extension\n" +
    "in(a33) in(a32) in(a39) in(a30) undec(a20) undec(a14) undec(a15) undec(a12) undec(a13) undec(a10) undec(a11) undec(a2) undec(a3) undec(a4) undec(a5) undec(a38) undec(a6) undec(a7) undec(a18) undec(a8) undec(a19) undec(a21) undec(a22) undec(a23) undec(a24) undec(a46) undec(a45) undec(a48) undec(a47) undec(a49) out(a36) out(a37) out(a35) out(a50) out(a31) out(a41) out(a40) out(a42) out(a44) out(a43) out(a17) out(a16) out(a28) out(a1) out(a34) out(a29) out(a9) out(a27) out(a26) out(a25)";

let preferredFile = new Blob([preferredExample], {type: "text"});

let stableExample = "arg(a20).\n" +
    "arg(a16).\n" +
    "arg(a9).\n" +
    "arg(a17).\n" +
    "arg(a14).\n" +
    "arg(a15).\n" +
    "arg(a21).\n" +
    "arg(a12).\n" +
    "arg(a22).\n" +
    "arg(a13).\n" +
    "arg(a10).\n" +
    "arg(a11).\n" +
    "arg(a1).\n" +
    "arg(a2).\n" +
    "arg(a3).\n" +
    "arg(a4).\n" +
    "arg(a5).\n" +
    "arg(a6).\n" +
    "arg(a18).\n" +
    "arg(a7).\n" +
    "arg(a19).\n" +
    "arg(a8).\n" +
    "att(a1,a7).\n" +
    "att(a13,a2).\n" +
    "att(a1,a8).\n" +
    "att(a2,a1).\n" +
    "att(a13,a3).\n" +
    "att(a1,a5).\n" +
    "att(a13,a1).\n" +
    "att(a2,a5).\n" +
    "att(a2,a3).\n" +
    "att(a3,a1).\n" +
    "att(a14,a2).\n" +
    "att(a15,a1).\n" +
    "att(a3,a5).\n" +
    "att(a2,a11).\n" +
    "att(a4,a3).\n" +
    "att(a2,a18).\n" +
    "att(a3,a9).\n" +
    "att(a3,a8).\n" +
    "att(a4,a1).\n" +
    "att(a5,a6).\n" +
    "att(a5,a7).\n" +
    "att(a4,a16).\n" +
    "att(a17,a3).\n" +
    "att(a5,a12).\n" +
    "att(a22,a8).\n" +
    "att(a20,a8).\n" +
    "att(a18,a22).\n" +
    "att(a7,a3).\n" +
    "att(a19,a3).\n" +
    "att(a10,a5).\n" +
    "att(a19,a12).\n" +
    "att(a4,a21).\n" +
    "att(a7,a12).\n" +
    "att(a8,a4).\n" +
    "att(a10,a4).\n" +
    "att(a19,a8).\n" +
    "att(a9,a11).\n" +
    "att(a11,a18).\n" +
    "att(a5,a20).\n" +
    "att(a9,a12).\n" +
    "att(a5,a16).\n" +
    "att(a11,a14).\n" +
    "att(a11,a4).\n" +
    "\n" +
    "Stable Extension\n" +
    "in(a20) in(a16) in(a9) in(a17) in(a15) in(a21) in(a13) in(a10) in(a6) in(a7) in(a19) out(a2) out(a8) out(a1) out(a3) out(a5) out(a11) out(a12) out(a4) in(a14) in(a18) out(a22)";

let stableFile = new Blob([stableExample], {type: "text"});

let stableCompleteExample = "arg(a0).\n" +
    "arg(a2_2).\n" +
    "arg(a2).\n" +
    "arg(a2_4).\n" +
    "arg(a4).\n" +
    "arg(a2_6).\n" +
    "att(a0,a2_2).\n" +
    "att(a2_2,a2_2).\n" +
    "att(a2_2,a0).\n" +
    "att(a2,a2_4).\n" +
    "att(a2_4,a2_4).\n" +
    "att(a2_4,a2).\n" +
    "att(a4,a2_6).\n" +
    "att(a2_6,a2_6).\n" +
    "att(a2_6,a4).\n" +
    "\n" +
    "Complete extension 1\n" +
    "undec(a0) undec(a2_2) undec(a2) undec(a2_4) undec(a4) undec(a2_6)\n" +
    "\n" +
    "Complete extension 2\n" +
    "in(a2) undec(a0) undec(a2_2) undec(a4) undec(a2_6) out(a2_4)\n" +
    "\n" +
    "Complete extension 3\n" +
    "in(a4) undec(a0) undec(a2_2) undec(a2) undec(a2_4) out(a2_6)\n" +
    "\n" +
    "Complete extension 4\n" +
    "in(a2) in(a4) undec(a0) undec(a2_2) out(a2_4) out(a2_6)\n" +
    "\n" +
    "Complete extension 5\n" +
    "in(a0) undec(a2) undec(a2_4) undec(a4) undec(a2_6) out(a2_2)\n" +
    "\n" +
    "Complete extension 6\n" +
    "in(a0) in(a4) undec(a2) undec(a2_4) out(a2_2) out(a2_6)\n" +
    "\n" +
    "Complete extension 7\n" +
    "in(a0) in(a2) undec(a4) undec(a2_6) out(a2_2) out(a2_4)\n" +
    "\n" +
    "Complete extension 8\n" +
    "in(a0) in(a2) in(a4) out(a2_2) out(a2_4) out(a2_6)\n" +
    "\n" +
    "Stable extension\n" +
    "in(a0) in(a2) in(a4) out(a2_2) out(a2_4) out(a2_6)";

let stableCompleteFile = new Blob([stableCompleteExample], {type: "text"});
