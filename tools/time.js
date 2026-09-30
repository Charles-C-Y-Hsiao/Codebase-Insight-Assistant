function run() {
  return new Date().toLocaleString("zh-TW");
}

module.exports = {
  name: "get_time",
  description: "取得目前系統時間",
  run,
};
