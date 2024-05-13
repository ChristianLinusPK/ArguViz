import GLPK from 'https://cdn.skypack.dev/glpk.js';

//================================================================================
// count edge crossings
//================================================================================
//Crossings between two layers (Barth et al.)
function computeCC(attacks, set0, set1) {
    let layer_n = set0;
    let layer_s = set1;
    // All edges are treated as having their startnode in the n layer and their endnode in the s layer
    let edges = mapAttacksToNorthSouthEdges(attacks, layer_n, layer_s);
    sortLexicographically(edges, layer_n, layer_s);
    let southSequence = edges.map(edge => layer_s.indexOf(edge.s));
    const r = southSequence.length; // Number of edges
    const q = layer_s.length;

    let firstIndex = 1;
    while (firstIndex < q) {
        firstIndex *= 2;
    }
    let treeSize = 2 * firstIndex - 1;
    firstIndex -= 1;
    let tree = Array(treeSize).fill(0);

    let crossCount = 0;
    for (let i = 0; i < r; i++) {
        let index = southSequence[i] + firstIndex;
        tree[index]++;
        while (index > 0) {
            if (index % 2) crossCount += tree[index + 1];
            index = Math.floor((index - 1) / 2);
            tree[index]++;
        }
    }
    return crossCount;
}

// e_0 = (n_ik,s_jk) < (n_il,s_jl) = e_1 iff i_k < i_l or i_k = i_l and j_k < j_l
function sortLexicographically(edges, layer_n, layer_s) {
    edges.sort((e0, e1) => {
        const [ik, il] = [e0.n, e1.n].map(n => layer_n.indexOf(n));
        const [jk, jl] = [e0.s, e1.s].map(s => layer_s.indexOf(s));
        return ik !== il ? ik - il : jk - jl;
    });
}

// Maps each Attack between the layers to an edge with a startnode in the n layer and an endnode in the s layer.
function mapAttacksToNorthSouthEdges(attacks, layer_n, layer_s) {
    let edges = [];
    for (const att of attacks) {
        if (att.from.set === layer_n && att.to.set === layer_s) {
            edges.push({n: att.from, s: att.to})
        } else if (att.to.set === layer_n && att.from.set === layer_s) {
            edges.push({n: att.to, s: att.from})
        }
    }
    return edges;
}

// Compute crossings within a layer. Similar to Stack based Algorithm in (Alemany, 2019) but with an array as stack
function computeCCLinear(attacks, set) {
    let crossCount = 0;


    let edges = attacks.filter(att => att.from.set === set && att.to.set === set && att.from !== att.to);


    edges = edges.map(att => {
        return ((set.indexOf(att.from) > set.indexOf(att.to)) ? {start: att.to, end: att.from} : {
            start: att.from,
            end: att.to
        })
    })

    let stack = []
    let edgesIn = [];
    let edgesOut = [];
    for (let i = 0; i < set.length; i++) {
        let edgesInU = edges.filter(edge => edge.end === set[i]);
        let edgesOutU = edges.filter(edge => edge.start === set[i]);
        edgesOutU = edgesOutU.sort((e1, e2) => (set.indexOf(e2.end) - set.indexOf(e2.start)) - (set.indexOf(e1.end) - set.indexOf(e1.start)));
        edgesInU = edgesInU.sort((e1, e2) => (set.indexOf(e1.end) - set.indexOf(e1.start)) - (set.indexOf(e2.end) - set.indexOf(e2.start)))
        edgesIn.push(edgesInU);
        edgesOut.push(edgesOutU);
    }

    for (let i = 0; i < set.length; i++) {
        for (let j = 0; j < edgesIn[i].length; j++) {
            let e = stack.indexOf(edgesIn[i][j]);
            let onTop = (stack.length - 1) - e;
            stack.splice(e, 1);
            crossCount += onTop;
        }
        for (let j = 0; j < edgesOut[i].length; j++) {
            stack.push(edgesOut[i][j]);
        }
    }

    const edgeCount = {};
    for (let i = 0; i < edges.length; i++) {
        const edgeKey = `${set.indexOf(edges[i].start)}-${set.indexOf(edges[i].end)}`;
        if (edgeCount[edgeKey]) {
            edgeCount[edgeKey]++;
        } else {
            edgeCount[edgeKey] = 1;
        }
    }

    let overallDuplicates = 0;
    for (const count of Object.values(edgeCount)) {
        if (count > 1) {
            overallDuplicates++;
        }
    }

    return crossCount - overallDuplicates;
}


