const test=require('node:test');
const assert=require('node:assert/strict');
const {projectActivity,jobActivityTime}=require('../src/project-activity');

test('活動時間涵蓋 Edit、舊任務事件與圖片結果時間，忽略無效日期',()=>{
  assert.equal(jobActivityTime({startedAt:1000,finishedAt:2000,updatedAt:'invalid',events:[{time:new Date(3000).toISOString()}]}),3000);
  const activity=projectActivity([{owner:'me',projectId:'p',createdAt:1000,jobs:[{startedAt:6000,versions:[{startedAt:2000}],updatedAt:7000}]}],'me');
  assert.equal(activity.project('p'),new Date(7000).toISOString());
  assert.equal(jobActivityTime({imageCreation:{createdAt:new Date(8000).toISOString()}}),8000);
});

test('圖片討論與創作分開歸屬，不將承載對話的更新算成一般專案活動',()=>{
  const activity=projectActivity([{owner:'me',projectId:'host',createdAt:1000,updatedAt:9000,jobs:[{startedAt:2000},{startedAt:7000,imageProjectChat:{projectId:'image-a'}},{finishedAt:8000,imageCreation:{imageProject:{id:'image-b'}}}]}],'me');
  assert.equal(activity.project('host'),new Date(2000).toISOString());assert.equal(activity.image('image-a'),new Date(7000).toISOString());assert.equal(activity.image('image-b'),new Date(8000).toISOString());
});

test('依目前使用者的全部對話取得最近活動，空對話也算且不混入他人紀錄',()=>{
  const activity=projectActivity([{owner:'me',projectId:'p',createdAt:1000,updatedAt:3000,jobs:[]},{owner:'me',projectId:'p',createdAt:5000,jobs:[]},{owner:'other',projectId:'p',createdAt:99999,jobs:[{startedAt:99999,imageProjectChat:{projectId:'foreign'}}]}],'me');
  assert.equal(activity.project('p'),new Date(5000).toISOString());assert.equal(activity.image('foreign'),null);assert.equal(activity.project('missing'),null);
});
