function run({ expression }) {
  if (!/^[\d\s+\-*/().%]+$/.test(expression)) {
    throw new Error("只允許數字與基本運算符號");
  }
  return Function(`"use strict"; return (${expression})`)();
}

module.exports = {
  name: "calc",
  description: "計算簡單數學式，例如 23 * 19",
  run,
};
