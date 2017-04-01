var Immutable = require("immutable");

module.exports = 
{
  prettyOutputResult : prettyOutputResult,
  prettyTapeWithNames : prettyTapeWithNames,
  prettyBlockWithNames : prettyBlockWithNames,
  prettyTapeSansNames : prettyTapeSansNames,
  prettyBlockSansNames : prettyBlockSansNames
};

var DELIM_LEFT_RUNNER = " ";
var DELIM_RIGHT_RUNNER = " ";
var DELIM_BLOCK = " ";

function prettyOutputResult(concreteJson, options)
{
  var immutableConcreteJson;

  if (! options)
  {
    // Use default options
    options = 
    {
      names: true
    }
  }

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

  return prettyBlock(result, options);
}

function prettyTapeWithNames(concreteJson)
{
  return prettyTape(concreteJson, { names: true });
}

function prettyBlockWithNames(concreteJson)
{
  return prettyBlock(concreteJson, { names: true });
}

function prettyTapeSansNames(concreteJson)
{
  return prettyTape(concreteJson, { names: false });
}

function prettyBlockSansNames(concreteJson)
{
  return prettyBlock(concreteJson, { names: false });
}


function prettyTape(concreteJson, options)
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
    .map(
      function (block) 
      {
        return prettyBlock(block, options);
      })
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

function prettyBlock(concreteJson, options)
{
  var immutableConcreteJson;
  var prefix = "";
  var blockStr = "";
  var suffix = "";

  // Coerce to Immutable
  if (concreteJson instanceof Immutable.Map)
  {
    immutableConcreteJson = concreteJson;
  }
  else
  {
    immutableConcreteJson = Immutable.fromJS(concreteJson); 
  }

  // If this block has a name
  if (options.names && immutableConcreteJson.get("name"))
  {
    prefix = immutableConcreteJson.get("name") + ":";
  }

  // If this block has a comma
  if (immutableConcreteJson.get("comma"))
  {
    suffix = ",";
  }

  // Is it a simple block?
  if (typeof immutableConcreteJson.get("code") === "string")
  {
    // Yes, so merely print out the code
    return prefix + immutableConcreteJson.get("code") + suffix;
  }

  // It's a complex block so switch on the block's type
  switch (immutableConcreteJson.get("code").get("type"))
  {
  // Values -- noops
  case "fold" :
    if (immutableConcreteJson.get("code").get("args"))
    {
      blockStr = "( " +
        prettyTape(
          immutableConcreteJson.get("code").get("args"), options) +
        " )";
    }

    blockStr = blockStr +
      "[ " +
      prettyTape(
        immutableConcreteJson.get("code").get("tape"), options) +
      " ]";
    break;
  case "callIdentifier" :
  case "number" :
    blockStr = immutableConcreteJson.get("code").get("value");
    break;
  case "string" :
    blockStr = "\"" + immutableConcreteJson.get("code").get("value") + "\"";
    break;
  case "address" :
    blockStr = "@" + immutableConcreteJson.get("code").get("value");
    break;
  case "valueReference" :
    blockStr = "*" + immutableConcreteJson.get("code").get("value");
    break;
  case "falsey" :
    blockStr = "!" + 
      prettyBlock(
        immutableConcreteJson.get("code").get("value"), options);
    break;
  case "operator" :
    blockStr = immutableConcreteJson.get("code").get("op");
    break;
  default:
    // Shouldn't get here
    throw new Error("Unable to prettify ", immutableConcreteJson);
    break;
  }

  return prefix + blockStr + suffix;
}