//================================================================================
// red edge selection
//================================================================================
function mapRedEdges(attacks, inSet, outSet, strategy, priority) {
    // random
    if (strategy === 2) {
        outSet.forEach(arg => {
            const atts = arg.incomingAttacks.filter(att => att.from.set === inSet);
            let selectedAttack;

            if (priority) {
                const attsNotAttacked = atts.filter(att => att.from.incomingAttacks.length < 1);
                selectedAttack = attsNotAttacked.length > 0 ? attsNotAttacked[0] : getRandomAttack(atts);
            } else {
                selectedAttack = getRandomAttack(atts);
            }

            selectedAttack.chosen = true;
        });
    } else if (strategy === 0) { // Focused
        //Priority means red edges are selected from arguments in IN with no incoming attacks first
        if (priority) {
            let choicesNotAttacked = inSet.filter(arg => arg.incomingAttacks.length < 1);
            choicesNotAttacked = choicesNotAttacked.map(arg => ({arg: arg, set: new Set(arg.outgoingAttacks)}));
            let argsWithNotAttackedChoice = outSet.filter(arg => arg.incomingAttacks && arg.incomingAttacks.some(attack => {
                return choicesNotAttacked.some(choice => attack.from === choice.arg);
            }));
            if (choicesNotAttacked.length > 0) {
                greedySetCover(argsWithNotAttackedChoice, choicesNotAttacked);
            }
            let choicesAttacked = inSet.filter(arg => arg.incomingAttacks.length > 0);
            let argsWithNoNotAttackedChoice = outSet.filter(arg => !argsWithNotAttackedChoice.some(mappedArg => mappedArg === arg));
            const argsToBeMapped = new Set(argsWithNoNotAttackedChoice);
            choicesAttacked = choicesAttacked.map(arg => ({
                arg: arg,
                set: new Set(arg.outgoingAttacks.filter(att => argsToBeMapped.has(att.to)))
            }));
            greedySetCover(argsWithNoNotAttackedChoice, choicesAttacked);
        } else {
            let choices = inSet.map(arg => ({arg: arg, set: new Set(arg.outgoingAttacks)}));
            greedySetCover(outSet, choices);
        }
    } else if (strategy === 1) { // Dispersed

        if (priority) {
            const choicesNotAttacked = inSet.filter(arg => arg.incomingAttacks.length < 1);
            const argsWithNotAttackedChoice = outSet.filter(arg => arg.incomingAttacks && arg.incomingAttacks.some(attack => choicesNotAttacked.some(choice => attack.from === choice)));

            if (choicesNotAttacked.length > 0) {
                const adjList = getAdjacencyListBidirectional(choicesNotAttacked);
                selectRedEdgesWithMaximumMatching(choicesNotAttacked, argsWithNotAttackedChoice, adjList, new Set(argsWithNotAttackedChoice));
            }

            const choicesAttacked = inSet.filter(arg => arg.incomingAttacks.length > 0);
            const adjList = getAdjacencyListBidirectional(choicesAttacked);
            const argsWithNoNotAttackedChoice = outSet.filter(arg => !argsWithNotAttackedChoice.some(mappedArg => mappedArg === arg));
            selectRedEdgesWithMaximumMatching(choicesAttacked, argsWithNoNotAttackedChoice, adjList, new Set(argsWithNoNotAttackedChoice));
        } else {
            const adjList = getAdjacencyListBidirectional(inSet);
            selectRedEdgesWithMaximumMatching([...inSet], [...outSet], adjList, new Set(outSet));
        }
    }

}

// treats edges undirected i.e. if A adjacent to B then also B adjacent to A.
function getAdjacencyListBidirectional(set) {
    let adjList = getAdjacencyList(set);

    for (const [arg, neighbours] of adjList.entries()) {
        neighbours.forEach(neighbour => {
            if (!adjList.has(neighbour)) {
                adjList.set(neighbour, []);
            }
            adjList.get(neighbour).push(arg);
        });
    }
    return adjList;
}

// Compute maximum matching, make edges in matching red, remove red edges from adjlist. Repeat until all arguments in OUT mapped.
function selectRedEdgesWithMaximumMatching(uSet, vSet, adjList, argsToBeMapped) {
    while (argsToBeMapped.size > 0) {
        const maximumMatching = hopcroftKarp(uSet, vSet, adjList);

        for (const [u, v] of maximumMatching.entries()) {
            const att = v.incomingAttacks.find(att => att.from === u && att.to === v);
            argsToBeMapped.delete(v);
            att.chosen = true;
            removeArgumentFromAdjacencyList(v, adjList);
        }
        vSet = vSet.filter(arg => argsToBeMapped.has(arg));
    }
}

function removeArgumentFromAdjacencyList(arg, adjList) {
    if (adjList.has(arg)) {
        adjList.get(arg).forEach(neighbour => {
            adjList.set(neighbour, adjList.get(neighbour).filter(item => item !== arg));
        });
        adjList.delete(arg);
    }
}

function getRandomAttack(attacks) {
    const randomIndex = Math.floor(Math.random() * attacks.length);
    return attacks[randomIndex];
}

// Priority Queue for focused greedy red edge selection
class PriorityQueue {
    constructor(n) {
        this.A = new Array(n + 1).fill(null).map(() => []);
        this.I = n;
    }

    decreaseKey(set, oldKey, newKey) {
        const oldBucket = this.A[oldKey];
        const index = oldBucket.indexOf(set);
        oldBucket.splice(index, 1);

        const newBucket = this.A[newKey];
        newBucket.push(set);
    }

    findMaxKeySet() {
        while (this.I > 0 && this.A[this.I].length === 0) {
            this.I--;
        }
        let max = this.A[this.I][0];
        return max.set.size > 0 ? max : null;
    }

    enqueue(set, key) {
        this.A[key].push(set);
        this.I = Math.max(this.I, key);
    }

    dequeueMaxKeySet() {
        const maxKeySet = this.findMaxKeySet();
        if (maxKeySet !== null) {
            this.A[this.I].shift();
        }
        return maxKeySet;
    }
}

