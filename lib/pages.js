const MAX_LIMIT = 100

const getPage = async function getPage (endpoint, method, account, params, startingAfter = undefined) {
  const limits = {
    limit: MAX_LIMIT,
    ...params,
    ...(startingAfter && { starting_after: startingAfter })
  }

  // stripe won't accept an empty object as a second param
  const result = account ?
    await endpoint[method](limits, { stripe_account: account }) :
    await endpoint[method](limits)

  return result
}


// small utility to ensure we get all entities from a Stripe API end point
const all = async function all (endpoint, method = 'list', account = undefined, params = {}) {
  const list = []
  const initialPage = await getPage(endpoint, method, account, params)
  list.push(...initialPage.data)

  const status = {
    moreItemsExist: initialPage.has_more
  }

  while (status.moreItemsExist) {
    const latestItem = list[list.length - 1]
    const page = await getPage(endpoint, method, account, params, latestItem.id)
    list.push(...page.data)
    status.moreItemsExist = page.has_more
  }
  return list
}

module.exports = { all }
