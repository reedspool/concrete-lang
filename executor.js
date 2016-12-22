var Immutable = require("immutable");
var parser = require("./parser.js");
var lexer = require("./lexer.js");
var MAX_STEPS = 1000;
var MAX_CALL_STACK_SIZE = 500;
var RESERVED_WORDS = ["return", "call", "_"];

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
  var environment;

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
    // Add the closuresByEnvId map 
    immutableConcreteJson = 
      immutableConcreteJson.setIn(
        ["callStack", stackLevel, "closuresByEnvId"],
        Immutable.Map());
  }

  // Get the appropriate code from the run stack
  codeToRun =
    immutableConcreteJson
      .getIn(["callStack", stackLevel, "blocks"]);

  // Get the runtime environment for that code
  environment =
    immutableConcreteJson
      .getIn(["callStack", stackLevel, "environment"]);

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

    case "call" :
      // Do call things
      //   increase stack level by 1
      //   use inputs from left for inputs to code
      stackLevel = stackLevel + 1;

      immutableConcreteJson =
        immutableConcreteJson
          .setIn(
            ["callStack", stackLevel],
            Immutable.fromJS(
            {
              blocks: {},
              environment: {},
              runner:
              {
                index: 0,
                stackLevel: stackLevel
              }
            }));

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
      // It's an identifier, do identifier things
      // Check this scope
        // If not there, check parent scopes
        // When you find the code to run, do the call things
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
      var inputs = [];
      var result;
      var operator = blockToRun.get("code").get("op")

      // Walk backwards from input count
      for (var i = 1; i <= blockToRun.get("code").get("countInputs"); i++)
      {
        var nextInput = codeToRun.get(index - i);

        if (! nextInput)
        {
          throw new Error("Not enough inputs for operation");
        }

        // Front-load it, so left-most, top-most input is always first
        inputs.unshift(nextInput);
      }

      // Singular case
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
                // Is it a simple block?
                if (typeof inputBlock.get("code") === "string")
                {
                  // Is this is one of the reserved words?
                  if (-1 != RESERVED_WORDS.indexOf(
                      inputBlock.get("code")))
                  {
                    throw new Error(
                      "Reserved word " + 
                      inputBlock.get("code") +
                      " used as input for " + operator);
                  }

                  // Offer a hint
                  throw new Error(
                    "Identifier " + 
                    inputBlock.get("code") +
                    " used as input for " + operator +
                    ((Math.random() < 0.5)
                      ? ". Perhaps you meant the value reference, *"
                      : ". Perhaps you meant the address reference, @") +
                    inputBlock.get("code") +
                    "?");
                }
                else
                {
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
                    throw new Error(
                      inputBlock.getIn(["code", "type"]) +
                      " used as input for " + operator);
                    break;

                  // These cases are direct references, they should be represented in environment
                  case "valueReference" :
                    value = getValueFromReference(
                      inputBlock.getIn(["code", "value"]),
                      environment);
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
                    console.warn("Error parseFloat " + value);
                    return;
                  }

                  // ALL GOOD, PROPER VALUE FOUND
                  return parsed;

                  // TODO: IMPLEMENT THIS. Currently returns just the entry
                  // Need to dig in to get the correct informationz
                  // Currently stuck on how to resolve parsers
                  // TODO: Once implemented, extend this capability to other operators
                  //       and reserved words and implement inputs for calls
                  //
                  function getValueFromReference(name, environment)
                  {
                    var envForName = environment.get(name);

                    if (! envForName)
                    {

                      if (environment.get("0parentEnv"))
                      {
                        return getValueFromReference(
                          name,
                          environment.get("0parentEnv"));
                      }

                      throw new Error("Name " + name + " never declared");
                    }

                    return immutableConcreteJson.getIn(
                      ["closuresByEnvId", envForName.get("envId"), name]);

                  }
                }
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
      // Is it one of the numbers-only operators?
      } else if(operator.match(/[-/*%<>|&]/))
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
      else if (operator === "|" || operator === "&")
      { 
        // Attempt to coerce inputs to booleans
        inputsAreFalsey = 
          inputs.map(
            function (input)
            {
              // It's only false if it's falsey! (tm)
              return  input.get("code").get("type") === "falsey"
                ? false
                : true ;
            });

        // Act like a short circuit operator
        // Return the first thing that satisfies the truth statement
        result =
          operator == "|"
          ? (inputsAreFalsey[0] && inputs[0]) || 
            (inputsAreFalsey[1] && inputs[1])
          : (inputsAreFalsey[0] && inputs[0]) && 
            (inputsAreFalsey[1] && inputs[1])
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
          throw new Error("Unhandled operator 456456234");
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

  // Do call things
  //   increase stack level by 1
  //   use inputs from left for inputs to code
  function doAllTheCallThings(immutableConcreteJson)
  {
    // Set it to initial
    stackLevel = 0;

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
                blocks: {},
                environment: {},
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

    immutableConcreteJson =
      immutableConcreteJson
        .setIn(
          ["callStack", stackLevel + 1],
          Immutable.fromJS(
          {
            blocks: {},
            environment: {},
            runner:
            {
              index: 0,
              stackLevel: stackLevel + 1
            }
          }));

    immutableConcreteJson =
      immutableConcreteJson.set("callStack", callStack);

    immutableConcreteJson =
      immutableConcreteJson.set("stackLevel", stackLevel + 1);


    // Actually add the blocks from the tape to the stack frame  
    immutableConcreteJson = 
      immutableConcreteJson.setIn(
        ["callStack", stackLevel + 1, "blocks"],
        codeToRun.getIn([index - 1, "code", "tape", "blocks"]));

    // Actually add the lexical environment from the tape to the stack frame  
    immutableConcreteJson = 
      immutableConcreteJson.setIn(
        ["callStack", stackLevel + 1, "environment"],
        codeToRun.getIn([index - 1, "code", "tape", "environment"]));

    // Done stepping into new function call
    // Flip the flag back
    // Increment the step counter
    immutableConcreteJson = immutableConcreteJson.set("midStep", false);
    immutableConcreteJson = immutableConcreteJson.set("step", step + 1);
    return immutableConcreteJson;
  }

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
}