function greedySetCover(outArgs, choices) {
    const uncoveredArgs = new Set(outArgs);
    const n = outArgs.length;
    let count = 0;

    const priorityQueue = new PriorityQueue(n);

    for (let i = 0; i < choices.length; i++) {
        priorityQueue.enqueue(choices[i], choices[i].set.size);
    }

    while (uncoveredArgs.size > 0) {
        const maxKeySet = priorityQueue.dequeueMaxKeySet();

        if (maxKeySet !== null) {
            for (const att of maxKeySet.set) {
                let element = att.to;
                if (uncoveredArgs.has(element)) {
                    att.chosen = true;
                    uncoveredArgs.delete(element);
                }
                for (const choice of choices) {
                    const index = choices.indexOf(choice);
                    if (choice.set.has(element)) {
                        choice.set.delete(element);
                        priorityQueue.decreaseKey(choice, index, index - 1);
                    }
                }
            }
        } else {
            break;
        }
    }
}

function hopcroftKarp(U, V, adjList) {
    const Pair_U = new Map();
    const Pair_V = new Map();
    const Dist = new Map();
    const matchingPairs = new Map();
    const Q = []; // Queue for BFS
    const NIL = "NIL";

    for (const u of U) {
        Pair_U.set(u, NIL);
    }
    for (const v of V) {
        Pair_V.set(v, NIL);
    }
    let matching = 0;

    while (BFS()) {
        for (const u of U) {
            if (Pair_U.get(u) === NIL && DFS(u)) {
                matching++;
            }
        }
    }

    return matchingPairs;

    function BFS() {
        for (const u of U) {
            if (Pair_U.get(u) === NIL) {
                Dist.set(u, 0);
                Q.push(u);
            } else {
                Dist.set(u, Infinity);
            }
        }
        Dist.set(NIL, Infinity);

        while (Q.length > 0) {
            const u = Q.shift();
            if (Dist.get(u) < Dist.get(NIL)) {
                for (const v of adjList.get(u)) {
                    if (Dist.get(Pair_V.get(v)) === Infinity) {
                        Dist.set(Pair_V.get(v), Dist.get(u) + 1);
                        Q.push(Pair_V.get(v));
                    }
                }
            }
        }

        return Dist.get(NIL) !== Infinity;
    }

    function DFS(u) {
        if (u !== NIL) {
            for (const v of adjList.get(u)) {
                if (Dist.get(Pair_V.get(v)) === Dist.get(u) + 1) {
                    if (DFS(Pair_V.get(v))) {
                        Pair_V.set(v, u);
                        Pair_U.set(u, v);
                        matchingPairs.set(u, v); // Add the matching pair
                        return true;
                    }
                }
            }
            Dist.set(u, Infinity);
            return false;
        }
        return true;
    }
}

//================================================================================
// barycenter
//================================================================================
function computeBarycenter(args, positions) {
    if (args.length < 1) {
        return 0;
    }
    const ySum = args.reduce((acc, arg) => acc + positions.get(arg), 0);
    return ySum / args.length;
}

// Use barycenter for position for free args in IN but keep relative order of args with outgoing red edges fixed
function barycenterFreeArgs(inSet, outSet) {
    let positions = getPositionsAsOrderInLayer(outSet);
    const freeArgs = inSet.filter(arg => !getChosenOutgoingAttacks(arg).length);
    const chosenArgs = inSet.filter(arg => getChosenOutgoingAttacks(arg).length);

    for (const arg of freeArgs) {
        const argsToCenterOff = getNeighbours(arg).filter(arg => arg.set === outSet);
        arg.y = computeBarycenter(argsToCenterOff, positions);
    }

    inSet.sort((arg1, arg2) => sortWithPreservedChosenArgOrder(arg1, arg2, chosenArgs));
}

function sortWithPreservedChosenArgOrder(arg1, arg2, chosenArgs) {
    const index1 = chosenArgs.indexOf(arg1);
    const index2 = chosenArgs.indexOf(arg2);

    if (index1 !== -1 && index2 !== -1) {
        return index1 - index2;
    }

    return arg1.y - arg2.y;
}

// Find the order of arguments with outgoing red edges by calculating the barycenter of the arguments in their group and sort them based on the computed BC value
function barycenterChosenArgs(inSet, outSet) {
    let positions = getPositionsAsOrderInLayer(outSet);
    let positionsIN = getPositionsAsOrderInLayer(inSet);
    const freeArgs = inSet.filter(arg => !getChosenOutgoingAttacks(arg).length);
    const chosenArgs = inSet.filter(arg => getChosenOutgoingAttacks(arg).length);

    for (const arg of chosenArgs) {
        let argsInGroup = getChosenOutgoingAttacks(arg).map(att => att.to);
        arg.y = computeBarycenter(argsInGroup, positions);
    }

    for (const arg of freeArgs) {
        arg.y = positionsIN.get(arg)
    }


    inSet.sort((arg1, arg2) => sortChosenArgs(arg1, arg2, chosenArgs));
}

