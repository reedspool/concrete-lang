var Immutable = require("immutable");
var parser = require("./parser.js");
var lexer = require("./lexer.js");
var MAX_STEPS = 1000;
var MAX_CALL_STACK_SIZE = 500;
var RESERVED_WORDS = ["return", "call", "_"];
var enumFrameId = 0;

module.exports = 
{
  execute : execute,
  executeStepIn : executeStepIn,
  SyntaxError : parser.SyntaxError
};

function execute(concreteJson)
{
  var immutableConcreteJson;

  // Coerce to Immutable
  if (concreteJson instanceof Immutable.Map)
  {
    immutableConcreteJson = concreteJson;
  }
  else
  {
    immutableConcreteJson = Immutable.fromJS(concreteJson); 
  }

  while (! immutableConcreteJson.get("dead"))
  {
    // Step the interpreter
    immutableConcreteJson = executeStepIn(immutableConcreteJson);
  }

  return immutableConcreteJson;
}

function executeStepIn(concreteJson)
{
  var step;
  var key;
  var immutableConcreteJson;
  var stackLevel;
  var codeToRun;
  var parsedResult;
  var result;
  var index;
  var blockToRun;
  var prevStackLevel;
  var prevIndex;
  var callStack;
  var referenceTableSlot;
  var currentFrameId;
  var codeToCheckForNames;
  var blockToCheckForNames;
  var inputs;
  var result;
  var operator;
  var inputIndex;
  var nextInput;

  // Coerce to Immutable
  if (concreteJson instanceof Immutable.Map)
  {
    immutableConcreteJson = concreteJson;
  }
  else
  {
    immutableConcreteJson = Immutable.fromJS(concreteJson); 
  }

  // In case of error, set a notifying flag
  immutableConcreteJson = immutableConcreteJson.set("midStep", true);

  step = immutableConcreteJson.get("step");

  if (! step && step !== 0)
  {
    step = 0;
    immutableConcreteJson = immutableConcreteJson.set("step", step);
  }

  if (step >= MAX_STEPS)
  {
    throw new Error("Maximum steps exceeded");
  }
   
  // Figure out current context
  stackLevel = immutableConcreteJson.get("stackLevel");

  // If we're at the lowest stack level, meaning no code has been run yet
  if ((!stackLevel && stackLevel !== 0) || stackLevel === -1)
  {
    // Set it to initial
    stackLevel = 0;

    // Make a new ID for this new frame, ane keep Enumerable
    currentFrameId = enumFrameId++;

    // And in the representation
    immutableConcreteJson = immutableConcreteJson.set("stackLevel", stackLevel);

    // Create the call stack with one level
    immutableConcreteJson =
      immutableConcreteJson
        .set(
          "callStack",
          Immutable.fromJS(
            [
              {
                frameId: currentFrameId,
                blocks: {},
                runner: 
                {
                  index: 0,
                  stackLevel: stackLevel
                }

              }
            ]
          ));

    // Perform lexical analysis before using the blocks for the first time
    immutableConcreteJson = 
      lexer.applyLexicalScope(
        immutableConcreteJson,
        Immutable.Map()); // TODO: Use this environment Map to link in plugins!!

    // Set the initial code in the stack
    immutableConcreteJson =
      immutableConcreteJson.setIn(
        ["callStack", stackLevel, "blocks"],
        immutableConcreteJson.get("blocks"));

    // Add the lexical environment from the base tape to the stack frame  
    immutableConcreteJson = 
      immutableConcreteJson.setIn(
        ["callStack", stackLevel, "environment"],
        immutableConcreteJson.get("environment"));

    // This is name definition time, so each name has to go in
    // a closure registry 
    // Add the referencesByStackFrameId map 
    // TODO: Implement closures
    // immutableConcreteJson = 
    //   immutableConcreteJson.setIn(
    //     ["callStack", stackLevel, "referencesByStackFrameId"],
    //     Immutable.Map());

    // Get the appropriate code from the run stack
    codeToCheckForNames =
      immutableConcreteJson
        .getIn(["callStack", stackLevel, "blocks"]);

    // TODO: Implement closures
    // Build an entry in the referenceTable for it
    // referenceTableSlot =
    //     immutableConcreteJson
    //       .getIn(
    //         ["callStack", stackLevel,
    //           "referencesByStackFrameId", currentFrameId]);

    // // There was no slot yet for this frameId
    // if (! referenceTableSlot)
    // {
    //   // So create one
    //   referenceTableSlot = 
    //     Immutable.fromJS(
    //       {
    //         frameId: immutableConcreteJson
    //                   .getIn(["callStack", stackLevel, "frameId"]),
    //         references: {}
    //       });
    // }

    // // We now have all the information, so we can fill up the stack frame's vals
    // for (index = 0; index < codeToCheckForNames.size; index++)
    // {
    //   blockToCheckForNames = codeToCheckForNames.get(index);

    //   if (! blockToCheckForNames)
    //   {
    //     throw new Error("Reference checking failed to select a block");
    //   }

    //   // If this block doesn't have a name,
    //   if (! blockToCheckForNames.get("name"))
    //   {
    //     // Leave it
    //     continue;
    //   }

    //   // This block has a name, so continue checking it out

    //   // If this name already has a value in this stack frame...
    //   if (referenceTableSlot.getIn(
    //         ["references", blockToCheckForNames.get("name")]))
    //   {
    //     console.warn(
    //       "Warning: "
    //       + "Name "
    //       + blockToCheckForNames.get("name")
    //       + " already defined in this frame");
    //   }

    //   // Add its value to the table, or change it if existant
    //   referenceTableSlot = 
    //     referenceTableSlot.setIn(
    //       ["references", blockToCheckForNames.get("name")],
    //       Immutable.fromJS(
    //         {
    //           name: blockToCheckForNames.get("name"),
    //           value: blockToCheckForNames
    //         })
    //       );
    // }

    // // Done adding to this frame's references, add the slot back into the table
    // immutableConcreteJson =
    //   immutableConcreteJson
    //     .setIn(
    //       ["callStack", stackLevel, 
    //         "referencesByStackFrameId", currentFrameId],
    //       referenceTableSlot);
  }

  // Get the appropriate code from the run stack
  codeToRun =
    immutableConcreteJson
      .getIn(["callStack", stackLevel, "blocks"]);

  // Discover which block the runner will run
  index =
    immutableConcreteJson
      .getIn(["callStack", stackLevel, "runner", "index"]);

  // Find the block underneath the runner
  blockToRun = codeToRun.get(index);

  // If there's no block here...
  if (! blockToRun) 
  {
    // Done with step, don't continue, return
    return returnPreviousToCarriageAndExitFrameAndEndStep(immutableConcreteJson);
  }

  // Is it a simple block?
  if (typeof blockToRun.get("code") === "string")
  {
    // Yes, so switch on the code
    switch (blockToRun.get("code"))
    {
    case "_" :
      // Do nothing
      break;

    case "return" :
      return returnPreviousToCarriageAndExitFrameAndEndStep(immutableConcreteJson);
      break;

    case "apply":
    case "call" :
      // Do call things
      //   increase stack level by 1
      //   If applying, singular input must be of type fold
      //       look for formal args and declare and define them
      //   If calling, singular input can be any value
      //       look for formal args and declare and define them all, redefine first formal arg to the input val
      stackLevel = stackLevel + 1;

      nextInput = codeToRun.get(index - 1);

      // Create a new stack frame
      immutableConcreteJson =
        immutableConcreteJson
          .setIn(
            ["callStack", stackLevel],
            Immutable.fromJS(
            {
              frameId: enumFrameId++,
              blocks: {},
              environment: {},
              runner:
              {
                index: 0,
                stackLevel: stackLevel
              }
            }));

      // Set the global stack level
      immutableConcreteJson =
        immutableConcreteJson.set("stackLevel", stackLevel);

      // Add the blocks from the tape to the stack frame  
      immutableConcreteJson = 
        immutableConcreteJson.setIn(
          ["callStack", stackLevel, "blocks"],
          codeToRun.getIn([index - 1, "code", "tape", "blocks"]));

      // Add the lexical environment from the tape to the stack frame  
      immutableConcreteJson = 
        immutableConcreteJson.setIn(
          ["callStack", stackLevel, "environment"],
          codeToRun.getIn([index - 1, "code", "tape", "environment"]));

      // Done stepping into new function call
      // Flip the flag back
      // Increment the step counter
      immutableConcreteJson = immutableConcreteJson.set("midStep", false);
      immutableConcreteJson = immutableConcreteJson.set("step", step + 1);
      return immutableConcreteJson;
      break;
    default :
      // TODO: It's an identifier, do identifier things
      // Check this scope
        // If not there, check parent scopes
        // When you find the code to run, do the call things
      throw new Error("Calling identifiers not yet implemented");
      break;
    }
  }
  else
  {
    // It's a complex block so switch on the block's type
    switch (blockToRun.get("code").get("type"))
    {
    // Values -- noops
    case "fold" :
    case "number" :
    case "string" :
    case "address" :
    case "falsey" :
    case "valueReference" :
      // Do nothing
      break;
    // A thing to do!
    case "operator" :
      inputs = [];
      result;
      operator = blockToRun.get("code").get("op")

      // Walk backwards from input count
      for (inputIndex = 1; inputIndex <= blockToRun.get("code").get("countInputs"); inputIndex++)
      {
        nextInput = codeToRun.get(index - inputIndex);

        if (! nextInput)
        {
          throw new Error("Not enough inputs for operation");
        }

        // Dereference reference values

        // Is it a simple block?
        if (typeof nextInput.get("code") === "string")
        {
          // Is this is one of the reserved words?
          if (-1 != RESERVED_WORDS.indexOf(
              nextInput.get("code")))
          {
            throw new Error(
              "Reserved word " + 
              nextInput.get("code") +
              " used as input for " + operator);
          }

          // TODO: Implement call references
          // Offer a hint
          throw new Error(
            "Identifier " + 
            nextInput.get("code") +
            " used as input for " + operator +
            ((Math.random() < 0.5)
              ? ". Perhaps you meant the value reference, *"
              : ". Perhaps you meant the address reference, @") +
            nextInput.get("code") +
            "?");
        }
        else
        {
          // It's a complex block so switch on the block's type
          switch (nextInput.getIn(["code", "type"]))
          {
          // These cases are direct references, they should be represented in environment
          case "valueReference" :
            nextInput = dereferenceValueBlock(
              nextInput.getIn(["code", "value"]));
            break;
          default :
            // Do nothing, it's just a normal value.
            break;
          }
        }

        // Front-load it, so left-most, top-most input is always first
        inputs.unshift(nextInput);
      }

      // Are we adding/concatenating?
      if(operator === "+")
      {
        // "+" operator is Plus or Concatenate
        // If 2 numbers, Plus
        // If 1 num 1 string, Concatenate
        // If anything else, throw an error
        inputs = 
          inputs
            .map(
              function (inputBlock)
              {
                var value;

                // It's a complex block so switch on the block's type
                switch (inputBlock.getIn(["code", "type"]))
                {
                // Values which do not increase scope or reference scope
                case "number" :
                  // These are cool
                  value = inputBlock.getIn(["code", "value"]);
                  break;
                case "string" :
                  // These are cool
                  return inputBlock.getIn(["code", "value"]);
                  break;

                // Invalid ops
                case "address" :
                case "falsey" :
                case "fold" :
                case "operator" :
                case "valueReference" :
                  throw new Error(
                    inputBlock.getIn(["code", "type"]) +
                    " used as input for " + operator);
                  break;

                default :
                  // Unrecognized block!
                  throw new Error(
                    "Unrecognized block of type " +
                    blockToRun.get("code").get("type"));
                }

                // If something went wrong...
                if (! value && value !== 0)
                {
                  // Return undefined, instead of whatever it is
                  return;
                }

                var parsed = parseFloat(value, 10)

                // If the parsing was bungled...
                if (isNaN(parsed))
                {
                  // Return undefined, not NaN;
                  console.warn("Error parseFloat: ", value);
                  return;
                }

                // ALL GOOD, PROPER VALUE FOUND
                return parsed;
              });

        // If String and number, coerce to string and concatenate
        // Luckily JS takes care of this for us!
        if (
          (typeof inputs[0] === "number"
            ||
            typeof inputs[0] === "string")
          &&
          (typeof inputs[1] === "number"
            ||
            typeof inputs[1] === "string")
          )
        {
          result = inputs[0] + inputs[1];
        }

        // If anything else, badness
        if (! result)
        {
          throw new Error("Expected only numbers or strings to concatenate")
        }
      }
      // Is it one of the numbers-only operators?
      else if(operator.match(/[-/*%<>]/))
      {
        // Attempt to coerce inputs
        inputs = 
          inputs.map(
            function (input)
            {
              var parsed = parseFloat(
                input.get("code").get("value"), 10)

              // If null or undefined or NaN, but not 0, 0's cool
              if (! parsed && parsed !== 0)
              {
                throw new Error(
                  "Non-numeric");
              }

              return parsed;
            });

        // Which operator was it exactly?
        switch(operator)
        {
        case "-" :
          result = inputs[0] - inputs[1];
          break;
        case "*" :
          result = inputs[0] * inputs[1];
          break;
        case "/" :
          result = inputs[0] / inputs[1];
          break;
        case "%" :
          result = inputs[0] % inputs[1];
          break;
        case "<" :
          result = inputs[0] < inputs[1];
          break;
        case ">" :
          result = inputs[0] > inputs[1];
          break;
        };
      }
      // Is it a boolean OR test?
      else if (operator === "|")
      { 
        // Short circuit operators
        if (inputs[0].get("code").get("type") === "falsey")
        {
          parsedResult = inputs[1];
        }
        else
        {
          parsedResult = inputs[0];
        }
      }
      // Is it a boolean AND test?
      else if (operator === "&")
      { 
        // Short circuit operators
        if (inputs[0].get("code").get("type") === "falsey")
        {
          parsedResult = inputs[0];
        }
        else
        {
          parsedResult = inputs[1];
        }
      }
      else if (operator === "?")
      { 
        // "If-else" - 3-input 1-output operator
        //   3 2 >
        //   test:_ 
        //   trueResult:@a
        //   falseResult:@b
        //   ?
        //   output:_
        //   
        //   /* spoiler: @a *output == _ */
        // 
        // test - falsey or not falsey (tm)
        // trueResult - output if test is not falsey
        // falseResult - output if test is falsey
        // Attempt to coerce inputs to booleans

        // It's only false if it's falsey! (tm)
        parsedResult =
          inputs[0].get("code").get("type") === "falsey"
          ? inputs[2]
          : inputs[1];
      }
      else if (operator === "!")
      { 
        // "Falseyfier" - 1-input 1-output operator
        //   input:"abcd"
        //   !
        //   output:_
        //   
        //   /* spoiler: !"abcd" *output == _ */
        // 
        //   input:!"abcd"
        //   !
        //   output: _
        //
        //   /* spoiler: "abcd" *output == _ */
        // input - any object, day or night
        // output - NOT THE INPUT ;)

        // If it's a falsey value, unwrap it
        if (inputs[0].get("code").get("type") === "falsey")
        {
          parsedResult = inputs[0].get("code").get("value");
        }
        else
        {
          // Use the original parser to turn host language result into concrete result
          parsedResult = parser.parseBlock("!'temp'");

          // Make into immutable
          parsedResult = Immutable.fromJS(parsedResult);
          
          // Dispose of the temp inner block and use the input
          parsedResult = parsedResult.setIn(
            ["code", "value"],
            inputs[0]);
        }
      }

      // If parsedResult hasn't been set yet
      if (! parsedResult)
      {
        // Well, result not being set yet is an error
        if (! result && result !== 0)
        {
          throw new Error("Unhandled operator " + operator);
        }

        // Use the original parser to turn JavaScript result into concrete result
        parsedResult = parser.parseBlock("" + result);

        // Make into immutable
        parsedResult = Immutable.fromJS(parsedResult);
      }

      immutableConcreteJson = 
        immutableConcreteJson.setIn(
          ["callStack", stackLevel, "blocks", index + 1, "code"],
          parsedResult.get("code"));

      // Are we at the base call stack level?
      if (stackLevel === 0)
      {
        // Yes, so also edit the top-layer blocks
        immutableConcreteJson = 
          immutableConcreteJson.setIn(
            ["blocks", index + 1, "code"],
            parsedResult.get("code"));
      }
      break;
    default :
      // Unrecognized block!
      throw new Error(
        "Unrecognized block of type " +
        blockToRun.get("code").get("type"));
    }
  }

  // Move the runner to the next block
  immutableConcreteJson = immutableConcreteJson.setIn(
    ["callStack", stackLevel, "runner", "index"], index + 1);

  // Flip the flag back
  // Increment the step counter
  immutableConcreteJson = immutableConcreteJson.set("midStep", false);
  immutableConcreteJson = immutableConcreteJson.set("step", step + 1);

  // Finally, give back the new version
  return immutableConcreteJson;

  // Do return things
  //    if stack level 0, set result, kill, and leave
  //    if stack level > 0, 
  //      place result as output
  //      reduce stack level
  //      move previous stack level index + 1
  //      destroy code
  // 
  function returnPreviousToCarriageAndExitFrameAndEndStep(immutableConcreteJson)
  {
    if (stackLevel === 0)
    {
      // We're dead in the water!
      immutableConcreteJson =
        immutableConcreteJson.set(
          "dead",
          true);

      // The result is the thing immediately before runner, which might also
      // be nothing because empty program or immediate return 
      immutableConcreteJson =
        immutableConcreteJson.set(
          "result",
          codeToRun.get(index - 1));
    }
    else
    {
      // Stack level is greater than 0, so do return
      prevStackLevel = stackLevel - 1;
      prevIndex = 
        immutableConcreteJson.get("callStack")
          .get(prevStackLevel)
          .get("runner")
          .get("index");

      // Replace that block's current codez with resultant codez
      immutableConcreteJson = 
        immutableConcreteJson.setIn(
          ["callStack", prevStackLevel, "blocks", prevIndex + 1, "code"],
          codeToRun.get(index - 1).get("code"));

      // Now that the output is placed, check if we're going for stack level 0
      if (prevStackLevel === 0)
      {
        // We're headed for ZERO!! This means the above effect has
        // changed the base layer blocks! Whoooop we matter in the universe!
        // Update the base level blocks to match the change
        immutableConcreteJson = 
          immutableConcreteJson.set(
            "blocks",
            immutableConcreteJson.getIn(
              ["callStack", prevStackLevel, "blocks"]));
      }

      // Advance the previous code by 1, representing the call being complete
      immutableConcreteJson = 
        immutableConcreteJson.setIn(
          ["callStack", prevStackLevel, "runner", "index"],
          prevIndex + 1);

      // Reduce stack level
      immutableConcreteJson = 
        immutableConcreteJson.set("stackLevel", stackLevel - 1);

      // Remove the current stack frame
      immutableConcreteJson = 
        immutableConcreteJson.deleteIn(["callStack", stackLevel]);
      
    }

    // Done with step
    // Flip the flag back
    // Increment the step counter
    immutableConcreteJson = immutableConcreteJson.set("midStep", false);
    immutableConcreteJson = immutableConcreteJson.set("step", step + 1);
    return immutableConcreteJson;
  }


  // TODO: IMPLEMENT THIS. Currently returns just the entry
  // Need to dig in to get the correct informationz
  // Currently stuck on how to resolve parsers
  // TODO: Once implemented, extend this capability to other operators
  //       and reserved words and implement inputs for calls
  //
  function dereferenceValueBlock(name)
  {
    var checkStackLevel = stackLevel;
    var envForName;
    
    // TODO: Implement closures
    // var currentFrameId =
    //   immutableConcreteJson
    //     .getIn(["callStack", stackLevel, "frameId"]);

    for (; checkStackLevel >= 0; checkStackLevel--)
    {
      envForName = immutableConcreteJson.getIn(
          ["callStack", checkStackLevel, 
            "environment", "names", name]);

      // Did we catch something?
      if (envForName)
      {
        // We found the correct stack level, so find the actual
        // entry in that call stack and return that
        return immutableConcreteJson.getIn(
          ["callStack", checkStackLevel, 
            "blocks", envForName.get("index")]);
      }
    }

    // We've walked the entire tree,
    throw new Error("Name " + name + " never declared");

    // TODO: Implement closures
    // if (! envForName)
    // {

    //   if (environment.get("parent"))
    //   {
    //     return dereferenceValueBlock(
    //       name,
    //       environment.get("parent"));
    //   }

    // }

    // TODO: Implement closures
    // Is there a location for it in the references table?
    // if (! (
    //     immutableConcreteJson.getIn(
    //       ["callStack", stackLevel, 
    //         "referencesByStackFrameId", currentFrameId]) &&
    //     immutableConcreteJson.getIn(
    //       ["callStack", stackLevel, 
    //         "referencesByStackFrameId", currentFrameId,
    //         "references", name])))
    // {
    //   // There should be a slot for this but there's not, so err
    //   // When implemented, this shouldn't ever happen
    //     // Is there a case where this happens? Does lexer catch it?
    //   throw new Error(
    //     "Name " + name + " never defined in this frame");
    // }

    // TODO: Implement closures
    // return immutableConcreteJson.getIn(
    //   ["callStack", stackLevel, 
    //     "referencesByStackFrameId", currentFrameId, 
    //     "references", name]);
  }
}