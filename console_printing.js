var Immutable = require("immutable");

module.exports = 
{
  prettyOutputResult : prettyOutputResult,
  prettyTapeSansNames : prettyTapeSansNames,
  prettyBlockSansNames : prettyBlockSansNames
};

var DELIM_LEFT_RUNNER = " ";
var DELIM_RIGHT_RUNNER = " ";
var DELIM_BLOCK = " ";

function prettyOutputResult(concreteJson)
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

  var result = immutableConcreteJson.get("result");
  var dead = immutableConcreteJson.get("dead");

  if (! dead)
  {
    throw new Error("Code has not halted");
  }

  if (! result)
  {
    throw new Error("Executor Internal Error: Result not computed");
  }

  return prettyBlockSansNames(result);
}

function prettyTapeSansNames(concreteJson)
{
  var immutableConcreteJson;
  var jsonBlockArray;
  var str = "";
  var runnerIndex;

  // Coerce to Immutable
  if (concreteJson instanceof Immutable.Map)
  {
    immutableConcreteJson = concreteJson;
  }
  else
  {
    immutableConcreteJson = Immutable.fromJS(concreteJson); 
  }

  // Try to get runner;
  runnerIndex = immutableConcreteJson.getIn(["runner", "index"]);

  jsonBlockArray = immutableConcreteJson
    .get("blocks")
    .map(prettyBlockSansNames)
    .toJS();

  // If we can't find the runner's current location,
  if (! runnerIndex)
  {
    // Just print the whole thing
    return jsonBlockArray.join(DELIM_BLOCK);
  }
   
  jsonBlockArray.forEach(
      function (strBlock, index)
      {
        if (index === 0)
        {
          if (runnerIndex === 0)
          {
            str += DELIM_LEFT_RUNNER;
            str += strBlock;
            return;
          }

          str += DELIM_BLOCK;
          str += strBlock;
          return;
        }

        if (runnerIndex === index + 1)
        {
          str += DELIM_LEFT_RUNNER;
          str += strBlock;
          return;
        }

        if (runnerIndex === index)
        {
          str += DELIM_RIGHT_RUNNER;
          str += strBlock;
          return;
        }

        str += DELIM_BLOCK;
        str += strBlock;

        if (index === jsonBlockArray.length)
        {
          str += DELIM_BLOCK;
        }
        return;
      });

  return str;
}

function prettyBlockSansNames(concreteJson)
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

  // Is it a simple block?
  if (typeof immutableConcreteJson.get("code") === "string")
  {
    // Yes, so merely print out the code
    return immutableConcreteJson.get("code");
  }

  // It's a complex block so switch on the block's type
  switch (immutableConcreteJson.get("code").get("type"))
  {
  // Values -- noops
  case "fold" :
    return "[ " +
      prettyTapeSansNames(
        immutableConcreteJson.get("code").get("tape")) +
      " ]";
    break;
  case "number" :
    return immutableConcreteJson.get("code").get("value");
    break;
  case "string" :
    return "\"" + immutableConcreteJson.get("code").get("value") + "\"";
    break;
  case "address" :
    return "@" + immutableConcreteJson.get("code").get("value");
    break;
  case "valueReference" :
    return "*" + immutableConcreteJson.get("code").get("value");
    break;
  case "falsey" :
    return "!" + prettyBlockSansNames(immutableConcreteJson.get("code").get("value"));
    break;
  case "operator" :
    return immutableConcreteJson.get("code").get("op");
    break;
  }

  // Shouldn't get here
  throw new Error("Unable to prettify ", immutableConcreteJson);
}