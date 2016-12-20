var Immutable = require("immutable");
var RESERVED_WORDS = ["return", "call", "_"];
var envId = 0;

module.exports = 
{
  applyLexicalScope : applyLexicalScope
};

// Look at base level blocks
// Make a environment of UID -> { name, location } called reg
// any blocks which are folds
//   lex fold tape, passing reg as `parent`
//     environment UID -> { name, location } called reg includes parent ptr
//   set block `lex` -> reg
// Any blocks which are name reference, value reference, addresses not in reg
// or parent reg are syntactically undefined
// 
// Name of parents in environment is "0parentEnv" b/c leading 0 makes it invalid
// identifier. Every other entry should be identifier
// 
// Then, during runtime, scan fold's lex for name, then lex's parent, etc.
// If no entry found, runtime undefined... shouldn't happen ever b/c lex catches
//
// Throws Error on bad name useage
function applyLexicalScope(immutableConcreteJson, parentEnv)
{
  var i;
  var name;
  var environment = Immutable.Map();
  var referencesToCheck = [];
  var newScopesToApply = [];

  // Always use a fresh ID
  envId++;

  // If supplied, put the parent in its place
  if (parentEnv)
  {
    environment = environment.set("0parentEnv", parentEnv);
  }
  
  // Scan each block
  for (i = 0; i < immutableConcreteJson.getIn(["blocks"]).size; i++)
  {
    // Get the name
    name = immutableConcreteJson.getIn(["blocks", i, "name"]);

    // Register the name
    if (name)
    {
      environment = environment.set(
        name, 
        Immutable.Map(
          {
            // TODO: Supply all the information needed to access the current runtime value
            // Still figuring out what info needs to go here...
            index: i,
            name: name,
            envId: envId
          }));
    }

    // Is it a simple block?
    if ((typeof immutableConcreteJson.getIn(["blocks", i, "code"])) === "string")
    {
      // Is this is one of the reserved words?
      if (-1 != RESERVED_WORDS.indexOf(
          immutableConcreteJson.getIn(["blocks", i, "code"])))
      {
        // Yes, so do nothing
        continue;
      }

      // No, so it must be a previously defined word or error
      referencesToCheck.push(immutableConcreteJson.getIn(["blocks", i, "code"]));
      continue;
    }

    // It's a complex block so switch on the block's type
    switch (immutableConcreteJson.getIn(["blocks", i, "code", "type"]))
    {
    // Values which do not increase scope or reference scope
    case "number" :
    case "string" :
    case "operator" :
      // Do nothing
      break;

    // These cases are direct references, they should be represented in environment
    case "valueReference" :
    case "address" :
      referencesToCheck.push(
        immutableConcreteJson.getIn(["blocks", i, "code", "value"]));
      break;

    case "falsey" :
      throw new Error("Falsey lexical scope not implemented");
      // Not sure about this because Falsey inner value may be a fold or it may be a reference itself. 
      // referencesToCheck.push(
      //   immutableConcreteJson.getIn(["blocks", i, "code", "value"]),
      //   environment);
      break;
    case "fold" :
      // A thing to do!
      newScopesToApply.push(
          immutableConcreteJson.getIn(["blocks", i, "code", "tape"]));
      break;
    default :
      // Unrecognized block!
      throw new Error(
        "Lexical analyzer doesn't recognize block of type " +
        immutableConcreteJson.getIn(["blocks", i, "type"]));
    }
  }

  // Check all references
  while (referencesToCheck.length > 0)
  {
    var currentReferenceChecking = referencesToCheck.shift();
    checkReference(currentReferenceChecking, environment);
  }

  // Lexical scopes to apply
  for (i = 0; i < newScopesToApply.length; i++)
  {
    immutableConcreteJson =
      immutableConcreteJson.setIn(
        ["blocks", i, "code", "tape"],
        applyLexicalScope(newScopesToApply[i], environment));
  }

  // Attach the environment to the current thing
  immutableConcreteJson = 
    immutableConcreteJson.set(
      "environment",
      environment);

  return immutableConcreteJson;

  function checkReference(name, environment)
  {
    if (environment.get(name))
    {
      return true;
    }

    if (environment.get("0parentEnv"))
    {
      return checkReference(name, environment.get("0parentEnv"));
    }

    throw new Error("Name " + name + " never declared");
  }
}