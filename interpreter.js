var parser = require("./parser.js");
var executor = require("./executor.js");
var console_printing = require("./console_printing.js");
var readline = require('readline');
var MS_SLEEP = 0;
debugger;
module.exports = 
{
  executeString : executeString,
  prettyExecuteString : prettyExecuteString,
  SyntaxError: executor.SyntaxError
};

main(); 

function executeString(text)
{
  var immutableConcreteJson = parser.parse(text);
  var result = executor.execute(immutableConcreteJson);

  return result;
}

function prettyExecuteString(text)
{
  return console_printing.prettyTapeWithNames(
    executeString(text));
}

function prettyExecuteEveryStep(text, writeLine)
{
  var immutableConcreteJson = parser.parse(text);
  var stackSize;
  var stackFramePrettied;
  var i;
  var j;
  var pre_runner;
  var runnerAscii;
  var index;

  try
  {
    step();
    function step()
    {
      if (
        (immutableConcreteJson.dead ||
          (immutableConcreteJson.get && immutableConcreteJson.get("dead"))))
      {
        writeLine();
        writeLine(
          "Result: " + console_printing.prettyBlockWithNames(
            immutableConcreteJson.get("result")));
        
        process.exit(0);
        return;
      }

      // Clear the terminal
      process.stdout.write('\x1B[2J\x1B[0f\u001b[0;0H');

      immutableConcreteJson = executor.executeStepIn(immutableConcreteJson);
      stackSize = immutableConcreteJson.get("stackLevel") + 1;
      // writeLine(console_printing.prettyTapeWithNames(immutableConcreteJson));
      
      writeLine();
      writeLine("Step " + immutableConcreteJson.get("step"));
      writeLine(
        "At level " + stackSize + "@" + 
        immutableConcreteJson.getIn(
          ["callStack", stackSize - 1, "runner", "index"]));

      // Walk the entire stack, except the top...
      for (i = 0; i < stackSize - 1; i++)
      {
        stackFramePrettied = 
          console_printing.prettyTapeWithNames(
            immutableConcreteJson.getIn(["callStack", i]));

        if (stackFramePrettied.length > 50)
        {
          stackFramePrettied = stackFramePrettied.slice(0, 47) + "...";
        }

        writeLine(
          "Stack Level " +
          (i + 1) +
          "/" +
          stackSize +
          " [ " +
          stackFramePrettied +
          " ]");
      }

      // Write the current stack frame a bit different
      writeLine(
        "Stack Level " +
        (i + 1) +
        "/" +
        stackSize);

      writeLine();

      writeLine(" " +
        console_printing.prettyTapeWithNames(
          immutableConcreteJson.getIn(["callStack", i])));
      index = immutableConcreteJson.getIn(
        ["callStack", i, "runner", "index"]);

      pre_runner = "";

      for (j = 0; j < index; j++)
      {
        pre_runner += 
          ("" + console_printing.prettyBlockWithNames(
            immutableConcreteJson.getIn(["callStack", i, "blocks", j - 1])))
            .replace(/./g, " ") + " ";
      }

      runnerAscii = 
        ("" + console_printing.prettyBlockWithNames(
          immutableConcreteJson.getIn(["callStack", i, "blocks", index - 1])))
          .replace(/./g, "*");

      writeLine(
        pre_runner + runnerAscii);


      writeLine();
      writeLine();

      setTimeout(step, MS_SLEEP);
    }

  }
  catch (e)
  {
    throw e;
  }
}

// Read from STDIN and print result to STDOUT.
// On err, exit(1) and print to STDERR
function main()
{
  var file = "";
  process.stdin.on(
    "data",
    function (data)
    {
      if (! data) return;

      file += data.toString("utf8");
    });

  process.stdin.on(
    "end",
    function ()
    {
      // Print final line
      // process.stdout.write(
      //  console_printing.prettyTapeWithNames(
      //    executeString(file)) +
      //  "\n");

      // Print only result
      // process.stdout.write(
      //   "Result: " + 
      //   console_printing.prettyBlockWithNames(
      //     executeString(file).get("result")) +
      //   "\n");


      // Print every step
      prettyExecuteEveryStep(file, console.log.bind(console));

      // process.exit(0);
    });
}