// Places all arguments with outgoing red edges according to the order of their groups and before other arguments in IN
function sortChosenArgs(arg1, arg2, chosenArgs) {
    const arg1InChosen = chosenArgs.includes(arg1);
    const arg2InChosen = chosenArgs.includes(arg2);

    if (arg1InChosen && arg2InChosen) {
        return arg1.y - arg2.y; // Sort chosen arguments based on the y property
    } else if (arg1InChosen) {
        return -1; // Sort arg1 before arg2 (arg1 is chosen)
    } else if (arg2InChosen) {
        return 1; // Sort arg2 before arg1 (arg2 is chosen)
    } else {
        return 0; // Preserve the order if both arguments are not chosen
    }

}

// Calculates the barycenter for a group of arguments that have red edges from the same argument in IN chosen
function barycenterGroups(inSet, outSet) {
    const chosenArgs = inSet.filter(arg => getChosenOutgoingAttacks(arg).length);
    let positions = getPositionsAsOrderInLayer(inSet);
    let groups = [];
    for (const chosenArg of chosenArgs) {
        let argsInGroup = getChosenOutgoingAttacks(chosenArg).map(att => att.to);
        let argsToCenterOff = [];
        groups.push(argsInGroup);
        for (const arg of argsInGroup) {
            argsToCenterOff = argsToCenterOff.concat(getNeighbours(arg).filter(arg => arg.set === inSet));
        }

        let groupCenter = computeBarycenter(argsToCenterOff, positions);

        for (const arg of argsInGroup) {
            arg.y = groupCenter;
        }
    }

    let argToGroupMap = new Map();

    for (const group of groups) {
        //If two groups would end up at the same position the the index in the group array just ensures that arguments in a group are placed together
        const index = groups.indexOf(group);
        for (const arg of group) {
            argToGroupMap.set(arg, index);
        }
    }

    outSet.sort((arg1, arg2) => arrangeGroups(arg1, arg2, argToGroupMap));
}

function arrangeGroups(arg1, arg2, argToGroupMap) {
    if (arg1.y < arg2.y) {
        return -1;
    } else if (arg1.y > arg2.y) {
        return 1;
    } else {
        // If 'y' values are the same, compare the group indexes
        const groupIndex1 = argToGroupMap.get(arg1);
        const groupIndex2 = argToGroupMap.get(arg2);

        if (groupIndex1 < groupIndex2) {
            return -1;
        } else if (groupIndex1 > groupIndex2) {
            return 1;
        } else {
            return 0;
        }
    }
}

// A group is a set of arguments in OUT that have an incoming red edge from the same IN argument
function barycenterWithinGroups(inSet, outSet) {
    let positions = getPositionsAsOrderInLayer(inSet);
    const chosenArgs = inSet.filter(arg => getChosenOutgoingAttacks(arg).length);
    let groups = [];
    for (const chosenArg of chosenArgs) {
        let argsInGroup = getChosenOutgoingAttacks(chosenArg).map(att => att.to);
        groups.push(argsInGroup);
        // For each argument in the group, compute the barycenter of its neighbours in the inSet and set its y-coordinate to the barycenter value
        for (const arg of argsInGroup) {
            const argsToCenterOff = getNeighbours(arg).filter(arg => arg.set === inSet);
            arg.y = computeBarycenter(argsToCenterOff, positions);
        }
    }

    // Flatten the groups array into a map that stores each argument as a key and its corresponding group index as the value
    let argToGroupMap = new Map();
    for (const group of groups) {
        const index = groups.indexOf(group);
        for (const arg of group) {
            argToGroupMap.set(arg, index);
        }
    }

    // Sort the arguments in the outSet array based on their y-coordinate value and group index
    outSet.sort((arg1, arg2) => {
        const groupIndex1 = argToGroupMap.get(arg1);
        const groupIndex2 = argToGroupMap.get(arg2);

        // If both arguments belong to the same group, sort them based on their y-coordinate value
        if (groupIndex1 === groupIndex2) {
            return arg1.y - arg2.y;
        } else {
            return 0;
        }
    });
}


// Barycenter for all arguments in IN with preserved chosen argument order
function barycenterIn(inSet, outSet) {
    let positions = getPositionsAsOrderInLayer(outSet);
    for (const arg of inSet) {
        arg.y = computeBarycenter(getNeighbours(arg).filter(arg => arg.set !== inSet), positions);
    }
    const chosenArgs = inSet.filter(arg => getChosenOutgoingAttacks(arg).length);
    // The order of the chosen args is preserved to avoid crossings between red Edges
    inSet.sort((arg1, arg2) => sortWithPreservedChosenArgOrder(arg1, arg2, chosenArgs));
}

// General barycenter Method
function barycenter(layer, layerFixed) {
    let positions = getPositionsAsOrderInLayer(layerFixed);
    for (const arg of layer) {
        const argsToCenterOff = getNeighbours(arg).filter(arg => arg.set === layerFixed);
        arg.y = computeBarycenter(argsToCenterOff, positions);
    }
    layer.sort((arg1, arg2) => arg1.y - arg2.y);
}

// Returns the arguments that attack the given argument or are attacked by it
function getNeighbours(arg) {
    const attackedByArgs = arg.incomingAttacks.map(att => att.from);
    const attacksArgs = arg.outgoingAttacks.map(att => att.to);
    return attackedByArgs.concat(attacksArgs);
}

// For the barycenter method the position of arguments is used.
function getPositionsAsOrderInLayer(layer) {
    let positions = new Map();
    for (let i = 0; i < layer.length; i++) {
        positions.set(layer[i], i);
    }
    return positions;
}

