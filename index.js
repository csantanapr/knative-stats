import parse from 'parse-link-header'
import { Octokit } from 'octokit'
// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
if (!process.env.GITHUB_TOKEN) {
  process.exit()
}
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

function union (setA, setB) {
  const _union = new Set(setA)
  for (const elem of setB) {
    _union.add(elem)
  }
  return _union
}

async function githubstats (org) {
  const stats = {}
  stats.stars = 0
  stats.releases = 0
  stats.issues = 0
  stats.pulls = 0
  stats.repos = []
  stats.contributors = new Set()
  const data = await octokit.rest.repos.listForOrg({
    org: org,
    type: 'public'
  })
  await Promise.all(data.data.map(async (repo) => {
    stats.stars = stats.stars + repo.stargazers_count
    const pulls = parseInt(await githubpulls(org, repo.name))
    stats.pulls = stats.pulls + pulls
    const issues = parseInt(await githubissues(org, repo.name)) - pulls
    stats.issues = stats.issues + issues
    const contributors = await githubcontributors(org, repo.name)
    stats.contributors = union(contributors, stats.contributors)
    stats.repos.push({
      name: repo.name,
      stars: repo.stargazers_count,
      issues: issues,
      pulls: pulls,
      contributors: contributors.size
    })
  }))
  return stats
}

async function githubtags (org, repo) {
  const data = await octokit.paginate(octokit.rest.repos.listTags, {
    owner: org,
    repo: repo
  })
  const tags = data.map((tag) => tag.name).filter(tag => tag.startsWith('v'))
  return tags
}

async function githubissues (org, repo) {
  const data = await octokit.request({
    method: 'GET',
    url: '/repos/{org}/{repo}/issues',
    org: org,
    repo: repo,
    per_page: 1,
    state: 'all'
  })
  const link = parse(data.headers.link)
  const count = link && link.last && link.last.page ? link.last.page : 0
  return count
}

async function githubpulls (org, repo) {
  const data = await octokit.request({
    method: 'GET',
    url: '/repos/{org}/{repo}/pulls',
    org: org,
    repo: repo,
    per_page: 1,
    state: 'all',
    is: 'pr'
  })
  const link = parse(data.headers.link)
  const count = link && link.last && link.last.page ? link.last.page : 0
  return count
}

async function githubcontributors (org, repo) {
  const data = await octokit.paginate(octokit.rest.repos.listContributors, {
    owner: org,
    repo: repo,
    anon: true
  })
  const users = data.map((user) => user.login ? user.login : user.email)
  const contributors = new Set(users)
  return contributors
}

async function main () {
  const stats = {}
  stats.knative = await githubstats('knative')
  stats['knative-sandbox'] = await githubstats('knative-sandbox')
  stats.releases = await githubtags('knative', 'serving')
  return stats
}

function printNumber (n) {
  return n.toLocaleString('en-US')
}

async function printReport (stats) {
  console.log('----Knative---')
  console.log(`${printNumber(stats.knative.stars)} \tGithub Stars`)
  console.log(`${printNumber(stats.knative.pulls)} \tGitub Pull Requests`)
  console.log(`${printNumber(stats.knative.issues)} \tGitub Issues`)
  console.log(`${printNumber(stats.knative.contributors.size)} \tGitub Contributors`)

  console.log('----Knative-Sandbox---')
  console.log(`${printNumber(stats['knative-sandbox'].stars)} \tGithub Stars`)
  console.log(`${printNumber(stats['knative-sandbox'].pulls)} \tGitub Pull Requests`)
  console.log(`${printNumber(stats['knative-sandbox'].issues)} \tGitub Issues`)
  console.log(`${printNumber(stats['knative-sandbox'].contributors.size)} \tGitub Contributors`)

  console.log('----Knative orgs---')
  console.log(`${printNumber(stats.knative.stars + stats['knative-sandbox'].stars)} \tGithub Stars`)
  console.log(`${printNumber(stats.knative.pulls + stats['knative-sandbox'].pulls)} \tGitub Pull Requests`)
  console.log(`${printNumber(stats.knative.issues + stats['knative-sandbox'].issues)} \tGitub Issues`)
  console.log(`${printNumber(union(stats.knative.contributors, stats['knative-sandbox'].contributors).size)} \tGitub Contributors`)
  console.log(`${printNumber(stats.releases.length)} \tReleases`)
}

main().then(stats => {
  // console.log(JSON.stringify(stats, null, 4))
  printReport(stats)
})
