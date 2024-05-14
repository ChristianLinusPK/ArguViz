from flask import Flask, request
from flask import make_response
from flask_cors import CORS, cross_origin
import gurobipy as gp
from gurobipy import GRB
import json


app = Flask(__name__)
cors = CORS(app)
app.config['CORS_HEADERS'] = 'Content-Type'

@app.route("/")
def home():
    return "up and running"
@app.route("/index")

@app.route('/exact', methods=['POST'])
def exact():
   message = None
   if request.method == 'POST':
        req = request.get_json()
        res = solve(req)
        resp = make_response(json.dumps({'redEdges':res[0], 'order1':res[1],'order2':res[2], 'order3':res[3], 'solved':res[4]}))
        resp.headers['Content-Type'] = "application/json"
        return resp

def solve(req):
    layer1 = req['layer1']
    layer2 = req['layer2']
    layer3 = req['layer3']
    edges = req['edges']
    weight12 = int(float(req['weight12']))
    weight23 = int(float(req['weight23']))
    weight2 = int(float(req['weight2']))
    weight3 = int(float(req['weight3']))
    timeout = int(float(req['timeout']))


    edgesMapped12 = mapEdgesToNorthSouth(layer1, layer2, edges)
    edgesMapped12.sort(key=lambda e: layer1.index(e[0]) if e[0] in layer1 else -1)
    noMultiEdges12 = removeMultiEdges(edgesMapped12)
    isMultiEdge12 = [isMultiEdge(edgesMapped12, e) for e in noMultiEdges12]
    edgesMapped12 = noMultiEdges12    

    edgesMapped23 = mapEdgesToNorthSouth(layer2, layer3, edges)
    edgesMapped23.sort(key=lambda e: layer2.index(e[0]) if e[0] in layer2 else -1)
    noMultiEdges23 = removeMultiEdges(edgesMapped23)
    isMultiEdge23 = [isMultiEdge(edgesMapped23, e) for e in noMultiEdges23]
    edgesMapped23 = noMultiEdges23

    edgesInLayer2 = getEdgesInLayer(layer2, edges)
    edgesInLayer2 = mapEdgesFromLowToHigh(layer2, edgesInLayer2)
    edgesInLayer2.sort(key=lambda e: layer2.index(e[0]) if e[0] in layer2 else -1)
    noMultiEdges2 = removeMultiEdges(edgesInLayer2)
    isMultiEdge2 = [isMultiEdge(edgesInLayer2, e) for e in edgesInLayer2]
    edgesInLayer2 = noMultiEdges2

    edgesInLayer3 = getEdgesInLayer(layer3, edges)
    edgesInLayer3 = mapEdgesFromLowToHigh(layer3, edgesInLayer3)
    edgesInLayer3.sort(key=lambda e: layer3.index(e[0]) if e[0] in layer3 else -1)
    noMultiEdges3 = removeMultiEdges(edgesInLayer3)
    isMultiEdge3 = [isMultiEdge(edgesInLayer3, e) for e in edgesInLayer3]
    edgesInLayer3 = noMultiEdges3

    edgesToS = getEdgesToS(layer1, layer2, edges)
    vars = {}
    crossingVars = []
    constraintNumber = 0

    m = gp.Model()

    if(timeout > 0):
        m.setParam('TimeLimit', timeout * 60)
        
    m.setParam('Method', 1)

    for i in range(len(layer1) - 1):
        for j in range(i + 1, len(layer1)):
            xij = 'x.' + layer1[i] + "." + layer1[j]
            xji = 'x.' + layer1[j] + "." + layer1[i]
            vars[xij] = m.addVar(vtype=GRB.BINARY, name=xij)
            vars[xji] = m.addVar(vtype=GRB.BINARY, name=xji)
            m.addConstr(vars[xij] + vars[xji] == 1, str(constraintNumber)) 
            constraintNumber += 1
    
    for i in range(len(layer2) - 1):
        for j in range(i + 1, len(layer2)):
            yij = 'y.' + layer2[i] + "." + layer2[j]
            yji = 'y.' + layer2[j] + "." + layer2[i]
            vars[yij] = m.addVar(vtype=GRB.BINARY, name=yij)
            vars[yji] = m.addVar(vtype=GRB.BINARY, name=yji)
            m.addConstr(vars[yij] + vars[yji] == 1, str(constraintNumber)) 
            constraintNumber += 1

    for i in range(len(layer3) - 1):
        for j in range(i + 1, len(layer3)):
            zij = 'z.' + layer3[i] + "." + layer3[j]
            zji = 'z.' + layer3[j] + "." + layer3[i]
            vars[zij] = m.addVar(vtype=GRB.BINARY, name=zij)
            vars[zji] = m.addVar(vtype=GRB.BINARY, name=zji)
            m.addConstr(vars[zij] + vars[zji] == 1, str(constraintNumber)) 
            constraintNumber += 1        

    for i in range(len(layer2)):
        edgesTo = getEdgesToNode(layer2[i], edges, layer1)
        edgeVars = []
        for e in edgesTo:
            rij = 'r.' + e[0] + "." + e[1]
            vars[rij] = m.addVar(vtype=GRB.BINARY, name=rij) 
            edgeVars.append(vars[rij])
        m.addConstr(gp.quicksum(edgeVars) == 1, str(constraintNumber)) 
        constraintNumber += 1

    for i in range(len(edgesMapped12) -1):
        for j in range(i + 1, len(edgesMapped12)):
            if(edgesMapped12[i][1] == edgesMapped12[j][1] or edgesMapped12[i][0] == edgesMapped12[j][0]):
                continue
            cijkl = "c." + edgesMapped12[i][0] + "." + edgesMapped12[i][1] + "." + edgesMapped12[j][0] + "." + edgesMapped12[j][1]
            coef = weight12
            if ((isMultiEdge12[i] + isMultiEdge12[j]) == 1):
                coef = 2 * weight12
            elif ((isMultiEdge12[i] + isMultiEdge12[j]) == 2):
                coef = 4 * weight12
            
            vars[cijkl] = m.addVar(vtype=GRB.BINARY, name=cijkl)
            crossingVars.append(vars[cijkl] * coef)
            xik = "x." + edgesMapped12[i][0] + "." + edgesMapped12[j][0]
            xki = "x." + edgesMapped12[j][0] + "." + edgesMapped12[i][0]
            yjl = "y." + edgesMapped12[i][1] + "." + edgesMapped12[j][1]
            ylj = "y." + edgesMapped12[j][1] + "." + edgesMapped12[i][1]
            m.addConstr(vars[xik] + vars[ylj] - vars[cijkl] <= 1, str(constraintNumber))    
            constraintNumber += 1
            m.addConstr(vars[xki] + vars[yjl] - vars[cijkl] <= 1, str(constraintNumber)) 
            constraintNumber += 1
            if(edgesMapped12[i] in edgesToS and edgesMapped12[j] in edgesToS):
                rij = 'r.' + edgesMapped12[i][0] + "." + edgesMapped12[i][1]
                rkl = 'r.' + edgesMapped12[j][0] + "." + edgesMapped12[j][1]
                m.addConstr(vars[rij] + vars[rkl] + vars[cijkl] <= 2, str(constraintNumber))    
                constraintNumber += 1

    for i in range(len(edgesMapped23) -1):
        for j in range(i + 1, len(edgesMapped23)):
            if(edgesMapped23[i][1] == edgesMapped23[j][1] or edgesMapped23[i][0] == edgesMapped23[j][0]):
                continue
            cijkl = "c." + edgesMapped23[i][0] + "." + edgesMapped23[i][1] + "." + edgesMapped23[j][0] + "." + edgesMapped23[j][1]
            coef = weight23
            if((isMultiEdge23[i] + isMultiEdge23[j]) == 1):
                coef = 2 * weight23
            elif ((isMultiEdge23[i] + isMultiEdge23[j]) == 2):
                coef = 4 * weight23
            vars[cijkl] = m.addVar(vtype=GRB.BINARY, name=cijkl)
            crossingVars.append(vars[cijkl] * coef)
            yik = "y." + edgesMapped23[i][0] + "." + edgesMapped23[j][0]
            yki = "y." + edgesMapped23[j][0] + "." + edgesMapped23[i][0]
            zjl = "z." + edgesMapped23[i][1] + "." + edgesMapped23[j][1]
            zlj = "z." + edgesMapped23[j][1] + "." + edgesMapped23[i][1]
            m.addConstr(vars[yik] + vars[zlj] - vars[cijkl] <= 1, str(constraintNumber))    
            constraintNumber += 1
            m.addConstr(vars[yki] + vars[zjl] - vars[cijkl] <= 1, str(constraintNumber)) 
            constraintNumber += 1

    for i in range(len(layer1) - 1):
        for j in range(i + 1, len(layer1)):
            xij = 'x.' + layer1[i] + "." + layer1[j]
            xji = 'x.' + layer1[j] + "." + layer1[i]
            m.addConstr(vars[xij] + vars[xji] == 1, str(constraintNumber)) 
            constraintNumber += 1
    
    for i in range(len(layer2) - 1):
        for j in range(i + 1, len(layer2)):
            yij = 'y.' + layer2[i] + "." + layer2[j]
            yji = 'y.' + layer2[j] + "." + layer2[i]
            m.addConstr(vars[yij] + vars[yji] == 1, str(constraintNumber)) 
            constraintNumber += 1
    
    for i in range(len(layer3) - 1):
        for j in range(i + 1, len(layer3)):
            zij = 'z.' + layer3[i] + "." + layer3[j]
            zji = 'z.' + layer3[j] + "." + layer3[i]
            m.addConstr(vars[zij] + vars[zji] == 1, str(constraintNumber)) 
            constraintNumber += 1
    
    for i in range(len(layer1) - 2):
        for j in range(i + 1, len(layer1) - 1):
            for k in range(j + 1, len(layer1)):
                xij = 'x.' + layer1[i] + "." + layer1[j]
                xjk = 'x.' + layer1[j] + "." + layer1[k]
                xik = 'x.' + layer1[i] + "." + layer1[k]
                m.addConstr(vars[xij] + vars[xjk] - vars[xik] <= 1, str(constraintNumber))
                constraintNumber += 1
                m.addConstr(vars[xij] + vars[xjk] - vars[xik] >= 0, str(constraintNumber))
                constraintNumber += 1
    
    for i in range(len(layer2) - 2):
        for j in range(i + 1, len(layer2) - 1):
            for k in range(j + 1, len(layer2)):
                yij = 'y.' + layer2[i] + "." + layer2[j]
                yjk = 'y.' + layer2[j] + "." + layer2[k]
                yik = 'y.' + layer2[i] + "." + layer2[k]
                m.addConstr(vars[yij] + vars[yjk] - vars[yik] <= 1, str(constraintNumber))
                constraintNumber += 1
                m.addConstr(vars[yij] + vars[yjk] - vars[yik] >= 0, str(constraintNumber))
                constraintNumber += 1

    for i in range(len(layer3) - 2):
        for j in range(i + 1, len(layer3) - 1):
            for k in range(j + 1, len(layer3)):
                zij = 'z.' + layer3[i] + "." + layer3[j]
                zjk = 'z.' + layer3[j] + "." + layer3[k]
                zik = 'z.' + layer3[i] + "." + layer3[k]
                m.addConstr(vars[zij] + vars[zjk] - vars[zik] <= 1, str(constraintNumber))
                constraintNumber += 1
                m.addConstr(vars[zij] + vars[zjk] - vars[zik] >= 0, str(constraintNumber))
                constraintNumber += 1  
    
    for i in range(len(edgesInLayer2) -1):
        for j in range(i + 1, len(edgesInLayer2)):
            if(edgesInLayer2[i][0] == edgesInLayer2[j][0] or edgesInLayer2[i][1] == edgesInLayer2[j][1] or edgesInLayer2[i][0] == edgesInLayer2[j][1] or edgesInLayer2[i][1] == edgesInLayer2[j][0]):
                continue
            cijkl = "c." + edgesInLayer2[i][0] + "." + edgesInLayer2[i][1] + "." + edgesInLayer2[j][0] + "." + edgesInLayer2[j][1]
            coef = weight2
            if((isMultiEdge2[i] + isMultiEdge2[j]) == 1):
                coef = 2* weight2
            elif ((isMultiEdge2[i] + isMultiEdge2[j]) == 2):
                coef = 4 * weight2
            vars[cijkl] = m.addVar(vtype=GRB.BINARY, name=cijkl)
            crossingVars.append(vars[cijkl] * coef)
            yik = "y." + edgesInLayer2[i][0] + "." + edgesInLayer2[j][0]
            ykj = "y." + edgesInLayer2[j][0] + "." + edgesInLayer2[i][1]
            yjl = "y." + edgesInLayer2[i][1] + "." + edgesInLayer2[j][1]
            yil = "y." + edgesInLayer2[i][0] + "." + edgesInLayer2[j][1]
            ylj = "y." + edgesInLayer2[j][1] + "." + edgesInLayer2[i][1]
            yjk = "y." + edgesInLayer2[i][1] + "." + edgesInLayer2[j][0]
            yli = "y." + edgesInLayer2[j][1] + "." + edgesInLayer2[i][0]
            yki = "y." + edgesInLayer2[j][0] + "." + edgesInLayer2[i][0]
            m.addConstr(vars[yik] + vars[ykj] + vars[yjl] - vars[cijkl] <= 2, str(constraintNumber))    
            constraintNumber += 1
            m.addConstr(vars[yil] + vars[ylj] + vars[yjk] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[yjk] + vars[yki] + vars[yil] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[yjl] + vars[yli] + vars[yik] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[yki] + vars[yil] + vars[ylj] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[ykj] + vars[yjl] + vars[yli] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[ylj] + vars[yjk] + vars[yki] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[yli] + vars[yik] + vars[ykj] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
   
    for i in range(len(edgesInLayer3) -1):
        for j in range(i + 1, len(edgesInLayer3)):
            if(edgesInLayer3[i][0] == edgesInLayer3[j][0] or edgesInLayer3[i][1] == edgesInLayer3[j][1] or edgesInLayer3[i][0] == edgesInLayer3[j][1] or edgesInLayer3[i][1] == edgesInLayer3[j][0]):
                continue
            cijkl = "c." + edgesInLayer3[i][0] + "." + edgesInLayer3[i][1] + "." + edgesInLayer3[j][0] + "." + edgesInLayer3[j][1]
            coef = weight3
            if((isMultiEdge3[i] + isMultiEdge3[j]) == 1):
                coef = 2* weight3
            elif ((isMultiEdge3[i] + isMultiEdge3[j]) == 2):
                coef = 4 * weight3
            vars[cijkl] = m.addVar(vtype=GRB.BINARY, name=cijkl)
            crossingVars.append(vars[cijkl] * coef)
            zik = "z." + edgesInLayer3[i][0] + "." + edgesInLayer3[j][0]
            zkj = "z." + edgesInLayer3[j][0] + "." + edgesInLayer3[i][1]
            zjl = "z." + edgesInLayer3[i][1] + "." + edgesInLayer3[j][1]
            zil = "z." + edgesInLayer3[i][0] + "." + edgesInLayer3[j][1]
            zlj = "z." + edgesInLayer3[j][1] + "." + edgesInLayer3[i][1]
            zjk = "z." + edgesInLayer3[i][1] + "." + edgesInLayer3[j][0]
            zli = "z." + edgesInLayer3[j][1] + "." + edgesInLayer3[i][0]
            zki = "z." + edgesInLayer3[j][0] + "." + edgesInLayer3[i][0]
            m.addConstr(vars[zik] + vars[zkj] + vars[zjl] - vars[cijkl] <= 2, str(constraintNumber))    
            constraintNumber += 1
            m.addConstr(vars[zil] + vars[zlj] + vars[zjk] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[zjk] + vars[zki] + vars[zil] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[zjl] + vars[zli] + vars[zik] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[zki] + vars[zil] + vars[zlj] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[zkj] + vars[zjl] + vars[zli] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[zlj] + vars[zjk] + vars[zki] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1
            m.addConstr(vars[zli] + vars[zik] + vars[zkj] - vars[cijkl] <= 2, str(constraintNumber)) 
            constraintNumber += 1

    m.setObjective(gp.quicksum(crossingVars), GRB.MINIMIZE)
    m.optimize()
    redEdges = []
    order1 = []
    order2 = []
    order3 = []
    solved = False

    if m.SolCount > 0:
        solved = True
        for v in m.getVars():
            if v.X == 1:
                if v.VarName.startswith("r"):
                    redEdges.append(v.VarName)
                if v.VarName.startswith("x"):
                    order1.append(v.VarName)
                if v.VarName.startswith("y"):
                    order2.append(v.VarName)   
                if v.VarName.startswith("z"):
                    order3.append(v.VarName)       

    return redEdges, order1, order2, order3, solved

def mapEdgesToNorthSouth(layerN, layerS, edges):
    northToSouth = []
    for e in edges:
        if e[0] in layerS and e[1] in layerN:
            northToSouth.append([e[1],e[0]])
        elif e[0] in layerN and e[1] in layerS:
            northToSouth.append(e)
    return northToSouth

def removeMultiEdges(edges):
    noMultiEdges = []
    for index, element in enumerate(edges):
        if not any(
            other_element[0] == element[0] and other_element[1] == element[1]
            for other_element in edges[index + 1:]
        ):
         noMultiEdges.append(element)
    return noMultiEdges

def isMultiEdge(egdes, edge):
    multiCount = [e for e in egdes if e[0] == edge[0] and e[1] == edge[1]]
    return len(multiCount) - 1

def getEdgesToS(layerN, layerS, edges):
    northToSouth = []
    for e in edges:
        if e[0] in layerN and e[1] in layerS:
            northToSouth.append(e)
    return northToSouth

def getEdgesInLayer(layer, edges):
    edgesInLayer = [] 
    for e in edges:
         if e[0] in layer and e[1] in layer:
            edgesInLayer.append(e)
    return edgesInLayer

def getEdgesToNode(node, edges, layer1):
    edgesTo = []
    for e in edges:
        if e[0] in layer1 and e[1] == node:
            edgesTo.append(e)
    return edgesTo

def mapEdgesFromLowToHigh(layer, edges):
    lowToHigh = []
    for e in edges:
        if layer.index(e[0]) < layer.index(e[1]):
            lowToHigh.append([e[0], e[1]])
        else:
            lowToHigh.append([e[1], e[0]])
    return lowToHigh


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug = True)