// Arguments in the outset get sorted according to the order of their chosen arguments
function sortOutToChosenArgs(inSet, outSet) {
    outSet.sort((a, b) => inSet.indexOf(getChosenIncomingAttacks(a)[0].from) - inSet.indexOf(getChosenIncomingAttacks(b)[0].from));
}

function getChosenIncomingAttacks(arg) {
    return arg.incomingAttacks.filter(att => att.chosen === true);
}

function getChosenOutgoingAttacks(arg) {
    return arg.outgoingAttacks.filter(att => att.chosen === true);
}


//================================================================================
// local search
//================================================================================
function localSearchRedEdges(attacks, inSet, outSet) {
    for (const outArg of outSet) {
        let currentlyChosen = getChosenIncomingAttacks(outArg).map(att => att.from)[0];
        let bestCC = computeCC(attacks, inSet, outSet);
        let bestCCLinear = computeCCLinear(attacks, outSet);
        let argsToChoose = (outArg.incomingAttacks.map(att => att.from)).filter(arg => arg.set === inSet);
        for (const arg of argsToChoose) {
            if (arg !== currentlyChosen) {
                let inSetOriginal = [...inSet];
                let outSetOriginal = [...outSet];

                // Select a different attack to be red
                const att = outArg.incomingAttacks.find(att => att.from === currentlyChosen);
                const attNew = outArg.incomingAttacks.find(att => att.from === arg);
                att.chosen = false;
                attNew.chosen = true;

                // Go through all the steps in the pipeline and calculate the new crossing counts
                pipeline(inSet, outSet);
                const newCC = computeCC(attacks, inSet, outSet);
                const newCCLinear = computeCCLinear(attacks, outSet);

                if (newCC < bestCC) {
                    // Fewer IN-OUT crossings
                    currentlyChosen = arg;
                    bestCC = newCC;
                    bestCCLinear = newCCLinear;
                } else if (newCC === bestCC && newCCLinear < bestCCLinear) {
                    // Same number of IN-OUT crossings but fewer OUT-OUT crossings
                    currentlyChosen = arg;
                    bestCCLinear = newCCLinear;
                } else {
                    // If there was no improvement reset
                    att.chosen = true;
                    attNew.chosen = false;
                    for (let i = 0; i < inSet.length; i++) {
                        inSet[i] = inSetOriginal[i];
                    }
                    for (let i = 0; i < outSet.length; i++) {
                        outSet[i] = outSetOriginal[i];
                    }
                }
            }
            ;
        }
    }
}

function pipeline(inSet, outSet) {
    barycenterGroups(inSet, outSet);
    barycenterWithinGroups(inSet, outSet);
    barycenterChosenArgs(inSet, outSet);
    barycenterIn(inSet, outSet);
}

//================================================================================
// exact methods
//================================================================================
// This can be used in Browser (but Gurobi is much faster)
async function exactTLCMGLPK(attacks, layer_n, layer_s, timeout) {
    const glpk = await GLPK();
    let model = toLPString(attacks, layer_n, layer_s);
    const lp = {
        name: 'LP',
        objective: {
            direction: glpk.GLP_MIN,
            name: 'obj',
            vars: model.vars
        },
        subjectTo: model.constraints,
        binaries: model.binaries
    };
    if(timeout < 1){
        timeout = 1;
    }
    timeout *= 60;
    console.log(timeout)
    const options = {
        msglev: glpk.GLP_MSG_ALL,
        tmlim: timeout,
        presol: true,
        cb: {
            call: progress => console.log(progress),
            each: 1
        }
    };

    const solution = await glpk.solve(lp, options);
    const vars = Object.entries(solution.result.vars);
    let orderings_n = vars.filter(v => v[0].startsWith("x") && v[1] === 1).map(v => v[0]);
    let orderings_s = vars.filter(v => v[0].startsWith("y") && v[1] === 1).map(v => v[0]);
    let redEdges = vars.filter(v => v[0].startsWith("r") && v[1] === 1).map(v => v[0]);
    attacks.forEach(att => {
        att.chosen = false;
    })
    redEdges.forEach(edge => {
        const [r, i, j] = edge.split(".").map((item) => item.trim());
        let selectedEdge = attacks.find(att => {
            return att.from.label === i && att.to.label === j
        });
        if (selectedEdge) {
            selectedEdge.chosen = true;
        }
    })
    topologicalSort(layer_n, orderings_n);
    topologicalSort(layer_s, orderings_s);
}

