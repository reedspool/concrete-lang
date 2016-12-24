var Immutable = require("immutable");
var RESERVED_WORDS = ["return", "call", "_"];
var enumEnvironmentId = 0;
var enumTapeId = 0;

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
// Name of parents in environment is "parent" b/c leading 0 makes it invalid
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
  var currentTapeId;

  // Always use a fresh ID, to make Enumerable
  enumEnvironmentId++;

  // Set the ID on this environment
  environment = environment.set("id", enumEnvironmentId);

  // If supplied, put the parent in its place
  if (parentEnv)
  {
    environment = environment.set("parent", parentEnv);
  }

  // Attempt to get the tape ID (is there any case when this works?)
  if (immutableConcreteJson.get("id"))
  {
    console.warn("Didn't expect to actually find tape ID ever");
    currentTapeId = immutableConcreteJson.get("id");
  }
  else
  {
    // Get the current tapeId and increment to make Enumerable
    currentTapeId = enumTapeId++;

    // Apply the tape ID to the tape itself for future reference (pun intended)
    immutableConcreteJson = immutableConcreteJson.set("id", currentTapeId);
  }
  
  // Scan each block
  for (i = 0; i < immutableConcreteJson.getIn(["blocks"]).size; i++)
  {
    // Get the name
    name = immutableConcreteJson.getIn(["blocks", i, "name"]);

    // Register the name
    if (name)
    {
      environment = environment.setIn(
        ["names", name], 
        Immutable.Map(
          {
            // Supply all the information needed to access the runtime value
            index: i,
            name: name,
            environmentId: enumEnvironmentId,
            tapeId: currentTapeId
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
    case "blank" :
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
        {
          blockIndex: i,
          tape: 
            immutableConcreteJson.getIn(["blocks", i, "code", "tape"])
        });
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
    // Apply a lexical scope to this tape using the current environment as
    // its parent
    immutableConcreteJson =
      immutableConcreteJson.setIn(
        ["blocks", newScopesToApply[i].blockIndex, "code", "tape"],
        applyLexicalScope(newScopesToApply[i].tape, environment));
  }

  // Attach the environment to the current thing
  immutableConcreteJson = 
    immutableConcreteJson.set(
      "environment",
      environment);

  return immutableConcreteJson;

  function checkReference(name, environment)
  {
    if (environment.getIn(["names", name]))
    {
      return true;
    }

    if (environment.get("parent"))
    {
      return checkReference(name, environment.get("parent"));
    }

    throw new Error("Name " + name + " never declared");
  }
}