const timeTool = require("./time");
const calcTool = require("./calc");

const toolList = [timeTool, calcTool];
const tools = {};

for (const tool of toolList) {
  tools[tool.name] = tool;
}

function getToolDescriptions() {
  return toolList.map((tool) => ({
    name: tool.name,
    description: tool.description,
  }));
}

module.exports = {
  tools,
  getToolDescriptions,
};