function toLPString(attacks, layer_n, layer_s) {
    let vars = [];
    let constraints = [];
    let binary = [];

    let atts = mapAttacksToNorthSouthEdges(attacks, layer_n, layer_s);
    atts.sort((att1, att2) => layer_n.indexOf(att1.n) - layer_n.indexOf(att2.n));

    function isMultiEdge(array, element) {
        const filteredArray = array.filter((att) => att.n === element.n && att.s === element.s);
        return filteredArray.length - 1;
    }

    let noMultiEdges = atts.filter((element, index, self) => {
        return !self.slice(index + 1).some((otherElement) =>
            otherElement.n === element.n && otherElement.s === element.s
        );
    });

    let weights = noMultiEdges.map(att => isMultiEdge(atts, att));

    atts = noMultiEdges;

    let attacksToS = (attacks.filter(att => att.from.set === layer_n && att.to.set === layer_s)).map(att => ({
        n: att.from,
        s: att.to
    }));

    let constraintNumber = 0;
    for (let i = 0; i < atts.length; i++) {
        for (let j = i + 1; j < atts.length; j++) {
            if (atts[i].n === atts[j].n || atts[i].s === atts[j].s) {
                continue;
            }
            let cijkl = "c" + atts[i].n.label + "." + atts[i].s.label + "." + atts[j].n.label + "." + atts[j].s.label
            vars.push({name: cijkl, coef: (weights[i] + weights[j] + 1)});
            let xik = 'x.' + atts[i].n.label + "." + atts[j].n.label;
            let xki = 'x.' + atts[j].n.label + "." + atts[i].n.label;
            let yjl = 'y.' + atts[i].s.label + "." + atts[j].s.label;
            let ylj = 'y.' + atts[j].s.label + "." + atts[i].s.label;
            constraints.push({
                    name: 'cons' + constraintNumber,
                    vars: [
                        {name: xik, coef: 1},
                        {name: ylj, coef: 1},
                        {name: cijkl, coef: -1}
                    ],
                    bnds: {type: 3, ub: 1.0, lb: 0},
                },
                {
                    name: 'cons' + (constraintNumber + 1),
                    vars: [
                        {name: xki, coef: 1},
                        {name: yjl, coef: 1},
                        {name: cijkl, coef: -1}
                    ],
                    bnds: {type: 3, ub: 1.0, lb: 0},
                });
            constraintNumber += 2;
            binary.push(cijkl);

            if (attacksToS.find(att => {
                return att.n === atts[i].n && att.s === atts[i].s
            }) && attacksToS.find(att => {
                return att.n === atts[j].n && att.s === atts[j].s
            })) {
                let rij = "r." + atts[i].n.label + "." + atts[i].s.label;
                let rkl = "r." + atts[j].n.label + "." + atts[j].s.label;
                constraints.push({
                    name: 'cons' + constraintNumber,
                    vars: [
                        {name: rij, coef: 1},
                        {name: rkl, coef: 1},
                        {name: cijkl, coef: 1}
                    ],
                    bnds: {type: 3, ub: 2.0, lb: 0}
                });
                constraintNumber++;
            }
        }
    }

    for (let i = 0; i < layer_n.length - 1; i++) {
        for (let j = i + 1; j < layer_n.length; j++) {
            let xij = 'x.' + layer_n[i].label + "." + layer_n[j].label;
            let xji = 'x.' + layer_n[j].label + "." + layer_n[i].label;
            constraints.push({
                name: 'cons' + constraintNumber,
                vars: [
                    {name: xij, coef: 1},
                    {name: xji, coef: 1},
                ],
                bnds: {type: 3, ub: 1.0, lb: 0}
            }, {
                name: 'cons' + (constraintNumber + 1),
                vars: [
                    {name: xij, coef: 1},
                    {name: xji, coef: 1},
                ],
                bnds: {type: 2, ub: 0, lb: 1.0}
            });
            constraintNumber += 2;
            binary.push(xij, xji);
        }
    }

    for (let i = 0; i < layer_s.length - 1; i++) {
        for (let j = i + 1; j < layer_s.length; j++) {
            let yij = 'y.' + layer_s[i].label + "." + layer_s[j].label;
            let yji = 'y.' + layer_s[j].label + "." + layer_s[i].label;
            constraints.push({
                name: 'cons' + constraintNumber,
                vars: [
                    {name: yij, coef: 1},
                    {name: yji, coef: 1},
                ],
                bnds: {type: 3, ub: 1.0, lb: 0}
            }, {
                name: 'cons' + (constraintNumber + 1),
                vars: [
                    {name: yij, coef: 1},
                    {name: yji, coef: 1},
                ],
                bnds: {type: 2, ub: 0, lb: 1.0}
            });
            constraintNumber += 2;
            binary.push(yij, yji);
        }
    }

    for (let i = 0; i < layer_n.length - 2; i++) {
        for (let j = i + 1; j < layer_n.length - 1; j++) {
            for (let k = j + 1; k < layer_n.length; k++) {
                let xij = 'x.' + layer_n[i].label + "." + layer_n[j].label;
                let xjk = 'x.' + layer_n[j].label + "." + layer_n[k].label;
                let xik = 'x.' + layer_n[i].label + "." + layer_n[k].label;
                constraints.push({
                    name: 'cons' + constraintNumber,
                    vars: [
                        {name: xij, coef: 1},
                        {name: xjk, coef: 1},
                        {name: xik, coef: -1},
                    ],
                    bnds: {type: 3, ub: 1.0, lb: 0}
                }, {
                    name: 'cons' + (constraintNumber + 1),
                    vars: [
                        {name: xij, coef: 1},
                        {name: xjk, coef: 1},
                        {name: xik, coef: -1},
                    ],
                    bnds: {type: 2, ub: 0, lb: 0}
                });
                constraintNumber += 2;
            }
        }
    }
    for (let i = 0; i < layer_s.length - 2; i++) {
        for (let j = i + 1; j < layer_s.length - 1; j++) {
            for (let k = j + 1; k < layer_s.length; k++) {
                let yij = 'y.' + layer_s[i].label + "." + layer_s[j].label;
                let yjk = 'y.' + layer_s[j].label + "." + layer_s[k].label;
                let yik = 'y.' + layer_s[i].label + "." + layer_s[k].label;
                constraints.push({
                    name: 'cons' + constraintNumber,
                    vars: [
                        {name: yij, coef: 1},
                        {name: yjk, coef: 1},
                        {name: yik, coef: -1},
                    ],
                    bnds: {type: 3, ub: 1.0, lb: 0}
                }, {
                    name: 'cons' + (constraintNumber + 1),
                    vars: [
                        {name: yij, coef: 1},
                        {name: yjk, coef: 1},
                        {name: yik, coef: -1},
                    ],
                    bnds: {type: 2, ub: 0, lb: 0}
                });
                constraintNumber += 2;
            }
        }
    }

    for (let i = 0; i < layer_s.length; i++) {
        let attackedBy = attacks.filter(att => att.to === layer_s[i] && att.from.set === layer_n);
        let red = [];
        attackedBy.forEach(att => {
            let rij = "r." + att.from.label + "." + att.to.label;
            red.push({name: rij, coef: 1});
            binary.push(rij);
        })
        if(red.length > 0){
            constraints.push({
                name: 'cons' + constraintNumber,
                vars: red,
                bnds: {type: 3, ub: 1.0, lb: 0}
            }, {
                name: 'cons' + (constraintNumber + 1),
                vars: red,
                bnds: {type: 2, ub: 0, lb: 1}
            });
            constraintNumber += 2;
        }
    }
    return {vars: vars, constraints: constraints, binaries: binary};
}


