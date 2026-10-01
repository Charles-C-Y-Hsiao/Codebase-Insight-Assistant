async function reveal(page, selector) {
  await page.waitForSelector(selector);
  const count = await page.$eval(selector, element => {
    const parents = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && !parent.open && !parent.firstElementChild.contains(element)) parents.unshift(parent);
    }
    parents.forEach((parent, index) => { parent.dataset.smokeReveal = String(index); });
    return parents.length;
  });
  for (let index = 0; index < count; index++) {
    const summary = `[data-smoke-reveal="${index}"] > summary`;
    await page.locator(summary).click();
    await page.$eval(`[data-smoke-reveal="${index}"]`, element => {
      delete element.dataset.smokeReveal;
    });
  }
}
async function click(page, selector) {
  await reveal(page, selector);
  await page.locator(selector).click();
}
module.exports = { reveal, click };
