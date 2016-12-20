var concreteparser2 = require("./concreteparser2.js");

module.exports = 
{
  parse: concreteparser2.parse,
  parseBlock: parseBlock,
  SyntaxError : concreteparser2.SyntaxError
};

function parseBlock(text)
{
  var parsed = concreteparser2.parse(text);

  // Return just the first one
  return parsed.blocks[0];
}