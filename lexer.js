var Immutable = require("immutable");
var RESERVED_WORDS = ["return", "call", "apply", "_"];
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
function applyLexicalScope(immutableConcreteJson, parentEnv, args)
{
  var index;
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

  // If args supplied, check that all the arg list tape's members are named
  if (args)
  {
    for (
      index = 0;
      index < args.getIn(["blocks"]).size;
      index++)
    {
      // Get the name
      name = 
        args.getIn(["blocks", index, "name"]);

      // Register the name
      if (name)
      {
        environment = environment.setIn(
          ["names", name], 
          Immutable.Map(
            {
              // Supply all the information needed to access the runtime value
              type: "argument",
              index: index,
              name: name,
              environmentId: enumEnvironmentId,
              tapeId: currentTapeId
            }));
      }
      else
      {
        throw new Error("Formal arguments must be named")
      }
    }
    
    // Then run the same process on the arg list tape
    // TODO: Are formal arguments really a tape? 
    //     Pros:
    //       * Default values
    //     Cons:
    //       * These tapes need an ID, don't get one at the moment
    //       * The definitions should be checked from the above level, not here
    newScopesToApply.push(
      {
        blockIndex: index,
        tape: args
      });
  }
  
  // Scan each block
  for (index = 0; index < immutableConcreteJson.getIn(["blocks"]).size; index++)
  {
    // Get the name
    name = immutableConcreteJson.getIn(["blocks", index, "name"]);

    // Register the name
    if (name)
    {
      environment = environment.setIn(
        ["names", name], 
        Immutable.Map(
          {
            // Supply all the information needed to access the runtime value
            type: "local",
            index: index,
            name: name,
            environmentId: enumEnvironmentId,
            tapeId: currentTapeId
          }));
    }

    // Is it a simple block?
    if ((typeof immutableConcreteJson.getIn(["blocks", index, "code"])) === "string")
    {
      // Is this is one of the reserved words?
      if (-1 != RESERVED_WORDS.indexOf(
          immutableConcreteJson.getIn(["blocks", index, "code"])))
      {
        // Yes, so do nothing
        continue;
      }

      // No, so it must be a previously defined word or error
      // TODO: Remove when call by reference is implemented
      throw new Error("Call by reference not implemented");
      // referencesToCheck.push(immutableConcreteJson.getIn(["blocks", index, "code"]));
      continue;
    }

    // It's a complex block so switch on the block's type
    switch (immutableConcreteJson.getIn(["blocks", index, "code", "type"]))
    {
    // Values which do not increase scope or reference scope
    case "number" :
    case "string" :
    case "operator" :
    case "blank" :
      // Do nothing
      break;

    // These cases are direct references, they should be represented in environment
    case "callIdentifier" :
    case "valueReference" :
    case "address" :
      referencesToCheck.push(
        immutableConcreteJson.getIn(["blocks", index, "code", "value"]));
      break;

    case "falsey" :
      // TODO: Implement or throw error, currently letting it pass thru
      // throw new Error("Falsey lexical scope not implemented");
      // Not sure about this because Falsey inner value may be a fold or it may be a reference itself. 
      // referencesToCheck.push(
      //   immutableConcreteJson.getIn(["blocks", index, "code", "value"]),
      //   environment);
      break;
    case "fold" :
      // Apply lex rules to the fold's tape
      newScopesToApply.push(
        {
          blockIndex: index,
          tape: 
            immutableConcreteJson.getIn(["blocks", index, "code", "tape"]),
          args: immutableConcreteJson.getIn(["blocks", index, "code", "args"])
        });
      break;
    default :
      // Unrecognized block!
      throw new Error(
        "Lexical analyzer doesn't recognize block of type " +
        immutableConcreteJson.getIn(["blocks", index, "code", "type"]));
    }
  }

  // Check all references
  while (referencesToCheck.length > 0)
  {
    var currentReferenceChecking = referencesToCheck.shift();
    checkReference(currentReferenceChecking, environment);
  }

  // Lexical scopes to apply
  for (index = 0; index < newScopesToApply.length; index++)
  {
    // Apply a lexical scope to this tape using the current environment as
    // its parent
    immutableConcreteJson =
      immutableConcreteJson.setIn(
        ["blocks", newScopesToApply[index].blockIndex, "code", "tape"],
        applyLexicalScope(
          newScopesToApply[index].tape,
          environment,
        newScopesToApply[index].args));
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