// Used to sort a layer based on the orderings returned by the exact methods
function topologicalSort(layer, orderings) {
    const graph = new Map();

    for (const ordering of orderings) {
        const [start, i, j] = ordering.split(".").map((item) => item.trim());
        let arg1 = layer.find((arg) => arg.label === i);
        let arg2 = layer.find((arg) => arg.label === j);
        if (!arg1 || !arg2) {
            console.log(ordering)
        }
        if (!graph.has(arg1)) {
            graph.set(arg1, []);
        }
        graph.get(arg1).push(arg2);
    }

    const visited = new Set();
    const result = [];

    function dfs(node) {
        visited.add(node);

        const neighbors = graph.get(node) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                dfs(neighbor);
            }
        }

        result.push(node);
    }

    for (const element of layer) {
        if (!visited.has(element)) {
            dfs(element);
        }
    }

    layer.length = 0;
    Array.prototype.push.apply(layer, result.reverse());
}

//================================================================================
// compute grounded extension
//================================================================================
function computeGrounded(args, inSet, outSet, undecSet) {
    let graph = getAdjacencyList(args);
    let [inSetNew, outSetNew] = computeWave(graph, [], []);
    inSet.length = 0;
    outSet.length = 0;
    undecSet.length = 0;
    if (inSetNew.length === 0) {
        for (const arg of args) {
            undecSet.push(arg)
            arg.set = undecSet;
        }
    } else {
        for (const arg of inSetNew) {
            inSet.push(arg);
            arg.set = inSet;
        }
        outSetNew.forEach(arg => {
                outSet.push(arg);
                arg.set = outSet;
            }
        );
        for (const arg of args) {
            if ((!outSet.includes(arg) && !inSet.includes(arg))) {
                undecSet.push(arg);
                arg.set = undecSet;
            }
        }
    }
}

// a grounded extensions is computed in "waves"
function computeWave(graph, inSet, outSet) {
    if (graph.size > 0) {
        let argsWithNoIncomingAttacks = findArgsWithNoIncomingAttacks(graph);
        if (argsWithNoIncomingAttacks.length > 0) {
            inSet = inSet.concat(argsWithNoIncomingAttacks);
            let argsAttacked = findArgsAttackedBy(argsWithNoIncomingAttacks, graph);
            outSet = outSet.concat(argsAttacked);
            let argsToRemove = argsWithNoIncomingAttacks.concat(argsAttacked);
            argsToRemove.forEach(arg => {
                graph = getGraphWithout(arg, graph);
            });
            return computeWave(graph, inSet, outSet);
        }
    }
    return [inSet, outSet];
}

function findArgsWithNoIncomingAttacks(graph) {
    let argsWithNoIncomingAttack = [];

    for (const [arg, neighbours] of graph.entries()) {
        let hasIncomingEdges = false;

        for (const [otherArg, neighbors] of graph.entries()) {
            if (otherArg !== arg && neighbors.includes(arg)) {
                hasIncomingEdges = true;
                break;
            }
        }

        if (!hasIncomingEdges) {
            argsWithNoIncomingAttack.push(arg);
        }
    }

    return argsWithNoIncomingAttack;
}

function findArgsAttackedBy(args, graph) {
    let argsAttacked = [];
    for (const arg of args) {
        const neighbours = graph.get(arg);
        for (const neighbour of neighbours) {
            if (!args.includes(neighbour) && !argsAttacked.includes(neighbour)) {
                argsAttacked.push(neighbour);
            }
        }
    }
    return argsAttacked;
}

// Returns the given args as keys with their neighbours in an array as value.
function getAdjacencyList(args) {
    let adjList = new Map();
    for (const arg of args) {
        if (!adjList.has(arg)) {
            adjList.set(arg, []);
        }
        for (const att of arg.outgoingAttacks) {
            adjList.get(arg).push(att.to);
        }
    }
    return adjList;
}

