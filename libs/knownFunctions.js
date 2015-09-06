var _ = require('underscore');
var nodeUtils = require('./nodeUtils');
var rewrite = require ('./rewrite');
var WebGL = require('../WebGL'); 
var KnownFunction = require('./KnownFunction');
var glMatrixMapping = require('./glmatrixMapping');

var renameFunction = function(newName) {
    return function(node) {
        node.callee = {
                        "type": "Identifier",
                        "name": newName,
                        parent: node
                      };
    };
};
var markType  = function(node) {
    var replacementNode = node.arguments[1];
    node.type = 'SequenceExpression';
    node.expressions = [ node.arguments[1] ];
    node.arguments = node.callee = undefined; 
};
var castTypeInference = function(node) {
    var dataType = node.arguments[0].value;
    return nodeUtils.setDataType(node, dataType).concat(nodeUtils.setDataType(node.arguments[1], dataType));
}

var makeInfix = function(infix) {
    return function(node) {
        node.type = "BinaryExpression"; 
        node.operator = infix;
        node.left  = node.arguments[0]; 
        node.right = node.arguments[1]; 
        node.callee = node.arguments = undefined;
    };
};

function MemberFunction( name, fn ) {
    this.name = name;
    this.fn = fn; 
};
function Shared(name, args, rtn) {
    KnownFunction.call(this, "Math."+name, args, rtn, renameFunction(name));
};

var knownFunctions = [
    { name: "builtIns.asType", inferTypes: castTypeInference, transform: markType, toString: function() { return 'builtIns.asType(<any>, <type>)';} },
    new KnownFunction("mat4.multiplyVec3", ['mat4', 'vec3'], 'vec3', renameFunction("_mat4_multiplyVec3" )),
    new KnownFunction("vec3.scale", ['vec3', 'float'], 'vec3', makeInfix("*") ),   
    new KnownFunction("vec2", ['float','float'], 'vec2' ),
    new KnownFunction("vec3", ['float','float','float'], 'vec3' ),
    new KnownFunction("vec4", ['float','float','float','float'], 'vec4' ),
    new KnownFunction("Math.atan2", ['float','float'], 'float', renameFunction("atan") ),
].concat(WebGL.MetaBuiltins.map( function(f) {
    return new KnownFunction( "builtIns." + f.name, f.argTypes, f.rtnType, renameFunction(f.name) )
})).concat(WebGL.MetaBuiltins.filter( function(f) {    
    return f.constructor.name == "Shared";
}).map(function(f) {
    return new KnownFunction( "Math." + f.name, f.argTypes, f.rtnType, renameFunction(f.name) )
})).concat( glMatrixMapping );

var knownFunctionLookup = {};
for(var i = 0;i < knownFunctions.length;i++) {
    if(knownFunctionLookup[knownFunctions[i].name] === undefined ) {
       knownFunctionLookup[knownFunctions[i].name] = []; 
    }
    
    knownFunctionLookup[knownFunctions[i].name].push(knownFunctions[i]);
}

function getKnownFunction(node) {
    var fName = rewrite(node.callee); 
    var candidates = knownFunctionLookup[fName];
    if(candidates === undefined)
        return;
    
    if(candidates.length === 1)
        return candidates[0];
    
    candidates = candidates.filter(function(f) { return f.argTypes.length == node.arguments.length; } );
    
    //if(candidates.length === 1)
        return candidates[0];
    
    //throw new Error("Overloaded functions by type are not yet implemented -- " + fName); 
};

function remapFunctions( ast, _this ) {
    
    _.chain(nodeUtils.getAllNodes(ast)).filter(function(node) {
        return node.type == 'CallExpression';
    }).each(function( node ) {        
        var funName = rewrite(node.callee); 
        if(nodeUtils.getFunctionByName(ast, funName) !== undefined)
            return;     
        if( _this && _this[ rewrite(node.callee) ] != undefined) 
            return; 
            
        var rewriteFunction = getKnownFunction(node);
        if(rewriteFunction && rewriteFunction.transform) // No transform function means its fine as-is
            rewriteFunction.transform(node); 
        else if(rewriteFunction === undefined)
            node.error = new Error("Currently functions must be on a white list to be acceptable. " + rewrite(node.callee)   + " isn't on it.\n" +
                                   "Available are: " + _.map(knownFunctions, function(x) { return x.toString() }).join(",\r\n") + "."  );
    });
};

module.exports = {
    remap: remapFunctions,
    getKnownFunction: getKnownFunction,
    knownFunctionsSource: knownFunctionsSource,
    MemberFunction: MemberFunction
}