//================================================================================
// find odd circles
//================================================================================
function findOddCircles(set) {

    // Representing the graph as an adjacency list makes getting the transpose of the graph
    // or removing nodes from it easier
    let adjList = getAdjacencyListForSet(set);

    let sccs = findStronglyConnectedComponents(adjList);

    let cycles = [];

    for (const scc of sccs) {
        cycles = cycles.concat(findSimpleCirclesInSCC(scc, adjList));
    }

    cycles = cycles.filter(cycle => cycle.length % 2 !== 0);
    cycles.sort((a, b) => b.length - a.length);
    return cycles;
}

// Returns arguments in a set that attack or are attacked by other arguments in the set
function getArgsWithAttacksWithinSet(set) {
    return set.filter(arg => {
        const incomingAttacks = arg.incomingAttacks.filter(att => att.from.set === set);
        const outgoingAttacks = arg.outgoingAttacks.filter(att => att.to.set === set);
        const combinedAttacks = incomingAttacks.concat(outgoingAttacks);
        return combinedAttacks.length > 0;
    });
}

// Returns adjacency list for args within a layer. Edges that go to args outside the layer are ignored
function getAdjacencyListForSet(set) {
    let args = getArgsWithAttacksWithinSet(set)
    let adjList = new Map();
    for (const arg of args) {
        if (!adjList.has(arg)) {
            adjList.set(arg, []);
        }
        for (const att of arg.outgoingAttacks) {
            if (arg.set === att.to.set) {
                adjList.get(arg).push(att.to);
            }
        }
    }
    return adjList;
}

// Kosaraju's algorithm
function findStronglyConnectedComponents(adjList) {
    let visited = new Set;
    let stack = [];
    let sccs = [];

    for (const arg of adjList.keys()) {
        if (!visited.has(arg)) {
            dfs(arg, adjList, visited, stack);
        }
    }

    adjList = transpose(adjList);
    visited.clear();
    while (stack.length > 0) {
        const vertex = stack.pop();
        if (!visited.has(vertex)) {
            let scc = [];
            dfs(vertex, adjList, visited, scc);
            scc = new Set(scc);
            sccs.push([...scc]);
        }
    }
    return sccs;
}

function dfs(arg, adjList, visited, stack) {
    visited.add(arg);
    let neighbours = adjList.get(arg);
    if (neighbours) {
        for (const neighbor of neighbours) {
            if (!visited.has(neighbor)) {
                dfs(neighbor, adjList, visited, stack);
            }
        }
    }
    stack.push(arg);
}

// Reverse direction of edges
function transpose(adjList) {
    let graphTransposed = new Map();
    for (const [arg, neighbors] of adjList.entries()) {
        for (const neighbour of neighbors) {
            if (!graphTransposed.has(neighbour)) {
                graphTransposed.set(neighbour, []);
            }
            graphTransposed.get(neighbour).push(arg);
        }
    }
    return graphTransposed;
}

// Johnson’s algorithm
function findSimpleCirclesInSCC(scc, adjList) {
    let stack = [];
    let blockedSet = new Set();
    let blockedMap = new Map();
    let total = [];
    let graph = new Map(adjList);
    for (const arg of scc) {
        dfsWithCircleDetection(arg, arg, graph, stack, blockedSet, blockedMap, total);
        blockedSet.clear();
        blockedMap.clear();
        graph = getGraphWithout(arg, graph);
    }

    return total;
}

function dfsWithCircleDetection(arg, startingArg, adjList, stack, blockedSet, blockedMap, total) {
    stack.push(arg);
    blockedSet.add(arg);
    let foundCycle = false;

    let neighbours = adjList.get(arg);
    for (const neighbor of neighbours) {
        if (neighbor === startingArg) {
            const cycle = [...stack];
            total.push(cycle);
            foundCycle = true;
        } else if (!blockedSet.has(neighbor)) {
            let gotCycle = dfsWithCircleDetection(neighbor, startingArg, adjList, stack, blockedSet, blockedMap, total);
            foundCycle = foundCycle || gotCycle;
        }
    }

    if (foundCycle) {
        unblock(arg, blockedSet, blockedMap);
    } else {
        for (const neighbour of neighbours) {
            if (!blockedMap.has(neighbour)) {
                blockedMap.set(neighbour, new Set());
            }
            blockedMap.get(neighbour).add(arg);
        }
    }

    stack.pop();
    return foundCycle;
}

function unblock(arg, blockedSet, blockedMap) {
    blockedSet.delete(arg);
    if (blockedMap.has(arg)) {
        for (const blockedArg of blockedMap.get(arg)) {
            if (blockedSet.has(blockedArg)) {
                unblock(blockedArg, blockedSet, blockedMap);
            }
        }
        blockedMap.delete(arg);
    }
}

// returns adjlist without arg
function getGraphWithout(argToRemove, graph) {
    const graphWithout = new Map();
    for (const [arg, neighbors] of graph.entries()) {
        if (arg !== argToRemove) {
            graphWithout.set(arg, neighbors.filter(neighbor => neighbor !== argToRemove));
        }
    }
    return graphWithout;
}

export {
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
    topologicalSort,
    findOddCircles,
    computeGrounded,
    exactTLCMGLPK
}

